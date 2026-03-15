defmodule SymphonyElixirWeb.DashboardAssetControllerTest do
  use ExUnit.Case, async: true

  import Phoenix.ConnTest

  alias SymphonyElixirWeb.DashboardAssetController

  test "returns 404 for the dashboard root without a concrete asset path" do
    conn = DashboardAssetController.show(build_conn(), %{"path" => []})

    assert conn.status == 404
    assert conn.resp_body == ""
  end

  test "returns 404 for path traversal attempts outside the dashboard root" do
    conn = DashboardAssetController.show(build_conn(), %{"path" => ["..", "escape.js"]})

    assert conn.status == 404
    assert conn.resp_body == ""
  end
end
