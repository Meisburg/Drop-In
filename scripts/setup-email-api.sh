#!/usr/bin/env bash
#
# Configure Supabase Auth to send through Gmail SMTP — through the Management
# API, with NO dashboard login.
#
# WHY THIS EXISTS: the Supabase dashboard can become unreachable when the OAuth
# identity behind it goes away (a deleted GitHub account, a converted org). On
# 2026-09-26 that happened to this project, and the dashboard answered "You do
# not have access to this project". But `SUPABASE_ACCESS_TOKEN` — which lives in
# .env and is a SUPABASE credential, not a GitHub one — still READS and WRITES
# the auth config. So the whole SMTP setup is reachable without the dashboard.
#
# It replaces wizard stages 3 AND 4 (docs/email-fallback-ops.md): the API
# refuses to set the email rate limit unless the SMTP fields arrive in the SAME
# request —
#
#   "Custom SMTP required to configure SMTP_SENDER_NAME or
#    RATE_LIMIT_EMAIL_SENT. Missing SMTP_ADMIN_EMAIL, SMTP_HOST, SMTP_PORT,
#    SMTP_USER, SMTP_PASS fields."
#
# — which is why this sends everything in one PATCH.
#
# THE SECRET NEVER TOUCHES THE COMMAND LINE. The app password is read with a
# hidden prompt, written to a mode-0600 temp file, and handed to curl as
# `-d @file` so it never appears in `ps` output or in your shell history. The
# file is removed on every exit path.
#
# Usage:  bash scripts/setup-email-api.sh
# Exit:   0 configured and verified | 1 failed | 2 cannot run (no token/ref)

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

SMTP_HOST="${SMTP_HOST:-smtp.gmail.com}"
SMTP_PORT="${SMTP_PORT:-465}"
RATE_LIMIT="${RATE_LIMIT:-30}"

die()  { printf '\n  ✗ %s\n\n' "$1" >&2; exit "${2:-1}"; }
ok()   { printf '  ✓ %s\n' "$1"; }
info() { printf '  %s\n' "$1"; }
warn() { printf '  ⚠ %s\n' "$1"; }

printf '\n  Supabase auth email via Gmail SMTP (Management API — no dashboard)\n\n'

# ── credentials ────────────────────────────────────────────────────────────
[ -f .env ] || die "no .env in $(pwd)" 2
set -a; . ./.env; set +a

# Plain check, NOT `${VAR:?...}`: under `set -u` that form kills the shell
# outright, so the `|| die` never runs and `2>/dev/null` would swallow the very
# message explaining why. (Caught before the first run.)
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  die "SUPABASE_ACCESS_TOKEN not set in .env — see the header of scripts/db-sql.sh" 2
fi

REF="$(printf '%s' "${VITE_SUPABASE_URL:-}" | sed -E 's|https?://||; s|\.supabase\.co.*||')"
[ -n "$REF" ] || die "could not derive the project ref from VITE_SUPABASE_URL" 2
info "project ref: $REF"

# ── is the token actually able to write? ───────────────────────────────────
CODE=$(curl -s -o /tmp/dsh_authcfg.json -w '%{http_code}' \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  "https://api.supabase.com/v1/projects/${REF}/config/auth" 2>/dev/null)
[ "$CODE" = "200" ] || die "could not read the auth config (HTTP $CODE). Is the token still valid?" 2

python3 - <<'PY' 2>/dev/null || true
import json
d = json.load(open('/tmp/dsh_authcfg.json'))
print('  current: smtp_host=%s  rate_limit_email_sent=%s' % (d.get('smtp_host'), d.get('rate_limit_email_sent')))
PY

# ── the Gmail address ──────────────────────────────────────────────────────
EXISTING_ADDR="$(grep -E '^GMAIL_SENDER_ADDRESS=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
if [ -n "$EXISTING_ADDR" ]; then
  printf '  Gmail address [%s]: ' "$EXISTING_ADDR"
else
  printf '  Gmail address (the account you will send from): '
fi
read -r GMAIL_ADDR || true
[ -n "$GMAIL_ADDR" ] || GMAIL_ADDR="$EXISTING_ADDR"
case "$GMAIL_ADDR" in
  *@*) : ;;
  *) die "that does not look like an email address" 2 ;;
esac

# ── the app password (hidden) ──────────────────────────────────────────────
printf '  App password (hidden; spaces are fine, they get stripped): '
read -rs APP_PASS || true
printf '\n'
APP_PASS="$(printf '%s' "$APP_PASS" | tr -d '[:space:]')"
[ -n "$APP_PASS" ] || die "no app password entered" 2
if [ "${#APP_PASS}" -ne 16 ]; then
  warn "that is ${#APP_PASS} characters, not 16. Google app passwords are exactly 16."
  printf '  Use it anyway? [y/N] '
  read -r GO || true
  [[ "$GO" =~ ^[Yy] ]] || die "aborted — make a fresh app password at https://myaccount.google.com/apppasswords" 2
fi

