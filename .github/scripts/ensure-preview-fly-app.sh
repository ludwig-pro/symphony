#!/usr/bin/env bash

set -euo pipefail

app_name="${1:-}"
fly_org="${2:-}"
max_attempts="${FLY_APP_READY_MAX_ATTEMPTS:-12}"
retry_delay_seconds="${FLY_APP_READY_RETRY_DELAY_SECONDS:-5}"

if [[ -z "$app_name" || -z "$fly_org" ]]; then
  echo "usage: $0 <app-name> <fly-org>" >&2
  exit 1
fi

run_flyctl() {
  if [[ -n "${FLYCTL_RUNNER_SCRIPT:-}" ]]; then
    bash "$FLYCTL_RUNNER_SCRIPT" "$@"
    return
  fi

  flyctl "$@"
}

show_app() {
  run_flyctl apps show "$app_name" >/dev/null 2>&1
}

log_file="$(mktemp)"
cleanup() {
  rm -f "$log_file"
}
trap cleanup EXIT

if show_app; then
  echo "Fly app ${app_name} already exists."
  exit 0
fi

echo "Creating Fly app ${app_name} in org ${fly_org}."
set +e
run_flyctl apps create "$app_name" --machines --org "$fly_org" >"$log_file" 2>&1
status=$?
set -e

cat "$log_file"

if (( status != 0 )); then
  if show_app; then
    echo "Fly app ${app_name} became visible after a failed create attempt."
  elif grep -Eqi 'already exists|name.*already.*taken' "$log_file"; then
    echo "Fly app ${app_name} already exists according to Fly; waiting for visibility."
  else
    exit "$status"
  fi
fi

attempt=1
while (( attempt <= max_attempts )); do
  if show_app; then
    echo "Fly app ${app_name} is visible after create."
    exit 0
  fi

  if (( attempt == max_attempts )); then
    echo "Fly app ${app_name} did not become visible after ${max_attempts} attempts." >&2
    exit 1
  fi

  echo "Waiting for Fly app ${app_name} visibility (${attempt}/${max_attempts})..."
  sleep "$retry_delay_seconds"
  attempt=$((attempt + 1))
done
