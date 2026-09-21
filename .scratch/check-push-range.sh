#!/usr/bin/env bash
# Auto-push "clean range" check (AGENTS.md, Auto-push rule 2).
#
# WHY THIS IS A SCRIPT AND NOT A COMMAND IN A HEADER COMMENT: on 2026-09-21 a
# slice ran `git add -A supabase/` and committed
# supabase/.temp/linked-project.json -- machine-local Supabase CLI state naming
# the project ref and org id. The agent then checked the pushed range with a
# hand-typed regex that omitted `supabase/.temp/`, and reported "clean". The
# rule was ALREADY correct; the check was not. A safety check typed from memory
# is not a check, so this applies the whole rule mechanically.
#
# Usage:  bash .scratch/check-push-range.sh [--verbose]
# Exit:   0 = range is clean, safe to push
#         1 = a forbidden path is in the range (DO NOT PUSH)
#         2 = cannot run (no upstream ref)
#
# The rule (AGENTS.md rule 2): `git diff --name-only origin/master..HEAD` must
# list only the slice's intended files, with zero local-only artifacts.

set -uo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "FATAL: not inside a git repository" >&2
  exit 2
}
cd "$REPO" || exit 2

UPSTREAM="origin/master"
git rev-parse --verify --quiet "$UPSTREAM" >/dev/null || {
  echo "FATAL: no '$UPSTREAM' ref -- fetch first, or pass the right upstream" >&2
  exit 2
}

VERBOSE=0
[ "${1:-}" = "--verbose" ] && VERBOSE=1

# The forbidden set, from AGENTS.md rule 2. Kept as an explicit list of
# gitignore-style patterns rather than one clever regex, so a reader can compare
# it line-by-line against the rule in AGENTS.md. Add to BOTH when the rule grows.
FORBIDDEN=(
  '(^|/)\.agents/'
  '^opencode\.json$'
  '^supabase/\.temp/'
  '^\.scratch/.*\.(cjs|mjs|html)$'
  '^\.qa/'
  '^test-results/'
  '^dist/'
  '^node_modules/'
  '(^|/)\.env$'
  '^\.env\.push\.local$'
  '^\.vercel/'
  '(^|/)tsconfig\.sw\.json$'
)

RANGE="$(git diff --name-only "$UPSTREAM"..HEAD)"
COUNT="$(printf '%s\n' "$RANGE" | grep -c . || true)"

if [ "$COUNT" -eq 0 ]; then
  echo "EMPTY RANGE: nothing to push ($UPSTREAM..HEAD)."
  exit 0
fi

VIOLATIONS=""
while IFS= read -r path; do
  [ -z "$path" ] && continue
  for pat in "${FORBIDDEN[@]}"; do
    if printf '%s' "$path" | grep -Eq "$pat"; then
      VIOLATIONS="${VIOLATIONS}${path}   <- matches forbidden: ${pat}"$'\n'
      break
    fi
  done
done <<< "$RANGE"

if [ "$VERBOSE" -eq 1 ] || [ -n "$VIOLATIONS" ]; then
  echo "Range $UPSTREAM..HEAD ($COUNT file(s)):"
  printf '%s\n' "$RANGE" | sed 's/^/  /'
  echo
fi

if [ -n "$VIOLATIONS" ]; then
  echo "FAIL: forbidden local-only artifacts in the pushed range:"
  printf '%s' "$VIOLATIONS" | sed 's/^/  /'
  echo
  echo "DO NOT PUSH. Untrack them (git rm --cached), add a .gitignore rule,"
  echo "and re-run. A slice's own migration under supabase/migrations/ IS"
  echo "intended and is not listed above."
  exit 1
fi

echo "PASS: range is clean ($COUNT file(s), no forbidden artifacts)."
exit 0
