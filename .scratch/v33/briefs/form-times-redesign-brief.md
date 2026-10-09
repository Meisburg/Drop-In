# B2-1: form-times-redesign — SENTINEL FORM-TIMES-REFERENCE-P5M8

## The founder's words (annotation `mv0d2y3o`, /new, 2026-10-09)

> "I'm not sure what's the best way to give you feedback regarding how to
> redesign the form here regarding like the times. So I'm going to give you a
> screenshot to refer to." (reference: `clip_20261008_194254_1.png`)

The reference is a familiar event-form layout: a **labeled "Start date" field
with a calendar icon**, a **labeled "Start time" field with a clock icon**, a
**"PDT" timezone readout** beside them, and an **optional "+ End date and
time" toggle** for the end. The app's current `whenBlock` (V33 slice 7b) is a
bordered "When" section with a "Start" row (native date input + a −/time/+
stepper strip) and an "End" row (a second stepper strip), end ALWAYS visible.

## ORCHESTRATOR DECISIONS (do NOT re-litigate)

**D1 — Keep the 30-minute stepper for the time, add LABELS + the timezone readout.**
The stepper is the load-bearing control (`TimeStepper`, 15+ e2e specs drive it by
role name "Earlier/Later start time" / "Earlier/Later end time"; `/new`'s window
rule `stepWindowEnd` rides on it). Do NOT replace it with a native `<input
type=time>` or a picker sheet. Redesign the VISUALS:
- "Start" row: a visible "Start date" label above the date input (calendar icon
  may prefix the value area); the stepper strip keeps its `−` / `time` / `+`
  shape and its aria-labels (e2e contract), restyled to read as "Start time".
- A small timezone readout, ONE LINE: `formatTimezoneAbbr(nowIso)`-style
  output (e.g. "PDT") derived from the device's runtime zone via
  `Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })` on the mount-time
  `nowIso` — never a second source of time. Testid `start-timezone-readout`.
  It is a READOUT, not a control (no tz picker — the app already stores
  "the moment the parent meant, whatever their timezone"; a picker would be a
  NEW schema of decisions, out of scope).

**D2 — The END folds behind a toggle on /new only.**
On `/new`: the "When" section shows Start (date + time) and a single toggle
button "End date and time" (testid `end-toggle`, `aria-expanded`). Collapsed =
default (a drop-in has one required input: the start). Expanded reveals the END
stepper strip + the existing "other end moved" note. The end total stays
computed from `durationMinutes` (30-min minimum preserved) exactly as
`stepWindowEnd` does today — the toggle only hides the second row, it never
changes the value model. Branches 2/3 (location-first page, `/edit`) keep
`startBlock` + `durationBlock` VERBATIM (the pinned byte-identical contract) —
the toggle lives in the `/new` branch's whenBlock only.

**D3 — No copy implies a fixed length** (the standing rule from V33 7b): no
"How long", no "1h". The toggle reads "End date and time", not "How long".

## Files

- `src/components/PlaydateFormFields.tsx` — `TimeStepper` restyle (labels
  "Start date" / "Start time"), the timezone readout line, the end toggle in the
  `/new` branch's `whenBlock`. Keep the ONE-COPY rule: `startBlock` stays the
  single source of the start control.
- `src/pages/NewPlaydatePage.tsx` — only if the toggle needs page-level state
  (the "when" section is component-owned; prefer keeping it in the fields
  component with a local `useState(false)`).
- e2e: the "Earlier/Later" role names survive (aria-labels unchanged). Add/adjust
  specs for: timezone readout visible + matches the device zone; end toggle
  collapsed-by-default on /new; expanding it reveals the end stepper; collapsed
  end still posts a valid window (30-min floor).

## Acceptance

1. /new: "Start date" labeled, date input with calendar affordance; "Start
   time" stepper strip restyled; ONE-LINE timezone readout beside it (e.g. PDT).
2. End collapsed by default behind the "End date and time" toggle; expanding
   shows the end stepper; the 30-minute minimum and `stepWindowEnd` rules are
   byte-identical (no value-model change).
3. /edit + location-first: byte-identical (their branches untouched).
4. All 15+ existing "Earlier/Later" e2e specs pass unchanged (aria-labels kept).
5. Gate: typecheck + `npm run verify` (steering-lint's 3 stale pointers are the
   only permitted red) + units + e2e (`post-fast.e2e.ts`, `post-edit-delete.e2e.ts`
   and the new specs) on a private port, BOTH `BASE_URL` and `E2E_BASE_URL` set.

## STOP condition

If you find the end toggle needs a persistent "show end" PREFERENCE (not a
per-render state), STOP and report — that is a new schema decision.