#!/usr/bin/env bash

set -euo pipefail

app_name="${1:-}"
primary_region="${2:-iad}"

if [[ -z "$app_name" ]]; then
  echo "usage: $0 <app-name> [primary-region]" >&2
  exit 1
fi

cat <<EOF
app = "${app_name}"
primary_region = "${primary_region}"
kill_signal = "SIGTERM"
kill_timeout = "30s"

[env]
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

  [[http_service.checks]]
    grace_period = "45s"
    interval = "30s"
    method = "GET"
    path = "/api/v1/state"
    timeout = "10s"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
EOF
