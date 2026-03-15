const numberFormatter = new Intl.NumberFormat("fr-FR")
const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "medium",
})

const stateTranslations: Record<string, string> = {
  active: "Actif",
  blocked: "Bloqué",
  cancelled: "Annulé",
  canceled: "Annulé",
  completed: "Terminé",
  done: "Terminé",
  error: "Erreur",
  failed: "Échoué",
  "in progress": "En cours",
  pending: "En attente",
  queued: "En attente",
  retrying: "En relance",
  running: "En cours",
  todo: "À faire",
}

export type JsonRecord = Record<string, unknown>

export type AgentPreset = {
  id: string
  provider: string
  provider_label: string
  model_label: string
  label: string
  selected: boolean
  available: boolean
}

export type AgentCurrent = {
  id: string
  provider: string
  provider_label: string
  model_label: string
  label: string
  source_label: string
}

export type ClaudeBridgeStatus = {
  available: boolean
  authenticated?: boolean
  installed?: boolean
  node_available?: boolean
  code?: string | null
  reason?: string | null
}

export type AgentPayload = {
  current: AgentCurrent
  presets: AgentPreset[]
  claude_bridge: ClaudeBridgeStatus
}

export type DashboardCounts = {
  running: number
  retrying: number
}

export type DashboardTokens = {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  seconds_running?: number | null
}

export type RunningEntry = {
  issue_id: string
  issue_identifier: string
  state: string | null
  session_id: string | null
  turn_count: number
  last_event: string | null
  last_message: string | null
  started_at: string | null
  last_event_at: string | null
  tokens: DashboardTokens
}

export type RetryEntry = {
  issue_id: string
  issue_identifier: string
  attempt: number
  due_at: string | null
  error: string | null
}

export type DashboardError = {
  code: string
  message: string
}

export type DashboardPayload = {
  agent: AgentPayload
  generated_at: string
  counts?: DashboardCounts
  running?: RunningEntry[]
  retrying?: RetryEntry[]
  codex_totals?: DashboardTokens
  rate_limits?: JsonRecord | null
  error?: DashboardError
}

export type RateLimitCard = {
  label: string
  value: string
  meta: string
  tone: "positive" | "warning" | "danger"
}

export type InsightItem = {
  label: string
  value: string
  copy: string
}

export function emptySnapshot(agent?: AgentPayload | null): DashboardPayload | null {
  if (!agent) {
    return null
  }

  return {
    agent,
    generated_at: "",
    counts: { running: 0, retrying: 0 },
    running: [],
    retrying: [],
    codex_totals: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      seconds_running: 0,
    },
    rate_limits: null,
  }
}

export function runningEntries(payload: DashboardPayload | null) {
  return payload?.running ?? []
}

export function retryEntries(payload: DashboardPayload | null) {
  return payload?.retrying ?? []
}

export function counts(payload: DashboardPayload | null): DashboardCounts {
  return payload?.counts ?? { running: 0, retrying: 0 }
}

export function totals(payload: DashboardPayload | null): DashboardTokens {
  return (
    payload?.codex_totals ?? {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      seconds_running: 0,
    }
  )
}

export function formatInt(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? numberFormatter.format(value)
    : "n/d"
}

export function formatNumber(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value)) {
      return formatInt(value)
    }

    return value.toLocaleString("fr-FR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  }

  return typeof value === "string" && value.length > 0 ? value : "n/d"
}

export function formatSnapshotDate(value: string | null | undefined) {
  if (!value) {
    return "n/d"
  }

  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) {
    return value
  }

  return dateTimeFormatter.format(date)
}

