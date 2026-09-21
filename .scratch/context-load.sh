#!/usr/bin/env bash
# Measure the ALWAYS-ON steering payload: what every agent pays for on every
# model provider request before it reads a single line of code.
#
# Rationale (AI Coding Crash Course, ep. 28/45/53): anything pushed up front is
# paid for on EVERY request, in tokens AND in attention. Measure it or it grows.
#
# Local builder window is 98k (qwen3.8-27b, ~/.dsh/settings.yaml) — NOT 150k.
#
# Usage:  bash .scratch/context-load.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

WINDOW=98304
total=0
printf '%-46s %8s %9s\n' "FILE" "WORDS" "~TOKENS"
printf '%-46s %8s %9s\n' "----------------------------------------------" "--------" "---------"

report() {  # $1=label $2...=files
  local label="$1"; shift
  echo
  echo "== $label =="
  local w
  for f in "$@"; do
    [ -f "$f" ] || continue
    w=$(wc -w < "$f")
    printf '%-46s %8s %9s\n' "$f" "$w" "$((w * 3 / 4))"
    total=$(( total + w * 3 / 4 ))
  done
}

report "PUSHED into every session" AGENTS.md
report "PUSHED per agent (opencode definitions)" .opencode/agents/*.md

# Pointed-to files cost nothing until read. Reported for inventory only — they
# are deliberately EXCLUDED from the always-on total, which is the whole point
# of the doc-plus-pointer pattern (course ep. 45/47).
echo
echo "== POINTED TO (read on demand — NOT counted in the total) =="
for f in docs/agents/*.md; do
  [ -f "$f" ] || continue
  printf '%-46s %8s %9s\n' "$f" "$(wc -w < "$f")" "$(( $(wc -w < "$f") * 3 / 4 ))"
done

echo
echo "-----------------------------------------------------------"
printf 'ALWAYS-ON TOTAL: ~%s tokens  (of a %sk local builder window = %s%%)\n' \
  "$total" "$(( WINDOW / 1024 ))" "$(( total * 100 / WINDOW ))"
echo
echo "Aim: keep the always-on total under ~5% of the local window."

# --- Navigation-pointer rot check -------------------------------------------
# A stale pointer is worse than no pointer: the agent trusts it, wastes tokens
# following it, then wastes more figuring out why it is wrong (course ep. 52).
#
# Paths that are RUNTIME OUTPUTS are expected to be absent before their lane
# runs — that is not rot. Anything else that does not resolve IS rot.
ALLOW_ABSENT=(
  'CONTEXT.md'    # created lazily by /domain-modeling (docs/agents/domain.md)
  'routes.json'   # written by the playtest lane into .scratch/playtest/
  'verdict.md'    # written by the playtest lane
)

is_allowed_absent() {
  local p="$1" a
  for a in "${ALLOW_ABSENT[@]}"; do [ "$p" = "$a" ] && return 0; done
  return 1
}

echo
echo "Navigation pointers:"
rot=0
while read -r p; do
  [ -z "$p" ] && continue
  [ -e "$p" ] && continue
  if is_allowed_absent "$p"; then
    printf '  ok (lazy/runtime)  %s\n' "$p"
  else
    printf '  STALE POINTER:     %s\n' "$p"
    rot=1
  fi
done < <(grep -ohE '`[a-zA-Z0-9_./-]+\.(md|sh|json|ts)`' AGENTS.md 2>/dev/null \
           | tr -d '`' | sort -u)

[ "$rot" -eq 0 ] && echo "  all pointers resolve (or are lazily created)."
exit 0
