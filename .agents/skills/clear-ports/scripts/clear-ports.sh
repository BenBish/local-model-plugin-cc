#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: clear-ports.sh [--dry-run] [--force] [--include-pattern TEXT] PORT...

Stops processes listening on the given TCP ports and their child processes.
Optional command substrings add explicitly related orphan processes.

Examples:
  clear-ports.sh --dry-run 3000 5173
  clear-ports.sh 3000 5173
  clear-ports.sh --force --include-pattern "bun run dev" 3000
USAGE
}

dry_run=false
force=false
patterns=()
ports=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=true
      shift
      ;;
    --force)
      force=true
      shift
      ;;
    --include-pattern)
      if [[ $# -lt 2 ]]; then
        echo "error: --include-pattern requires a value" >&2
        exit 2
      fi
      patterns+=("$2")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        ports+=("$1")
        shift
      done
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      ports+=("$1")
      shift
      ;;
  esac
done

if [[ ${#ports[@]} -eq 0 ]]; then
  echo "error: provide at least one port" >&2
  usage >&2
  exit 2
fi

for port in "${ports[@]}"; do
  if ! [[ "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
    echo "error: invalid port: $port" >&2
    exit 2
  fi
done

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

pids_for_port() {
  local port="$1"
  if has_cmd lsof; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  elif has_cmd fuser; then
    fuser -n tcp "$port" 2>/dev/null | tr ' ' '\n' || true
  else
    echo "error: install lsof or fuser to discover port listeners" >&2
    exit 3
  fi
}

children_of() {
  local pid="$1"
  local child
  if ! has_cmd pgrep; then
    return 0
  fi
  while read -r child; do
    [[ -z "$child" ]] && continue
    echo "$child"
    children_of "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
}

command_for_pid() {
  local pid="$1"
  if [[ -r "/proc/$pid/cmdline" ]]; then
    tr '\0' ' ' < "/proc/$pid/cmdline" | sed 's/[[:space:]]*$//'
  else
    ps -p "$pid" -o command= 2>/dev/null || true
  fi
}

all_processes() {
  if has_cmd ps; then
    ps -eo pid=,command= -u "$(id -u)" 2>/dev/null || true
  else
    echo "error: ps is required to match command patterns" >&2
    exit 3
  fi
}

add_pid() {
  local pid="$1"
  [[ -z "$pid" ]] && return 0
  [[ "$pid" == "$$" ]] && return 0
  [[ "$pid" == "$PPID" ]] && return 0
  if kill -0 "$pid" 2>/dev/null; then
    target_pids["$pid"]=1
  fi
}

declare -A target_pids=()
declare -A port_for_pid=()

for port in "${ports[@]}"; do
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    add_pid "$pid"
    port_for_pid["$pid"]="$port"
    while read -r child; do
      add_pid "$child"
      port_for_pid["$child"]="${port_for_pid[$child]:-$port}"
    done < <(children_of "$pid")
  done < <(pids_for_port "$port")
done

if [[ ${#patterns[@]} -gt 0 ]]; then
  for pattern in "${patterns[@]}"; do
    while read -r pid command_line; do
      [[ -z "$pid" || -z "$command_line" ]] && continue
      [[ "$command_line" == *"$pattern"* ]] || continue
      add_pid "$pid"
    done < <(all_processes)
  done
fi

if [[ ${#target_pids[@]} -eq 0 ]]; then
  echo "No matching processes found for ports: ${ports[*]}"
  exit 0
fi

echo "Target processes:"
for pid in "${!target_pids[@]}"; do
  port_label="${port_for_pid[$pid]:-pattern}"
  command_line="$(command_for_pid "$pid")"
  printf '  pid=%s port=%s command=%s\n' "$pid" "$port_label" "${command_line:-unknown}"
done | sort -n -k1.7

if [[ "$dry_run" == true ]]; then
  echo "Dry run only; no processes stopped."
  exit 0
fi

signal="TERM"
if [[ "$force" == true ]]; then
  signal="KILL"
fi

for pid in "${!target_pids[@]}"; do
  kill "-$signal" "$pid" 2>/dev/null || true
done

if [[ "$force" == false ]]; then
  sleep 2
  survivors=()
  for pid in "${!target_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      survivors+=("$pid")
    fi
  done
  if [[ ${#survivors[@]} -gt 0 ]]; then
    echo "Still running after SIGTERM:"
    printf '  %s\n' "${survivors[@]}" | sort -n
    echo "Rerun with --force to send SIGKILL."
    exit 1
  fi
fi

echo "Stopped ${#target_pids[@]} process(es)."

remaining=0
for port in "${ports[@]}"; do
  listeners="$(pids_for_port "$port" | paste -sd ' ' -)"
  if [[ -n "$listeners" ]]; then
    echo "Port $port still has listener PID(s): $listeners"
    remaining=1
  else
    echo "Port $port is clear."
  fi
done

exit "$remaining"
