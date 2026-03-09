#!/usr/bin/env bash

set -euo pipefail

app_name="${1:-}"
config_path="${2:-}"
dockerfile_path="${3:-}"
max_attempts="${FLY_DEPLOY_MAX_ATTEMPTS:-4}"
retry_delay_seconds="${FLY_DEPLOY_RETRY_DELAY_SECONDS:-5}"

if [[ -z "$app_name" || -z "$config_path" || -z "$dockerfile_path" ]]; then
  echo "usage: $0 <app-name> <config-path> <dockerfile-path>" >&2
  exit 1
fi

run_flyctl() {
  if [[ -n "${FLYCTL_RUNNER_SCRIPT:-}" ]]; then
    bash "$FLYCTL_RUNNER_SCRIPT" "$@"
    return
  fi

  flyctl "$@"
}

log_file="$(mktemp)"
cleanup() {
  rm -f "$log_file"
}
trap cleanup EXIT

attempt=1
while (( attempt <= max_attempts )); do
  echo "Starting Fly deploy attempt ${attempt}/${max_attempts} for ${app_name}."

  set +e
  run_flyctl deploy \
    --app "$app_name" \
    --config "$config_path" \
    --dockerfile "$dockerfile_path" \
    --ha=false \
    --remote-only \
    --strategy immediate \
    >"$log_file" 2>&1
  status=$?
  set -e

  cat "$log_file"

  if (( status == 0 )); then
    exit 0
  fi

  if ! grep -q "Error: app not found" "$log_file"; then
    exit "$status"
  fi

  if (( attempt == max_attempts )); then
    echo "Fly deploy still reports app not found after ${max_attempts} attempts." >&2
    exit "$status"
  fi

  echo "Fly app ${app_name} is not deployable yet; retrying in ${retry_delay_seconds}s." >&2
  sleep "$retry_delay_seconds"
  : >"$log_file"
  attempt=$((attempt + 1))
done
