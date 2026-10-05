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
# --- 1. Explicit ACTION REQUIRED markers ------------------------------------
# Match the marker or the literal phrase, then skip anything already closed.
# Without the skip, correcting the record (marking it RESOLVED in place) leaves
# the entry flagged forever — and a reminder that shows resolved work is a
# reminder that stops being read. Resolved-ness is detected the same way here as
# in the escalations scan below, so both agree.
#
# CLOSED-NESS IS DECIDED BY THE WHOLE ENTRY, NOT ITS FIRST LINE. An entry is a
# `- ` line plus its indented continuation lines, and this repo's convention is
# that the ✅ RULING lands *below* the ⚠️ ACTION REQUIRED sentence. A line-by-line
# match therefore fires forever on a closed item: V24's read-surface item was
# ruled closed 2026-10-01 and still printed on 2026-10-05 (the case that fixed
# this). Any line in the block closes it.
# `[+]` not `\+`: this reaches awk through -v, where a backslash escape is
# consumed once and the bare `+` would become an ERE quantifier ("one or more
# spaces"), silently un-matching the literal "APPLIED + VERIFIED" marker.
CLOSED_RE='RESOLVED|APPLIED [+] VERIFIED|SUPERSEDED|not blocking|no further action'
actions="$(awk -v re="$CLOSED_RE" '
  function emit() {
    if (action && !closed && n < 5) { print start ":" text; n++ }
  }
  /^- / {
    emit()
    action = ($0 ~ /ACTION REQUIRED/ || $0 ~ /⚠️ ACTION/)
    closed = ($0 ~ re)
    start = NR; text = $0
    next
  }
  { if (action && $0 ~ re) closed = 1 }
  END { emit() }
' "$STATE")"

# --- 2. Open escalations ----------------------------------------------------
# The `## Escalations (waiting on human)` section, minus resolved entries.
escalations=""
if grep -q '^## Escalations (waiting on human)' "$STATE"; then
  escalations="$(awk -v re="$CLOSED_RE" '
    function emit() {
      if (open && !closed && n < 4) { print text; n++ }
    }
    /^## Escalations \(waiting on human\)/ { inseg=1; open=0; next }
    /^## / { if (inseg) emit(); inseg=0; open=0; next }
    !inseg { next }
    /^- / {
      emit()
      open=1; closed=($0 ~ re); text=$0
      next
    }
    { if (open && $0 ~ re) closed=1 }
    END { if (inseg) emit() }
  ' "$STATE")"
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
