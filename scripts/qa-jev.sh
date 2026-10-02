#!/usr/bin/env bash
# Playdate: run a Jev "fresh-eyes" QA pass against the LIVE site after a ship.
#
# Jev (browser-use/jev-ultrafast) is a browser agent that gives a fresh,
# logged-out browser a narrow natural-language goal and reports done / blocked.
# It is the cheap "did the ship break the front door" check — a human-eyes
# stand-in that runs the moment code goes live.
#
# This script is the whole runbook (durable, idempotent):
#   1. bootstrap a pinned jev-ultrafast clone under .qa/jev (gitignored),
#      re-apply the tracked model.py fix (scripts/qa-jev.patch) over it, uv sync
#   2. regenerate the clone's .env from ~/.typesafe_key + .qa/ninfer.env
#   3. launch a clean, persistent Chrome with CDP on :9333 (detached; survives
#      this script and /tmp wipes — the profile lives in .qa/)
#   4. run one Jev pass on the target URL and print a verdict + exit code
#
# Usage:
#   scripts/qa-jev.sh                       # full run on the default live target
#   scripts/qa-jev.sh --url <u> --goal '<g>'  # a different target / goal
#   scripts/qa-jev.sh --fresh                # wipe the clean Chrome profile first
#   scripts/qa-jev.sh --prep                 # bootstrap + launch Chrome only (attach)
#   scripts/qa-jev.sh stop                   # stop the QA Chrome
#
# Exit codes: 0 = PASS (done) · 1 = BLOCKED · 2 = error/exception · 3 = inconclusive
#
# Keys never leave the box: the TypeSafe key comes from ~/.typesafe_key, the NInfer
# key from .qa/ninfer.env (both 600, both gitignored). The clone + venv + profile
# are all under .qa/ and are gitignored.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_DIR="$REPO/.qa"
JEV_DIR="$QA_DIR/jev"
NINFER_ENV="$QA_DIR/ninfer.env"

# Pinned jev-ultrafast commit (the spike's working tree). Bump + re-bootstrap when
# upstream moves; the patch below is the only local delta.
PIN="452c1ad2dd628008f1d5608f28158d76e49e6cc0"
REMOTE="https://github.com/browser-use/jev-ultrafast"

# Dedicated CDP port — 9333, NOT 9222 (that belongs to scripts/cdp-migration-tooling.sh).
PORT=9333
PROFILE="$QA_DIR/chrome-9333"
CHROME_BIN="/opt/google/chrome/chrome"
LOG="$QA_DIR/chrome-9333.log"

# Default target: the ONE page Jev can verify without credentials. "/" is gated
# behind auth and Jev correctly BLOCKs there, so the default lands on /login.
DEFAULT_URL="https://drop-in-mu.vercel.app/login"
DEFAULT_GOAL="Confirm this is the Drop In sign-in screen: the email field and a way to sign in (a Continue/Sign in button) are visible."

URL=""
GOAL=""
FRESH=0
PREP=0
STOP=0

prev=""
for a in "$@"; do
  case "$prev" in
    --url)  URL="$a" ;;
    --goal) GOAL="$a" ;;
  esac
  case "$a" in
    stop)    STOP=1 ;;
    --prep)  PREP=1 ;;
    --fresh) FRESH=1 ;;
  esac
  prev="$a"
done
URL="${URL:-$DEFAULT_URL}"
GOAL="${GOAL:-$DEFAULT_GOAL}"

xruntime="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
dbus="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${xruntime}/bus}"
display="${DISPLAY:-:0}"
wld="${WAYLAND_DISPLAY:-}"

already_up() { curl -s --max-time 4 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; }
# Kill only THIS QA Chrome (matches the unique profile dir); the [3] bracket stops the
# pattern from matching this very pkill. Never touches the :9222 migration Chrome.
stop_qa_chrome() { pkill -9 -f "chrome-933[3]" 2>/dev/null || true; }

if [ "$STOP" = "1" ]; then
  stop_qa_chrome; sleep 2; echo "stopped the QA Chrome (:${PORT})"; exit 0
fi

