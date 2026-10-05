# Implementation Plan: DropIn as a native app (App Store + Google Play)

> **🟢 UNPARKED 2026-10-03 — SLICE 0 GROUNDING IS DONE, SHELL NOT YET BUILT.**
> **⚠️ READ THIS PARAGRAPH BEFORE THE SLICES: the 2026-10-05 grounding INVALIDATES
> three things the slices below assume.** It is
> `research/native-apps/2026-10-05-capacitor-grounding.md` (284 lines, 42
> primary-source URLs; the earlier `.scratch/native-apps/reverify-2026-10-03.md`
> is still valid for versions but predates it):
>
> 1. **`android.adjustMarginsForEdgeToEdge` was REMOVED in Capacitor 8.0.** A
>    handoff written against 6/7 reaches for it; the current answer is the
>    SystemBars plugin plus CSS `env()` safe areas — which means this app's
>    existing edge-to-edge CSS is the thing to check, not the config key.
> 2. **The installed 8.5.2 is a BREAKING MINOR**: it adopts the iOS UIScene
>    lifecycle, so `SceneDelegate.swift` + an Info.plist scene manifest are
>    required and `AppDelegate` URL/universal-link callbacks stop firing. This
>    only bites slice 3 (deep links) and only on iOS — but it means slice 3's iOS
>    half is NOT the mechanical change the slice text implies.
> 3. **The toolchain floors moved**: Node 22+ (this box has 26 ✓), Xcode 26+,
>    `minSdk 24`, `compileSdk`/`targetSdk 36`, AGP 8.13.0, Gradle 8.14.3, Kotlin
>    2.2.20, google-services plugin 4.4.4. **The open risk is this box's JDK: the
>    only JVM installed is Java 26**, and AGP 8.13/Gradle 8.14.3 do not support a
>    class-file version that new. Slice 1's first job is therefore to prove or
>    disprove `./gradlew --version` on Java 26 and install a JDK 21 toolchain if
>    it refuses — see "Risks / open questions".
>
> **What did NOT rot:** `webDir: 'dist'` with **no `server.url`** is unchanged and
> is still the anti-4.2 choice (the config reference scopes `server.url` to live
> reload and calls it "not intended for use in production"). Capacitor core is
> still 8.5.2; `send-push` is still v8/ACTIVE; there are still **eight**
> notification kinds; `dist` is still 1.5M. **Two facts DID move since 10-03: the
> next free migration is now `0064` (0063 landed), and ⚠️ THE REPO IS NOW
> PUBLIC** (`gh repo view` → `isPrivate: false`), which reverses §2.7's "macOS
> minutes bill at 10×" cost note for the iOS route.
>
> **ANDROID FIRST**, per `docs/RELEASE-CHECKLIST.md` 2.3: this box can build and
> test Android today (SDK at `~/Android/Sdk`, build-tools 36.0.0, platform
> android-37.0) and cannot build iOS at all.
>
> The Phase 0/1 store work is tracked in `docs/RELEASE-CHECKLIST.md`.
>
> **⏸️ Originally parked 2026-09-30 — NOT STARTED at that time, AND DELIBERATELY SO.** The app is not
> feature-complete, and a native shell is one of the LAST things to add: every
> feature built after it means re-syncing the shell and re-testing on device.
> **Before executing anything here, read `docs/handoff-native-apps.md`** — it
> carries the decision and its reasoning, four code hazards with line numbers,
> the risks that decide success, and **a "what will have rotted" table to
> re-verify first** (this repo moved 86 commits while the session that wrote this
> was away). Do not buy the Mac or start the Apple/Play enrolment until the app is
> near submission — see the handoff's §7.
>
> Owned by the orchestrator. Written BEFORE any builder dispatch, against the
> tree at `5be6bc5` (2026-09-30), not against recollection — this session came
> back after 86 commits and V27/V28 had landed.
>
> Default slice gate is `npm run verify`. Slices touching rendered behaviour ALSO
> pin the relevant browser lane (see `docs/agents/browser-lanes.md`).

## Goal

