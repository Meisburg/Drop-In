# Slice 2b builder brief — Android/FCM native push inside `send-push`

> **Read in this order, then stop reading:**
> 1. `.scratch/native-apps/plan.md` § "Slice 2" (lines ~170–236) — the contract.
> 2. `research/native-apps/2026-10-05-capacitor-grounding.md` lines 120–165 — the
>    FCM HTTP v1 request shape, from Google's own discovery doc.
> 3. `docs/agents/code-structure.md` — the build law.
> 4. `supabase/functions/_shared/smtp.ts` + `classifySmtpFailure` + `smtpDeno.ts`
>    + `smtpDeno_test.ts` — **the pattern you are copying.** Read all four.
> 5. `supabase/functions/send-push/index.ts` — the drain you are branching into.
>
> `.scratch/native-apps/slice-2-brief.md` is the parent brief; §3 there is five
> measured traps. This file adds the 2b-specific scope. Where they disagree,
> **this file wins** — 2a (APNs) is deferred and out of your scope.

## Scope: 2b ONLY (Android/FCM). APNs is DEFERRED — do not write it.

The founder ruled: build 2b now, defer 2a. This box is Linux, cannot build iOS,
and has no Apple credentials — so APNs code could only ever be *unverified* code.
**Do not create `apnsDeno.ts`. Do not add `APNS_*` secrets.** Design
`nativePush.ts` so an APNs branch can be added later without reshaping it (the
platform column already distinguishes them), but write no iOS transport.

## What already exists — do not redo, do not re-decide

| Thing | State |
|---|---|
| Migrations | **next free number is `0065`** (top present is `0064_messages_delete_sender.sql`). Verified 2026-10-06. |
| Firebase project | `project-1ab24a5b-7d94-4c8d-bbc`, number `773084814487`, name "Drop In". |
| Firebase Android app | `1:773084814487:android:9519c5aa6a8cd1e896ddd2`, package `app.dropin.playdate`. |
| Client config | `android/app/google-services.json` present, **gitignored on purpose** (repo is PUBLIC). Never commit it. |
| `send-push` | v8, live. Drains `notification_log` where `sent_at is null`. **It already has an email branch inside the same drain** (`_shared/emailTransport.ts` selects SMTP→Resend→disabled) — your native branch follows that exact precedent. |
| `device_tokens` | Does not exist. **Zero** references in the repo. |
| `@capacitor/push-notifications` | Not installed. |

## The four files you write, and one you edit

### 1. `supabase/migrations/0065_device_tokens.sql` (new)

`device_tokens`: `id`, `profile_id` (fk → profiles, **cascade**), `platform`
(`'ios'|'android'`), `token` (**unique**), `created_at`, `last_seen_at`,
`app_version`.

- **Idempotent and re-paste-safe** — `create table if not exists`, `create index
  if not exists`, policies dropped-and-recreated or guarded. Read
  `supabase/migrations/0031_*.sql` (the `push_subscriptions` migration) and
  **mirror its RLS exactly**: owner-only SELECT/INSERT/DELETE.
- **Assert owner-only, do not assume it.** A third party must read ZERO rows.
  This is an acceptance criterion; the reviewer will look for the assertion.
- Unique on `token` matters: the same physical device re-registering must update,
  not duplicate. Think about what the upsert key is and say so in a comment.

### 2. `supabase/functions/_shared/nativePush.ts` (new, PURE)

Provider-agnostic request builder + `classifyNativePushFailure`, **mirroring
`classifySmtpFailure` in `_shared/smtp.ts`**. No HTTP, no `fetch`, no `Deno`
global, no imports from anything with a socket — it must be loadable by vitest.

- Reuse `buildNotificationPayload` from `_shared/pushCopy.ts`. **A second copy
  module is the drift bug V28 was caused by** — do not write one.
- Build the FCM v1 body: `{ message: { token, notification: { title, body },
  data, android: {...} } }`. Per the grounding, `data` is **string→string** and
  keys must not start `google.`/`gcm.notification.` nor be reserved (`from`,
  `message_type`). `click_action` / the app's URL goes in `data`.
- `classifyNativePushFailure` returns the TERMINAL vs RETRYABLE decision:
  - **TERMINAL (delete the row):** provider says the token is dead —
    `UNREGISTERED`, `INVALID_ARGUMENT` on the token, HTTP 404/410, and the FCM
    `error.details[].errorCode` shapes. Treat "the token will never work again"
    as terminal.
  - **RETRYABLE:** HTTP 5xx, 429, timeouts, network errors, `UNAVAILABLE`,
    `INTERNAL`, `QUOTA_EXCEEDED`.
  - Getting this backwards **deletes live devices or retries dead ones
    forever** — this is trap #4 in the parent brief. Be explicit per code.
- Ship a sibling test: `supabase/functions/_shared/nativePush.test.ts`, using
  **counting fakes, no live socket** (the pattern `smtp.test.ts` established).

### 3. `supabase/functions/_shared/fcmDeno.ts` (new) + `fcmDeno_test.ts`

The Deno-only adapter — **the only place HTTP and the OAuth2 detail appear.**

