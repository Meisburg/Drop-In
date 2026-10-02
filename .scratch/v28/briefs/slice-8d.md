# Slice 8d — the typed-zip family: an error nobody can see, and a capture that outlives its field

*(The last hygiene slice. **Two defects, one file.** Do not expand it — if a third subject appears, report it and
I will split.)*

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing.** Worktree
`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## What I measured, so you do not re-derive it

**⚠️ ANCHORS RE-MEASURED BY SYMBOL on this tree before dispatch, and EVERY ONE OF THEM HAD DRIFTED** — the
first draft's numbers were off by **+15 early and +28 late**, because the file grew above them. Use the SYMBOL:

`src/pages/OnboardingPage.tsx`:

```
:896  async function handleAreaFinish() {
:898    const typedZip = homeZip.trim()
:899    if (typedZip !== '') {
:900      const zipProblem = validateHomeZip(homeZip, knownZips)
:901      if (zipProblem !== null) {
:902        setZipError(zipProblem)
:903        return
:904      }
:905      await saveLocation(typedZip)
```

and the error's **only** render site:

```
:1607  data-testid="area-zip-fallback-note"      <- the note BLOCK
:1622    (zipError !== null ? 'border-red-400' : 'border-slate-300')
:1624    value={homeZip}                          <- the zip INPUT
:1635  {zipError !== null ? (
:1636    <p role="alert" id={errorId('zip')} ...>{zipError}</p>
```

**The error renders INSIDE the fallback-note block.** And slice 4 established that **an edited address
invalidates the note** (`:1518`, and the fix-3 pin leg at `:1546-1548`). So the shape is:

## Defect 1 — an error set where nobody can see it

**Reachability claim, and you must VERIFY it before fixing anything** — a fix for an unreachable state is theatre,
and this batch has already paid for one "fix" that was pure theatre:

> type an **invalid** zip while the note is visible → then **edit the address**, so the note hides → then tap
> **Finish**.
> `handleAreaFinish` still sees `homeZip.trim() !== ''` *(slice 4 deliberately made the typed zip authoritative
> "REGARDLESS of note visibility" — see `:1530-1532`, and that decision is right)* → `validateHomeZip` fails →
> `setZipError` → **and the error renders inside a block that is no longer on screen.**
> **So the parent taps Finish and NOTHING HAPPENS, with no feedback at all.**

**If it is reachable, the parent is told — visibly, in the card, not in a hidden block.** `errorId('zip')` and
`fieldA11y('zip', zipError)` already exist; the question is *where the message lives*, not whether it exists.
**If it is NOT reachable, say so with the trace that proves it and change nothing.**

## Defect 2 — the capture outlives the field

`typedZip` is read from `homeZip` **at tap**, and then `await saveLocation(typedZip)` runs. **During that await the
zip input is not disabled**, so the parent can type a different zip while the first is being written — **the save
writes one value while the field shows another.** That is **the save-path face of slice 4's invariant**, which its
own fix already applied to the *address* path (`:930-950`, the re-check at the point of use) and **not** to the
typed-zip path.

**Slice 4's ruling is the precedent, and its two rejected shapes are worth reading before you choose** (`:936-941`):
it **refused to lock the field** for the duration of a Finish-initiated operation (*"a new stuck-state surface —
this batch has found three walls"*) and **chose a re-check at the point of use** instead — the re-check lives at
`:930-950` and is the `if (addressAtTap !== areaAddressRef.current) return` on `:950`. **Match that reasoning,
or beat it with a better one — and say which you chose and why.** Whatever you choose, **it must not create a
fourth wall**, and the parent must stay usable on every path.

## The invariant, stated once

**Every claim the card makes — what the map shows, what Finish WRITES, what the note says, and any error it
raises — corresponds to the CURRENT field text, or to nothing.**

## Acceptance — demonstrate each, both halves

1. **Defect 1's reachability is settled** — by a browser trace if reachable, or by a stated trace if not. **Both
   answers are acceptable outcomes; an unstated one is not.**
2. **If reachable: the parent sees the error where they are looking** — and the fix does not move the error into a
   block that can hide again. **Show it visible with the note hidden.**
3. **Defect 2 fixed** by the shape you chose, **with the shape's rejection of the alternatives stated**.
4. **A non-vacuity proof for each**: mutate the fix and **show the test failing**; restore and show it passing.
   **Paste both.**
5. `npm run verify` exits 0.

## Verify

`npm run verify`; `e2e/signup-zip-fallback.e2e.ts` **×3** (it is the spec that owns this path, and
`docs/agents/browser-lanes.md`/the batch rule wants ≥3 on a fix-pinning spec); `e2e/zip-radius.e2e.ts` once.
**The card's zip path has four fix rounds of pins already in that spec — do not loosen any of them to make room.**

**Four named flake modes** — re-run once before believing any red: `no-bypass-guard`,
`e2e/places.e2e.ts:2759`, vite-4173 / trace-artifact-ENOENT, teardown `close()` throwing *"Target page, context or
browser has been closed"*. Kill listeners **by port**, never `pkill -f`.

## Report

- **`Committed as: <sha7>`** — or *"not committed"* and why; **an absent field is read as evidence.**
- Files changed with `+/-` counts.
- **Defect 1's verdict, with the trace** — reachable or not.
- **Defect 2's chosen shape, the alternatives you rejected, and why** (slice 4's reasoning is the bar).
- Both halves of each acceptance run: **raw output tails.**
- `npm run verify`: exit code, test-file count, test count, lint errors **and warnings**.
- Anything the brief did not anticipate — **say it rather than quietly fixing it.**
