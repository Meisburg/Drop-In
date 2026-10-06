# Slice 2 brief — native push (FCM/APNs as a third transport inside `send-push`)

> **WHY THIS FILE EXISTS.** Slice 2 is the largest slice in the native plan, and the
> session that prepared it had already run 23 rounds and was holding the whole
> release checklist. Starting it there would have meant writing a migration and a
> push seam while carrying all of that — which is precisely how a builder ships
> something plausible and wrong. This is the cold-start brief a FRESH session
> needs, so nothing has to be re-derived and nothing has to be remembered.
>
> **Read first, in this order:**
> 1. `.scratch/native-apps/plan.md` — slice 2 is the contract; this file only adds
>    the state and the traps.
> 2. `research/native-apps/2026-10-05-capacitor-grounding.md` — the provider facts,
>    from primary sources.
> 3. `docs/agents/code-structure.md` — the build law. Push logic in
>    `supabase/functions/_shared/`, pure, with an in-process-tested adapter.
> 4. `AGENTS.md` — the communication contract and the workflow invariants.

## 1. What is ALREADY DONE (do not redo any of it)

| Thing | State |
|---|---|
| Capacitor shell | Built, branded with the app's own art, **release bundle signed**. `android/` committed (`9420465`, `a0c628d`, `ce3da9e`). |
| Firebase project | `project-1ab24a5b-7d94-4c8d-bbc` (number `773084814487`), display name "Drop In". |
| Firebase Android app | **Registered by CLI**: app id `1:773084814487:android:9519c5aa6a8cd1e896ddd2`, package `app.dropin.playdate`. |
| Client config | `android/app/google-services.json` written by `apps:sdkconfig`, and **GITIGNORED on purpose** (`android/.gitignore:70`). Regenerate with the command recorded in the plan. |
| Upload keystore SHA-1 | Registered on the Firebase app, so it can verify builds signed with `/home/jmeisburg/.android-keys/drop-in-upload.jks`. |
| Proof it is live | A debug build generated `google_app_id`, `gcm_defaultSenderId`, `google_api_key`, `project_id` into the merged resources. **Check this the same way** rather than trusting a green build. |
| **NOT done** | No `device_tokens` table (**next free migration is 0065**); `@capacitor/push-notifications` is **not installed** (8.1.3 is the wanted version); `send-push` has **zero** native references. |

## 2. What you still need from the founder (ask for these FIRST)

1. **The FCM service-account JSON.** FCM HTTP v1 authenticates the SEND side with a
   Google service account. Firebase console → ⚙️ Project settings → **Service
   accounts** → *Generate new private key*. It goes into the Edge Function's
   **secrets** — never the repo. ⚠️ This is a DIFFERENT artifact from
   `google-services.json`, which is CLIENT config; they are easy to confuse and
   having one does not give you the other.
2. **A real Android device with the app installed**, to prove the acceptance
   criterion that a parent with the app closed receives an alert. The emulator
   cannot answer it: this box's emulator was crash-looping its own hardware daemon
   and, separately, **`screencap` returns a white frame for WebView content**, so
   the emulator can prove a process is alive and rendering but not that a
   notification appeared. iOS needs a macOS route this Linux box does not have —
   plan slice 2a is deferred for that reason.

## 3. The traps, each one measured rather than guessed

- **Android 13+ (targetSdk 33+) requires the permission flow BEFORE `register()`**:
  `checkPermissions()` then `requestPermissions()`. Registering first returns a
  token that can never produce a visible alert.
- **A native token is NOT a VAPID subscription.** No `endpoint`, no
  `p256dh`/`auth`, no service worker. The web transport in `send-push` stays
  exactly as it is; the two coexist. Do not "unify" them.
- **⚠️ The `token` field may be on its way out.** Firebase's v1 reference now marks
  it "deprecated — use fid instead" while saying it still works during the
  transition; the Capacitor plugin exposes only the token. Recorded as UNVERIFIED
  in the grounding. **No action until the timeline or the plugin changes** —
  raising it is not the same as acting on it.
- **Prune on the provider's dead-token codes**, exactly as a 404/410 prunes a web
  subscription, and keep the classification per transport: a permanently bad token
  is TERMINAL (delete the row), a provider 5xx or timeout is RETRYABLE. Getting
  this backwards deletes live devices or retries dead ones forever.
- **ONE Edge Function.** Native push is a BRANCH inside `send-push`, never a second
  function: two functions draining `sent_at is null` race each other for the same
  rows. Same reasoning that put email inside `send-push`.
- **A type-checked adapter is NOT a tested adapter.** `smtpDeno_test.ts` proved
  nodemailer against an in-process fake; do the same for the FCM/APNs clients.

## 4. Definition of done, in the order to verify it

1. `bash scripts/deno-check-functions.sh` and `bash scripts/deno-test-functions.sh`
   pass — the adapters proven against fakes, **no live socket**.
2. `npm run verify` passes: the migration is idempotent and re-paste-safe, RLS is
   owner-only (a third party reads ZERO rows — assert it, do not assume it),
   `nativePush.ts` and `classifyNativePushFailure` unit-tested with counting fakes.
3. **A web-push recipient is unaffected** — run the existing push specs; a
   regression there is the failure this slice is most likely to cause.
4. A real device, **app closed**, receives the alert.
5. If the slice overruns, **split at 2a (APNs) / 2b (FCM)** rather than pushing
   through: FCM is testable today on this box and APNs is not.

## 5. Slice hygiene this repo will hold you to

- **One builder at a time**; the orchestrator delegates and never edits product
  code itself.
- **No completion claim without fresh evidence from THIS turn** — a green build is
  not evidence that a plugin ran (see what checking the merged resources caught),
  and a subagent's "DONE" is a belief.
- **Never run a bare `npx playwright test`** — it writes to production; see
  `docs/agents/browser-lanes.md`. The marker sweep that cleans up after it exists,
  and its safety net now verifies its own completeness against the live schema.
- **Files another session has open right now** (do not touch without checking):
  `src/index.css`, `src/pages/FeedPage.tsx`, `src/components/LocationModal.tsx`,
  and the `.gitignore` pair at the repo root and in `android/`.
- **Push only gated and clean**: `docs/agents/auto-push.md`'s three conditions.
