#!/bin/bash
# Installs the workbook worker on this Mac (D-200, docs/workbook-worker.md):
#   1. a dedicated checkout of Savar-G/unica-learning at $WORKER_DIR (default ~/.unica-workbook-worker), on origin/main;
#   2. the settings file ~/.config/unica/workbook-worker.env (chmod 600), from a template, if it does not exist;
#   3. the LaunchAgent ~/Library/LaunchAgents/com.unicalearning.workbook-worker.plist: starts the worker at login and
#      again when it exits or dies, logs in ~/Library/Logs/unica-workbook-worker.log.
# Run it again to update the plist (for example after node or claude moved). Uninstall:
#   launchctl bootout gui/$(id -u)/com.unicalearning.workbook-worker; rm ~/Library/LaunchAgents/com.unicalearning.workbook-worker.plist
set -euo pipefail
LABEL=com.unicalearning.workbook-worker
WORKER_DIR=${WORKER_DIR:-$HOME/.unica-workbook-worker}
ENV_FILE=$HOME/.config/unica/workbook-worker.env
PLIST=$HOME/Library/LaunchAgents/$LABEL.plist
LOG=$HOME/Library/Logs/unica-workbook-worker.log

node_bin=$(command -v node) || { echo "node is not on PATH"; exit 1; }
claude_bin=$(command -v claude) || { echo "claude (Claude Code) is not on PATH: install it and log in first"; exit 1; }
git_bin=$(command -v git)
PATH_FOR_AGENT="$(dirname "$node_bin"):$(dirname "$claude_bin"):$(dirname "$git_bin"):/usr/bin:/bin:/usr/sbin:/sbin"

# Stop the loaded service before changing its checkout, packages or plist. bootout can return while
# descendants still exit, so capture the tree first and wait for every process. Fail closed on timeout.
worker_pids=()
collect_pids() {
  local worker_pid=$1 worker_child
  worker_pids+=("$worker_pid")
  for worker_child in $(pgrep -P "$worker_pid" || true); do collect_pids "$worker_child"; done
}
if worker_info=$(launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null); then
  worker_pid=$(printf '%s\n' "$worker_info" | awk '$1 == "pid" && $2 == "=" { print $3; exit }')
  if [[ "$worker_pid" =~ ^[0-9]+$ ]]; then collect_pids "$worker_pid"; fi
  launchctl bootout "gui/$(id -u)/$LABEL"
  worker_deadline=$((SECONDS + 60))
  while true; do
    worker_alive=false
    for worker_pid in "${worker_pids[@]}"; do
      if kill -0 "$worker_pid" 2>/dev/null; then worker_alive=true; fi
    done
    if [ "$worker_alive" = false ]; then break; fi
    if [ "$SECONDS" -ge "$worker_deadline" ]; then
      echo "The old worker has not stopped. The checkout is unchanged."
      exit 1
    fi
    sleep 0.25
  done
fi

if [ ! -d "$WORKER_DIR/.git" ]; then
  echo "Cloning into $WORKER_DIR"
  gh repo clone Savar-G/unica-learning "$WORKER_DIR" -- --quiet
fi
git -C "$WORKER_DIR" fetch --quiet origin main
git -C "$WORKER_DIR" checkout --quiet --detach origin/main
(cd "$WORKER_DIR" && npm ci --no-audit --no-fund)

mkdir -p "$(dirname "$ENV_FILE")" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'ENV'
# The workbook worker's settings (docs/workbook-worker.md). Keep this file private (chmod 600).
# The Supabase secret key: leave unset to read it through the Keychain item "supabase-pagewise".
# SUPABASE_SECRET_KEY=
# The API fallback (OpenRouter). Without it, a call the subscription cannot take fails.
# OPENROUTER_API_KEY=
# subscription (default) or api: which goes first.
# WORKBOOK_AI_PRIMARY=subscription
# Which Claude account runs `claude -p`: a Claude config folder. Default: the normal ~/.claude login.
# WORKBOOK_CLAUDE_CONFIG_DIR=
ENV
  chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE: add OPENROUTER_API_KEY there for the API fallback."
fi

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$WORKER_DIR/scripts/workbook-worker.sh</string></array>
  <key>WorkingDirectory</key><string>$WORKER_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$PATH_FOR_AGENT</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>ExitTimeOut</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL. Logs: tail -f $LOG"
