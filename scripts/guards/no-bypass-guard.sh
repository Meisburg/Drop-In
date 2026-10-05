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
#                It also reads the env config layer (GIT_CONFIG_COUNT /
#                GIT_CONFIG_KEY_i / GIT_CONFIG_VALUE_i) directly: the env
#                layer beats every file layer when git runs hooks, yet
#                `git config --get` does not always report it (on git 2.55.0
#                it resolves core.hooksPath to a lower layer), so a foreign
#                env-layer value is refused by name, not by accident of which
#                git version happens to surface it. The count is audited up
#                to a cap (4096 entries): the env layer is the hostile surface
#                this guard polices, so an oversized count is refused as an
#                unverifiable layer — it fails closed, it does not hang or
#                silently disable the audit.
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
#                ⚠️ WHAT THIS CHECK DOES NOT COVER — stated here because a PASS
#                from it is NOT evidence about the flag. Git's reflog records
#                the ACTION TEXT git itself writes — `commit: <subject>` for a
#                plain commit, `checkout: moving from …`, and so on — and NEVER
#                the command line that was run. `git commit --no-verify`
#                therefore leaves the commit SUBJECT in the reflog and the flag
#                NOWHERE: the grep below reads no hit, and this guard prints
#                PASS on a tree where a bypass happened. No filter is hiding it:
#                the plain case writes the flag NOWHERE, so the prose filter below
#                has nothing to skip — the common case, a bypass with no wrapper,
#                is outside this check. What it CAN see is narrower than "a
#                bypass a WRAPPER recorded": a NON-PROSE reflog action text on
#                `logs/HEAD` — the one log file the grep below reads — or a line
#                in FAST_PUSH_LOG. The reflog case is seeded by setting
#                `GIT_REFLOG_ACTION` on a COMMIT, so what it proves is that the
#                prose filter admits a non-prose action text on the log the guard
#                reads; it does NOT prove a wrapper-PUSH is visible — a
#                `GIT_REFLOG_ACTION='… git push --no-verify' git push` writes the
#                flag to no `.git/logs` file at all, and this guard reads only
#                `logs/HEAD`. It does not cover a bypass that leaves neither a
#                non-prose reflog action text nor a FAST_PUSH_LOG line. The blind
#                spot AND both visible paths are PROVEN rather than asserted by
#                `scripts/guards/no-bypass-guard.check.mjs`, which builds real
#                repos: one commits with `--no-verify` on the command line and
#                requires this guard to report PASS (the blind spot), one sets a
#                non-prose reflog action text with `GIT_REFLOG_ACTION` on a commit
#                and one writes FAST_PUSH_LOG, and both of those require a refusal.
#                An instrument that matches nothing looks exactly like a clean
#                repo — the standard `run-all.sh` already sets.
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

# The env config layer. It is not a file: --show-origin cannot name it, and
# some git versions (2.55.0 among them) hide its core.hooksPath behind a lower
# layer in `git config --get` — but git's hook execution honours it either
# way, so it must be read from the environment, git version for git version.
ENV_HOOKS=""
ENV_LAYER=0
# Cap on the number of env-layer entries the audit is willing to process.
# The env layer is exactly the surface this guard polices: a hostile agent
# can set it. An oversized GIT_CONFIG_COUNT must not hang the audit loop
# (which would hang `npm run verify` and the pre-push chain behind it), and
# it must not be treated as "layer absent" — an entry past the cap would
# otherwise silently disable the hooks. Fail closed: the sentinel below
# fires the foreign-value check, which refuses.
ENV_COUNT_CAP=4096
if [ -n "${GIT_CONFIG_COUNT:-}" ]; then
  case "${GIT_CONFIG_COUNT}" in
    *[!0-9]*) ;;  # not a count git would honour — the layer is absent
    *)
      # The digit-length test runs first: test(1) rejects counts beyond
      # 64 bits with "integer expression expected" and reports false, so a
      # bare -gt comparison alone would let a 20-digit count fall through
      # to the loop branch. Any count of five digits is already over the
      # cap (>= 10000 > 4096), so the length test is exact.
      if [ "${#GIT_CONFIG_COUNT}" -gt 4 ] || [ "${GIT_CONFIG_COUNT}" -gt "$ENV_COUNT_CAP" ]; then
        ENV_LAYER=1
        ENV_HOOKS="<unverifiable: GIT_CONFIG_COUNT=${GIT_CONFIG_COUNT}>"
      else
        i=0
        while [ "$i" -lt "${GIT_CONFIG_COUNT}" ]; do
          # ${!var:-} (indirect, with default) — the plain ${NAME_$i:-}
          # form is a bad substitution in bash.
          keyvar="GIT_CONFIG_KEY_$i"
          key="${!keyvar:-}"
          if [ -n "$key" ]; then
            valuevar="GIT_CONFIG_VALUE_$i"
            value="${!valuevar:-}"
            # git lowercases env-layer variable names before honouring them,
            # so compare against the lowercased canonical name. Lowercase
            # via tr rather than ${key,,}: the expansion form needs
            # bash >= 4 and is a fatal bad substitution on stock macOS
            # /bin/bash (3.2), which would abort the guard mid-script.
            lc_key="$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]')"
            if [ "$lc_key" = "core.hookspath" ]; then
              ENV_HOOKS="$value"
              ENV_LAYER=1
            fi
          fi
          i=$((i + 1))
        done
      fi
      ;;
  esac
