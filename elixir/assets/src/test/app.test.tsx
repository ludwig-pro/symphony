import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"

const baseAgent = {
  current: {
    id: "workflow-default",
    provider: "codex",
    provider_label: "Codex",
    model_label: "Configuré dans WORKFLOW.md",
    label: "Workflow par défaut - Codex",
    source_label: "Workflow par défaut",
  },
  presets: [
    {
      id: "workflow-default",
      provider: "codex",
      provider_label: "Codex",
      model_label: "Configuré dans WORKFLOW.md",
      label: "Workflow par défaut - Codex",
      available: true,
      selected: true,
    },
    {
      id: "claude-sonnet",
      provider: "claude_code",
      provider_label: "Claude Code",
      model_label: "claude-sonnet-4-6",
      label: "Claude Code - claude-sonnet-4-6",
      available: true,
      selected: false,
    },
  ],
  claude_bridge: {
    available: true,
    authenticated: true,
    installed: true,
    node_available: true,
    code: "ready",
    reason: null,
  },
}

const baseSnapshot = {
  agent: baseAgent,
  generated_at: "2026-03-14T18:00:00Z",
  counts: {
    running: 1,
    retrying: 1,
  },
  running: [
    {
      issue_id: "issue-http",
      issue_identifier: "MT-HTTP",
      state: "In Progress",
      session_id: "thread-http",
      turn_count: 7,
      last_event: "notification",
      last_message: "rendered",
      started_at: "2026-03-14T17:58:00Z",
      last_event_at: "2026-03-14T18:00:00Z",
      tokens: {
        input_tokens: 4,
        output_tokens: 8,
        total_tokens: 12,
      },
    },
  ],
  retrying: [
    {
      issue_id: "issue-retry",
      issue_identifier: "MT-RETRY",
      attempt: 2,
      due_at: "2026-03-14T18:01:00Z",
      error: "timeout",
    },
  ],
  codex_totals: {
    input_tokens: 4,
    output_tokens: 8,
    total_tokens: 12,
    seconds_running: 42.5,
  },
  rate_limits: {
    primary: {
      remaining: 11,
      limit: 20,
      reset_in_seconds: 48,
    },
    credits: {
      has_credits: true,
      balance: 7,
    },
  },
}

const pullRequestsSnapshot = {
  generated_at: "2026-03-22T12:00:00Z",
  filters: {
    provider: "all",
    bucket: "created",
    state: "open",
  },
  providers: {
    github: {
      available: true,
      authenticated: true,
      supported: true,
      supported_buckets: ["created", "assigned", "mentioned", "review_requested"],
      warning: null,
      error: null,
    },
    gitlab: {
      available: true,
      authenticated: true,
      supported: true,
      supported_buckets: ["created", "assigned", "review_requested"],
      warning: null,
      error: null,
    },
  },
  items: [
    {
      provider: "gitlab",
      id: "501",
      number: 17,
      reference: "!17",
      repository: "acme/platform",
      title: "feat: wire gitlab merge requests",
      url: "https://gitlab.com/acme/platform/-/merge_requests/17",
      author: {
        login: "gitlab-ludwig",
        display_name: "GitLab Ludwig",
        url: "https://gitlab.com/gitlab-ludwig",
      },
      assignees: [],
      reviewers: [
        {
          login: "reviewer-1",
          display_name: "Reviewer One",
          url: "https://gitlab.com/reviewer-1",
        },
      ],
      state: "open",
      is_draft: false,
      created_at: "2026-03-21T12:00:00Z",
      updated_at: "2026-03-22T12:00:00Z",
    },
    {
      provider: "github",
      id: "PR_kwDOAA",
      number: 7,
      reference: "#7",
      repository: "acme/web",
      title: "feat: ship dashboard PR page",
      url: "https://github.com/acme/web/pull/7",
      author: {
        login: "ludwig-pro",
        display_name: "ludwig-pro",
        url: "https://github.com/ludwig-pro",
      },
      assignees: [
        {
          login: "ludwig-pro",
          display_name: "Ludwig",
          url: "https://github.com/ludwig-pro",
        },
      ],
      reviewers: [],
      state: "open",
      is_draft: false,
      created_at: "2026-03-21T09:00:00Z",
      updated_at: "2026-03-22T10:00:00Z",
    },
  ],
  total_count: 2,
}