- Mint an OAuth2 access token from the service-account JSON: sign a JWT (RS256)
  with the private key, `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`
  assertion, POST to the token endpoint. **Cache the token until near expiry.**
- Scope: `https://www.googleapis.com/auth/firebase.messaging`.
- Send: `POST https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`
  with `Authorization: Bearer <access token>`, body from `nativePush.ts`.
- Secret is `FCM_SERVICE_ACCOUNT_JSON` (env). **Never log it, never commit it.**
  When it is absent, the adapter must report *unconfigured* cleanly — the same
  way `emailTransport.ts` reports a disabled transport — not throw.
- **⚠️ A type-checked adapter is NOT a tested adapter.** `smtpDeno_test.ts` is
  708 lines and proves nodemailer against an in-process fake. Do the same here:
  a fake token endpoint + a fake FCM endpoint. **No live socket, no credentials,
  no real Google call.** Note that `scripts/deno-test-functions.sh` currently
  names `_shared/smtpDeno_test.ts` explicitly as its entrypoint — **extend that
  script to run your test too**, keeping its staged-temp-tree, trap-cleanup and
  stated-permissions design. Do not restructure the script.

### 4. `supabase/functions/send-push/index.ts` (edit — the drain branch)

- For each row, resolve the recipient's `device_tokens` rows alongside the
  existing `push_subscriptions` read.
- **Precedence: native tokens win over web push when both exist** (an installed
  app is the better channel); web push is the fallback; email is the last resort.
- **ONE Edge Function. Native push is a BRANCH inside `send-push`, never a
  second function** — two functions draining `sent_at is null` race each other
  for the same rows. This is trap #5 and it is not negotiable.
- **Prune on the provider's dead-token codes** — delete the `device_tokens` row
  when the classification is TERMINAL, exactly as a 404/410 prunes a
  `push_subscriptions` row today. Count it in the existing `pruned` counter or a
  sibling; do not silently drop it.
- **The web-push path must be untouched in behaviour.** A web-push recipient
  regressing is the failure this slice is most likely to cause. Existing push
  specs must still pass.
- Keep the `sent_at`/`error` stamping semantics identical, including that
  `sent_at` is stamped even when every send failed.

### 5. `src/lib/nativePushToken.ts` + `src/lib/nativePushToken.test.ts` (new)

The app's registration seam. Per the build law: pure functions with injected
dependencies, and **every `lib/*.ts` ships a `lib/*.test.ts` sibling.**

- **⚠️ Android 13+ (targetSdk 33+) requires the permission flow BEFORE
  `register()`**: `checkPermissions()` then `requestPermissions()`. Registering
  first returns a token that can never produce a visible alert. This is trap #1.
- Inject the plugin (`@capacitor/push-notifications`) and the persistence
  function — do not import them directly into testable logic. Install the plugin
  (`@capacitor/push-notifications@8.1.3` is the wanted version) and wire the
  listener here.
- **A native token is NOT a VAPID subscription** — no `endpoint`, no
  `p256dh`/`auth`, no service worker. The web transport in `send-push` stays
  exactly as it is; the two coexist. **Do not "unify" them.** Trap #2.
- Upsert against `device_tokens` with `last_seen_at` refreshed on re-registration.

## Verification — run ALL of these, this turn, and paste real output

```bash
bash scripts/deno-check-functions.sh      # type-checks the functions
bash scripts/deno-test-functions.sh       # runs the adapter test(s) against fakes
npm run verify                            # build + test + lint (the slice gate)
```

Also run the **existing push specs** and report them specifically — a
web-push regression is the most likely failure of this slice.

**Do not run a bare `npx playwright test`** — it writes to production. See
`docs/agents/browser-lanes.md`.

## Files another session has open — do not touch

`src/index.css`, `src/pages/FeedPage.tsx`, `src/components/LocationModal.tsx`,
and the `.gitignore` pair (root and `android/`).

## Out of scope — do not do these

- APNs / iOS anything (deferred to 2a).
- Any change to the web-push path's behaviour.
- Any new Edge Function.
- Committing `google-services.json` or any credential.
- Acting on the `token`→`fid` deprecation. Firebase marks `token` deprecated
  "use `fid` instead" while saying it still works in transition, and the
  Capacitor plugin exposes only the token. **Recorded as UNVERIFIED in the
  grounding. No action until the timeline or the plugin changes** — raising it
  is not the same as acting on it.

## Untestable here — say so in Risks, do not fake it

`FCM_SERVICE_ACCOUNT_JSON` **does not exist on this box** (the founder has not
generated it yet). So a real send to a real device **cannot be executed in this
slice by you**. Everything up to that boundary — migration, pure builder,
classifier, adapter-against-fake, the drain branch, the client seam — is fully
verifiable and must be verified. The live-device send is recorded as UNPROVEN.
**Never infer it.**

## Return format (exactly this)

    Status: DONE | BLOCKED
    Files changed:
      - <path> <one-line summary of what changed and why>
    Commands run:
      - <command> -> <result>
    Risks: <or "none">
    Unresolved questions: <or "none">
