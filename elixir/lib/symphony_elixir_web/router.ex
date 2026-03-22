defmodule SymphonyElixirWeb.Router do
  @moduledoc """
  Router for Symphony's observability dashboard and API.
  """

  use Phoenix.Router

  pipeline :browser do
    plug(:fetch_session)
    plug(:protect_from_forgery)
    plug(:put_secure_browser_headers)
  end

  scope "/", SymphonyElixirWeb do
    pipe_through(:browser)

    get("/", DashboardController, :index)
    get("/sessions", DashboardController, :index)
    get("/agents", DashboardController, :index)
    get("/limits", DashboardController, :index)
    get("/retries", DashboardController, :index)
    get("/pull-requests", DashboardController, :index)
  end

  scope "/", SymphonyElixirWeb do
    get("/dashboard/*path", DashboardAssetController, :show)
    head("/dashboard/*path", DashboardAssetController, :show)
    get("/api/v1/config/agent", ObservabilityApiController, :agent)
    post("/api/v1/config/agent", ObservabilityApiController, :update_agent)
    match(:*, "/api/v1/config/agent", ObservabilityApiController, :method_not_allowed)
    get("/api/v1/state", ObservabilityApiController, :state)
    get("/api/v1/pull-requests", ObservabilityApiController, :pull_requests)

    match(:*, "/", ObservabilityApiController, :method_not_allowed)
    match(:*, "/api/v1/state", ObservabilityApiController, :method_not_allowed)
    match(:*, "/api/v1/pull-requests", ObservabilityApiController, :method_not_allowed)
    post("/api/v1/refresh", ObservabilityApiController, :refresh)
    match(:*, "/api/v1/refresh", ObservabilityApiController, :method_not_allowed)
    get("/api/v1/:issue_identifier", ObservabilityApiController, :issue)
    match(:*, "/api/v1/:issue_identifier", ObservabilityApiController, :method_not_allowed)
    match(:*, "/*path", ObservabilityApiController, :not_found)
  end
end
