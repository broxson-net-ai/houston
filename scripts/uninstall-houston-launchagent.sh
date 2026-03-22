#!/usr/bin/env bash
set -euo pipefail

LABEL="ai.broxson.houston"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
launchctl disable "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "Uninstalled LaunchAgent: ${LABEL}"