A parent can **install DropIn from the App Store or Google Play and use the
app** — with notifications that arrive over **APNs/FCM** rather than Web Push,
so the iOS "you must first Add to Home Screen" cliff disappears entirely.
The web app remains **the link landing pad and install funnel**, not a
competing product.

We know it is done when:
1. a signed TestFlight build and a Play internal-testing build install and launch
   on real hardware;
2. a parent who installs and grants notifications receives a real alert with the
   app closed, on **both** platforms;
3. a shared drop-in link opens the app when installed and the web page when not;
4. a password-reset email link completes inside the app;
5. both store listings are live and pass review.

## Decision recorded (recommended, confirm before slice 4)

**Keep the web app; make native primary.** Dropping the browser entirely would
force deep-linking to be rebuilt *before* anything ships, because password-reset
links, email confirmation, shared drop-in links and Google's OAuth consent screen
all assume a browser exists. Keeping it also *helps* App Store review (see 4.2 in
Risks). **If the founder wants the browser gone, that is a different, larger plan
— say so before slice 4.**

## Non-goals

- **No React Native rewrite.** The existing app is 1,953 unit tests and a
  161-spec e2e suite; Capacitor wraps it, RN discards it. Revisit only if the
  shell proves genuinely limiting on real devices.
- **No removal of the web push path.** `push_subscriptions` + VAPID stay; native
  is an ADDITIONAL transport. Existing web users must not regress.
- **No new product features.** This plan is distribution + the native push path.
- **No email sending-domain work.** The email fallback is live and working
  (`sent:email` × 60); it stays as the backstop for parents with no app.

## Interfaces (pinned so builders do not re-decide)

**The sender is one function, one drain, N transports.** `send-push` already
drains `notification_log` (`sent_at is null`, unique key
`(profile_id, kind, playdate_id)`) and already selects between transports
(`_shared/emailTransport.ts`: SMTP → Resend → disabled). Native push becomes a
**third branch inside the same drain**, decided per recipient by which device
rows exist — never a second function, because two functions draining one queue
race each other. This is the same reasoning that put email inside `send-push`.

**New table (migration `0061` — VERIFIED 2026-09-30: `0058`, `0059`, `0060` are
the highest present, so 0061 is the next free number):** `device_tokens` — one row
per installed device:
`id, profile_id (fk, cascade), platform ('ios'|'android'), token (unique),
created_at, last_seen_at, app_version`. RLS: owner-only SELECT/INSERT/DELETE,
mirroring `push_subscriptions` (0031) exactly. A token the provider answers
`410 Gone`/`BadDeviceToken` for is DELETED, the same way a dead push endpoint is
pruned today.

**Copy is shared, not duplicated.** `_shared/pushCopy.ts` already holds the
eight kinds and is pinned char-for-char to SQL `notification_payload` and to the
vitest twin. APNs/FCM payloads must be built from the SAME `buildNotificationPayload`
— a second copy module is the drift bug V28 was caused by.