const pullRequestsUnsupportedSnapshot = {
  generated_at: "2026-03-22T12:10:00Z",
  filters: {
    provider: "gitlab",
    bucket: "mentioned",
    state: "open",
  },
  providers: {
    github: {
      available: false,
      authenticated: false,
      supported: true,
      supported_buckets: ["created", "assigned", "mentioned", "review_requested"],
      warning: null,
      error: null,
    },
    gitlab: {
      available: false,
      authenticated: true,
      supported: false,
      supported_buckets: ["created", "assigned", "review_requested"],
      warning: "GitLab ne prend pas encore en charge le filtre Mentioned dans cette V1.",
      error: null,
    },
  },
  items: [],
  total_count: 0,
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...init?.headers,
      },
    })
  )
}

describe("dashboard app", () => {
  beforeEach(() => {
    vi.useRealTimers()
    window.history.replaceState({}, "", "/")
  })

  afterEach(() => {
    vi.useRealTimers()
    window.history.replaceState({}, "", "/")
  })

  it("renders KPI cards, session table, retry queue, and agent controls", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/v1/state") {
        return jsonResponse(baseSnapshot)
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    vi.stubGlobal("fetch", fetchMock)

    render(<App />)

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)

    await screen.findByText("MT-HTTP")

    expect(screen.getByText("Tableau de bord des opérations")).toBeInTheDocument()
    expect(screen.getByText("Passerelle Claude prête")).toBeInTheDocument()
    expect(screen.getByText("Tentative 2")).toBeInTheDocument()
    expect(screen.getByText("Fenêtre principale")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/state",
      expect.objectContaining({
        headers: { accept: "application/json" },
      })
    )
  })

  it("renders the empty-state copy when there are no running or retrying issues", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input) === "/api/v1/state") {
          return jsonResponse({
            ...baseSnapshot,
            counts: { running: 0, retrying: 0 },
            running: [],
            retrying: [],
          })
        }

        throw new Error(`Unexpected request: ${String(input)}`)
      })
    )

    render(<App />)

    expect(await screen.findByText("Aucune session active.")).toBeInTheDocument()
    expect(
      screen.getByText("Aucune issue n'est actuellement en temporisation.")
    ).toBeInTheDocument()
  })

  it("surfaces backend snapshot errors in the shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input) === "/api/v1/state") {
          return jsonResponse({
            agent: baseAgent,
            generated_at: "2026-03-14T18:00:00Z",
            error: {
              code: "snapshot_unavailable",
              message: "Instantané indisponible",
            },
          })
        }

        throw new Error(`Unexpected request: ${String(input)}`)
      })
    )

    render(<App />)

    expect(await screen.findByText("Instantané indisponible")).toBeInTheDocument()
    expect(screen.getByText(/snapshot_unavailable/)).toBeInTheDocument()
  })

  it("posts the selected agent preset and shows a success toast", async () => {
    const updatedAgent = {
      ...baseAgent,
      current: {
        id: "claude-sonnet",
        provider: "claude_code",
        provider_label: "Claude Code",
        model_label: "claude-sonnet-4-6",
        label: "Claude Code - claude-sonnet-4-6",
        source_label: "Surcharge d'exécution",
      },
      presets: baseAgent.presets.map((preset) => ({
        ...preset,
        selected: preset.id == "claude-sonnet",
      })),
    }

    let stateRequestCount = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)

      if (url === "/api/v1/state") {
        stateRequestCount += 1

        return jsonResponse({
          ...baseSnapshot,
          agent: stateRequestCount === 1 ? baseAgent : updatedAgent,
        })
      }

      if (url === "/api/v1/config/agent") {
        return jsonResponse(updatedAgent)
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    vi.stubGlobal("fetch", fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await screen.findByText("MT-HTTP")

    await user.click(
      screen.getByRole("combobox", {
        name: "Sélectionner un profil d'agent",
      })
    )
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}")

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/config/agent",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ preset_id: "claude-sonnet" }),
        })
      )
    })

    expect(
      await screen.findByText(
        "Basculé vers Claude Code : les prochains agents utiliseront claude-sonnet-4-6."
      )
    ).toBeInTheDocument()
  })

  it("navigates between dashboard pages from the drawer", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/v1/state") {
        return jsonResponse(baseSnapshot)
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    vi.stubGlobal("fetch", fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await screen.findByText("MT-HTTP")

    await user.click(screen.getByRole("link", { name: "Sessions actives" }))

    expect(await screen.findByRole("heading", { name: "Sessions actives" })).toBeInTheDocument()
    expect(window.location.pathname).toBe("/sessions")
    expect(screen.queryByText("Quotas amont")).not.toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "Contrôle agent" }))

    expect(await screen.findByRole("heading", { name: "Contrôle agent" })).toBeInTheDocument()
    expect(window.location.pathname).toBe("/agents")
    expect(screen.queryByText("Issues en attente")).not.toBeInTheDocument()
  })

  it("loads pull requests only when the page is active and refetches when filters change", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)

      if (url === "/api/v1/state") {
        return jsonResponse(baseSnapshot)
      }

      if (
        url ===
        "/api/v1/pull-requests?provider=all&bucket=created&state=open"
      ) {
        return jsonResponse(pullRequestsSnapshot)
      }

      if (
        url ===
        "/api/v1/pull-requests?provider=gitlab&bucket=created&state=open"
      ) {
        return jsonResponse({
          ...pullRequestsSnapshot,
          filters: {
            provider: "gitlab",
            bucket: "created",
            state: "open",
          },
          items: pullRequestsSnapshot.items.filter(
            (item) => item.provider === "gitlab",
          ),
          total_count: 1,
        })
      }

      if (
        url ===
        "/api/v1/pull-requests?provider=gitlab&bucket=mentioned&state=open"
      ) {
        return jsonResponse(pullRequestsUnsupportedSnapshot)
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    vi.stubGlobal("fetch", fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await screen.findByText("MT-HTTP")

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/pull-requests"),
      expect.anything(),
    )

    await user.click(screen.getByRole("link", { name: "Pull Requests" }))

    expect(
      await screen.findByRole("heading", { name: "Pull Requests" }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("feat: ship dashboard PR page"),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/pull-requests?provider=all&bucket=created&state=open",
        expect.objectContaining({
          headers: { accept: "application/json" },
        }),
      )
    })

    await user.click(screen.getByRole("button", { name: "GitLab" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/pull-requests?provider=gitlab&bucket=created&state=open",
        expect.objectContaining({
          headers: { accept: "application/json" },
        }),
      )
    })

    await user.click(screen.getByRole("button", { name: "Mentioned" }))

    expect(
      await screen.findByText(
        "GitLab ne prend pas encore en charge le filtre Mentioned dans cette V1.",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Aucune pull request ou merge request ne correspond aux filtres courants.",
      ),
    ).toBeInTheDocument()
  })

  it("does not issue concurrent polling requests and aborts on unmount", async () => {
    vi.useFakeTimers()

    let resolveResponse: (value: Response) => void = () => {}
    let capturedSignal: AbortSignal | undefined

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal | undefined

      return new Promise<Response>((resolve) => {
        resolveResponse = resolve
      })
    })

    vi.stubGlobal("fetch", fetchMock)

    const view = render(<App />)

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2_500)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(capturedSignal?.aborted).toBe(true)

    resolveResponse(new Response(JSON.stringify(baseSnapshot), { status: 200 }))
    await vi.advanceTimersByTimeAsync(2_500)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
