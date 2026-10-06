# Release checklist — Drop In

**Start here. Work top to bottom. Do not skip ahead.**

> Built **2026-10-03** from the store-readiness audit
> ([2026-10-03-store-readiness.md](audits/2026-10-03-store-readiness.md)), which measured
> the live database, the live Supabase config, and the repo at `758ec8f`.
> Google Play requirements below were read from **Google's own documentation**,
> not recalled — links inline. Where I could not verify a policy, it says so.
>
> **How to use this file:** each item has a checkbox, a time estimate, and a
> **Done when** line. Tick it only when the "Done when" is literally true. The
> phases are ordered by dependency, not by importance — Phase 0 exists because
> Phase 6 cannot start until it does.

---

## 📍 WHERE THIS ACTUALLY STANDS (2026-10-06 — the sweep is DONE)

**✅ 1.1 AND 7.5 ARE DONE, AND SO ARE THE FIVE DUPLICATE PLACE ROWS.** The founder
authorised it on 2026-10-06 and it ran with BOTH of the sweep tool's gates green
before anything was deleted:

- **`founder_overlap: 0`** (no real family was in scope) and the **collateral
  probe all-zero** ("Safe — delete would refuse nothing"), the second gate that
  exists because a cascade once destroyed a real parent's `going_pings` row.
- **3,262 marker rows removed** across 13 tables, then the tool RE-READ the
  database: **0 remaining, every total down by exactly what it claimed.** The
  count had grown to 1,613 accounts because the nightly lane was dispatched
  several times that evening to verify e2e fixes — a real consequence, recorded
  rather than glossed.
- **The five duplicate places are gone**: 239 → **234** rows, one per name, after
  re-verifying 0 references across `playdates`, `follows`, `reviews` and
  `place_comments` immediately beforehand.
- **Nothing dangles.** `public.messages` is the one table the sweep does not
  cover: **12 rows, 0 orphaned senders, none marker-authored.**
- **Production is now 58 real accounts, 58 profiles, 22 drop-ins, 234 places,**
  and exactly **1 moderator** (Jon Meisburg).

**WHAT IS LEFT IS SHORTER THAN IT WAS:**

1. **An FCM Firebase project** — the project EXISTS
   (`project-1ab24a5b-7d94-4c8d-bbc`); what remains is that the CLI on this box is
   **not authenticated**, so fetching `google-services.json` needs one login from
   you. Everything after that is mine.
2. **The upload keystore is FOUND** — `/home/jmeisburg/.android-keys/drop-in-upload.jks`
   (alias `upload`, valid to 2054), so slice 2.6 is unblocked. Its public
   fingerprints are recorded in the plan. ⚠️ Play App Signing adds a SECOND key
   after the first upload, and `assetlinks.json` will need BOTH.
3. **The 0.2 child-data posture** — one sentence, gating the store descriptions
   (4.4), the Data safety form (5.1) and 5.3. A recommendation is written up.
4. **`appId`** — the founder's instinct is `app.dropin`; the tree currently says
   `app.dropin.playdate`. It is cheap NOW (a rename plus re-registering the
   Firebase Android app) and **impossible after the first Play upload**.
5. **Rotate the Exa API key** (7.2) — pasted into a chat on 2026-10-03.

**2.3's "Done when" is now much closer, and the emulator answered the part it
could**: the APK installs, launches, **survives 100+ seconds** (the earlier
disappearance did not reproduce, and this run logged **zero** `android.hardwar`
crashes), and its WebView was queried over CDP to prove it RENDERED —
`readyState: complete`, boot splash cleared, React mounting the real `/login`
screen with all seven controls. A screenshot of it is WHITE, and that is a
**headless-emulator screencap limitation, not a blank screen**: a stock app
captures correctly on the same emulator while WebView content does not. ⚠️ **Only
your phone can confirm how it LOOKS** — I cannot see images with this model, so
that is an honest gap, not a skipped step.

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

