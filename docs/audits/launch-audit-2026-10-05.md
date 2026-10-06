# Launch audit — the signed-in surfaces (2026-10-05)

`/impeccable audit`, narrowed to what **nothing had measured**: the feed, the post
form, the drop-in detail, onboarding, the profile and settings.

**Why a narrowed one.** Two lanes already own the signed-out half:
`scripts/mobile-audit.mjs` visits `/login`, `/reset-password`, `/playdate/:id` and
`/browse` (which redirects to `/login` when signed out), and the Impeccable tool
reaches only what a signed-out browser can. So every surface in this report was
measured **in a signed-in browser**, with the e2e marker's stored session
(`e2e/.auth/marker-state.json`) and, for `/onboarding`, with fresh signups.

**Base URL: `http://localhost:4180`.** `:4173` is owned by another checkout right
now and `playwright.config.ts` sets `reuseExistingServer: true`, so a lane run
through the repo config can silently measure a different app. This is the
private-port recipe from `.scratch/place-photo-crop/spec.md`, applied.

## Method and evidence

| Lane | What it did |
|---|---|
| `.scratch/launch-audit/audit.mjs` | marker session · 6 routes × 2 viewports (390×844, 1440×900) · overflow, tap targets, inputs <16px, alt text, headings, console errors, 4xx responses, full-page screenshots |
| `.scratch/launch-audit/onboarding.audit.ts` | fresh signups (the repo's own signup steps) · onboarding cards 2–4 × 2 viewports · same measurements |
| `scripts/a11y-dom-check.mjs` | **PASS** — error announcements reach assistive tech |
| `scripts/dark-mode-check.mjs` | 1 failure, documented in the script's own source as always-red on `/login` |
| `scripts/layout-width-check.mjs` | 13 failures — see F3; the lane visits a page with no nav |
| `scripts/focus-trap-check.mjs` | **SKIP** — it needs the signed-in Report control and has no credentials |
| `scripts/design-detect.mjs` | 22 unaccepted findings — pre-existing (21 source nits + 1 runtime false positive, F4) |

Screenshots: `.scratch/launch-audit/screens/` (12 signed-in + 6 onboarding frames,
phone and desktop).

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Two real tap-target findings: three 26px text buttons on the signed-in detail page (F1) and a 41px select on the last onboarding card (F5) |
| 2 | Performance | 3 | Nothing pathological; runtime perf not measured here |
| 3 | Responsive | 3 | Zero horizontal overflow in 18 page/viewport measurements; the nav is ≥44px everywhere it exists |
| 4 | Theming | 3 | No hard-coded colour in any surface file; dark mode verified only on `/login` |
| 5 | Implementation Integrity | 3 | Coherent and heavily documented; the detector's 21 source nits are house-style, not breakage |
| **Total** | | **15/20** | **Good** |

## Executive summary

- **18 page/viewport measurements, zero horizontal overflow, zero console errors,
  zero 4xx responses** on the second pass (one transient 401 appeared on the feed
  in the first pass and did not reproduce).
- **One new, real defect: F1** — `Share`, `Add to calendar` and `Report` on the
  signed-in drop-in page are 26px-tall bare text buttons (`45×26`, `119×26`,
  `51×26`), while the *same three actions* on the public view carry `px-3 py-3`
  and clear 44px. This violates the repo's own documented button rule
  (`DESIGN.md`, "Buttons: `min-h-11` (44px)") and its `ocr` tap-target rule.
- **The scary-looking settings result refuted on measurement** — 13 sub-44 flags
  on `/settings`, every one of them an `sr-only` or glyph-sized input inside a
  labelled hit area of 44px or more (measured wrappers: `324×86`, `280×46`,
  `292×66`, `324×44`, `103×44`). **Nothing on `/settings` fails the target floor.**
- **Two real tap-target findings in total** (F1, F5) — everything else the
  measurement flagged was a wrapper, an inline link in a sentence, or a Leaflet
  internal.
- **Onboarding is nearly clean** at both widths: no overflow, no console errors,
  one `h1` per card — and exactly one measured target under the floor, the area
  card's radius `<select>` at **41px** (F5).
- **Two lanes are red for lane reasons, not product reasons** (F3): the width lane
  checks for a nav on a route that has none, and the dark-mode lane's card check
  is documented in its own source as always-red on the decarded `/login`.

## Findings

### [P1] F1 — The signed-in drop-in page's Share / Add to calendar / Report are 26px tall

- **Location**: `src/pages/PlaydateDetailPage.tsx:2230-2255` (signed-in row) —
  compare `:1789-1808` (public row, `px-3 py-3`, correct).
- **Category**: Accessibility / Responsive.
- **Measured**: `Share` 45×26, `Add to calendar` 119×26, `Report` 51×26 at 390×844
  *and* at 1440×900 (`.scratch/launch-audit/results.json`).
- **Impact**: the host's three secondary actions (share the link, get the ICS,
  report a problem) are the size of body text, not controls. On a phone
  one-handed — the operating context in `PRODUCT.md` — they are the hardest things
  on the page to hit deliberately.
