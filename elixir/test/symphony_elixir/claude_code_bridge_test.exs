defmodule SymphonyElixir.ClaudeCodeBridgeTest do
  use SymphonyElixir.TestSupport

  test "Claude bridge completes a turn and forwards the Linear MCP configuration to the SDK" do
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
        bridge_script = Path.expand("../../scripts/claude_code_app_server.mjs", __DIR__)
        fake_sdk_module = Path.join(test_root, "fake-claude-sdk.mjs")
        trace_file = Path.join(test_root, "claude-sdk.trace")
        {resolved_node_binary, 0} = System.cmd(node_binary, ["-p", "process.execPath"])

        previous_sdk_module = System.get_env("SYMPHONY_CLAUDE_SDK_QUERY_MODULE")
        previous_query_module = System.get_env("SYMPHONY_CLAUDE_CODE_QUERY_MODULE")
        previous_trace = System.get_env("SYMP_TEST_CLAUDE_TRACE")
        previous_linear_api_key = System.get_env("LINEAR_API_KEY")

        on_exit(fn ->
          restore_env("SYMPHONY_CLAUDE_SDK_QUERY_MODULE", previous_sdk_module)
          restore_env("SYMPHONY_CLAUDE_CODE_QUERY_MODULE", previous_query_module)
          restore_env("SYMP_TEST_CLAUDE_TRACE", previous_trace)
          restore_env("LINEAR_API_KEY", previous_linear_api_key)
        end)

        File.mkdir_p!(workspace)

        File.write!(fake_sdk_module, """
        import { appendFileSync } from "node:fs";

        export async function* query({ prompt, options }) {
          appendFileSync(
            process.env.SYMP_TEST_CLAUDE_TRACE,
            JSON.stringify({
              cwd: process.cwd(),
              hasAbortController: Boolean(options?.abortController),
              options,
              prompt
            }) + "\\n"
          );

          yield {
            type: "assistant",
            message: {
              content: [
                { type: "text", text: "Claude bridge delta" }
              ]
            }
          };
        }
        """)

        System.put_env("SYMPHONY_CLAUDE_SDK_QUERY_MODULE", fake_sdk_module)
        System.put_env("SYMP_TEST_CLAUDE_TRACE", trace_file)
        System.put_env("LINEAR_API_KEY", "bridge-token")

        write_workflow_file!(Workflow.workflow_file_path(),
          workspace_root: workspace_root,
          codex_command: "#{node_binary} #{bridge_script}",
          codex_approval_policy: "never"
        )

        issue = %Issue{
          id: "issue-claude-bridge",
          identifier: "MT-claude",
          title: "Claude bridge turn",
          description: "Ensure the Claude bridge runs a turn through the SDK",
          state: "In Progress",
          url: "https://example.org/issues/MT-claude",
          labels: ["backend"]
        }

        on_message = fn message -> send(self(), {:app_server_message, message}) end

        assert {:ok, _result} = AppServer.run(workspace, "Use Claude Code for this task", issue, on_message: on_message)

        trace_payload =
          trace_file
          |> File.read!()
          |> String.split("\n", trim: true)
          |> List.last()
          |> Jason.decode!()

        expected_cwd = File.cd!(workspace, fn -> File.cwd!() end)

        assert trace_payload["cwd"] == expected_cwd
        assert trace_payload["hasAbortController"] == true
        assert trace_payload["prompt"] == "Use Claude Code for this task"
        assert get_in(trace_payload, ["options", "allowDangerouslySkipPermissions"]) == true
        assert get_in(trace_payload, ["options", "permissionMode"]) == "bypassPermissions"
        assert get_in(trace_payload, ["options", "mcpServers", "linear_graphql", "type"]) == "stdio"

        assert get_in(trace_payload, ["options", "mcpServers", "linear_graphql", "command"]) ==
                 String.trim(resolved_node_binary)

        assert get_in(trace_payload, ["options", "mcpServers", "linear_graphql", "env", "LINEAR_API_KEY"]) == "bridge-token"

        assert_received {:app_server_message,
                         %{
                           event: :notification,
                           payload: %{
                             "method" => "codex/event/agent_message_delta",
                             "params" => %{"delta" => "Claude bridge delta"}
                           }
                         }}
      after
        File.rm_rf(test_root)
      end
    end
  end

  test "Claude bridge fails fast when approval policy is not compatible with unattended mode" do
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
        bridge_script = Path.expand("../../scripts/claude_code_app_server.mjs", __DIR__)

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
end
