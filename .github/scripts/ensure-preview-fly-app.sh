#!/usr/bin/env bash

set -euo pipefail

app_name="${1:-}"
fly_org="${2:-}"

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

log_file="$(mktemp)"
cleanup() {
  rm -f "$log_file"
}
trap cleanup EXIT

echo "Creating or confirming Fly app ${app_name} in org ${fly_org}."
set +e
run_flyctl apps create "$app_name" --machines --org "$fly_org" >"$log_file" 2>&1
status=$?
set -e

cat "$log_file"

if (( status == 0 )); then
  echo "Fly app ${app_name} is ready for deploy retries."
  exit 0
fi

if grep -Eqi 'already exists|name.*already.*taken' "$log_file"; then
  echo "Fly app ${app_name} already exists according to Fly."
  exit 0
fi

exit "$status"
