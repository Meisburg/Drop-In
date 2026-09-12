# Builder brief — V9 ticket 03 (the twenty-second post: three decisions, rest behind "more")

Repo: `/home/jmeisburg/Projects/playdate-app` ("Drop In" — Vite + React + TS +
Tailwind PWA on live Supabase).
You are the ONLY writer: never run a git command that writes (no
commit/checkout/stash/branch/reset). **This ticket has NO migration** —
`supabase/migrations/` must not change; say so in your report with a diff guard
(`git status --short supabase/migrations` must be empty).

## ONE DEVIATION ALREADY DECIDED BY THE HUMAN — read this before the ticket
The ticket's first AC is pinned to "pick a place, tap a **window chip**, tap
Post", but the window chip is V9 ticket **02**, which 03 declares itself blocked
by, and 02 carries an unconfirmed product judgment call (approximate times must
suppress the "Happening now / Starts soon" badges). The human decided: **build 03
against the EXISTING time control and leave 02 for later.** So in this ticket:

- "tap a window chip" becomes **tap a duration chip** (the existing `1h / 1.5h /
  2h / 3h` chips are the visible time decision and the second of the three).
- "the exact-time controls from ticket 02" becomes **the existing date input +
  the 30-minute start stepper** (`PlaydateFormFields.tsx` `TimeStepper`).
- Everything else in the ticket stands, including the interaction budget.

Report this as the ticket's one deliberate wording deviation, quoting it.

## Read first, in this order
1. `.scratch/v9/issues/03-post-fast.md` — THE SPEC (ACs; read it with the
   deviation above applied).
2. `.scratch/v8/spec.md` — the house discipline (no test weakened, findings
   reported, red-by-design specs).
3. **The tree as V9 ticket 01 left it** — do not work from the ticket's
   description of `/new`. Ticket 01 made the place picker the first, obvious
   field with a visible browse affordance and REMOVED the neighbourhood select.
   Read `src/pages/NewPlaydatePage.tsx`, `src/components/PlaydateFormFields.tsx`,
   `src/lib/feed.ts` (`validatePlaydateForm` , `generatedTitle` may not exist
   yet, `PLAYDATE_DURATIONS_MINUTES`, `durationLabel`, `formatTimeLabel`,
   `defaultStartDateIso`, `nextSlotMinutes`, `suggestedDurationMinutes`),
   `src/pages/EditPlaydatePage.tsx`.
4. `e2e/fixtures.ts` (`stepStartTimeOnce`, `settleOnRoute`) and
   `e2e/quick-post.e2e.ts` — the newest spec that drives `/new`, and the
   race-proof assertion style this repo expects.

## What to build
A post that is **three decisions** with everything else behind ONE disclosure:

- `/new` opens as a **summary** — the day, the time answer and the place, read
  back as text ("Saturday · 1h · Green Lake Park") — with the three decisions
  inline: the place picker (ticket 01's), the duration chips, and **Post**.
- The **title** is no longer a required field with its own step: it is GENERATED
  (`Playdate at <place>`) via a pure `generatedTitle(place)` seam (trim, cap at
  80, never empty) and shown as an **editable line on the summary** — not as the
  first thing the parent must fill in. V8's `withDefaultTitle` behaviour becomes
  the default rather than a convenience. Keep the field's existing
  placeholder and the live n/80 counter so the specs that type a title still
  work.
- **More options** (one disclosure, collapsed by default) holds: the start
  DATE input + the 30-minute stepper, "Kids you're bringing", the address
  manual entry, Details, and "Repeat weekly". Report which you put there.
- **The read-back is exact**: the summary reads back the day, the duration (and
  the end time) and the place, so no hidden default changes what the parent is
  agreeing to. The pure seam `postSummaryLines(values)` is unit-tested with its
  strings pinned PER LINE.
- **Validation stays honest**: a place and a duration are the only required
  answers a parent must actively give; every other field keeps its current rule
  (so the title keeps its required + ≤80 rule — it simply never fires, because
  the summary seeds it from the place). Do not loosen a rule to make the flow
  convenient.
- `e2e/post-fast.e2e.ts`: counts the interactions from a cold `/new` to the
  feed (pin: ≤4 taps + 1 typed place) and asserts the summary's read-back
  matches what lands on the feed.

## Traps I verified myself — handle these, do not rediscover them
- **T1 — 21 spec files drive `/new`.** `address-maps`, `avatar`, `card-circles`,
  `comment-replies`, `comments`, `feed-empty-state`, `golden-path`, `guest-list`,
  `host-retention`, `host-status`, `kids-v3`, `loop-closing`, `places`,
  `post-edit-delete`, `profile-posts`, `push-subscribe`, `quick-post`,
  `share-public`, `weekly-series`, `while-away`, `zip-radius` — plus the new
  `post-location` from ticket 01. The AC is that they keep working **without
  editing their expectations**. A field that moved behind the disclosure is not
  an expectation change: open the disclosure in the spec. Put the "open More
  options if it is collapsed" step in **ONE helper in `e2e/fixtures.ts`** (e.g.
  alongside `stepStartTimeOnce`) so the churn is one function plus a call, and
  report exactly which specs you touched and why. `stepStartTimeOnce` almost
  certainly needs that helper internally — it presses the stepper `+`, which
  will be inside the disclosure.
