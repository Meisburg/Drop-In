#!/usr/bin/env bash
# Config-protection guard: the check configs cannot be weakened to pass.
#
# WHY THIS EXISTS: the cheapest way to make a failing gate green is to edit the
# gate. `npm run lint` failing on a real defect becomes a passing lint the
# moment a rule is downgraded in `.oxlintrc.json` or an ignore-pattern is
# widened in package.json. `npm run test` failing becomes green if a vitest
# include glob stops matching. `npm run verify` failing becomes green if a step
# is dropped from the `verify` script.
#
# Every one of those edits is a legitimate-looking diff. The commit message
# reads "fix lint" and the diff is three lines in a config file. Nothing in the
# current factory catches it — `ocr` reviews CODE and treats config as
# `unsupported_ext`; steering-lint reviews prose. The config files were the one
# place with no reviewer at all.
#
# This guard diffs the protected paths against a base ref and FAILS if they
# changed. It does not judge whether the change is good — it makes the change
# impossible to make *silently*, which is the actual failure mode.
#
# PROVENANCE: pattern borrowed from affaan-m/ECC's `config-protection.js`
# PreToolUse hook (blocks edits to linter/formatter configs mid-session).
# Reimplemented as a deterministic batch gate against git, so it works in any
# harness, at commit time and in `verify`. See docs/agents/borrowed-guards.md.
#
# Usage:  bash scripts/guards/config-guard.sh [base-ref]
#
# base-ref resolution, first that applies wins:
#   1. explicit $1
#   2. $GUARD_BASE — set by the caller to the slice's base commit
#   3. merge-base with origin/master — "everything this branch adds"
#   4. HEAD — uncommitted changes only
#
# A bare `HEAD` default would false-positive constantly: mid-slice, an agent's
# own uncommitted config edit is expected and reviewable. The merge-base is the
# better default because it is the same range the reviewer and `ocr` are given.
#
# Exit:   0 = no protected config changed, 1 = changed
#
# Intentional config change? Attach the reason so it is recorded, not bypassed:
#         ALLOW_CONFIG_CHANGE="<reason>" git commit ...

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

BASE="${1:-}"
if [ -z "$BASE" ] && [ -n "${GUARD_BASE:-}" ]; then
  BASE="$GUARD_BASE"
fi
if [ -z "$BASE" ]; then
  BASE="$(git merge-base origin/master HEAD 2>/dev/null || echo HEAD)"
fi
FAIL=0

git rev-parse --verify "$BASE" >/dev/null 2>&1 || {
  echo "SKIP — base ref '$BASE' does not resolve (fresh repo?)"
  exit 0
}

# Paths whose change weakens a gate. Each carries the reason it is protected.
PROTECTED=(
  "package.json"
  ".oxlintrc.json"
  "vitest.config.ts"
  "vite.config.ts"
  "tsconfig.json"
  "tsconfig.app.json"
  "playwright.config.ts"
  "scripts/steering-lint.sh"
)

echo "Config-protection guard — protected check configs vs $BASE"
echo "==========================================================="

changed=""
for p in "${PROTECTED[@]}"; do
  # Uncommitted (working tree + index) and committed-since-base changes both count.
  if ! git diff --quiet "$BASE" -- "$p" 2>/dev/null; then
    changed="$changed  CHANGED: $p
"
    FAIL=1
  fi
done

if [ -n "$changed" ]; then
  printf '%s' "$changed"
  echo
  if [ -n "${ALLOW_CONFIG_CHANGE:-}" ]; then
    echo "  ALLOWED by ALLOW_CONFIG_CHANGE — reason recorded:"
    echo "    ${ALLOW_CONFIG_CHANGE}"
    echo
    echo "PASS — config changed, on the record."
    exit 0
  fi
  echo "  FINDING: a file that defines a check was modified."
  echo "  This is how a failing gate gets silently disabled instead of fixed."
  echo
  echo "  If the change is real, re-run with the reason attached:"
  echo "    ALLOW_CONFIG_CHANGE=\"<why>\" bash scripts/guards/config-guard.sh $BASE"
  echo "  so the reason lands in the log rather than vanishing into the diff."
else
  echo "  ok — no protected check config changed"
  echo
  echo "PASS — checks still mean what they meant."
fi

echo
exit "$FAIL"