**Secrets:** `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (the `.p8`),
`APNS_TOPIC` (= bundle id), and `FCM_SERVICE_ACCOUNT_JSON`. Set through the
**Management API** (`POST /v1/projects/<ref>/secrets`), which is verified
working — the Supabase dashboard is still locked.

**Deep links:** the app must claim `drop-in-mu.vercel.app` (iOS
`apple-app-site-association`, Android `assetlinks.json`) so an https link opens
the app when installed. Both files are served from the web app.

## Slices

### Slice 0: grounding (read-only, no code)

- **Objective:** pin the CURRENT Capacitor + plugin versions, the APNs HTTP/2
  provider API, FCM v1, and the two live review risks, from primary sources.
- **Files in scope:** `research/native-apps-grounding.md` (new).
- **Approach:** `orchestrator-researcher` per `docs/agents/grounding-gates.md`.
  Must answer: (a) current Capacitor major + the official push plugin and its
  maintenance status; (b) APNs token-auth (`.p8`) request shape and the exact
  error codes that mean "delete this token"; (c) FCM v1 HTTP shape; (d) **what
  Apple guideline 4.2 actually rejects today**, with recent examples; (e) whether
  bundling `dist/` into the shell changes the 4.2 posture vs a remote URL.
- **Acceptance criteria:** every claim carries a primary-source URL and a date.
- **Verification command:** n/a (read-only) — the file itself is the artefact.
- **Depends on:** nothing. **Do this first; every later slice cites it.**

### Slice 1: the Capacitor shell (installs and launches)

- **Objective:** an iOS and an Android build that install and launch the real app
  from **bundled assets**, not a remote URL.
- **Files in scope:** `package.json`, `capacitor.config.ts` (new), `ios/`,
  `android/` (new, generated), `.gitignore`.
- **Approach:** `@capacitor/core` + `cli` + `ios` + `android`. Point
  `webDir` at `dist/` so `npm run build` output is bundled. **This is the
  anti-4.2 choice** — a shell that loads a live URL is the classic
  "repackaged website" tell; bundled assets are a real app that works offline.
  `pushClient.ts` / `sw.ts` stay for the web build; the shell gets its own
  registration path in slice 2.
- **Acceptance criteria:**
  - `npx cap sync` clean; `npm run verify` still exit 0;
  - the iOS build launches to a signed-in-able app shell in the simulator;
  - the Android build does the same;
  - **with the device in airplane mode, the app still paints the shell** (proves
    assets are bundled, not fetched).
- **Verification command:** `npm run verify && npx cap sync && <simulator launch>`
- **Budget:** one builder context. **Risk: this is the slice most likely to
  overrun** — if the shell fights the existing routing/base path, stop and split
  rather than growing it.
- **Depends on:** slice 0.

### Slice 2: native push — the device-token table and the transport

- **Objective:** a parent who installs and grants notifications receives a real
  alert with the app closed, on both platforms.
- **Files in scope:** `supabase/migrations/00XX_device_tokens.sql` (new),
  `supabase/functions/_shared/nativePush.ts` (new, PURE — provider-agnostic
  request builder + a `classifyNativePushFailure` mirroring
  `classifySmtpFailure`), `supabase/functions/_shared/apnsDeno.ts` +
  `fcmDeno.ts` (Deno-only adapters, the only place a provider library/HTTP
  detail appears), `supabase/functions/send-push/index.ts` (the drain branch),
  `src/lib/nativePushToken.ts` + spec (the app's registration seam).
- **Approach:** the drain, for each row, resolves the recipient's device rows;
  native tokens win over web push when both exist (an installed app is the
  better channel), web push is the fallback, email is the last resort. Reuse
  `buildNotificationPayload` for the copy. **Prune on the provider's
  "token is dead" codes** — exactly as a 404/410 prunes a web subscription.
  Retry classification is per transport and must not regress: a permanently
  bad token is TERMINAL (delete it), a provider 5xx/timeout is RETRYABLE.
- **Acceptance criteria:**
  - the migration is idempotent and re-paste-safe; RLS is owner-only; a
    third party reads zero rows;
  - `nativePush.ts` and its classifier are unit-tested with **counting fakes and
    no live socket** (the pattern `smtp.test.ts` established);
  - the Deno adapters are proven against an in-process fake, the way
    `smtpDeno_test.ts` proved nodemailer — the lesson from that slice is that a
    type-checked adapter is NOT a tested adapter;
  - a real device with the app closed receives the alert on **both** platforms;
  - a web-push recipient is unaffected (no regression).
- **Verification command:** `npm run verify && bash scripts/deno-check-functions.sh && bash scripts/deno-test-functions.sh`
- **Budget:** **split into 2a (ios/APNs) and 2b (android/FCM) if it overruns** —
  it is the largest slice in this plan.
- **Depends on:** slice 1. **Needs the founder's Apple/Google credentials.**

### Slice 3: deep links (shared links and email links open the app)

- **Objective:** an `https://drop-in-mu.vercel.app/...` link opens the app when
  installed, the web page when not.
- **Files in scope:** `public/.well-known/apple-app-site-association` (new),
  `public/.well-known/assetlinks.json` (new), `capacitor.config.ts`, the router's
  link handling.
- **Approach:** Universal Links (iOS) + App Links (Android). The association
  files are served by the web app, so **this is the one slice that needs a
  production deploy to verify** — and the Vercel pipeline is working again.
  Password-reset and confirmation links must survive the hop; a link that opens
  the app to a dead screen is worse than one that opens the browser.
