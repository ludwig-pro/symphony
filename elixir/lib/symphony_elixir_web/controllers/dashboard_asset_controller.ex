defmodule SymphonyElixirWeb.DashboardAssetController do
  @moduledoc """
  Serves compiled dashboard assets from the application priv directory.
  """

  use Phoenix.Controller, formats: []

  alias Plug.Conn

  @dashboard_root Application.app_dir(:symphony_elixir, "priv/static/dashboard")

  @spec show(Conn.t(), map()) :: Conn.t()
  def show(conn, %{"path" => path_segments}) do
    case asset_path(path_segments) do
      {:ok, path} ->
        conn
        |> put_resp_content_type(MIME.from_path(path))
        |> send_file(200, path)

      :error ->
        send_resp(conn, 404, "")
    end
  end

  defp asset_path(path_segments) do
    expanded_root = Path.expand(@dashboard_root)
    candidate = Path.expand(Path.join([expanded_root | path_segments]))

    cond do
      not String.starts_with?(candidate, expanded_root <> "/") and candidate != expanded_root ->
        :error

      File.regular?(candidate) ->
        {:ok, candidate}

      true ->
        :error
    end
  end
end
