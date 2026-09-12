#!/usr/bin/env bash
# Deploy the push sender and set its secrets (V8 ticket 08, step 3 of
# docs/push-setup.md) — WITHOUT the private key ever being typed, echoed, or
# pasted anywhere. It reads the keypair from `.env.push.local` (gitignored,
# 0600) and pipes the values straight into the Supabase CLI.
#
# Usage:
#   npx supabase login                      # once, on this machine
#   bash scripts/push-deploy.sh             # sets the 3 secrets, deploys, prints the checks
#
# What it does NOT do: create the keypair (that is a one-time local step —
# `node -e` with `generateKeyPairSync("ec", { namedCurve: "prime256v1" })`, or
# `npx web-push generate-vapid-keys`), and it does not create the 5-minute
# schedule (step 4 — do that in the dashboard, which sends the service-role key
# for you instead of putting it in a shell).
#
# The private key is read into a shell variable and passed as an argument. It is
# never printed: `set -x` is deliberately not used, and the CLI does not echo
# secret values back.
set -euo pipefail

REF="ayzvjwxbxyrcgyoeaxuk"
KEYFILE=".env.push.local"
SUBJECT="${VAPID_SUBJECT:-mailto:jonmeisburg@gmail.com}"

[ -f "$KEYFILE" ] || {
  echo "No $KEYFILE — generate a keypair first (docs/push-setup.md step 1)." >&2
  exit 1
}

PUB="$(grep -m1 '^VAPID_PUBLIC_KEY=' "$KEYFILE" | cut -d= -f2-)"
PRIV="$(grep -m1 '^VAPID_PRIVATE_KEY=' "$KEYFILE" | cut -d= -f2-)"
[ -n "$PUB" ] && [ -n "$PRIV" ] || {
  echo "$KEYFILE is missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY." >&2
  exit 1
}

command -v npx >/dev/null || { echo "npx not found." >&2; exit 1; }

echo "→ project: $REF"
echo "→ public key: ${PUB:0:12}… (${#PUB} chars)"
echo "→ private key: present in $KEYFILE (not printed)"
echo

echo "→ setting the function secrets…"
npx supabase secrets set \
  VAPID_PUBLIC_KEY="$PUB" \
  VAPID_PRIVATE_KEY="$PRIV" \
  VAPID_SUBJECT="$SUBJECT" \
  --project-ref "$REF"

echo
echo "→ deploying send-push (JWT verification stays ON — the function has its own service-role wall too)…"
npx supabase functions deploy send-push --project-ref "$REF"

echo
echo "Done. Two checks to run now (docs/push-setup.md step 5):"
echo
echo "1) the function answers, and ONLY for the service role:"
echo "   curl -i -X POST https://$REF.supabase.co/functions/v1/send-push \\"
echo "     -H \"Authorization: Bearer \$SERVICE_ROLE_KEY\" -d '{}' \\"
echo "     -H 'Content-Type: application/json'    # expect 200 {\"ok\":true,…}"
echo "   curl -i -X POST https://$REF.supabase.co/functions/v1/send-push \\"
echo "     -H \"Authorization: Bearer \$ANON_KEY\" -d '{}' \\"
echo "     -H 'Content-Type: application/json'    # expect 401 service-role only"
echo
echo "2) then schedule it every 5 minutes (step 4):"
echo "   Dashboard → Edge Functions → send-push → Schedules → */5 * * * *"
echo "   (the dashboard sends the service-role key for you — prefer this over the"
echo "    pg_cron variant, which would put that key in a SQL statement)"
