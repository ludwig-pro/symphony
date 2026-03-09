defmodule SymphonyElixirWeb.ObservabilityApiController do
  @moduledoc """
  JSON API for Symphony observability data.
  """

  use Phoenix.Controller, formats: [:json]

  alias Plug.Conn
  alias SymphonyElixir.AgentConfig
  alias SymphonyElixirWeb.{Endpoint, Presenter}

  @spec state(Conn.t(), map()) :: Conn.t()
  def state(conn, _params) do
    json(conn, Presenter.state_payload(orchestrator(), snapshot_timeout_ms()))
  end

  @spec agent(Conn.t(), map()) :: Conn.t()
  def agent(conn, _params) do
    json(conn, AgentConfig.current())
  end

  @spec issue(Conn.t(), map()) :: Conn.t()
  def issue(conn, %{"issue_identifier" => issue_identifier}) do
    case Presenter.issue_payload(issue_identifier, orchestrator(), snapshot_timeout_ms()) do
      {:ok, payload} ->
        json(conn, payload)

      {:error, :issue_not_found} ->
        error_response(conn, 404, "issue_not_found", "Issue introuvable")
    end
  end

  @spec update_agent(Conn.t(), map()) :: Conn.t()
  def update_agent(conn, %{"preset_id" => preset_id}) do
    case AgentConfig.set_preset(preset_id) do
      {:ok, payload} ->
        json(conn, payload)

      {:error, :unsupported_preset} ->
        error_response(conn, 400, "unsupported_agent_preset", "Profil d'agent non pris en charge")

      {:error, {:preset_unavailable, reason}} ->
        error_response(conn, 422, "agent_preset_unavailable", reason)
    end
  end

  def update_agent(conn, _params) do
    error_response(conn, 400, "invalid_request", "Le paramètre `preset_id` est attendu.")
  end

  @spec refresh(Conn.t(), map()) :: Conn.t()
  def refresh(conn, _params) do
    case Presenter.refresh_payload(orchestrator()) do
      {:ok, payload} ->
        conn
        |> put_status(202)
        |> json(payload)

      {:error, :unavailable} ->
        error_response(conn, 503, "orchestrator_unavailable", "L'orchestrateur est indisponible")
    end
  end

  @spec method_not_allowed(Conn.t(), map()) :: Conn.t()
  def method_not_allowed(conn, _params) do
    error_response(conn, 405, "method_not_allowed", "Méthode non autorisée")
  end

  @spec not_found(Conn.t(), map()) :: Conn.t()
  def not_found(conn, _params) do
    error_response(conn, 404, "not_found", "Route introuvable")
  end

  defp error_response(conn, status, code, message) do
    conn
    |> put_status(status)
    |> json(%{error: %{code: code, message: message}})
  end

  defp orchestrator do
    Endpoint.config(:orchestrator) || SymphonyElixir.Orchestrator
  end

  defp snapshot_timeout_ms do
    Endpoint.config(:snapshot_timeout_ms) || 15_000
  end
end
