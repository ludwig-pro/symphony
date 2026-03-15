# Symphony Elixir

This directory contains the current Elixir/OTP implementation of Symphony, based on
[`SPEC.md`](../SPEC.md) at the repository root.

> [!WARNING]
> Symphony Elixir is prototype software intended for evaluation only and is presented as-is.
> We recommend implementing your own hardened version based on `SPEC.md`.

## Screenshot

![Symphony Elixir screenshot](../.github/media/elixir-screenshot.png)

## How it works

1. Polls Linear for candidate work
2. Creates an isolated workspace per issue
3. Launches a compatible app-server command inside the workspace
4. Sends a workflow prompt to the configured coding agent
5. Keeps the coding agent working on the issue until the work is done

During app-server sessions, Symphony also serves a client-side `linear_graphql` tool so that repo
skills can make raw Linear GraphQL calls.

If a claimed issue moves to a terminal state (`Done`, `Closed`, `Cancelled`, or `Duplicate`),
Symphony stops the active agent for that issue and cleans up matching workspaces.

## How to use it

1. Make sure your codebase is set up to work well with agents: see
   [Harness engineering](https://openai.com/index/harness-engineering/).
2. Get a new personal token in Linear via Settings → Security & access → Personal API keys, and
   set it as the `LINEAR_API_KEY` environment variable.
3. Copy this directory's `WORKFLOW.md` to your repo.
4. Optionally copy the `commit`, `push`, `pull`, `land`, and `linear` skills to your repo.
   - The `linear` skill expects Symphony's `linear_graphql` app-server tool for raw Linear GraphQL
     operations such as comment editing or upload flows.
5. Customize the copied `WORKFLOW.md` file for your project.
   - To get your project's slug, right-click the project and copy its URL. The slug is part of the
     URL.
   - When creating a workflow based on this repo, note that it depends on non-standard Linear
     issue statuses: "Rework", "Human Review", and "Merging". You can customize them in
     Team Settings → Workflow in Linear.
6. Follow the instructions below to install the required runtime dependencies and start the service.

## Prerequisites

We recommend using [mise](https://mise.jdx.dev/) to manage Elixir, Erlang, and Node.js versions.

```bash
mise install
mise exec -- elixir --version
mise exec -- node --version
```

## Run

```bash
git clone https://github.com/openai/symphony
cd symphony/elixir
mise trust
mise install
mise exec -- mix setup
mise exec -- mix build
mise exec -- ./bin/symphony ./WORKFLOW.md
```

## Configuration

Pass a custom workflow file path to `./bin/symphony` when starting the service:

```bash
./bin/symphony /path/to/custom/WORKFLOW.md
```

If no path is passed, Symphony defaults to `./WORKFLOW.md`.

Optional flags:

- `--logs-root` tells Symphony to write logs under a different directory (default: `./log`)
- `--port` also starts the Phoenix observability service (default: disabled)

The `WORKFLOW.md` file uses YAML front matter for configuration, plus a Markdown body used as the
Codex session prompt.

Minimal example:

```md
---
tracker:
  kind: linear
  project_slug: "..."
workspace:
  root: ~/code/workspaces
hooks:
  after_create: |
    git clone git@github.com:your-org/your-repo.git .
agent:
  max_concurrent_agents: 10
  max_turns: 20
codex:
  command: codex app-server
---

You are working on a Linear issue {{ issue.identifier }}.

Title: {{ issue.title }} Body: {{ issue.description }}
```

Notes:

- If a value is missing, defaults are used.
- The config key remains `codex.command` because Symphony expects a Codex-compatible app-server
  process. Codex works directly; Claude Code works through the bundled Node bridge below.
- Safer Codex defaults are used when policy fields are omitted:
  - `codex.approval_policy` defaults to `{"reject":{"sandbox_approval":true,"rules":true,"mcp_elicitations":true}}`
  - `codex.thread_sandbox` defaults to `workspace-write`
  - `codex.turn_sandbox_policy` defaults to a `workspaceWrite` policy rooted at the current issue workspace
- Supported `codex.approval_policy` values depend on the targeted Codex app-server version. In the current local Codex schema, string values include `untrusted`, `on-failure`, `on-request`, and `never`, and object-form `reject` is also supported.
- Supported `codex.thread_sandbox` values: `read-only`, `workspace-write`, `danger-full-access`.
- Supported `codex.turn_sandbox_policy.type` values: `dangerFullAccess`, `readOnly`,
  `externalSandbox`, `workspaceWrite`.
- `agent.max_turns` caps how many back-to-back Codex turns Symphony will run in a single agent
  invocation when a turn completes normally but the issue is still in an active state. Default: `20`.
- If the Markdown body is blank, Symphony uses a default prompt template that includes the issue
  identifier, title, and body.
- Use `hooks.after_create` to bootstrap a fresh workspace. For a Git-backed repo, you can run
  `git clone ... .` there, along with any other setup commands you need.
- If a hook needs `mise exec` inside a freshly cloned workspace, trust the repo config and fetch
  the project dependencies in `hooks.after_create` before invoking `mise` later from other hooks.
- `tracker.api_key` reads from `LINEAR_API_KEY` when unset or when value is `$LINEAR_API_KEY`.
- For path values, `~` is expanded to the home directory.
- For env-backed path values, use `$VAR`. `workspace.root` resolves `$VAR` before path handling,
  while `codex.command` stays a shell command string and any `$VAR` expansion there happens in the
  launched shell.

```yaml
tracker:
  api_key: $LINEAR_API_KEY
workspace:
  root: $SYMPHONY_WORKSPACE_ROOT
hooks:
  after_create: |
    git clone --depth 1 "$SOURCE_REPO_URL" .
codex:
  command: "$CODEX_BIN app-server --model gpt-5.3-codex"
```

### Using Claude Code

Symphony includes an OAuth-compatible Claude Code CLI bridge at
`scripts/claude_code_cli_bridge.mjs`. The bridge launches `claude -p` directly, streams Claude's
`stream-json` output back into Symphony's JSON-RPC event model, resumes follow-up turns with
`--resume`, and forwards Symphony's `linear_graphql` tool through a bundled MCP config.

Authenticate Claude Code once before launching Symphony:

```bash
claude /login
```

Then point `codex.command` at the CLI bridge:

```yaml
codex:
  command: "node ./scripts/claude_code_cli_bridge.mjs"
  approval_policy: never
```

Bridge notes:

- `ANTHROPIC_API_KEY` is not required when you use the CLI bridge with a logged-in Claude Pro or
  Claude Max account.
- Install the Claude Code CLI separately and make sure `claude` is on `PATH`.
- The bridge runs Claude in the current issue workspace, requests `stream-json` output, and
  forwards assistant text deltas and token usage into Symphony's dashboard events.
- `LINEAR_API_KEY` is reused by the bundled `linear_graphql` MCP adapter.
- Set `SYMPHONY_CLAUDE_MODEL` to pass `--model` to Claude.
- Set `SYMPHONY_CLAUDE_ALLOWED_TOOLS` to override the default
  `Bash,Read,Edit,Write,Glob,Grep` allowlist. When `linear_graphql` is enabled, the bridge also
  includes its MCP tool name automatically.
- Set `SYMPHONY_CLAUDE_PERMISSION_MODE` to override the CLI `--permission-mode`. Otherwise,
  `codex.approval_policy: never` maps to `bypassPermissions`.
- Set `SYMPHONY_LINEAR_ENDPOINT` if your Linear GraphQL endpoint differs from
  `https://api.linear.app/graphql`.

If you still need the legacy SDK-based bridge that imports `@anthropic-ai/claude-agent-sdk` and
expects `ANTHROPIC_API_KEY`, it remains available at `scripts/claude_code_app_server.mjs`.

- If `WORKFLOW.md` is missing or has invalid YAML, startup and scheduling are halted until fixed.
- `server.port` or CLI `--port` enables the optional Phoenix dashboard service and JSON API at
  `/`, `/api/v1/state`, `/api/v1/<issue_identifier>`, and `/api/v1/refresh`.

## Web dashboard

The observability UI now runs on a minimal Phoenix stack:

- React + TypeScript SPA at `/`, built from [`assets/`](./assets) with Vite, Tailwind CSS v4,
  and `shadcn/ui`
- JSON API for operational debugging under `/api/v1/*`
- Bandit as the HTTP server
- Static dashboard assets emitted to `priv/static/dashboard`

For local UI work:

```bash
cd elixir
./scripts/dashboard
```

Useful shortcuts:

```bash
cd elixir
./scripts/dashboard
./scripts/dashboard watch
./scripts/dashboard test
./scripts/dashboard run --workflow ./WORKFLOW.md --port 8080
```

`./scripts/dashboard` defaults to `WORKFLOW.preview.md`, builds the React bundle, rebuilds the
Symphony escript, and starts the dashboard on `http://localhost:4000/`.

Build and test commands still compile the dashboard bundle automatically before the Elixir steps:

```bash
mise exec -- mix build
mise exec -- mix test
```

## Pull request previews

Hosted preview deployments for pull requests are documented in
[`docs/preview-deployments.md`](docs/preview-deployments.md). The preview path
deploys the Phoenix dashboard and `/api/v1/state` to a per-PR Fly app and
posts the URL back into the pull request review flow.

## Project Layout

- `lib/`: application code and Mix tasks
- `test/`: ExUnit coverage for runtime behavior
- `WORKFLOW.md`: in-repo workflow contract used by local runs
- `../.codex/`: repository-local Codex skills and setup helpers

## Testing

```bash
make all
```

## FAQ

### Why Elixir?

Elixir is built on Erlang/BEAM/OTP, which is great for supervising long-running processes. It has an
active ecosystem of tools and libraries. It also supports hot code reloading without stopping
actively running subagents, which is very useful during development.

### What's the easiest way to set this up for my own codebase?

Launch `codex` in your repo, give it the URL to the Symphony repo, and ask it to set things up for
you.

## License

This project is licensed under the [Apache License 2.0](../LICENSE).