- **T2 — do not break `/edit`.** `PlaydateFormFields` is SHARED with
  `EditPlaydatePage` (V8 ticket 05) and `e2e/post-edit-delete.e2e.ts` drives it.
  `/edit` must keep its exact current markup, control names and placeholders —
  it has no summary and no disclosure. Drive every new layout through props
  whose defaults preserve today's `/edit` rendering, and prove it by running
  that spec.
- **T3 — `mobile-audit.mjs` cannot cover `/new`.** (Recorded V8 ticket 01
  finding #5: it walks only the signed-out routes — `/login` and the public
  detail page.) So the AC "`scripts/mobile-audit.mjs` stays green at
  320/375/390/430 and both orientations, and every control on the summary is
  ≥44px" is satisfied on the signed-out routes BY the script, and the `/new`
  half must be asserted INSIDE the e2e at a 375×812 viewport (no horizontal
  overflow, every interactive control ≥44px, both collapsed and expanded). Say
  so explicitly in your report — do not claim the script covers a route it does
  not walk.
- **T4 — keep the mount-once discipline.** V8 ticket 01's pinned rule: ONE
  mount-time `now` feeds both the default start and the preset's label/values,
  so a control can never promise one time and write another. Your summary must
  read back the SAME values the submit will write — one source, not a
  recomputation per render.
- **T5 — the disclosure must not hide a required answer.** Duration is
  required (`durationMinutes: 0` = none picked yet) and it is one of the three
  visible decisions — keep the chips visible, with their existing labels
  (`1h`, `1.5h`, `2h`, `3h`) and their existing "Ends …" read-back. If you move
  the "Ends …" line into the summary instead, keep the text byte-identical
  enough that the existing assertions still pass, and report it.
- **T6 — `Repeat weekly` has its own spec** (`weekly-series.e2e.ts`, V8 ticket
  06, migration 0028). It toggles `data-testid="repeat-weekly"` and reads
  `data-testid="repeat-weekly-label"`. If you move it behind the disclosure,
  that spec gets the disclosure-open step — the testids and the semantics stay.
  Its pre-0028-apply red path (`data-testid="submit-error"`) must still be
  reachable.

## Required checks you run yourself
- `npm run build` — exit 0.
- `npm run test` — unit suite; report passed/total and new/changed files
  (including the new `postSummaryLines` / `generatedTitle` tests).
- `npx playwright test e2e/post-fast.e2e.ts e2e/quick-post.e2e.ts e2e/post-location.e2e.ts e2e/post-edit-delete.e2e.ts e2e/weekly-series.e2e.ts e2e/kids-v3.e2e.ts e2e/address-maps.e2e.ts`
- The FULL suite: `npm run test:e2e` (≈5-8 min, LIVE Supabase). Two known
  live-API flakes — `e2e/guest-list.e2e.ts` and `e2e/post-edit-delete.e2e.ts` —
  re-run each in isolation before reporting a failure as real.
- `node scripts/mobile-audit.mjs` against the local preview if the script needs
  a URL (report the exact command you used and its result).
- `npm run lint` (report warnings only on lines you changed).
- **Never weaken, delete or skip an existing assertion.** If an existing spec
  must change beyond opening the disclosure, quote the exact lines and justify
  them in the report.

## Marker hygiene
E2E mints `e2e-<epoch>` markers in the LIVE project. Make the new spec
cascade-safe and have it clean up its own rows best-effort with the marker's own
JWT. Do NOT run the sweep tool — the coordinator owns it.

## Report back, terse and structured
1. Files changed, with line counts, and the diff guard for `supabase/`.
2. AC-by-AC: met / not met / deviated, each with its evidence (command + output).
3. The interaction count: the measured taps/typing from cold `/new` to the feed,
   and how the spec counts them.
4. Gate numbers: build exit, unit passed/total, e2e passed/total, lint, and the
   exact list of specs you touched (with the reason for each).
5. Deviations and findings — the T1-T6 outcomes, the ticket-02 deviation above,
   anything you did not do, and anything the ticket did not anticipate. Report
   findings; do not paper over a failure.
6. The exact command the coordinator should run to reproduce your gate.