export function prettyValue(value: unknown) {
  if (value == null) {
    return "n/d"
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function issueJsonPath(issueIdentifier?: string | null) {
  return issueIdentifier ? `/api/v1/${issueIdentifier}` : "/api/v1/state"
}

export function primaryRunningIssueIdentifier(entries: RunningEntry[]) {
  return entries[0]?.issue_identifier ?? null
}

export function activeAgentCopy(agent: AgentCurrent) {
  return `${agent.source_label}. Les changements ne s'appliquent qu'aux agents lancés après ce basculement.`
}

export function agentOptionLabel(preset: AgentPreset) {
  const base = `${preset.provider_label} - ${preset.model_label}`
  return preset.available ? base : `${base} (indisponible)`
}

export function claudeBridgeBadgeLabel(status: ClaudeBridgeStatus) {
  return status.available ? "Passerelle Claude prête" : "Passerelle Claude bloquée"
}

export function claudeBridgeCopy(status: ClaudeBridgeStatus) {
  if (status.available) {
    return "Claude Code est installé et authentifié. Les profils désactivés restent inactifs tant que leurs prérequis d'exécution ne sont pas satisfaits."
  }

  return status.reason || "Statut de la passerelle Claude indisponible."
}

export function switchSuccessMessage(agent: AgentCurrent) {
  return `Basculé vers ${agent.provider_label} : les prochains agents utiliseront ${agent.model_label}.`
}

export function dashboardMode(values: DashboardCounts) {
  if (values.retrying > 0 && values.running > 0) {
    return "Stabilisation"
  }

  if (values.retrying > 0) {
    return "Récupération"
  }

  if (values.running > 0) {
    return "En direct"
  }

  return "Au repos"
}

export function dashboardModeCopy(values: DashboardCounts) {
  if (values.running === 0 && values.retrying === 0) {
    return "Aucune session active pour le moment. Le tableau de bord est prêt à suivre la prochaine orchestration."
  }

  if (values.retrying === 0) {
    return `${pluralize(values.running, "session active", "sessions actives")} en cours sans relance en attente.`
  }

  if (values.running === 0) {
    return `${pluralize(values.retrying, "issue en temporisation", "issues en temporisation")} ; aucune session en direct n'est active pour l'instant.`
  }

  return `${pluralize(values.running, "session active", "sessions actives")} avec ${pluralize(values.retrying, "issue en attente de relance", "issues en attente de relance")}.`
}

export function trackedIssueCount(values: DashboardCounts) {
  return values.running + values.retrying
}

export function trackedIssueCopy(values: DashboardCounts) {
  return `${pluralize(trackedIssueCount(values), "issue suivie", "issues suivies")} entre les sessions actives et la file de relance.`
}

function queuePressureLabel(running: number, retrying: number) {
  if (retrying >= 3) {
    return "Élevée"
  }

  if (retrying > 0) {
    return "Surveillance"
  }

  if (running > 0) {
    return "Stable"
  }

  return "Au repos"
}

export function insightItems(payload: DashboardPayload | null): InsightItem[] {
  const currentCounts = counts(payload)
  const currentTotals = totals(payload)

  return [
    {
      label: "Pression de file",
      value: queuePressureLabel(currentCounts.running, currentCounts.retrying),
      copy: `${pluralize(currentCounts.retrying, "relance", "relances")} en attente pendant que ${pluralize(currentCounts.running, "session active", "sessions actives")} restent en cours.`,
    },
    {
      label: "Issues suivies",
      value: formatInt(trackedIssueCount(currentCounts)),
      copy: "Sessions actives visibles et relances en attente dans cet instantané.",
    },
    {
      label: "Répartition des jetons",
      value: `${formatInt(currentTotals.input_tokens)} / ${formatInt(currentTotals.output_tokens)}`,
      copy: "Jetons d'entrée et de sortie accumulés jusqu'ici.",
    },
    {
      label: "Profil de quota",
      value: rateLimitProfile(payload?.rate_limits) ?? "Indisponible",
      copy: rateLimitCopy(payload?.rate_limits),
    },
  ]
}

export function completedRuntimeSeconds(payload: DashboardPayload | null) {
  return payload?.codex_totals?.seconds_running ?? 0
}

export function runtimeSecondsFromStartedAt(startedAt: string | null | undefined, now = Date.now()) {
  if (!startedAt) {
    return 0
  }

  const parsed = new Date(startedAt)
  if (Number.isNaN(parsed.valueOf())) {
    return 0
  }

  return Math.max(Math.floor((now - parsed.valueOf()) / 1000), 0)
}

export function totalRuntimeSeconds(payload: DashboardPayload | null, now = Date.now()) {
  return completedRuntimeSeconds(payload) +
    runningEntries(payload).reduce((total, entry) => total + runtimeSecondsFromStartedAt(entry.started_at, now), 0)
}

export function formatRuntimeSeconds(seconds: number | null | undefined) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return "n/d"
  }

  const whole = Math.max(Math.trunc(seconds), 0)
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${mins}m ${secs}s`
}

export function formatRuntimeAndTurns(entry: RunningEntry, now = Date.now()) {
  const runtime = formatRuntimeSeconds(runtimeSecondsFromStartedAt(entry.started_at, now))

  return entry.turn_count > 0 ? `${runtime} / ${entry.turn_count}` : runtime
}

export function stateBadgeLabel(state: string | null | undefined) {
  if (!state) {
    return "Inconnu"
  }

  const normalized = state
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .trim()

  if (normalized.length === 0) {
    return "Inconnu"
  }

  return stateTranslations[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function stateTone(state: string | null | undefined) {
  const normalized = String(state ?? "").toLowerCase()

  if (/(progress|running|active)/.test(normalized)) {
    return "positive"
  }

  if (/(blocked|error|failed)/.test(normalized)) {
    return "danger"
  }

  if (/(todo|queued|pending|retry)/.test(normalized)) {
    return "warning"
  }

  return "neutral"
}

export function rateLimitCards(rateLimits: unknown): RateLimitCard[] {
  if (!isRecord(rateLimits)) {
    return []
  }

  return [
    buildLimitCard("Fenêtre principale", lookupPath(rateLimits, [["primary"]])),
    buildLimitCard("Fenêtre secondaire", lookupPath(rateLimits, [["secondary"]])),
    buildCreditsCard(lookupPath(rateLimits, [["credits"]])),
  ].filter((card): card is RateLimitCard => Boolean(card))
}

function buildLimitCard(label: string, section: unknown) {
  if (!isRecord(section)) {
    return null
  }

  const remaining = lookupPath(section, [["remaining"]])
  const limit = lookupPath(section, [["limit"]])
  const resetSeconds = lookupPath(section, [["reset_in_seconds"]])

  const value =
    typeof remaining === "number" && typeof limit === "number"
      ? `${formatNumber(remaining)} / ${formatNumber(limit)}`
      : remaining != null
        ? formatNumber(remaining as number | string)
        : "n/d"

  const meta = [
    typeof limit === "number" ? `limite ${formatNumber(limit)}` : null,
    typeof resetSeconds === "number" ? `réinitialisation dans ${resetSeconds}s` : null,
  ]
    .filter(Boolean)
    .join(" / ")

  return {
    label,
    value,
    meta: meta || "Instantané de quota disponible.",
    tone: rateLimitTone(
      typeof remaining === "number" ? remaining : null,
      typeof limit === "number" ? limit : null
    ),
  } satisfies RateLimitCard
}

function buildCreditsCard(section: unknown) {
  if (!isRecord(section)) {
    return null
  }

  const unlimited = truthy(lookupPath(section, [["unlimited"]]))
  const hasCredits = truthy(lookupPath(section, [["has_credits"]]))
  const balance = lookupPath(section, [["balance"]])

  if (unlimited) {
    return {
      label: "Crédits",
      value: "Illimités",
      meta: "Aucun plafond de crédits fixe n'est signalé.",
      tone: "positive",
    } satisfies RateLimitCard
  }

  if (hasCredits && balance != null) {
    return {
      label: "Crédits",
      value: formatNumber(balance as number | string),
      meta: "Solde de crédits restant.",
      tone: "positive",
    } satisfies RateLimitCard
  }

  if (hasCredits) {
    return {
      label: "Crédits",
      value: "Disponibles",
      meta: "L'amont signale des crédits disponibles.",
      tone: "positive",
    } satisfies RateLimitCard
  }

  return {
    label: "Crédits",
    value: "Épuisés",
    meta: "Aucun crédit disponible ou non signalé.",
    tone: "danger",
  } satisfies RateLimitCard
}

function rateLimitTone(remaining: number | null, limit: number | null): RateLimitCard["tone"] {
  if (remaining === 0) {
    return "danger"
  }

  if (remaining != null && limit != null && limit > 0 && remaining / limit <= 0.2) {
    return "warning"
  }

  return "positive"
}

export function rateLimitProfile(rateLimits: unknown) {
  if (!isRecord(rateLimits)) {
    return null
  }

  return (lookupPath(rateLimits, [["limit_id"]]) as string | null) ||
    (rateLimitCards(rateLimits).length > 0 ? "Instantané de quota" : null)
}

export function rateLimitCopy(rateLimits: unknown) {
  if (!isRecord(rateLimits)) {
    return "Aucune donnée de quota n'a encore été signalée."
  }

  if (truthy(lookupPath(rateLimits, [["credits"], ["unlimited"]]))) {
    return "Les crédits sont annoncés comme illimités pour ce runtime."
  }

  if (isRecord(lookupPath(rateLimits, [["primary"]]))) {
    return "Les fenêtres de quota principale et secondaire sont suivies."
  }

  return "Les détails de quota sont partiels mais restent exposés dans la charge utile brute."
}

function lookupPath(value: unknown, path: string[][]): unknown {
  let current = value

  for (const keys of path) {
    if (!isRecord(current)) {
      return null
    }

    let next: unknown = null
    for (const key of keys) {
      if (key in current) {
        next = current[key]
        break
      }
    }

    if (next == null) {
      return null
    }

    current = next
  }

  return current
}

function truthy(value: unknown) {
  return value === true || value === "true" || value === 1
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`
}
