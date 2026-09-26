# Email fallback — deployment state and how to verify it

Read this **when changing `send-push`, when wondering whether the email
fallback is live, or when a notification did not arrive.**

Written 2026-09-26, after the email-fallback batch
(`.scratch/ios-notification-hole/plan.md`) was deployed and verified end to end.

## What is deployed, and what is not

| Piece | State |
|---|---|
| `supabase/migrations/0053_email_optout.sql` | **APPLIED** — `profiles.email_optout`, `boolean NOT NULL DEFAULT false` |
| `supabase/functions/send-push` | **DEPLOYED** — version 3, `verify_jwt: true` |
| `e2e/email-optout.e2e.ts` + 5 unit specs (65 tests) | **GREEN** |
| `RESEND_API_KEY` / `EMAIL_FROM` function secrets | **NOT SET** |
| Sending domain (SPF + DKIM) | **DOES NOT EXIST** |
| Real-device verification | **NOT DONE** |

**The fallback therefore does not deliver anything yet, by design.** The branch
is gated on `EMAIL_ENABLED = RESEND_API_KEY !== '' && EMAIL_FROM !== ''`
(`send-push/index.ts`), so with no secrets the drain takes its original path
byte-for-byte. Confirm that gate before assuming a missing email is a bug.

## The three probes, in the order to run them

### 1. Is the deployed bundle the one you think it is?

```bash
set -a; . ./.env; set +a
REF=$(printf '%s' "$VITE_SUPABASE_URL" | sed -E 's#https?://([^.]+)\..*#\1#')
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$REF/functions/send-push" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['version'],d['status'],d['verify_jwt'],d['ezbr_sha256'])"
```

Compare `ezbr_sha256` before and after a deploy — **an unchanged hash means the
deploy did not take.**

### 2. Is the function live, with its auth wall intact?

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$VITE_SUPABASE_URL/functions/v1/send-push" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" -d '{}'
```

Must be **401** with body `{"error":"send-push is service-role only"}`. A **404**
means *not deployed*. This probe is safe: it proves the function is serving
without draining a single queue row.

### 3. Has the NEW bundle actually executed?

```sql
select status, return_message, start_time
  from cron.job_run_details order by start_time desc limit 3;
select status_code, timed_out, created
  from net._http_response order by created desc limit 3;