- **Acceptance criteria:**
  - `/playdate/<id>` opens the app when installed, the browser when not;
  - a real password-reset email completes inside the app;
  - the association files are served with the right content-type and are not
    caught by the SPA rewrite in `vercel.json`;
  - **the deployed files are verified**, not just present in `public/`.
- **Verification command:** `npm run verify` + a real-device link test on both
  platforms.
- **Depends on:** slice 1.

### Slice 4: store assets and submission

- **Objective:** both listings submitted and passing review.
- **Files in scope:** `store/` (new: icons, screenshots, descriptions, privacy
  policy URL, review notes), `docs/agents/store-review.md` (new).
- **Approach:** the review notes must argue **against 4.2 explicitly** — name the
  native capabilities (APNs push, location, camera/photo upload, offline, share
  sheet) and point at the built-in features a reviewer can exercise in 30
  seconds. Screenshots at real device sizes from the REAL app, not mockups.
- **Acceptance criteria:** both listings approved; **Apple's rejection reasons, if
  any, are recorded verbatim** in the doc.
- **Verification command:** n/a — the store's own review is the gate.
- **Depends on:** slices 1–3, **and the founder's store accounts.**

### Slice 5: real-device verification of the whole path

- **Objective:** the objective's criteria 1–5 measured on hardware, not
  simulators.
- **Files in scope:** `docs/agents/native-testing.md` (new).
- **Approach:** TestFlight + Play internal testing to one iPhone and one Android.
  Post a drop-in on one, ping it from a second account, confirm the alert arrives
  with the app closed and that the link opens the app.
- **Acceptance criteria:** every check has an observed result, and anything
  unproven is named as unproven — never inferred.
- **Verification command:** n/a — hardware observation, recorded with timestamps.
- **Depends on:** slices 1–4.

## Risks / open questions

- **⚠️ THE JDK ON THIS BOX IS TOO NEW, AND IT IS SLICE 1'S FIRST BLOCKER
  (measured 2026-10-05).** `ls /usr/lib/jvm` shows exactly one JVM:
  `java-26-openjdk` (`openjdk version 26.0.2.1`), and `JAVA_HOME` is unset. The
  Capacitor 8 floors are AGP 8.13.0 / Gradle 8.14.3, which do not support a Java
  26 class-file version; the expected failure is Gradle refusing to start
  ("Unsupported class file major version") or the Android plugin failing to
  load. **This is a claim until it is run** — slice 1's first verification step
  is `./gradlew --version` in the generated `android/`, and if it refuses, the
  fix is a JDK 21 toolchain (user-scoped, e.g. `mise install java@21` plus
  `org.gradle.java.home` or `JAVA_HOME` for the build only). Do NOT "fix" it by
  editing generated gradle files to unsupported versions.
- **⚠️ THE PLAY GATE IS A CALENDAR PROBLEM, NOT A BUILD PROBLEM (grounding,
  2026-10-05).** Google's own page: a new **personal** Play account must run a
  closed test with "a minimum of 12 testers who have been opted in continuously
  for at least 14 days" before production access. The clock starts when an
  installable build exists, which makes the Android shell the critical path and
  makes **checklist 0.1 (personal vs organization account)** worth settling
  before the shell is polished rather than after. An agent cannot recruit the
  testers.
- **⚠️ APPLE GUIDELINE 4.2 IS THE MAIN RISK.** Apple rejects apps that are "just
  a repackaged website". Bundling assets (slice 1) and shipping real native
  capability is the mitigation, but this is a **review outcome nobody can
  guarantee**. Budget for one rejection round-trip. The grounding quotes today's
  wording of 4.2, 4.2.2 and 4.2.6, and records that Apple publishes **no**
  Capacitor-specific rejection list — community anecdotes are not evidence.
