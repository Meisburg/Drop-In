# Slice 5 — FIX ROUND 1 (resume the original builder)

**Your report was the strongest of this batch and the verifier passed the gate exactly** (exit 0, 69 files,
2014 tests, 81 warnings/0 errors — and it ran the browser spec **three** times plus `loop-closing` twice,
choosing that spec *on evidence* because it rides the shared setup *and* crosses the card you replaced).

**The reviewer then found three blocking problems, and the first one is the rule this slice exists to enforce.**

---

## B1 — [BLOCKING] The shipped Places line claims content that is not there

`src/lib/firstRunTour.ts:85`:

```
detail: 'look up parks and playgrounds, and see their hours and where they are',
```

**Both halves are measurably false in this repo:**
- **Hours coverage is 26/239 rows** — the migration says so itself (`0059_place_hours.sql:23`: *"Measured
  coverage is thin: 26/239 rows"*), and the app renders the honest fallback *"Nothing here is open right now —
  or we don't have their hours yet."* (`PlaceDirectory.tsx:1149`).
- **`kind='park'` holds ZERO rows** — which is why the app **withholds the park chip entirely** (*"a chip for
  either could only ever come back empty"*, `places.ts:175-190`) and shows *"No "Park" places in the directory
  yet."*

**So the run's last card promises a brand-new parent hours for 89% of places that have none, and a category the
app itself says is empty.** The reviewer's verdict, which I am adopting verbatim: *"This is r1's 'Here are a
few real places near you' in a softer voice, on the one card whose acceptance is strictest — and it is
*further* from the acceptance than the plan's own intent for that line ('where you could host', `plan.md:179`)."*

**You obeyed the letter of the rule (no "places near you") and broke its spirit.** That is worth reading twice,
because the rule was never about a word.

**THE FIX:**
- **Move toward the plan's own intent** — *where you could host* — because **hosting is a capability and
  capabilities are true regardless of the data.**
- **MEASURE every noun before you name it.** The kind distribution is in `places.ts:243-248`. **Name only
  kinds that actually have rows.** Do not guess which; read the distribution and say in your report what it is.
- **Promise no hours** unless you can phrase it as a capability that is honestly available.

## B2 — [BLOCKING] The test bans the WORD, not the CLAIM — and the class needs the guard, not a longer list

`src/lib/firstRunTour.test.ts:96-97` asserts the card does not match `/\bplaces?\b/i`. **`firstRunTour.ts:85`
passed that test while making the claim**, because it says "parks and playgrounds".

**And the companion blocklist (`firstRunTour.ts:128-136`) is nine literal strings written by the same author as
the copy it polices.** It already missed this one, and it bans `what's happening near you` while your shipped
Drop Ins line (`:73`, *"see what parents near you are putting on"*) is a near-synonym the plan itself blessed.
**A blocklist authored alongside its own copy is a spell-checker, not a guard.**

**RULING, and it is not "add another string":**
- **This round, make the copy TRUE (B1) and make the test assert a property rather than a vocabulary.** The
  property that would have caught this: **every noun the card names corresponds to rows that exist**, checkable
  against the same kind distribution the app uses. If you can express that locally, do; if a local version would
  be theatre, **say so and leave it** — do not build a bigger blocklist.
- **The repo-wide guard is now slice 6's**, whose `FIRST_RUN_COPY` field guard is the same shape. **Its brief
  already carries the row with an instruction to stop and report rather than overreach.** **Do not try to close
  the class here.**

## B3 — [BLOCKING] The evidence does not exist in the record

The ledger's slice-5 entry carries **no `npm run verify` exit code, test-file count, test count or lint
counts** — every prior slice's entry in the same file does, and your brief demanded them verbatim. **Your
mutation claim ("5 of 9 unit tests failed") is a paraphrase with no raw output.**

**AND THE THIRD LANE FAILED, WHICH NOBODY NOTICED:** `.scratch/ocr-slice-5.json` reads
`"status": "failed" — "0 finding(s); 5 of 5 selected item(s) failed"`, because `ocr` was still pointed at a
local server that is down. **Its silence was read as cleanliness.** (I have repointed it and re-run it; the
fault for reading it that way is mine, not yours — but **the lesson belongs to both of us: a lane's STATUS must
be read, not its findings count.**)

**For this round: put the counts AND the pasted red in the REPORT and in the COMMIT MESSAGE.**

---

## Also fix these three, all small and all yours by the batch's own rules

- **`e2e/fixtures.ts:409`** still describes the card you deleted: *"the run's OWN finish card on /onboarding (up
  to 3 real places near the parent…)"*. You caught the docs but missed **the shared helper — which this batch
  treats as a per-slice obligation.**
- **`src/lib/places.ts:1601-1602`** still calls `withinRadius` *"the app's existing radius predicate"* while your
  diff **removed that import**; the name now survives only inside that comment. The reviewer's words: *"this
  slice made strictly worse."*
- **The Profile line over-claims too.** It names two capabilities that are one flow: the only production driver
  of `searchProfilesByName` is the co-parent link form (`ProfilePage.tsx:362`; the name and `@handle` fields sit
  in the same section). *"Find another parent by name"* as a standalone discovery feature **does not exist**.
  Reword it to what is true.

## And correct one claim you made (not code)

Your report argues the ending card now renders **ahead of the `loadError` branch** and that it is *"unreachable
in practice"*. **That argument is unsound:** `homeZipSet` derives from the **DB profile read**
(`db.ts:188,292`), **not from a save in this mount**, so `runOver && loadError` **is** reachable for a returning
profile whose `loadZipCodes()` fails. **The ordering is pre-existing and the behaviour is correct** (the tour
needs no read, so the removed error line had nothing to report) — **so nothing changes; just state it
accurately.** A wrong reason attached to right code is how the next reader gets misled.

## Acceptance

1. **Every noun and every promise on the card is true of the app as it is**, with the kind distribution quoted
   in your report as the evidence.
2. The Profile line no longer over-claims.
3. The local test asserts a **property**, or you say plainly why it cannot.
4. The fixture and the `places.ts` comment are corrected.
5. `npm run verify` exits 0 — **report exit code, test files, tests, lint errors AND warnings, and paste the
   raw red from at least one mutation** — in the report **and** the commit message.

## Verify

As above plus `signup-zip-fallback`, `zip-radius`, `loop-closing`. **Three named flake modes — re-run once
before reporting any** (`no-bypass-guard`, `places.e2e.ts:2759`, vite-4173/trace-artifact-ENOENT; free 4173
**by port** and `--trace=off` if you hit the third). **Never poll for a background job** — foreground, or keep
the PID and `wait $PID`. Kill listeners **by port**.

## Report

**Committed as: `<sha7>`**, the kind distribution you measured, what you changed on each item above, and the
counts **including lint warnings** — report and commit both.
