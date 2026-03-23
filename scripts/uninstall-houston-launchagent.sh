#!/usr/bin/env bash
set -euo pipefail

LABELS=("ai.broxson.houston" "ai.broxson.houston.web" "ai.broxson.houston.worker" "com.broxson.houston")

for LABEL in "${LABELS[@]}"; do
  launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
  launchctl disable "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
  rm -f "$HOME/Library/LaunchAgents/${LABEL}.plist"
done

echo "Uninstalled Houston LaunchAgents"
