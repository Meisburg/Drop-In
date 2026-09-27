#!/usr/bin/env bash
# Type-check every Supabase Edge Function in its REAL runtime (Deno).
#
# WHY THIS EXISTS: `npm run typecheck` is `tsc -b`, and it does NOT cover
# `supabase/functions/`. Those files use Deno globals (`Deno.env`, `Deno.serve`)
# and `npm:` specifiers that tsc cannot resolve, so until this script existed an
# edit to an Edge Function was verified only by `npm run lint` (which is not a
# type check) and by reading it. That is how the V8-era email-fallback slice
# shipped a `drain()` rewrite whose only evidence was "typecheck plus
# inspection" — true, but tsc had never seen the file.
#
# WHAT IT DOES NOT DO: it does not run the function and it does not prove runtime
# behaviour. It proves the file TYPES in the runtime that will execute it, which
# is strictly more than tsc ever did. The email-fallback branch in `send-push` is
# still only executed for real once RESEND_API_KEY + EMAIL_FROM exist.
#
# WHY THE TEMP COPY: the repo has no `deno.json`, and adding
# `supabase/functions/deno.json` would change how the Supabase CLI BUNDLES the
# functions on deploy — a deployment-affecting change this script has no business
# making. So it copies the tree to a scratch dir, drops a minimal `deno.json`
# there, and checks in isolation. The real `supabase/functions/` is untouched,
# and neither the repo's `node_modules` nor its lockfile is touched.
#
# Usage: bash scripts/deno-check-functions.sh
# Exit:  0 all functions type-check (or deno is absent — this is not a gate)
#        1 at least one function failed to type-check
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if ! command -v deno >/dev/null 2>&1; then
  echo "SKIP — deno is not installed, so the Edge Functions cannot be type-checked here."
  echo "       Install: https://docs.deno.com/runtime/getting_started/installation/"
  exit 0
fi

echo "deno $(deno --version 2>/dev/null | head -1 | awk '{print $2}') — type-checking supabase/functions/"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -r supabase/functions/. "$TMP/" || { echo "FAIL — could not stage supabase/functions"; exit 1; }
printf '{\n  "nodeModulesDir": "auto"\n}\n' > "$TMP/deno.json"

# Deno discovers `deno.json` by walking up from the CURRENT DIRECTORY, not from
# the entrypoint. Running `deno check /tmp/xxx/send-push/index.ts` from the repo
# root therefore never sees the staged config and fails to resolve `npm:web-push`
# — which is exactly how this script failed its first run. Entering the staged
# tree is the fix, so every path below is relative.
cd "$TMP" || { echo "FAIL — could not enter the staged tree"; exit 1; }

fail=0
checked=0
shopt -s nullglob
for dir in ./*/; do
  name="$(basename "$dir")"
  # _shared holds modules, not an entrypoint. Nothing to serve, so nothing to check
  # on its own — it is checked transitively by every function that imports it.
  [ "$name" = "_shared" ] && continue
  [ -f "${dir}index.ts" ] || continue

  checked=$((checked + 1))
  # nice: this shares a box with a human, and a cold deno check downloads a module
  # graph. There is no latency requirement on a check.
  if nice -n 19 deno check --quiet "${dir}index.ts" >/dev/null 2>&1; then
    printf '  ok    %s\n' "$name"
  else
    printf '  FAIL  %s\n' "$name"
    nice -n 19 deno check "${dir}index.ts" 2>&1 | tail -20 | sed 's/^/        /'
    fail=1
  fi
done

if [ "$checked" -eq 0 ]; then
  echo "FAIL — found no function entrypoints under supabase/functions/. Did the layout change?"
  exit 1
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "PASS — all $checked Edge Function(s) type-check in Deno."
else
  echo "FAIL — at least one Edge Function does not type-check. A deploy would ship this."
fi
exit "$fail"
