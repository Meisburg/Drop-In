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
#   1. STATIC  — assert THIS repository's own config layer still points at the
#                tracked dir, and that the hook file exists and is executable.
#                It keeps three values separate on purpose:
#                  REPO_HOOKS     — what this repository's own config layer
#                                   (the shared local scope) says. This is the
#                                   guarantee: nobody unwired this repo.
#                  EFFECTIVE      — what git will actually use after all layers.
#                  WORKTREE_HOOKS — what the per-worktree config layer says.
#                A differing effective value is ACCEPTED only for a disposable
#                copy another tool created and owns: a linked worktree whose
#                common git dir is outside the checkout, whose worktree config
#                layer supplies the value, and whose value points inside that
#                common git dir. Every acceptance is printed so it is visible in
#                a log rather than silent. The repository's own layer must still
#                point at the tracked dir in every case.
#   2. HISTORY — refuse to certify the current tree when a bypass was recorded
#                in the reflog or in the recorded push history. This stays
#                exactly as strong as before: an accepted copy is never a
#                licence to skip the gate.
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
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" || exit 1

FAIL=0
EXPECTED_HOOKS_DIR="scripts/git-hooks"
EXTERNALLY_OWNED=0

echo "No-bypass guard — git hook enforcement"
echo "==========================================================="

# --- helpers ----------------------------------------------------------------
# Absolute, symlink-resolved directory for a path that exists.
abs_dir() { ( cd "$1" 2>/dev/null && pwd -P ); }

