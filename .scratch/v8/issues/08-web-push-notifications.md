# 08: Web push and the install affordance (migrations 0031, 0032)

**What to build:** Nothing in the app can reach a parent who isn't already
looking at it — verified by grep: no push, no email, no in-app notification
list, and `dist/sw.js` precaches the shell only. So "someone pinged your
drop-in", "the drop-in you joined starts in an hour" and "it was cancelled"
never arrive, and a parent drives to an empty park. Build the channel: a
subscription store, a push-capable service worker, and one server-side sender.
Pair it with an install affordance — **iOS delivers web push only to an
installed PWA**, so install guidance is part of this feature, not a follow-up.

**Blocked by:** Ticket 07 (one-writer). **Partly human-owned** (see the
migration check block): the VAPID keys, the Edge Function deploy and the
`pg_cron` toggle cannot be done from this machine. Ship the code complete with
the buttons failing loudly-but-clearly, exactly as the OAuth slice did.

**Status:** ready-for-agent

- [ ] **Migration 0031** — `push_subscriptions`: `id`, `profile_id` (FK profiles, cascade), `endpoint text not null unique`, `p256dh text`, `auth text`, `user_agent text`, `created_at`, `last_seen_at`. RLS owner-only: INSERT/UPDATE/DELETE/SELECT all scoped to `auth.uid() = profile_id` (DO-block guarded) — **no cross-profile reads ever**
- [ ] **Migration 0032** — `notification_log`: `id`, `profile_id`, `kind text check in ('ping_received','starting_soon','cancelled','new_comment')`, `playdate_id uuid null`, `title text`, `body text`, `url text`, `created_at`, `sent_at timestamptz null`, `error text null`, **unique `(profile_id, kind, playdate_id)`** (a re-run must never double-send). RLS: owner SELECT only (so the app can show a recent-alerts list); INSERT/UPDATE for the service role only — no authenticated writes
- [ ] Service worker: switch `vite-plugin-pwa` to `injectManifest` with a real `src/sw.ts` (workbox precache + `push` + `notificationclick` + `pushsubscriptionchange` handlers; tapping a notification focuses/opens its URL). **Regression guard:** `node scripts/verify-pwa.mjs` and `node scripts/verify-splash.mjs` must both stay green — the offline-shell proof is what catches a bad SW migration
- [ ] Sender: a Supabase Edge Function (`send-push`, Deno + `web-push`) that reads unsent `notification_log` rows, posts them, stamps `sent_at`/`error`, and prunes dead endpoints (404/410 → delete the subscription). Scheduled every 5 minutes by `pg_cron` (or a Supabase scheduled function) when enabled
- [ ] Event producers, all four kinds: (1) a ping lands on your post → host; (2) an occurrence starts in ≤60 min and you pinged it → attendee; (3) a post you pinged flips to `cancelled` (or is deleted by its host) → attendees — the "don't drive to an empty park" message; (4) a comment/reply on your post → host/author
- [ ] Permission prompt UX: **never on cold load** — ask after a meaningful action (a post created, or a ping saved), with a one-line reason; a denial is remembered and never re-prompted, and instead surfaces a short note pointing at the "while you were away" inbox from ticket 03
- [ ] Install affordance: capture `beforeinstallprompt` (Android → a real "Add to Home Screen" button in a `/profile` Notifications/Settings section) and an **iOS-Safari-only** instructions card (Share → Add to Home Screen), dismissible and shown once. The iOS card gates the notification opt-in with the honest reason (push needs the installed app)
- [ ] `/profile` gains a **Notifications** section: per-kind on/off, "Turn on notifications" / "Turn off" (deletes the subscription row), and the last few items from `notification_log` as a visible fallback for anyone who denies permission
- [ ] Unit tests: the pure payload builder (title/body/url per kind, and the "1 family is going" singular), the dedupe key derivation, and the iOS-detection seam (user-agent + standalone detection — pure, unit-tested, no browser sniffing scattered in components)
- [ ] New e2e `push-subscribe.e2e.ts`: with `PushManager`/`Notification` stubbed via Playwright, granting permission registers a `push_subscriptions` row, denial registers nothing and shows the fallback note, and no prompt appears on a cold `/` load. The **server-side send is not e2e-testable** — verify it live with a marker: trigger a ping, then confirm the `notification_log` row flips `sent_at` non-null (and the unique key prevents a second send)
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0, plus both `scripts/verify-*.mjs` PWA scripts exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0031_push_subscriptions.sql`
and `0032_notification_log.sql`** (reserved numbers; next free wins if the queue
reorders).

- *Idempotency:* DO-block guards for all policies; `create table if not exists`
  for both tables; the unique constraints declared inline.
- *Header must document:* the owner-only RLS posture (a subscription endpoint is
  a capability — leaking one lets a third party push to that parent), that
  `notification_log` inserts are service-role-only, the dedupe key, and that
  `notification_log` is the audit trail for "did we already tell them?".
- *Apply path (coordinator only):* CDP Chrome via
  `bash scripts/cdp-migration-tooling.sh` → dashboard token from Local Storage
  `supabase.dashboard.auth.token` → `POST
  https://api.supabase.com/v1/projects/<ref>/database/query`.
- *Post-apply probes:* (1) `information_schema` proving both tables + both
  unique constraints; (2) PostgREST `push_subscriptions?select=id&limit=1` →
  200 (no `PGRST205`); (3) a marker account inserting its own subscription
  succeeds while reading **another** profile's subscription returns 0 rows
  (the RLS pass condition — remember PostgREST reports RLS-blocked 0-row
  operations as 2xx, so assert on rows, not status); (4) an authenticated insert
  into `notification_log` fails closed.
- *Human-owned blockers (raise to the human, do not attempt):* generate the VAPID
  keypair, deploy the `send-push` Edge Function, set its secrets, and enable
  `pg_cron`. Also: **no deploy or publish without explicit authorization** — the
  code lands on `master` only when the human green-lights it.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/push-subscribe.e2e.ts`; `node scripts/verify-pwa.mjs` +
`node scripts/verify-splash.mjs`; after the human finishes the console steps, a
live marker pass — real ping → real notification on an installed PWA (Android
for the fast path; iOS confirm the install requirement is honoured). Sweep
markers, and delete the marker's subscription row in the same sweep.

## Comments
