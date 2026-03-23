#!/usr/bin/env bash
set -euo pipefail

LABEL_WEB="ai.broxson.houston.web"
LABEL_WORKER="ai.broxson.houston.worker"
PLIST_WEB="$HOME/Library/LaunchAgents/${LABEL_WEB}.plist"
PLIST_WORKER="$HOME/Library/LaunchAgents/${LABEL_WORKER}.plist"
LOG_DIR="$HOME/.openclaw/workspace/state"
OUT_LOG_WEB="$LOG_DIR/houston-web-launchd.out.log"
ERR_LOG_WEB="$LOG_DIR/houston-web-launchd.err.log"
OUT_LOG_WORKER="$LOG_DIR/houston-worker-launchd.out.log"
ERR_LOG_WORKER="$LOG_DIR/houston-worker-launchd.err.log"
ROOT_DIR="/Users/openclaw/projects/houston-fork"

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$PLIST_WEB")"

cd "$ROOT_DIR"
npm run build >/dev/null

cat > "$PLIST_WEB" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL_WEB}</string>

    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>-lc</string>
      <string>cd ${ROOT_DIR}; export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin; npx dotenv -e .env -- npm run start -w packages/web</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>WorkingDirectory</key>
    <string>${ROOT_DIR}</string>

    <key>StandardOutPath</key>
    <string>${OUT_LOG_WEB}</string>

    <key>StandardErrorPath</key>
    <string>${ERR_LOG_WEB}</string>
  </dict>
</plist>
EOF

cat > "$PLIST_WORKER" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL_WORKER}</string>

    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>-lc</string>
      <string>cd ${ROOT_DIR}; export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin; npx dotenv -e .env -- npm run start -w packages/worker</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>WorkingDirectory</key>
    <string>${ROOT_DIR}</string>

    <key>StandardOutPath</key>
    <string>${OUT_LOG_WORKER}</string>

    <key>StandardErrorPath</key>
    <string>${ERR_LOG_WORKER}</string>
  </dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/ai.broxson.houston" >/dev/null 2>&1 || true
launchctl disable "gui/$(id -u)/ai.broxson.houston" >/dev/null 2>&1 || true
rm -f "$HOME/Library/LaunchAgents/ai.broxson.houston.plist"

for label in "$LABEL_WEB" "$LABEL_WORKER"; do
  launchctl bootout "gui/$(id -u)/${label}" >/dev/null 2>&1 || true
done

launchctl enable "gui/$(id -u)/${LABEL_WEB}" >/dev/null 2>&1 || true
launchctl enable "gui/$(id -u)/${LABEL_WORKER}" >/dev/null 2>&1 || true

launchctl bootstrap "gui/$(id -u)" "$PLIST_WEB"
launchctl bootstrap "gui/$(id -u)" "$PLIST_WORKER"
launchctl kickstart -k "gui/$(id -u)/${LABEL_WEB}"
launchctl kickstart -k "gui/$(id -u)/${LABEL_WORKER}"

echo "Installed and started LaunchAgents: ${LABEL_WEB}, ${LABEL_WORKER}"
echo "plist web: ${PLIST_WEB}"
echo "plist worker: ${PLIST_WORKER}"
echo "stdout web: ${OUT_LOG_WEB}"
echo "stderr web: ${ERR_LOG_WEB}"
echo "stdout worker: ${OUT_LOG_WORKER}"
echo "stderr worker: ${ERR_LOG_WORKER}"
