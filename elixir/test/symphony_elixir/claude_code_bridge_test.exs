defmodule SymphonyElixir.ClaudeCodeBridgeTest do
  use SymphonyElixir.TestSupport

  test "Claude CLI bridge streams deltas, reports usage, forwards MCP config, and resumes the CLI session" do
    node_binary = System.find_executable("node")

    if is_nil(node_binary) do
      :ok
    else
      test_root =
        Path.join(
          System.tmp_dir!(),
          "symphony-elixir-claude-code-bridge-#{System.unique_integer([:positive])}"
        )

      try do
        workspace_root = Path.join(test_root, "workspaces")
        workspace = Path.join(workspace_root, "MT-claude")
        bridge_script = Path.expand("../../scripts/claude_code_cli_bridge.mjs", __DIR__)
        fake_cli_root = Path.join(test_root, "bin")
        fake_claude = Path.join(fake_cli_root, "claude")
        trace_file = Path.join(test_root, "claude-cli.trace")
        {resolved_node_binary, 0} = System.cmd(node_binary, ["-p", "process.execPath"])

        previous_path = System.get_env("PATH")
        previous_trace = System.get_env("SYMP_TEST_CLAUDE_TRACE")
        previous_linear_api_key = System.get_env("LINEAR_API_KEY")
        previous_claudecode = System.get_env("CLAUDECODE")
        previous_model = System.get_env("SYMPHONY_CLAUDE_MODEL")
        previous_allowed_tools = System.get_env("SYMPHONY_CLAUDE_ALLOWED_TOOLS")

        on_exit(fn ->
          restore_env("PATH", previous_path)
          restore_env("SYMP_TEST_CLAUDE_TRACE", previous_trace)
          restore_env("LINEAR_API_KEY", previous_linear_api_key)
          restore_env("CLAUDECODE", previous_claudecode)
          restore_env("SYMPHONY_CLAUDE_MODEL", previous_model)
          restore_env("SYMPHONY_CLAUDE_ALLOWED_TOOLS", previous_allowed_tools)
        end)

        File.mkdir_p!(workspace)
        File.mkdir_p!(fake_cli_root)

        File.write!(fake_claude, """
        #!/usr/bin/env node

        import { appendFileSync, readFileSync } from "node:fs";

        const args = process.argv.slice(2);
        const tracePath = process.env.SYMP_TEST_CLAUDE_TRACE;
        const resumeIndex = args.indexOf("--resume");
        const mcpConfigIndex = args.indexOf("--mcp-config");
        const mcpConfigPath = mcpConfigIndex === -1 ? null : args[mcpConfigIndex + 1];
        const mcpConfig =
          mcpConfigPath && mcpConfigPath.trim() !== ""
            ? JSON.parse(readFileSync(mcpConfigPath, "utf8"))
            : null;
        const resumeSessionId = resumeIndex === -1 ? null : args[resumeIndex + 1];
        const isResume = resumeSessionId !== null;
        const outputTokens = isResume ? 7 : 5;
        const text = isResume ? "CLI resumed delta" : "CLI initial delta";
        const sessionId = "cli-session-1";
        const usage = {
          input_tokens: 11,
          output_tokens: outputTokens
        };

        appendFileSync(
          tracePath,
          JSON.stringify({
            args,
            cwd: process.cwd(),
            env: {
              CLAUDECODE: process.env.CLAUDECODE ?? null,
              LINEAR_API_KEY: process.env.LINEAR_API_KEY ?? null
            },
            mcpConfig,
            resumeSessionId
          }) + "\\n"
        );

        console.log(
          JSON.stringify({
            type: "stream_event",
            session_id: sessionId,
            event: {
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "text_delta",
                text
              }
            }
          })
        );

        console.log(
          JSON.stringify({
            type: "stream_event",
            session_id: sessionId,
            event: {
              type: "message_delta",
              usage
            }
          })
        );

        console.log(
          JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: text,
            session_id: sessionId,
            usage
          })
        );
        """)

        File.chmod!(fake_claude, 0o755)

        System.put_env("PATH", [fake_cli_root, previous_path || ""] |> Enum.join(":"))
        System.put_env("SYMP_TEST_CLAUDE_TRACE", trace_file)
        System.put_env("LINEAR_API_KEY", "bridge-token")
        System.put_env("CLAUDECODE", "nested-session")
        System.put_env("SYMPHONY_CLAUDE_MODEL", "claude-test-model")
        System.delete_env("SYMPHONY_CLAUDE_ALLOWED_TOOLS")

        write_workflow_file!(Workflow.workflow_file_path(),
          workspace_root: workspace_root,
          codex_command: "#{node_binary} #{bridge_script}",
          codex_approval_policy: "never"
        )

        issue = %Issue{
          id: "issue-claude-bridge",
          identifier: "MT-claude",
          title: "Claude bridge turn",
          description: "Ensure the Claude CLI bridge runs a turn through the CLI",
          state: "In Progress",
          url: "https://example.org/issues/MT-claude",
          labels: ["backend"]
        }

        on_message = fn message -> send(self(), {:app_server_message, message}) end

        assert {:ok, session} = AppServer.start_session(workspace)

        try do
          assert {:ok, _first_turn} =
                   AppServer.run_turn(
                     session,
                     "Use Claude Code for this task",
                     issue,
                     on_message: on_message
                   )

          first_messages = drain_app_server_messages()

          assert {:ok, _second_turn} =
                   AppServer.run_turn(
                     session,
                     "Continue with the remaining work",
                     issue,
                     on_message: on_message
                   )

          second_messages = drain_app_server_messages()

          traces =
            trace_file
            |> File.read!()
            |> String.split("\n", trim: true)
            |> Enum.map(&Jason.decode!/1)

          [first_trace, second_trace] = traces
          expected_cwd = File.cd!(workspace, fn -> File.cwd!() end)

          assert first_trace["cwd"] == expected_cwd
          assert second_trace["cwd"] == expected_cwd
          assert first_trace["resumeSessionId"] == nil
          assert second_trace["resumeSessionId"] == "cli-session-1"
          assert first_trace["env"]["CLAUDECODE"] == nil
          assert first_trace["env"]["LINEAR_API_KEY"] == "bridge-token"

          assert flag_value(first_trace["args"], "--model") == "claude-test-model"
          assert flag_value(first_trace["args"], "--permission-mode") == "bypassPermissions"
          assert flag_value(first_trace["args"], "--output-format") == "stream-json"
          assert Enum.member?(first_trace["args"], "--verbose")
          assert Enum.member?(first_trace["args"], "--include-partial-messages")

          allowed_tools = flag_value(first_trace["args"], "--allowedTools")

          assert allowed_tools == "Bash,Read,Edit,Write,Glob,Grep,mcp__linear_graphql__linear_graphql"

          assert flag_value(second_trace["args"], "--resume") == "cli-session-1"
          assert String.contains?(flag_value(first_trace["args"], "--append-system-prompt"), "Symphony")

          assert get_in(first_trace, ["mcpConfig", "mcpServers", "linear_graphql", "command"]) ==
                   String.trim(resolved_node_binary)

          assert get_in(first_trace, ["mcpConfig", "mcpServers", "linear_graphql", "args"]) ==
                   [Path.expand("../../scripts/linear_graphql_mcp_server.mjs", __DIR__)]

          assert get_in(first_trace, ["mcpConfig", "mcpServers", "linear_graphql", "env", "LINEAR_API_KEY"]) ==
                   "bridge-token"

          assert Enum.any?(first_messages, fn
                   %{
                     event: :notification,
                     payload: %{
                       "method" => "codex/event/agent_message_delta",
                       "params" => %{"delta" => "CLI initial delta"}
                     }
                   } ->
                     true

                   _ ->
                     false
                 end)

          assert Enum.any?(first_messages, fn
                   %{
                     event: :notification,
                     payload: %{
                       "method" => "thread/tokenUsage/updated",
                       "params" => %{
                         "tokenUsage" => %{
                           "total" => %{
                             "input_tokens" => 11,
                             "output_tokens" => 5,
                             "total_tokens" => 16
                           }
                         }
                       }
                     }
                   } ->
                     true

                   _ ->
                     false
                 end)

          assert Enum.any?(first_messages, fn
                   %{
                     event: :turn_completed,
                     payload: %{"method" => "turn/completed"},
                     usage: %{
                       "input_tokens" => 11,
                       "output_tokens" => 5,
                       "total_tokens" => 16
                     }
                   } ->
                     true

                   _ ->
                     false
                 end)

          assert Enum.any?(second_messages, fn
                   %{
                     event: :notification,
                     payload: %{
                       "method" => "codex/event/agent_message_delta",
                       "params" => %{"delta" => "CLI resumed delta"}
                     }
                   } ->
                     true

                   _ ->
                     false
                 end)

          assert Enum.any?(second_messages, fn
                   %{
                     event: :turn_completed,
                     payload: %{"method" => "turn/completed"},
                     usage: %{
                       "input_tokens" => 11,
                       "output_tokens" => 7,
                       "total_tokens" => 18
                     }
                   } ->
                     true

                   _ ->
                     false
                 end)
        after
          AppServer.stop_session(session)
        end
      after
        File.rm_rf(test_root)
      end
    end
  end

  test "Claude CLI bridge surfaces CLI result errors as turn failures" do
    node_binary = System.find_executable("node")

    if is_nil(node_binary) do
      :ok
    else
      test_root =
        Path.join(
          System.tmp_dir!(),
          "symphony-elixir-claude-code-error-#{System.unique_integer([:positive])}"
        )

      try do
        workspace_root = Path.join(test_root, "workspaces")
        workspace = Path.join(workspace_root, "MT-claude-error")
        bridge_script = Path.expand("../../scripts/claude_code_cli_bridge.mjs", __DIR__)
        fake_cli_root = Path.join(test_root, "bin")
        fake_claude = Path.join(fake_cli_root, "claude")
        previous_path = System.get_env("PATH")

        on_exit(fn ->
          restore_env("PATH", previous_path)
        end)

        File.mkdir_p!(workspace)
        File.mkdir_p!(fake_cli_root)

        File.write!(fake_claude, """
        #!/usr/bin/env node

        console.log(
          JSON.stringify({
            type: "result",
            subtype: "error",
            is_error: true,
            result: "mock cli failure"
          })
        );

        process.exit(1);
        """)

        File.chmod!(fake_claude, 0o755)

        System.put_env("PATH", [fake_cli_root, previous_path || ""] |> Enum.join(":"))

        write_workflow_file!(Workflow.workflow_file_path(),
          workspace_root: workspace_root,
          codex_command: "#{node_binary} #{bridge_script}",
          codex_approval_policy: "never"
        )

        issue = %Issue{
          id: "issue-claude-error",
          identifier: "MT-claude-error",
          title: "Claude bridge CLI error",
          description: "Ensure CLI failures surface clearly",
          state: "In Progress",
          url: "https://example.org/issues/MT-claude-error",
          labels: ["backend"]
        }

        assert {:error, {:turn_failed, %{"message" => message}}} =
                 AppServer.run(workspace, "Use Claude Code for this task", issue)

        assert message == "mock cli failure"
      after
        File.rm_rf(test_root)
      end
    end
  end

  test "Claude CLI bridge fails fast when approval policy is not compatible with unattended mode" do
    node_binary = System.find_executable("node")

    if is_nil(node_binary) do
      :ok
    else
      test_root =
        Path.join(
          System.tmp_dir!(),
          "symphony-elixir-claude-code-policy-#{System.unique_integer([:positive])}"
        )

      try do
        workspace_root = Path.join(test_root, "workspaces")
        workspace = Path.join(workspace_root, "MT-policy")
        bridge_script = Path.expand("../../scripts/claude_code_cli_bridge.mjs", __DIR__)

        File.mkdir_p!(workspace)

        write_workflow_file!(Workflow.workflow_file_path(),
          workspace_root: workspace_root,
          codex_command: "#{node_binary} #{bridge_script}"
        )

        issue = %Issue{
          id: "issue-claude-policy",
          identifier: "MT-policy",
          title: "Claude bridge policy",
          description: "Ensure unsupported approval policies fail clearly",
          state: "In Progress",
          url: "https://example.org/issues/MT-policy",
          labels: ["backend"]
        }

        assert {:error, {:turn_failed, %{"message" => message}}} =
                 AppServer.run(workspace, "Use Claude Code for this task", issue)

        assert message =~ "codex.approval_policy: never"
      after
        File.rm_rf(test_root)
      end
    end
  end

  defp drain_app_server_messages(messages \\ []) do
    receive do
      {:app_server_message, message} ->
        drain_app_server_messages([message | messages])
    after
      10 ->
        Enum.reverse(messages)
    end
  end

  defp flag_value(args, flag) do
    case Enum.find_index(args, &(&1 == flag)) do
      nil -> nil
      index -> Enum.at(args, index + 1)
    end
  end
end