- **Standard**: the repo's own rule is 44px (`.opencodereview/rule.json`:
  "A tappable control smaller than 44px in its smallest dimension" → *flag as a
  required change*), and `DESIGN.md` says buttons are `min-h-11`. WCAG 2.5.8
  (AA) is 24px and **is met**; this is a house-floor failure, not an AA failure.
- **Recommendation**: give the three text buttons the public row's padding
  (`px-3 py-3`) or a `min-h-11` box, or extend the hit area with a
  pseudo-element if the row must stay visually light. Prefer the shared shape so
  the two rows cannot drift apart again.
- **Suggested command**: `$impeccable adapt`

### [P2] F2 — Five places exist twice in the directory

- **Location**: live `places` table.
- **Measured**: `Genesee Park and Playfield`, `Madison Park`,
  `Rainier Beach Community Center`, `Seward Park`, `Yesler Community Center` each
  have **2 rows**, with coordinates within ~0.0005–0.002° (~50–230 m) of each
  other. `Rainier Beach Community Center` and `Genesee Park and Playfield` are
  near-identical pairs.
- **Impact**: a parent browsing the directory sees the same park twice, and the
  photo-sourcing run reports two entries for one place (visible in
  `.scratch/place-photo-sourcing/report.md`: “Genesee Park and Playfield” twice).
- **Not caused by this batch** — it is seed data — but it is a launch-visible
  directory defect, and it is cheap to fix before the store submission.
- **Recommendation**: decide per pair (merge, or keep as genuine entrances), then
  delete/merge the duplicate rows. Check for playdates attached to either row
  first (`playdates.place_id`).
- **Suggested command**: none — a data decision.

### [P2] F5 — The onboarding area card's radius select is 41px tall

- **Location**: the area card (card 4 of 4, "Where do you live?") —
  `src/pages/OnboardingPage.tsx`, the radius `<select>` in the area card block.
- **Category**: Accessibility / Responsive.
- **Measured**: `358×41` at 390×844; not flagged at 1440×900 (its box is ≥44
  there). 3px under the house floor.
- **Impact**: small, and a native `<select>` brings the OS picker on tap, which is
  why this is P2 and not P1 — but it is the last control before the feed, and the
  floor is a house rule enforced elsewhere by `min-h-11`.
- **Recommendation**: `min-h-11` on the select, the same as its neighbours.
- **Suggested command**: `$impeccable adapt`

### [P2] F3 — Three of the repo's own design lanes cannot pass where they run

- **`scripts/layout-width-check.mjs`** visits
  `/playdate/00000000-…` **signed out** (its own docblock says the signed-out
  shell is what is measurable without credentials). That route renders the
  not-found page, which has **no nav**, so `nav … null` fails 10 of its 13 checks
  at every width. Measured independently: the nav **is** present and the tab
  targets **are** ≥44px on every signed-in surface in this audit. This is the
  "a check nobody can pass is a check nobody reads" class the repo has already
  paid for once (the 16-red-push streak).
- **`scripts/dark-mode-check.mjs`** — its "card surfaces stay light" check is
  annotated in its own source as RED on `/login` "and always has been" (the page
  was deliberately de-carded). Recorded as accepted-red, but it still prints FAIL.
- **`scripts/focus-trap-check.mjs`** SKIPs without a drop-in id *and* without a
  signed-in session ("no Report control found on this page (signed out?)"), so the
  report-dialog trap is unmeasured by that lane as run.
- **Impact**: none on families. It matters because these are the lanes that would
  catch F1, and two of them are red for reasons unrelated to the product — which
  is how a real regression hides.
- **Recommendation**: point the width lane at a signed-in route (or at `/login`'s
  own shell and drop the nav assertions there), let the dark-mode lane treat
  `/login` as de-carded, and let the trap lane reuse the marker session.
- **Suggested command**: none — lane maintenance.

### [P3] F4 — The detector's one runtime finding is the boot splash

