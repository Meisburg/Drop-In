#!/usr/bin/env bash
# Human-action reminders — surface the work that only YOU can do, at the moment
# it matters.
#
# WHY: task-state.md records human-pending work in `## Escalations (waiting on
# human)` and in `ACTION REQUIRED` lines. But that file is 1,300+ lines, so a
# reminder buried in it never fires. A reminder is only real if something prints
# it at the right time. This is called from the pre-push hook (the end-of-batch
# moment, when the human is most likely present) and can be run any time.
#
# Usage:  bash scripts/remind-human.sh [--hook]
#   --hook : terse output suitable for the pre-push gate (never blocks)
#
# It NEVER fails the build. It is an attention instrument, not a gate.

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

HOOK_MODE=0
[ "${1:-}" = "--hook" ] && HOOK_MODE=1

STATE="task-state.md"
[ -f "$STATE" ] || exit 0

found=0

# --- 1. Explicit ACTION REQUIRED markers ------------------------------------
# Match the ⚠️ marker and the literal phrase; take the first line of each entry
# so the output stays scannable (the full detail stays in task-state.md).
actions="$(grep -nE 'ACTION REQUIRED|⚠️ ACTION' "$STATE" 2>/dev/null | head -5 || true)"

# --- 2. Open escalations ----------------------------------------------------
# The `## Escalations (waiting on human)` section, minus resolved entries.
escalations=""
if grep -q '^## Escalations (waiting on human)' "$STATE"; then
  escalations="$(awk '
    /^## Escalations \(waiting on human\)/ { inseg=1; next }
    /^## / { inseg=0 }
    inseg && /^- / {
      line=$0
      # Skip entries already marked resolved/applied/verified.
      if (line ~ /RESOLVED|APPLIED \+ VERIFIED|not blocking/) next
      print
    }
  ' "$STATE" | head -4)"
fi

[ -n "$actions" ] && found=1
[ -n "$escalations" ] && found=1

[ "$found" -eq 0 ] && {
  [ "$HOOK_MODE" -eq 1 ] || echo "No human actions pending. ✓"
  exit 0
}

# --- Render -----------------------------------------------------------------
if [ "$HOOK_MODE" -eq 1 ]; then
  echo
  echo "┌─ WAITING ON YOU ────────────────────────────────────────────"
else
  echo "Actions only you can take (full detail: $STATE):"
  echo "────────────────────────────────────────────────────────────"
fi

# Strip markdown noise (**bold**, backticks) and clip: this is a nudge, the
# full text stays in task-state.md.
clean() {
  printf '%s' "$1" \
    | sed -e 's/\*\*//g' -e 's/`//g' -e 's/^- //' -e 's/^ *//' \
    | cut -c1-150
}

if [ -n "$actions" ]; then
  printf '%s\n' "$actions" | while IFS= read -r line; do
    printf '  ⚠  %s\n' "$(clean "${line#*:}")"
  done
fi

if [ -n "$escalations" ]; then
  printf '%s\n' "$escalations" | while IFS= read -r line; do
    printf '  •  %s\n' "$(clean "$line")"
  done
fi

if [ "$HOOK_MODE" -eq 1 ]; then
  echo "└──────────────────────────────────────────────────────────────"
  echo "   (informational — this does NOT block the push)"
else
  echo "────────────────────────────────────────────────────────────"
fi

exit 0