# ---------------------------------------------------------------- bootstrap
bootstrap() {
  if [ ! -f "$NINFER_ENV" ]; then
    echo "missing $NINFER_ENV — create it (NINFER_KEY / NINFER_BASE_URL / NINFER_MODEL)"; exit 2
  fi
  if [ ! -d "$JEV_DIR/.git" ] || [ "$(cat "$JEV_DIR/.pinned" 2>/dev/null || true)" != "$PIN" ]; then
    echo "bootstrapping jev-ultrafast @ ${PIN:0:7} -> $JEV_DIR"
    rm -rf "$JEV_DIR"
    git clone --quiet "$REMOTE" "$JEV_DIR"
    git -C "$JEV_DIR" checkout --quiet "$PIN"
    echo "$PIN" > "$JEV_DIR/.pinned"
  fi
  # Re-apply the tracked model.py fix (idempotent: skip if already applied).
  if git -C "$JEV_DIR" apply --check "$REPO/scripts/qa-jev.patch" 2>/dev/null; then
    git -C "$JEV_DIR" apply "$REPO/scripts/qa-jev.patch"
    echo "applied qa-jev.patch (response_format guard)"
  else
    echo "qa-jev.patch already applied"
  fi
  echo "uv sync"
  ( cd "$JEV_DIR" && uv sync --quiet )

  # Regenerate the clone's .env from the two gitignored key sources + the CDP target.
  . "$NINFER_ENV"
  {
    echo "TYPESAFE_API_KEY=$(cat ~/.typesafe_key)"
    echo "TYPESAFE_MODEL=jev-latest"
    echo "TEXT_MODEL_API_KEY=${NINFER_KEY}"
    echo "TEXT_MODEL_BASE_URL=${NINFER_BASE_URL}"
    echo "TEXT_MODEL=${NINFER_MODEL}"
    echo "TEXT_MODEL_REASONING=none"
    echo "TEXT_MODEL_NO_RESPONSE_FORMAT=1"
    echo "BU_CDP_URL=http://127.0.0.1:${PORT}"
  } > "$JEV_DIR/.env"
  chmod 600 "$JEV_DIR/.env"
}

launch_chrome() {
  if already_up; then
    echo "QA Chrome already up on :${PORT} — reusing."
    return 0
  fi
  [ -x "$CHROME_BIN" ] || { echo "Chrome not found at ${CHROME_BIN}"; exit 2; }
  stop_qa_chrome; sleep 2
  if [ "$FRESH" = "1" ]; then rm -rf "$PROFILE"; fi
  mkdir -p "$PROFILE"
echo "launching clean Chrome on :${PORT} (profile ${PROFILE})"
  # Pass the Wayland socket explicitly: --ozone-platform=wayland makes Chrome look
  # up WAYLAND_DISPLAY (defaulting to wayland-0), which is wrong on this box
  # (wayland-1). Inheriting it only when the caller happens to have it was the
  # flaky "did not come up" failure; pin it from the environment.
  env_args=(DBUS_SESSION_BUS_ADDRESS="$dbus" XDG_RUNTIME_DIR="$xruntime" DISPLAY="$display")
  [ -n "$wld" ] && env_args+=("WAYLAND_DISPLAY=${wld}")
  setsid env "${env_args[@]}" \
     "$CHROME_BIN" --ozone-platform=wayland \
       --user-data-dir="$PROFILE" \
       --remote-debugging-port="$PORT" \
       --no-first-run --no-default-browser-check \
     >> "$LOG" 2>&1 < /dev/null &
  for _ in $(seq 1 15); do
    sleep 2
    if already_up; then
      echo "QA Chrome up on :${PORT}."
      return 0
    fi
  done
  echo "QA Chrome did not come up on :${PORT} — check ${LOG}"; exit 2
}

bootstrap
launch_chrome

if [ "$PREP" = "1" ]; then
  echo "prep done. Attach a Jev pass by hand (from $JEV_DIR):"
  echo "  uv run --env-file .env python examples/run.py --url '$URL' --goal '$GOAL'"
  exit 0
fi

# ---------------------------------------------------------------- run the pass
OUT_FILE="$QA_DIR/last-run.out"
ERR_FILE="$QA_DIR/last-run.err"
echo "Jev pass: $URL"
echo "goal: $GOAL"
set +e
( cd "$JEV_DIR" && uv run --env-file .env python examples/run.py --url "$URL" --goal "$GOAL" ) > "$OUT_FILE" 2> "$ERR_FILE"
rc=$?
set -e

last_status="$(awk '/ actions /{s=$NF} END{print s}' "$OUT_FILE" 2>/dev/null || true)"
last_line="$(grep -E ' actions ' "$OUT_FILE" 2>/dev/null | tail -1 || true)"
final_url="$(tail -1 "$OUT_FILE" 2>/dev/null || true)"

echo "--- Jev output (last tick + landing url) ---"
echo "${last_line:-<no tick line>}"
echo "landed: ${final_url:-<none>}"
echo "--------------------------------------------"

if [ "$rc" -ne 0 ]; then
  echo "QA verdict: ERROR (Jev exited $rc) — see ${ERR_FILE}"
  tail -20 "$ERR_FILE" || true
  exit 2
fi
case "${last_status:-}" in
  done)   echo "QA verdict: PASS (done) — fresh-eyes pass on $URL"; exit 0 ;;
  blocked) echo "QA verdict: BLOCKED — Jev could not complete '$GOAL'"; exit 1 ;;
  *)      echo "QA verdict: INCONCLUSIVE (final status '${last_status:-<none>}')"; exit 3 ;;
esac
