#!/usr/bin/env bash
# Playdate: build/refresh the CDP Chrome used to apply Supabase migrations
# via browser-use. Recreates the session-bearing profile copy from your real
# browser profile, then launches a Chrome with remote debugging on :9222.
#
# Survives /tmp wipes + reboots (the script lives in the repo; it re-copies
# the profile from ~/.config/google-chrome each run).
#
# Usage:
#   scripts/cdp-migration-tooling.sh          # rebuild + launch (or "already up")
#   scripts/cdp-migration-tooling.sh stop     # stop the CDP Chrome
#
# Once up, attach browser-use (CDP):
#   BU_CDP_URL=http://127.0.0.1:9222 browser-use <<'PY'
#   print(page_info())
#   PY

set -euo pipefail

PROFILE_SRC="${HOME}/.config/google-chrome"
PROFILE_COPY="/tmp/opencode/chrome-cdp"
PORT=9222
CHROME_BIN="/opt/google/chrome/chrome"
LOG="/tmp/chrome-cdp.log"

xruntime="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
dbus="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${xruntime}/bus}"
display="${DISPLAY:-:0}"

already_up() { curl -s --max-time 4 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; }

stop_chrome() { pkill -9 -f "google/chrom[e]" 2>/dev/null || true; }

case "${1:-}" in
  stop)
    stop_chrome; sleep 2; echo "stopped CDP Chrome"; exit 0 ;;
esac

if already_up; then
  echo "CDP Chrome already up on :${PORT} — nothing to do."
  echo "Attach:  BU_CDP_URL=http://127.0.0.1:${PORT} browser-use   (heredoc Python)"
  exit 0
fi

command -v rsync >/dev/null 2>&1 || { echo "rsync not found (needed to copy the profile)"; exit 1; }
[ -d "$PROFILE_SRC" ] || { echo "no Chrome profile at ${PROFILE_SRC}"; exit 1; }

stop_chrome; sleep 2

# Recreate the session-bearing profile copy (cookies + the Local State key).
# Cache/model dirs are excluded to keep it fast and avoid stale locks.
rm -rf "$PROFILE_COPY"
mkdir -p "$(dirname "$PROFILE_COPY")" "$PROFILE_COPY"
rsync -a \
  --exclude 'Cache' --exclude 'Code Cache' --exclude 'GPUCache' \
  --exclude 'Service Worker' --exclude 'Cache Storage' \
  --exclude 'DawnGraphiteCache' --exclude 'DawnWebGPUCache' \
  --exclude 'OptimizationHints' --exclude 'Singleton*' \
  "$PROFILE_SRC/" "$PROFILE_COPY"/

# Fully detached launch (setsid + stdio to /dev/null) so it outlives this script.
setsid env DBUS_SESSION_BUS_ADDRESS="$dbus" XDG_RUNTIME_DIR="$xruntime" DISPLAY="$display" \
  "$CHROME_BIN" --ozone-platform=wayland \
    --user-data-dir="$PROFILE_COPY" \
    --remote-debugging-port="$PORT" \
    --no-first-run --no-default-browser-check \
  >> "$LOG" 2>&1 < /dev/null &

for _ in $(seq 1 15); do
  sleep 2
  if already_up; then
    echo "CDP Chrome up on :${PORT} (profile ${PROFILE_COPY})."
    echo "Attach:  BU_CDP_URL=http://127.0.0.1:${PORT} browser-use   (heredoc Python)"
    exit 0
  fi
done
echo "CDP Chrome did not come up on :${PORT} — check ${LOG}"
exit 1