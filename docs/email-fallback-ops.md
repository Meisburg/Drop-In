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

## The founder's remaining steps

1. `bash scripts/setup-email.sh` — Resend account, domain, Supabase Auth SMTP,
   rate limit, and the `send-push` secrets. **Human-only; an agent cannot create
   the account.**
2. **The domain decision.** Resend's shared `onboarding@resend.dev` sender only
   delivers to the account owner's own address, and `drop-in-mu.vercel.app`
   cannot be verified for sending (we do not control its DNS). Without a domain
   the fallback cannot reach real parents — this is the one hard blocker.
3. Re-run probes 1–3, then watch a real ping land in a real inbox.
4. Real hardware: post a drop-in on one phone, ping it from a second account with
   **no push subscription**, and confirm the email arrives.
