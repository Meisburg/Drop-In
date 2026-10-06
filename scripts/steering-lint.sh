#!/usr/bin/env bash
# Steering-layer lint — the review lane for the files `ocr` cannot see.
#
# WHY THIS EXISTS: the third review lane (`ocr`) is a CODE reviewer. It skips
# `.md`, agent definitions, and config as `unsupported_ext`, so AGENTS.md,
# `docs/agents/*`, and `.opencode/agents/*` are reviewed by NOTHING. Those are
# precisely the files that steer every slice — an error here is paid for on
# every request by every agent, and unlike a code defect it never surfaces as a
# failing test.
#
# It checks the three failure modes the crash course names (ep. 45/52/53):
#   1. NO-OPS        — instructions that change nothing.
#   2. DUPLICATION   — the same fact in two places, which makes the agent trust
#                      whichever copy it read first.
#   3. STALE POINTERS — a pointer to a file that does not exist. "A stale
#                      highway is worse than no highway": the agent trusts it,
#                      burns tokens following it, then burns more recovering.
#
# Usage:  bash scripts/steering-lint.sh
# Exit:   0 = clean, 1 = findings
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

FAIL=0
note() { printf '%s\n' "$*"; }
fail() { FAIL=1; printf '  FINDING: %s\n' "$*"; }

# Steering files = everything pushed or pointed-to that shapes agent behaviour.
STEERING_FILES=(
  AGENTS.md
  plan.template.md
  task-state.template.md
)
while IFS= read -r f; do STEERING_FILES+=("$f"); done < <(ls docs/agents/*.md 2>/dev/null)
while IFS= read -r f; do STEERING_FILES+=("$f"); done < <(ls .opencode/agents/*.md 2>/dev/null)

echo "Steering-layer lint — ${#STEERING_FILES[@]} file(s)"
echo "==========================================================="

# --- 1. Stale pointers ------------------------------------------------------
# A POINTER is a backticked path containing a directory separator. A bare
# filename (`trust.ts`, `db.ts`) is a mention in prose, not a pointer — flagging
# those is the false-positive class that makes a lint untrustworthy, so we
# require a '/' in the path.
#
# Paths that are RUNTIME OUTPUTS are legitimately absent before their lane runs.
ALLOW_ABSENT=(
  'CONTEXT.md'     # created lazily by /domain-modeling (docs/agents/domain.md)
  'CONTEXT-MAP.md' # same, multi-context form
  'docs/adr'       # created lazily by /domain-modeling
  'routes.json'    # written by the playtest lane into .scratch/playtest/
  'verdict.md'     # written by the playtest lane
  'verdict.json'   # written by the playtest lane
  # V23 CI: MACHINE-LOCAL STATE THAT CANNOT EXIST IN A FRESH CLONE.
  # `supabase/.temp/linked-project.json` is written by `supabase link` and is
  # GITIGNORED (.gitignore:94), so it exists on a developer machine and NEVER in
  # CI. The steering layer legitimately MENTIONS it — auto-push.md:33 tells the
  # story of a slice that committed it by accident — and that mention is a
  # pointer by this lint's rule (a backticked path with a separator), so the
  # first CI run this repo ever had failed on a file it could not possibly
  # create. Found by running the gate in a simulated fresh clone rather than by
  # reading the script.
  'supabase/.temp/linked-project.json'
  # V32 CI (2026-10-05): THE SAME CLASS AGAIN, AND THE SAME MISTAKE MADE AGAIN.
  # `e2e/.auth/marker-state.json` is the marker session the e2e suite's own
  # `auth.setup` writes; it is GITIGNORED, so it exists on any machine that has
  # run the suite and NEVER in a fresh clone. docs/agents/browser-lanes.md now
  # names it — correctly, because `scripts/signed-in-audit.mjs` needs it and says
  # so — and that made a locally-green gate RED IN CI: this box had the file, the
  # runner never could. The lesson the V23 entry above records was not applied,
  # which is why it is recorded again here with the same fix rather than a
  # cleverer one.
  'e2e/.auth/marker-state.json'
)
is_allowed_absent() {
  local p="$1" a
  for a in "${ALLOW_ABSENT[@]}"; do
    [ "$p" = "$a" ] && return 0
    case "$p" in "$a"/*) return 0 ;; esac
  done
  return 1
}

echo
echo "[1] Stale navigation pointers"
ptr_fail=0
while IFS= read -r p; do
  [ -z "$p" ] && continue
  case "$p" in
    */*) ;;                 # must contain a separator to be a path
    *) continue ;;          # bare filename = prose mention, not a pointer
  esac
  case "$p" in
    http*|/*|*'<'*|*'>'*|*'*'*) continue ;;
  esac
  [ -e "$p" ] && continue
  is_allowed_absent "$p" && continue
  fail "pointer to a non-existent path: $p"
  ptr_fail=1
done < <(grep -ohE '`[a-zA-Z0-9_][a-zA-Z0-9_./-]*/[a-zA-Z0-9_./-]+\.(md|sh|json|ts|py|mjs)`' \
           "${STEERING_FILES[@]}" 2>/dev/null | tr -d '`' | sort -u)