- **⚠️ NATIVE PUSH IS A SECOND SENDER, NOT A PORT (grounding, 2026-10-05).**
  Web Push/VAPID gives no VAPID pair, no `endpoint`/`p256dh`/`auth`, no service
  worker; native gets a per-install FCM token, and `send-push` must gain a Google
  service-account OAuth2 path posting to
  `https://fcm.googleapis.com/v1/projects/{id}/messages:send`. Slice 2's text
  below already refuses a second Edge Function — that part is right — but it must
  not be read as "the web transport with different keys".
- **⚠️ THE LONG POLE IS NOT CODE — IT IS ENROLMENT.** Apple Developer Program
  ($99/yr) identity verification can take **days**; Play Console is $25
  one-time. An agent cannot do this.
- **⚠️ e2e DRIVES THE LIVE PROJECT — and it has already caused a real incident.**
  V28's `followed_new_dropin` emails were Playwright fixtures reaching a real
  inbox. Native testing must not repeat it: fixtures stay inside the marker
  convention (`docs/agents/e2e-fixture-convention.md`) and the `is_e2e_profile`
  guard must be understood before any new fixture path is added.
- **⚠️ THE SUPABASE DASHBOARD IS STILL LOCKED.** All secrets and migrations go
  through `SUPABASE_ACCESS_TOKEN` + the Management API. That token is the only
  working credential on the project — do not rotate or lose it.
- **APNs key handling.** The `.p8` is a bearer credential for every push to the
  app; it must go into function secrets and never into the repo.
- **Cost.** $99/yr + $25 one-time.
- **✅ CONFIRMED 2026-09-30 — THIS MACHINE CANNOT BUILD iOS, AND THAT RESHAPES THE
  PLAN.** Measured, not assumed: `uname -s` → **Linux**, no `xcodebuild`, no
  CocoaPods. Apple requires macOS + Xcode to produce an iOS archive, so **there
  is no local iOS build path at all.** What IS present: **Java 26** and a full
  **`~/Android/Sdk`** (`build-tools`, `emulator`, `platforms`, `platform-tools`),
  so **Android can be built and emulated here today.**
  Three ways to get iOS, in order of what I'd pick:
  1. **GitHub Actions `macos-latest`** — Actions is enabled on the repo
     (`allowed_actions: all`), but the repo is **PRIVATE**, and private-repo
     macOS minutes bill at **10×** the Linux rate against the 2,000/month
     allowance — i.e. roughly **200 macOS minutes a month**, enough for occasional
     archive builds but not for a tight loop. **Recommended for release builds.**
  2. **A borrowed Mac** for the first archive and the signing set-up. Cheapest if
     one is reachable; worst if it is a one-time favour.
  3. **A paid cloud-Mac service** (Codemagic/Bitrise et al.) — costs money, adds
     a third CI to maintain.
  **PLAN CHANGE:** slices 1 and 2 should be built **Android-first**, because that
  path is testable on this box end to end; iOS follows once the macOS route is
  chosen. The alternative — blocking both platforms on an Apple decision — wastes
  the Android capability that already exists.
- **Two verification lanes have documented false failures**
  (`layout-width-check`, `dark-mode-check`); they are not this plan's business but
  will be seen in a full gate run.

## What only the founder can do

1. **Apple Developer Program enrolment** ($99/yr) — start now, it is the long
   pole.
2. **Google Play Console** ($25 one-time).
3. **APNs key + FCM service account** (created in the Apple/Google consoles).
4. **Answer: how do we get iOS builds — GitHub Actions macOS (recommended), a
   borrowed Mac, or a paid cloud-Mac service?** Confirmed: this box is Linux and
   cannot produce an iOS archive. **Android is not blocked by this — it builds
   locally today.**
5. **Confirm the browser-stays decision** before slice 4.

---

## Status log (orchestrator appends after every phase transition)

- 2026-09-30 — Plan written. Written AFTER re-reading `task-state.md` and
  `plan.md`, because this session returned to a tree **86 commits** past its last
  commit: V27 merged six worktrees, V28 fixed a live fixture-email incident and
  recovered lost migration `0060`, and `send-push` is now **v8**. **Two of my own
  remembered facts were wrong and are corrected here:** the notification kinds
  are **EIGHT**, not five, and the email fallback is not merely "proven" — it has
  delivered **60 `sent:email` rows** in production. The plan is written against
  `5be6bc5`.
