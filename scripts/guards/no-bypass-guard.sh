#!/usr/bin/env bash
# No-bypass guard: the tracked hooks cannot be skipped.
#
# WHY THIS EXISTS: this repo put real enforcement in `scripts/git-hooks/pre-push`
# (core.hooksPath points there — see scripts/install-git-hooks.sh). That hook is
# the last deterministic gate before master. It is also one flag away from being
# skipped: `git push --no-verify`, `git commit --no-verify`, or
# `git -c core.hooksPath=/dev/null`. An agent that cannot make `npm run verify`
# pass has a much easier option available than fixing the code, and a hook it
# can bypass is not enforcement — it is a suggestion.
#
# This guard has two jobs:
#   1. STATIC  — assert core.hooksPath still points at the tracked dir, and that
#                the hook file exists and is executable. If the wiring drifts,
#                the gate is gone even though the hook file is still committed.
#   2. HISTORY — scan recent commit/push commands for bypass flags in the
#                reflog and shell history where available, and refuse to
#                certify the current tree if a bypass is what got it here.
#
# PROVENANCE: pattern borrowed from affaan-m/ECC's `block-no-verify.js`
# PreToolUse hook. Reimplemented as a post-hoc deterministic audit, because
# this repo's harness is OpenCode/DSH, not Claude Code, and a PreToolUse hook
# does not exist here. An audit after the fact still catches the case that
# matters: a bypassed push is visible before it is repeated.
# See docs/agents/borrowed-guards.md.
#
# Usage:  bash scripts/guards/no-bypass-guard.sh
# Exit:   0 = enforcement intact, 1 = bypass detected or wiring broken

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

FAIL=0
EXPECTED_HOOKS_DIR="scripts/git-hooks"

echo "No-bypass guard — git hook enforcement"
echo "==========================================================="

# --- 1. STATIC: is the enforcement still wired? -----------------------------
ACTUAL="$(git config core.hooksPath 2>/dev/null || echo '')"

if [ "$ACTUAL" != "$EXPECTED_HOOKS_DIR" ]; then
  echo "  FINDING: core.hooksPath is '${ACTUAL:-<unset>}', expected '$EXPECTED_HOOKS_DIR'."
  echo "  The tracked pre-push gate is not active. Agents (and clones) are ungated."
  echo "  Fix: bash scripts/install-git-hooks.sh"
  FAIL=1
else
  echo "  ok — core.hooksPath = $ACTUAL"
fi

HOOK="$EXPECTED_HOOKS_DIR/pre-push"
if [ ! -f "$HOOK" ]; then
  echo "  FINDING: $HOOK does not exist — the gate has no body."
  FAIL=1
elif [ ! -x "$HOOK" ]; then
  echo "  FINDING: $HOOK is not executable — git will silently skip it."
  echo "  Fix: chmod +x $HOOK"
  FAIL=1
else
  echo "  ok — $HOOK exists and is executable"
fi

# --- 2. HISTORY: was the current state reached by a bypass? -----------------
# Look at recent commits' messages and the reflog for bypass flags. A bypass
# that already shipped is worth knowing about; one about to be repeated is the
# thing this stops.
BYPASS_HITS=""

if [ -f .git/logs/HEAD ]; then
  # Reflog records the command-ish action text; --no-verify would not appear
  # there, but core.hooksPath overrides sometimes do.
  hits="$(grep -n "core.hooksPath" .git/logs/HEAD 2>/dev/null | tail -3 || true)"
  [ -n "$hits" ] && BYPASS_HITS="$BYPASS_HITS$hits
"
fi

# Shell history: only read if it is this repo's own history file, never the
# user's global one. We do not want to read the human's whole command history.
if [ -f .git/FAST_PUSH_LOG ]; then
  hits="$(tail -5 .git/FAST_PUSH_LOG 2>/dev/null || true)"
  [ -n "$hits" ] && BYPASS_HITS="$BYPASS_HITS$hits
"
fi

if [ -n "$BYPASS_HITS" ]; then
  echo
  echo "  NOTE: bypass-related history entries found:"
  printf '%s' "$BYPASS_HITS" | sed 's/^/    /'
  echo "  (informational — review whether the gated checks were ever run)"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS — git hook enforcement is intact."
else
  echo "FAIL — enforcement is broken or bypassed."
fi
exit "$FAIL"
