defmodule SymphonyElixir.LinearGraphqlMcpServerTest do
  use SymphonyElixir.TestSupport

  # GitHub Actions can take longer than 1s to schedule the Node child process while
  # the coverage job is compiling the full suite. The protocol exchange is still tiny,
  # so a slightly larger timeout avoids testing scheduler jitter instead of behavior.
  @port_response_timeout 5_000
  @port_exit_timeout 1_000

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

        initialize_response = receive_port_line!(port)

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

        tools_response = receive_port_line!(port)

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
        close_port(port)
      end
    end
  end

  defp receive_port_line!(port, timeout_ms \\ @port_response_timeout) do
    receive do
      {^port, {:data, {:eol, response}}} ->
        response

      {^port, {:exit_status, status}} ->
        flunk("linear_graphql MCP server exited before responding (status #{status})")
    after
      timeout_ms ->
        flunk("linear_graphql MCP server did not respond within #{timeout_ms}ms")
    end
  end

  defp close_port(port) do
    try do
      Port.close(port)
    rescue
      ArgumentError -> :ok
    end

    receive do
      {^port, {:exit_status, _status}} -> :ok
    after
      @port_exit_timeout -> :ok
    end
  end
end
