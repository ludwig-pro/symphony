#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ensure_script="${script_dir}/ensure-preview-fly-app.sh"
deploy_script="${script_dir}/deploy-preview-fly-app.sh"

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="$3"

  if [[ "$expected" != "$actual" ]]; then
    echo "assertion failed: ${message} (expected=${expected} actual=${actual})" >&2
    exit 1
  fi
}

assert_exists() {
  local path="$1"
  local message="$2"

  if [[ ! -e "$path" ]]; then
    echo "assertion failed: ${message} (${path})" >&2
    exit 1
  fi
}

assert_missing() {
  local path="$1"
  local message="$2"

  if [[ -e "$path" ]]; then
    echo "assertion failed: ${message} (${path})" >&2
    exit 1
  fi
}

increment_counter() {
  local name="$1"
  local path="${TEST_STATE_DIR:?}/${name}"
  local value

  value="$(cat "${path}" 2>/dev/null || printf '0')"
  value=$((value + 1))
  printf '%s' "${value}" > "${path}"
}

flyctl() {
  local command="${1:-}"
  local subcommand="${2:-}"
  local show_calls
  local attempts

  case "${TEST_MODE:?}:${command}:${subcommand}" in
    ensure:apps:show)
      increment_counter ensure_show_calls

      if [[ -e "${TEST_STATE_DIR}/app_exists" ]]; then
        if [[ "${TEST_SCENARIO:?}" == "create-then-visible" && -e "${TEST_STATE_DIR}/app_created" ]]; then
          show_calls="$(cat "${TEST_STATE_DIR}/ensure_show_calls")"
          if (( show_calls < 4 )); then
            return 1
          fi
        fi

        return 0
      fi

      return 1
      ;;
    ensure:apps:create)
      increment_counter ensure_create_calls
      touch "${TEST_STATE_DIR}/app_exists" "${TEST_STATE_DIR}/app_created"
      echo "created app"
      return 0
      ;;
    deploy:deploy:--app)
      increment_counter deploy_attempts
      attempts="$(cat "${TEST_STATE_DIR}/deploy_attempts")"

      case "${TEST_SCENARIO:?}" in
        eventual-consistency)
          if (( attempts < 3 )); then
            echo "Error: app not found" >&2
            return 1
          fi
          echo "deploy ok"
          return 0
          ;;
        non-retriable)
          echo "Error: unauthorized" >&2
          return 1
          ;;
        *)
          echo "unknown deploy scenario: ${TEST_SCENARIO}" >&2
          return 1
          ;;
      esac
      ;;
    *)
      echo "unexpected fake flyctl command: $*" >&2
      return 1
      ;;
  esac
}

export -f increment_counter
export -f flyctl

run_ensure_scenario() {
  local scenario="$1"
  local initial_app_state="$2"
  local expected_status="$3"
  local expected_create_calls="$4"

  local temp_dir
  local state_dir
  local status
  local create_calls

  temp_dir="$(mktemp -d)"
  state_dir="${temp_dir}/state"
  mkdir -p "${state_dir}"

  if [[ "${initial_app_state}" == "present" ]]; then
    touch "${state_dir}/app_exists"
  fi

  set +e
  TEST_MODE=ensure \
  TEST_SCENARIO="${scenario}" \
  TEST_STATE_DIR="${state_dir}" \
  FLY_APP_READY_MAX_ATTEMPTS=4 \
  FLY_APP_READY_RETRY_DELAY_SECONDS=0 \
  bash "${ensure_script}" symphony-pr-6 personal > /dev/null 2>&1
  status=$?
  set -e

  create_calls="$(cat "${state_dir}/ensure_create_calls" 2>/dev/null || printf '0')"

  assert_eq "${expected_status}" "${status}" "ensure ${scenario} exit status"
  assert_eq "${expected_create_calls}" "${create_calls}" "ensure ${scenario} create count"

  if [[ "${expected_status}" == "0" ]]; then
    assert_exists "${state_dir}/app_exists" "ensure ${scenario} should leave the app visible"
  fi

  rm -rf "${temp_dir}"
}

run_deploy_scenario() {
  local scenario="$1"
  local expected_status="$2"
  local expected_attempts="$3"

  local temp_dir
  local state_dir
  local status
  local attempts

  temp_dir="$(mktemp -d)"
  state_dir="${temp_dir}/state"
  mkdir -p "${state_dir}"

  set +e
  TEST_MODE=deploy \
  TEST_SCENARIO="${scenario}" \
  TEST_STATE_DIR="${state_dir}" \
  FLY_DEPLOY_MAX_ATTEMPTS=4 \
  FLY_DEPLOY_RETRY_DELAY_SECONDS=0 \
  bash "${deploy_script}" symphony-pr-6 .fly/preview.toml Dockerfile.preview > /dev/null 2>&1
  status=$?
  set -e

  attempts="$(cat "${state_dir}/deploy_attempts" 2>/dev/null || printf '0')"

  assert_eq "${expected_status}" "${status}" "deploy ${scenario} exit status"
  assert_eq "${expected_attempts}" "${attempts}" "deploy ${scenario} attempt count"

  rm -rf "${temp_dir}"
}

run_ensure_scenario already-exists present 0 0
run_ensure_scenario create-then-visible absent 0 1
run_deploy_scenario eventual-consistency 0 3
run_deploy_scenario non-retriable 1 1

echo "preview Fly app script tests passed"