- **Location**: `scripts/design-detect.mjs` → `[text-occlusion] p.font-display
  .text-2xl.font-bold "Drop In" is 67% covered by overlapping text`.
- **Measured** (`.scratch/launch-audit/occlusion-probe.mjs`): at t=300ms the splash
  (`div.fixed.inset-0.z-50`) is on screen and the wordmark it draws overlaps the
  login form beneath it; at t=1500ms the splash is gone and the element is no
  longer found. **It is the boot splash, which is an overlay by design — a false
  positive.**
- **Recommendation**: let the detector wait for the splash to clear before it
  measures text occlusion.

### Known-open defects, verified rather than repeated

| # | Defect | Verified how |
|---|---|---|
| 1 | Reaction pill under the 44px floor | `src/lib/db.ts:5534-5540` — `flex h-7 … px-2` = **28px** tall. Fix by extending the hit area, not the drawn pill. |
| 2 | Tab trapped in the photo editor while the crop dialog is open | `src/components/ModalShell.tsx:143` — `useFocusTrap(dialogRef, true)` is unconditional; the crop dialog is portalled outside that node, so the outer trap keeps pulling focus back. |
| 3 | `messages` has no DELETE policy | Live `pg_policies` for `messages`: **`messages_insert_sender_participant` (INSERT)** and **`messages_select_participants` (SELECT)** only. Cleanup that deletes messages removes nothing, silently. |
| 4 | Specs hardcode `localhost:4173` | **31** `e2e/*.ts` files today (the record said 29), so a private port only covers the specs using the config's `baseURL`. |
| 5 | `design-detect` and the nightly live-e2e lane are red | `design-detect` re-run here: 22 unaccepted findings (21 source + F4). Nightly not run in this session. |

## Positive findings

- **Zero horizontal overflow** in all 18 measurements (6 routes × 2 viewports for
  the marker, 3 cards × 2 for onboarding).
- **Zero console errors and zero 4xx responses** on the repeat pass; one transient
  401 on the feed in the first pass, not reproduced (a 3-hour-old stored session's
  token refresh is the likely cause).
- **Every sub-44 flag on `/settings` is a labelled wrapper** — the per-kind
  notification rows, the email opt-out, quiet hours and the three theme radios all
  sit in hit areas of 44px or more (measured, not assumed).
- **No `<img>` without `alt`** anywhere in the six surfaces; **no real text input
  under 16px** (the three 14px hits are `sr-only` radios inside 44px labels).
- **No hard-coded colour** in any of the eight surface files; the only hex
  literals in `NewPlaydatePage.tsx` are inside comments recording a measured
  contrast figure.
- **Heading structure is sound**: exactly one `h1` per surface, and `/settings`
  runs `h1 Settings → h2 Notifications → h3 …` without a skip.
- **The empty feed now offers a door** — the measured DOM carries “Find something
  to do nearby”, “See what’s around”, “Widen to 20 miles” and “See everything in
  Seattle” (v31-1, live).
- **Onboarding cards 2 (name, with the photo picker), 3 (kids) and 4 (area) are
  clean** at 390 and 1440 apart from F5: no overflow, no console errors, and every
  input bound to a 358–768px label.

## What this audit did NOT measure

Stated so the gaps are not mistaken for passes.

1. **Visual craft.** This session's model has no image input — I did not look at
   the 18 screenshots; I measured the DOM. The screenshots are in
   `.scratch/launch-audit/screens/` for a human (or a vision-capable reviewer).
2. **Contrast on signed-in surfaces.** `mobile-audit.mjs` measures contrast, but
   only on signed-out routes.
3. **Populated states.** The live database has **0 upcoming drop-ins**, so the feed
   measured is the empty state, the profile has **no posts**, and the drop-in
   measured has **no comments**. A feed card row, a comment thread and a populated
   profile were never rendered.
4. **Gestures.** No synthesized touch: the map's drag/pan, the crop editor's
   framing drag and scroll-position behaviour are untested here.
5. **Dark mode on signed-in surfaces.** The dark-mode lane visits `/login` only.
6. **Keyboard traversal.** No Tab-order walk on any of the six surfaces.
7. **Onboarding card 1** (`/login`) is covered by `mobile-audit.mjs`, not here.

## Recommended actions

