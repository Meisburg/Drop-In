#!/usr/bin/env bash
# Build-law guard: every src/lib/*.ts module ships a sibling *.test.ts.
#
# WHY THIS EXISTS: `docs/agents/code-structure.md` states the rule plainly —
# "`src/lib/trust.ts` <-> `src/lib/trust.test.ts`. A new `lib/` module without a
# sibling `.test.ts` is an incomplete slice." Until now that rule was enforced
# by NOTHING but the reviewer's attention. A reviewer is a language model; on a
# long diff it can miss one file, and the miss is invisible because the module
# still imports and the build still passes. The module simply never gets tested,
# and nothing ever says so.
#
# This is a deterministic check. It either finds a missing sibling or it does
# not. It cannot be talked out of a finding, and it costs no tokens.
#
# WHAT IT IS NOT: a coverage tool. It does not check that the test asserts
# anything (code-structure.md covers that: "A test that asserts nothing is a
# defect"). It checks one thing: does the file exist.
#
# ZERO IS A FINDING (D-030). If the scan examines no non-exempt module — an
# empty or missing src/lib, or a src/lib whose every entry is exempt or a test —
# the run FAILS. It has not established that the build law holds; it has
# established that it did not look, and an empty scan looks exactly like a clean
# repo. See `lib-sibling-guard.check.mjs` for the seed and the mutation.
#
# PROVENANCE: pattern borrowed from affaan-m/ECC's PostToolUse guard hooks
# (`scripts/hooks/quality-gate.js`, `config-protection.js`), reimplemented for
# this repo's layout and run as a batch gate rather than per-edit. See
# docs/agents/borrowed-guards.md.
#
# Usage:  bash scripts/guards/lib-sibling-guard.sh [root]
# Exit:   0 = clean, 1 = findings

set -uo pipefail

# The scan root: an explicit argument wins, so the behaviour check can point the
# guard at a throwaway tree the way the other guards' checkers do; otherwise this
# repository.
if [ -n "${1:-}" ]; then
  cd "$1" || { echo "lib-sibling: cannot enter root '$1'"; exit 2; }
else
  cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi

LIB_DIR="src/lib"
FAIL=0

if [ ! -d "$LIB_DIR" ]; then
  echo "Build-law guard — sibling tests under $LIB_DIR/"
  echo "==========================================================="
  echo "  FINDING: $LIB_DIR does not exist — the scan read no module at all."
  echo "  Zero is a finding, never a pass (D-030): a guard that examined nothing has"
  echo "  established nothing, which is exactly what a clean repo also looks like."
  echo
  echo "FAIL — build law not checked."
  exit 1
fi

# Declared exemptions. Every entry must carry a reason, because an unexplained
# allowlist entry is how a guard quietly stops guarding. Adding a module here
# is a deliberate, reviewable act; forgetting to write its test is not.
#
#   types.ts       — types and interfaces only, no runtime code paths.
#   db.ts          — the Supabase-facing wrapper. code-structure.md names this
#                    as the file that needs no test because it holds no
#                    decisions; the decisions live in the domain modules.
#   db-*.test.ts   — (test files themselves, skipped by the loop)
#   pushClient.ts  — browser-touching half of web push; its own header states
#                    the rules live in push.ts and it only wires them up.
#
# geocode.ts was exempt until the first-use audit (ticket 02) found that the
# exemption hid a real policy: the ZIP derivation's "is this match precise
# enough?" rule and its two outcomes — the exact path the audit's signup
# fallback depends on. It now ships geocode.test.ts, so the exemption is gone.
# Removing a stale exemption is the point of the reason requirement: an
# allowlist entry that outlives its justification is how a guard stops guarding.
EXEMPT="types.ts db.ts pushClient.ts"

is_exempt() {
  local name="$1" e
  for e in $EXEMPT; do
    [ "$name" = "$e" ] && return 0
  done
  return 1
}

echo "Build-law guard — sibling tests under $LIB_DIR/"
echo "==========================================================="

checked=0
missing=""

for f in "$LIB_DIR"/*.ts; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"

  # Test files are not modules; they are the thing being checked for.
  case "$name" in *.test.ts) continue ;; esac

  is_exempt "$name" && continue

  checked=$((checked + 1))
  base="${name%.ts}"

  if [ ! -f "$LIB_DIR/$base.test.ts" ]; then
    missing="$missing  MISSING: $LIB_DIR/$base.ts has no $LIB_DIR/$base.test.ts
"
    FAIL=1
  fi

done

if [ -n "$missing" ]; then
  printf '%s' "$missing"
  echo
  echo "  FINDING: $(printf '%s' "$missing" | grep -c 'MISSING') module(s) ship no sibling test."
  echo "  code-structure.md: an untested lib module is an incomplete slice."
  echo "  Fix: write $LIB_DIR/<name>.test.ts, or add <name>.ts to EXEMPT in"
  echo "       scripts/guards/lib-sibling-guard.sh WITH a written reason."
  FAIL=1
elif [ "$checked" -eq 0 ]; then
  # D-030. Every module in the scan set was skipped (exempt, or a *.test.ts), so
  # the run examined nothing and the old `ok — all 0 module(s)` line reported
  # health over an empty measurement. Zero is a finding, never a pass.
  echo "  FINDING: $LIB_DIR holds no non-exempt module — the scan read nothing."
  echo "  An empty scan is not a clean repo (D-030)."
  FAIL=1
else
  echo "  ok — all $checked non-exempt module(s) have a sibling .test.ts"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS — build law holds."
else
  echo "FAIL — build law violated."
fi
exit "$FAIL"
