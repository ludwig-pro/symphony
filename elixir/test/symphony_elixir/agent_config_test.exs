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

  test "real Claude auth probe enables Claude presets when the CLI reports a logged-in session" do
    with_fake_claude_cli(
      """
      if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
        printf '%s\\n' '{"loggedIn": true}'
        exit 0
      fi

      exit 1
      """,
      fn ->
        payload = AgentConfig.current()

        assert payload.claude_bridge.available == true
        assert payload.claude_bridge.authenticated == true
        assert payload.claude_bridge.code == "ready"
        assert Enum.any?(payload.presets, &(&1.id == "claude-sonnet" and &1.available))

        assert {:ok, updated} = AgentConfig.set_preset("claude-sonnet")
        assert updated.current.id == "claude-sonnet"
        assert updated.current.provider == "claude_code"
      end
    )
  end

  test "real Claude auth probe times out gracefully" do
    with_fake_claude_cli(
      """
      if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
        sleep 5
        printf '%s\\n' '{"loggedIn": true}'
        exit 0
      fi

      exit 1
      """,
      fn ->
        payload = AgentConfig.current()

        assert payload.claude_bridge.available == false
        assert payload.claude_bridge.authenticated == false
        assert payload.claude_bridge.code == "claude_auth_timeout"

        assert payload.claude_bridge.reason ==
                 "La vérification d'authentification de Claude Code a expiré."
      end
    )
  end

  defp with_fake_claude_cli(claude_script_body, fun) do
    test_root =
      Path.join(
        System.tmp_dir!(),
        "symphony-elixir-agent-config-#{System.unique_integer([:positive])}"
      )

    fake_bin = Path.join(test_root, "bin")
    fake_node = Path.join(fake_bin, "node")
    fake_claude = Path.join(fake_bin, "claude")
    previous_path = System.get_env("PATH")

    on_exit(fn ->
      restore_env("PATH", previous_path)
      File.rm_rf(test_root)
    end)

    File.mkdir_p!(fake_bin)

    File.write!(fake_node, """
    #!/bin/sh
    exit 0
    """)

    File.write!(fake_claude, """
    #!/bin/sh
    #{claude_script_body}
    """)

    File.chmod!(fake_node, 0o755)
    File.chmod!(fake_claude, 0o755)

    System.put_env("PATH", Enum.join([fake_bin, previous_path || ""], ":"))
    Application.delete_env(:symphony_elixir, :claude_bridge_probe)
    Application.delete_env(:symphony_elixir, :claude_bridge_availability_cache)

    write_workflow_file!(Workflow.workflow_file_path(), codex_approval_policy: "never")

    fun.()
  end
end
