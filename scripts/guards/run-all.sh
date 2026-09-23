#!/usr/bin/env bash
# Deterministic guards — the machine-enforced rules, run as one gate.
#
# WHY THIS EXISTS: the factory has three review lanes already
# (orchestrator-reviewer, `ocr`, orchestrator-verifier). All three share a
# property: they are good at JUDGING and bad at GUARANTEEING. A reviewer can
# miss a file; `ocr` skips config and prose entirely; the verifier runs the
# commands it is told to run. None of them can state a rule that is simply
# always true, because each one is either a language model or a fixed command
# list.
#
# These guards are the rules that should never depend on attention. Each is a
# deterministic shell script: it either finds a violation or it does not. It
# costs no tokens, it cannot be argued with, and it runs in the same `verify`
# gate every slice must pass.
#
# The rules, and the doc each enforces:
#   lib-sibling   docs/agents/code-structure.md  — every lib module ships a test
#   config        (build law, unwritten)         — checks cannot be weakened
#   no-bypass     docs/agents/auto-push.md       — git hooks cannot be skipped
#
# PROVENANCE: the first two are borrowed patterns from affaan-m/ECC's
# PostToolUse / PreToolUse hook set, reimplemented as batch gates suited to
# this repo's harness. See docs/agents/borrowed-guards.md for what was taken,
# what was rejected, and why.
#
# Usage:  bash scripts/guards/run-all.sh
# Exit:   0 = all guards pass, 1 = at least one failed

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

FAILED=()

for guard in lib-sibling-guard config-guard no-bypass-guard; do
  script="scripts/guards/${guard}.sh"
  echo
  if [ ! -f "$script" ]; then
    echo "MISSING: $script — a guard that does not exist cannot guard."
    FAILED+=("$guard (missing)")
    continue
  fi
  if bash "$script"; then
    :
  else
    FAILED+=("$guard")
  fi
done

echo
echo "==========================================================="
if [ "${#FAILED[@]}" -eq 0 ]; then
  echo "GUARDS: PASS — all deterministic rules hold."
  exit 0
fi

echo "GUARDS: FAIL — ${#FAILED[@]} guard(s) reported findings:"
for f in "${FAILED[@]}"; do
  echo "  - $f"
done
echo
echo "These are deterministic findings, not opinions. Fix the cause; do not"
echo "silence the guard. If a rule is genuinely wrong, change the rule file"
echo "and say why in the commit — that is a reviewable act."
exit 1
