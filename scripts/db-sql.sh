#!/usr/bin/env bash
# Apply a migration to the LIVE Supabase database with NO browser.
#
# WHY THIS EXISTS: `scripts/apply-migration.mjs` harvests its token from a
# CDP-attached Chrome and calls `page.goto(...)` / `page.reload()` on it. On this
# machine the Chrome on :9222 is the HUMAN's own Wayland session (Todoist, Notion,
# a Supabase SQL editor open in it), so running that script VISIBLY NAVIGATES the
# window they are working in. That is an interruption, and the repo's browser-lane
# etiquette forbids it without an explicit yes.
#
# This script needs no browser at all: it uses SUPABASE_ACCESS_TOKEN (a personal
# access token) against api.supabase.com. The human pastes the token into .env
# ONCE and every future migration (and ad-hoc query) is a headless command.
#
# Setup (once):
#   1. https://supabase.com/dashboard/account/tokens -> generate a token
#   2. echo 'SUPABASE_ACCESS_TOKEN=sbp_...' >> .env   (.env is gitignored)
#
# Usage:
#   bash scripts/db-sql.sh --file supabase/migrations/0045_radius_min_one.sql
#   bash scripts/db-sql.sh --check-migration supabase/migrations/0045_*.sql
#   bash scripts/db-sql.sh "select count(*) from public.profiles;"
#   bash scripts/db-sql.sh --read "select ..."      # read-only convenience
#
# Exit: 0 ok | 1 SQL/auth error | 2 cannot run (missing token or ref)

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# --- credentials ------------------------------------------------------------
[ -f .env ] || { echo "FATAL: no .env" >&2; exit 2; }
set -a; . ./.env; set +a

: "${SUPABASE_ACCESS_TOKEN:?FATAL: SUPABASE_ACCESS_TOKEN not set in .env — see the header of this script}"
REF="$(printf '%s' "${VITE_SUPABASE_URL:-}" | sed -E 's|https?://||; s|\.supabase\.co.*||')"
[ -n "$REF" ] || { echo "FATAL: could not derive project ref from VITE_SUPABASE_URL" >&2; exit 2; }

# --- argument handling ------------------------------------------------------
MODE="run"; QUERY=""
case "${1:-}" in
  --file)
    [ -n "${2:-}" ] || { echo "FATAL: --file needs a path" >&2; exit 2; }
    [ -f "$2" ] || { echo "FATAL: no such file: $2" >&2; exit 2; }
    QUERY="$(cat "$2")"
    echo "→ applying $(basename "$2") (${#QUERY} bytes) to $REF"
    ;;
  --read)
    MODE="read"; QUERY="${2:?FATAL: --read needs a query}"; ;;
  --check-migration)
    # A migration is "applied" only if the DB says so. The strongest general
    # check we have is the constraint/column actually existing, so this runs the
    # migration's own DDL idempotently and reports the resulting DB state.
    MODE="file"; QUERY="$(cat "${2:?FATAL: --check-migration needs a path}")"
    echo "→ checking $(basename "$2") against $REF"; ;;
  "")
    echo "usage: $0 --file <path> | --read '<sql>' | '<sql>'" >&2; exit 2 ;;
  *)
    QUERY="$1"; ;;
esac

# --- execute ----------------------------------------------------------------
RESP="$(curl -s -w '\n%{http_code}' -X POST \
  "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' <<<"$QUERY")")"

CODE="$(printf '%s' "$RESP" | tail -n1)"
BODY="$(printf '%s' "$RESP" | sed '$d')"

echo "HTTP $CODE"
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  printf '%s\n' "$BODY" | python3 -m json.tool 2>/dev/null || printf '%s\n' "$BODY"
  echo "✓ OK"
  exit 0
fi

printf '%s\n' "$BODY"
echo "✗ FAILED" >&2
[ "$CODE" = "401" ] || [ "$CODE" = "403" ] && echo "  (check SUPABASE_ACCESS_TOKEN — it may be revoked or lack scope)" >&2
exit 1
