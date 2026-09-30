# Handoff — shipping DropIn as an installed iOS + Android app

**Written 2026-09-30. Read this BEFORE starting the native work, not after.**

> For: whoever picks this up — most likely the founder, months from now, once the
> app is feature-complete.
>
> The executable slice plan is `.scratch/native-apps/plan.md`. **This file is the
> part that plan does not carry**: what was decided, why, what is already true,
> what must be re-checked, and what will have rotted by the time you read it.
>
> If the two disagree, trust whichever is more recent — and re-verify anyway. See
> "What will have rotted" below; that section is the whole reason this file
> exists.

## 1. The decision, and that it was deliberate

**DropIn ships as an installed app on the App Store and Google Play. That becomes
the primary way parents use it.**

Recorded because a future reader will otherwise re-litigate it:

- **Capacitor wraps the existing app. NOT a React Native rewrite.** At the time of
  writing the repo held **1,953 unit tests and a 161-spec Playwright e2e suite**.
  A rewrite discards all of it for no user-visible gain. Revisit ONLY if the shell
  proves genuinely limiting on real hardware — not on principle.
- **The web app stays.** It is the link landing pad and the install funnel, not a
  competing product. Removing it would force deep-linking to be rebuilt *first*,
  because password-reset links, email confirmation, shared drop-in links and
  Google's OAuth consent screen all assume a browser exists. See §4.
- **Why native at all:** iOS Web Push only works if the parent has added the web
  app to their Home Screen. Most will not. A real installed app gets **APNs/FCM
  notifications with no install ritual** — which removes the single biggest
  adoption cliff in the product.

## 2. What is ALREADY TRUE (do not re-derive, but DO re-verify)

- **The notification pipeline works and is live.** `send-push` drains
  `notification_log` and selects a transport per recipient
  (`_shared/emailTransport.ts`: SMTP → Resend → disabled). The email fallback has
  delivered real mail — at the time of writing, **60 `sent:email` rows**.
- **The email fallback is the backstop, not the goal.** Native push is what
  removes the cliff; email catches parents who have no app at all. It stays.
- **Native push is a THIRD BRANCH INSIDE THE EXISTING DRAIN**, never a second
  Edge Function. Two functions draining `sent_at is null` race each other for the
  same rows. This is the same reasoning that put email inside `send-push`, and it
  is load-bearing.
- **Copy is shared, not duplicated.** `_shared/pushCopy.ts` holds the notification
  kinds and is pinned char-for-char to the SQL `notification_payload` and to a
  vitest twin. Build APNs/FCM payloads from it. **A second copy module is exactly
  the drift bug that caused the V28 incident.**
- **The Supabase dashboard is still locked** (a deleted GitHub account was the
  OAuth identity). All migrations and secrets go through the **Management API**
  with `SUPABASE_ACCESS_TOKEN` from `.env`. **That token may be the only working
  credential on the project — do not rotate or lose it, and check whether the
  dashboard was recovered before assuming this still applies.**

## 3. ⚠️ THE THING THAT MUST BE CHECKED FIRST

**This machine is Linux. It cannot build iOS.** Measured 2026-09-30: no
`xcodebuild`, no CocoaPods. Apple requires macOS + Xcode for an iOS archive.

- **Android is NOT blocked** — Java 26 and a full `~/Android/Sdk` are installed,
  so Android builds and emulates locally.
- **iOS needs one of:** GitHub Actions `macos-latest` (Actions is enabled, but the
  repo is **PRIVATE**, so macOS minutes bill at **10×** the Linux rate against the
  2,000/month allowance ≈ **200 macOS minutes/month**), a borrowed Mac, or a paid
  cloud-Mac service.
- **The founder has said they will buy a Mac.** If that happened, this section is
  historical — confirm, then proceed.

**This is why the plan is ANDROID-FIRST.** The entire Android loop is testable on
this box today; blocking both platforms on an Apple decision wastes capability
that already exists.

## 4. The four code hazards, with line numbers

Found by inspection, **not yet fixed**. These are the things that look fine in a
browser and misbehave in a bundled shell, because a shell has no real origin.

| Where | What | Why it breaks in a shell |
|---|---|---|
| `src/lib/db.ts:317` | **OAuth `redirectTo`** | A shell's origin is not a real URL the auth provider will accept unless it is registered |
| `src/lib/db.ts:1352` | **Password-reset `redirectTo`** | Same — and this one means a parent cannot reset a password |
| `src/lib/db.ts:1339` | Share URL (`buildShareUrl`) | Would generate links pointing at the shell, not at a shareable https page |
| `src/lib/email.ts:40` | Base-URL fallback | Same class; affects the email-link target |