[ "$ptr_fail" -eq 0 ] && note "  ok — every pointer resolves (or is lazily created)"

# --- 2. Size ceilings -------------------------------------------------------
# Cheap proxy for context load. Exceeding these is not always wrong, but it
# should be a decision, not an accident.
echo
echo "[2] Size ceilings (words)"
declare -A CEIL=(
  ["AGENTS.md"]=1800
  ["docs/agents/coordinator.md"]=900
)
for f in "${!CEIL[@]}"; do
  [ -f "$f" ] || continue
  w=$(wc -w < "$f")
  if [ "$w" -gt "${CEIL[$f]}" ]; then
    fail "$f is $w words (ceiling ${CEIL[$f]}) — prune or split behind a pointer"
  else
    note "  ok — $f ($w words, ceiling ${CEIL[$f]})"
  fi
done

# --- 3. Duplicate facts -----------------------------------------------------
# The course's test: is this fact stated in more than one authoritative place?
# Heuristic — a pointer to a doc that is ALSO fully restated in AGENTS.md.
echo
echo "[3] Reachability of steering docs"
if [ -f AGENTS.md ]; then
  # Each docs/agents/*.md should be reachable from AGENTS.md's pointer table.
  # EXCEPT reports/records, which are not steering and need no pointer.
  not_steering() {
    case "$(basename "$1")" in
      course-review-*.md|*-review-*.md|changelog*.md|*-notes-*.md) return 0 ;;
    esac
    return 1
  }
  reach_fail=0
  for doc in docs/agents/*.md; do
    [ -f "$doc" ] || continue
    not_steering "$doc" && continue
    base=$(basename "$doc")
    if ! grep -q "$base" AGENTS.md; then
      fail "$doc is not pointed to from AGENTS.md — unreachable steering"
      reach_fail=1
    fi
  done
  [ "$reach_fail" -eq 0 ] && note "  ok — every steering doc is reachable from AGENTS.md"
fi

# --- 4. No-op scan ----------------------------------------------------------
# Instructions that assert something the tooling already guarantees, or that
# restate a fact trivially visible from the filesystem. Cheap keyword probe —
# it reports candidates for a human/agent to judge, never auto-deletes.
echo
echo "[4] No-op candidates (review, do not auto-delete)"
NOOP_HITS=$(grep -inE '^[[:space:]]*[-*]?[[:space:]]*(remember to|always remember|don.t forget|be sure to)[[:space:]]' \
  "${STEERING_FILES[@]}" 2>/dev/null | head -10 || true)
if [ -n "$NOOP_HITS" ]; then
  printf '%s\n' "$NOOP_HITS" | sed 's/^/  candidate: /'
  note "  (judge each: does deleting it change behaviour? if not, it is a no-op)"
else
  note "  ok — no obvious no-op phrasing"
fi

echo
echo "==========================================================="
if [ "$FAIL" -eq 0 ]; then
  echo "PASS — steering layer is clean."
  exit 0
fi
echo "FAIL — findings above. The steering layer steers EVERY slice; fix it."
exit 1
