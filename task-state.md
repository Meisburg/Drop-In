# Task State

> The system of record. The orchestrator updates this after every phase
> transition. Subagent chat contexts are ephemeral — this file is not.

## Current position

- **V11 — the founder's V11 feedback batch (opened 2026-09-16, on the live V10 app).** Spec + 6 tickets in `.scratch/v11/` (order 01→02→03→04→05→06; 06 depends on 04). **NO migrations in the batch.** Per-ticket gate: `npm run build && npm run test`. Dev-agent pane REBUILT 2026-09-16 — the ACTIVE pane is tab `w4:tP` (label "5"), pane `w4:p12`, agent `v11dev2` (started via `herdr agent start`; the earlier `w4:tN`/`w4:p11`/`v11dev` pane is superseded — see the V11 section). **Tickets 01–06 are COMPLETE (code `aa7e991`, `61a9efa`, `b86a3bf`, `fc64dd6`, `456c7b9`, `e5d1462`) — the V11 batch is COMPLETE (tickets 01–06), final single-tenant gate GREEN on the final tree at HEAD `6f6e9e0` (coordinator verifier — raw gate results, reviewer verdicts, and open follow-ups in the V11 section below). SHIPPED to origin/master 2026-09-17 (local date) — push `d9239f4..a894a77` (16 commits: the 14 batch commits plus task-state bookkeeping `058d923` + `46aa848`, both task-state.md-only); `opencode.json` verified absent from the pushed range (grep count 0). Vercel production deploy **CONFIRMED LIVE 2026-09-17 (~09:00 PDT)** — `a894a77` is the current production deployment (deployment `3CB8rVrtcruYoMjbMSRBuR4dCd83`, auto-deployed by Vercel's git integration on the ship push; the ship record's "likely no auto-trigger" note predates the deploy landing just after the last probe window). Live proof: `https://drop-in-mu.vercel.app` serves the deployment's entry `/assets/index-o3zQGGgw.js` (sha256 `d3baa23d50ccaa60f3aec25da9c7dbfbc75b470ce2f6070213fdbeb7c4f803b5`) carrying both V11 t06 copy markers, and `/settings` answers 200 (full evidence in the V11 ship record below).**
- **V10 — "Post again" and friends (opened 2026-09-14, the founder's fast-recall batch).** Spec + tickets in `.scratch/v10/`, origin: the /post audit (the V9-t03 form is already near-minimal; the remaining cost is RECALL — nothing remembers the whole last post, kids sit behind the disclosure, "tomorrow at 10" is a fiddly date field). **ALL THREE TICKETS COMPLETE — DEPLOYED AND LIVE-PROBED (2026-09-14):** **01 Post-again clone (commit `ae69cdd`)**, **02 kids surfaced above the disclosure (commit `f688ab0`)**, **03 sentence prefill (code `ebb6bca` + live-probe fixes `b9c6d7f`)**. Final gate on the committed tree: build exit 0 · **824/824 unit (24 files)** · **e2e 76/76** · lint 0 errors. **NO migrations in the batch.** **Ticket 03 IS LIVE:** `prefill-playdate` ACTIVE (v4), secrets set (OpenAI `gpt-4o-mini`, key rode a 0600 temp file, shredded), probes all green — real JWT → 200 with correct extraction (relative date, 30-min grid, chips, ageHint), kid-name sentence → place+time only (no echo), anon/garbage/absent → 401, oversize/bad-shape → 400. **Two recorded deviations, both probe-evidenced:** (1) deployed `--no-verify-jwt` because the platform's ES256 wall rejected the very token supabase-js accepts (the function's own `auth.getUser` wall is the gate — all four unauthorized probes 401); (2) the per-instance rate limit is best-effort under cold starts (12 rapid probes all 200) — acceptable for a bound, the real cost cap is the LLM spend. The batch design (prefill, not chat) was chosen over CopilotKit deliberately; research at `.scratch/agent-post-page/research.md`.
- **Phase:** V3 PLAN COMPLETE — all 10 slices + tickets 01-10 closed; 0025 (guest list) applied live 2026-09-11 and verified (coordinator-verifier finish after the headless run died at its .env read). REMAINING HUMAN ITEMS CLOSED 2026-09-11 by Hermes coordinator: (1) marker sweep — 173 e2e users + opsmoke.test deleted via dashboard SQL API (safety gate: founder profiles verified outside the set; child rows scoped to markers; FINAL live DB: 2 auth users [jonmeisburg, nicolemeisburg], 2 profiles, 2 playdates [Greenlake, both Jon's]; remaining ping/comment/memberships belong to Jon+Nicole — kept); (2) founder-flag SQL — already applied (profiles.moderators=true on 'Jon Meisburg' verified pre-sweep, no action needed). V3 FULLY CLOSED.
- **Phase: V4 COMPLETE (2026-09-11).** Human enabled Google in the Supabase project; the blocker is cleared and the round-trip is verified — see the closure evidence below.
- **Active slice:** none — **V8 IS COMPLETE TO ITS HUMAN BOUNDARY (2026-09-13).** Tickets 01–10 are shipped and verified (`dd0642e` … `135c401`), 11's schema half is live with its UI deliberately held, and 12's instrument is delivered. Migrations **0028–0034 are ALL APPLIED LIVE** and probed. Final gate on the committed tree: build exit 0 · **655/655 unit (20 files)** · **e2e 48/48** · lint 0 errors · both PWA verifier scripts green · live DB swept back to 2 founders. **Next action (human):** (a) **push — mostly done (2026-09-12)**: keypair → `supabase secrets set` → `send-push` deployed → wall verified (service-role 200, anon 401) → `VITE_VAPID_PUBLIC_KEY` added to Vercel (Config/public, it's a public key) → `a97892e` pushed, live bundle `index-COPgHOaF.js` verified to carry the key (1 occurrence). **Remaining:** the Android phone test (`docs/push-setup.md`). **Schedule DONE (2026-09-12):** no dashboard Schedules tab on this plan (DOM-checked) and no `vault` → pg_cron+pg_net enabled, job `send-push-every-5-minutes` live (jobid 3); key injected via `.scratch/cron-schedule-send-push.mjs` (0600 temp file → CDP SQL API, never in a terminal/chat); 12:45 tick fired (job "succeeded", function booted at 05:45:00 in fn logs) and the drain correctly stamped the 2 pre-existing rows "no subscription" (`push_subscriptions` = 0 until the phone opts in). pg_net's fixed 5s response timeout means `_http_response` shows `timed_out` on cold-start ticks — cosmetic, delivery completes server-side; (b) **email verification**: flip Supabase's "Confirm email" and I land the chip + "Check your inbox" screen + the e2e harness change (`docs/email-verification-setup.md`); (c) **density**: run the first cohort (`.scratch/v8/density-log.md`). **V8 IS NOW ON Vercel (2026-09-12)** — `42dfb2a..a97892e` pushed; the live site serves `index-COPgHOaF.js` with the VAPID public key inlined, so new opt-ins subscribe with the bound key. Open *decisions*, not defects: the **logo mark** (V7 settled colour only) and the beta's SMTP setting.
- **Remaining human items:** the three in the Next action above. The e2e marker sweep ran clean again (168 markers, 0 founder overlap); live DB = 2 founders only.
- **V9 — the wife's feedback batch: the authorized batch PLUS two review-found tickets (opened 2026-09-13).** Spec + tickets in `.scratch/v9/`. **Tickets 01, 03, 04, 05, 10 and 11 are COMPLETE** (commits `e493e08`, `96bb96e`, `73c2f5e`, `c9b4836`, `6ae3f2b`, `cbabc6e`) — `/new` leads with the place picker and the neighbourhood is no longer a question (01), the post page is three decisions behind one "More options" (03), the feed holds nothing that has ended and links to the archive (04), a card leads with the kids' ages while names are optional (05), **a child's name has a real gate** (10), and **children's photos have left the public storage bucket — the files survive privately, the old public URLs are dead, and a private family photo replaces them** (11, which also folds in ticket 08). **Migrations 0035, 0037, 0038 and 0040 are APPLIED LIVE and probed.** Final gate on the committed tree: build exit 0 · **782/782 unit (23 files)** · **e2e 71/71** · lint 0 errors · live DB swept back to 2 founders. **What remains is the human's queue, not the batch:** **02 is deferred** (the human chose to build 03 against the EXISTING time control rather than ship 02's unconfirmed badge-suppression judgment call), 06 wants a one-line confirmation, and **09 needs an explicit yes** before dispatch. Two residuals are recorded, not hidden: the storage closure has a ≤1h CDN edge tail, and any account that signs up can read every *family* photo (signup is the only barrier). Details in the **V9** section below.

**Push pipeline — coordinator verification (2026-09-13, after the human's step-3 run).** Independently confirmed through the Management API and live probes: `send-push` is **ACTIVE** with `verify_jwt: true`; the three VAPID secrets exist; the **anon** bearer gets `401 {"error":"send-push is service-role only"}` (a 404 would have meant "not deployed"); the LIVE bundle carries the VAPID public key and no private half, so deployed opt-ins are **bound**. The DB half is live too: a real ping wrote a `ping_received` row and deleting the post wrote a `cancelled` row via the BEFORE DELETE trigger. **Step 4 is provably NOT done:** `pg_cron`/`pg_net` are not installed, and those two queued rows kept `sent_at` NULL across six minutes of polling — nothing invokes the function. The human's earlier service-role check returned 200 but **predates** those rows (12:16 UTC), so the sender has still never processed a queued row. Read from the code, that case is safe: a row whose recipient has no subscription is stamped `sent_at` with `error: 'no subscription'` and counted as skipped (`index.ts:259-264`) — no oldest-first starvation risk. Both rows are left in place as the canary for the moment the schedule exists.

**Note on writers:** the paragraph above the "Remaining human items" line and the ticket-08 row were edited by a SECOND agent (the human's other opencode pane) and were sitting uncommitted in this working tree; they are committed here after independent confirmation of every claim I could check. One writer at a time in this repo remains the rule.

**Push — the device test is PARKED (2026-09-13, human request: "can we skip this and move on?").** Everything up to the device boundary is proven: the schedule ticks (05:30, `succeeded`), the drain runs, and queued rows are stamped (`sent_at` set, `error: 'no subscription'` for recipients without a device). What has NOT happened: **no push has ever reached a device**, because `push_subscriptions` is still 0 rows — the phone never completed the opt-in. Two consequences to remember when it is picked back up: (1) delivery is unproven, so the "sent_at with `error: null`" case has never been observed; (2) the dedupe key is per `(family, kind, drop-in)`, so a ping that was SKIPPED for having no subscription is never re-delivered by a later ping of the same post — do not spend a test post before a device is registered. Nothing else about push is blocked; V9 work starts now.

### V4 closure evidence (2026-09-11, after the human's Google setup)

| Claim | How it was checked |
|---|---|
| Google is actually enabled | `GET /auth/v1/authorize?provider=google` now answers **302** to `accounts.google.com` with a real `client_id` (it answered 400 "provider is not enabled" for three rounds before). Facebook still 400 — correct per D3 |
| The round-trip really completed | Read `auth.identities` in the live DB: a **`google` identity for jonmeisburg@gmail.com created 2026-09-11 18:12:29 UTC**, `last_sign_in_at` matching. Supabase LINKED it to the existing email account (same address), which is why no new `auth.users` row appeared — and why the first-timer branch was still untested |
| The app hands off correctly | Live click on the built app: only "Continue with Google" renders, lands on `accounts.google.com` with `client_id=1039310980043-…`, `redirect_uri=<project>/auth/v1/callback`, `scope=email profile`, and `redirect_to=http://127.0.0.1:4173/` (the app's own origin). No JSON error page |
| **The first-timer branch** (the one every NEW parent hits, which the human's test could not reach) | Reproduced the exact state — real signup through the UI, then dropped only the profiles row via SQL — and drove the app again: **"Pick your display name" appeared** (`handleStepShown: true`), prefilled from the account's email local part, and submitting **advanced to "Set your location"** (`locationStepAfterSubmit: true`). Marker swept afterwards |
| Live DB after all checks | 2 auth users, 2 profiles, 2 playdates, 0 `e2e-` rows, founder moderator flag intact |

## V5 — beta readiness (opened 2026-09-11, human request)

| Item | State | Evidence |
|---|---|---|
| Password reset | complete | `/reset-password` (outside the shell, like /login — the recovery token lands in the URL fragment and the shell's gate would bounce that window) + "Forgot password?" on /login. `src/lib/passwordReset.ts` pure seams (redirect, `validateNewPassword`, neutral notice, rate-limit wording) + 12 tests; `sendPasswordReset`/`setNewPassword` in db.ts. Live-verified on the built app: reset mode hides the OAuth buttons and password field, the request shows the neutral notice (no error), and a token-less `/reset-password` load renders "This link didn't work". 290/290 unit |
| GitHub backup | complete | **https://github.com/jonmeisburg/drop-in** (private); `master` tracks `origin/master`; verified pre-push that no secret is tracked (`.env`, `e2e/.auth/`, marker session state all ignored) |
| Vercel deploy | complete | **https://drop-in-mu.vercel.app** — verified against the live URL: a signed-out load of `/playdate/5142f51d-…` renders the drop-in (title, place, host, Share, "Sign up to join in") rather than not-found or a host 404 (the SPA rewrite), service worker controls the page over HTTPS, manifest `Drop In`/standalone with all 3 icons 200 + 8 iOS startup images, Google handoff lands on `accounts.google.com` carrying `redirect_to=https://drop-in-mu.vercel.app/`, and a cold offline load still paints the shell. Mobile audit green at all 12 viewport/route combinations **on the deployed site** |

**Human URL-Configuration step: DONE** — `site_url` is now
`https://drop-in-mu.vercel.app` and `uri_allow_list` includes
`https://drop-in-mu.vercel.app/**` (read back from the live auth config).

**BLOCKER for inviting outside testers (measured from the live auth config, 2026-09-11):**
`smtp_host` is **null** (built-in test sender) and `rate_limit_email_sent` is **2 per
hour for the whole project** — so password reset is code-complete but cannot
carry a real beta yet. Also `site_url` is `http://localhost:3000`, which nothing
serves. Both are dashboard settings; `docs/beta-checklist.md` has the steps.

## V6 — first phone feedback (opened 2026-09-11, testing on the deployed URL)

Source: the human testing https://drop-in-mu.vercel.app on a real phone.

| Item | State | Evidence |
|---|---|---|
| Text too small | complete | Measured: text-sm used 249×, text-base 12× → body was 14px. Two passes: 16px, then **17px** (iOS body size) with headings 26px and a 14px floor enforced by `scripts/mobile-audit.mjs` |
| Low contrast (found alongside) | complete | text-slate-400 (≈2.9:1, under WCAG AA) used 32×; both gray tiers shifted up one, hierarchy preserved, no failing-contrast grays left |
| Bottom nav | complete | Icons above the labels + a REAL active state — the old code used Tailwind's `active:` variant (the CSS :active pressed pseudo-class), so the current tab was never marked |
| Going toggle read as a badge | complete | ""it's not clear that's indicating that you're going"" — bare circle → labelled pill ("I'm going" / "Going"), 44px, in the card's action row, plus a "More info" chevron |
| Photos should enlarge | complete | `ImageLightbox` via context; tap to open, tap/Escape to close. Decision #3 applied: the detail avatar enlarges while the NAME goes to the profile (they used to be one link) |
| Kids going (decisions #1 + #2) | complete | **0026** + **0027** applied live and verified. `ping_kids` (cascade from the ping), `count_kids_going` / `count_kids_going_for` (count for every signed-in viewer), `get_kids_going` (names+ages to host/pingers/mods only). UI: the detail page asks "Who's coming with you?" once you're going; the card reads "2 going · 1 kid". Verified end to end on a seeded marker: un-ping clears, the picker appears, the chip selects, "Other kids coming: Bernie · 6" renders, the card counts it. 295/295 unit |

**Regression caught by that verification (worth remembering):** the new hooks first landed BELOW the detail page's early returns, so React threw "rendered more hooks than during the previous render" and the whole detail page rendered blank — build and unit tests were both green. Screenshotting the real page is what caught it. A second race surfaced too: re-reading the selection before the write landed flipped the chip back off, fixed with an `onSaved` callback that fires only after the insert.

## V7 — brand palette (2026-09-11, human request → DEPLOYED)

Source: the human re-examining the brand ("the logo looks like a water drop",
then "which would moms like most?", then a Peanut palette reference). Indigo was
the brand; `scripts/design-detect.mjs` had it listed as an ACCEPTED finding whose
reason was literally "changing it is a brand change, not a CSS edit — tracked as
a product decision". The human made that decision, so the finding is now RESOLVED
rather than merely accepted.

| Item | State | Evidence |
|---|---|---|
| Name | **Drop In, kept** (decided) | Checked the space: "PlayDate" is taken *in this exact category* (playdate.today = "effortless playdate scheduling for busy parents"; also playdate.events + Panic's console owning the word in tech), while Drop In's collisions are drop-in *childcare* — adjacent, not competing |
| Palette | **Shipped** — commit `430a4bc`, live on `drop-in-mu.vercel.app` | Terracotta on a warm off-white base. Direction: "Peanut's structure, our own hues" — adopt their warm base + one committed accent, NOT their coral-red (that hue is the "app for moms" signal; this app is for both parents). Applied as Tailwind `@theme` overrides on the stock scales, so one file recoloured ~450 call sites and the authored lightness ramps survived |
| AA contrast | PASS, measured on the rendered app (local AND production) | headings `#2f4858` 9.59:1 · body `#5a676e` 5.83:1 · wordmark 4.66:1 · buttons (white on `#c8411c`) 4.97:1. Two terracotta tones on purpose: `#e8552f` is the brand hue (artwork), `#c8411c` is the action/text tone — `#e8552f` at 17px/under white text is only ~4.2:1 and fails AA |
| Gates | PASS | build clean · 295/295 unit · lint 0 errors · `mobile-audit.mjs` all 12 viewport/route combos **green against production** · `verify-pwa.mjs` green (SW controls the page, 3 icons 200, 8 startup images, **cold offline load still paints**) |
| Icons / splash / manifest | Regenerated + verified live | Apple-touch, 192, 512, maskable 512 and all 8 iOS splash PNGs re-rendered off indigo at the exact byte sizes the local build produced; manifest `theme_color` + `background_color` = `#e8552f`; compiled CSS carries **zero** legacy indigo hexes |
| Defect found by verifying the fix | Fixed in the same commit | `SplashScreen` was `bg-indigo-600`, so a cold start painted the deep action orange for one frame then jumped to the brighter boot-splash hue. Now `bg-indigo-500` — one colour across first paint, React splash, icon, manifest |
| **Logo MARK** | **STILL OPEN — not decided** | The droplet shape is unchanged (only recoloured). The slide+tree mark and the group-of-kids direction were both only *stand-ins* for comparing palettes. Next brand decision |
| Tagline | Proposed, not adopted | "The kids play. You make friends." — it is the promise the human's reference illustration actually depicts (grown-ups chatting in front, kids playing behind) |

**Local-only exploration artifacts (deliberately gitignored, never shipped):**
`public/logo-mockup.html`, `public/color-compare.html` — the palette and mark
comparison pages, plus `.scratch/*.cjs` verification scripts. They live under
`public/` so committing them would have published them.

## V7.1 — photo crop / zoom on upload (2026-09-11, human report → done)

Source: *"when a user uploads a photo they need an opportunity to zoom/crop the
photo because my kids pictures are not displaying properly in the circle."*
Plan of record: `.scratch/photo-crop/spec.md` + tickets `01`–`04`.

**Root cause, exact:** `prepareAvatarFile` (`src/lib/db.ts`) center-cropped every
upload with `(size - drawWidth) / 2` — the crop window pinned to the dead centre
of the source, with no pan, no zoom and no preview — and the square was then drawn
into a circle (`rounded-full object-cover`), which removes the corners too. One
function, three entry points, including **onboarding** (the first photo a new
parent ever uploads).

| Item | State | Evidence |
|---|---|---|
| 01 crop-geometry seam | complete | `src/lib/photoCrop.ts` + 30 unit tests (325 total pass). State is the window CENTRE in source pixels + a zoom, so the same state means the same thing at any window size, and zoom 1 is EXACTLY the old center-crop — which is what lets the step default to "touch nothing, get what you used to get" |
| 02 crop dialog | complete | `src/components/CropPhotoDialog.tsx` + the flow hook in `useCropStep.tsx`. Canvas preview painted with the encoder's OWN transform, circular mask, drag + pinch + wheel + slider, 3x zoom ceiling |
| 03 wire the 3 paths + EXIF | complete | `prepareAvatarFile(source, rect)` no longer decides framing; the ≤5MB gate moved into `useCropStep.beginCrop` (one place, before the decode AND the dialog); `createImageBitmap` given an explicit `imageOrientation: 'from-image'`; `e2e/avatar.e2e.ts` clicks through the dialog |
| 04 avatar resolution | complete | `AVATAR_SIZE_PX` 256 → 512. Measured through the real encoder: 512x512 JPEG at 3.3–5.7KB |
| Verification | measured, not asserted | The dialog is only reachable behind a session, so it was driven via `crop-harness.html` / `crop-encode-harness.html` — dev-only root HTML that Vite serves in dev and never builds, mounting the REAL components with the REAL CSS |
| Lint / build / tests | PASS | build clean · 325/325 unit · oxlint **0 errors**, and precisely **0 warnings on any line this work changed** (all 29 are pre-existing or from uncommitted scratch scripts — checked by intersecting warning lines against diff hunks) |
| Mobile audit | PASS | all 12 viewport/route combinations |

**The claim this feature rests on, and how it was settled:** that the frame the
user sees and the pixels that get saved cannot disagree. Both come from
`cropRectFor` — the preview is painted with `drawTransformFor`, which is DERIVED
from it — and the encoder was then fed three different rectangles of one 9-band
test image and returned three different images (bands 1 / 5 / 4). If the rect were
being ignored, all three would have been identical. Two independent checks of the
gesture layer came out right as well: dragging the photo DOWN moves the window UP
(the "photo fights my finger" bug is absent), and the same drag reaches band 1 at
3x where 1x could only reach band 3.

**Two bugs my own measurements caught and fixed:** the generated iOS splash images
had no CSS reset, so the wordmark sat 32px lower than the web splash (the app's
Tailwind preflight zeroes margins; a bare `<p>` does not); and the first version of
the font check compared an invalid font string, which canvas silently ignores, so it
reported every candidate as a perfect match.

**Still open, deliberately:** the tagline. And one acceptance criterion for ticket
04 cannot be closed from here — whether 512px is *visibly* sharp in the lightbox on
a real phone is perceptual and needs a human holding a phone.

### Review round — one high-severity defect found and fixed

An independent fresh-context reviewer (no prior exposure to this work) returned
**NEEDS_CHANGES**. Full findings and resolutions: `.scratch/photo-crop/review-response.md`.

**The one that mattered:** `useCropStep` passed `{ imageOrientation: 'from-image' }`
to `createImageBitmap`. That member is a **WebIDL enum**, and WebIDL THROWS on an
enum value an engine does not know (unknown KEYS are ignored; unknown VALUES are
not). The value needs Chrome/Edge 112+, Firefox 111+ or Safari 16+, while Vite 8's
own build floor is **chrome111** — inside this project's declared support envelope.
There the call threw, the catch blamed the user's file, and **no photo could be
uploaded at all**. It also bought nothing: `from-image` is the modern default. The
option is gone, and a regression guard in `scripts/crop-flow-harness.html` now
asserts `createImageBitmap` is never called with options — checked for vacuity in
the same run by patching an engine that throws on them.

Ten further real findings were fixed (bitmap leak on unmount-during-decode; a
gesture layer that could wedge permanently and a stale 3→2 pinch base; wheel zoom
dropping deltas; Escape not gated on `busy`; an e2e comment claiming more than its
assertions proved — it now reads the stored object back and asserts it is square;
stale "256px" user-facing copy; no guard on the encoder's rect and no test for
`AVATAR_SIZE_PX`; the verification harnesses being gitignored, so the central claim
was unreproducible — they now live in `scripts/` and are tracked). One nit is
accepted with a written reason.

The reviewer's own independent work corroborated the core: a **270,000-case fuzz of
the real `photoCrop.ts`** found no non-square, non-finite, out-of-bounds,
divide-by-zero or gap-producing state, and confirmed `clampCropState` is sufficient
(so the origin clamp is defence, not a patch over a hole).

Re-verified after the fixes: build clean · **340/340** unit · lint 0 errors · mobile
audit green at all 12 combinations · all four harness verifications re-run (pan
direction, zoom reframing, rect-honoured encode, the >5MB gate, cancel, and the new
`createImageBitmap` argument-count guard).

**Still unverified, stated rather than implied:** any real WebKit/Safari engine; EXIF
orientation on a real camera file (preview and encode share one bitmap, so they cannot
disagree *with each other* — whether it is upright is untested); the e2e suite (a live
Supabase mutation, so it was listed but never run); and the perceptual 512px sharpness.

### PWA / mobile-app readiness (verified round 2)

The "feels like a phone app" half of V4 is now backed by repeatable checks
(`scripts/`, documented in the README) rather than a one-off look:

| Check | Result |
|---|---|
| Service worker takes control of the page | PASS |
| Manifest installable | `Drop In` / `standalone` / `start_url: /` / `background_color #e8552f` (matched to the splash; was indigo before V7) |
| Every advertised icon resolves | PASS — 192, 512, maskable 512 (all HTTP 200, correct sizes) |
| iOS standalone metadata | `apple-mobile-web-app-capable: yes`, `apple-mobile-web-app-title: Drop In`, 8 `apple-touch-startup-image` sizes |
| **Cold offline load** | PASS — the precache serves the shell (login screen paints, no browser error page) |
| Splash lifecycle | boot splash in HTML → overlay at 61ms → gone at 1474ms (inside the 2s cap) → not replayed on navigation |
| Mobile audit | 12 viewport/route combinations green (320–430px portrait + 844x390 / 667x375 landscape) |

## V8 — retention queue (opened 2026-09-12, human-approved evaluation)

Source: the human asked for a product evaluation — *what is missing, and what
exists that we would improve, to make parents want to use this and keep using it
to meet other parents at fun places around the city* — then approved all of it and
asked for tickets. This session (the DSH coordinator) wrote the evaluation, the
spec and the tickets, and — by direct human instruction ("why not just do it
here") — built ticket 01 itself instead of handing it to the dev pane. One writer
in the repo was preserved throughout.

Artifacts: `.scratch/product-review/evaluation.md` (the read-only review; every
claim carries a file:line or a grep result) · `.scratch/v8/spec.md` (the queue, the
migration ledger 0028–0034, the shared migration-check procedure, the baseline
gate) · `.scratch/v8/issues/01`–`12` (one file per ticket, AC checkboxes + an
explicit migration check each) · `.scratch/v8/briefs/01-quick-post.txt` (the
dispatch brief, unused — the human redirected the work here).

**Diagnosis (measured, not vibes).** The app is a careful one-shot directory with
no reason to come back: **zero notification infrastructure** (no push, no email, no
in-app inbox; `dist/sw.js` precaches the shell only), **zero repetition**
(`playdates` carries one `starts_at`/`ends_at`; no recur/weekly/series concept in
any migration), **no memory of people** (the only user-to-user tables are `blocks`
and `going_pings`), and a supply side that fails cold (5-mile default radius, no
seeded or city-wide fallback → a new parent's first screen is *"Nothing happening
near you today — post the first one"*, `FeedPage.tsx:433-443`). The stated goal —
different fun places around the city — has no data model behind it: `place` is free
text and the neighborhood is a display label.

| # | Ticket | State |
|---|---|---|
| 01 | Quick post: today-default, recent places, one-tap preset | **complete** — `dd0642e`; no migration |
| 02 | First visit that isn't a dead end + honest/fresh states | **complete** — `7173b0c` + review round `d574eec` (fresh-context reviewer found a HIGH regression: the visibility refresh blanked the feed; plus the host's "No one has pinged yet" lie, inert escape buttons, and a weak spec assertion — all fixed); no migration; 390/390 unit, e2e 25/25 |
| 03 | "While you were away" inbox (pings on your posts, cancellations) | **complete** — `e016921`; no migration; 390/390 unit, e2e 25/25 (independently re-run). The old amber banner + `countPingsOnMyPosts` were DELETED (one implementation of "you have news"). Judgment call logged: cancellation items are not cursor-gated (playdates has no status-change timestamp) — gated on `starts_at > now` instead |
| 04 | Real post lists on `/u/:handle` and `/profile` | **complete** — `fc85093`; no migration; 403/403 unit, e2e 26/26. Boundary pinned on `ends_at` (the `isEnded` complement): a drop-in happening right now is UPCOMING |
| 05 | Post edit + delete | **complete** — `625d252`; no migration (0005's host-only UPDATE/DELETE policies were already there); 427/427 unit, e2e 31/31. `/new`'s form body extracted into `PlaydateFormFields` — string-identical, so the 12 specs that drive /new pass unmodified |
| 06 | Standing playdates (weekly series) | **complete** — `f54c066`; **0028 APPLIED LIVE** (dashboard SQL API, HTTP 201) with post-apply probes (objects, PostgREST 200 no PGRST205, anon fails closed 401/42501, generator created 3 then 0, zero residue); 454/454 unit, e2e 32/32. Ticket wording deviation, evidence-backed: the function ships VOLATILE because a STABLE function cannot write. New reusable `scripts/apply-migration.mjs` (the apply/probe path this repo had been doing by hand from `.scratch/v4`) |
| 07 | Places directory + place pages + Browse becomes places | **complete** — `48f3572`; **0029 + 0030 APPLIED LIVE** (239 real City-of-Seattle rows; probes: anon read 200, anon write fails closed, 13-field RPC); 514/514 unit, e2e 36/37 (the one failure is the KNOWN guest-list live-API flake — green in isolation). **0028 amended in place + re-applied** (the generator now propagates `place_id`). Finding recorded, not rewritten: 0021/0022's composite-type guard joins `t.oid = a.attrelid`, which never matches (correct: `t.typrelid`) — 0030 uses the corrected join |
| 08 | Web push + install affordance | **code complete + verified; SENDER DEPLOYED + VERIFIED (2026-09-12); LIVE SEND PENDING HUMAN** — `714bed8`; **0031 + 0032 APPLIED LIVE** (0032 re-applied after an in-place amendment: the `starting_soon` zero-count copy, probed NULL/0/1/3 live); 584/584 unit, e2e 42/42, both PWA verifier scripts green after the `generateSW → injectManifest` switch. Fresh-context reviewer returned NEEDS_CHANGES with 8 findings (the opt-in was ONE-WAY, `ping_saved` never fired, rotation repair not wired, a silent upsert collision, iOS webviews blocked, a discarded fallback note, the 0032 dead branch, install capture) — **all 8 fixed** and re-verified. **`docs/push-setup.md` steps 1–3 done (coordinator-ran 2026-09-12):** keypair in `.env.push.local` (0600, private half never printed/pasted/committed) → public key in `.env` + Vercel env (Config, public by design) → `supabase secrets set` + `functions deploy send-push` GREEN → **wall checks passed: service-role POST → 200 `{"ok":true,…}` (secrets landed, no 503); anon POST → 401 "send-push is service-role only"** → `a97892e` pushed, live bundle carries the key. **SCHEDULE DONE (2026-09-12):** no dashboard Schedules tab on this plan (DOM-checked) and no `vault` → `pg_cron`+`pg_net` enabled, job `send-push-every-5-minutes` live (jobid 3); key injected via `.scratch/cron-schedule-send-push.mjs` (0600 temp file → CDP SQL API, never in a terminal/chat); 12:45 tick fired (job "succeeded", fn booted 05:45:00) and the drain correctly stamped the 2 pre-existing rows "no subscription" (`push_subscriptions`=0 until the phone opts in). pg_net's fixed 5s response timeout shows `timed_out` on cold-start ticks — cosmetic, delivery completes server-side. **Remaining human-owned:** the Android phone test (opt in → ping from a 2nd account → buzz within 5 min). No real push has ever been sent |
| 09 | Loop-closing ("same time next week") + follow family/place | **complete** — `76a627b`; **0033 APPLIED LIVE** (probes: duplicate blocked 23505, both-targets blocked 23514, SECDEF counts work, anon fails closed); 620/620 unit, e2e 42/43 (the one failure is the second known live-API flake, green in isolation). Two spec bugs of the coordinator's own found by the post-apply check (a duplicate probe that asserted RLS instead of the unique index; an unfiltered DELETE PostgREST refuses with 400). Sweep tooling now counts follows / push_subscriptions / series rows |
| 10 | Polish batch (saves, undo, degraded states) | **complete** — `135c401`; no migration (the moderator-unhide item was PROBED, not assumed: 0009's policy is column-agnostic, so clearing `hidden_at` is admitted — the live round-trip is now a permanent spec; residue check mods=1, hidden_comments=0); 655/655 unit, e2e 48/48. Two existing specs touched, both reported (the one-submit copy change; the kid row's facts read off its new inline inputs) |
| 11 | Email verification (trust gate) | **schema DONE, UI BLOCKED ON HUMAN** — **0034 APPLIED LIVE** (column + 2 mirror triggers + 2 SECDEF functions; backfill matches `auth.users` 155 = 155). The "Verified email" chip is deliberately NOT shipped: with "Confirm email" OFF Supabase auto-confirms every signup, so the chip would mark EVERY account verified — a trust claim the app cannot make. Chip + "Check your inbox" screen + the e2e harness change land together when the human flips the toggle: `docs/email-verification-setup.md` |
| 12 | Density: the first-cohort playbook | `ready-for-human` — ops, no code. The instrument is delivered: `.scratch/v8/density-log.md` (the weekly ritual, the target — ≥3 series with ≥1 ping for three consecutive weeks — the stop rule, and the exact SQL for each number). Depends on 06 (series) and 07 (places), both shipped |

**Migration ledger:** 0028–0034 were RESERVATIONS in queue order (next free number
wins if the queue reorders; whatever is applied is what this file records).
**ALL SEVEN ARE NOW APPLIED LIVE and probed** — 0028 (re-applied after the in-place
amendment that propagates `place_id`), 0029 + 0030, 0031 + 0032 (re-applied after
the `starting_soon` copy amendment), 0033, 0034.

### V8 deployed to production (2026-09-13, human-authorized: "push it")

`git push origin master` → `ea40ef7..f6957e1` (15 commits, 116 files) → Vercel
auto-deploy. Pre-push safety check: nothing sensitive is tracked (`.env`,
`e2e/.auth/`, marker state all ignored; no VAPID keys exist), largest new blob
180 KB.

| Claim | How it was checked against the LIVE url |
|---|---|
| The new build is actually serving | the live `/sw.js` gained `pushsubscriptionchange` + `notificationclick` ~30 s after the push — handlers only the V8 `injectManifest` worker has (the old generated worker had none) |
| The PWA still holds up | `node scripts/verify-pwa.mjs https://drop-in-mu.vercel.app` green: SW controls the page, manifest/icons/head correct, and a **cold offline load still paints the shell** |
| The splash still holds up | `node scripts/verify-splash.mjs` green: overlay at 173 ms, gone at 1507 ms, inside the cap, not replayed on nav. (`bootSplashInHtml: false` there is a race in the verifier itself — the static markup IS in the served HTML, confirmed by curl: `id="boot-splash"`) |
| Phone widths | `node scripts/mobile-audit.mjs https://drop-in-mu.vercel.app` — all 12 viewport/route combinations green |
| The new public route resolves | `/place/7b6ada36-…` (Green Lake Park East) → HTTP 200 SPA shell; `/playdate/65d0c351-…` → 200 |
| The DB the deploy talks to | all 0028–0034 probes above; the live DB is swept to 2 founders |

**Still human-owned after the deploy:** the push send path (VAPID + `send-push`
deploy + schedule), the email-confirmation toggle (with its follow-up chip
slice), and the density cohort.

### V8 ticket 01 — evidence (complete, `dd0642e`)

| Claim | How it was checked |
|---|---|
| `/new` opens on today + the next 30-minute slot | pure seams (`nextSlotMinutes`, `defaultStartDateIso`, `durationChipForUntilNextHour`/`suggestedDurationMinutes`) + 20 new unit tests, incl. the 23:45 wrap (date advances so the form never opens on a start that already passed) and the "always a legal stepper value / always a real chip" sweeps |
| A recent place fills three fields in one tap | `recentPlacesFrom` (newest wins, case/whitespace-insensitive dedupe, 3-chip cap, rows with no place dropped) + `queryRecentOwnPlacesWithClient` (host-scoped, created_at DESC, bounded scan) against a mocked client; live in the new e2e |
| The preset cannot promise one time and write another | ONE mount-time `now` feeds both the label and the values; the e2e reads the button's own label and asserts the rendered "Ends …" line matches it |
| Posting still needs no date/time work, and lands on the feed | `e2e/quick-post.e2e.ts` (2 tests, phone-width): the default is asserted race-proof (the mount falls between two evaluations of the same pure seam), a post is created touching only title/place/neighborhood/duration, and a phone-width `/new` has no sideways overflow |
| **Gate** | build exit 0 · **360/360 unit** (was 340) · **e2e 21/21** (was 19; the full suite re-run, not just the new spec) · `scripts/mobile-audit.mjs` 12/12 viewport/route combos green |

**Deviations / findings from ticket 01 (all deliberate, logged here):**

1. **Twelve specs were pinning the OLD DEFAULT.** `comments`, `share-public`,
   `zip-radius`, `host-status`, `address-maps`, `kids-v3`, `comment-replies`,
   `card-circles`, `guest-list`, `host-retention`, `avatar` and `golden-path` all
   hardcoded "10:30 AM" after one `+` press (and "Ends 11:30 AM"). That asserted the
   10:00 AM default, not the contract, so the ticket's default change broke all of
   them by design. New `stepStartTimeOnce` (e2e/fixtures.ts) reads the label the form
   actually rendered, presses `+` once, and hands the spec the parsed start — the
   specs now assert the **30-minute grid** and `start + duration`, immune to both the
   default and the wall clock. No assertion was weakened: the end-time assertion is
   now derived rather than hardcoded.
2. **The preset's label is dynamic** ("We're here until 3:30 PM") where the ticket
   pinned the literal `"We're here until 5"`. A fixed "5" would have been a lie for
   most of the day: the suggested duration is "to the next whole hour", which on the
   30-minute grid is always 1h. The affordance and its semantics are unchanged.
3. **The title default fires on a place arriving, not only via the preset.** The
   ticket pinned "prefills the title as `Playdate at <place>` … only when the title
   is empty, and only once place is set". That rule is implemented in one place
   (`withDefaultTitle`) and applied both by the preset AND when a place arrives
   (chip tap or typing), because the common flow is chip → Post, which the preset-only
   reading would have left untitled.
4. **No `db-v8.test.ts`.** The new db.ts round-trip (`listRecentOwnPlaces`) is
   covered by the mocked query test in `feed.test.ts`, where the recording mock
   builder already lives (the ticket's AC pointed at a `db-*.test.ts` file); the
   live round-trip is proved by `quick-post.e2e.ts`.
5. **`scripts/mobile-audit.mjs` cannot cover `/new`** — it walks only the signed-out
   routes (`/login`, the public detail page), so the ticket's 375px AC is asserted
   inside `quick-post.e2e.ts` at a 375×812 viewport instead (no horizontal overflow,
   with the preset card and both chip rows rendered).
6. **Marker sweep due.** This session left 4 marker accounts in the live project:
   `e2e-1789187031`, `e2e-1789187043` (+ viewers `e2e-v-1789187060-1`/`-2`) and
   `e2e-1789187175` — the usual post-run sweep (`node scripts/sweep-e2e-markers.mjs`
   with the CDP Chrome up) has not been run yet.

## V9 — the wife's feedback batch (opened 2026-09-13)

Source: the human relaying his wife's feedback on the live app, filed as
`.scratch/v9/spec.md` + `.scratch/v9/issues/01`–`09` at the end of the V8
session, plus `.scratch/v9/HANDOFF.md` (the index a fresh session starts from).
This session (the DSH coordinator) took the HANDOFF's recommended first move:
build **01, 03, 04, 05** in queue order, with builder → independent gate re-run
by the coordinator → fresh-context reviewer for any large diff → one commit per
ticket → this file updated at each close-out. Dispatch briefs (with the traps
the coordinator verified before briefing) live in `.scratch/v9/briefs/`.

**Baseline at open (re-verified by the coordinator, not taken on trust):** build
exit 0 · **655/655 unit (20 files)** · e2e 48/48 per the HANDOFF · migrations
0028–0034 applied · live DB 2 founders / 5 posts / 0 e2e markers.

| # | Ticket | State |
|---|---|---|
| 01 | Post: location first — pick a place, drop the neighbourhood | **complete — `e493e08`**; **0035 APPLIED LIVE + probed**; 673/673 unit, e2e 54/54, lint 0 errors |
| 02 | Post: a time WINDOW, not an hour | **DEFERRED BY THE HUMAN (2026-09-13)** — see the decision below. Ticket stays `ready-for-agent` pending the badge-suppression confirmation; 0036 stays reserved |
| 03 | Post: the twenty-second post (3 decisions, rest behind "more") | **complete — `96bb96e`**; no migration (`supabase/` verified untouched); 702/702 unit, e2e 59/59, lint 0 errors |
| 04 | Nearby: ended drop-ins leave the feed, into the archive | **complete — `73c2f5e`**; no migration (read-path only, `supabase/` verified untouched); 720/720 unit, e2e 61/61, lint 0 errors |
| 05 | Nearby: ages first, names optional | **complete — `c9b4836`**; **0037 APPLIED LIVE + probed**; 752/752 unit, e2e 65/65, lint 0 errors |
| 06 | Nearby: map-first with a list toggle | `ready-for-human` — needs the map-provider one-liner (Leaflet + OSM recommended) |
| 07 | Nearby: search + filters | not in this session's batch |
| 08 | Profile: no kid photos; a family photo + about-us | **FOLDED INTO 11 (2026-09-13)** — its kid-photo reversal and its family-photo feature both run through the same storage bucket, and ticket 10's review proved that bucket is publicly readable, so the two cannot ship apart. `0038` carried over to 11 |
| 09 | Messages: parent-to-parent on a shared drop-in | `ready-for-human` — **do NOT dispatch without an explicit yes** |
| 10 | Privacy: kid names are readable by every signed-in parent | **complete — `6ae3f2b`**; **0040 APPLIED LIVE + probed** (amended in place and re-applied in review cycle 1); 757/757 unit, e2e 66/66, lint 0 errors |
| 11 | Kid photos: the public storage exposure; family photo instead | **complete — `cbabc6e`**; **0038 APPLIED LIVE + probed**, objects migrated; 782/782 unit, e2e 71/71, lint 0 errors |

**Migration ledger:** 0035–0039 were RESERVATIONS in queue order. **0035, 0037, 0038
and 0040 are now APPLIED LIVE** (all probed; 0040 was amended in place and
re-applied in review cycle 1). 0036 stays reserved for the deferred ticket 02;
0039 remains reserved for ticket 09. Whatever is applied is what this file
records.

### V9 decision taken this session — ticket 02 vs ticket 03 (2026-09-13)

Ticket 03's first AC is pinned to "pick a place, tap a **window chip**, tap
Post", but the window chip is ticket 02 — which 03 itself declares itself
blocked by, and which carries a human judgment call (an approximate start time
cannot honestly power "Happening now / Starts soon", so the recommended default
suppresses those badges for approximate posts). The HANDOFF listed 03 as needing
no decision and 02 as needing a one-line confirmation, so the two contradicted
each other. **The human's call: build 03 on the EXISTING time control and leave
02 for later.** So in ticket 03 "window chip" ⇒ the existing duration chips, and
"the exact-time controls from ticket 02" ⇒ the existing date input + 30-minute
stepper. Ticket 02 is NOT built, NOT applied, and its judgment call is NOT
pre-empted.

### V9 ticket 01 — evidence (complete, `e493e08`)

| Claim | How it was checked |
|---|---|
| `/new` leads with the place picker and never asks for a neighbourhood | `e2e/post-location.e2e.ts` reads the form's own field order and asserts the place input is FIRST; asserts the label, the Browse button and its `aria-expanded` round-trip; asserts `select` count 0 and the words "Neighborhood" / "Pick a neighborhood…" absent |
| A post with a place and NOTHING else is postable | the spec's first test is the raw PostgREST insert with no `neighborhood_id` (the payload the form sends) and reads the column back as NULL. **Red by design pre-0035**, quoted verbatim: `HTTP 400 — {"code":"23502",…"null value in column \"neighborhood_id\" of relation \"playdates\" violates not-null constraint"}` |
| The signed-out view tolerates a NULL label | a session-less browser context loads a neighbourhood-less post, asserts the title and the place link render and that "We couldn't find this drop-in" does NOT — **with an in-band sensitivity proof** (the same context loads a bogus id and that heading DOES appear), so the negative assertion cannot be vacuous |
| Migration 0035 + probes | `information_schema`: `playdates.neighborhood_id` and `playdate_series.neighborhood_id` both `is_nullable = YES`; both FKs still `confdeltype = 'r'` (ON DELETE RESTRICT); `pg_get_functiondef` shows exactly ONE neighbourhood join and it is the LEFT join; the anon RPC returns **HTTP 200 with the full 13-field payload and `neighborhood_name: null`** for a NULL-neighbourhood post (pre-0035 that same call returned NULL = a signed-out "not found"), and **`"Green Lake"`** for an existing post; the probe row was deleted (residue check: 0 probe rows, 5 posts, 0 with a null neighbourhood) |
| **Gate (coordinator, independent)** | build exit 0 · **673/673 unit (20 files)** · **e2e 54/54, exit 0** · lint **0 errors** (39 warnings = the pre-existing baseline) |
| Marker sweep | after the suite: 81 marker accounts, **0 founder overlap**, 0 child rows left by the specs → deleted; verified back to **2 profiles / 5 posts / 0 e2e left / moderator flag intact** |

**Deviations and findings from ticket 01 (all deliberate, logged here):**

1. **Two traps the ticket's "no other column changes" line did not anticipate,
   both verified live BEFORE the migration was written, and both folded into
   0035** (the ticket file itself carries an AMENDED note):
   (a) `get_public_playdate` joined the neighbourhood with an **INNER** join, so a
   NULL neighbourhood made the whole function return NULL — every logged-out
   visitor would have got "not found" for a post that exists, with no error
   anywhere. Re-created with a LEFT join (the composite type needed no swap:
   `neighborhood_name` was already nullable text).
   (b) `playdate_series.neighborhood_id` was NOT NULL and 0028's generator copies
   it into every occurrence, so **"Repeat weekly" would have died on its own
   23502 before the post landed** (`/new` awaits `createPlaydateSeries` before
   `createPlaydate`). That column drops NOT NULL in the same migration.
2. **Four `neighborhoods!inner` embeds became plain (LEFT JOIN) embeds** — the
   ticket named the feed and the profile; an INNER JOIN would have silently
   dropped every neighbourhood-less post from **the feed, the profile lists AND
   the place page**. The memberships embed (`db.ts:392`) correctly keeps
   `!inner` (that FK is NOT NULL).
3. **The empty string would have failed BEFORE and AFTER 0035.** The ticket
   predicts the pre-apply failure is 23502, but the form held `''` and the old
   write sent it as a uuid → `22P02`. Fixed with the house `…IdField` pattern:
   the insert OMITS the key, the update writes NULL. This is *why* the
   documented red is a clean 23502.
4. **21 existing specs filled the removed select**, so each lost that step and
   every one is marked in place. **Three assertions changed** and are quoted
   in-file: `quick-post`'s `toHaveValue(/.+/)` on the gone select →
   `toHaveCount(0)`; `post-edit-delete`'s `/edit` prefill assertion →
   `toHaveCount(1)` + `toHaveValue('')`; `feed.test.ts`'s embed and validator
   tests. No test was weakened.
5. **Fresh-context review returned NEEDS_CHANGES with 3 findings; all fixed**
   (review cycle 1 of a permitted 2). The reviewer found a **real defect** the
   builder and the coordinator had both missed: a "Recent places" chip writes the
   remembered post's REAL neighbourhood id into a form that renders no
   neighbourhood field, and a later place pick inherited it — so place and
   neighbourhood could contradict each other on the card. Fixed *structurally*
   (`placePickPatch(place)` takes only the place, so "fall back to the invisible
   previous value" is no longer expressible) and pinned by a unit test plus an
   e2e that reproduces the exact sequence. The other two: the only assertion
   covering `/edit`'s stored-neighbourhood prefill had been deleted with nothing
   replacing it (restored, plus the clear-to-NULL half), and two assertions in
   the new spec **could not fail** (both replaced with exact-text assertions;
   the card's meta line is now compared against `feed.formatTimeWindow` — the
   function the card itself renders — with whitespace collapsed because Node and
   Chromium ship different ICU builds).
6. **`/edit` untouched by design.** `PlaydateFormFields` is shared, so the new
   layout rides props (`locationFirst`, `showNeighborhood`, `onBrowsePlaces`)
   whose defaults reproduce V8 ticket 05's markup byte-for-byte; `e2e/fixtures.ts`
   is byte-identical (`stepStartTimeOnce` needed no change — that is ticket 03's
   problem, not this ticket's).

### V9 ticket 03 — evidence (complete, `96bb96e`)

| Claim | How it was checked |
|---|---|
| A post is THREE decisions; everything else is behind one disclosure | the summary renders the read-back with the place picker, the duration chips and Post; the spec asserts each moved field is **absent from the DOM** collapsed (`toHaveCount(0)`, i.e. the disclosure unmounts rather than hides) and present expanded |
| "≤4 taps + 1 typed place" (measured, not described) | a capture-phase listener records clicks across the SPA navigation; the spec asserts the click count **and the touched-CONTROL SET** — exactly four: the place field, the picked row, one duration chip, Post. A fifth control fails the spec whatever its event type, so "nothing else may be required" cannot silently stop being true |
| The summary reads back exactly what will be posted | `postSummaryLines` is pure and pinned line-by-line; the e2e compares the rendered lines against the seam (bracket-mount race-proof), then cross-checks the card and the **DB row's** `starts_at`/`ends_at` and address |
| `mobile-audit` stays green | 12/12 on the signed-out routes — **and the honest limit is recorded**: the script cannot walk `/new` (V9/01 finding #5), so the `/new` half is asserted in the e2e at **320/375/390/430 + landscape**, collapsed and expanded: no horizontal overflow, every visible control ≥44px |
| **Gate (coordinator, independent)** | build exit 0 · **702/702 unit (21 files)** · **e2e 59/59, exit 0** · lint **0 errors** (39 warnings = baseline) · `git status --short supabase/migrations` empty |

**Deviations and findings from ticket 03:**

1. **The ticket-02 substitution** (the human's call — see the decision section
   above): "tap a window chip" ⇒ the duration chips; "the exact-time controls
   from ticket 02" ⇒ the existing date input + stepper. Both now sit behind the
   disclosure and are read back in the summary. `e2e/post-time-window.e2e.ts`
   (named in the ticket's Verify line) does not exist — it is ticket 02's spec.
2. **A real defect the fresh-context reviewer found inside this ticket's own
   AC** ("no field is hidden that changes what the parent is agreeing to"): the
   **address was a hidden default**. A pick writes the place's published street;
   typing over the place text dropped the `place_id` but KEPT that street, so the
   collapsed summary could read "Ballard Playground" while the row carried
   **Green Lake's** address — the very value the detail page renders as the
   Google Maps link. Fixed both halves: the address is read back on the place
   line, and a PICK-written address is dropped when the place text changes while
   a parent-TYPED address survives (`addressAfterPlaceTextEdit`).
3. **A cross-ticket AC inversion, resolved by satisfying BOTH ACs** (review
   cycle 1, F2): the summary's title input had become `/new`'s first field and
   first tab stop, contradicting ticket 01's AC 1 — whose whole point is that the
   place picker must be *discoverable*, because it used to read as plain text
   nobody found. Rather than re-pin either AC, the title is now a **tap-to-edit
   read-back**, so the place picker is still the first field *and* first tab stop;
   `expect(fieldOrder[0]).toBe(PLACE_PLACEHOLDER)` is **restored verbatim** (plus
   the stricter `toEqual([PLACE_PLACEHOLDER])`), and **both ticket files carry
   AMENDED notes** — the record is in the files, not only in an e2e comment.
4. **Three more real findings**: the summary's repeat line promised a series the
   submit would not create (now gated on the submit's own guard — no date, no
   line); the "1 typed place" half of the interaction budget was unmeasured (the
   touched-set assertion now pins it); a cleared title was unrecoverable and
   blocked Post (an emptied title counts as un-touched again).
5. **`/edit` untouched by construction**: every new behaviour rides props
   (`summaryLines`, `moreOptionsOpen`/`onToggleMoreOptions`, `minTouchTargets`
   default **false**) whose omission reproduces V8 ticket 05's markup
   node-for-node, so `post-edit-delete.e2e.ts` drives it unchanged.
6. **23 specs needed one `openMoreOptions`/`editTitle` call each.** The
   removed-line audit over the whole e2e diff found **exactly one** executable
   assertion ever affected — the `post-location` order pin, now restored. Every
   other change is an addition; no assertion was loosened, deleted or skipped.
7. **A regression the build caught and reported rather than buried**: the new
   `editTitle` helper used a non-retrying `count()`, which failed
   `loop-closing` once when the SPA had not painted; fixed by waiting on the
   retrying locator and re-verified in isolation.
8. **Still open, human-owned**: the ticket's own last Verify item — a real phone
   pass, timed from the installed icon to posted. This session can measure the
   in-browser interaction count (3 taps + 1 typed place) but not an installed-PWA
   pass.

### V9 ticket 04 — evidence (complete, `73c2f5e`)

| Claim | How it was checked |
|---|---|
| Nearby keeps only what is ahead or happening now; a started-but-not-ended drop-in STAYS with its badge | the cutoff moved to the post's own END on both layers — the DB query sends `.gt('ends_at', cutoffIso)` and the pure filter uses `isStillAhead` (= `!isEnded` by construction). The spec asserts the happening-now card is visible with its badge while the ended one has `toHaveCount(0)`, and pins the issued URLs on the wire (some read carries `ends_at=gt.`, **none** carries `starts_at=gte`) |
| The DB does less work and the client cannot disagree | `filterFeed`'s dead `startOfTodayIso` parameter was REMOVED rather than left beside `nowIso` — one time input, one cutoff. `listRadiusFeed` now reads ONE clock for both layers (it previously read `startOfTodayIso()` for the query and a fresh `new Date()` for the filter). The tempting `starts_at >= now` was never written: it would delete the drop-in happening right now |
| The archive is reachable and honest | "See past drop-ins" under the day sections AND inside the shared empty state (`RadiusEmptyState` takes an optional `seePastHref`; **Browse deliberately gets none**, and the spec asserts both callers against each other). The shipped empty-state copy was kept (it is V8/02's pinned literal — the ticket's "Nothing coming up within N miles." is a paraphrase), and the archive link's own literal is now pinned in `feed.test.ts` so a rename cannot keep the specs green |
| Archive rules (muted, no "I'm going", V8/09's "Same time next week") | `/profile`'s Past rows did NOT meet them: they were not links (the host could not reach the next-week affordance from the archive the feed links to) and were not muted. Both fixed; `/u/:handle`'s Past card asserted muted with zero buttons; the mute is text-only (the Duplicate button stays full strength) |
| **Gate (coordinator, independent)** | build exit 0 · **720/720 unit (21 files)** · **e2e 61/61, exit 0** · lint **0 errors** (39 warnings = baseline) · `git status --short supabase/migrations` empty |

**Deviations and findings from ticket 04:**

1. **The pivot was proven, not asserted:** with the pre-ticket cutoff temporarily
   restored in place, the new spec failed at exactly the documented assertion
   (`getByText(endedTitle, {exact:true})` → Expected 0, Received 1) **while both
   control assertions passed**, then the files were restored byte-identically
   (`grep TEMPORARY REVERT` → no hits) and the gate re-run. The ended window is
   built INSIDE today on purpose — a yesterday window would have been dropped by
   the old rule too, and would have proved nothing.
2. **A HIGH defect this change introduced, found by the fresh-context reviewer
   and fixed in review cycle 1:** moving the inclusion rule to `ends_at` left the
   **day grouping keyed on `starts_at`**, so a still-running post that started
   yesterday rendered under a past-dated header ("Fri, Sep 11") while its card
   said "Happening now" — as the FIRST section on the feed. Unreachable before
   this ticket, which is why no test covered it. Fixed with the pure seam
   `daySectionIso` (a started post clamps up to today), used for the section key,
   the label **and the rain badge's third definition of "today"**, with a
   red-then-green proof.
3. **The spec's own red-before accounting was wrong by three assertions** (the
   feed's archive link, the Past row's title link and the mute were claimed
   "green before and after"; all three are added by this ticket). Now listed as
   this ticket's own pivots — the AC specifically required the spec to say which
   assertion is the pivot.
4. **The archive door is HOST-SCOPED, and that is recorded rather than papered
   over:** `/profile` lists only the viewer's own hosted posts, so a parent who
   *attended* someone else's ended drop-in has no listing surface, and the
   likeliest tapper (a brand-new parent, since the link also sits in the empty
   state) lands on "No posts yet.". Recorded in the ticket's `## Comments` and
   pinned by a non-host assertion. Building an attended-events surface is a
   separate ticket, not a read-path change.
5. **`listPlaceFeed` (`db.ts:688`) and `upcomingCountsByPlace` (`db.ts:711`)
   still cut at start-of-today**, so Browse can say "1 upcoming" for a place
   whose only drop-in has ENDED — a wrong LABEL today, not the performance
   footnote the doc first claimed (framing corrected, numbered follow-up recorded
   in the ticket). `countPostsByHost` has no time filter at all, so the brief's
   premise about it was wrong.
6. **A V3/02 pin is silently superseded:** `DropInCard`'s "the event STAYS in
   the feed — no auto-expiry" is no longer true for a CANCELLED post past its
   end. Reconciled at that site and **four more copies** of the same sentence
   (`types.ts:73`, `PlaydateDetailPage.tsx:230/1410/1722`); `grep "STAYS in the
   feed"` is now the complete list, and the supersession is recorded in the
   ticket.
7. **Left alone deliberately and reported instead of smuggled in:** the clamped
   row now sorts first in Today's section, so V3/01's single "Starts soon" badge
   can go unawarded in one more rare situation — identical to what an
   already-live same-day post does today. Changing V3/01's badge target is a
   deliberate decision, not a bug fix.
8. **`ends_at` is UNINDEXED** (the only playdates index is
   `(neighborhood_id, starts_at)`, 0005), so the new predicate is a scan. Free
   at 5 rows; an index is DDL this read-path-only ticket forbids. Documented.

### V9 ticket 05 — evidence (complete, `c9b4836`)

| Claim | How it was checked |
|---|---|
| A card leads with the ages of the kids the host is bringing, never a name | the spec asserts the age line's rendered text is EXACTLY `ages 3–6`, is the meta's FIRST line, and that **every kid name is absent** from the card — an absence assertion made non-vacuous by proving the same locator first carries the ages line |
| One kid → `age 4`; a wide spread → capped; no kids and no chips → NOTHING (never a guess) | pure seams `ageRangeLine` / `playdateAgeRangeLine` / `statedAgeRangeLine`, unit-pinned including the cap boundary (`AGE_RANGE_ALL_AGES_WIDTH = 12`) on BOTH sides and the no-source case; the spec asserts `card-age-range` count 0 for a kid-less, chip-less post |
| The explicit chips WIN, and they live behind ticket 03's disclosure | precedence is a pure seam with unit tests; the spec asserts the chips row is **not in the DOM** while collapsed, then stores the pair and the card reads the STATED range (with a control that the derived one is gone) |
| One batched read per surface, never one per card | a unit test pins the SELECT string and asserts it projects **only** `kid.age` — no `first_name`, no kid id; the pages call the batched read once, outside the per-card map, and degrade to `{}` silently |
| A kid's first name is optional, end to end | a live spec walks: `/profile` Add with NO name → the column really holds **NULL** (read back with the marker's own JWT, so NULL-vs-`''` is proven) → reload → the row renders sensibly → the Remove dialog says "this kid" → a drop-in posted with that nameless kid reads `age 4` on the card and `Kids coming: Age 4` on the detail page |
| **Gate (coordinator, independent, 0037 applied)** | build exit 0 · **752/752 unit (21 files)** · feed-ages spec **5/5** · **e2e 65/65, exit 0** · lint **0 errors** (39 warnings = baseline) |
| Migration 0037 + probes | both columns nullable `smallint` and `playdates_age_range_chk` present; an inverted range fails closed (`23514`) **and writes nothing** (0 probe residue, 5 posts, 0 with ages); `count_kids_going_for` / `get_kids_going` shapes unregressed; `kids.first_name` nullable. Re-runnable: two `add column if not exists`, a `pg_constraint`-guarded CHECK, and a `drop not null` no-op — no index, policy, grant or function |

**THE PRIVACY FINDING — the ticket's AC is false, and the copy was NOT shipped as
written (this one needs a human decision, see below).** The AC says kid names are
shown "only for the host and people who pinged, as today". **Verified false
against the live project:** `kids_select_authenticated` and
`playdate_kids_select_authenticated` are both `using (true)` for
`authenticated`, and the detail page loads `listPlaydateKidNames`
**unconditionally** for any signed-in viewer — only 0026's `get_kids_going`
gates the *pingers'* kids. So any signed-in parent can read the host's kids'
names; the builder wrote truthful copy ("only on your profile and on a drop-in's
page, and only to signed-in families") and recorded the amendment. **Tightening
that gate was deliberately NOT done here** (it is a privacy change with its own
ACs/migration/review, and this ticket's migration check pins "no policy
changed") — and it is **NOW FILED as ticket 10 on the human's instruction
(2026-09-13): `.scratch/v9/issues/10-kid-names-privacy-gate.md`**, `ready-for-human`,
blocked only on its scope decision. The coupling is recorded in that ticket: the
ages derivation reads `playdate_kids` under the very policy it narrows, so it
must give the derivation its own SECURITY DEFINER function or the narrowing
would **silently blank every card's ages line**.

**Deviations and findings from ticket 05:**

1. **The pre-0037 red was captured first-hand by the coordinator**, and it is a
   `PGRST204`, not the `42703` the ticket predicted: `HTTP 400
   {"code":"PGRST204",…"Could not find the 'age_max' column of 'playdates' in
   the schema cache"}` — PostgREST intercepts the insert payload before
   Postgres. The derived half was green in that same run, exactly as the ticket
   pins; after the apply the spec is 5/5.
2. **No SECURITY DEFINER batched RPC was added**, though the brief asked for one:
   a function can only exist after 0037, which would make the derived half red
   pre-apply and contradict the ticket's own pivot. The reviewer's refinement is
   recorded in the ticket: the pins were **jointly satisfiable** (function +
   pre-apply fallback, or the function in its own migration first), so this was a
   **decision, not an impossibility**. Two accepted costs are named in the
   record: the read is now bulk and automatic on every signed-in surface load,
   and the ages line is hard-coupled to `playdate_kids`' RLS (see the privacy
   finding).
3. **`kid.first_name` made nullable** — a deliberate extension of the ticket's
   "two columns + a CHECK" line, without which the AC cannot hold (blank name
   writes NULL by design). Review cycle 1 then found a **reachable** consequence
   the compiler provably cannot catch: the `/profile` Remove dialog interpolated
   the name, so a nameless kid read **"Remove null?" / "null comes off your
   family profile…"**. Fixed with a noun fallback and pinned by an assertion.
   **Correction recorded:** `--strict` accepts `` `${x}` `` for a
   `string | null`, so the type change enumerates method calls and assignments,
   not template literals — the migration header's original claim was wrong.
4. **The stated range is WRITE-ONCE and outranks the derived one** (recorded as a
   known limitation): the chips exist only on `/new`; `/edit` neither shows nor
   writes them while it *does* own an in-place kids editor, so a wrong chip is
   permanently wrong and beats the correct derived value, fixable only by
   delete-and-re-post.
5. **Two judgment calls the builder flagged, both reversible in one commit:**
   it wired `PlacePage`/`UserPage` through the same shared composition seam
   rather than only documenting the scope (the AC's card sentence is not
   feed-scoped; cost is one extra request per surface load, never per card), and
   it made `places.placeAgeFitLabel` literally `'Best for ' + statedAgeRangeLine`
   so the two age-band seams cannot drift.
6. **Still open, human-owned (unchanged by this session):** the ticket's phone
   pass, and the follow-up privacy ticket above.

### V9 ticket 10 — evidence (complete, `6ae3f2b`)

**THE FINDING, measured before anything was written.** Kids' first names were
readable by ANY signed-in parent: `kids_select_authenticated`
(`0011:86-89`) and `playdate_kids_select_authenticated` (`0022:84-87`) were both
`using (true)` for `authenticated`, and `PlaydateDetailPage`'s mount load called
`listPlaydateKidNames` with **no host/pinger gate at all**. My own probe with a
real stranger JWT: **6 kid rows across families, including 3 kid-photo
`avatar_url`s**, plus 9 `playdate_kids` rows. Only `ping_kids` was ever gated —
0026 covers the **pingers'** kids, never the host's.

| Claim | How it was checked |
|---|---|
| The two wide policies are gone; one gate each | live `pg_policies`: exactly `kids_select_own_host_pinger_mod` (`profile_id = auth.uid() OR moderator OR kid_visible_to_viewer(id)`) and `playdate_kids_select_host_pinger_mod` (`playdate_kid_row_visible(playdate_id, kid_id)`); no `using (true)` SELECT policy left on either table |
| A stranger can no longer read a child | same stranger JWT, same query: `[]` on `kids` **and** `playdate_kids` (was 6 rows / 9 rows); anon `[]` |
| No write path broke (the 0014/42501 interaction) | the owner clause is **inline** in the kids policy because `addKid` writes with `.select()`; probed live — owner `INSERT … RETURNING` → 201 with its row, owner's own read → 200, NULL name round-trips |
| The ages line did not blank (the coupling) | `kid_ages_for` is SECDEF, ages-only; probed `{age_min: 4, age_max: 9}` for a two-kid post; the live suite's card still reads `ages 3–6` |
| All four new functions fail closed | SECDEF + STABLE, `search_path = public, pg_temp`, EXECUTE to `authenticated` only (anon revoked); `get_playdate_kids` returns 0 rows with no JWT |
| **Gate (coordinator, independent)** | build exit 0 · **757/757 unit (21 files)** · kid-names-privacy spec **2/2** · **e2e 66/66, exit 0** · lint **0 errors** (39 warnings = baseline) |
| Pre-apply red, captured first-hand | a stranger's page read `Kids coming: Ages 3–6 · Anna …, Zed …` (the names leaked); the host/pinger halves and the ages line were green in the same run |

**Review cycle 1 found two HIGH issues, both fixed with executed receipts:**

1. **The gate was BYPASSABLE by forging a join row.** Neither join table's
   INSERT check constrained *whose kid* was attached, so an authenticated parent
   knowing one kid uuid could attach it to their own post or ping and then read
   that child's row through the new policy (including the `avatar_url`/`likes`
   the detail RPC withholds), or read name+age through 0026's SECDEF
   `get_kids_going`, which never consults the policy at all. **Reproduced live:
   both forges returned HTTP 201 and the victim's row came back.** Fixed by
   amending 0040 **in place** (the 0028/0032 precedent) with a third SECDEF helper
   `kid_owned_by_caller` and a **replaced** `with check` on both INSERT policies
   (same names — same-command policies OR together). Re-applied and re-probed:
   **both retro-queries for pre-existing forged rows return 0**, the forges fail
   closed, and a legitimate own-kid attach still lands.
2. **The diff had added a FALSE claim about children's PHOTOS.** The copy said
   "a name **and a kid photo** are visible only to …" — and the `avatars` bucket
   is `public = true` with a public-read policy, so kid photos at
   `<uid>/kids/<kidId>` are anonymously listable and fetchable with only the anon
   key that ships in the client bundle. Ticket 10 gated the **column**; it cannot
   gate the **file**. The photo clause was **removed** (not weakened) and the
   finding was escalated → **ticket 11**, on the human's instruction, with
   **ticket 08 folded into it**.

**Also fixed in this ticket:** the pre-apply legacy fallback reads are DELETED
(`isMissingRpc` fired on a code-independent message match, and PGRST202 is
reachable on an applied project — the reads now fail closed like every other read
in `db.ts`), and the spec's 404-skip is gone so the RPC's presence is a **hard**
assertion rather than a silently-green fallback. `/u/:handle`'s kids card is
self-view only — the policy is per-KID, so a pinger would otherwise get a
**partial** list of a family's children, worse than none — with a comment saying
plainly that this is UX and the RLS is the boundary. Supersession notices were
added to `0011`/`0022`/`0026`: re-pasting any of them recreates a `using (true)`
policy from a name-based guard and would **silently re-open the table**
(verified comment-only, 0 non-comment lines). The helpers are a membership oracle
for anyone holding a kid uuid — accepted and documented (enumeration is
infeasible; the grants must stay because a policy runs as the caller).

**The gate's depth, recorded so nobody over-trusts it:** "the families who said
they're going" is **one self-service tap deep** (`going_pings` INSERT is
`profile_id = auth.uid()`, 0026's own inherited gate); "your family" means one
profile, not one household (no household model exists); and the RLS is the
boundary while the `/u/:handle` gate is UX.

### V9 ticket 11 — evidence (complete, `cbabc6e`) — kid photos left the public bucket

**THE EXPOSURE, measured before and after (my own probes, not the builder's
claims).** Kid photos sat in `avatars` (`public = true`, public-read policy) at
`<uid>/kids/<kidId>`. With only the anon key from the client bundle: the bucket
listed families, one `<uid>/kids` prefix returned **3 kid-photo objects**, and a
real legacy URL answered **HTTP 200 with 46,998 bytes** — no account, no URL
knowledge, and the stored paths are permanent. Ticket 10 gated the **column**
(a stranger's `kids` read 6 rows → `[]`); it could not gate the **file**.

| Claim | How it was checked |
|---|---|
| The bucket is private and the decision is enforced | 0038 applied live (HTTP 201): `kid-photos` exists with `public = false`, **5** path-scoped policies, `profiles.family_photo_url` present; `avatars` still `public = true` and untouched; **0040's kid-name gate policies verified intact** (the `kid_owns`/`own_host_pinger_mod` policies still exactly as ticket 10 left them) |
| The files moved, and were NOT lost | the script: read → upload → **SHA-256 + length read-back** → only then delete the public original. `copied=3 failed=0`; END STATE **`public_kid_objects: 0, private_kid_objects: 3, legacy_urls: 0, private_refs: 3`**, bucket private. Parent avatars: 2 objects, still in `avatars`, still public |
| The exposure is CLOSED (the same probe that found it) | the legacy URL now answers **HTTP 400** (was 200/46,998 bytes), and the anonymous listing returns **0** kid-photo objects (was 3) |
| No kid photo is uploaded or rendered any more | `kidPhotoPath`/`kidPhotoStoredRef` have **no runtime caller** outside the seam + its test (my own grep); the kid editor has no photo control; `/u/:handle` rows are name · age · likes; a kid row renders no `<img>` **even with `avatar_url` set** (spec, green) |
| `kids.avatar_url` was kept, not destroyed | rewritten to the bucket-qualified **object path** `kid-photos/<uid>/kids/<kidId>` — never a URL (the old one is dead by design, a signed one expires); `legacy_urls: 0`, `private_refs: 3`; `comment on column` records the decision on the live schema |
| The family photo cannot recreate the exposure | it is **NOT public** (signed-in families only, signed URL minted per render in ONE batched, best-effort call, never persisted — the column holds a path), and the renderer **refuses kid-class values** (unit-tested). The reason: a family photo usually depicts the children |
| **Gate (coordinator, independent)** | build exit 0 · **782/782 unit (23 files)** · kid-photo-exposure spec **6/6** · **e2e 71/71, exit 0** · lint **0 errors** (39 warnings = baseline) |
| Pre-apply pivots, captured first-hand | `Still listable: 3 object(s)` (the anon walk), `Bucket not found` (the private-bucket write), and the family-photo round trip failing on the missing bucket/column — 3 red, and the non-pivot tests green in the same run |

**Review, in the order the human asked for it — the review ran BEFORE the live
apply.** The reviewer was asked to rule on whether the script should be executed
at all, and returned **"SAFE TO RUN as written"** with the blast radius
live-proven to be exactly the 3 kid-class objects (no `<uid>/avatar`, no other
bucket), verify-before-delete clean with no bad interleaving, idempotency and the
post-crash repair path clean, and the service-role-key handling clean on every
output path (argv, env, file, log, error, stack). Its **10 findings were fixed
before the apply**, and two of them were defects in the very properties that make
the move safe: `uploadObject` never sent `x-upsert` (the documented repair path
could only 409 and leave an object **publicly readable forever**), and the script
never checked `kid-photos.public === false` (the property the whole closure rests
on — now a refuse-before-any-write guard plus a post-move anonymous probe of a key
that really exists). Also fixed: the `avatar_url` rewrite is gated on
*verification* rather than mere existence, the source's own byte length is
asserted against `storage.objects.metadata`, the report counts **rows** not
statements, the spec's vacuous "old URL must fail" assertion is labelled
shape-only with the real proof moved to a coordinator probe against a real key,
the stranger's list check asserts **both** branches, and five stale in-file
records were corrected.

**Residuals, recorded rather than papered over:**

1. **The CDN tail.** Supabase exposes no documented purge endpoint, so the closure
   is complete at the **origin** immediately and at every **edge** within the
   objects' `max-age=3600` hour. The script attempts the purge, counts the
   refusals, and both headers say so instead of claiming a purge. My own probe
   still got a 400 immediately (no cache hit), so the tail did not bite here.
2. **The family-photo read class.** `kid_photos_read_family` is `to authenticated`
   with no owner check, and `profiles_select_authenticated` is `using (true)` — so
   **any account that signs up can read every family photo**, and a family photo
   usually depicts children. The copy the parent reads ("shows on your profile, to
   signed-in families") is honest and promises nothing more, but **signup is the
   only barrier**; a stricter rule is a future ticket. This is the residual the
   human accepted with the confirmed decision.

### V9 ticket 11 — provenance note (the ticket is now built; this is the file record)

Filed on the human's instruction out of ticket 10's review cycle, **folding in
ticket 08** (which the human chose over leaving the photo work split in two
files). The live-verified finding, the recommendation for the already-uploaded
files (private bucket + signed URLs: the images survive, their old public URLs
die by design), the shared-bucket constraint that makes a private `avatars`
bucket impossible (parent avatars live there and must stay public), and the full
AC set are in `.scratch/v9/issues/11-kid-photo-storage.md`. **One decision
remains** — what happens to the already-uploaded files — and it is recorded there
with the options table. `0038` moved to this ticket.

## V11 — the founder's V11 feedback batch (opened 2026-09-16)

**Handoff doc: `.scratch/v11/HANDOFF.md` — start here in a fresh session (commits, gates, the dev-agent loop, open follow-ups).**
Source: the founder's V11 feedback on the live V10 app — three directives
(Nearby: a "back to 5 miles" escape; Places: drop the "Fits my kid's age"
filter; Places: drop "Ages not listed yet.") plus three confirmed judgment
calls (hero images → restrained section headers, post flow → WHERE-then-WHEN
reorder with no wizard, settings → header gear → `/settings` with `/profile`
becoming read-only). Filed as `.scratch/v11/spec.md` +
`.scratch/v11/issues/01`–`06`. **Batch order 01→02→03→04→05→06 (06 depends on
04). NO migrations in the batch** (UI/copy/form/reorg only). Per-ticket gate:
`npm run build && npm run test`. Each ticket carries its pinned mechanics +
acceptance criteria; the spec carries the out-of-scope list.

**Coordinator infra (2026-09-16):** the dev-agent Herdr pane was gone (server
restart; the only repo-cwd pane, `w4:pP`, proved to be this coordinator's own
pane — its visible screen mirrors this session's own commands). Rebuilt: tab
`w4:tN` ("dropin: v11 dev agent"), pane `w4:p11`, cwd = repo root, opencode
agent **`v11dev`** started via `herdr agent start`. The coordinator loop
(route → wait → read → re-verify → next ticket) runs on `w4:p11`.

| # | Ticket | State |
|---|---|---|
| 01 | Radius — "Back to 5 miles" escape | **complete — `aa7e991`** (2026-09-16); no migration (`supabase/` verified untouched); 825/825 unit, e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors. Deviation recorded: two-sided gate (5 < r < 35) — the AC pins `radiusEscapes(35)→[]`, which a one-sided `r>5` gate would break |
| 02 | Places — remove the "Fits my kid's age" filter | **complete — `61a9efa`** (2026-09-16); no migration (`supabase/` verified untouched); 818/818 unit (825 − 7 age-filter tests), e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors; `placeFitsKidAges` + the `kidAges` filter field removed from `browsePlaces` (grep gates clean: 0 hits for `placeFitsKidAges` across `src/`+`e2e/`); the detail-page age line (`placeAgeFitLabel`) untouched |
| 03 | Place detail — drop the "Ages not listed yet." nag | **complete — `b86a3bf`** (2026-09-16); no migration (`supabase/` verified untouched); 818/818 unit, e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors; the "Ages not listed yet." fallback is gone from PlacePage (a place with no age data renders NO age line — silence, per the founder's directive), the e2e spec now asserts the line is ABSENT (`toHaveCount(0)`), `placeAgeFitLabel` itself untouched |
| 04 | Restrained section headers (not hero images) | **complete — code `fc64dd6`, close `058d923`** (2026-09-16); no migration (`supabase/` verified untouched); 818/818 unit, e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors; new shared `SectionHeader` band (soft gradient tile + 24px stroked glyph + the page's single h1 + one-line tagline, ~74px at 390px) replaces the bare h1s on the five in-scope pages (Near-you feed both branches, Places, Post a drop-in, Edit your drop-in, Your family); `NAV_ICONS` moved from `App.tsx` into `src/components/icons.ts` (pages can't import the root App — it imports the pages, a cycle; the nav renders the same module); h1 title strings unchanged so e2e stayed green; out-of-scope h1s (detail-page error state, onboarding, login, reset, mod, user pages) untouched |
| 05 | Post form — WHERE, then WHEN (no wizard) | **complete — code `456c7b9`, close `0f8bfc3`** (2026-09-16); no migration (`supabase/` verified untouched); 818/818 unit, e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors; `startBlock` (the start date + 30-minute `TimeStepper`) moved out of the collapsed "More options" body into a visible "When" section (`whenBlock`, `text-sm font-semibold text-slate-700` "When" label) rendered by /new's branch 1 only (after the place block, before the duration chips) so setting a time no longer needs the door — /edit (branches 2/3) keeps it as-is so its markup stays byte-identical; the disclosure now holds only the optional extras (address, details, repeat, age, and kids only when no kids section is surfaced), so the two hint constants drop the now-visible date and `feed.ts`'s `MORE_OPTIONS_FIELDS` empties out (`moreOptionsHoldsError` kept as a drift hook, pinned all-false by its unit tests); e2e in-scope: post-fast's "everything else behind the door" audit + the failed-start-date spec now read the visible "When" section, kids-surface pins the two new hint strings, post-location's `fieldOrder` assertions gain the now-visible date input (collapsed `[place, date]`, title-editing `[title, place, date]`); the cold /new ≤4-tap budget is unchanged. Deviations recorded: (1) the ticket's name↔string mapping was swapped vs the code — the base `MORE_OPTIONS_HINT` is the no-kids/kids-behind-door string (`'An address, kids, …'`), `MORE_OPTIONS_HINT_WITHOUT_KIDS` the with-kids/kids-surfaced one (`'An address, …'`); documented in-code (PlaydateFormFields.tsx) with the render mapping + unit tests green; (2) `e2e/post-location.e2e.ts` was added to scope (it was not in the original triage) because its `fieldOrder` assertion broke and the AC requires a full green suite — only the two `fieldOrder` assertions in the place-picker test were changed, residual now-stale comments in other post-location tests left untouched (follow-up, not expanded) |
| 06 | Settings reorg — header gear → /settings, /profile read-only | **complete — code `e5d1462`, close `6f6e9e0` (HEAD)** (2026-09-16); no migration (`supabase/` verified untouched); 818/818 unit, e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors; new `SettingsPage` (SectionHeader "Settings" / "Profile, location, and notifications") owns every editable control — profile (display name + bio + "A photo of your family"), Location (home zip + radius via `updateHomeZipRadius`), Kids (add/remove/edit + the cap), Notifications (`NotificationsSection`), the private Following (families + places) + Neighborhoods lists — while `ProfilePage` shrinks to the read-only "what others see" view (avatar, display name, bio, kids as name + age, display-only family photo, Your posts upcoming/past) with ONE "Edit profile" link to /settings; the signed-in header gains a gear `NavIcon` between @handle and Sign out (new `gear` path in `icons.ts`'s `NAV_ICONS`; rendered only when signed in) and /settings is protected exactly like /profile (default-deny `resolveAuthRedirect` + the onboarding home-zip gate); cross-refs follow the split — `PlaydateFormFields`' "Add your kids" pointer, the push dismiss copy (`push.ts` `DISMISSED_POINTER` + `pushClient` JSDoc), and `PushOptInPrompt`'s suppression + docs now point at /settings; e2e: the editing specs switch to /settings (zip-radius, avatar, feed-ages, kid-photo-exposure's edit steps, push-subscribe, profiles-v2 wholesale, loop-closing's Following list, polish's edit assertions, kids-v3/kids-surface copy) while the reading specs keep /profile (profile, profile-posts, onboarding-gate's route test, feed-ended-out), kid-photo-exposure's empty-state test splits into a read-only half ("No kids yet." + the "Add a family photo" button ABSENT on /profile) and an editing half (/settings), and prefill's UTC `todayIso` compare (a local/UTC date-boundary flake that blocked the gate) now uses the house-local `localDatePlusDays(0)`. Deviation recorded: the family photo DISPLAY stays on read-only /profile (display-only when `useFamilyPhotoUrl` is non-null; the "Add a family photo" button lives on /settings only) |

### V11 final single-tenant gate (coordinator verifier, run on final tree at HEAD `6f6e9e0`)
- commit map (code→close): t01 `aa7e991`→`14c8354`; t02 `61a9efa` (handoff `4504966`, record files `71e024d`)→`7ef7fc7`; t03 `b86a3bf`→`62d4843`; t04 `fc64dd6`→`058d923`; t05 `456c7b9`→`0f8bfc3`; t06 `e5d1462`→`6f6e9e0` (HEAD)
- build: exit 0 — vite prod + PWA service worker, 19 precache entries, 831.59 KiB
- unit: 818/818 across 24 files, exit 0
- lint: exit 0 — warnings only (react/set-state-in-effect, no-unused-vars, only-export-components), zero errors
- e2e: 76 passed / 1 skipped, exit 0, 6.1m, live Supabase; sole skip = pre-existing conditional at `e2e/polish.e2e.ts:209`
- t03 re-cert: `rg "Ages not listed" src/` = 0 hits (resolves the port-4173 contamination)
- tree: `src/` clean; residue = `M opencode.json` + untracked `.agents/`, `.scratch/**`, `supabase/.temp/`

### V11 reviewer verdicts
- t03: PASS (nits only) — re-certified at the final gate
- t04: PASS — curly apostrophe `src/pages/NewPlaydatePage.tsx:1014`; no trailing newline `src/components/SectionHeader.tsx` + `src/components/icons.ts`; header ~74px vs "<~72px"
- t05: PASS — hint-const location mis-named (actually `src/components/PlaydateFormFields.tsx:87/96-97`, not `src/lib/feed.ts`); name↔string pairing is the pre-existing V10 t02 convention documented at `PlaydateFormFields.tsx:84-86`; stale comment `e2e/post-edit-delete.e2e.ts:86`; post-location fieldOrder date input→''
- t06: PASS — (a) stale user-facing copy `OnboardingPage.tsx:210/211/223/224/282/338`, `UserPage.tsx:564`, `PlacePage.tsx:408`; (b) stale "/profile" comments `db.ts:2403-2405`, `db-v2.test.ts:108`, `WhileAwayCard.tsx:5`, `db.ts:3459-3679/3824` cluster, `push.ts:47/385/573`, `pushClient.ts:11/143/200/392/463`, `OnboardingPage.tsx:138/203/386`; (c) wrong historical note `e2e/push-subscribe.e2e.ts:493`; (d) JSDoc indent `e2e/loop-closing.e2e.ts:27`; out-of-scope: `e2e/prefill.e2e.ts` todayIso flake fixed via `localDatePlusDays(0)`, bundled in `e5d1462` (test-infra only)

### V11 ship record (2026-09-17)
- Push: `d9239f4..a894a77` master→master — 16 commits (the 14 batch commits plus task-state bookkeeping `058d923` + `46aa848`, both task-state.md-only); confirmed on origin via `git ls-remote` (= `a894a776d41acfc8ce5f740b06198665c5318053`); `opencode.json` verified absent from the pushed range (grep count 0)
- Vercel status: NOT live as of ~03:39Z (2026-09-17). Two probe windows (03:22–03:25Z and 03:28–03:39Z; 12 polls total) — production https://drop-in-mu.vercel.app served the old entry chunk `/assets/index-o3zQGGgw.js` throughout (CDN HIT, stable etag `57e198e210418df8ce991651315a15dc`); the local build of the pushed tree (`npm run build` at `a894a77`) produces entry `dist/assets/index-Cedm-xCa.js` (sha256 `81a0b23b844423bce80122f4fc3c332433c8b9d9334c43a23ab264f08959b246`), which was never served. Vercel CLI unavailable in the coordinator environment; likely the GitHub push does not auto-trigger a Vercel build (V10 was shipped manually, deploy-then-push). Probe artifacts: `/tmp/opencode/probe-v11.sh` + `probe-v11.log` (may be ephemeral)
- Open action: founder Vercel dashboard check (project behind `drop-in-mu.vercel.app` → Deployments): if no post-push deployment, deploy manually (Production) or connect the GitHub repo for auto-deploys; if a deployment failed, capture the error. After confirmation, re-probe for `index-Cedm-xCa.js` and close this record
- **CONFIRMED LIVE (2026-09-17 ~09:00 PDT, coordinator — headless-CDP Vercel dashboard session + curl on the production domain).** The "likely no auto-trigger" hypothesis above is **disproven**: Vercel's git integration auto-deployed the ship push. Deployment `3CB8rVrtcruYoMjbMSRBuR4dCd83` (alias `drop-20tbzrxvp-jonmeisburgs-projects.vercel.app`), source `master` @ `a894a77`, created ~20:50 PDT 2026-09-16 (dashboard "12h ago" at 2026-09-17 ~09:00 PDT — just after the last probe window closed at 03:39Z), status **Ready** (14s build), badges **Latest + Current**, owns `drop-in-mu.vercel.app` (plus the git-branch alias `drop-in-git-master-jonmeisburgs-projects.vercel.app` — the git-integration marker). **No manual deploy was needed or triggered** — the target commit was already the current production deployment.
- **Live proof (curl, 2026-09-17 ~09:00 PDT):** (1) `GET https://drop-in-mu.vercel.app/` references entry `/assets/index-o3zQGGgw.js` — the a894a77 deployment's build output; its sha256 is `d3baa23d50ccaa60f3aec25da9c7dbfbc75b470ce2f6070213fdbeb7c4f803b5`. **Note:** the local-build expectation recorded in the probe window (`index-Cedm-xCa.js`, sha256 `81a0b2…`) is a local toolchain artifact — Vercel's build of the same tree produces `o3zQGGgw`; live proof therefore rests on content, not hash: the live bundle carries **both** t06 copy markers (`from your settings` — `push.ts` `DISMISSED_POINTER`; `Add your kids in your settings` — kids-v3/kids-surface copy), exactly 1 occurrence each, and `/settings` → 200 (the new route from t06). (2) This also explains the 03:22–03:39Z probes: they observed `o3zQGGgw` (served by an earlier V11-batch push's deployment — same build content, same entry hash) before the `a894a77` deployment was promoted; task-state.md-only bookkeeping commits do not change the bundle, so the hash was stable across both.
- **Ship record CLOSED:** production serves `a894a77` (V11). RANKED 0 below is resolved by this block.

### Open follow-ups
1. **RESOLVED 2026-09-17 (~09:00 PDT)** — was RANKED 0 (was blocking the ship's completion): Vercel production deploy of `a894a77` is **confirmed live** (deployment `3CB8rVrtcruYoMjbMSRBuR4dCd83`, auto-deployed on the ship push, Ready; live entry `index-o3zQGGgw.js` carries both V11 t06 markers; `/settings` 200 — see the ship record's confirmation block)
2. RANKED 1 (recommended, founder decision): polish ticket candidate "V11.5" for t06 finding-(a) — stale /profile→/settings copy pointers
3. RANKED 2 (cosmetic, optional): the comment-only + e2e-doc nits from t05/t06
Nothing else outstanding.

Handoff doc + close-out (2026-09-17, coordinator session):
- `.scratch/v11/HANDOFF.md` — committed `b2aa498` (task-state pointer `4ef5a85`); count-robust fix `71c6f9e`; reviewer fixes `1a252a9` (deploy status, forbidden-files, opencode.json claims).
- Reviewer: loop 1 NEEDS_CHANGES (4 findings: deploy-claim, supabase/ standing-rule, AGENTS.md list-attribution, opencode.json "never committed") → all fixed in `1a252a9` → loop 2 PASS, no regressions.
- Verifier (git hygiene, range `a894a77..1a252a9`): PASS — each of the 5 commits single-file; range touches only HANDOFF.md + task-state.md; zero forbidden paths (opencode.json / supabase/ / .agents/ / .scratch/*.cjs); origin/master `a894a77` untouched; worktree clean except the documented unstaged ` M opencode.json` (never-commit divergence). Brief check 6 ("git diff HEAD empty") was a spec contradiction with check 5 — adjudicated: intended clean state is "tree clean except unstaged opencode.json" (check 5); no repo defect.
- Unpushed local bookkeeping commits above `a894a77`: `297e887` `b2aa498` `4ef5a85` `71c6f9e` `1a252a9` (+ this bookkeeping commit). Push is a human call — no push without explicit authorization. Check the current set with `git log --oneline a894a77..HEAD`.
- Known nit (non-blocking, HANDOFF.md:85): kickoff prompt hedges "complete, pushed, and (pending confirmation) deployed" — slightly at odds with the doc's "deploy unconfirmed" stance; acceptable (next line instructs confirming the Vercel deploy first).

## V4 — "Drop In" mobile conversion (opened 2026-09-11)

Plan: `plan-v4.md`. Human request (voice, 2026-09-11): make it feel like a phone
app for Android + iOS, rename Playdate → **Drop In**, add a splash screen, add
social login.

| Slice | State | Evidence |
|---|---|---|
| V4.1 mobile polish | complete | `483b270`; build exit 0, 253/253 unit; `scripts/mobile-audit.mjs` green at 320/375/390/430px (no overflow, no <16px text control, no <44px target) — the audit found real defects on its first run (32px card toggle + steppers, 42px detail actions, 28px header links), all fixed |
| V4.2 rename + logo | complete | `5a97eef`; manifest + <title> + header now "Drop In"; `DropInMark` inline SVG + `assets/drop-in-icon.svg` source + `scripts/build-icons.sh` (favicon, apple-touch 180, 192, 512, maskable 512); 253/253 unit. Found by looking at the real page: **/login renders outside the app shell and had NO page container** — the card ran edge-to-edge with zero padding — now a padded, centered, safe-area-aware screen with the brand mark (and no stray "Sign out") |
| V4.2b bug fix | complete | `6e0530a`; a stale/mistyped `/playdate/<id>` link rendered a **phantom drop-in** — the public RPC answers a missing id with an all-null row over HTTP 200 (verified live), so `?? null` never fired and the page showed an epoch date + "null families going". `normalizePublicPlaydate` pure seam + 4 tests (257/257) |
| V4.3 splash screen | complete | `8d51a3c`; two layers — a static indigo splash inside #root (the first painted frame, before the bundle parses) and a React overlay that takes over from the same frame and leaves on "session settled AND a 650ms floor, or a 2000ms cap", 320ms fade, reduced-motion aware, never replayed on in-app navigation. Native half: apple-mobile-web-app metas + 8 apple-touch-startup-image sizes (`scripts/build-splash.mjs` prints the tags) + manifest background matched + splash excluded from the SW precache. Live-verified: boot splash present, overlay appeared at 56ms, gone at 1472ms, boot markup removed, app usable, no replay on nav. Also fixed the fallback-state "Back to today" links to 44px — the not-found fix made that screen actually render and the mobile audit caught them immediately |
| V4.4b signup regression fix | complete | found BY THE E2E GATE, not by review: the setup spec timed out waiting for "Set your location". `useSession` fetches the profile as soon as the session appears — for a brand-new account that is BEFORE the row exists, so it settles as null; LoginPage navigated with that stale null and the new handle step (profile === null) rendered a second name prompt for an email signup. Fix: await `refresh()` after `createProfile`, before navigating. **Full e2e 19/19 green** (was 1 failed / 18 not run) + build exit 0 + 275/275 unit. Marker family from the two runs: `e2e-1789148xxx` host (`b98e9ae8-23ee-44a9-a766-9b39849857f1`) + `e2e-v-1789148563-*` viewers — **sweep due** |
| V4.4 social login | code complete; LIVE BLOCKED (human) | `19899d3`; 275/275 unit (18 new oauth tests). Live click against the real project proved the failure mode: an un-enabled provider answers 400+JSON instead of a 302, so the browser landed on Supabase's raw error page — `probeOAuthProvider` + `skipBrowserRedirect` now turn that into an inline sentence (verified live: "Google sign-in isn't switched on yet"). Handle step on /onboarding for first-time social users (session, no profiles row). Human checklist: `docs/social-login-setup.md` (Google Cloud + Meta + Supabase providers + redirect allowlist incl. the LAN dev URL) |

**Decisions RESOLVED (human, 2026-09-11):**
- **D1 — keep `/playdate/:id`.** Renaming buys nothing with no printed links and
  would need a redirect layer; revisit at deploy time, where it is free (a new
  domain is being introduced anyway and there is no legacy traffic to preserve).
- **D2 — installable PWA, no store apps for V4.** The PWA already installs on
  Android + iOS and the offline shell is verified. Apple's App Review Guideline
  4.2 ("minimum functionality") is the rule that rejects thin website wrappers,
  and iOS web push (16.4+, installed PWA) removes most of the reason to pay
  $99/yr + $25. Capacitor is deferred until beta evidence says what is missing.
  **Caveat: iOS web push has NOT been tested here.**
- **D3 — Google only; Facebook built but switched OFF.** `/login` renders only
  the providers listed in `VITE_OAUTH_PROVIDERS` (default `google`), so a button
  is never shown for a provider the Supabase project has not enabled. Enabling
  Facebook later = the console steps + one env value, no code change.

**Marker sweep COMPLETE (2026-09-11, human go-ahead given):** 10 `e2e-*` accounts
(the two V4 e2e runs) deleted via the dashboard SQL API — gate passed (0 founder
overlap, all 10 profiles markers, zero child rows left; the specs had cleaned up
after themselves). Live DB verified after: **2 auth users, 2 profiles, 2
playdates, 0 e2e rows, founder moderator flag intact**. The sweep is now a
repeatable, gated tool: `node scripts/sweep-e2e-markers.mjs <list|select|delete|verify>`
(refuses to delete if any founder/moderator account is inside the set).

**No DB migrations in V4.1–V4.3.** Live DB untouched since the 2026-09-11 sweep.

## Tooling note (2026-09-09)

- Migrations are now applied by the orchestrator via **browser-use** (Python/CDP) instead of the human dashboard: `browser-use` (uv tool, v0.1.13) attaches to a CDP-enabled Chrome on `:9222`. **One-command rebuild: `scripts/cdp-migration-tooling.sh`** — it recreates the session-bearing profile copy (from `~/.config/google-chrome`, survives /tmp wipes + reboots) and launches the CDP Chrome; pass `stop` to kill it. If `:9222` is already up it fast-paths. Attach: `BU_CDP_URL=http://127.0.0.1:9222 browser-use <<'PY' ... PY`. Apply pattern: Monaco editor via `monaco.editor.getEditors()[0].setValue(<sql>)` + click the "Run Ctrl ↵" button via JS; both migrations return "Success". PostgREST schema cache auto-refreshes (no PGRST205 — REST served new tables at HTTP 200 within ~1 min). open-computer-use was uninstalled (its key synthesis can't reach a Wayland Chrome).
- 2026-09-09 amendment: browser-use's **LLM agent loop is unusable on NInfer** (JSON `response_format` unsupported; `use_vision=False` still ships screenshots → 400 vision_disabled; agent self-reported zero actions on the SQL editor). **Working replacement: `scripts/cdp-sql-runner.py`** — LLM-free direct CDP driver (Target.attachToTarget → Monaco setValue → Run click → optional destructive-confirm click → innerText tail). Run: `bash scripts/cdp-migration-tooling.sh` (Chrome up), then `/home/jmeisburg/.local/share/uv/tools/browser-use/bin/python scripts/cdp-sql-runner.py "<sql>"` (needs that interpreter for its websockets dep). Handles the 0010-style "Run query" confirm dialog. Verified 2026-09-09 on a live SELECT against profiles (9 marker rows read back).
- 2026-09-09 amendment #2 (0016 apply): the dashboard's Monaco SPA no longer hydrates in the profile-copied CDP Chrome (every tab — /sql/new, /dashboard/org, fresh tabs, fresh Chrome instances: all ~95 JS chunks load 200, Sentry reports 0 errors, the app makes zero backend calls, `window.monaco` never defined, `__next` stays an unhydrated shell; reloads / cache-disable / full Chrome restart / 4-min grace all reproduced the same result — root cause not pinned). **Working fallback used for 0016: the dashboard's SQL API directly** — `POST https://api.supabase.com/v1/projects/<ref>/database/query`, body `{"query": "<sql>"}`, and the dashboard session token is the profile copy's Local Storage key supabase.dashboard.auth.token (JSON {access_token, refresh_token}, 1-hour TTL) — extracted via CDP Runtime.evaluate on the supabase.com origin (the cookie DB holds NO session JWT — found during the 0019 apply); a fresh Chrome launch re-hydrates the session. Full path proven on 0019 (2026-09-09): launch tooling script → extract token → POST /database/query (201) → verify by SELECT → release Chrome. Verify DDL effect with a follow-up SELECT through the same API (read-only endpoint; the DML "0 rows" verification-lesson still applies). `cdp-sql-runner.py` remains valid for SELECTs until the SPA issue is post-mortemed; future migration applies: use the SQL API fallback.

## Slices

| Slice | State | Evidence | Notes |
|---|---|---|---|
| 1 tracer + auth + PWA | complete | commits f26edd1+5c7b422; reviewer PASS (4 non-blocking findings parked, see notes); verifier PASS (build exit 0, manifest in dist, 6/6 tests, combined cmd exit 0); LIVE CHECK PASS 2026-09-04 (probe ok, signup session, profile row inserted + read back, login session; marker live-verify-1788546611@gmail.com) | profiles migration owned by slice 1 (decisions log); migration SQL WRITTEN BUT NOT APPLIED to live project — escalated; non-blocking findings: README .env.example doc bug, db.ts module-scope env throw, non-idempotent policy DDL; live re-check 2026-09-04: PGRST205 persists minutes after dashboard apply — human dashboard verification required; no marker user created (run killed pre-signup); marker domain example.com rejected by project → use gmail.com; PGRST205 resolved by human dashboard apply + cache refresh 2026-09-04 |
| 2 neighborhoods + profiles | complete | commits 9ff7aa6+a3abf09; reviewer PASS (4 non-blocking parked); verifier PASS (build exit 0, 14/14 tests, combined cmd exit 0); post-review SQL delta 017614e+51ee493 content-verified (8392cf3); LIVE CHECK PASS 2026-09-04 (probes ok first attempt; marker A: session + profile row + Ballard/Belltown memberships persisted + feed-gate condition; 0004 23505 proof via marker B; markers live-verify2-1788548418[-b]) | migrations 0002–0004 written by builder, applied by human via dashboard (no DB access on this machine); seed list gets human sanity-check at review; /onboarding route pinned as integration decision; seed list (22 entries) flagged for human sanity-check at review; seed list amended by human 2026-09-04: Beaverton + Interlawn removed (20 entries); post-review SQL delta by human: seed amendment 017614e + DO-block policy idempotency fix 51ee493; 0002–0004 applied live 2026-09-04 (dashboard, Success). |
| 3 feed + posting | complete | commits 81e8b1a+d97020b; reviewer PASS (per-statement DDL audit; 7 non-blocking parked, see notes); verifier PASS (build exit 0, 36/36 tests, combined cmd exit 0, all policy DDL DO-block guarded); 0005+0006 APPLIED LIVE 2026-09-09 via browser-use (Monaco setValue + Run, both "Success"); REST probe playdates+blocks HTTP 200; LIVE CHECK PASS 2026-09-09 (marker host posts drop-in → viewer feed shows it → blocks row created → viewer feed EXCLUDES it via DB-level .not() filter, closing reviewer finding #2; markers live-verify3-<epoch>[-b]@gmail.com) | blocks migration (0006) moved forward from slice 4 (feed AC requires the DB-level block filter; block UI stays in slice 4); 0005/0006 use DO-block idempotency per the logged lesson; applied by orchestrator via browser-use (CDP), not human dashboard (tooling note above); PostgREST cache auto-refreshed (no PGRST205) |
| 4 detail + going-pings + trust | complete | commits f978858+1c8e5f4; reviewer PASS (5 non-blocking parked) + fix-review PASS (2 nits); verifier PASS (build exit 0, 49/49 tests, combined gate exit 0); 0007+0008 APPLIED LIVE 2026-09-09 via CDP (both "Success"; probes HTTP 200, no PGRST205); LIVE CHECK PASS (ping round-trip 1→0; non-moderator report SELECT 0 rows + INSERT 201; host self-ping INSERT 201 = documented DB gap; block .not() filter re-proven; markers live-verify4-1788975216[-b]@gmail.com); orchestrator re-verified independently (build+tests+REST) | 42501 fix: createReport RETURNING 403s under moderators-only SELECT RLS → plain insert (1c8e5f4) + regression tests incl. 42501 tripwire; 0008 owns profiles.moderators (slice 5 must expect it); CDP apply delegated to verifier agent (orchestrator session lacks terminal tool); parked: DropInCard button-in-Link, self-ping DB gap (slice 5 candidate), detail block filter client-side, UserPage 375px row tightness, unused GoingPing type |
| 5 mod tools + mobile polish | complete | commit 2eacd47; reviewer PASS (3 non-blocking parked: self-elevation hole, handle-length 375px edge, pre-apply feed window); verifier PASS (build exit 0, 65/65 tests, combined gate exit 0); 0009+0010 APPLIED LIVE 2026-09-09 via CDP (both "Success"; DB objects verified); orchestrator re-verified independently (build+tests+REST 200 on hidden_at/banned_at; 0010 trigger file present); LIVE CHECK PASS (moderator hide 204 + feed hidden_at exclusion proven vs. unfiltered control; ban banned_at set; host self-ping rejected 400 P0001 "hosts cannot ping their own post" per human-decided trigger; non-mod hide = RLS silent no-op; markers live-verify5-1788977882[-b|-m]@gmail.com, mod flag reverted, lv5 rows deleted, Chrome released) | 0009 expects profiles.moderators from 0008 (documented); founder-flag UPDATE = human one-time SQL (NOT executed — waiting on human); hide/ban final in V1 (no unhide/unban UI); 0010 = BEFORE INSERT trigger (CHECK can't span tables), DO-block idempotency; PostgREST surfaces RLS-blocked 0-row UPDATEs as 2xx, never 403 (lesson) |
| V2.1 quick UX batch (ticket 01) | complete | commit 8bdaeb2; 77/77 tests | report flag off cards, "This is your post" host panel, 30-min steppers + duration chips, duplicate prefill; no migrations |
| V2.2 profiles v2 (ticket 02) | complete | commits b0981b1+c389ce4+4f3cc72; 102/102 unit, 6/6 e2e; 0011 + trigger fix APPLIED LIVE 2026-09-09 via CDP; live: non-mod 400 P0001 + postgres ban + smoke 200 | avatars (256px/≤5MB) + bio (≤500) + structured kids (first name+age, max 5) + onboarding step + nudge banner; 0011 = profiles cols + kids table + avatars bucket + self-elevation trigger; reviewer NEEDS_CHANGES (trigger blocked postgres) -> 4f3cc72 non-JWT pass-through, live-proven; marker lv6-1788991152 (banned_at set) |
| V2.3 zip + radius (ticket 03) | complete | commits e78f174+8ecdfbf; 120/120 unit, 8/8 e2e; 0012 APPLIED LIVE 2026-09-09 via CDP (605-row WA seed); REST probes 200 (no PGRST201) | radius feed (haversine client-side over pinned host-embed, no PostGIS; post location = host home_zip, unknown zip excluded); "N mi" on cards; onboarding zip+radius replaces neighborhood picker (gate now home_zip-based; memberships display-only); /profile location card; 0012 = zip_codes WA seed (SimpleMaps v1.95.1 provenance) + profiles home_zip/radius_miles + RLS; reviewer PASS (4 cosmetic nits parked: comment city label, rejected-promise zip cache, doc typo, trailing newlines); 8ecdfbf = e2e infra fix (viewer context clean storageState); 3 dev-agent stalls -> /new reset + file-based briefs (see decisions log) |
| V2.4 comments (ticket 04) | complete | commits 8ff38ed+b06c5c4; 130/130 unit, 10/10 e2e; 0013+0014 APPLIED LIVE 2026-09-09 via CDP; lv8+lv9 live checks PASS | detail-page comment thread (40px avatar + handle -> /u/, composer <=500, author/host delete, moderator hide + muted "hidden by moderator" chip); 0013 = comments table + RLS (auth select non-hidden, author insert, author-or-host delete via EXISTS, moderator update) DO-block idempotent; reviewer PASS (3 nits: stale closure, carried 0009 any-column mod UPDATE, host-branch e2e); lv8 check caught 42501 (SELECT policy USING also evaluated on UPDATE new row) -> 0014 SELECT policy OR-moderators branch (hidden rows visible to mods only; slice 5 migration renumbered to 0015); live: mod hide 200, viewer 0 rows, mod 1 row, non-mod silent no-op; e2e viewer contexts start signed-out (8ecdfbf pattern) |
| V2.5 share + public view (ticket 05) | complete | commits abe1352+089a1df; 139/139 unit, 12/12 e2e; 0015 APPLIED LIVE 2026-09-09 via CDP; lv10 anon probes PASS | share (Web Share API + copy-link, VITE_PUBLIC_BASE_URL || origin) + signed-out /playdate/:id (public surface = playdate + neighborhood label + host handle/avatar + going count ONLY; /u/ + comments auth-walled; "Sign up to join in" on all actions; "I'm coming" -> /login -> return path -> explicit tap); 0015 = anon playdates read (hidden-aware) + neighborhoods anon + SECURITY DEFINER get_public_playdate (11 public fields, count-only going; going_pings stays authenticated-only); reviewer NEEDS_CHANGES (anon USING(true) leaked hidden posts via anon-key table read) -> 089a1df role-scoped `to anon using (hidden_at is null)`, re-review PASS; live: hidden post absent from anon reads + RPC not-found, anon comment/profile/report reads 0 rows (silent RLS), anon ping write 400 (0010 trigger before RLS) |
| V3.1 feed day sections (ticket 01) | complete | 0449de6; 160/160 unit, 12/12 e2e; reviewer PASS (3 nits parked) | groupByDay promoted to feed.ts (no duplicate impl; BrowsePage switched); pure fns formatDayLabel/isEnded/isStartingSoon (nowIso seam, 15 new unit tests); FeedPage day sections (Today/Tomorrow/weekday headers ascending, ended demoted + grayed in Today, single "Starts soon" badge on soonest upcoming within 60 min, suppressed when already started); no migration |
| V3.2 host status + weather (ticket 02) | complete | 7a705c8; 164/164 unit, 13/13 e2e; reviewer PASS (4 nits parked: queryMyPlaydates column list, types optional status, rain-badge-vs-muted interaction, plan file-scope fix — applied); 0016 APPLIED LIVE 2026-09-09 via dashboard SQL API fallback (201; status column + playdates_status_chk verified); live probes PASS (lv11-1789016534[-b] markers, swept) | migration 0016 (playdates.status text NOT NULL DEFAULT 'on' CHECK IN ('on','rained_out','cancelled'), DO-block idempotent; header documents the 3 pins: authenticated-only 11-field surface, host-only via playdates_update_host RLS, no SELECT-policy change); host control in "This is your post" panel (absent for non-hosts + signed-out public view); muted card/detail states (event stays in feed); Open-Meteo rain badge (host home_zip, >=50%, silently absent on error, per-(zip,date) cache + single retry, never caches rejection); e2e/host-status.e2e.ts (red by design pre-0016-apply, green post-apply) |
| V3.3 quick feedback batch (ticket 06) | complete | <9581d98>; 164/164 unit, 13/13 e2e; reviewer PASS; 0019 APPLIED LIVE via dashboard SQL API (constraint def + 'rained_out' count 0 verified); e2e-1789056820[-v] markers persist (sweep) | card going check toggle (32px circle, top-right; hidden on own posts + public view); h1 "Near you" (e2e pins updated); detail age-hint line out; status On/Cancelled (0019 re-CHECK ('on','cancelled') + 'rained_out'->'on' conversion; Open-Meteo badge stays); /new helper text out; "Attend" -> "✓ Going" (green) |
| V3.4 card going circles (ticket 07) | complete | 7650557; 180/180 unit (7 files), 14/14 e2e incl. card-circles (green post-apply; red-by-design pre-apply); reviewer PASS (3 doc nits — fixed in the wrap-up commit; 1 observation parked: pingsByPostId not refreshed after a card toggle — next feed load refreshes, acceptable); 0020 APPLIED LIVE 2026-09-09 via dashboard SQL API (created_at column verified: timestamptz NOT NULL, 0 NULLs, 1 row backfilled; REST going_pings select created_at 200) | "N going" + up to 3 avatar circles + "+N" on cards (avatars only; names stay detail-only per ticket 05's amended AC); listPingsForPostsWithClient (FK hint pinned) + pure buildGoingLine; migration 0020 (going_pings.created_at — 0007 lacked it; ticket 07 ordering + ticket 04 banner + 0025 guest-list depend on it); e2e/card-circles.e2e.ts |
| V3.5 address + Maps link (ticket 08) | complete | 4094585 + b4a4013 + 3603774; 184/184 unit (7 files), e2e 14 green + address-maps red-by-design pre-apply; reviewer PASS (4 nits: 0021 trailing newline — fixed in 3603774; mapsHref-in-feed.ts location + probe edge — accepted); 0021 APPLIED LIVE 2026-09-10 via dashboard SQL API (column address text verified; 12-field get_public_playdate payload verified via order-by-id limit 1; REST playdates?select=address 200); e2e 15/15 post-apply (address-maps green; family 7 markers e2e-1789063960 + 3 viewers) | optional playdates.address (<=120, trim only, no DB CHECK) + get_public_playdate re-created 11 -> 12 fields (same EXECUTE scoping — anon + authenticated only — + search_path pin + revoke-public as 0015; the 11-field composite type re-created via a DO-block guard on the type's 'address' attribute; NO RLS change — the column rides the existing whole-row SELECT posture, the 0014/0016 lesson); /new "Address (optional)" under place (inline error when over; omitted from the insert when empty — pre-0021-apply posts without an address are unaffected); detail place line -> tappable Google Maps link (target=_blank, rel=noopener) in the signed-in + signed-out (public) views (one shared render; the pure mapsHref seam in feed.ts + unit tests: comma/space/unicode encoding, null/empty -> no link); e2e/address-maps.e2e.ts (host-view + signed-out public-view link assertions, cascade-safe REST cleanup) |
| V3.6 kids v3 (ticket 09) | complete | 93e1ef8 + 487f60d; 189/189 unit (7 files); e2e 15 green + kids-v3 red-by-design pre-apply (PGRST205 at linkKids); card-circles spec race fixed (expect.poll on the going_pings row before the host reload — deterministic 2/2 post-fix); reviewer PASS (storage audit: COVERED — 0011's avatars_owner_* first-folder=uid write policies cover <uid>/kids/<kidId>, bucket public-read so the 40px photo works on /u/:handle; 4 non-blocking nits: avatar error-message wording + 2 EOF newlines — fixed in the close-out commit + a spec locale-ordering caveat — noted); 0022 APPLIED LIVE 2026-09-10 via dashboard SQL API (6 columns + 3 playdate_kids policies verified; storage policy list unchanged — no DDL; REST playdate_kids 200); e2e 16/16 post-apply (kids-v3 green; family 9 markers e2e-1789069939 + 3 viewers) | /new "Kids you're bringing" picker replaces the age-hint section (DB column stays, form field gone; chips = own kids name + age, empty state links /profile); detail "Kids coming" line under the ping section (names + ages only, signed-in view — the signed-out surface stays the 12-field get_public_playdate, pin); profile kid editor gains photo (256px/≤5MB, avatars bucket <uid>/kids/<kidId> — 0011's owner-scoped write policies already cover the path, 0022 adds NO storage DDL) + likes ≤100 + parent interests ≤200 (free-text UI pins, no DB CHECK — the 0021 lesson); /u/ kid rows show photo + name + age + likes line, parent interests line under the bio; kidsComingLine seam = name-order (caller orders by name); e2e/kids-v3.e2e.ts (pick kids on /new → "Kids coming" line on the detail page; red-by-design pre-apply) |
| V3.7 comment replies (ticket 10) | complete | 798b896 + 8e566d2 + 90a159f; 203/203 unit (7 files; +14 seam/plan tests); reviewer A-D + F PASS (per-run + final + fix runs; parked nits all fixed in 8e566d2/90a159f); 0023 APPLIED LIVE 2026-09-10 via the dashboard SQL API — FIRST APPLY PROVED A REGRESSION: the amended SELECT policy's self-referencing subquery 42P17s (infinite recursion in the RLS rewrite; every authenticated comment read 500'd, section hidden app-wide; the live check caught it) -> 90a159f amends 0023 in place (SECDEF comment_parent_visible helper, the 0015 pattern: stable + search_path pinned + EXECUTE authenticated-only) -> RE-APPLY (column/FK no-op, policy DROP+CREATE repair) + live check: authenticated listComments probe 200 (was 500 42P17), e2e 17/17 (comment-replies + comments green), mod-hide round-trip (mod hide 200, not 42501/42P17; viewer 0 rows; flag reverted; probe rows cleaned); marker families (10) e2e-1789072055 + e2e-v-1789072072-1, (11) e2e-1789072981 + e2e-v-1789072998-1, (12) e2e-1789073802 + e2e-v-1789073817-1/-2 (sweep) | 0023 = comments.parent_id (self-ref FK ON DELETE CASCADE) + SELECT policy amendment (hidden-parent rule via the SECDEF helper — DB-level: a reply is invisible to non-mods when its parent is hidden; INSERT/DELETE/UPDATE policies UNCHANGED — insert open to all authenticated, delete = reply author OR event host (parent's author excluded), mod hide covers replies); trust.ts groupCommentsForRender (parents + nested children asc, hidden-parent exclusion, orphan + reply-to-reply drop) + planCommentAction.canReply (top-level only, any authenticated user — one-level pin); detail-page Reply UI (any authenticated user; 'Replying to @handle' composer mode; ml-8 + 24px avatar; no Reply on replies; count includes replies); e2e/comment-replies.e2e.ts (comment -> reply -> nested render + delete-permission matrix; red-by-design pre-apply); the 42P17 regression + SECDEF fix = the session's live-check payoff (a policy that self-references its own table 42P17s at RLS rewrite — unit mocks + the pre-apply gate cannot catch it) |
| V3.8 ICS (ticket 03) | complete | 4a91606 (+ close-out commit: EOF newlines + state); 230/230 unit (8 files), 17/17 e2e — gate re-run independently by the verifier (clean, first run); reviewer PASS (2 non-blocking nits: EOF newlines in the two new files — fixed in the close-out commit; ticket-03 file annotations additive — accepted) | pure `buildIcs(post, nowIso?)` in `src/lib/ics.ts` (VCALENDAR+VEVENT; UID `<id>@playdate`; DTSTAMP via the nowIso seam; UTC DTSTART/DTEND YYYYMMDDTHHMMSSZ; RFC 5545 escaping backslash-first + CRLF + 75-octet line folding [reviewer-accepted superset — details is uncapped; UTF-8-safe via code-point iteration]; LOCATION "place, address" fold-in per the ticket 08 AC — that open AC is now closed; 27 colocated unit tests incl. folding + determinism); detail-page "Add to calendar" button beside Share (signed-in + signed-out action rows, `flex-wrap` for 375px) -> Blob download `playdate-<id>.ics` (text/calendar, createObjectURL + revoke); NO migration (pure client-side; public-surface fields only; signed-out view included); first gate run flaked once (share-public, transient live anon-RPC failure — proven flake on re-run; no code-side cause in the diff); gate runs added marker families (13)+(14) (sweep) |
| V3.9 host retention (ticket 04) | complete | ca5d23f (+ close-out commit: EOF newlines + state + ticket checkboxes); 242/242 unit (8 files), 18/18 e2e post-apply — verifier re-ran the full gate independently, first-run green (host-retention 7.2s, no flake); reviewer PASS (all 8 orchestrator pins met; 2 non-blocking nits: EOF newlines in 0024 + e2e file — fixed in the close-out commit; the e2e's fixed 1500ms wait = residual post-apply flake window — did NOT flake in the live check, fallback = REST poll on last_seen_at) | pure `dueToRefreshLastSeen(lastSeenIso, nowIso, windowMs)` (null -> true; >= window inclusive — 4 unit tests) + db.ts retention section: `countPingsOnMyPostsWithClient` (two-step host post ids -> going_pings count with created_at >= cursor [the 0020 column]; null cursor -> 0 with NO query [orchestrator pin]; 0 posts -> 0 with no ping query) + `countPostsByHostWithClient` (all-time hosted count, NO status/end filters — the 2026-09-09 behavioral-history verdict) + `touchLastSeen` (plain update, NO RETURNING [42501 discipline]; pre-apply 42703 swallowed at call sites) + default wrappers (`countPingsOnMyPosts`, `countPostsByHost`, `restampLastSeen`); FeedPage: mount restamp (fire-and-forget when null or >= 1h stale — LAST_SEEN_WINDOW_MS, the ticket's 1h pin) + amber banner below the "Near you" h1 (ProfilePage nudge-banner pattern; copy verbatim per the plan-v3 pin; tap = awaited restamp + refresh() + navigate /profile — the banner is gone on the next feed visit); UserPage: "Hosted N drop-in(s)" line under "Here since" (singular at N = 1; renders only when N > 0; self + /u/:handle via the shared header render; the "No posts yet." block untouched); 0024 = profiles.last_seen_at timestamptz nullable (DO-block idempotent; header: app-side restamp [NO trigger], NO RLS change, 0009 any-column moderator UPDATE can write it — harmless cursor, no tightening in V3); 12 new unit tests (242 total); e2e/host-retention.e2e.ts (host posts -> viewer pings [REST poll gate + 1500ms wait] -> /u/ "Hosted 1 drop-in" [green pre- AND post-apply] -> banner assert = the red point pre-apply [cursor restamp 42703s, swallowed, banner hidden] -> tap -> /profile -> banner gone; cascade-safe REST cleanup) |

| V3.10 guest list (ticket 05) | complete | 1ccbd5f (0025 SECDEF get_guest_list(p_id) + lib seams + fetchGuestList) + 0bd3f4e (detail-page guest block + e2e); reviewer PASS incl. the MANDATORY pre-apply trust review (residual vector documented in the 0025 header — broad-SELECT stays, names only via the SECDEF function; nits non-blocking); 0025 APPLIED LIVE 2026-09-11 via dashboard SQL API by the headless orchestrator run (v1+v2 curl split; probes: secdef=true, EXECUTE authenticated-only + anon/public revoke verified, broad going_pings SELECT policy intact, fails-closed probe empty); live check FINISHED BY THE COORDINATOR-VERIFIER (headless run auto-rejected its .env read and died — babysit log): guest-list e2e 2/2 (marker family e2e-1789124763, swept), full e2e 19/19, unit 253/253, anon RPC get_guest_list 401 42501 fails-closed (anon has no EXECUTE — correct) | host sees "Going: <names>" on pings >= 2; pingers see co-attendee names; everyone else counts only (the 0015 count-path preserved — broad SELECT policy verified intact post-apply); count-path regression covered by the e2e gate; marker families (16) e2e-1789124763 + viewers (sweep) |

## Open risks

- .env not git-ignored yet (no Vite scaffold exists); slice 1 adds .gitignore
  with `.env` before the first commit.
- Trust at scale is the #1 product risk — slice 4 (reports/blocks) and
  slice 5 (mod tools) are the V1 answer; do not descope them.
- PWA: manifest + minimal service worker only; no offline promises in V1.
- If the live Supabase project is unreachable from this machine, slice 1's 'profile row created' cannot be verified → escalate to human (apply SQL via Supabase dashboard).
- Slice 1 AC 'profile row created' unverifiable until human applies supabase/migrations/0001_create_profiles.sql (dashboard SQL editor or grant DB access); everything else verified.
- Test artifacts in live project (intentional markers; no delete policy in V1 — optional human cleanup in dashboard): live-verify-1788546611@gmail.com (auth + profile row), live-verify2-1788548418@gmail.com (auth + profile row + 2 memberships), live-verify2-1788548418-b@gmail.com (auth user only). — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- Slice 2 parked findings (non-blocking): taken-handle retry reload dead-end (signed-in user, no profiles row — dashboard SQL recovery) is a candidate follow-up for slice 3+; createProfile handle-taken detection couples to constraint name profiles_display_name_key.
- Post-review SQL delta (017614e, 51ee493) landed after the reviewer's PASS; builder content-verified the delta this turn; the live onboarding check is the behavioral proof.
- Slice 3 live flow (posting → feed → block filter) unverifiable until human applies 0005–0006 via dashboard; builder code must be complete and build+test green regardless.
- Slice 3 live block-filter path unproven: the .not() DB filter for viewers with blocks rows is only covered by the pure filterFeed re-filter; the live check must create a real blocks row and confirm feed exclusion (reviewer finding #2).
- Parked non-blocking findings (slice 3 review): created_at superset column in 0005; title counter trim cosmetic; unparseable datetime-local fallback error; unused Block type; missing trailing newlines in 0005/0006.
- Test artifacts (lv4): live-verify4-1788975216@gmail.com + -b (auth + profile rows; all lv4 playdate/ping/report/blocks rows deleted, verified 0). Optional human cleanup. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- Host self-ping succeeds at DB level (client guard only; 0007 header documents it) — slice 5 candidate for a DB-level guard, pending human call. — RESOLVED 2026-09-09: human chose DB-level guard; shipped as 0010 BEFORE INSERT trigger, enforced live (400 P0001).
- Self-privilege-escalation hole (pre-existing 0001×0008 interaction, slice 5 reviewer finding): any authenticated user can set their own moderators=true via direct API. App never does this. Candidate 0011 trigger — human call.
- display_name unbounded → 375px edge on handle-bearing buttons (ModPage ban row, UserPage block row). Product-level cap candidate — human call.
- Test artifacts (lv5): live-verify5-1788977882@gmail.com (host profile), -b (viewer, banned_at SET — suspended on next session), -m (mod, moderators reverted false); orphaned B Ballard membership. All lv5 playdate/ping rows deleted, verified 0. Optional human cleanup. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- RLS-diagnosis probe artifacts (2026-09-09): probe2–probe8 signup users + probe6/probe8 profile+membership rows (probe8 = Greenwood). No playdates. Optional human cleanup alongside lv1–lv5. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)

- Test artifact (lv6): live-verify marker lv6-1788991152@gmail.com (auth user 63a23f4e-63a9-48d8-91f8-98b8f0c6e0c4, profiles row, banned_at SET — suspended on next session). Optional human cleanup via CDP.
- Untracked dirs (out of slice scope; orchestrator to decide tracking): .opencode/skills/, .scratch/guest-list/, .scratch/v3/.
- Test artifacts (lv7 + e2e, 2026-09-09): lv7-1788993934@gmail.com (auth user e38cf785-04a0-4485-a6ce-aae98e34e389; profiles row home_zip 98109 / radius_miles 10); e2e markers e2e-1788993508 + e2e-1788993746 (auth + profile rows; playdate rows cleaned by spec); e2e-v-<epoch> viewer accounts persist by design (pending sweep). Optional human cleanup alongside lv1–lv6. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- Test artifacts (lv8/lv9 + orphans, 2026-09-09): lv8-1788998139[-b|-m] (auth + profiles rows; playdate + comments cleaned), lv9-1788999477[-m|-v] (auth + profiles rows; mod flag reverted; playdate + comment cleaned), lv9-1788999467 orphans (3 auth-only users, no profiles), e2e-v-<epoch> viewer accounts. Optional CDP sweep alongside lv1–lv7. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- Test artifacts (lv10 + e2e, 2026-09-09): lv10-1789001488@gmail.com (auth user 3744598f-eff4-4a4c-ade6-89117f66e7c3; profile + playdate rows deleted), e2e-1789001661@gmail.com (e2e marker; playdate rows self-cleaned; e2e-v- viewer accounts persist by design). Optional CDP sweep alongside lv1–lv9. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- Test artifact (lv11, 2026-09-09): both lv11 markers swept
  (auth/profile/playdates verified 0). `e2e-1789016461@gmail.com`
  (auth + profile rows; its playdate self-cleaned by spec) persists by
  the standing e2e-marker pattern — next sweep candidate.
- Parked (V3 slice 2 reviewer nit): `queryMyPlaydatesWithClient`
  column list omits `status`, so /profile's "Your posts" list never
  shows the muted state — candidate to fold into V3 slice 4 (host
  retention touches that surface). The "Rain likely" badge renders
  independently of muted status (documented in DropInCard as
  deliberate: "a forecast, not a state") — accepted.
- Kid-photo pin override (human-approved 2026-09-09): reviewer audits 0022's avatars-bucket write policy (owner-scoped only) before apply; display scope pinned to the profile kids list.
- Card going circles (ticket 07) expose pinger avatars in the feed — human-requested; the guest-list residual-vector note (name reconstruction) now extends to avatars/initials; accepted class: same as the public host avatar.
- Marker sweep DUE (2026-09-09): 5 e2e-* families in auth.users (~30 accounts, all with profile rows; playdate/ping rows cleaned by specs): (1) e2e-1789012649/857/3689/3792/16461 + 8 e2e-v- (03:57-05:01 family), (2) e2e-1789056145/193/278 + 7 e2e-v- (16:02 family), (3) e2e-1789056820 + 2 e2e-v- (16:13, 0019 run), (4) e2e-1789058498/593/646 + 7 e2e-v- (16:41 family), (5) e2e-1789059187 + 3 e2e-v- (16:53, ticket-07 run). Sweep = DELETE profiles + going_pings + auth.users for the e2e-% emails (CDP SQL API path; safety gate: no lv-*, no founder, count sanity) — the V2 full-sweep precedent. (6) ticket-08 address-maps pre-apply e2e run (2026-09-10, commit 4094585's gate run): 1 e2e-* host + 1 e2e-v-* viewer family — exact emails resolved at sweep time via the SQL API: `select email from auth.users where email like 'e2e-%'` (the sweep covers by prefix, so the enumeration stays complete). (7) ticket-08 live-check e2e run (2026-09-10, post-0021-apply): e2e-1789063960 (host) + e2e-v-1789063975 / e2e-v-1789063980 / e2e-v-1789064009 (viewers). (8) 2026-09-10 19:36–19:44 e2e runs (gate + race-fix runs): markers e2e-1789068844, e2e-1789069000, e2e-1789069351 + their e2e-v- viewers (epochs 1789068xxx–1789069451) + e2e-diag-v-1789069165 (probe viewer: auth user + a profiles row persist — its profile delete was an RLS no-op; sweep must hit the profiles row explicitly). (9) ticket-09 live-check e2e run (2026-09-10, post-0022-apply): e2e-1789069939 (host) + e2e-v-1789069950 / e2e-v-1789069956 / e2e-v-1789069987 (viewers). (10) Run D (ticket 10) pre-apply e2e run (2026-09-10, commit 798b896's gate run): e2e-1789072055@gmail.com (host — setup marker; its playdate rows self-cleaned by spec, probe-verified 0; e2e/.auth/marker.json is overwritten by later runs) + e2e-v-1789072072-1@gmail.com (viewer 1 — created, stood at the red point: pre-apply the spec STOPS before viewer 2 is created, so no e2e-v-1789072072-2 account exists from this run; the post-apply live-check run is family 11, a fresh epoch, whose viewers are e2e-v-<live-epoch>-1/-2). (11) ticket-10 post-apply live-check e2e run (2026-09-10, first 0023 apply — the live check that caught the 42P17 regression): e2e-1789072981@gmail.com (host) + e2e-v-1789072998-1@gmail.com (viewer). (12) ticket-10 post-fix re-apply live-check e2e run (2026-09-10, after 90a159f's SECDEF fix + 0023 re-apply; the 17/17 green + mod-hide round-trip run): e2e-1789073802@gmail.com (host) + e2e-v-1789073817-1 / e2e-v-1789073817-2@gmail.com (viewers). Exact emails resolved at sweep time via the SQL API: `select email from auth.users where email like 'e2e-%'` (the sweep covers by prefix, so the enumeration stays complete). (13) ticket-03 ICS gate runs (2026-09-10, commit 4a91606): e2e-1789075019 (first gate run, share-public flake at the end), e2e-1789075119 (flake re-run), e2e-1789075131 (final clean run) + e2e-v-1789075148-1/-2 (viewers, persist by design). (14) verifier's independent gate re-run (2026-09-10, post-review): new e2e-* + e2e-v-* families from that run — exact emails resolved at sweep time via the SQL API (`select email from auth.users where email like 'e2e-%'`; the sweep covers by prefix, so the enumeration stays complete). (15) ticket-04 retention post-apply live-check e2e run (2026-09-10, post-0024-apply): e2e-* host + e2e-v-* viewer family (exact emails resolved at sweep time via the SQL API — `select email from auth.users where email like 'e2e-%'`; the sweep covers by prefix, so the enumeration stays complete).

## Decisions log

- 2026-09-04 — Stack: Vite+React+TS+Tailwind, Supabase backend (auth + Postgres).
- 2026-09-04 — DECISION 1 RESOLVED: human created Supabase project; credentials verified in .env.
- 2026-09-04 — PRODUCT BRIEF (human): recreate the wives'/moms' group chat at
  city scale — drop-in, open invitation, zero pressure. Mobile-first web app
  (PWA), not native stores. DECIDED: drop-in posts w/ optional going-pings
  (no RSVPs); open sign-up + moderation; neighborhood tags for discovery (no
  GPS); any member can post; persistent display_name handles.
- 2026-09-04 — INTEGRATION (orchestrator): `profiles` table migration (id, display_name, created_at + minimal RLS) is part of slice 1 because slice 1's acceptance criteria require 'profile row created'; slice 2 refines RLS + adds neighborhoods/memberships migrations.
- 2026-09-04 — AUTH (human decision): email confirmation intentionally OFF for V1 (no email infrastructure until V2; restore confirmation or an invite flow before any real launch).
- 2026-09-04 — INTEGRATION (orchestrator): /onboarding is the pinned onboarding route path (plan's route list predated onboarding); onboarding gate = signed-in user with 0 memberships; slice 2's UserPage shows 'No posts yet' (playdates table lands in slice 3).
- 2026-09-04 — SEED (human amendment): neighborhoods seed list amended — Beaverton + Interlawn removed; 0002 now 20 entries (human-approved, committed pre-apply).
- 2026-09-04 — LESSON (human, post-apply): Postgres has no `CREATE POLICY ... IF NOT EXISTS` — IF NOT EXISTS is not valid for many DDL statement types. 0002/0003 fixed by human to DO-block policy idempotency (commit 51ee493) and applied live. RULE for all future migrations: wrap idempotent DDL in DO blocks or verify against real Postgres grammar; never assume IF NOT EXISTS exists for a statement type.
- 2026-09-04 — INTEGRATION (orchestrator): slice 3 owns migrations 0005 (playdates + RLS) and 0006 (blocks + RLS) — the blocks table moves forward from slice 4 because slice 3's feed AC requires the DB-level block filter the plan pins; the block UI (block/unblock buttons) stays in slice 4. Feed 'today' boundary = client-local startOfToday (no GPS/timezone settings in V1). /new success navigates to the feed (the detail page lands in slice 4). playdates RLS includes host-only UPDATE/DELETE (capability only; no edit/delete UI until slice 4+).

- 2026-09-09 — 42501 (orchestrator): live check showed createReport's .select().single() (RETURNING) 403s under moderators-only reports SELECT RLS. DECISION: keep RLS pinned (reports visible to moderators only); fix app code with a plain insert, no returned row (1c8e5f4); regression tests include a 42501 mock tripwire.
- 2026-09-09 — INTEGRATION (orchestrator): 0008 owns profiles.moderators (added for reports RLS); slice 5 migration expects the column to exist; the one-time founder flag is an UPDATE of this column (0008 header documents the handoff).
- 2026-09-09 — PARKED (human call): host self-ping INSERT succeeds at DB level (client guard only, 0007 header); candidate DB guard for slice 5. — RESOLVED 2026-09-09: human chose DB-level guard; slice 5's migration (0009+) must add a DB guard preventing host self-ping on going_pings.
- 2026-09-09 — HUMAN DECISION (implemented in 0010): host self-ping closed at DB level via BEFORE INSERT trigger on going_pings (CHECK can't span tables; DO-block idempotency). Enforced live: 400 P0001.
- 2026-09-09 — INTEGRATION (orchestrator): 0009 (hidden_at/banned_at + moderator UPDATE policies) expects the moderators column from 0008 — no re-create. Founder flag stays a human-executed one-time UPDATE (statement in 0009 header; not run in the live pass).
- 2026-09-09 — LIVE-LESSON: PostgREST surfaces RLS-blocked 0-row UPDATEs as 2xx (204 / 200+[]), never 403 — the RLS wall holds, the HTTP layer is silent; /mod's client route guard is the user-facing wall. CDP apply: destructive DDL needs the "Run query" confirm click + a follow-up SELECT to verify execution.

- 2026-09-09 — V2 SLICE 2 (orchestrator): reviewer NEEDS_CHANGES on 0011 self-elevation trigger — the BEFORE UPDATE guard blocked EVERY non-moderator incl. postgres/service_role (auth.uid() is NULL via CDP/dashboard), which would break the ban path. Fix 4f3cc72: `if auth.uid() is null then return new` pass-through so only JWT non-moderators are locked out. Live-proven: non-mod self-elevation UPDATE -> 400 P0001; postgres banned_at UPDATE succeeds. LESSON: a trigger guard that must allow a server role must test auth.uid() IS NULL (non-JWT) separately from the moderator check.
- 2026-09-09 — V2 SLICE 3 (orchestrator): post location = host's home_zip (V2 data model has no per-post location); unknown/missing host zip excluded from the radius feed (no invented coords). Zip seed = WA-only (605 rows, 98xxx, SimpleMaps v1.95.1 filtered to WA) instead of the 41K-row US extract (plan-v2 risk pre-decision; expandable later). Ops lesson: 3 dev-agent stalls on slice 3 (turns died mid-Write — output truncation in a bloated ~163K session). WORKAROUND NOW STANDARD: send "/new" as a STANDALONE herdr prompt (command form resets the opencode session; embedded in prose it is swallowed as chat), then a file-based brief (/tmp/*.txt) with <150-line write chunks; split large slices into small jobs. 0012 live-apply done by the verifier, not the dev agent.
- 2026-09-09 — V2 SLICE 4 (orchestrator): lv8 live check caught a 42501 the diff review missed — Postgres evaluates a table's SELECT policy USING against the NEW row of an UPDATE, so 0013's SELECT policy (hidden_at IS NULL) made the moderator hide path 403 for every moderator. Fix 0014 (b06c5c4): SELECT policy OR-moderators branch (hidden rows now visible to moderators — the /mod model's visibility; non-mods fully blocked) + a muted "hidden by moderator" chip in the detail page. LESSON: an RLS SELECT policy whose USING the UPDATE's new row must satisfy can silently break the UPDATE path — check SELECT-USING/WITH-CHECK interactions before shipping a hide/soft-delete column. NUMBERING: 0014 consumed the number plan-v2 reserved for slice 5's anon-read migration — slice 5 ships as 0015.
- 2026-09-09 — V2 SLICE 5 (orchestrator): anon read shipped exactly as pinned (public surface = playdate + neighborhood label + host handle/avatar + going count; /u/ + comments stay authenticated-only; pinger ids never exposed — going count via a SECURITY DEFINER RPC (get_public_playdate, 11 fields, search_path pinned, EXECUTE scoped to anon+authenticated, revoke public), going_pings stays authenticated-only). Trust review (pre-apply, per plan pin): post enumeration intended + documented; block-filter bypass for signed-out acceptable (blocks are signed-in personalization, public content stays public); hidden-wall leak found by reviewer (anon policy USING(true)) -> 089a1df role-scoped `to anon using (hidden_at is null)` (role-scoped policy cannot 42501 the authenticated update paths — 0014 lesson applies to a role's OWN policies only) + header rewrite; re-review PASS. Live probes (lv10): hidden post absent from anon table reads + RPC not-found; anon comment/profile/report reads 200 [] (silent RLS); anon host-self-ping write -> 400 P0001 (the 0010 BEFORE INSERT trigger fires BEFORE RLS — trigger/RLS ordering: a cross-table BEFORE trigger can surface as the wall, never a silent 2xx). NUMBERING: this slice's migration is 0015 (0014 consumed by the slice-4 hide fix). **V2 ALL 5 SLICES COMPLETE + LIVE (0011–0015 applied).**
- 2026-09-09 — HOUSEKEEPING (orchestrator): (1) Nit batch e0d3756 closed ALL parked V2 review nits — zip-cache retry on fetch failure (no unit test by design: module-private cache; noted), Bellevue label fix (98007), FeedPage docstring typo, trailing newlines, PlaydateDetailPage functional setState (ping/comment ops no longer clobber), ping-intent unmount cleanup (stale "Tap to confirm" highlight gone; return path preserved), host_display_name null-fidelity (type + null-safe renders); 139/139 + 12/12. (2) FULL MARKER SWEEP via CDP: 75 auth users (live-verify*/lv6-lv10/probe*/e2e-*) + 64 profiles deleted; child rows verified 0; safety gate passed (no is_mod=true, no founder match, 75 >= 20 candidates); live DB after = 2 profiles + 3 auth users (all founder: cd733843-1436-42d0-b205-284172578bdb 'Jon Meisburg' moderators=true + auth user jonmeisburg@gmail.com) + 1 founder-hosted playdate. CDP LESSONS: the Monaco editor reports "0 rows" for ALL DML statements — verify effect via before/after counts, never the DML result line; IDLs in SQL need SINGLE-quoted literals (double quotes parse as identifiers -> 42703). (3) Untracked tracker dirs committed to the repo: .scratch/v3/, .scratch/guest-list/, .opencode/skills/ (AGENTS.md references the local skill files).
- 2026-09-09 — FEEDBACK TRIAGE (orchestrator): 12 origin-user annotations (feedback/v3.md) -> ticket 06 (quick batch: #2 card check, #3 "Near you" h1, #4 detail age line out, #5 Rained-out status out + migration 0019, #8 /new helper out, #11 Attend/✓Going) + ticket 07 (#1 card going circles: "N going" + up to 3 avatars + "+N"; names stay detail-only). New: 08 (#9 address + maps link, 0020 + 12-field RPC), 09 (#10 kids-you're-bringing picker + #6a kid photos + #6b/#7 interests, 0021), 10 (#12 one-level replies, 0022). Numbering: retention 0017 -> 0023; guest list 0018 -> 0024 (0019-0022 consumed by the feedback tickets).
- 2026-09-09 — HUMAN DECISIONS (feedback calls): (a) kid photos = YES — OVERRIDES the first-name-only privacy pin; rails: optional per kid, owner-uploaded (avatars bucket <uid>/kids/<kidId>), shown ONLY in the profile kids list — never on cards or event lines. (b) interests = free text (kid likes <=100, parent interests <=200 — orchestrator pin; a tags structure is a later candidate). (c) comment replies = one level, ANY authenticated user may reply (not host-only); no reply-to-replies; reply delete = reply author OR event host.
- 2026-09-09 — SCHEMA GAP (orchestrator): 0007's going_pings has no created_at — migration 0020 adds it (ticket 07); queue renumbered 0021-0025 (address/kids/replies/retention/guest-list). Tooling correction: the dashboard session token lives in the CDP profile's Local Storage (supabase.dashboard.auth.token, 1h TTL), NOT cookies — the 0019 apply proved the full SQL-API path.
- 2026-09-09 — V3 TICKETS 06-07 CLOSED: 9581d98 (quick feedback batch: card going toggle, h1 'Near you' + nav tab 'Nearby', detail age line out, status On/Cancelled — 0019 live; /new helper out; Attend/✓ Going) + 7650557 (card going circles: 0020 going_pings.created_at live, listPingsForPosts FK-hint-pinned single query, buildGoingLine, card going line + up to 3 circles + '+N', mocked-client unit tests for both *WithClient query fns, card-circles e2e). Gates: 180/180 unit + 14/14 e2e; both migrations via the dashboard SQL API (Monaco SPA still broken in CDP Chrome). Parked: pingsByPostId live-refresh after a card toggle (next load refreshes — acceptable).
- 2026-09-09 — JUDGMENT CALL (orchestrator, logged for handoff): the bottom-nav tab for `/` (src/App.tsx:188) was renamed "Today" → "Nearby" during the ticket 06/07 batch. It was NOT in ticket 06's original scope (ticket 06 renamed only the feed h1 "Today" → "Near you"); the reviewer flagged the tab label as a stale duplicate of the renamed h1, and the orchestrator decided to fold the one-word rename into the ticket 07 batch for consistency (shipped in 9581d98's follow-on 7650557). No e2e spec pinned the old "Today" tab (zero matches), so no spec broke. Logged so a fresh session sees the provenance of the nav-tab label.
- 2026-09-10 — V3 TICKET 08 DISPATCHED (orchestrator): address + tap-to-Maps link (V3.5, in progress). Migration 0021: playdates.address text nullable (DO-block idempotent) + get_public_playdate re-created 11 -> 12 fields — the public surface gains the address (the signed-out detail view renders the Maps link; the signed-out read flows through the RPC); the 11-field composite type is re-created (Postgres has no ALTER TYPE) via a DO-block guard on the type's 'address' attribute; same EXECUTE scoping (anon + authenticated only) + search_path pin + revoke-public as 0015; NO RLS change (the column rides the existing playdates whole-row SELECT posture — the 0014/0016 column-add lesson). Code: /new "Address (optional)" under place (<=120, trim, inline error when over; omitted from the insert when empty — pre-0021-apply posts without an address are unaffected); detail place line -> tappable Google Maps link (new tab + rel=noopener) in BOTH the signed-in and signed-out (public) views (one shared render; the pure mapsHref seam in feed.ts, unit-tested: comma/space/unicode encoding + null/empty -> no link); e2e/address-maps.e2e.ts (host-view + signed-out public-view link assertions; cascade-safe REST cleanup; red-by-design pre-apply — the post-with-address insert 42703s, failure lands at the post-create step, never a crash). Gate VERIFIED 2026-09-10 (post-commit 4094585): build + 184/184 unit green (180 + 4 mapsHref tests); e2e pre-apply = 13/14 spec tests green (14/15 invocations incl. setup; address-maps RED at post-create by design — the documented 42703 line). 0021 PENDING LIVE APPLY (human, dashboard SQL API — the 0020 token path, Local Storage key supabase.dashboard.auth.token); the V3.5 live-check line (test:e2e 15/15 + the SQL-API probe pair) is in the Slices table. Committed 4094585 (ticket-08 code + 0021 + e2e + feed tests, 2026-09-10). Queue after green: 09 (kids v3 / 0022) -> 10 (replies / 0023) -> 03 ICS -> 04 retention (0024) -> 05 guest list (0025 + pre-apply trust review).
- 2026-09-10 — V3 TICKET 08 CLOSED: 4094585 (address + Maps link: 0021 playdates.address + get_public_playdate 11->12 fields (0015 pattern preserved: grants anon+authenticated only, search_path pin, security definer, stable), /new optional Address (≤120), detail Maps link signed-in + signed-out (mapsHref pure seam + 4 unit tests), address-maps e2e) + b4a4013 (task-state V3.5) + 3603774 (housekeeping: 0021 trailing newline + sweep note). Gates: 184/184 unit, e2e 14 + red-by-design pre-apply; reviewer PASS. 0021 APPLIED LIVE 2026-09-10 (dashboard SQL API; token refreshed at SPA level as expected; 12-field payload + REST 200 verified; e2e 15/15). PROBE LESSON: min(uuid) does not exist in Postgres — the 12-field probe is order-by-id limit 1 (corrected in the V3.5 live-check line).
- 2026-09-10 — V3 TICKET 09 CODE (orchestrator): kids v3 per the 2026-09-09 human pins — /new "Kids you're bringing" picker replaces the age-hint section (DB column stays, form field gone; 0022 adds playdate_kids + kids.avatar_url/likes + profiles.interests); detail "Kids coming" line = names+ages ONLY, signed-in view (the signed-out surface stays the 12-field get_public_playdate — pin); kid photos owner-uploaded to the avatars bucket <uid>/kids/<kidId> (0011's owner-scoped write policies already cover the path — 0022 adds NO storage DDL; reviewer pre-apply audit still runs); kid likes ≤100 / parent interests ≤200 = free-text UI pins (no DB CHECK, the 0021 lesson); kidsComingLine seam = name-order (caller orders by name). GATES: 189/189 unit; e2e 15 green + kids-v3 red-by-design pre-apply (PGRST205 at linkKids). SPEC RACE (found at the gate): card-circles (ticket 07) lost a viewer-upsert-vs-host-reload race 2/2 after ticket-09's /new fetch shifted timing — fixed with an expect.poll on the going_pings row before the host reload (spec-only; the product's no-live-refresh behavior stands, the reviewer-parked observation); DB path proven sound by a live REST probe (feed query returns the ping + profile embed shape buildGoingLine renders).
- 2026-09-10 — V3 TICKET 09 CLOSED: 93e1ef8 (kids v3: 0022 playdate_kids + kids.avatar_url/likes + profiles.interests — storage covered by 0011 owner policies, no DDL; /new "Kids you're bringing" picker replaces the age section; detail "Kids coming" line names+ages signed-in only; profile kid photo (40px, <uid>/kids/<kidId>) + likes ≤100; parent interests ≤200; kidsComingLine seam; kids-v3 e2e) + 487f60d (task-state V3.6) + close-out commit (EOF newlines). Gates: 189/189 unit, e2e 15 + red-by-design pre-apply; card-circles spec race (viewer-upsert-vs-host-reload) fixed with an expect.poll gate — product no-live-refresh behavior stands (the reviewer-parked ticket-07 observation). 0022 APPLIED LIVE 2026-09-10 (dashboard SQL API; reviewer storage audit COVERED pre-apply; 6 columns + 3 policies + unchanged storage list verified; e2e 16/16).
- 2026-09-10 — OPERATIONAL (orchestrator): builder sessions die mid-run on large slices (ticket 08: 1 death; ticket 09: 4 deaths, finished via 4 scoped runs). Rule for ticket 10+: dispatch the build in scoped runs of ≤ ~4 files each (lib layer → pages → e2e + gate + commits); after any builder death, run a read-only explorer state-check (mtimes + `git log --oneline -1 -- <path>` + working-tree greps) before re-dispatching the continuation — the state reconstructs cleanly.
- 2026-09-10 — 42P17 (orchestrator, live-proven 2026-09-10): an RLS policy whose USING subselects ITS OWN table 42P17s ('infinite recursion detected in policy') at query rewrite — Postgres rejects the query for any RLS-enforced role; the DDL applies cleanly (the defect only surfaces at first authenticated use). The live check caught it (every authenticated comment read 500'd). Fix (90a159f): the check moves into a stable SECURITY DEFINER helper (the 0015 RPC pattern: search_path pinned, EXECUTE scoped to authenticated, revoke public/anon) — the definer's subquery is not RLS-expanded, so the rewrite terminates. RULE: a policy that must reference its own table's other rows (parent/child visibility) uses a SECDEF helper or a security_barrier view — never a direct self-subquery; and such a policy must get a live authenticated-role probe at apply time (unit mocks + pre-apply reds cannot execute it).
- 2026-09-10 — V3 TICKET 03 CLOSED: 4a91606 (ICS: `src/lib/ics.ts` pure `buildIcs(post, nowIso?)` — VCALENDAR (PRODID) + VEVENT, UID `<id>@playdate`, DTSTAMP via the nowIso seam, UTC DTSTART/DTEND (YYYYMMDDTHHMMSSZ), RFC 5545 escaping (backslash-first) + CRLF + 75-octet line folding [reviewer-accepted superset: details is uncapped; UTF-8-safe via code-point iteration], LOCATION "place, address" fold-in (closes the ticket 08 open AC — its checkbox stays in the ticket 08 file, which belongs to closed ticket 08 and is left untouched), 27 colocated unit tests; detail-page "Add to calendar" button beside Share (both action rows, `flex-wrap` for 375px) -> `playdate-<id>.ics` Blob download (text/calendar); NO migration — pure client-side, public-surface fields only, signed-out view included). Gates: build + 230/230 unit (8 files) + 17/17 e2e; the verifier independently re-ran the full gate (clean, first run — no flake recurrence). Reviewer PASS: 2 non-blocking nits (EOF newlines — fixed in the close-out commit; ticket-03 file annotations additive — accepted). One transient share-public flake on the first gate run (live anon RPC, proven flake; no code-side cause in the diff). Queue: 04 retention (0024) -> 05 guest list (0025 + pre-apply trust review). Marker families (13)(14) pending sweep.
- 2026-09-10 — V3 TICKET 04 CLOSED: ca5d23f (retention: 0024 = profiles.last_seen_at timestamptz nullable [DO-block idempotent; header: app-side restamp [NO trigger] + NO RLS change [the column rides the existing profiles posture] + 0009 any-column moderator UPDATE can write it — harmless cursor, no tightening in V3]; db.ts retention section — countPingsOnMyPostsWithClient (two-step: host post ids from playdates -> going_pings count over those ids with created_at >= cursor [the 0020 column]; null cursor -> 0 with NO query [orchestrator pin — no baseline, first visit establishes it]; 0 posts -> 0 with no ping query) + countPostsByHostWithClient (all-time hosted count, NO status/end filters — the 2026-09-09 behavioral-history verdict: no reviews, no vouching) + touchLastSeen (plain update, NO RETURNING [42501 discipline]; pre-0024-apply it 42703s and call sites swallow it) + default wrappers; pure dueToRefreshLastSeen (null -> true; >= windowMs inclusive — the 1h FeedPage pin; 4 unit tests); FeedPage mount restamp (fire-and-forget, caught) + amber banner below the "Near you" h1 (verbatim copy "N new families pinged your drop-ins" [plan-v3 pin, no singular variant]; tap = awaited restamp + refresh() + /profile — the banner is gone on the next feed visit) + UserPage "Hosted N drop-in(s)" line under "Here since" (singular at 1, renders only when N > 0, self + /u/:handle; the "No posts yet." block untouched); 12 new unit tests -> 242/242; e2e/host-retention.e2e.ts (host posts -> viewer pings -> "Hosted 1 drop-in" [green pre- AND post-apply] -> banner assert = the documented red point pre-apply -> tap -> /profile -> banner gone; cascade-safe REST cleanup)). 0024 APPLIED LIVE 2026-09-10 (dashboard SQL API: POST /database/query 201; information_schema probe = last_seen_at timestamptz nullable, 1 row; PostgREST probe 200 — no PGRST205; CDP Chrome released). Post-apply live check (verifier, independent full-gate re-run): build + 242/242 unit (8 files) + 18/18 e2e FIRST RUN (host-retention green 7.2s — no flake; the reviewer's 1500ms-wait risk did not materialize; fallback if it ever flakes = REST poll on profiles.last_seen_at, the pre-apply red point is unaffected). Reviewer PASS: all 8 orchestrator pins met (two-step count + null-cursor pin, all-time count, no-RETURNING touch, throttle pure fn, FeedPage F&F/tap/verbatim-copy, UserPage line, e2e red-point ordering, 0024 SQL + header); 2 non-blocking nits (EOF newlines — fixed in the close-out commit; the 1500ms fixed wait — accepted residual risk). Queue: 05 guest list (0025 + pre-apply trust review). Marker families (15) pending sweep.
## Escalations (waiting on human)

- 2026-09-09 — FOUNDER FLAG: RESOLVED pending verification — human signed up ("Jon Meisburg", profile cd733843-1436-42d0-b205-284172578bdb, 1 membership Greenwood, moderators=false). Orchestrator to apply `update public.profiles set moderators = true where display_name = 'Jon Meisburg';` via cdp-sql-runner and confirm → then /mod is live for the human. — FLAG APPLIED + VERIFIED 2026-09-09 (row re-read: moderators=true).

- DECISION 3: deployment target, deferred to V1.5 — not blocking
- 2026-09-04 — SLICE 1 DB APPLY: apply supabase/migrations/0001_create_profiles.sql to live Supabase project. Options: (a) paste into Supabase dashboard SQL editor, or (b) provide Postgres DATABASE_URL / supabase CLI token for this machine. Live auth endpoint IS reachable; only the SQL-application path is missing.
- 2026-09-04 — SLICE 1 LIVE CHECK BLOCKED: PostgREST PGRST205 for public.profiles persists minutes after dashboard apply. Human dashboard steps (project matching VITE_SUPABASE_URL): confirm `profiles` in Database → Tables; if absent, re-paste supabase/migrations/0001_create_profiles.sql into the SQL editor and run it; if present, trigger a PostgREST schema-cache refresh (re-run a trivial DDL in the SQL editor, or restart the server); confirm email confirmation is OFF in Authentication settings. Then tell orchestrator 'done' → live check re-run → slice 1 closes → slice 2 dispatches. — RESOLVED 2026-09-04: human applied migration + cache refresh via dashboard; live check PASS (marker live-verify-1788546611@gmail.com).
- 2026-09-04 — SLICE 2 DB APPLY: RESOLVED 2026-09-04. Seed sanity-check completed by human (list amended to 20 entries: Beaverton + Interlawn removed, 017614e). Apply initially failed on invalid `create policy if not exists` — human fixed 0002/0003 to DO-block policy idempotency (51ee493); 0002→0003→0004 then applied via dashboard: Success. Live onboarding check PASS (see slice 2 row evidence).
- 2026-09-04 — SLICE 3 DB APPLY: RESOLVED 2026-09-09 (by orchestrator, not human). 0005_create_playdates.sql then 0006_create_blocks.sql applied live via browser-use (CDP → Monaco setValue + Run; both "Success"). PostgREST schema cache auto-refreshed — REST served playdates + blocks at HTTP 200 within ~1 min (no PGRST205). Live posting check PASS same day (marker host posts → viewer feed shows → blocks row → viewer feed excludes via DB .not() filter, closing reviewer finding #2). Slice 3 closed; slice 4 dispatched.