fi

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
EFF_RESOLVED="$(abs_path "$EFFECTIVE" "$TOPLEVEL")"
EFF_INSIDE=0
case "$EFF_RESOLVED" in
  "$COMMON"/*) EFF_INSIDE=1 ;;
esac

# If the env layer supplies core.hooksPath, that value is what git will
# actually use to run hooks (it beats every file layer). It is NEVER the
# accepted externally-owned layer (that case requires <gitdir>/config.worktree),
# so it is refused unless it resolves to this repository's own tracked hooks
# dir — a no-op override is harmless.
EXPECTED_RESOLVED="$(abs_path "$EXPECTED_HOOKS_DIR" "$TOPLEVEL")"
ENV_FOREIGN=0
if [ "$ENV_LAYER" -eq 1 ]; then
  ENV_RESOLVED="$(abs_path "$ENV_HOOKS" "$TOPLEVEL")"
  [ "$ENV_RESOLVED" != "$EXPECTED_RESOLVED" ] && ENV_FOREIGN=1
fi

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
elif [ "$ENV_FOREIGN" -eq 1 ]; then
  echo "  FINDING: effective core.hooksPath is '${ENV_HOOKS:-<unset>}', supplied by the env config layer (GIT_CONFIG_*)."
  echo "  The env layer beats every file layer when git runs hooks, and it is never"
  echo "  the accepted externally-owned worktree config layer (that case requires the"
  echo "  value to come from <gitdir>/config.worktree). A foreign env override silences this gate."
  echo "  Fix: unset GIT_CONFIG_COUNT / GIT_CONFIG_KEY_* / GIT_CONFIG_VALUE_*, or point the env layer at the tracked hooks dir."
  FAIL=1
elif [ "$ENV_LAYER" -eq 1 ]; then
  echo "  ok — env-layer core.hooksPath = $ENV_HOOKS is a no-op override (it resolves to the tracked hooks dir)"
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
# pre-push, and an env-layer override points git at a dir it does not own
# either — so in both cases inspect the tracked hook in this checkout instead.
RESOLVED_HOOK="$(git rev-parse --git-path hooks/pre-push 2>/dev/null || true)"
[ "$EXTERNALLY_OWNED" -eq 1 ] && RESOLVED_HOOK="$HOOK"
[ "$ENV_FOREIGN" -eq 1 ] && RESOLVED_HOOK="$HOOK"
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
  # Reflog action text git itself writes is prose, not commands: commit
  # subjects ('commit', 'commit (amend)', 'commit (merge)', 'commit (initial)',
  # 'rebase (pick)', 'rebase (squash)', 'cherry-pick', 'revert', 'am'), branch
  # names and refs ('checkout: moving from ...', 'reset: moving to ...',
  # 'merge <name>: ...', 'pull <args>: ...'), and URLs ('clone: from ...').
  # A bypass flag there is not a bypass; real flags can only ride a
  # wrapper-recorded command, whose action text does not follow those shapes.
  hits="$(grep -nE -- '--no-verify|core\.hooksPath' "$RELOG" 2>/dev/null | grep -vE -- "${TAB}((commit|rebase|cherry-pick|revert|am|checkout|reset|clone)( \([^)]*\))?|(merge|pull) [^:]*): " | tail -3 || true)"
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

# STATE THE COVERAGE IN THE RUN, not only in the header. A PASS here is
# evidence that the tracked hooks are wired; it is NOT evidence that the flag
# was never used. Git records no command line, so a plain
# `git commit --no-verify` is invisible to the reflog grep above — the blind
# spot is proven by no-bypass-guard.check.mjs.
echo "  COVERAGE: HISTORY reads the reflog's action text on logs/HEAD and FAST_PUSH_LOG, never a command line."
echo "    A plain 'git commit --no-verify' leaves no trace this check can read, so the PASS/FAIL"
echo "    below is NOT evidence about the flag — only a non-prose reflog action text on logs/HEAD"
echo "    or a FAST_PUSH_LOG line is visible (see scripts/guards/no-bypass-guard.check.mjs)."

echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS — git hook enforcement is intact."
else
  echo "FAIL — enforcement is broken or bypassed."
fi
exit "$FAIL"
