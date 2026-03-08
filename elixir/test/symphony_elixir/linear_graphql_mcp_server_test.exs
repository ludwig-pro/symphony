defmodule SymphonyElixir.LinearGraphqlMcpServerTest do
  use SymphonyElixir.TestSupport

  test "linear_graphql MCP server accepts Claude CLI jsonl transport and lists tools" do
    node_binary = System.find_executable("node")

    if is_nil(node_binary) do
      :ok
    else
      server_script = Path.expand("../../scripts/linear_graphql_mcp_server.mjs", __DIR__)

      port =
        Port.open(
          {:spawn_executable, String.to_charlist(node_binary)},
          [
            :binary,
            :exit_status,
            line: 1_048_576,
            args: [String.to_charlist(server_script)]
          ]
        )

      try do
        Port.command(
          port,
          Jason.encode!(%{
            "jsonrpc" => "2.0",
            "id" => 1,
            "method" => "initialize",
            "params" => %{
              "protocolVersion" => "2025-11-25",
              "capabilities" => %{"roots" => %{}},
              "clientInfo" => %{
                "name" => "claude-code",
                "version" => "2.1.71"
              }
            }
          }) <> "\n"
        )

        assert_receive {^port, {:data, {:eol, initialize_response}}}, 1_000

        assert %{
                 "id" => 1,
                 "jsonrpc" => "2.0",
                 "result" => %{
                   "protocolVersion" => "2025-11-25",
                   "serverInfo" => %{"name" => "symphony-linear-graphql"}
                 }
               } = Jason.decode!(to_string(initialize_response))

        Port.command(
          port,
          Jason.encode!(%{
            "jsonrpc" => "2.0",
            "method" => "notifications/initialized",
            "params" => %{}
          }) <> "\n"
        )

        Port.command(
          port,
          Jason.encode!(%{
            "jsonrpc" => "2.0",
            "id" => 2,
            "method" => "tools/list",
            "params" => %{}
          }) <> "\n"
        )

        assert_receive {^port, {:data, {:eol, tools_response}}}, 1_000

        assert %{
                 "id" => 2,
                 "result" => %{
                   "tools" => [
                     %{
                       "name" => "linear_graphql"
                     }
                   ]
                 }
               } = Jason.decode!(to_string(tools_response))
      after
        Port.close(port)

        receive do
          {^port, {:exit_status, _status}} -> :ok
        after
          100 -> :ok
        end
      end
    end
  end
end
