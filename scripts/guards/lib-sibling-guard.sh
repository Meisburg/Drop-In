#!/usr/bin/env bash
# Build-law guard: every `lib/` module ships a sibling test.
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
# THE REACH MATCHES THE NAME (widened in slice 8b). "every `lib/` module" was
# true of the convention and false of this guard: it read `src/lib/*.ts` alone,
# so `scripts/lib/fence-scanner.mjs` — a `lib/` module with no sibling file — was
# invisible, and would have hidden the next one. There are two `lib/`
# directories and two module extensions here, and the sibling convention differs
# per directory, so there are three scan sets:
#
#   src/lib/*.ts       -> <base>.test.ts    (the build law's own sentence; vitest)
#   src/lib/*.mjs      -> <base>.test.ts    (the vanilla-JS escape hatch; vitest)
#   scripts/lib/*.mjs  -> <base>.check.mjs  (standalone gate checkers, run by run-all.sh)
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

# Declared exemptions, keyed by path from the root. Every entry must carry a
# reason, because an unexplained allowlist entry is how a guard quietly stops
# guarding. Adding a module here is a deliberate, reviewable act; forgetting to
# write its test is not.
#
#   src/lib/types.ts       — types and interfaces only, no runtime code paths.
#   src/lib/db.ts          — the Supabase-facing wrapper. code-structure.md names
#                            this as the file that needs no test because it holds
#                            no decisions; the decisions live in the domain
#                            modules.
#   src/lib/pushClient.ts  — browser-touching half of web push; its own header
#                            states the rules live in push.ts and it only wires
#                            them up.
#   scripts/lib/fence-scanner.mjs — its behaviour test is NOT a file beside it:
#                            factory-guard.check.mjs runs the scanner over the
#                            reference-derived fence fixture inside this gate. A
#                            second copy beside the module would be the
#                            duplication the one-copy rule forbids, so the
#                            exemption is recorded here rather than paid twice.
#
# geocode.ts was exempt until the first-use audit (ticket 02) found that the
# exemption hid a real policy: the ZIP derivation's "is this match precise
# enough?" rule and its two outcomes — the exact path the audit's signup
# fallback depends on. It now ships geocode.test.ts, so the exemption is gone.
# Removing a stale exemption is the point of the reason requirement: an
# allowlist entry that outlives its justification is how a guard stops guarding.
EXEMPT="src/lib/types.ts src/lib/db.ts src/lib/pushClient.ts scripts/lib/fence-scanner.mjs"

is_exempt() {
  local key="$1" e
  for e in $EXEMPT; do
    [ "$key" = "$e" ] && return 0
  done
  return 1
}

checked=0
missing=""

# scan_set <dir> <module-suffix> <sibling-suffix>: the sibling test of
# `<dir>/<name><module-suffix>` is `<dir>/<base><sibling-suffix>`, where `<base>`
# is the name without the module suffix.
scan_set() {
  local dir="$1" mod="$2" sibling="$3"
  local f name base
  for f in "$dir"/*"$mod"; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"

    # A sibling test or checker is the thing being checked FOR, not a module; a
    # `*.d.*` is a type declaration, not runtime code. Neither can ship a test.
    case "$name" in *.test.ts|*.check.mjs|*.d.mts|*.d.ts) continue ;; esac

    is_exempt "$dir/$name" && continue

    checked=$((checked + 1))
    base="${name%"$mod"}"

    if [ ! -f "$dir/$base$sibling" ]; then
      missing="$missing  MISSING: $dir/$name has no $dir/$base$sibling
"
      FAIL=1
    fi
  done
}

if [ ! -d "$LIB_DIR" ]; then
  echo "Build-law guard — sibling tests under src/lib/ and scripts/lib/"
  echo "==========================================================="
  echo "  FINDING: $LIB_DIR does not exist — the scan read no module at all."
  echo "  Zero is a finding, never a pass (D-030): a guard that examined nothing has"
  echo "  established nothing, which is exactly what a clean repo also looks like."
  echo
  echo "FAIL — build law not checked."
  exit 1
fi

echo "Build-law guard — sibling tests under src/lib/ and scripts/lib/"
echo "==========================================================="

scan_set "$LIB_DIR" ".ts" ".test.ts"
scan_set "$LIB_DIR" ".mjs" ".test.ts"
scan_set "scripts/lib" ".mjs" ".check.mjs"

if [ -n "$missing" ]; then
  printf '%s' "$missing"
  echo
  echo "  FINDING: $(printf '%s' "$missing" | grep -c 'MISSING') module(s) ship no sibling test."
  echo "  code-structure.md: an untested lib module is an incomplete slice."
  echo "  Fix: write the sibling the module's own directory uses, or add the module"
  echo "       to EXEMPT in scripts/guards/lib-sibling-guard.sh WITH a written reason."
  FAIL=1
elif [ "$checked" -eq 0 ]; then
  # D-030. Every module in the scan set was skipped (exempt, or a *.test.ts), so
  # the run examined nothing and the old `ok — all 0 module(s)` line reported
  # health over an empty measurement. Zero is a finding, never a pass.
  echo "  FINDING: src/lib holds no non-exempt module — the scan read nothing."
  echo "  An empty scan is not a clean repo (D-030)."
  FAIL=1
else
  echo "  ok — all $checked non-exempt module(s) have a sibling test"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS — build law holds."
else
  echo "FAIL — build law violated."
fi
exit "$FAIL"
