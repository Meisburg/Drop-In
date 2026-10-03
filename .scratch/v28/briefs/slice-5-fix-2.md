# Slice 5 — FIX ROUND 2 (resume the builder)

Your fix round 1 was the strongest work of this batch, and **the reviewer passed it**: *"Evidence honesty: commit
3215557 carries real output, not paraphrase."* Its five-item checklist came back **Yes / Yes / Yes / wording-yes
-assertion-no / Yes**, and I confirmed your hours correction **independently** (my own read: 239 total, 184 with
hours, 55 without, 164 city_default, 20 osm; `park 0`, `trail 0`).

Two lanes then found more, and **one of them is the best find of the whole slice.**

---

## R1 — [REAL, and this is the find of the slice] The tour body's positional claim is FALSE at md+

`ocr` flagged `firstRunTour.ts:55`; **I measured it, and it is confirmed**:

```
src/App.tsx:482  className="… fixed inset-x-0 bottom-0 … md:sticky md:top-16 md:z-0
                  md:h-[calc(100dvh-4rem)] md:border-r md:border-slate-200 md:border-t-0"
src/App.tsx:484  <div className="mx-auto flex max-w-md flex-row md:flex-col">
src/App.tsx:612  // parent <nav> becomes a left rail and this tab stacks vertically (md:flex-col)
```

**The bar is a bottom bar only below `md`; at `md`+ it is a sticky LEFT RAIL.** So if `TOUR_BODY` tells the parent
the controls are *at the bottom*, **it is wrong on every tablet and desktop — in the one card whose entire job is
telling a brand-new parent where the controls are.** This is B1's class exactly (a card asserting something untrue
of the app), on the card where being right matters most.

**Fix it so it is true in BOTH layouts** — either by describing the bar without placing it, or by naming both
positions. **Do not invent a third layout claim; describe what `App.tsx` actually does.**

## R2 — [REAL] The Drop Ins detail carries the same existential claim in softer words

`firstRunTour.ts:71`: *"see what parents near you **are putting on**"*. **This asserts that nearby drop-ins
already exist**, which is measured false for every parent today (zero upcoming drop-ins). **`ocr`'s words:**
*"This detail carries the existential presupposition the slice just removed, only reworded."*

**And the reviewer reached the same place from the other side**: it approved your shrinking of the ban list, then
warned that the *shipped* near-synonym walks past the ban. **You flagged that rather than choosing, and flagging
was right** — but both lanes agree the line itself over-claims, so **the flag is now answered: the wording
changes.**

**Apply the SAME rule that fixed Places: describe what the tab DOES, never what is IN it.** A capability survives
an empty database; an existential claim does not.

## R3 — [REAL] The negative half of the property has NO vacuity guard

`firstRunTour.test.ts:132-140` generates one `it()` per kind withheld from `PLACE_KIND_CHIP_KINDS`. **If that set
ever equals `PLACE_KINDS`** — e.g. a future slice re-adds the park chip once rows appear — **the loop emits ZERO
tests and the property silently degrades to the positive half alone.** The **positive** half has an explicit
vacuity guard (`named.length > 0`); the **negative** half has none. **This is the vacuity class this batch has
paid for repeatedly; a silent green is the failure mode it exists to prevent.**

**Add the guard, and prove it fires** — show the loop emitting zero and the guard failing.

**Same finding, second part:** the label is interpolated **unescaped** into `new RegExp` (`:137`, `:150`). A future
label with a regex metacharacter throws or over-matches. **Escape it.**

## R4 — [REAL] Your Profile assertion enforces SEQUENCE, not SUBORDINATION

`firstRunTour.test.ts:176-181` compares the **first-occurrence indices** of `"link"` and `"name"`. **So this
passes:** `"…link your partner's account. You can also search any parent by name"` — **which makes exactly the
standalone claim the test exists to prevent.** The structural cue that actually makes your shipped copy
subordinate is the em-dash elaboration and *"their"* binding to *"partner"*.

**Bind the two into the same sentence** (e.g. require both to occur before the first sentence terminator), or find
a stronger proxy — and **say which proxy you chose and what it still misses.**

## R5 — [REAL] The module header claims more than the test can support

`:109` and the header `:16-38` state the row fact flatly (*"Every noun here has rows behind it (playground 155 ·
pool 10 · beach 9)"*), but **the test's proxy is chip membership, not rows** (`places.ts:157-166` documents that a
shipped kind can go empty at runtime), so **the dated 2026-09-29 counts are unpinned and can rot with the suite
green.** The test's own docblock says this honestly; **the header phrases it more strongly than the test can
support.** Qualify the header to match the test.

**And `ocr` adds a sharpening you should fold in** (`:113`): the counts are of the **whole directory (239)**, but
the Places tab **defaults to a radius filter around the home zip** (`PlaceDirectory.tsx:266` sets
`distanceChoice` to `'profile'`). **So the counts justify that a KIND exists — not what a given parent will see.**
Say it that way.

## R6 — [REAL, and TWO independent lanes found it] The e2e spec hardcodes the tour's copy

`e2e/signup-zip-fallback.e2e.ts:185` restates strings that already exist as exports in `firstRunTour.ts`
(`TOUR_TITLE`, `TOUR_LINES`) — **so a legitimate copy change now needs three edits, and the browser leg fails for
a reason unrelated to zip fallback.** `ocr`'s fix-delta lane then flagged the *same* new pin as **duplicating the
unit-layer guard** (`:195`).

**Fix: import the constants in the spec instead of restating them, and keep exactly ONE browser pin.** A browser
pin earns its place only because it inspects the **rendered** card rather than the constant — **say that in the
comment, and derive the pattern from the exported guard data so it cannot drift.**

---

## Rulings — do NOT act on these, they are mine

- **`"pick where to host"` STAYS.** It is authorized by `plan.md:179`'s intent, and the Places tab is exactly
  where a parent chooses a place to host at.
- **The literal-word browser pin's EXISTENCE is fine** — a regression pin of a shipped-then-removed wording is a
  legitimate job, distinct from a claim guard. Only its duplication changes (R6).
- **The `places.ts:1601` finding — the CODE stands, the PROSE changes.** The inlined comparison is deliberate and
  documented; but the module header (`:10`, *"imported rather than reimplemented"*) is in tension with it. **Make
  the prose agree with the code** — do not refactor mid-slice.
- **The ledger evidence gap is mine to fix**, not yours.

## Acceptance

1. No line on the card asserts anything untrue **in either layout**, and none presupposes populated content.
2. The negative property cannot silently emit zero tests, **and you have shown it firing**.
3. The Profile assertion tests subordination, with its remaining limit stated.
4. Headers claim no more than the tests can support.
5. The e2e spec imports the constants; one browser pin remains.
6. `npm run verify` exits 0 — **counts in the report AND the commit, plus raw pasted red for the new guard.**

## Verify

`signup-zip-fallback` (×3 — it is the fix-pinning spec), `zip-radius`, `loop-closing`. **Do not poll for a
background job** — foreground, or keep the PID and `wait $PID`. Kill listeners **by port**. Three named flake
modes, re-run once before reporting any.

## Report

**`Committed as: <sha7>`**, plus: the new `TOUR_BODY` and Drop Ins wording, the proxy you chose for R4 and what
it misses, the vacuity guard's red output, and the counts.
