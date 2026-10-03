# Release checklist — Drop In

**Start here. Work top to bottom. Do not skip ahead.**

> Built **2026-10-03** from the store-readiness audit
> ([2026-10-03-store-readiness.md](2026-10-03-store-readiness.md)), which measured
> the live database, the live Supabase config, and the repo at `758ec8f`.
> Google Play requirements below were read from **Google's own documentation**,
> not recalled — links inline. Where I could not verify a policy, it says so.
>
> **How to use this file:** each item has a checkbox, a time estimate, and a
> **Done when** line. Tick it only when the "Done when" is literally true. The
> phases are ordered by dependency, not by importance — Phase 0 exists because
> Phase 6 cannot start until it does.

---

## ⏰ The timing fact that drives this whole plan

**Google requires a closed test with 12 testers opted in continuously for 14
days before you can publish to production.** This is not optional and it cannot
be compressed. Source: [App testing requirements for new personal developer
accounts](https://support.google.com/googleplay/android-developer/answer/14151465).

> "Developers with personal accounts created after November 13, 2023, must run a
> closed test for their app with a minimum of 12 testers who have been opted in
> continuously for at least 14 days."

**What this means for you:** the moment you have an installable Android build,
your launch date is essentially fixed at **+14 days minimum**, plus Google's
review of your production access application. **Every day you delay creating the
shell is a day added to the end.** This is why Phase 0 comes first.

*(If your Play account is an **organization** account, not personal, this
requirement does not apply — check that first, it may save you two weeks.)*

---

## Phase 0 — Today (30 minutes, and it changes your calendar)

- [ ] **0.1 — Check whether your Play account is personal or organization.**
  If it does not exist yet, note that a **personal** account triggers the 12-tester
  rule. An organization account needs a D-U-N-S number but skips the gate.
  *Time: 5 min. Done when: you know which kind you have or will create.*

- [ ] **0.2 — Decide the child-data posture.** ⚠️ **The biggest submission risk.**
  Drop In stores children's first names and ages. You must decide, and write down:
  **(a)** is this a "children's app" under Google's Families policy, or a parents'
  app that stores data about kids? **(b)** what age rating will you declare?
  The honest answer is almost certainly the second — **the user is the parent** —
  but this decision determines your privacy policy text, your Data safety form,
  and your store listing wording. Getting it wrong is a rejection or a takedown.
  *Time: 15 min of thinking, write the answer in this file's margin. Done when:
  you can state the posture in one sentence.*

- [ ] **0.3 — Read `docs/handoff-native-apps.md` end to end.** It already contains
  decisions you will otherwise relitigate: Capacitor over React Native, why the
  web app stays, four code hazards with line numbers, and a "what will have
  rotted" table. *Time: 10 min. Done when: read.*

---

## Phase 1 — Beta blockers (about 1 day of your time)

**These make the app safe to put in front of parents you know.** They are
independent of the store work, so the store's 14-day clock can be running while
you do them.

- [ ] **1.1 — Sweep the e2e markers out of production.**
  **This is the single most embarrassing thing a first parent can see.** Live
  measurement on 2026-10-03: **709 marker rows, 352 fake accounts**, and the only
  future-dated drop-in in the entire database is a marker at "1234 E2E Ave NE."
  The safety gate reads `founder_overlap: 0`, so it is safe to run.

  ```bash
  node scripts/sweep-e2e-markers.mjs select    # prints counts + safety gate
  node scripts/sweep-e2e-markers.mjs delete    # prints rows removed, re-reads DB
  node scripts/sweep-e2e-markers.mjs verify    # exits non-zero if ANY marker remains
  ```

  **Done when: `verify` exits 0.** A non-zero exit from `delete` or `verify` is
  **release-blocking** — it means production still holds test content.
  *Time: 30 min.*

- [ ] **1.2 — Stop e2e writing to production.** Every `npx playwright test` writes
  to the **live** database. It regressed once already (V28 swept 1287 rows to
  zero; runs kept writing). Either accept sweeping before each invite, or point
  e2e at a scratch Supabase project. **Recommend the scratch project before you
  invite anyone you do not personally know.** *Time: ~2 hours. Done when:
  a full e2e run leaves `sweep-e2e-markers.mjs select` totals unchanged.*

- [ ] **1.3 — Seed 10–15 real drop-ins in Seattle, by hand, in the app.**
  Production has **22 drop-ins, all in the past, 18 of them yours.** A parent who
  opens an empty feed leaves. V28's own recorded decision was that seeding is done
  in the app by you — that is what makes the cold start work.
  *Time: 1–2 hours. Done when: a signed-out-then-signed-in parent sees real,
  upcoming, nearby drop-ins.*

- [ ] **1.4 — Walk "quit mid-onboarding and come back" on a real phone.**
  V28's summary calls this *"the batch's main open verification."* Two tests cover
  it and both are non-vacuous, but the only human who walked the flow went straight
  through. Tests are not a substitute for a stateful cross-session behavior.
  *Time: 10 min. Done when: you abandon at the area card, close the browser,
  reopen, and resume at card 3 with no duplicate kids.*

- [ ] **1.5 — Prove email arrives in a non-Gmail inbox.** SMTP is live
  (`smtp.gmail.com`, rate limit raised to 30 — good). But mail sent from a Gmail
  address through a third-party app is unauthenticated for your domain and
  spam-folds often. **Test into Outlook or iCloud**, not Gmail.
  *Time: 30 min. Done when: the reset email lands in the inbox, not spam, in a
  non-Gmail provider.*

- [ ] **1.6 — Write and host a Privacy Policy and a Terms page.** There are
  **zero** legal pages in the repo today — `grep` for "privacy policy" across
  `src/` and `index.html` returns nothing. `PrivacySection.tsx` states the privacy
  model in prose inside Settings, which is genuinely good and unusually
  thoughtful — **but it is not a policy document and has no URL.**
  Google requires a privacy policy URL on the listing *and* within the app
  ([App content](https://support.google.com/googleplay/android-developer/answer/9859455)).
  It must cover: kids' names and ages, email, approximate location, photos, and
  who data is shared with (Supabase, Vercel, Resend/Gmail, Google OAuth).
  *Time: 2 hours. Done when: both pages are live at stable URLs and linked from
  the app footer and Settings.*

- [ ] **1.7 — Invite 5–10 parents you know.** The beta is the point of Phase 1.
  *Done when: invitations sent.*

- [ ] **1.8 — Run the 5-parent first-open test.** Kit is written and
  pre-registered with pass bars: `research/first-open-validation/2026-09-29-parent-test-scoring.md`.
  It has been waiting since 2026-09-29. **Two backlog items are blocked on its
  results** — do not build the empty-feed CTA or interest chips until it runs.
  *Time: ~2 hours total across 5 calls of 20 min. Done when: results scored
  against the pre-registered bars.*

---

## Phase 2 — The Android shell (the actual store blocker)

**This is the big one.** Drop In is a web app; Google Play does not accept web
apps. There is no `android/` directory, no Capacitor project, no TWA config today.

**Read `.scratch/native-apps/plan.md` before dispatching anything** — it has the
slices, acceptance criteria, and verification commands. It is parked deliberately;
this phase is where it unparks.

- [ ] **2.1 — Re-verify the handoff's "what will have rotted" table.**
  It was written against `62c996a`; the tree has moved far past it. Check the
  Capacitor version, the next free migration number, the notification kind count,
  and the repo visibility. **Do not skip this** — it is the whole reason that
  section exists. *Time: 20 min.*

- [ ] **2.2 — Slice 0: grounding.** Pin current Capacitor conventions, APNs/FCM
  request shapes, and what Apple's guideline 4.2 rejects *today*, from primary
  sources. Both move. *Time: ~1 hour.*

- [ ] **2.3 — Slice 1: the Capacitor shell, Android-first, bundling `dist/`.**
  ⚠️ **Bundle the assets, do not load a remote URL.** A live-URL wrapper is the
  classic "repackaged website" tell and gets rejected. Android is first because
  Java 26 and `~/Android/Sdk` are installed on this box — the whole loop is
  testable locally today.
  *Done when: a debug build installs and launches on a real Android device.*

- [ ] **2.4 — Fix the four browser-origin hazards as part of slice 1.**
  Already found, with line numbers — do not rediscover them during submission:

  | Where | What breaks in a shell |
  |---|---|
  | `src/lib/db.ts:317` | OAuth `redirectTo` — a shell origin isn't a real URL |
  | `src/lib/db.ts:1352` | Password-reset `redirectTo` — a parent cannot reset a password |
  | `src/lib/db.ts:1339` | `buildShareUrl` — links point at the shell, not a shareable page |
  | `src/lib/email.ts:40` | Base-URL fallback — same class |

  Each needs a **decision** about "what is the canonical public URL inside the
  app," which is why it is not mechanical. *Done when: password reset completes
  inside the installed app.*

- [ ] **2.5 — Native push as a third transport inside the existing drain.**
  ⚠️ **Never a second Edge Function.** Two functions draining `sent_at is null`
  race each other for the same rows — the same reasoning that put email inside
  `send-push`. Copy comes from `_shared/pushCopy.ts`, never a second copy module.
  Needs a `device_tokens` table (one row per device, `platform`, unique `token`).
  *Done when: a parent with the app closed receives a real alert, on Android.*

- [ ] **2.6 — Deep links: a shared drop-in link opens the app if installed, the
  web page if not.** *Done when: tested both ways on a real device.*

- [ ] **2.7 — iOS (only once a macOS route exists).** ⚠️ **This Linux box cannot
  build iOS** — no `xcodebuild`, no CocoaPods. Options: GitHub Actions
  `macos-latest` (repo is **private**, so macOS minutes bill at **10×** ≈ 200
  min/month against the allowance), a borrowed Mac, or a paid cloud Mac. The
  handoff records that you said you would buy a Mac — confirm before planning.

---

## Phase 3 — Play Console setup (do this in parallel with Phase 2)

**Free to start. Do it early so the 14-day clock is not the last thing.**

- [ ] **3.1 — Create the Play Console account.** $25 one time. Identity
  verification can take days. *Done when: account active.*

- [ ] **3.2 — Upload a build to the internal testing track.** Internal testing has
  **no requirements** and builds appear within seconds — use it to shake out
  signing and install problems before the closed test. *Done when: you install
  your own build from Play.*

- [ ] **3.3 — Recruit 12 testers before starting the closed test.** ⚠️ They must
  stay opted in **continuously for 14 days**. If someone opts out on day 10, the
  clock restarts. Recruit more than 12. *Done when: 12+ people have said yes.*

---

## Phase 4 — Store listing content (a few hours, mostly writing)

Assets below were read from Google's own
[store listing docs](https://support.google.com/googleplay/android-developer/answer/9866151):

- [ ] **4.1 — App icon:** 512×512, 32-bit PNG **with alpha**, max 1024KB, no
  badges or ranking text.
- [ ] **4.2 — Feature graphic:** 1024×500, **JPEG or 24-bit PNG (no alpha)**.
  Keep the focal point centered — the edges get cropped on some surfaces.
- [ ] **4.3 — Screenshots:** minimum 2, up to 8 per device type. Phone is
  required. Use the real app with real (seeded) content — not mockups.
- [ ] **4.4 — Short description** (the first thing users read) and **full
  description.** ⚠️ Both must match the child-data posture from 0.2.
- [ ] **4.5 — Privacy policy URL** from 1.6.
- [ ] **4.6 — App category, contact email, and content rating questionnaire.**

---

## Phase 5 — Policy declarations (Console forms — be precise)

- [ ] **5.1 — Data safety form.** Must declare what you actually collect: kid
  first names and ages, parent email, approximate location, photos, and messages.
  ⚠️ **It must match the privacy policy from 1.6 exactly.** A mismatch between the
  two is a common rejection cause. *Time: 1 hour, and read each question twice.*
- [ ] **5.2 — Ads declaration.** Declare "no ads" — there are none.
- [ ] **5.3 — Target audience and content.** This is where the 0.2 decision gets
  committed. Answer consistently with the listing and the Data safety form.
- [ ] **5.4 — Government apps / news / financial declarations** — all "no."

---

## Phase 6 — Submit, wait, then production

- [ ] **6.1 — Start the closed test** with 12+ opted-in testers. **The 14-day
  clock starts now.** Record the start date: `_______________`.
- [ ] **6.2 — Keep testers opted in for 14 continuous days.** Do not let the count
  dip. Meanwhile act on their feedback — you must summarize it when applying.
- [ ] **6.3 — Apply for production access** from the Dashboard. Google asks you to
  explain your app, your testing process, and your production readiness.
- [ ] **6.4 — Roll out to production.** Start with a staged rollout, not 100%.

---

## Phase 7 — After launch (keep these on the radar)

- [ ] **7.1 — Apple App Store**, if you want it. Separate project: $99/yr
  (start ~2 weeks before submission — not earlier, it burns an annual
  subscription), a Mac or macOS CI, and guideline 4.2 review risk.
- [ ] **7.2 — Rotate the Exa API key** pasted into a chat on 2026-10-03. It is in
  an old session file in plaintext and in `.env`. **Do this regardless of
  everything else.**
- [ ] **7.3 — Two known e2e flakes**, proven pre-existing and neither a product
  bug: `the marker bubble stays open` (overlapping Leaflet markers) and
  `list view is FILTERS FIRST` (fails only under full-suite load). Fix when they
  annoy you.
- [ ] **7.4 — "ping" → "going" terminology pass.** Real user-visible copy
  inconsistency. Not a launch blocker. Scoped in `.scratch/next-batch-brief.md`.
- [ ] **7.5 — Retire the 352 test accounts' residue** if 1.2 was deferred.

---

## The critical path, in one line

**Phase 2 (the shell) → Phase 3.3 (12 testers) → 14 days → Phase 6.4.**

Everything else can happen in parallel with that chain. **Phase 0.1 and 0.2 are
today, and Phase 2.1 can start this week** — every day the shell is delayed is a
day added to the end.

---

## What this checklist deliberately does NOT include

- **A React Native rewrite.** The repo has 1,953 unit tests and a 161-spec
  Playwright suite; a rewrite discards all of it for no user-visible gain.
  Capacitor wraps what exists. Do not relitigate this.
- **Removing the web app.** It is the link landing pad and the install funnel.
  Removing it would force deep links to be rebuilt *first*. It also *helps*
  Apple review.
- **Search.** Correctly parked — search over a near-empty database returns
  empties. Revisit when a city has real density.
- **Partner linking / find-a-parent.** The biggest product question in the queue,
  and a *next* batch. Not a launch blocker.

---

## Unverified items — check these yourself

My `web_search` was down during both this checklist and the audit (the search
endpoint returned `HTTP 402 Insufficient Balance`), so I fetched Google's docs
directly instead. The items below are still worth your own glance:

1. **Whether an organization Play account skips the 12-tester rule** — the doc
   says "personal accounts created after November 13, 2023," which implies yes,
   but confirm against your own account type (Phase 0.1).
2. **Apple's current guideline 4.2 wording** — I did not fetch it. The handoff's
   mitigation (bundle assets, don't wrap a URL) is sound regardless.
3. **Current Apple Developer and Play fees** — the handoff lists $99/yr and $25
   one-time and flags them as "re-verify."
4. **Supabase dashboard access.** The handoff warns the dashboard was locked (a
   deleted GitHub account was the OAuth identity) and that `SUPABASE_ACCESS_TOKEN`
   may be the only working credential. **Check this before you need it** — losing
   it mid-submission would be very bad.