```

`status_code: 200` is the proof. Expect a healthy run every 5 minutes.

## The trap that makes probe 3 lie

**A `succeeded` cron tick can be the OLD bundle.** The job runs on a fixed
5-minute cadence, so a deploy that lands *between* ticks has not been exercised
by the next thing you see in `job_run_details`.

This is not hypothetical: the 2026-09-26 deploy completed at **15:00:26**, and
the tick at **15:00:00** — 26 seconds earlier — had already run the old bundle.
The row it stamped looked like post-deploy evidence and was not.

**Always compare:** the deploy's `updated_at` (probe 1, epoch milliseconds)
against the tick's `start_time`. A tick that started *before* the deploy tested
the old code. Wait for the next one — up to 5 minutes — before claiming a deploy
works.

## Operational notes

- **The `error` column is how you debug delivery**, not the net response. Rows
  carry `sent:email` on success and `email failed: <reason>` on a terminal
  failure. A **retryable** failure (429, 5xx, or a network error) deliberately
  leaves `sent_at` NULL so the next tick retries it — **that is not a stuck
  queue**, and stamping it manually would drop the notification forever.
- **`timed_out: false` is worth noticing.** `docs/push-setup.md` records an era
  where every dispatch showed a 5-second pg_net timeout with a null status. The
  2026-09-26 runs return a real `200`, so that note is stale for this function.
- **No new RLS policy was added for `email_optout`**, and none is needed:
  `profiles_update_own` (`0001_create_profiles.sql:25`) already grants the owner
  UPDATE on every column, stated at `0012_zip_radius.sql:682`. Do not add one.
- **`send-push` now sends email too.** The name is retained deliberately:
  renaming means a redeploy plus a `pg_cron` job change. One sender, one drain,
  two transports — a second function draining the same `sent_at is null` rows
  would race this one for them.

## AUTH email is now DONE — over Gmail SMTP, via the API (2026-09-26)

The founder **lost Supabase dashboard access** (the GitHub account behind the
OAuth login was deleted; the live GitHub account `Meisburg` is a different one
and is fine). Auth email was therefore configured **through the Management API
instead**, which works without the dashboard:

```bash
bash scripts/setup-email-api.sh
```

Live and independently re-read afterwards:

| Setting | Value |
|---|---|
| `smtp_host` | `smtp.gmail.com` |
| `smtp_port` | `465` — **sent as a STRING**; the API rejects a number |
| `smtp_user` | `jonmeisburg@gmail.com` |
| `smtp_sender_name` | `Drop In` |
| `rate_limit_email_sent` | **30** (was 2 — the actual bug) |

**TWO API SHARP EDGES, both hit for real:**

1. **`smtp_port` must be a string.** Sending the number 465 yields
   `{"message":"smtp_port: Invalid input: expected string, received number"}`.
2. **The rate limit cannot be set on its own.** A PATCH carrying only
   `rate_limit_email_sent` fails — and the failure is a **401, not a 400**, which
   reads like an auth problem and is not. The body is the tell:
   *"Custom SMTP required to configure SMTP_SENDER_NAME or
   RATE_LIMIT_EMAIL_SENT. Missing SMTP_ADMIN_EMAIL, SMTP_HOST, SMTP_PORT,
   SMTP_USER, SMTP_PASS fields."* Send every SMTP field in the same request.
   `setup-email-api.sh` retries automatically on a type mismatch (a 400 applies
   nothing, so a retry is safe).

**⚠️ `SUPABASE_ACCESS_TOKEN` is now the ONLY working credential on this project.**
It reads *and* writes. Do not rotate or lose it; treat this machine's `.env` as
load-bearing.

**⚠️ AUTH LOGS ARE NOT AVAILABLE THROUGH THE API.** The old
`/analytics/endpoints/logs.all` endpoint was removed on 2026-09-23; the
replacement `/analytics/endpoints/logs` takes ClickHouse SQL over a single
unified `logs` table (`WHERE source_name = 'auth_logs'`), but for this project it
answers `{"error":"Backend error! Retry your query."}` to **every** query —
including a bare `SELECT 1`. So while the dashboard is unreachable there is **no
log-based diagnosis of a missing email**; the only proof is the message arriving.

## Still outstanding

1. **✅ AUTH EMAIL IS PROVEN END TO END (2026-09-26).** A real password reset
   arrived in a real inbox: sender `Drop In <jonmeisburg@gmail.com>`, delivered to
   the **inbox, not spam**, in under a minute. The link's destination was also
   verified rather than assumed — `site_url` is
   `https://drop-in-mu.vercel.app` (the `localhost:3000` bug `beta-checklist.md`
   warned about was fixed long ago), the site is in `uri_allow_list`, and
   `/reset-password` serves HTTP 200 on the deployed app. **The "2 emails per
   hour, project-wide" wall is gone.** Note that `uri_allow_list` deliberately
   still carries the localhost and `192.168.1.61` entries — that is the
   documented intent, not drift.
2. **`RESEND_API_KEY` / `EMAIL_FROM` function secrets** — **STILL NOT SET**, so
   the *notification* email fallback built in slices 1–4 still delivers nothing.
   That path speaks Resend's HTTP API and would need a sending domain.
3. **Sending domain (SPF + DKIM)** — still does not exist. This is the blocker
   for the notification half, not the auth half.
4. **Real-device verification** — not done.
5. **Recover the Supabase dashboard** — create a GitHub account on the same
   email, or mail `support@supabase.com` from a different address. Needed for
   billing, logs, and settings even though email no longer depends on it.
6. **`git push` does not deploy** — the frontend half of the email feature is
   pushed but not live. See the deploy note in `task-state.md`.


