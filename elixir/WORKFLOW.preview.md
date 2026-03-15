---
tracker:
  kind: memory
polling:
  interval_ms: 30000
workspace:
  root: /tmp/symphony-preview-workspaces
agent:
  max_concurrent_agents: 1
  max_turns: 1
codex:
  command: codex app-server
  approval_policy: never
observability:
  dashboard_enabled: true
  refresh_ms: 1000
server:
  host: 0.0.0.0
---

You are running the hosted Symphony preview environment.

This workflow intentionally uses the in-memory tracker so the Phoenix dashboard
and `/api/v1/state` boot without repository, Linear, or Codex credentials.
