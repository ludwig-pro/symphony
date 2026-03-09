defmodule SymphonyElixirWeb.DashboardLive do
  @moduledoc """
  Live observability dashboard for Symphony.
  """

  use Phoenix.LiveView, layout: {SymphonyElixirWeb.Layouts, :app}

  alias SymphonyElixir.AgentConfig
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
  def handle_event("switch_agent", %{"agent" => %{"preset_id" => preset_id}}, socket) do
    case AgentConfig.set_preset(preset_id) do
      {:ok, payload} ->
        {:noreply,
         socket
         |> assign(:payload, load_payload())
         |> assign(:now, DateTime.utc_now())
         |> put_flash(:info, switch_success_message(payload.current))}

      {:error, {:preset_unavailable, reason}} ->
        {:noreply, put_flash(socket, :error, reason)}

      {:error, :unsupported_preset} ->
        {:noreply, put_flash(socket, :error, "Profil d'agent non pris en charge.")}
    end
  end

  def handle_event("switch_agent", _params, socket) do
    {:noreply, put_flash(socket, :error, "Sélection d'un profil d'agent attendue.")}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <section class="dashboard-shell">
      <div :if={map_size(@flash) > 0} class="flash-stack">
        <article :for={{kind, message} <- @flash} class={flash_toast_class(kind)} role="status">
          <p class="flash-toast-label"><%= flash_label(kind) %></p>
          <p class="flash-toast-copy"><%= message %></p>
        </article>
      </div>

      <header class="hero-card">
        <div class="hero-layout">
          <div class="hero-copy-block">
            <p class="eyebrow">
              Observabilité Symphony
            </p>
            <h1 class="hero-title">
              Tableau de bord des opérations
            </h1>
            <p class="hero-copy">
              Centre de contrôle en direct pour suivre la santé de l'orchestration, la pression des relances, l'usage des jetons et la visibilité de la file dans le runtime Symphony actif.
            </p>

            <div class="hero-meta-grid">
              <article class="hero-meta-card">
                <p class="hero-meta-label">Instantané</p>
                <p class="hero-meta-value mono"><%= @payload.generated_at || "n/d" %></p>
              </article>

              <article class="hero-meta-card">
                <p class="hero-meta-label">Mode d'exécution</p>
                <p class="hero-meta-value"><%= dashboard_mode(@payload[:counts]) %></p>
              </article>
            </div>
          </div>

          <div class="hero-side">
            <div class="status-stack">
              <span class="status-badge status-badge-live">
                <span class="status-badge-dot"></span>
                En direct
              </span>
              <span class="status-badge status-badge-offline">
                <span class="status-badge-dot"></span>
                Hors ligne
              </span>
            </div>

            <div class="hero-actions">
              <a class="action-chip" href="/api/v1/state">API d'état</a>
              <a class="action-chip action-chip-muted" href="/api/v1/config/agent">API des agents</a>
              <a
                :if={primary_running_issue_identifier(@payload[:running] || [])}
                class="action-chip action-chip-muted"
                href={issue_json_path(primary_running_issue_identifier(@payload[:running] || []))}
              >
                JSON de l'issue
              </a>
            </div>

            <div class="agent-panel">
              <div class="agent-panel-header">
                <div>
                  <p class="hero-meta-label">Agent actif</p>
                  <p class="agent-panel-value"><%= @payload.agent.current.label %></p>
                </div>

                <span class={agent_provider_badge_class(@payload.agent.current.provider)}>
                  <%= @payload.agent.current.provider_label %>
                </span>
              </div>

              <p class="agent-panel-copy">
                <%= active_agent_copy(@payload.agent.current) %>
              </p>

              <form class="agent-switcher" phx-change="switch_agent">
                <label class="agent-switcher-label" for="agent-preset">Agent suivant</label>

                <div class="agent-switcher-row">
                  <select
                    id="agent-preset"
                    name="agent[preset_id]"
                    class="agent-select"
                    aria-label="Sélectionner un profil d'agent"
                  >
                    <option
                      :for={preset <- agent_presets(@payload)}
                      value={preset.id}
                      selected={preset.selected}
                      disabled={not preset.available}
                    >
                      <%= agent_option_label(preset) %>
                    </option>
                  </select>

                  <span class={claude_bridge_badge_class(@payload.agent.claude_bridge)}>
                    <%= claude_bridge_badge_label(@payload.agent.claude_bridge) %>
                  </span>
                </div>
              </form>

              <p class="agent-switcher-hint">
                <%= claude_bridge_copy(@payload.agent.claude_bridge) %>
              </p>
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
                Instantané indisponible
              </h2>
              <p class="section-copy">
                Impossible de générer un nouvel instantané pour le tableau de bord.
              </p>
            </div>

            <a class="action-chip action-chip-muted" href="/api/v1/state">
              Inspecter l'état de l'API
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
            <p class="metric-label">Actives</p>
            <p class="metric-value numeric"><%= @payload.counts.running %></p>
            <p class="metric-detail">Sessions d'issue actives dans l'environnement d'exécution courant.</p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Relances</p>
            <p class="metric-value numeric"><%= @payload.counts.retrying %></p>
            <p class="metric-detail">Issues en attente de la prochaine fenêtre de relance.</p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Jetons totaux</p>
            <p class="metric-value numeric"><%= format_int(@payload.codex_totals.total_tokens) %></p>
            <p class="metric-detail numeric">
              Entrée <%= format_int(@payload.codex_totals.input_tokens) %> / Sortie <%= format_int(@payload.codex_totals.output_tokens) %>
            </p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Durée d'exécution</p>
            <p class="metric-value numeric"><%= format_runtime_seconds(total_runtime_seconds(@payload, @now)) %></p>
            <p class="metric-detail"><%= tracked_issue_copy(@payload.counts) %></p>
          </article>
        </section>

        <section class="content-grid">
          <section class="section-card section-card-primary">
            <div class="section-header">
              <div>
                <h2 class="section-title">Sessions actives</h2>
                <p class="section-copy">Issues actives, dernière activité agent connue et usage des jetons.</p>
              </div>

              <span class="section-chip">
                <%= tracked_issue_count(@payload.counts) %> suivies
              </span>
            </div>

            <%= if @payload.running == [] do %>
              <p class="empty-state">Aucune session active.</p>
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
                      <th>État</th>
                      <th>Session</th>
                      <th>Durée / tours</th>
                      <th>Mise à jour Codex</th>
                      <th>Jetons</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr :for={entry <- @payload.running}>
                      <td>
                        <div class="issue-stack">
                          <span class="issue-id"><%= entry.issue_identifier %></span>
                          <a class="issue-link" href={issue_json_path(entry.issue_identifier)}>Détails JSON</a>
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
                              data-label="Copier l'ID"
                              data-copy={entry.session_id}
                              onclick="navigator.clipboard.writeText(this.dataset.copy); this.textContent = 'Copié'; clearTimeout(this._copyTimer); this._copyTimer = setTimeout(() => { this.textContent = this.dataset.label }, 1200);"
                            >
                              Copier l'ID
                            </button>
                          <% else %>
                            <span class="muted">n/d</span>
                          <% end %>
                        </div>
                      </td>
                      <td class="numeric"><%= format_runtime_and_turns(entry.started_at, entry.turn_count, @now) %></td>
                      <td>
                        <div class="detail-stack">
                          <span
                            class="event-text"
                            title={entry.last_message || to_string(entry.last_event || "n/d")}
                          ><%= entry.last_message || to_string(entry.last_event || "n/d") %></span>
                          <span class="muted event-meta">
                            <%= entry.last_event || "n/d" %>
                            <%= if entry.last_event_at do %>
                              · <span class="mono numeric"><%= entry.last_event_at %></span>
                            <% end %>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div class="token-stack numeric">
                          <span>Total: <%= format_int(entry.tokens.total_tokens) %></span>
                          <span class="muted">Entrée <%= format_int(entry.tokens.input_tokens) %> / Sortie <%= format_int(entry.tokens.output_tokens) %></span>
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
                  <h2 class="section-title">Notes d'exécution</h2>
                  <p class="section-copy">Lecture rapide de la posture d'orchestration actuelle.</p>
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
                  <h2 class="section-title">Limites de débit</h2>
                  <p class="section-copy">Dernier instantané des quotas amont, résumé sous forme de cartes.</p>
                </div>

                <span :if={rate_limit_profile(@payload.rate_limits)} class="section-chip">
                  <%= rate_limit_profile(@payload.rate_limits) %>
                </span>
              </div>

              <%= if rate_cards == [] do %>
                <p class="empty-state">Aucune donnée de limite de débit disponible pour le moment.</p>
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
              <h2 class="section-title">File de relance</h2>
              <p class="section-copy">Issues en attente de la prochaine fenêtre de relance.</p>
            </div>

            <span class="section-chip section-chip-warning">
              <%= @payload.counts.retrying %> en attente
            </span>
          </div>

          <%= if @payload.retrying == [] do %>
            <p class="empty-state">Aucune issue n'est actuellement en temporisation.</p>
          <% else %>
            <div class="retry-grid">
              <article :for={entry <- @payload.retrying} class="retry-card">
                <div class="retry-card-header">
                  <div class="issue-stack">
                    <span class="issue-id"><%= entry.issue_identifier %></span>
                    <a class="issue-link" href={issue_json_path(entry.issue_identifier)}>Détails JSON</a>
                  </div>

                  <span class="state-badge state-badge-warning">
                    Tentative <%= entry.attempt %>
                  </span>
                </div>

                <dl class="retry-meta">
                  <div>
                    <dt>Prévue à</dt>
                    <dd class="mono"><%= entry.due_at || "n/d" %></dd>
                  </div>
                  <div>
                    <dt>Dernière erreur</dt>
                    <dd><%= entry.error || "n/d" %></dd>
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

  defp flash_toast_class(kind) do
    base = "flash-toast"

    case kind do
      :error -> "#{base} flash-toast-error"
      _ -> "#{base} flash-toast-info"
    end
  end

  defp flash_label(:error), do: "Changement échoué"
  defp flash_label(_kind), do: "Agent mis à jour"

  defp active_agent_copy(agent) do
    "#{agent.source_label}. Les changements ne s'appliquent qu'aux agents lancés après ce basculement."
  end

  defp agent_presets(%{agent: %{presets: presets}}) when is_list(presets), do: presets
  defp agent_presets(_payload), do: []

  defp agent_option_label(preset) do
    base = "#{preset.provider_label} - #{preset.model_label}"

    if preset.available do
      base
    else
      "#{base} (indisponible)"
    end
  end

  defp agent_provider_badge_class("claude_code"), do: "provider-badge provider-badge-claude"
  defp agent_provider_badge_class(_provider), do: "provider-badge provider-badge-codex"

  defp claude_bridge_badge_class(%{available: true}),
    do: "availability-badge availability-badge-ready"

  defp claude_bridge_badge_class(_status),
    do: "availability-badge availability-badge-blocked"

  defp claude_bridge_badge_label(%{available: true}), do: "Passerelle Claude prête"
  defp claude_bridge_badge_label(_status), do: "Passerelle Claude bloquée"

  defp claude_bridge_copy(%{available: true}) do
    "Claude Code est installé et authentifié. Les profils désactivés restent inactifs tant que leurs prérequis d'exécution ne sont pas satisfaits."
  end

  defp claude_bridge_copy(%{reason: reason}) when is_binary(reason), do: reason
  defp claude_bridge_copy(_status), do: "Statut de la passerelle Claude indisponible."

  defp switch_success_message(current) do
    "Basculé vers #{current.provider_label} : les prochains agents utiliseront #{current.model_label}."
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

  defp format_int(_value), do: "n/d"

  defp format_number(value) when is_integer(value), do: format_int(value)
  defp format_number(value) when is_float(value), do: :erlang.float_to_binary(value, decimals: 1)
  defp format_number(value) when is_binary(value), do: value
  defp format_number(_value), do: "n/d"

  defp dashboard_mode(%{running: running, retrying: retrying}) do
    cond do
      retrying > 0 and running > 0 -> "Stabilisation"
      retrying > 0 -> "Récupération"
      running > 0 -> "En direct"
      true -> "Au repos"
    end
  end

  defp dashboard_mode(_counts), do: "Inconnu"

  defp dashboard_mode_copy(%{running: running, retrying: retrying}) do
    cond do
      running == 0 and retrying == 0 ->
        "Aucune session active pour le moment. Le tableau de bord est prêt à suivre la prochaine orchestration."

      retrying == 0 ->
        "#{pluralize(running, "session active", "sessions actives")} en cours sans relance en attente."

      running == 0 ->
        "#{pluralize(retrying, "issue en temporisation", "issues en temporisation")} ; aucune session en direct n'est active pour l'instant."

      true ->
        "#{pluralize(running, "session active", "sessions actives")} avec #{pluralize(retrying, "issue en attente de relance", "issues en attente de relance")}."
    end
  end

  defp dashboard_mode_copy(_counts), do: "État du tableau de bord indisponible."

  defp tracked_issue_count(%{running: running, retrying: retrying}), do: running + retrying
  defp tracked_issue_count(_counts), do: 0

  defp tracked_issue_copy(counts) do
    "#{pluralize(tracked_issue_count(counts), "issue suivie", "issues suivies")} entre les sessions actives et la file de relance."
  end

  defp insight_items(payload) do
    counts = Map.get(payload, :counts, %{})
    totals = Map.get(payload, :codex_totals, %{})
    running = Map.get(counts, :running, 0)
    retrying = Map.get(counts, :retrying, 0)

    [
      %{
        label: "Pression de la file",
        value: queue_pressure_label(running, retrying),
        copy: "#{pluralize(retrying, "relance", "relances")} en attente pendant que #{pluralize(running, "session active", "sessions actives")} restent en cours."
      },
      %{
        label: "Issues suivies",
        value: tracked_issue_count(counts),
        copy: "Sessions actives visibles et relances en attente dans cet instantané."
      },
      %{
        label: "Répartition des jetons",
        value: "#{format_int(Map.get(totals, :input_tokens))} / #{format_int(Map.get(totals, :output_tokens))}",
        copy: "Jetons d'entrée et de sortie accumulés jusqu'ici."
      },
      %{
        label: "Profil de quota",
        value: rate_limit_profile(Map.get(payload, :rate_limits)) || "Indisponible",
        copy: rate_limit_copy(Map.get(payload, :rate_limits))
      }
    ]
  end

  defp queue_pressure_label(_running, retrying) when retrying >= 3, do: "Élevée"
  defp queue_pressure_label(_running, retrying) when retrying > 0, do: "Surveillance"
  defp queue_pressure_label(running, 0) when running > 0, do: "Stable"
  defp queue_pressure_label(_running, _retrying), do: "Au repos"

  defp rate_limit_cards(rate_limits) when is_map(rate_limits) do
    [
      build_limit_card("Fenêtre principale", lookup_path(rate_limits, [[:primary, "primary"]])),
      build_limit_card("Fenêtre secondaire", lookup_path(rate_limits, [[:secondary, "secondary"]])),
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
        true -> "n/d"
      end

    meta =
      [
        if(is_number(limit), do: "limite #{format_number(limit)}"),
        if(is_number(reset_seconds), do: "réinitialisation dans #{reset_seconds}s")
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.join(" / ")

    %{
      label: label,
      value: value,
      meta: if(meta == "", do: "Instantané de quota disponible.", else: meta),
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
          {"Illimités", "Aucun plafond de crédits fixe n'est signalé.", "positive"}

        has_credits and not is_nil(balance) ->
          {format_number(balance), "Solde de crédits restant.", "positive"}

        has_credits ->
          {"Disponibles", "L'amont signale des crédits disponibles.", "positive"}

        true ->
          {"Épuisés", "Aucun crédit disponible ou non signalé.", "danger"}
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
      if(rate_limit_cards(rate_limits) == [], do: nil, else: "Instantané de quota")
  end

  defp rate_limit_profile(_rate_limits), do: nil

  defp rate_limit_copy(rate_limits) when is_map(rate_limits) do
    cond do
      truthy?(lookup_path(rate_limits, [[:credits, "credits"], [:unlimited, "unlimited"]])) ->
        "Les crédits sont annoncés comme illimités pour ce runtime."

      match?(%{}, lookup_path(rate_limits, [[:primary, "primary"]])) ->
        "Les fenêtres de quota principale et secondaire sont suivies."

      true ->
        "Les détails de quota sont partiels mais restent exposés dans la charge utile brute."
    end
  end

  defp rate_limit_copy(_rate_limits), do: "Aucune donnée de quota n'a encore été signalée."

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

  defp pretty_value(nil), do: "n/d"
  defp pretty_value(value), do: inspect(value, pretty: true, limit: :infinity)
end
