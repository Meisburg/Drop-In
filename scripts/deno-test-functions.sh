#!/usr/bin/env bash
# RUN the Deno transport adapter tests — the only lane that can execute
# `smtpDeno.ts` and `fcmDeno.ts`.
#
# WHY THIS EXISTS. `scripts/deno-check-functions.sh` TYPE-checks the Edge
# Functions; it never runs them. `npm run test` (vitest, plain Node) cannot even
# load `supabase/functions/_shared/smtpDeno.ts`, because that file imports
# `npm:nodemailer@6` and a `Deno` global — an `npm:` specifier in the import
# graph is fatal to the Node runner, which is exactly why the client was split
# out of the pure `_shared/smtp.ts`. So the one file that will carry production
# email had no executable evidence at all. This script supplies it: Deno's own
# test runner CAN import `npm:` specifiers, so `smtpDeno_test.ts` runs the REAL
# adapter against an in-process fake SMTP server on 127.0.0.1. No external
# network, no credentials, no new runtime dependency, and it is not a deploy.
#
# SLICE 2b ADDED THE SECOND ENTRYPOINT, `_shared/fcmDeno_test.ts`, for the same
# reason: the FCM adapter is the file that will carry every native notification,
# and a type-checked adapter is not a tested adapter. Its test fakes the two
# ENDPOINTS (`FetchLike`) rather than opening a socket, so it needs no port —
# but it runs through this same staged tree, and its entrypoint is named
# explicitly below, because a test that quietly stops running looks exactly like
# a passing one.
#
# WHY THE TEMP COPY. Identical reason to `deno-check-functions.sh`: the repo has
# no `deno.json`, and adding `supabase/functions/deno.json` would change how the
# Supabase CLI BUNDLES the functions on deploy — a deployment-affecting change
# this script has no business making. `npm:` specifiers need
# `nodeModulesDir: auto`, which must come from a `deno.json` NEXT TO the code, so
# the tree is copied to a scratch dir, a minimal config is dropped there, and the
# whole thing is deleted on exit (trap). The repo is left byte-identical: no
# `deno.json`, no `node_modules`, no lockfile.
#
# Deno discovers `deno.json` by walking up from the CURRENT DIRECTORY, not from
# the entrypoint — so this script cds INTO the staged tree before running. The
# check script documents that trap; do not re-learn it.
#
# Usage: bash scripts/deno-test-functions.sh
# Exit:  0 the adapter tests passed (or deno is absent — this is not a gate)
#        1 one failed, and a wiring bug is live in a production transport
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if ! command -v deno >/dev/null 2>&1; then
  echo "SKIP — deno is not installed, so the transport adapters cannot be executed here."
  echo "       Install: https://docs.deno.com/runtime/getting_started/installation/"
  exit 0
fi

echo "deno $(deno --version 2>/dev/null | head -1 | awk '{print $2}') — running the transport adapter tests"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -r supabase/functions/. "$TMP/" || { echo "FAIL — could not stage supabase/functions"; exit 1; }
printf '{\n  "nodeModulesDir": "auto"\n}\n' > "$TMP/deno.json"

cd "$TMP" || { echo "FAIL — could not enter the staged tree"; exit 1; }

# One entrypoint per Deno-only adapter, named explicitly (not a glob): a test
# that silently stops running is worse evidence than one that fails, so a
# missing file is a FAIL rather than a smaller run.
for entry in _shared/smtpDeno_test.ts _shared/fcmDeno_test.ts; do
  if [ ! -f "$entry" ]; then
    echo "FAIL — $entry is missing from the staged tree."
    exit 1
  fi
done

# Permissions are stated rather than waved through:
#   --allow-net  the fake server listens on 127.0.0.1 and nodemailer dials it
#                (the FCM test needs none of this — it fakes `fetch` — but one
#                permission set covers both entrypoints)
#   --allow-sys  nodemailer asks the OS for the hostname it announces in EHLO
#   --allow-env  importing `npm:nodemailer@6` reads `process.env.ETHEREAL_*` at
#                MODULE LOAD (lib/nodemailer.js:14-17), so without this the
#                import itself dies before a single test runs. Those are
#                nodemailer's own Ethereal defaults, not a secret of ours, and
#                the Supabase Edge runtime grants env anyway.
# `--no-lock`: this run must not write a lockfile even inside the scratch dir.
# nice: this shares a box with a human, and a cold `npm:` graph is not urgent.
nice -n 19 deno test --allow-net --allow-sys --allow-env --no-lock \
  _shared/smtpDeno_test.ts _shared/fcmDeno_test.ts
status=$?

echo
if [ "$status" -eq 0 ]; then
  echo "PASS — the real nodemailer and FCM wiring ran end to end (SMTP against a real conversation, FCM against fake endpoints)."
else
  echo "FAIL — an adapter test failed (exit $status). A deploy would ship this."
fi
exit "$status"