- [x] **1.1 — SWEPT 2026-10-06, both gates green first.** `select` reported
  **1,613 marker accounts / 3,262 rows, `founder_overlap: 0`**; the collateral
  cascade probe reported **all-zero** ("Safe — delete would refuse nothing");
  `delete` removed **3,262 rows across 13 tables** and then RE-READ the database:
  **0 marker rows remaining, every total down by exactly what it claimed**, and
  `verify` exits 0. Production is left with **58 real accounts / 58 profiles / 22
  drop-ins / 234 places / 1 moderator**. The count had grown from 1,620 because
  the nightly lane was dispatched repeatedly that evening to verify e2e fixes.
  `public.messages`, the one table the sweep does not cover, holds **12 rows, 0
  orphaned senders, none marker-authored**.
  ~~Sweep the e2e markers out of production.~~
  **This is the single most embarrassing thing a first parent can see.** Live
  measurement on 2026-10-03: **709 marker rows, 352 fake accounts**, and the only
  future-dated drop-in in the entire database is a marker at "1234 E2E Ave NE."
  **Re-measured 2026-10-04: 279 marker accounts / 563 marker rows, with every
  content table at ZERO** (playdates, going_pings, comments, memberships,
  follows, push_subscriptions — only `kids` is non-zero, at 5). The accounts
  accumulate by design, one per signup spec per run, so this count is a *dated
  reading and not a stable fact*: 264/533 at the previous run, 279/563 now. Read
  it again rather than trusting either figure.
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

  > **Partly shipped 2026-10-03.** The target is now *declared and expiring*
  > rather than silent: `scripts/guards/e2e-target-guard.mjs` (in
  > `npm run guards` / `npm run verify`) refuses any run whose target is not
  > vouched for by `e2e/.e2e-target.json`, and that policy carries a written
  > reason, an explicit `environment`, and an expiry that may be extended
  > **once**. See [e2e-target-guard.md](agents/e2e-target-guard.md).
  > **This makes a production run declared, not safe.** The scratch project
  > above is still the durable fix and is still the recommendation; the guard
  > is what stops the decision being forgotten while it is outstanding.
  > *Done when: `e2e-target-guard.mjs` reports a `testRefs` target and no
  > `productionRef` waiver is in force.*

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

