# Web push setup (V8 ticket 08)

The code is done. **Nothing about web push actually delivers until the steps in
this file are done**, and every one of them needs access this machine does not
have (a VAPID keypair, the Supabase project's function secrets, the `pg_cron`
toggle). Until then the app behaves exactly as the OAuth slice did: the
`/profile` **Notifications** section says so in a sentence ("Push sending isn't
switched on for this deployment yet…"), the opt-in still records a
subscription, and every alert collects in the "While you were away" card on the
feed, which needs none of this.

Project ref: `ayzvjwxbxyrcgyoeaxuk` (from `.env` → `VITE_SUPABASE_URL`).

## Where it stands (2026-09-13, coordinator-verified)

| # | Step | State |
|---|---|---|
| 0 | Apply migrations **0031** + **0032** | **DONE** — applied live, and 0032 re-applied after its amendment; all probes pass |
| 1 | Generate the VAPID keypair | **DONE** — `.env.push.local` (gitignored, 0600) holds both halves. The private key has never been printed, pasted, or committed |
| 2 | Public key in the build | **DONE AND DEPLOYED** — `VITE_VAPID_PUBLIC_KEY` is set (locally in `.env`, and in Vercel's env for the deployed build); the live bundle is verified to CONTAIN the public key and to contain no private half. So subscriptions made by the deployed app are **bound** |
| 3 | Deploy `send-push` + secrets | **DONE** — verified through the Management API, not assumed: the function is `ACTIVE`, `verify_jwt: true`, and the three secrets `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` all exist. The wall is proven live: an **anon** bearer gets `401 {"error":"send-push is service-role only"}` (a 404 would have meant "not deployed") |
| 4 | Schedule every 5 minutes | **NOT DONE — this is the one open step.** Verified empirically: `pg_cron`/`pg_net` are not even installed, and a real ping left `notification_log` rows with `sent_at` NULL for 6 minutes of polling, so nothing invokes the function. Do it from the dashboard (`Integrations → Cron`, or the function's *Schedules*), which enables the extensions and sends the service-role key itself — deliberately not from SQL, where that key would have to sit in a statement |
| 5 | Verify | partly done (see below); the on-device half needs step 4 plus an opt-in from the phone |

**Live evidence already collected** (the DB half of the pipeline works): a real
ping from a second account wrote `notification_log` row `ping_received` ("… is
going"), and deleting the post wrote a `cancelled` row via the BEFORE DELETE
trigger. Both are the two rows now waiting at the queue head with
`sent_at: NULL` — **left in place on purpose as a canary**: after step 4 they
must drain, and their recipients have NO subscription, which is exactly the
"does a no-subscription row starve the queue?" case worth watching (the sender
runs oldest-first with no retry).

The rest of this file is the original step-by-step version of the same thing,
kept because the reasoning in it is what makes the order matter.

The rest of this file is the original step-by-step version of the same thing,
kept because the reasoning in it is what makes the order matter.

| # | Step | Who | Blocks |
|---|---|---|---|
| 0 | Apply migrations **0031** + **0032** | coordinator (CDP SQL API) | every push row |
| 1 | Generate the VAPID keypair | human | the sender |
| 2 | Put the public key in `.env` and rebuild | human | bound subscriptions |
| 3 | Deploy `send-push` + set its secrets | human | all delivery |
| 4 | Schedule it every 5 minutes | human | `starting_soon` |
| 5 | Verify | human | — |

---

## 0. Apply the migrations (coordinator, not the human)

`supabase/migrations/0031_push_subscriptions.sql` and
`0032_notification_log.sql`. Apply **0031 first**: 0032's producers and the
sender both assume the subscription table exists. **Both are applied live
(2026-09-12)**, so `e2e/push-subscribe.e2e.ts` now runs against the real tables:
it asserts the app's supported state, registers a row through the UI, and takes
it away again. (0032 was amended in place on the same day — its `starting_soon`
body gained the zero branch; re-apply the file to update a database.)

Post-apply probes are in the ticket (`.scratch/v8/issues/08-web-push-notifications.md`):
both tables + both unique constraints via `information_schema`; a PostgREST
`push_subscriptions?select=id&limit=1` → 200; a marker inserting its own
subscription succeeds while reading **another** profile's returns 0 rows; and an
authenticated INSERT into `notification_log` FAILS CLOSED.

## 1. Generate the VAPID keypair (≈1 minute)

A VAPID keypair is what lets the push services (FCM, Mozilla, Apple) trust that
we are the sender. It is per-DEPLOYMENT, not per-user, and it can be rotated —
but rotating it invalidates every existing subscription (each parent has to
re-enable notifications), so generate it once and keep it.

```bash
npx web-push generate-vapid-keys
```

You get a public and a private key (`BN…` / a shorter base64url string). The
private key is a SECRET: it goes into the function's secrets (step 3) and
nowhere else — never into `.env`, never into a commit, never into a chat.

`VAPID_SUBJECT` is a contact address the push services can use if we misbehave.
`mailto:` plus an address you actually read:

```
VAPID_SUBJECT="mailto:you@example.com"
```

## 2. Public key into `.env`, then rebuild (≈2 minutes)

`.env` (gitignored) needs one more line:

```
VITE_VAPID_PUBLIC_KEY=<the public key from step 1>
```

Then `npm run build` — it is read at BUILD time (`import.meta.env`), so the
deployed bundle has to be rebuilt and redeployed for it to take effect.

**Without this key the app still works, in a weaker mode**: `pushManager.subscribe()`
is called without `applicationServerKey` (the Web Push protocol allows it), so
the opt-in is recorded and the sender can still deliver — but the subscription
is not bound to our key, so anybody who obtains the endpoint could push to that
device. With the key, only a holder of our private key can. Set it.

Existing subscriptions are **not** retroactively bound: a parent who opted in
before the key existed keeps an unbound subscription until they turn
notifications off and on again. (Turning them off deletes the row; turning them
back on re-subscribes with the key.)

## 3. Deploy the sender + its secrets (≈5 minutes)

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY="<public key>" \
  VAPID_PRIVATE_KEY="<private key>" \
  VAPID_SUBJECT="mailto:you@example.com" \
  --project-ref ayzvjwxbxyrcgyoeaxuk

supabase functions deploy send-push --project-ref ayzvjwxbxyrcgyoeaxuk
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do not set them by hand.

**Leave JWT verification ON** (the deploy default). The function has two walls
and needs both: the platform's JWT check, plus its own comparison of the bearer
token to the service-role key. Without the second wall, any signed-in parent
could POST their own (valid) user JWT and trigger a drain on demand.

## 4. Schedule it every 5 minutes (≈3 minutes)

Two ways; pick one.

**(a) The dashboard's scheduled function (easiest).** Dashboard → Edge
Functions → `send-push` → *Schedules* → add a schedule at `*/5 * * * *`. The
dashboard sends the service-role key for you.

**(b) pg_cron.** In the SQL editor (or via the same API path the coordinator
uses for migrations):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-push-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ayzvjwxbxyrcgyoeaxuk.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Check it landed and is actually firing:

```sql
select jobid, schedule, jobname, active from cron.job;
select status, return_message, created
  from net._http_response order by created desc limit 5;
```

**What the schedule is actually for:** only the `starting_soon` kind. The other
three (`ping_received`, `new_comment`, `cancelled`) are event-driven triggers
inside Postgres and are inserted the instant the event happens — they are sent
on the next tick, so a broken schedule delays them but never loses them.

## 5. Verify (≈10 minutes)

1. **The function answers, and only for the service role.**
   ```bash
   curl -i -X POST https://ayzvjwxbxyrcgyoeaxuk.supabase.co/functions/v1/send-push \
     -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{}'
   ```
   Expect `200` and `{"ok":true,"startingSoonCreated":N,"rows":…,"sent":…,"failed":…,"skipped":…,"pruned":…}`.
   Then repeat with the ANON key as the bearer — expect **401
   `{"error":"send-push is service-role only"}`**. If you get a `200` there,
   STOP and report it: that is the wall failing.
2. **The VAPID check.** Before step 3 is complete the function answers `503`
   `{"error":"VAPID keys are not configured…"}` and stamps nothing — on purpose,
   so the backlog drains the moment the secrets exist rather than being lost.
3. **On Android (the fast path).** Install the PWA (the `/profile` "Add to Home
   Screen" button, or Chromium's own install), turn notifications on in
   `/profile` → Notifications, then from a DIFFERENT account ping one of that
   account's posts. Within ~5 minutes the phone should buzz; tapping it must
   open that drop-in.
4. **The marker pass (the documented live check — a real e2e send is not
   testable from the dev machine).** With a marker account: trigger a ping, then
   confirm its `notification_log` row appears and flips `sent_at` non-null, and
   that running the sender again does NOT send it twice (the unique key
   `(profile_id, kind, playdate_id)` is the guard).
   ```sql
   select kind, playdate_id, sent_at, error from notification_log
     where profile_id = '<marker profile id>' order by created_at desc limit 5;
   ```
5. **iOS.** Confirm the install requirement is honoured: in Safari (not
   installed) the `/profile` section must show the Share → Add to Home Screen
   card and must NOT offer "Turn on notifications". After installing, the opt-in
   appears. If a Safari tab can opt in, the gate is broken. Then open the same
   link inside an app's in-app browser (a share link from Instagram/Messages):
   it must show the "open this in Safari" sentence and NO Share → Add to Home
   Screen card — the webview has no Share menu of its own.
6. **Sweep.** Run the ticket's marker sweep and delete the marker's
   `push_subscriptions` row in the same pass (`node scripts/sweep-e2e-markers.mjs
   delete` handles the account, which cascades its subscriptions and log).

## What the code does (for reference)

- `supabase/migrations/0031_push_subscriptions.sql` — the capability store.
  Owner-only RLS on all four verbs; **no** cross-profile read, ever: an endpoint
  plus its keys is enough to push to that parent's device, so it is treated as a
  credential. `endpoint` is globally unique, which is what makes re-subscribing
  an upsert.
- `supabase/migrations/0032_notification_log.sql` — the outbox, the dedupe key
  (`unique (profile_id, kind, playdate_id)`) and the audit trail. Owner-only
  SELECT; **no** authenticated INSERT/UPDATE policy, so an authenticated insert
  fails closed. `notification_payload(...)` is the single server side copy rule
  (including the singular "1 family is going"). Three SECURITY DEFINER trigger
  functions produce `ping_received`, `new_comment` and `cancelled`; none of them
  ever notifies the actor, and all of them pass through when `auth.uid() is null`
  (the 0011 lesson).
- `src/sw.ts` + `vite.config.ts` — the service worker is now
  `injectManifest`-built from `src/sw.ts`: workbox precaching plus `push`,
  `notificationclick` and `pushsubscriptionchange`. `scripts/verify-pwa.mjs`
  (cold OFFLINE shell) and `scripts/verify-splash.mjs` are the regression guard
  for that switch.
- `supabase/functions/send-push/index.ts` — the sender: `starting_soon`
  catch-up scan (the one kind no trigger can produce), then the drain, with
  404/410 pruning dead endpoints.
- `src/lib/push.ts` — the pure seams (payload copy, dedupe key, iOS detection,
  the permission-decision memory), all unit-tested. `src/lib/pushClient.ts` is
  the only file that touches the browser. `src/components/NotificationsSection.tsx`
  and `src/components/PushOptInPrompt.tsx` render; they do not decide.

## Known limits (stated, not hidden)

- **The per-kind mutes are enforced on the device, not by the sender.** A muted
  kind is still delivered over the wire and dropped by the service worker before
  it shows. Gating the sender per kind needs a third table (profile × kind), and
  0031/0032 are the only migrations ticket 08 may add. The residual is written
  down in 0032's header.
- **Each notification is attempted once.** If the push service returns a
  transient error, that row is stamped with the error and not retried (0032's
  columns are pinned to `sent_at` + `error`, with no attempt counter, and rows
  drain oldest-first — so a permanently failing row left unsent would starve
  everything behind it). The alert is still in the parent's `/profile` →
  Notifications list.
- **A subscription the browser rotates** is repaired by
  `startPushSubscriptionRepair()` (src/lib/pushClient.ts), which the authed shell
  starts on every app open (`src/App.tsx`): the service worker's
  `pushsubscriptionchange` handler re-subscribes and posts
  `push-subscription-changed` to every open window, which persists the new
  endpoint; and if the rotation happened while no tab was open, the app-open
  re-register writes the row for the subscription the browser holds now. Until a
  repair lands, the old endpoint answers 410 and the sender prunes it.
- **Turning notifications off is reversible.** "Turn off" remembers the
  'dismissed' decision (so the floating post-action prompt never nags again) and
  deletes the rows; the /profile control is gated on the real registration, so
  "Turn on notifications" comes back — including for a parent who re-granted
  permission in the browser's own settings.
- **One endpoint, one account.** `endpoint` is globally unique, and a non-owner's
  upsert is a silent 0-row 2xx (the UPDATE policy's USING filters it without
  raising), so the write asks for the row back (`RETURNING`) and treats an empty
  representation as a failure — see `savePushSubscriptionWithClient`. A second
  account on a shared family tablet gets a real error instead of a false
  "Notifications are on". (It cannot be a follow-up `select()`: an immediate
  read-after-write on this project was measured missing the row it had just
  written.)
