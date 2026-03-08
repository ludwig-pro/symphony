# Pull Request Preview Deployments

Symphony pull requests can publish a hosted preview of the Phoenix observability
dashboard so reviewers can inspect UI changes without checking out the branch
locally.

## Chosen target

- Platform: Fly.io Machines
- Isolation model: one Fly app per pull request, named
  `<prefix>-pr-<number>`
- Review surface: the Phoenix dashboard at `/` plus the JSON payload at
  `/api/v1/state`

Fly is a good fit here because the Elixir app already runs as a single HTTP
process, and a per-PR app gives reviewers a stable URL that behaves like a
typical preview deployment.

## Safety model

The preview workflow intentionally runs on GitHub's `pull_request` event rather
than `pull_request_target`.

- `pull_request` keeps repository secrets away from untrusted fork code.
- Automatic preview deploys therefore run only for pull requests whose head
  branch lives in this repository.
- Fork pull requests use the documented manual fallback below when a hosted
  preview is still needed.

The deployed app uses [`WORKFLOW.preview.md`](../WORKFLOW.preview.md), which
switches Symphony to the in-memory tracker. That keeps the dashboard and
`/api/v1/state` bootable without repository, Linear, or Codex credentials.

## Required repository configuration

Configure these values in GitHub before expecting previews to deploy:

- Secret: `FLY_API_TOKEN`
  - Token used by `flyctl` to create, update, and destroy per-PR apps.
- Repository variable: `SYMPHONY_PREVIEW_FLY_ORG`
  - Fly organization slug that should own preview apps.

Optional repository variables:

- `SYMPHONY_PREVIEW_APP_PREFIX`
  - Prefix for app names. Defaults to the repository name after slugging.
- `SYMPHONY_PREVIEW_FLY_REGION`
  - Fly primary region. Defaults to `iad`.

No Linear, GitHub, Codex, or production application secrets are required for
the preview runtime itself.

## What the workflow does

The GitHub Actions workflow at
[`/.github/workflows/preview-deploy.yml`](../../.github/workflows/preview-deploy.yml)
handles the lifecycle:

1. Derive a deterministic Fly app name from the pull request number.
2. Build `Dockerfile.preview`, which packages the Elixir app plus
   `WORKFLOW.preview.md`.
3. Create or update the Fly app for that pull request.
4. Smoke-check `/` and `/api/v1/state`.
5. Update a stable PR comment with the preview URL and reviewer checklist.
6. Destroy the Fly app when the pull request closes.

## Manual one-command fallback

Automatic deploys are skipped for fork pull requests because repository secrets
are unavailable on `pull_request`. Maintainers can still trigger a hosted
preview from the base repository with one command:

```bash
gh workflow run preview-deploy.yml \
  --ref main \
  -f pr_number=<PR_NUMBER> \
  -f git_ref=refs/pull/<PR_NUMBER>/head
```

That dispatch path reuses the same app naming, smoke checks, and PR comment
update as the automatic path.

## Reviewer validation checklist

When a preview comment appears on the pull request:

- Open the dashboard URL and verify the page renders the PR's UI changes.
- Click or open `/api/v1/state` and confirm it returns HTTP 200 JSON.
- Confirm the dashboard chrome and the state payload both represent the same
  idle/runtime state.
- If the change touches API wiring or links, verify the dashboard's `State API`
  affordance still points at the deployed preview host.

## Local sanity checks

These commands are useful before pushing preview workflow changes:

```bash
.github/scripts/preview-fly-app-name.sh symphony 123
.github/scripts/render-preview-fly-toml.sh symphony-pr-123 iad
cd elixir && make fmt-check test
```