- [x] **2.1 — DONE 2026-10-05 (`f1213b0`).** The four facts it names were
  re-checked against the tree: Capacitor **8.5.2**, the next free migration
  **0065** (0064 applied), **8** notification kinds, and the repo **PUBLIC**
  (`isPrivate: false`, which reverses §2.7's macOS-minutes note).
  ~~Re-verify the handoff's "what will have rotted" table.~~
  It was written against `62c996a`; the tree has moved far past it. Check the
  Capacitor version, the next free migration number, the notification kind count,
  and the repo visibility. **Do not skip this** — it is the whole reason that
  section exists. *Time: 20 min.*

- [x] **2.2 — DONE 2026-10-05 (`608bd13`).**
  `research/native-apps/2026-10-05-capacitor-grounding.md`, 284 lines, **42
  primary-source URLs**, and its deltas are now appended to slices 2–3 of
  `.scratch/native-apps/plan.md` so a builder cannot get the FCM v1 shape or the
  Capacitor 8.5 UIScene change wrong at the point of need.
  ~~Slice 0: grounding.~~ Pin current Capacitor conventions, APNs/FCM
  request shapes, and what Apple's guideline 4.2 rejects *today*, from primary
  sources. Both move. *Time: ~1 hour.*

- [ ] **2.3 — Slice 1: the Capacitor shell, Android-first, bundling `dist/`.**
  ⚠️ **Bundle the assets, do not load a remote URL.** A live-URL wrapper is the
  classic "repackaged website" tell and gets rejected. Android is first because
  Java 26 and `~/Android/Sdk` are installed on this box — the whole loop is
  testable locally today.
  *Done when: a debug build installs and launches on a real Android device.*
  **STATE 2026-10-06 — the emulator answered everything it can.** The APK
  installs, launches, and **survives 100+ seconds** (the earlier disappearance at
  ~45s did NOT reproduce, and this run logged **zero** `android.hardwar` crashes,
  which is what was suspected). Its WebView was then queried over Chrome DevTools
  Protocol — not assumed — and it RENDERS: `readyState: complete`, the boot splash
  has cleared itself, and React has mounted the real `/login` screen
  ("Playdates with other families — just show up.", 7 controls, Privacy/Terms
  links). ⚠️ A `screencap` of it is WHITE, and that is a **headless-emulator
  screencap limitation rather than a blank screen**: a stock app captures
  correctly on the same emulator while WebView content does not. **What is still
  unproven is how it LOOKS**, because this model cannot read images — that is a
  real gap and only a phone closes it.
  **EARLIER STATE 2026-10-05 — the build half is DONE, the "done when" is NOT.** The
  shell exists (`9420465`), wears the app's own icon and splash (`a0c628d`), names
  the public web app in its outbound links (`01da1aa`), and **the release bundle
  is SIGNED** (`ce3da9e`). The APK is at
  `android/app/build/outputs/apk/debug/app-debug.apk`. On the emulator it
  installed and `MainActivity` resumed at t+5s/t+15s with Capacitor serving the
  bundled assets, then the process was gone by ~t+45s **on an emulator whose own
  `android.hardwar` was SIGABRT-ing every 5s** — so which side is at fault is NOT
  established, and only a real phone answers it. **This is a founder step.**

- [x] **2.4 — DONE 2026-10-05 (`01da1aa`).** `src/lib/publicUrl.ts` exists with
  its sibling test; `currentPublicOrigin()` is the single source of the outward
  origin and is used at **5 sites in `src/lib/db.ts`** (OAuth `redirectTo`, share
  URLs, password reset) and **2 in `src/lib/email.ts`**, with a loud warning when
  a native build lacks `VITE_PUBLIC_BASE_URL` — which is what stops a shipped app
  from handing out `https://localhost` links.
  ~~Fix the four browser-origin hazards as part of slice 1.~~
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
  **UNBLOCKED 2026-10-06 — the keystore was found by searching the box:** the
  upload key is `/home/jmeisburg/.android-keys/drop-in-upload.jks` (alias
  `upload`, mode 600, valid to 2054), referenced by the gitignored
  `android/keystore.properties`. Its **public** fingerprints, which is all
  `assetlinks.json` needs:
  `SHA-256 95:D0:0B:EF:A5:15:5C:23:5B:3F:2B:DB:EA:FD:70:D9:AD:B6:37:2D:23:46:8E:43:8E:27:E6:66:75:91:29:B4`.
  ⚠️ **Play App Signing re-signs your upload with GOOGLE's key**, so the live
  `assetlinks.json` will need **both** this fingerprint and the app-signing one
  Play shows after the first upload — a file with only the upload key verifies
  nothing for users who installed from Play.

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

- [x] **4.1 — VERIFIED 2026-10-05 against the real file:** `store/icon-512.png`
  measures **512x512, srgba (4 channels = alpha), 16,968 bytes** — spec is
  512×512, 32-bit PNG with alpha, ≤1024KB. No badges or ranking text in the art.
  ~~App icon.~~
- [x] **4.2 — BUILT 2026-10-06** at `store/feature-graphic-1024x500.png`, by
  `scripts/build-store-feature-graphic.mjs` (the script is the tracked half; the
  PNG sits untracked beside the icon, like `store/icon-512.png`). **It is composed
  from the app's OWN approved art** — the mark extracted from
  `assets/drop-in-icon.svg`, the Bricolage Grotesque the app ships embedded as a
  data URL, and the tagline already on the login screen — rather than invented,
  because the model that built it **cannot see images**. Verified without eyes:
  **exactly 1024×500, no alpha channel** (`channels=srgb`, PNG24), the brand plate
  and white ink both rasterise, the ink sits at `+154+178` with margins
  L154/R109/T178/B167 — **well inside the crop zone** — and both halves are present
  (mark 260px, text 461px). ⚠️ **A HUMAN SHOULD STILL LOOK AT IT ONCE.** What the
  checks cannot judge is whether it is *good*, only that it is complete and
  correctly placed; treat it as a starting point, not a finished asset.
- [ ] **4.3 — Screenshots:** minimum 2, up to 8 per device type. Phone is
  required. Use the real app with real (seeded) content — not mockups.
- [x] **4.4 — DRAFTED 2026-10-06** in `.scratch/store-copy-2026-10/spec.md`, with
  the character counts MEASURED rather than estimated: **short description 69**
  (limit 80) and **full description 1,722** (limit 4,000). Every claim in the copy
  is traced to a line of the shipped privacy policy, so the listing cannot promise
  something the policy does not say. ⚠️ It is drafted under the **recommended
  posture (NOT child-directed, adults)** and is final the moment that sentence is
  confirmed.
  ~~Short description and full description.~~
- [x] **4.5 — LIVE, checked 2026-10-05:** `https://drop-in-mu.vercel.app/privacy`
  returns **HTTP 200** (terms at `/terms`), from item 1.6.
  ~~Privacy policy URL from 1.6.~~
- [x] **4.6 — DRAFTED 2026-10-06** (`.scratch/store-copy-2026-10/spec.md` §6): the
  expected content-rating answers, with **user-generated content / interaction =
  YES** called out as the one honest "yes" (comments and messages exist). The
  contact email still needs the founder's pick — the policy uses
  `jonmeisburg@gmail.com`.

---

## Phase 5 — Policy declarations (Console forms — be precise)

- [x] **5.1 — ANSWERED ON PAPER 2026-10-06** (`.scratch/store-copy-2026-10/spec.md`
  §5): a row per Play data type with collected / shared / optional / purpose, and
  each row names the policy line it rests on. The global answers are **not shared
  with third parties** (the four processors act on our behalf — ⚠️ read Play's own
  definition of "shared" on the form before submitting), **encrypted in transit**,
  **deletion available by email as the policy states**, **nothing sold**, **no
  analytics**. Still needs a human to type it into the console.
  Original item: must declare what you actually collect: kid
  first names and ages, parent email, approximate location, photos, and messages.
  ⚠️ **It must match the privacy policy from 1.6 exactly.** A mismatch between the
  two is a common rejection cause. *Time: 1 hour, and read each question twice.*
- [ ] **5.2 — Ads declaration.** Declare "no ads" — there are none.
- [x] **5.3 — DRAFTED 2026-10-06** (`.scratch/store-copy-2026-10/spec.md` §4):
  **adults only, NOT designed for Families**, with user interaction declared
  honestly (comments + messages exist) and the location answer reasoned from the
  policy ("an area, not a position"). ⚠️ One judgement call is flagged there:
  screenshots showing children's faces could invite a reviewer to answer "appeals
  to children" — so the screenshots should show the interface and places instead.
  Original: This is where the 0.2 decision gets
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
- [x] **7.3 — MEASURED 2026-10-05, and the count was wrong.** The nightly was
  dispatched by hand on `19c4722` (`gh workflow run e2e-scheduled`) rather than
  assumed: **195 passed, 4 failed, 2 skipped, 18.8m**. It is FOUR, not two, and
  the two extra ones are also CI-environment only — **all four pass on a dev
  machine**, which is the property that makes them flakes rather than defects:
  1. `places.e2e.ts:918` `the marker bubble stays open` — the recorded one
     (overlapping Leaflet markers).
  2. `places-map-view.e2e.ts:801` `aria-current` came back `""` instead of
     `"true"` — the recorded intermittent; it passed 3/3 locally.
  3. `card-circles.e2e.ts:215` `expect(Math.abs(circleMidY - labelMidY))
     .toBeLessThan(4)` got **128** — passes locally; the size of the miss says
     the CI renderer laid the card out differently (webfont-dependent geometry),
     not that the circle drifted.
  4. `post-fast.e2e.ts:768` `expect(measured.controls.length)
     .toBeGreaterThanOrEqual(8)` got **0** — passes locally; zero controls means
     the page had not rendered when the measure ran, i.e. a wait, not a layout.
  **TWO OF THE FOUR ARE FIXED (2026-10-05, same night), on the diagnosis above:**
  - **#4** — the sweep now waits for the `<form>` to attach before measuring, so
    "zero controls" can only mean the form is genuinely absent. That guard was
    doing its job on a form that had not arrived.
  - **#3** — the alignment comparison took the FIRST `span.bg-slate-200` in the
    card; the count is now pinned to exactly ONE, so an ambiguous selector fails
    **with the number** instead of appearing later as a 128px geometry mystery.
    Both changes re-run green locally (card-circles 2 passed, post-fast 2 passed)
    and the next nightly is the referee.
  **✅ CONFIRMED BY THE LANE, run by run, rather than assumed:**
  `19c4722` **195 / 4** → `06d168d` **197 / 2** → `32ad265` **197 / 2** (which two
  moved) → `30465ac` **198 / 1**. Every fix above held, and **the ONLY failure left
  in the entire suite is the product question below** — not a flake.
  **STILL OPEN, and now with a sharper diagnosis than "a race":**
  ⚠️ **AND THE COMPOSITION MOVED — and this one IS the same class, diagnosed.**
  The run traded `#1` for `places.e2e.ts:2886` *"a tapped feed pin names the
  drop-in happening there"*: `place-marker-info` was **"element(s) not found"**, a
  panel nothing had asked for. Its probe clicks every indigo pin with
  **`{ force: true }`**, which dispatches at the centre WHATEVER is on top — so an
  overlapped pin hands its click to the NEIGHBOUR and no popup opens for either.
  That is the marker-bubble defect next door, in a second place. **FIXED the same
  way**: the probe hit-tests each pin's centre and skips the ones that are not
  their own (`force` stays, so a probe of every pin still cannot hang; the hit
  test decides WHETHER, `force` decides that it cannot block). Green locally:
  `places.e2e.ts` **24 passed (1.8m)**, whole file.
  **The count has stayed at 2 across four runs while WHICH two moved — that is the
  signal that this is one class in several places, and the follow-up worth doing
  is ONE shared "reachable pin" helper rather than a third copy of this guard.**
  - **#2 `places-map-view.e2e.ts:801`** — the spec writes `strip.scrollLeft =
    clientWidth` and then asserts `places-map-card-0` still has
    `aria-current="true"`, i.e. the stated invariant "the FOCUS does not move on a
    programmatic write". Under `scroll-snap-type: x mandatory` Chromium CLAMPS and
    re-snaps the write, and **card widths differ in CI because the webfont does**,
    so the write can settle on a different snap point and the app then marks THAT
    card current. ⚠️ **THIS IS A PRODUCT QUESTION, NOT A TEST TWEAK**: should a
    programmatic scroll move the selection to the settled card, or never move it?
    The app's own comment says never; its observed behaviour says it follows the
    settled geometry. **Decide the rule, then fix the app or the assertion — an
    agent changing either one alone would be picking the answer by accident.**
  - **#1 `places.e2e.ts:918` — FIXED 2026-10-05, awaiting the referee.** The
    helper chose a pin by ARITHMETIC (inside the pane, clear of the controls, of
    the open bubble, of the tapped pin) and never asked whether the point
    BELONGED to that pin. With overlapping circle markers a neighbour drawn later
    sits on top, the click lands on the wrong pin, its popup never opens, and
    Playwright retries until the **120s timeout** — which in the log is
    indistinguishable from "no pin is reachable". It now hit-tests the point
    (`elementFromPoint`, the same rule this helper already applied to Leaflet's
    CONTROLS), so an unreachable pin is skipped and, if none is reachable, the
    spec says so in one line instead of hanging. Green locally (2 passed); the
    next nightly decides.
  ⚠️ The same dispatch found and fixed something bigger: **a real regression from
  the `E2E_BASE_URL` centralisation** — seven specs had lost the import and threw
  `ReferenceError: E2E_BASE_URL is not defined` at RUN time, which `--list` cannot
  see. That is fixed (`19c4722`), `e2e/` is now TYPE-CHECKED inside `verify`
  (`npm run typecheck:e2e`), and this is the run that proves it: ~20 failures
  before, 4 after, with none of the four mentioning the constant.
- [~] **7.4 — ~95% DONE, one string BLOCKED (2026-10-05).** The push and email
  halves already say "going" (`ping_received` renders as `${actor} is going`), and
  most `grep` hits are comments or identifiers, which the item's own scope rule
  excludes. The ONE remaining user-visible string is
  `src/pages/FeedPage.tsx:195` — **another session's in-flight file** — and the
  item's acceptance is "no user-visible string on ANY screen", so finishing the
  rest would ship BOTH vocabularies. One-line change once that file is free; the
  full classification is in `.scratch/next-batch-brief.md`.
  ~~"ping" → "going" terminology pass.~~
- [x] **7.5 — DONE WITH 1.1** on 2026-10-06 (same action, same run).
- [x] **1.1b — THE SWEEP'S SAFETY NET WAS HALF BLIND, AND THAT IS FIXED (found
  2026-10-06, after the sweep ran).** The collateral probe — the gate that exists
  because a real parent's row was once destroyed by a cascade nobody modelled —
  named **17** cascade edges while the live schema had **34 over 29 pairs**. It was
  blind to whole tables added since it was written: `messages`,
  `message_recipients`, `message_reactions`, `notification_log`,
  `conversation_reads`, `direct_conversation_reads`, `account_links`,
  `parent_cards`, `place_comments`, `reviews`, `ping_kids`. **The check that was
  supposed to catch this asserted `length === 17` — a count pinned to one day's
  measurement, which stays green while the model rots.**
  **WAS ANYTHING LOST? MEASURED: NO.** All 36 unmodelled edges were re-queried
  against the live database and every one held **zero** blocker rows, so the
  2026-10-06 sweep destroyed nothing it did not name. The probe was blind, not
  wrong — this time.
  **FIXED:** every one of the 29 pairs is modelled (34 edges), the stale count is
  replaced by a floor plus a requirement that every cascade-bearing TABLE is named,
  and the live probe now refuses rather than reporting "Safe" over edges it never
  looked at. Three real bugs were found and fixed in my OWN first attempt, each by
  running it rather than reading it: a duplicate edge, `id in VICTIMS` on tables
  with no `id` column (the probe refused with 42703 — a crash, not a guard), and
  `select p.id` on `going_pings`, whose key is `(playdate_id, profile_id)`.
  ✅ **AND THE LIMIT IS NOW CLOSED (2026-10-06, same day).** The probe no longer
  trusts its own list: `schemaCascadePairsQuery()` reads every `ON DELETE CASCADE`
  edge out of the LIVE schema and `schemaRefusals()` refuses when the model does
  not name one — so a table added tomorrow stops the sweep instead of being
  silently ignored. The parent set is derived from `MARKER_ROWS`, never retyped, so
  it cannot drift from what the sweep deletes; `auth.users` is excluded on purpose
  (its cascade into `profiles` is the intended removal the marker predicate already
  covers). It **fails closed** like every other gate: an unreadable read, an empty
  read, or a read with fewer pairs than the schema is known to have all REFUSE.
  Live proof: `collateral` now prints *"the model names 34 edge(s); the live schema
  has 29 parent->child pair(s)"* and still reports Safe.
  **The remaining limit is only the composite key**: `ping_kids`→`going_pings` is
  modelled per-column and **over-counts on purpose**, because a false refusal is
  survivable and a false "safe" is not.
  ⚠️ **AND THE WIRING IS ITSELF CHECKED, because a gate nobody calls is the failure
  this repo keeps finding**: un-wiring `schemaRefusals` from the delete path left
  every behavioural check above green, so a check now reads the runner's source and
  fails if the call disappears. Verified by breaking it — un-wired, the check goes
  red; restored, it passes. **The sweep's checker is now 50 assertions.**, and 1.2 WAS deferred (no scratch project),
  so this is live: the residue is **801 accounts / 1620 rows**, measured
  2026-10-05 with `founder_overlap: 0`, and the sweep tool supports
  `select` / `delete` / `verify` with a dry run first. **It is the same single
  "sweep it" the founder owes 1.1** — not a second decision.
  ⚠️ **RE-MEASURED 2026-10-05 22:30: 1210 accounts / 2447 rows, `founder_overlap: 0`
  (the table and the method are at the top of this file).** ⚠️ **AND THE THREE
  MARKER-OWNED `playdates` ROWS ARE NOT JUST RESIDUE — ONE OF THEM ALREADY BROKE A
  SPEC.** `e2e/places.e2e.ts:2833` deletes its own placed post and asserts the feed
  then draws ZERO pins; the leftover row `e2e e2e-1791256169 Marker places` (Green
  Lake Park, hosted by the marker uid) kept a pin on the map, so the band correctly
  rendered "1 place with drop-ins" and the assertion failed. It was classified as
  what it is — a data-dependent spec defeated by e2e's own leftovers, not a code
  defect — and it self-heals when this sweep runs.
  ~~Retire the 352 test accounts' residue.~~

---

## The critical path, in one line

**Phase 2 (the shell) → Phase 3.3 (12 testers) → 14 days → Phase 6.4.**

Everything else can happen in parallel with that chain. **Phase 0.1 and 0.2 are
today, and Phase 2.1 can start this week** — every day the shell is delayed is a
day added to the end.

---

## What this checklist deliberately does NOT include

- **A React Native rewrite.** The repo has **2,191 unit tests in 75 files** and
  **191 Playwright test cases across 63 specs** — both re-measured 2026-10-04
  (`npm run test` exit 0; a count over `e2e/*.e2e.ts`). The previous figures here,
  1,953 and 161, had rotted. A rewrite discards all of it for no user-visible
  gain. Capacitor wraps what exists. Do not relitigate this.
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
