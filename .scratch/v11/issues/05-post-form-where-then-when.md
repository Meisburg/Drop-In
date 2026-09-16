# 05: Post form — WHERE, then WHEN (no wizard)

**What to build:** On /new, surface WHEN (start date + the time stepper) in
the VISIBLE flow, directly after the place (WHERE) block and before the
duration chips. Kids + the remaining extras (address, details, repeat, age)
stay inside the collapsed "More options" disclosure. Single page, progressive
reveal — NOT a 4-step wizard. /edit keeps today's layout byte-identical.

**Why:** Founder judgment call (V11): the form should read "where, then
when, then who's coming." A wizard was proposed and rejected — it fights
the pinned post-fast tap budget (a cold /new must still post in ≤4 taps) and
the ~20 e2e specs that drive the disclosure.
GROUNDING NOTE (flag to the founder): /new ALREADY leads with WHERE
(`locationFirst`, V9 t01) and date/time/duration already live in the form —
the REAL delta this ticket ships is pulling WHEN out of "More options" into
the visible flow (a parent setting a time today has to open the disclosure
first; after this ticket they don't).

**Status:** TODO

## Mechanics (pinned)

- `src/components/PlaydateFormFields.tsx`: `startBlock` (lines ~538-561: the
  date input + `TimeStepper`) currently renders INSIDE the "More options"
  disclosure body. Move it to the visible flow: after the place block
  (the `locationFirst`-driven picker block), before the duration-chips block
  (line 563+). Wrap it in the same section-label style the place block uses
  (a small `text-sm font-semibold text-slate-700` "When" label). Keep the
  `startBlock` markup itself unchanged (same `data-testid`s, same TimeStepper
  behavior, same default-today-at-next-clean-time logic).
- The disclosure body then contains: address, details, repeat, age (and kids
  ONLY in the no-kids case — for parents with kids the picker is already
  surfaced above the disclosure by V10 t02, `KidsComingPicker`).
- Hint constants in `src/lib/feed.ts` (unit-pinned, V9 t03's "the hint must
  say what is actually behind the door" contract):
  - `MORE_OPTIONS_HINT` (with kids surfaced) "A date, an address, details, or
    a weekly repeat." → "An address, details, or a weekly repeat."
  - `MORE_OPTIONS_HINT_WITHOUT_KIDS` "A date, an address, kids, details, or a
    weekly repeat." → "An address, kids, details, or a weekly repeat."
  - Update the unit tests that pin these strings + any spec that asserts them.
- /edit: `EditPlaydatePage` does NOT pass `locationFirst`/`summaryLines` —
  it keeps today's disclosure layout untouched (the V10 t02
  "byte-identical /edit" precedent).
- E2E facts the builder must respect:
  - The collapsed disclosure UNMOUNTS its body (PlaydateFormFields.tsx
    lines 721-724: "its contents UNMOUNT when it closes"). So today, any
    spec that drives the date/stepper opens the disclosure first via the
    idempotent `openMoreOptions(page)` helper (`e2e/fixtures.ts` lines
    188-216; reads `aria-expanded`, opens if collapsed, called by 20+ specs).
    AFTER this ticket the date/stepper are visible, so:
    - Specs that fill `input[type="date"]` WITHOUT asserting it lives in
      `more-options-body` keep passing unmodified (the helper's open-call
      becomes a harmless no-op).
    - Specs that assert date/stepper INSIDE the body MUST be updated:
      `post-fast.e2e.ts` lines 562/578/587/593/651 (the "everything else
      behind the door" audit), and any `more-options-body` scoping in
      post-location / post-edit-delete — grep `more-options-body` in `e2e/`
      for the full list.
    - `kids-surface.e2e.ts` lines 120/176 pin the two hint strings → update
      to the new constants.
    - post-fast's tap-count invariants (the ≤4-tap AC, lines 308-394, plus
      the touched-controls ledger lines 177-213): the cold path still posts
      in ≤4 taps (it never touched the disclosure for time — the date
      defaulted); verify the ledger's expected control set, and if a control
      moved out of the disclosure update the ledger's comment, not the
      budget.
- Nothing changes in the submit path, validation, or the post row's shape.

## Acceptance criteria

- [ ] /new with `locationFirst`: visible flow reads title-line → place
      (WHERE) → "When" (date + stepper) → duration chips → "More options"
      (address, details, repeat, age; + kids only for no-kid parents).
      Setting the time no longer requires opening the disclosure.
- [ ] /edit markup byte-identical to today's (no `When` section surfaced;
      date still behind the disclosure).
- [ ] Both hint constants updated + unit-pinned; no spec asserts the old
      hint strings.
- [ ] post-fast: cold /new still ≤4 taps + one typed place; full e2e suite
      green (updating ONLY the assertions this ticket's AC declares).
- [ ] `npm run build && npm run test` exit 0.

**Migration check:** NONE. `supabase/` untouched.

**Depends on:** nothing (but touches the same component as V10 t02's kids
section — review both together).