> **✅ STATUS, appended 2026-10-05 (the same day, later).** The two real findings
> are FIXED, and the coverage gaps below are partly closed — the audit is left
> standing as written, with this note rather than edits, so the measurements it
> records stay the measurements that were made.
>
> - **F1 — FIXED** (`a9dc8a6`): the signed-in detail page's Share / Add to
>   calendar / Report are `inline-flex min-h-11` and **measure 44px** (were
>   45x26, 119x26, 51x26). The same commit fixed the 28px reaction pill by giving
>   the BUTTON 44px (`h-11 -my-2`) around the unchanged 28px drawn pill — and the
>   negative margin is load-bearing: a plain `h-11` added 16px to every message
>   row and `e2e/inbox-thread-geometry.e2e.ts` caught it.
> - **F5 — FIXED** (`a9dc8a6`): the onboarding area card's radius select carries
>   `min-h-11` and **measures 44px** on a fresh signup (was 358x41).
> - **F2 — STILL OPEN, and it is a data decision, not code:** five places exist
>   twice in the live directory (Genesee, Madison Park, Rainier Beach CC, Seward
>   Park, Yesler CC), at coordinates within ~50–230 m of each other.
> - **F3 — PARTLY CLOSED:** the shell checks that `layout-width-check.mjs` could
>   never pass now run — and are proven able to fail — in
>   `scripts/signed-in-audit.mjs`, and that lane now covers gaps 2 and 5
>   (signed-in contrast is still unmeasured; see below).
> - **Coverage gaps 1 and 6 are now partly covered by a LANE rather than a
>   reading:** `scripts/signed-in-audit.mjs` measures the same surfaces × 3
>   widths and screenshots them, and refuses to report a pass with no session
>   (`NOT MEASURED`, exit 2). Gaps 3 and 4 remain: the live database still has no
>   upcoming drop-ins, so no populated feed has been rendered, and no synthesized
>   touch has been exercised.

1. **[P1] `$impeccable adapt`** — the signed-in detail page's three text buttons
   (F1): restore the 44px floor the public row already has. Same pass: the
   onboarding radius select (F5).
2. **[P2] decision, not code** — the five duplicated places (F2).
3. **[P2] lane maintenance** — the three lanes in F3, so the next real regression
   in this family is visible.
4. **[P3] `$impeccable polish`** — after 1–3, one pass over the six surfaces.

---

## ✅ ADDENDUM, 2026-10-05 late — THE DATA-DEPENDENT GREEN BREAKS, AND HERE IS THE INSTANCE

Written by the orchestrator, **not** an edit of anything above: the measurements
this audit made are the measurements it made, and they stay as they are.

**Gap 3 above ("populated states… no populated feed has been rendered") is not a
theoretical gap. It was hiding a real defect, and the lane found it the moment the
feed had a post in it.**

`scripts/signed-in-audit.mjs` run against a build of this tree
(`E2E_BASE_URL=http://localhost:4191`) now exits **1 with three failures, one per
width**, all the same element and all on `/`:

```
FAIL phone-390x844  feed all targets >= 44px — a 133x19 "See past drop-ins"
FAIL tablet-768x1024 feed all targets >= 44px — a 133x19 "See past drop-ins"
FAIL desktop-1440x900 feed all targets >= 44px — a 133x19 "See past drop-ins"
```

It is `src/pages/FeedPage.tsx:1564-1571` — the archive door the V9 ticket 04
placed under the day sections, a `<Link>` inside a bare
`<p className="text-center text-sm">` with no sibling text. Two consequences, both
measured rather than argued:

- **The repo's own 44px Floor Rule is broken on the feed**, and WCAG 2.5.8's
  inline exemption cannot rescue it because there is no sentence around the link
  to be inline *with*.
- **This audit's green was possible only because the feed was EMPTY.** The link
  renders inside the branch that exists when the viewer has posts; on an empty
  feed the `RadiusEmptyState` branch replaces it and the element is not in the DOM.
  So §"Positive findings" is correct about the DOM it measured and silent about
  the DOM it could not — which is exactly what gap 3 said, now with a name.

**Not repaired here:** the element lives in `src/pages/FeedPage.tsx`, another
session's uncommitted file. The fix is one line of the repo's standard idiom
(`inline-flex min-h-11 items-center` on the link, or on its wrapper).

**And one thing this exercise exposed about the LANE, which is F3's family.**
`signed-in-audit.mjs:34` defaults to `http://localhost:4180`, and this box has had
a stale `vite preview` on `:4180` since 17:07 — so the FIRST run of this check
measured an hours-old build and reported two `nav is a left rail` failures that do
not exist in this tree. That is the same class the V32 `E2E_BASE_URL` change closed
for the e2e specs (a local check silently measuring the wrong build), still open in
this lane's DEFAULT. Pass `E2E_BASE_URL` explicitly, or make the default fail
loudly when the port is already served by something else.