**The pattern:** every one of these needs an explicit "what is the canonical
public URL when running inside the app" answer. That is a *decision*, not a
mechanical fix — which is why it is not done here.

**Cheap now, confusing later.** Two files, four sites. Do it as the first slice of
the native work, or fix it in passing — but do not discover it during submission.

## 5. What will have rotted by the time you read this (RE-VERIFY, do not trust)

This file was written against commit `62c996a`. Everything below is a fact with a
date, not a permanent truth:

| Claim at time of writing | Re-check with |
|---|---|
| Capacitor **8.5.2**, `@capacitor/push-notifications` **8.1.2** | `npm view @capacitor/core version` |
| Next free migration is **0061** | `ls supabase/migrations/ \| sort \| tail` |
| Notification kinds: **8** | `NOTIFICATION_KINDS` in `_shared/pushCopy.ts` |
| `send-push` is **v8** | `GET /v1/projects/<ref>/functions/send-push` |
| App bundle is **1.5 MB** | `du -sh dist` |
| Repo is **private**, Actions enabled | `gh repo view Meisburg/Drop-In --json visibility` |
| Apple Developer **$99/yr**, Play **$25** one-time | Apple's and Google's own pages |

**The repo moves fast** — the session that wrote this returned to a tree **86
commits** past its last visit, with two batches landed in between. Assume change.

## 6. The risks that decide success or failure

1. **⚠️ Apple guideline 4.2 — the main review risk.** Apple rejects apps that are
   "just a repackaged website". **Mitigation, already decided: bundle `dist/` into
   the shell** rather than loading a remote URL. A live-URL wrapper is the classic
   4.2 tell. Budget **one rejection round-trip** as normal, not as disaster.
2. **⚠️ Enrolment is the long pole, not code.** Apple identity verification can
   take **days**. Start it when you are ~2 weeks from submission — **not now**, it
   is an annual subscription and starting early burns months of it.
3. **⚠️ e2e drives the LIVE project and has already caused a real incident.** V28:
   Playwright fixtures at a real place fanned out to a real follower, who received
   **21 fixture emails** in two days. There is now an `is_e2e_profile` guard on all
   five producers and rule 5 in `docs/agents/e2e-fixture-convention.md`. **Read
   both before adding any fixture path.**
4. **iOS signing** — the APNs `.p8` is a bearer credential for every push to the
   app. Function secrets only. Never the repo.

## 7. What only the founder can do (and WHEN to do it)

Ordered by *when it becomes necessary*, not by importance:

| When | What | Cost |
|---|---|---|
| **Now** | Nothing. Keep building features. | $0 |
| When the app is **feature-complete** | Decide the Mac / macOS-CI route (§3) | hardware |
| **~2 weeks before submission** | Apple Developer Program enrolment | $99/yr |
| Anytime | Google Play Console | $25 once |
| Before slice 4 | Confirm the web-app-stays decision (§1) | a word |
| Before native push | APNs key + FCM service account | free |

**Do not start the paid items early.** An annual Apple subscription bought months
before submission buys nothing.

## 8. How to actually start, when the time comes

1. Read `.scratch/native-apps/plan.md` — it has the slices, acceptance criteria
   and verification commands.
2. Re-verify §5's table. **Do not skip this.**
3. Do **slice 0** (grounding) first: it pins current Capacitor conventions, the
   APNs/FCM request shapes, and what guideline 4.2 rejects *today*, from primary
   sources. Capacitor 8 conventions and Apple's review behaviour both move.
4. Then **slice 1 (the shell), Android-first** — testable end to end on this box.
5. Fix §4's four sites as part of slice 1, not as an afterthought.
6. iOS follows once a macOS route exists.

## 9. The honest summary

**Nothing was started, and nothing should have been.** The native shell is one of
the *last* things to add, because every feature built after it means re-syncing
the shell and re-testing on device. The value delivered here is that four
expensive surprises are now written down instead of being discovered at
submission:

1. this box cannot build iOS;
2. Apple rejects website wrappers, so the shell must bundle its assets;
3. native push must join the existing drain, not fork it;
4. four specific code sites assume a browser origin and will break in a shell.

**Pick this up when the app is feature-complete. The plan will still be here — and
it will need a refresh, because the tree will have moved.**
