#!/usr/bin/env bash

set -euo pipefail

prefix="${1:-}"
pr_number="${2:-}"

if [[ -z "$pr_number" ]]; then
  echo "usage: $0 <prefix> <pr-number>" >&2
  exit 1
fi

if [[ -z "$prefix" ]]; then
  prefix="symphony"
fi

sanitize() {
  tr '[:upper:]_' '[:lower:]-' \
    | tr -cd 'a-z0-9-' \
    | sed -E 's/^-+//; s/-+$//; s/-+/-/g'
}

suffix="pr-${pr_number}"
max_length=30
separator="-"
max_prefix_length=$((max_length - ${#suffix} - ${#separator}))

if (( max_prefix_length < 3 )); then
  echo "preview prefix budget exhausted for suffix ${suffix}" >&2
  exit 1
fi

sanitized_prefix="$(printf '%s' "$prefix" | sanitize)"
trimmed_prefix="${sanitized_prefix:0:max_prefix_length}"
trimmed_prefix="$(printf '%s' "$trimmed_prefix" | sed -E 's/-+$//')"

if [[ -z "$trimmed_prefix" ]]; then
  trimmed_prefix="sym"
fi

echo "${trimmed_prefix}${separator}${suffix}"
