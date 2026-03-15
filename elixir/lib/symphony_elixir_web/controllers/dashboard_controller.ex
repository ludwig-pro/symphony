defmodule SymphonyElixirWeb.DashboardController do
  @moduledoc """
  Serves the compiled React dashboard shell.
  """

  use Phoenix.Controller, formats: []

  alias Plug.Conn

  @dashboard_index_path Application.app_dir(:symphony_elixir, "priv/static/dashboard/index.html")

  @spec index(Conn.t(), map()) :: Conn.t()
  def index(conn, _params) do
    case File.read(@dashboard_index_path) do
      {:ok, html} ->
        conn
        |> put_resp_content_type("text/html")
        |> send_resp(200, html)

      {:error, _reason} ->
        conn
        |> put_resp_content_type("text/html")
        |> send_resp(
          503,
          """
          <!doctype html>
          <html lang="fr">
            <head>
              <meta charset="utf-8" />
              <title>Observabilité Symphony indisponible</title>
            </head>
            <body>
              <p>Le bundle frontend du dashboard est absent. Exécutez `npm run dashboard:build` depuis `elixir/`.</p>
            </body>
          </html>
          """
        )
    end
  end
end