printf '\n'
info "will set:"
info "  smtp_host            = ${SMTP_HOST}"
info "  smtp_port            = ${SMTP_PORT}"
info "  smtp_user            = ${GMAIL_ADDR}"
info "  smtp_admin_email     = ${GMAIL_ADDR}"
info "  smtp_sender_name     = Drop In"
info "  rate_limit_email_sent= ${RATE_LIMIT}"
info "  smtp_pass            = (hidden, ${#APP_PASS} chars)"
printf '\n  Apply this? [y/N] '
read -r GO || true
[[ "$GO" =~ ^[Yy] ]] || die "aborted — nothing changed" 0

# ── build the body OFF the command line ────────────────────────────────────
BODY="$(mktemp)"; chmod 600 "$BODY"
cleanup() { rm -f "$BODY" /tmp/dsh_authcfg.json /tmp/dsh_authresp.json; }
trap cleanup EXIT

GMAIL_ADDR="$GMAIL_ADDR" APP_PASS="$APP_PASS" SMTP_HOST="$SMTP_HOST" \
SMTP_PORT="$SMTP_PORT" RATE_LIMIT="$RATE_LIMIT" BODY="$BODY" python3 - <<'PY' \
  || die "could not build the request body" 2
import json, os
body = {
    "smtp_host": os.environ["SMTP_HOST"],
    "smtp_port": int(os.environ["SMTP_PORT"]),
    "smtp_user": os.environ["GMAIL_ADDR"],
    "smtp_pass": os.environ["APP_PASS"],
    "smtp_admin_email": os.environ["GMAIL_ADDR"],
    "smtp_sender_name": "Drop In",
    "rate_limit_email_sent": int(os.environ["RATE_LIMIT"]),
}
with open(os.environ["BODY"], "w") as fh:
    json.dump(body, fh)
PY

printf '\n  sending PATCH...\n'
CODE=$(curl -s -o /tmp/dsh_authresp.json -w '%{http_code}' -X PATCH \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary "@${BODY}" \
  "https://api.supabase.com/v1/projects/${REF}/config/auth" 2>/dev/null)

if [ "$CODE" != "200" ]; then
  printf '\n'
  warn "HTTP $CODE — the API rejected it. Its message, verbatim:"
  printf '\n'
  head -c 600 /tmp/dsh_authresp.json 2>/dev/null; printf '\n\n'
  case "$CODE" in
    401|403) warn "This is an auth/scope problem: the token may have been revoked or is read-only." ;;
    422|400) warn "This is a validation problem: re-read the message above — it names the missing field." ;;
  esac
  die "nothing was changed" 1
fi
ok "PATCH accepted (HTTP 200)"

# ── verify by READING IT BACK — never trust the write's own success ────────
printf '\n  re-reading the config to verify...\n'
curl -s -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  "https://api.supabase.com/v1/projects/${REF}/config/auth" -o /tmp/dsh_authcfg.json 2>/dev/null

python3 - <<'PY' || die "could not parse the read-back" 1
import json
d = json.load(open('/tmp/dsh_authcfg.json'))
host, port, user = d.get('smtp_host'), d.get('smtp_port'), d.get('smtp_user')
rate, sender = d.get('rate_limit_email_sent'), d.get('smtp_sender_name')
print('  smtp_host             =', host)
print('  smtp_port             =', port)
print('  smtp_user             =', user)
print('  smtp_sender_name      =', sender)
print('  rate_limit_email_sent =', rate)
ok = (host == 'smtp.gmail.com' and rate == 30)
print()
print('  ✓ VERIFIED — Gmail SMTP is live and the rate limit is 30/hr.' if ok
      else '  ✗ NOT what was intended — re-read the values above.')
raise SystemExit(0 if ok else 1)
PY
VERIFY=$?

# ── record the address locally (the password stays out of the repo) ────────
if [ "$VERIFY" -eq 0 ]; then
  if grep -qE '^GMAIL_SENDER_ADDRESS=' .env 2>/dev/null; then
    TMP="$(mktemp)"; grep -vE '^GMAIL_SENDER_ADDRESS=' .env > "$TMP" || true
    printf 'GMAIL_SENDER_ADDRESS=%s\n' "$GMAIL_ADDR" >> "$TMP"; mv "$TMP" .env
  else
    printf 'GMAIL_SENDER_ADDRESS=%s\n' "$GMAIL_ADDR" >> .env
  fi
  ok "wrote GMAIL_SENDER_ADDRESS to .env (the app password is deliberately NOT stored)"
  printf '\n'
  info "NEXT — prove it end to end:"
  info "  1. go to https://drop-in-mu.vercel.app/login"
  info "  2. click 'Forgot password' and use your own address"
  info "  3. the mail should arrive in seconds (check spam on the very first one)"
  printf '\n'
  warn "If it does NOT arrive, Supabase → Authentication → Logs is unreachable for you"
  warn "right now. Instead re-run this script's read-back, or check"
  warn "docs/email-fallback-ops.md for the API-side diagnosis."
  printf '\n'
fi

exit "$VERIFY"
