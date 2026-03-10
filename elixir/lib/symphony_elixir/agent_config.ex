defmodule SymphonyElixir.AgentConfig do
  @moduledoc """
  Runtime agent preset helpers for dashboard-driven backend switching.
  """

  alias SymphonyElixir.Config

  @workflow_preset_id "workflow-default"
  @claude_sonnet_preset_id "claude-sonnet"
  @claude_opus_preset_id "claude-opus"
  @claude_bridge_command "node ./scripts/claude_code_cli_bridge.mjs"
  @availability_ttl_ms 30_000
  @claude_auth_timeout_ms 3_000
  @agent_preset_override_key :agent_preset_override
  @codex_command_override_key :codex_command_override
  @claude_bridge_availability_cache_key :claude_bridge_availability_cache
  @claude_bridge_probe_key :claude_bridge_probe

  @type availability_status :: %{
          available: boolean(),
          authenticated: boolean(),
          code: String.t(),
          installed: boolean(),
          node_available: boolean(),
          reason: String.t() | nil
        }

  @spec current() :: map()
  def current do
    workflow_preset = workflow_preset()
    presets = [workflow_preset | claude_presets()]
    current_preset = current_preset(presets)
    claude_status = claude_bridge_status()

    %{
      current: public_preset(current_preset, true),
      presets: Enum.map(presets, &public_preset(&1, &1.id == current_preset.id)),
      override: %{
        active: current_preset.id != @workflow_preset_id,
        preset_id: if(current_preset.id == @workflow_preset_id, do: nil, else: current_preset.id)
      },
      claude_bridge: claude_status
    }
  end

  @spec set_preset(String.t()) :: {:ok, map()} | {:error, term()}
  def set_preset(preset_id) when is_binary(preset_id) do
    preset_id = String.trim(preset_id)

    case Enum.find(presets(), &(&1.id == preset_id)) do
      nil ->
        {:error, :unsupported_preset}

      %{available: false, unavailable_reason: reason} ->
        {:error, {:preset_unavailable, reason}}

      %{id: @workflow_preset_id} ->
        clear_override()
        {:ok, current()}

      preset ->
        Application.put_env(:symphony_elixir, @agent_preset_override_key, preset.id)
        Application.put_env(:symphony_elixir, @codex_command_override_key, preset.command)
        {:ok, current()}
    end
  end

  def set_preset(_preset_id), do: {:error, :unsupported_preset}

  @spec clear_override() :: :ok
  def clear_override do
    Application.delete_env(:symphony_elixir, @agent_preset_override_key)
    Application.delete_env(:symphony_elixir, @codex_command_override_key)
    :ok
  end

  @spec workflow_preset_id() :: String.t()
  def workflow_preset_id, do: @workflow_preset_id

  defp presets do
    [workflow_preset() | claude_presets()]
  end

  defp workflow_preset do
    command = Config.workflow_codex_command()
    provider = provider_for_command(command)
    model = model_for_command(provider, command)

    %{
      id: @workflow_preset_id,
      provider: provider,
      provider_label: provider_label(provider),
      model: model,
      model_label: model_label(model, "Configuré dans WORKFLOW.md"),
      label: preset_label(provider, model, "Workflow par défaut"),
      source: "workflow",
      source_label: "Workflow par défaut",
      description: "Utilise la commande configurée dans WORKFLOW.md pour les nouvelles sessions d'agent.",
      command: command,
      available: true,
      unavailable_reason: nil
    }
  end

  defp claude_presets do
    status = claude_bridge_status()

    [
      claude_preset(@claude_sonnet_preset_id, "claude-sonnet-4-6", "Claude Sonnet 4.6", status),
      claude_preset(@claude_opus_preset_id, "claude-opus-4-6", "Claude Opus 4.6", status)
    ]
  end

  defp claude_preset(id, model, description, status) do
    %{
      id: id,
      provider: "claude_code",
      provider_label: "Claude Code",
      model: model,
      model_label: model,
      label: "Claude Code - #{model}",
      source: "runtime_override",
      source_label: "Surcharge d'exécution",
      description: "#{description} via la passerelle CLI Claude pour les prochaines sessions.",
      command: "SYMPHONY_CLAUDE_MODEL=#{model} #{@claude_bridge_command}",
      available: status.available,
      unavailable_reason: status.reason
    }
  end

  defp current_preset(presets) do
    selected_id = Application.get_env(:symphony_elixir, @agent_preset_override_key)

    Enum.find(presets, &(&1.id == selected_id)) || List.first(presets)
  end

  defp public_preset(preset, selected?) do
    Map.take(preset, [
      :id,
      :provider,
      :provider_label,
      :model,
      :model_label,
      :label,
      :source,
      :source_label,
      :description,
      :available,
      :unavailable_reason
    ])
    |> Map.put(:selected, selected?)
  end

  defp provider_for_command(command) when is_binary(command) do
    normalized = String.downcase(command)

    cond do
      String.contains?(normalized, "claude_code_cli_bridge") ->
        "claude_code"

      String.contains?(normalized, "claude_code_app_server") ->
        "claude_code"

      Regex.match?(~r/(^|\s)claude(\s|$)/, normalized) ->
        "claude_code"

      true ->
        "codex"
    end
  end

  defp provider_label("claude_code"), do: "Claude Code"
  defp provider_label(_provider), do: "Codex"

  defp model_for_command("claude_code", command) when is_binary(command) do
    command
    |> extract_env_model()
    |> case do
      nil -> extract_flag_model(command)
      model -> model
    end
  end

  defp model_for_command(_provider, command) when is_binary(command), do: extract_flag_model(command)

  defp extract_flag_model(command) do
    case Regex.run(~r/(?:^|\s)--model(?:=|\s+)([^\s"'`]+)/, command, capture: :all_but_first) do
      [model] -> model
      _ -> nil
    end
  end

  defp extract_env_model(command) do
    case Regex.run(~r/(?:^|\s)SYMPHONY_CLAUDE_MODEL=([^\s"'`]+)/, command, capture: :all_but_first) do
      [model] -> model
      _ -> nil
    end
  end

  defp model_label(nil, fallback), do: fallback
  defp model_label(model, _fallback), do: model

  defp preset_label(provider, nil, prefix), do: "#{prefix} - #{provider_label(provider)}"
  defp preset_label(provider, model, prefix), do: "#{prefix} - #{provider_label(provider)} - #{model}"

  defp claude_bridge_status do
    now_ms = System.monotonic_time(:millisecond)

    case Application.get_env(:symphony_elixir, @claude_bridge_availability_cache_key) do
      %{checked_at_ms: checked_at_ms, status: status}
      when is_integer(checked_at_ms) and now_ms - checked_at_ms < @availability_ttl_ms ->
        status

      _ ->
        status = probe_claude_bridge()

        Application.put_env(
          :symphony_elixir,
          @claude_bridge_availability_cache_key,
          %{checked_at_ms: now_ms, status: status}
        )

        status
    end
  end

  defp probe_claude_bridge do
    case Application.get_env(:symphony_elixir, @claude_bridge_probe_key) do
      fun when is_function(fun, 0) ->
        normalize_probe_status(fun.())

      _ ->
        do_probe_claude_bridge()
    end
  end

  defp do_probe_claude_bridge do
    node_binary = System.find_executable("node")
    claude_binary = claude_binary()

    case validate_claude_runtime(node_binary, claude_binary) do
      :ok ->
        probe_claude_auth(claude_binary)

      {:error, status} ->
        status
    end
  end

  defp validate_claude_runtime(nil, _claude_binary) do
    {:error, unavailable_status("node_not_found", "Node est requis pour la passerelle CLI Claude.", false, false, false)}
  end

  defp validate_claude_runtime(_node_binary, nil) do
    {:error,
     unavailable_status(
       "claude_not_found",
       "Le CLI Claude Code n'est pas installé ou n'est pas dans le PATH.",
       false,
       false,
       true
     )}
  end

  defp validate_claude_runtime(_node_binary, _claude_binary) do
    if claude_permission_ready?() do
      :ok
    else
      {:error,
       unavailable_status(
         "claude_permission_mode_missing",
         "Claude Code requiert `codex.approval_policy: never` ou `SYMPHONY_CLAUDE_PERMISSION_MODE`.",
         true,
         false,
         true
       )}
    end
  end

  defp probe_claude_auth(claude_binary) do
    case run_claude_auth_status(claude_binary) do
      {:ok, {output, 0}} ->
        decode_claude_auth_status(output)

      {:ok, {_output, _status}} ->
        unavailable_status(
          "claude_auth_failed",
          "La vérification d'authentification de Claude Code a échoué.",
          true,
          false,
          true
        )

      :timeout ->
        unavailable_status(
          "claude_auth_timeout",
          "La vérification d'authentification de Claude Code a expiré.",
          true,
          false,
          true
        )

      {:error, _reason} ->
        unavailable_status(
          "claude_auth_failed",
          "La vérification d'authentification de Claude Code a échoué.",
          true,
          false,
          true
        )
    end
  end

  defp run_claude_auth_status(claude_binary) do
    task =
      Task.async(fn ->
        try do
          {:ok, System.cmd(claude_binary, ["auth", "status"], stderr_to_stdout: true)}
        rescue
          error -> {:error, error}
        end
      end)

    case Task.yield(task, @claude_auth_timeout_ms) do
      {:ok, result} ->
        result

      nil ->
        Task.shutdown(task, :brutal_kill)

        :timeout
    end
  end

  defp decode_claude_auth_status(output) do
    case Jason.decode(output) do
      {:ok, %{"loggedIn" => true}} ->
        %{
          available: true,
          authenticated: true,
          code: "ready",
          installed: true,
          node_available: true,
          reason: nil
        }

      {:ok, %{"loggedIn" => false}} ->
        unavailable_status(
          "claude_auth_missing",
          "Claude Code est installé mais n'est pas authentifié.",
          true,
          false,
          true
        )

      _ ->
        unavailable_status(
          "claude_auth_unexpected",
          "La vérification d'authentification de Claude Code a renvoyé une réponse inattendue.",
          true,
          false,
          true
        )
    end
  end

  defp claude_binary do
    env_binary = System.get_env("SYMPHONY_CLAUDE_CLI_BIN")

    cond do
      is_binary(env_binary) and String.trim(env_binary) == "" ->
        nil

      is_binary(env_binary) and Path.type(env_binary) != :relative ->
        if File.exists?(env_binary), do: env_binary, else: nil

      is_binary(env_binary) ->
        System.find_executable(env_binary)

      true ->
        System.find_executable("claude")
    end
  end

  defp claude_permission_ready? do
    configured_permission_mode?() or Config.codex_approval_policy() == "never"
  end

  defp configured_permission_mode? do
    case System.get_env("SYMPHONY_CLAUDE_PERMISSION_MODE") do
      value when is_binary(value) -> String.trim(value) != ""
      _ -> false
    end
  end

  defp unavailable_status(code, reason, installed, authenticated, node_available) do
    %{
      available: false,
      authenticated: authenticated,
      code: code,
      installed: installed,
      node_available: node_available,
      reason: reason
    }
  end

  defp normalize_probe_status(%{} = status) do
    %{
      available:
        status
        |> Map.get(:available, Map.get(status, "available", false))
        |> truthy?(),
      authenticated:
        status
        |> Map.get(:authenticated, Map.get(status, "authenticated", false))
        |> truthy?(),
      code: Map.get(status, :code, Map.get(status, "code", "probe_override")),
      installed:
        status
        |> Map.get(:installed, Map.get(status, "installed", false))
        |> truthy?(),
      node_available:
        status
        |> Map.get(:node_available, Map.get(status, "node_available", false))
        |> truthy?(),
      reason: Map.get(status, :reason, Map.get(status, "reason"))
    }
  end

  defp normalize_probe_status(_status),
    do:
      unavailable_status(
        "probe_override_invalid",
        "La sonde de la passerelle Claude a renvoyé une charge utile invalide.",
        false,
        false,
        false
      )

  defp truthy?(value), do: value in [true, "true", 1]
end
