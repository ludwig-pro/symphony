defmodule SymphonyElixir.AgentRuntimeSwitchTest do
  use SymphonyElixir.TestSupport

  test "runtime command overrides only affect future app-server sessions" do
    test_root =
      Path.join(
        System.tmp_dir!(),
        "symphony-elixir-agent-runtime-switch-#{System.unique_integer([:positive])}"
      )

    try do
      workspace_root = Path.join(test_root, "workspaces")
      workspace = Path.join(workspace_root, "MT-switch")
      first_binary = Path.join(test_root, "fake-codex-first")
      second_binary = Path.join(test_root, "fake-codex-second")

      File.mkdir_p!(workspace)
      write_fake_app_server!(first_binary, "thread-first", "turn-first")
      write_fake_app_server!(second_binary, "thread-second", "turn-second")

      write_workflow_file!(Workflow.workflow_file_path(),
        workspace_root: workspace_root,
        codex_command: "#{first_binary} app-server"
      )

      issue = %Issue{
        id: "issue-runtime-switch",
        identifier: "MT-switch",
        title: "Runtime switch",
        description: "Ensure only future sessions pick up command overrides",
        state: "In Progress",
        url: "https://example.org/issues/MT-switch",
        labels: ["backend"]
      }

      assert {:ok, session_one} = AppServer.start_session(workspace)

      try do
        Application.put_env(:symphony_elixir, :codex_command_override, "#{second_binary} app-server")

        assert {:ok, %{session_id: "thread-first-turn-first"}} =
                 AppServer.run_turn(session_one, "Continue the original session", issue)

        assert {:ok, session_two} = AppServer.start_session(workspace)

        try do
          assert {:ok, %{session_id: "thread-second-turn-second"}} =
                   AppServer.run_turn(session_two, "Use the newly selected runtime", issue)
        after
          AppServer.stop_session(session_two)
        end
      after
        AppServer.stop_session(session_one)
      end
    after
      File.rm_rf(test_root)
    end
  end

  defp write_fake_app_server!(path, thread_id, turn_id) do
    File.write!(path, """
    #!/bin/sh
    count=0
    while IFS= read -r _line; do
      count=$((count + 1))

      case "$count" in
        1)
          printf '%s\\n' '{"id":1,"result":{}}'
          ;;
        2)
          ;;
        3)
          printf '%s\\n' '{"id":2,"result":{"thread":{"id":"#{thread_id}"}}}'
          ;;
        4)
          printf '%s\\n' '{"id":3,"result":{"turn":{"id":"#{turn_id}"}}}'
          printf '%s\\n' '{"method":"turn/completed"}'
          exit 0
          ;;
        *)
          exit 0
          ;;
      esac
    done
    """)

    File.chmod!(path, 0o755)
  end
end
