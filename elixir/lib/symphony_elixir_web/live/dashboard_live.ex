defmodule SymphonyElixirWeb.DashboardLive do
  @moduledoc """
  Live observability dashboard for Symphony.
  """

  use Phoenix.LiveView, layout: {SymphonyElixirWeb.Layouts, :app}

  alias SymphonyElixirWeb.{Endpoint, ObservabilityPubSub, Presenter}
  @runtime_tick_ms 1_000

  @impl true
  def mount(_params, _session, socket) do
    socket =
      socket
      |> assign(:payload, load_payload())
      |> assign(:now, DateTime.utc_now())

    if connected?(socket) do
      :ok = ObservabilityPubSub.subscribe()
      schedule_runtime_tick()
    end

    {:ok, socket}
  end

  @impl true
  def handle_info(:runtime_tick, socket) do
    schedule_runtime_tick()
    {:noreply, assign(socket, :now, DateTime.utc_now())}
  end

  @impl true
  def handle_info(:observability_updated, socket) do
    {:noreply,
     socket
     |> assign(:payload, load_payload())
     |> assign(:now, DateTime.utc_now())}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <section class="dashboard-shell">
      <header class="hero-card">
        <div class="hero-layout">
          <div class="hero-copy-block">
            <p class="eyebrow">
              Symphony Observability
            </p>
            <h1 class="hero-title">
              Operations Dashboard
            </h1>
            <p class="hero-copy">
              Shadcn-inspired mission control for live orchestration health, retry pressure, token usage, and queue visibility across the active Symphony runtime.
            </p>

            <div class="hero-meta-grid">
              <article class="hero-meta-card">
                <p class="hero-meta-label">Snapshot</p>
                <p class="hero-meta-value mono"><%= @payload.generated_at || "n/a" %></p>
              </article>

              <article class="hero-meta-card">
                <p class="hero-meta-label">Runtime mode</p>
                <p class="hero-meta-value"><%= dashboard_mode(@payload[:counts]) %></p>
              </article>
            </div>
          </div>

          <div class="hero-side">
            <div class="status-stack">
              <span class="status-badge status-badge-live">
                <span class="status-badge-dot"></span>
                Live
              </span>
              <span class="status-badge status-badge-offline">
                <span class="status-badge-dot"></span>
                Offline
              </span>
            </div>

            <div class="hero-actions">
              <a class="action-chip" href="/api/v1/state">State API</a>
              <a
                :if={primary_running_issue_identifier(@payload[:running] || [])}
                class="action-chip action-chip-muted"
                href={issue_json_path(primary_running_issue_identifier(@payload[:running] || []))}
              >
                Focus issue JSON
              </a>
            </div>

            <p class="hero-side-copy">
              <%= dashboard_mode_copy(@payload[:counts]) %>
            </p>
          </div>
        </div>
      </header>

      <%= if @payload[:error] do %>
        <section class="error-card">
          <div class="section-header">
            <div>
              <h2 class="error-title">
                Snapshot unavailable
              </h2>
              <p class="section-copy">
                The presenter could not build a fresh payload for the dashboard.
              </p>
            </div>

            <a class="action-chip action-chip-muted" href="/api/v1/state">
              Inspect API state
            </a>
          </div>

          <p class="error-copy">
            <strong><%= @payload.error.code %>:</strong> <%= @payload.error.message %>
          </p>
        </section>
      <% else %>
        <% rate_cards = rate_limit_cards(@payload.rate_limits) %>
        <section class="metric-grid">
          <article class="metric-card">
            <p class="metric-label">Running</p>
            <p class="metric-value numeric"><%= @payload.counts.running %></p>
            <p class="metric-detail">Active issue sessions in the current runtime.</p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Retrying</p>
            <p class="metric-value numeric"><%= @payload.counts.retrying %></p>
            <p class="metric-detail">Issues waiting for the next retry window.</p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Total tokens</p>
            <p class="metric-value numeric"><%= format_int(@payload.codex_totals.total_tokens) %></p>
            <p class="metric-detail numeric">
              In <%= format_int(@payload.codex_totals.input_tokens) %> / Out <%= format_int(@payload.codex_totals.output_tokens) %>
            </p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Runtime</p>
            <p class="metric-value numeric"><%= format_runtime_seconds(total_runtime_seconds(@payload, @now)) %></p>
            <p class="metric-detail"><%= tracked_issue_copy(@payload.counts) %></p>
          </article>
        </section>

        <section class="content-grid">
          <section class="section-card section-card-primary">
            <div class="section-header">
              <div>
                <h2 class="section-title">Running sessions</h2>
                <p class="section-copy">Active issues, last known agent activity, and token usage.</p>
              </div>

              <span class="section-chip">
                <%= tracked_issue_count(@payload.counts) %> tracked
              </span>
            </div>

            <%= if @payload.running == [] do %>
              <p class="empty-state">No active sessions.</p>
            <% else %>
              <div class="table-wrap">
                <table class="data-table data-table-running">
                  <colgroup>
                    <col style="width: 12rem;" />
                    <col style="width: 8rem;" />
                    <col style="width: 7.5rem;" />
                    <col style="width: 8.5rem;" />
                    <col />
                    <col style="width: 10rem;" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Issue</th>
                      <th>State</th>
                      <th>Session</th>
                      <th>Runtime / turns</th>
                      <th>Codex update</th>
                      <th>Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr :for={entry <- @payload.running}>
                      <td>
                        <div class="issue-stack">
                          <span class="issue-id"><%= entry.issue_identifier %></span>
                          <a class="issue-link" href={issue_json_path(entry.issue_identifier)}>JSON details</a>
                        </div>
                      </td>
                      <td>
                        <span class={state_badge_class(entry.state)}>
                          <%= entry.state %>
                        </span>
                      </td>
                      <td>
                        <div class="session-stack">
                          <%= if entry.session_id do %>
                            <button
                              type="button"
                              class="subtle-button"
                              data-label="Copy ID"
                              data-copy={entry.session_id}
                              onclick="navigator.clipboard.writeText(this.dataset.copy); this.textContent = 'Copied'; clearTimeout(this._copyTimer); this._copyTimer = setTimeout(() => { this.textContent = this.dataset.label }, 1200);"
                            >
                              Copy ID
                            </button>
                          <% else %>
                            <span class="muted">n/a</span>
                          <% end %>
                        </div>
                      </td>
                      <td class="numeric"><%= format_runtime_and_turns(entry.started_at, entry.turn_count, @now) %></td>
                      <td>
                        <div class="detail-stack">
                          <span
                            class="event-text"
                            title={entry.last_message || to_string(entry.last_event || "n/a")}
                          ><%= entry.last_message || to_string(entry.last_event || "n/a") %></span>
                          <span class="muted event-meta">
                            <%= entry.last_event || "n/a" %>
                            <%= if entry.last_event_at do %>
                              · <span class="mono numeric"><%= entry.last_event_at %></span>
                            <% end %>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div class="token-stack numeric">
                          <span>Total: <%= format_int(entry.tokens.total_tokens) %></span>
                          <span class="muted">In <%= format_int(entry.tokens.input_tokens) %> / Out <%= format_int(entry.tokens.output_tokens) %></span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            <% end %>
          </section>

          <div class="sidebar-stack">
            <section class="section-card">
              <div class="section-header">
                <div>
                  <h2 class="section-title">Runtime notes</h2>
                  <p class="section-copy">A quick read on the current orchestration posture.</p>
                </div>
              </div>

              <div class="insight-list">
                <article :for={item <- insight_items(@payload)} class="insight-card">
                  <p class="insight-label"><%= item.label %></p>
                  <p class="insight-value"><%= item.value %></p>
                  <p class="insight-copy"><%= item.copy %></p>
                </article>
              </div>
            </section>

            <section class="section-card">
              <div class="section-header">
                <div>
                  <h2 class="section-title">Rate limits</h2>
                  <p class="section-copy">Latest upstream allowance snapshot, summarized into cards.</p>
                </div>

                <span :if={rate_limit_profile(@payload.rate_limits)} class="section-chip">
                  <%= rate_limit_profile(@payload.rate_limits) %>
                </span>
              </div>

              <%= if rate_cards == [] do %>
                <p class="empty-state">No rate-limit data available yet.</p>
              <% else %>
                <div class="rate-grid">
                  <article :for={card <- rate_cards} class={["rate-card", "rate-card-#{card.tone}"]}>
                    <p class="rate-label"><%= card.label %></p>
                    <p class="rate-value numeric"><%= card.value %></p>
                    <p class="rate-meta"><%= card.meta %></p>
                  </article>
                </div>
              <% end %>

              <pre class="code-panel"><%= pretty_value(@payload.rate_limits) %></pre>
            </section>
          </div>
        </section>

        <section class="section-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Retry queue</h2>
              <p class="section-copy">Issues waiting for the next retry window.</p>
            </div>

            <span class="section-chip section-chip-warning">
              <%= @payload.counts.retrying %> queued
            </span>
          </div>

          <%= if @payload.retrying == [] do %>
            <p class="empty-state">No issues are currently backing off.</p>
          <% else %>
            <div class="retry-grid">
              <article :for={entry <- @payload.retrying} class="retry-card">
                <div class="retry-card-header">
                  <div class="issue-stack">
                    <span class="issue-id"><%= entry.issue_identifier %></span>
                    <a class="issue-link" href={issue_json_path(entry.issue_identifier)}>JSON details</a>
                  </div>

                  <span class="state-badge state-badge-warning">
                    Attempt <%= entry.attempt %>
                  </span>
                </div>

                <dl class="retry-meta">
                  <div>
                    <dt>Due at</dt>
                    <dd class="mono"><%= entry.due_at || "n/a" %></dd>
                  </div>
                  <div>
                    <dt>Last error</dt>
                    <dd><%= entry.error || "n/a" %></dd>
                  </div>
                </dl>
              </article>
            </div>
          <% end %>
        </section>
      <% end %>
    </section>
    """
  end

  defp load_payload do
    Presenter.state_payload(orchestrator(), snapshot_timeout_ms())
  end

  defp orchestrator do
    Endpoint.config(:orchestrator) || SymphonyElixir.Orchestrator
  end

  defp snapshot_timeout_ms do
    Endpoint.config(:snapshot_timeout_ms) || 15_000
  end

  defp completed_runtime_seconds(payload) do
    payload.codex_totals.seconds_running || 0
  end

  defp total_runtime_seconds(payload, now) do
    completed_runtime_seconds(payload) +
      Enum.reduce(payload.running, 0, fn entry, total ->
        total + runtime_seconds_from_started_at(entry.started_at, now)
      end)
  end

  defp format_runtime_and_turns(started_at, turn_count, now) when is_integer(turn_count) and turn_count > 0 do
    "#{format_runtime_seconds(runtime_seconds_from_started_at(started_at, now))} / #{turn_count}"
  end

  defp format_runtime_and_turns(started_at, _turn_count, now),
    do: format_runtime_seconds(runtime_seconds_from_started_at(started_at, now))

  defp format_runtime_seconds(seconds) when is_number(seconds) do
    whole_seconds = max(trunc(seconds), 0)
    mins = div(whole_seconds, 60)
    secs = rem(whole_seconds, 60)
    "#{mins}m #{secs}s"
  end

  defp runtime_seconds_from_started_at(%DateTime{} = started_at, %DateTime{} = now) do
    DateTime.diff(now, started_at, :second)
  end

  defp runtime_seconds_from_started_at(started_at, %DateTime{} = now) when is_binary(started_at) do
    case DateTime.from_iso8601(started_at) do
      {:ok, parsed, _offset} -> runtime_seconds_from_started_at(parsed, now)
      _ -> 0
    end
  end

  defp runtime_seconds_from_started_at(_started_at, _now), do: 0

  defp format_int(value) when is_integer(value) do
    value
    |> Integer.to_string()
    |> String.reverse()
    |> String.replace(~r/.{3}(?=.)/, "\\0,")
    |> String.reverse()
  end

  defp format_int(_value), do: "n/a"

  defp format_number(value) when is_integer(value), do: format_int(value)
  defp format_number(value) when is_float(value), do: :erlang.float_to_binary(value, decimals: 1)
  defp format_number(value) when is_binary(value), do: value
  defp format_number(_value), do: "n/a"

  defp dashboard_mode(%{running: running, retrying: retrying}) do
    cond do
      retrying > 0 and running > 0 -> "Stabilizing"
      retrying > 0 -> "Recovering"
      running > 0 -> "Live"
      true -> "Idle"
    end
  end

  defp dashboard_mode(_counts), do: "Unknown"

  defp dashboard_mode_copy(%{running: running, retrying: retrying}) do
    cond do
      running == 0 and retrying == 0 ->
        "No active sessions are running yet. The dashboard is ready to track the next orchestration run."

      retrying == 0 ->
        "#{pluralize(running, "session", "sessions")} currently streaming without queued retries."

      running == 0 ->
        "#{pluralize(retrying, "issue", "issues")} waiting in backoff; no live sessions are active right now."

      true ->
        "#{pluralize(running, "session", "sessions")} active with #{pluralize(retrying, "issue", "issues")} queued for retry."
    end
  end

  defp dashboard_mode_copy(_counts), do: "Dashboard state unavailable."

  defp tracked_issue_count(%{running: running, retrying: retrying}), do: running + retrying
  defp tracked_issue_count(_counts), do: 0

  defp tracked_issue_copy(counts) do
    "#{pluralize(tracked_issue_count(counts), "tracked issue", "tracked issues")} across running and retry queues."
  end

  defp insight_items(payload) do
    counts = Map.get(payload, :counts, %{})
    totals = Map.get(payload, :codex_totals, %{})
    running = Map.get(counts, :running, 0)
    retrying = Map.get(counts, :retrying, 0)

    [
      %{
        label: "Queue pressure",
        value: queue_pressure_label(running, retrying),
        copy: "#{pluralize(retrying, "retry", "retries")} waiting while #{pluralize(running, "session", "sessions")} are active."
      },
      %{
        label: "Tracked issues",
        value: tracked_issue_count(counts),
        copy: "Visible running sessions plus queued retries in this snapshot."
      },
      %{
        label: "Token split",
        value: "#{format_int(Map.get(totals, :input_tokens))} / #{format_int(Map.get(totals, :output_tokens))}",
        copy: "Input / output tokens accumulated so far."
      },
      %{
        label: "Allowance profile",
        value: rate_limit_profile(Map.get(payload, :rate_limits)) || "Unavailable",
        copy: rate_limit_copy(Map.get(payload, :rate_limits))
      }
    ]
  end

  defp queue_pressure_label(_running, retrying) when retrying >= 3, do: "High"
  defp queue_pressure_label(_running, retrying) when retrying > 0, do: "Watching"
  defp queue_pressure_label(running, 0) when running > 0, do: "Stable"
  defp queue_pressure_label(_running, _retrying), do: "Idle"

  defp rate_limit_cards(rate_limits) when is_map(rate_limits) do
    [
      build_limit_card("Primary window", lookup_path(rate_limits, [[:primary, "primary"]])),
      build_limit_card("Secondary window", lookup_path(rate_limits, [[:secondary, "secondary"]])),
      build_credits_card(lookup_path(rate_limits, [[:credits, "credits"]]))
    ]
    |> Enum.reject(&is_nil/1)
  end

  defp rate_limit_cards(_rate_limits), do: []

  defp build_limit_card(_label, nil), do: nil

  defp build_limit_card(label, section) when is_map(section) do
    remaining = lookup_path(section, [[:remaining, "remaining"]])
    limit = lookup_path(section, [[:limit, "limit"]])
    reset_seconds = lookup_path(section, [[:reset_in_seconds, "reset_in_seconds"]])

    value =
      cond do
        is_number(remaining) and is_number(limit) -> "#{format_number(remaining)} / #{format_number(limit)}"
        not is_nil(remaining) -> format_number(remaining)
        true -> "n/a"
      end

    meta =
      [
        if(is_number(limit), do: "limit #{format_number(limit)}"),
        if(is_number(reset_seconds), do: "resets in #{reset_seconds}s")
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.join(" / ")

    %{
      label: label,
      value: value,
      meta: if(meta == "", do: "Allowance snapshot available.", else: meta),
      tone: rate_limit_tone(remaining, limit)
    }
  end

  defp build_credits_card(nil), do: nil

  defp build_credits_card(section) when is_map(section) do
    unlimited = truthy?(lookup_path(section, [[:unlimited, "unlimited"]]))
    has_credits = truthy?(lookup_path(section, [[:has_credits, "has_credits"]]))
    balance = lookup_path(section, [[:balance, "balance"]])

    {value, meta, tone} =
      cond do
        unlimited ->
          {"Unlimited", "No fixed credit ceiling reported.", "positive"}

        has_credits and not is_nil(balance) ->
          {format_number(balance), "Credits balance remaining.", "positive"}

        has_credits ->
          {"Available", "Upstream reports credits available.", "positive"}

        true ->
          {"Depleted", "No credits available or not reported.", "danger"}
      end

    %{label: "Credits", value: value, meta: meta, tone: tone}
  end

  defp rate_limit_tone(0, _limit), do: "danger"

  defp rate_limit_tone(remaining, limit)
       when is_number(remaining) and is_number(limit) and limit > 0 and remaining / limit <= 0.2 do
    "warning"
  end

  defp rate_limit_tone(_remaining, _limit), do: "positive"

  defp rate_limit_profile(rate_limits) when is_map(rate_limits) do
    lookup_path(rate_limits, [[:limit_id, "limit_id"]]) ||
      if(rate_limit_cards(rate_limits) == [], do: nil, else: "Allowance snapshot")
  end

  defp rate_limit_profile(_rate_limits), do: nil

  defp rate_limit_copy(rate_limits) when is_map(rate_limits) do
    cond do
      truthy?(lookup_path(rate_limits, [[:credits, "credits"], [:unlimited, "unlimited"]])) ->
        "Credits are reported as unlimited for this runtime."

      match?(%{}, lookup_path(rate_limits, [[:primary, "primary"]])) ->
        "Primary and secondary allowance windows are being tracked."

      true ->
        "Allowance details are partial but still surfaced in the raw payload."
    end
  end

  defp rate_limit_copy(_rate_limits), do: "Allowance data has not been reported yet."

  defp lookup_path(map, []), do: map

  defp lookup_path(map, [keys | rest]) when is_map(map) do
    case lookup_value(map, keys) do
      nil -> nil
      value -> lookup_path(value, rest)
    end
  end

  defp lookup_path(_map, _path), do: nil

  defp lookup_value(map, keys) when is_map(map) and is_list(keys) do
    Enum.find_value(keys, fn key ->
      case Map.fetch(map, key) do
        {:ok, value} -> value
        :error -> nil
      end
    end)
  end

  defp lookup_value(_map, _keys), do: nil

  defp truthy?(value), do: value in [true, "true", 1]

  defp issue_json_path(issue_identifier) when is_binary(issue_identifier), do: "/api/v1/#{issue_identifier}"
  defp issue_json_path(_issue_identifier), do: "/api/v1/state"

  defp primary_running_issue_identifier([entry | _]), do: entry.issue_identifier
  defp primary_running_issue_identifier(_entries), do: nil

  defp pluralize(count, singular, _plural) when count == 1, do: "1 #{singular}"
  defp pluralize(count, _singular, plural), do: "#{count} #{plural}"

  defp state_badge_class(state) do
    base = "state-badge"
    normalized = state |> to_string() |> String.downcase()

    cond do
      String.contains?(normalized, ["progress", "running", "active"]) -> "#{base} state-badge-active"
      String.contains?(normalized, ["blocked", "error", "failed"]) -> "#{base} state-badge-danger"
      String.contains?(normalized, ["todo", "queued", "pending", "retry"]) -> "#{base} state-badge-warning"
      true -> base
    end
  end

  defp schedule_runtime_tick do
    Process.send_after(self(), :runtime_tick, @runtime_tick_ms)
  end

  defp pretty_value(nil), do: "n/a"
  defp pretty_value(value), do: inspect(value, pretty: true, limit: :infinity)
end
