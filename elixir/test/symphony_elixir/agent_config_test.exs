defmodule SymphonyElixir.AgentConfigTest do
  use SymphonyElixir.TestSupport

  alias SymphonyElixir.AgentConfig

  test "exposes workflow defaults and applies runtime preset overrides" do
    Application.put_env(:symphony_elixir, :claude_bridge_probe, fn ->
      %{
        available: true,
        authenticated: true,
        code: "ready",
        installed: true,
        node_available: true,
        reason: nil
      }
    end)

    write_workflow_file!(Workflow.workflow_file_path(),
      codex_command: "codex app-server --model gpt-5.4"
    )

    payload = AgentConfig.current()

    assert payload.current.id == AgentConfig.workflow_preset_id()
    assert payload.current.provider == "codex"
    assert payload.current.model == "gpt-5.4"
    assert payload.override == %{active: false, preset_id: nil}
    assert Enum.any?(payload.presets, &(&1.id == "claude-sonnet" and &1.available))

    assert {:ok, updated} = AgentConfig.set_preset("claude-sonnet")
    assert updated.current.id == "claude-sonnet"
    assert updated.current.provider == "claude_code"
    assert updated.current.model == "claude-sonnet-4-6"
    assert updated.override == %{active: true, preset_id: "claude-sonnet"}
    assert Config.codex_command() == "SYMPHONY_CLAUDE_MODEL=claude-sonnet-4-6 node ./scripts/claude_code_cli_bridge.mjs"

    assert {:ok, reset} = AgentConfig.set_preset(AgentConfig.workflow_preset_id())
    assert reset.current.id == AgentConfig.workflow_preset_id()
    assert reset.override == %{active: false, preset_id: nil}
    assert Config.codex_command() == "codex app-server --model gpt-5.4"
  end

  test "rejects unavailable Claude presets without mutating the active command" do
    Application.put_env(:symphony_elixir, :claude_bridge_probe, fn ->
      %{
        available: false,
        authenticated: false,
        code: "claude_auth_missing",
        installed: true,
        node_available: true,
        reason: "Claude Code est installé mais n'est pas authentifié."
      }
    end)

    initial_command = Config.codex_command()

    assert {:error, {:preset_unavailable, "Claude Code est installé mais n'est pas authentifié."}} =
             AgentConfig.set_preset("claude-sonnet")

    assert Config.codex_command() == initial_command
    assert AgentConfig.current().claude_bridge.available == false
  end
end
