SENTINEL: V33-0C-OCR-ROUND2-P8N6

**v33-0, FIX ROUND 2/5 — `ocr` round 2.** Resume your own work; same slice, same
file. `ad738cc` is HEAD and stands. All five findings below are in
`e2e/place-filters.e2e.ts` and all five are defects in the gate itself — which is
the deliverable, so they count.

Repo: `~/Projects/playdate-app`. **Do not push.** Append a "FIX ROUND 2" section
to `.scratch/v33-0-report.md`; reply with:

```
Sentinel: V33-0C-OCR-ROUND2-P8N6
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-0-report.md
```

Two of these are **my** brief's fault, not yours — say so in the report rather
than defending the brief.

---

## 1 (MEDIUM) — the clip gate passes VACUOUSLY when the chips are gone

`querySelectorAll('[data-testid^="place-kind-chip-"]…')` matching **zero**
elements leaves `offenders === []`, the poll resolves immediately, and the gate
is **green** — even though "the filter row still renders at 390px" is exactly
what it exists to pin. A regression that deletes the chip row would pass.

**Fix:** assert the row and a non-empty chip set BEFORE the clip check, e.g.
`place-kind-chip-row` visible and `place-kind-chip-*` count `> 0` (the row's own
pinned count assertion lives in `e2e/places.e2e.ts:3238` — you need only
*non-empty* here). A gate that cannot fail is not a gate: this is the same class
of defect as a vacuous absence assertion.

## 2 (MEDIUM) — the "snapshot covers every row" assertion is TAUTOLOGICAL (my brief's fault)

`locator.evaluateAll` returns **exactly one value per matched element** by
contract, so `allCountTexts.length === countRows.count()` can never be partial.
Its only possible failure is a race between the two calls — a spurious flake, not
a coverage failure. I asked for it; it does not do what I said.

**Fix: delete it.** The poll above it is the real assertion. Do not replace it
with another shape of the same tautology.

## 3 (MEDIUM) — the descendant walk false-positives on inline boxes

For `display: inline` boxes `clientWidth` is **0** while `scrollWidth` is
engine-dependent, so a non-clipping inline `<span>` can be flagged. Guard the
check: only test a descendant when it actually has a layout box
(`clientWidth > 0`, i.e. skip inline/zero-width boxes), or compare only for
elements with a non-inline computed display. Keep the button itself in the check
regardless.

## 4 (LOW) — the tolerance drifts: named `TOLERANCE` in one gate, a bare `+ 1` in the other

Hoist one module-level constant and **pass it into both** `page.evaluate`
callbacks (`page.evaluate((tol) => { … }, TOLERANCE)`). Two spellings of one
number is the drift this repo hunts.

## 5 (MEDIUM) — the gate silently excludes the rest of the same row

The 390px scroll row also renders, with the identical `whitespace-nowrap shrink-0`
pill styling and therefore the identical clip risk:

- `place-kind-placeholder-*` (the Food/Cafe and Zoo/Animals pills),
- `place-coffee-filter`,
- `place-coffee-nearby` (the door).

Its failure message says *"the 390px filter row"*, so the claim is wider than the
check. **Fix:** cover the whole row's pill controls, not just the `place-kind-chip-*`
prefix — either by adding those testids explicitly, or by sweeping the row's
children. Use an explicit, enumerated selector rather than a wildcard that could
later sweep in a container: the scroll container itself must stay **exempt** (its
overflow is the "still side-scrolls" feature).

---

## Acceptance criteria for this round

1. **Mutation proof for the vacuous-pass guard:** remove (scratch) the chip row,
   or the `place-kind-chip-row` testid, and show the spec **failing**; revert and
   show `src/` clean.
2. **Mutation proof survives the widened selector:** the `w-24 overflow-hidden`
   chip mutation from round 1 still fails the spec, naming the chip.
3. The tautological assertion is gone, the tolerance has one definition, and the
   gate's failure message and its selector agree.
4. `npm run verify` exits 0: **91 files / 2689 tests / 88 warnings / 0 errors ·
   GUARDS exit 0**.
5. `e2e/place-filters.e2e.ts` passes **twice in a row** on your private port
   (marker minted there; 4210–4218; kill by port/PID).

## Landmines (unchanged)

Stage by path only — never `git add .`/`-A`; never touch `vite.config.ts`,
`src/dev/AgentationDev.tsx`, `CONTEXT.md`. Pre-existing failures not to claim:
`feed-empty-state.e2e.ts:301`, `places.e2e.ts:2655`, the flake
`places-map-view.e2e.ts:730`.