# Absolute path for a file/dir that may not exist, resolved against base $2.
abs_path() {
  local p="$1" base="$2" dir name abs
  case "$p" in
    /*) ;;
    *) p="$base/$p" ;;
  esac
  if [ -d "$p" ]; then
    ( cd "$p" && pwd -P )
    return
  fi
  dir="$(dirname "$p")"
  name="$(basename "$p")"
  abs="$(abs_dir "$dir")"
  [ -n "$abs" ] && printf '%s/%s\n' "$abs" "$name"
}

# --- 1. STATIC: is the enforcement still wired? -----------------------------
# Repository geometry, so an override can be attributed to a real layer.
COMMON="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
[ -z "$COMMON" ] && COMMON="$(git rev-parse --git-common-dir 2>/dev/null || true)"
GITDIR="$(git rev-parse --path-format=absolute --git-dir 2>/dev/null || true)"
[ -z "$GITDIR" ] && GITDIR="$(git rev-parse --git-dir 2>/dev/null || true)"

TOPLEVEL="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$TOPLEVEL" ] && [ -n "$GITDIR" ] && [ -f "$GITDIR/gitdir" ]; then
  # git refuses --show-toplevel in a linked worktree of a bare repo
  # (core.bare=true), so recover the checkout root from the worktree link.
  TOPLEVEL="$(abs_dir "$(dirname "$(cat "$GITDIR/gitdir")")")"
fi
[ -z "$TOPLEVEL" ] && TOPLEVEL="$(pwd -P)"

COMMON="$(abs_dir "$COMMON")"
GITDIR="$(abs_dir "$GITDIR")"
TOPLEVEL="$(abs_dir "$TOPLEVEL")"

# The three values, each from its own layer.
REPO_HOOKS="$(git config --local --get core.hooksPath 2>/dev/null || true)"
WORKTREE_HOOKS="$(git config --worktree --get core.hooksPath 2>/dev/null || true)"
EFFECTIVE="$(git config --get core.hooksPath 2>/dev/null || true)"

# Which layer supplied the effective value? --show-origin names it directly.
TAB="$(printf '\t')"
ORIGIN_LINE="$(git config --show-origin --get core.hooksPath 2>/dev/null || true)"
ORIGIN_FILE="${ORIGIN_LINE%%"$TAB"*}"
ORIGIN_FILE="${ORIGIN_FILE#file:}"
ORIGIN_ABS=""
[ -n "$ORIGIN_FILE" ] && ORIGIN_ABS="$(abs_path "$ORIGIN_FILE" "$GITDIR")"
WT_CONFIG_ABS="$(abs_path "$GITDIR/config.worktree" "$GITDIR")"

# Is this the accepted case: an externally owned disposable copy?
LINKED=0
[ -n "$GITDIR" ] && [ "$GITDIR" != "$COMMON" ] && LINKED=1
COMMON_OUTSIDE=0
case "$COMMON" in
  ""|"$TOPLEVEL"|"$TOPLEVEL"/*) ;;
  *) COMMON_OUTSIDE=1 ;;
esac
EFF_RESOLVED="$(abs_path "$EFFECTIVE" "$COMMON")"
EFF_INSIDE=0
case "$EFF_RESOLVED" in
  "$COMMON"/*) EFF_INSIDE=1 ;;
esac

if [ "$LINKED" -eq 1 ] && [ "$COMMON_OUTSIDE" -eq 1 ] \
   && [ -n "$WORKTREE_HOOKS" ] && [ "$WORKTREE_HOOKS" = "$EFFECTIVE" ] \
   && [ -n "$ORIGIN_ABS" ] && [ -n "$WT_CONFIG_ABS" ] && [ "$ORIGIN_ABS" = "$WT_CONFIG_ABS" ] \
   && [ "$EFF_INSIDE" -eq 1 ] && [ "$EFFECTIVE" != "$EXPECTED_HOOKS_DIR" ]; then
  EXTERNALLY_OWNED=1
fi

if [ "$REPO_HOOKS" != "$EXPECTED_HOOKS_DIR" ]; then
  echo "  FINDING: the repository's own core.hooksPath is '${REPO_HOOKS:-<unset>}', expected '$EXPECTED_HOOKS_DIR'."
  echo "  This repository's hooks are not wired. Agents and clones are ungated."
  echo "  Fix: bash scripts/install-git-hooks.sh"
  FAIL=1
elif [ "$EFFECTIVE" = "$REPO_HOOKS" ]; then
  echo "  ok — core.hooksPath = $EFFECTIVE"
elif [ "$EXTERNALLY_OWNED" -eq 1 ]; then
  echo "  ACCEPT: effective core.hooksPath '$EFFECTIVE' is supplied by the worktree config layer ($ORIGIN_ABS), and common git dir '$COMMON' is outside this checkout '$TOPLEVEL' — this copy is externally owned."
else
  echo "  FINDING: effective core.hooksPath is '${EFFECTIVE:-<unset>}', but the repository's own layer is '${REPO_HOOKS:-<unset>}'."
  echo "  An override is accepted only for a linked worktree whose common git dir is outside the checkout, supplied by the worktree config layer and pointing inside that common dir."
  echo "  Fix: bash scripts/install-git-hooks.sh"
  FAIL=1
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

# git's own pre-push resolution points into the effective hooks dir. In an
# externally owned copy that dir belongs to the owning tool and has no
# pre-push, so inspect the tracked hook in this checkout instead.
RESOLVED_HOOK="$(git rev-parse --git-path hooks/pre-push 2>/dev/null || true)"
[ "$EXTERNALLY_OWNED" -eq 1 ] && RESOLVED_HOOK="$HOOK"
if [ -n "$RESOLVED_HOOK" ] && [ ! -f "$RESOLVED_HOOK" ]; then
  echo "  FINDING: git cannot resolve pre-push (looked at $RESOLVED_HOOK)."
  FAIL=1
fi

# --- 2. HISTORY: was the current state reached by a bypass? -----------------
# Look at the reflog and the recorded push log for bypass flags. A bypass that
# already shipped is worth knowing about; one about to be repeated is the thing
# this stops. Bypass flags cannot weaken the acceptance above.
RELOG="$(git rev-parse --git-path logs/HEAD 2>/dev/null || true)"
BYPASS_LOG="$(git rev-parse --git-path FAST_PUSH_LOG 2>/dev/null || true)"
BYPASS_HITS=""

if [ -n "$RELOG" ] && [ -f "$RELOG" ]; then
  # A commit subject is recorded in the reflog under several action spellings
  # ('commit', 'commit (amend)', 'commit (merge)', 'commit (initial)',
  # 'rebase (pick)', 'rebase (squash)', 'cherry-pick', 'revert', 'am') and is
  # only prose — a bypass flag there is not a bypass. Real flags can only ride
  # a non-commit action (a wrapper or a logged command).
  hits="$(grep -nE -- '--no-verify|core\.hooksPath' "$RELOG" 2>/dev/null | grep -vE -- "${TAB}(commit|rebase|cherry-pick|revert|am)( \([^)]*\))?: " | tail -3 || true)"
  if [ -n "$hits" ]; then
    BYPASS_HITS="$BYPASS_HITS$hits
"
  fi
  # The original guard also surfaced any mention, including commit subjects,
  # as information only.
  note="$(grep -nE -- '--no-verify|core\.hooksPath' "$RELOG" 2>/dev/null | tail -3 || true)"
  if [ -n "$note" ] && [ -z "$hits" ]; then
    echo
    echo "  NOTE: bypass-related history entries found:"
    printf '%s\n' "$note" | sed 's/^/    /'
    echo "  (informational — review whether the gated checks were ever run)"
  fi
fi

if [ -n "$BYPASS_LOG" ] && [ -f "$BYPASS_LOG" ]; then
  hits="$(tail -5 "$BYPASS_LOG" 2>/dev/null || true)"
  if [ -n "$hits" ]; then
    BYPASS_HITS="$BYPASS_HITS$hits
"
  fi
fi

if [ -n "$BYPASS_HITS" ]; then
  echo
  echo "  FINDING: recorded bypass history — refusing to certify this tree:"
  printf '%s' "$BYPASS_HITS" | sed 's/^/    /'
  echo "  The gated checks must run; the tracked pre-push hook is not optional."
  FAIL=1
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS — git hook enforcement is intact."
else
  echo "FAIL — enforcement is broken or bypassed."
fi
exit "$FAIL"
