# Slice 8b — fresh-context review, ROUND 3

**Verdict: NEEDS_CHANGES.**

**DISCLOSURE (required): I am a sibling model, not independent.** Same model family as the builder, and the
builder's report was handed to me as an input. Everything below that is not a *measurement I ran in this turn* is
weak evidence, and I mark what I ran. No code file was modified; every probe ran in throwaway copies under `/tmp`
against throwaway roots, and this report is the only file I wrote.

**Range.** `7f5d9fa..87405ce` (round 3: `slice-8b.md`, `factory-guard.check.mjs`, `factory-guard.mjs` — all
additions plus the re-worded claim set), plus `f3b7d25` (the orchestrator's D-033 correction: `factory/decisions.md`
and the two round-2 report files; decisions-and-reports only, so the mechanism under review is unchanged by it).

## What I ran (raw, this turn)

| command | result |
|---|---|
| `node scripts/guards/factory-guard.mjs` | `671 of the 671 recorded occurrence(s) matched this scan (LOST COVERAGE 0)`; `669 fenced block(s) read, 2 range summaries checked`; `PASS` — exit 0 |
| `node scripts/guards/factory-guard.check.mjs` | `factory-guard check: all 130 checks passed.` — exit 0 |
| static `check(` call sites / loop expansion | 122 call sites; separators (4 entries) +3, sweep (6 entries) +5 = **130** — matches the run |
| the six round-3 sweep seeds, each against the committed guard over a throwaway root | **6/6 CAUGHT** (exit 1 with `covers 7 entries`), mutants PASS — table below |
| the four absorber directions (recorded path / new path / fabrication at a recorded path / second occurrence) | absorbed, fires, **absorbed and silent**, fires — table below |
| emptied-map copies of all **three** baselines, clean root | BARE_HEAD exit 1 + `recorded baseline is EMPTY`; TRANSCRIPT exit 1 + `quotation baseline is EMPTY`; **UNRESOLVABLE_SHA exit 0, PASS, `0 recorded unresolvable-sha record(s) absorbed`** |
| re-derivation of both committed maps (empty the map in a copy, run over the repo, parse its findings) | BARE_HEAD derived **437 keys / 671 occurrences == committed** (missing 0, extra 0, changed 0); TRANSCRIPT derived exactly the two committed sites |
| the same-line-label input round 2 measured | still ESCAPES — exit 0, `NOTHING was compared` |

I did **not** run `npm run verify` or any e2e spec. The report's verify block is specific and falsifiable and I
reproduced every guard-side line of it plus the checker total; I take the Test Files/Tests/oxlint numbers as
specific and unverified by me.

### The six new sweep seeds, run one by one (my measurement)

| seed | input | exit | verdict |
|---|---|---|---|
| indented line between | `# zz` / `proof — raw:` / a 4-space-indented line / fence holding `✓ 7–13 zz-spec.e2e.ts (all six legs)` | 1 | CAUGHT |
| HTML comment between | same, with `<!-- a comment between -->` as the separator | 1 | CAUGHT |
| two labels before one fence | same, with `another — raw:` added | 1 | CAUGHT |
| block in a `~~~` fence only | `~~~text` opener, `~~~` closer | 1 | CAUGHT |
| label on the `~~~` fence line | `~~~raw:` opener | 1 | CAUGHT |
| label on the ``` fence line | ```` ```raw: ```` opener | 1 | CAUGHT |

All six carry the same detection mutation (`assumesAgreement`) and the mutant PASSES with the seed present —
which I verified indirectly by running the whole harness (the loop asserts `caught.exit === 1 && /covers 7
entries/ && missed.exit === 0`, and every one of the six lines is green in the 130/130 run), and directly for the
seed shapes above by running the committed guard myself.

### The absorber, four directions (my measurement, throwaway roots)

| world | exit | what fired |
|---|---|---|
| recorded path + the recorded text | 0 | nothing (absorbed), `LOST COVERAGE 1` printed |
| recorded path + recorded text **and** a NEW path quoting the SAME text | 1 | only the newcomer fires |
| a FABRICATION written at the recorded path (same text) | 0 | nothing — the declared boundary, silent |
| the recorded path with the recorded text **twice** | 1 | the second occurrence fires (the record is a COUNT) |

## Adjudication — one line each

- **BLK1 — HOLDS in the three locations the claim lives in; NOT HOLDS in the harness.** The header
  (`factory-guard.mjs:98-106`), the docblock (`:1663-1677`) and the ceiling bullet (`:1647-1650`) now say exactly
  what the four directions above measure — no over-claim left there, and no *under*-claim either (the boundary
  sentence "Closing the path half would need a defence this rule deliberately does not carry" is a design
  statement, not a reach claim) — but the harness still asserts the blanket property in its own words at
  `factory-guard.check.mjs:1510-1512` and `:1538` (non-blocking, below).
- **BLK2 — HOLDS for both baselines it names.** The empty record is a FINDING for `BARE_HEAD_BASELINE`
  (`:1526-1531`) and for `TRANSCRIPT_QUOTATION_BASELINE` (`:1794-1799`); each has a seed and a mutation whose exit
  code moves (measured by the harness run: `exit 1 -> 0`), and the seed's assertion requires the *finding's own
  message*, so an unrelated failure cannot make it green.
- **BLK2, the class — NOT complete.** The third baseline of the same form (`UNRESOLVABLE_SHA_BASELINE`, `:1531`)
  keeps the 0-of-0 state, measured reachable with a PASS (blocking, below).
- **BLK2, the partial-loss half — HOLDS as declared and is honest.** `LOST COVERAGE N` is exactly
  `size − absorbed`, never negative, printed on every run with a record; the docblock now states that it is a
  snapshot and not a tripwire, and gives the structural reason (this map covers THIS corpus, a fixture root is not
  it, so a fatal partial loss would redden every temp-root run). It is not "the next zero-is-not-a-finding hole
  wearing a declaration": a partial loss is not zero, the declaration does not claim it gates, and the number is
  printed rather than implied.
- **NB1 — HOLDS, and it is a measurement, not a sentence.** `112 → 120` was round 2's count; round 3 states
  `130`; I measured 130 (122 call sites + 8 loop expansion) and the harness prints `all 130 checks passed`.
- **NB2 — HOLDS as a declaration.** The docblock at `factory-guard.mjs:1678-1685` now says both the printed number
  and the re-derivation rule are PROCESS promises the guard cannot enforce, and that the empty case gates instead.
- **NB3 — HOLDS.** `slice-8b.md:738-741` and the docblock carry the correction; the transcript note's word is
  `ABSORBED` (`:1801`).
- **NB4 — HOLDS, and the reason is true of the code.** The early return really does precede the counter
  (`factory-guard.mjs:1742-1770`: `if (count === span) continue` before `absorbed += 1`), and the note prints
  `ABSORBED`.
- **NB5 — HOLDS for the six seeds and the count; the disposition sentence about the ambiguous shape overstates.**
  The round-1 sweep named eleven shapes; round 2 measured the harness carrying five (four separators + the
  blockquote seed); round 3 adds the other six (`factory-guard.check.mjs:1389-1414`), which is exactly eleven
  harness seeds — I counted the loop entries and ran them.
- **NB6 — HOLDS.** `slice-8b.md:728-734` now pastes only the real line and *describes* the conditional clause as
  measured in a copy instead of labelling a synthesized second line verbatim.

## BLOCKING FINDINGS

### BLK3 — [MECHANISM, `ladder:` D-030 zero-is-not-a-finding] the third baseline keeps the 0-of-0 state that round 3 closed for the other two, and a run over it exits 0

Round 3 added the empty-record finding twice:

    factory-guard.mjs:1526-1531   if (BARE_HEAD_BASELINE_SIZE === 0) { fail('no-bare-head-count', 'the recorded baseline is EMPTY …') } else { console.log(… LOST COVERAGE …) }
    factory-guard.mjs:1794-1799   if (TRANSCRIPT_QUOTATION_BASELINE_SIZE === 0) { fail('transcript-summary-agrees', 'the quotation baseline is EMPTY …') }

The third baseline in the same file, same form, same seam, has neither:

    factory-guard.mjs:1531
      console.log(`  note — count-provenance: ${UNRESOLVABLE_SHA_BASELINE_SIZE} recorded unresolvable-sha record(s) absorbed (historical lane records that QUOTE a probe seed, by re-derivation); a NEW unresolvable sha, or a second occurrence of a recorded one, is a finding${absorbed === UNRESOLVABLE_SHA_BASELINE_SIZE ? '' : ` — ${absorbed} of the ${UNRESOLVABLE_SHA_BASELINE_SIZE} matched this scan`}`)

Measured (emptied-map copy over a clean throwaway root — the same seam `emptyMapCopy` uses; I verified the helper's
regex matches this map too):

    exit 0
      note — count-provenance: 0 recorded unresolvable-sha record(s) absorbed (historical lane records that QUOTE a
             probe seed, by re-derivation); a NEW unresolvable sha, or a second occurrence of a recorded one in the
             same file, is a finding
      ok — 5 model(s), 8 task kind(s), 1 work item(s); … no count's provenance sha unresolvable beyond the recorded records …
      PASS

That is the exact sentence shape round 2's BLK2 called vacuous — `0 of 0` reading as fully covered, over the
maximal version of the failure the record exists to catch — and the claim list publishes a universal over it
because `provenanceChecked` is true whenever a repo resolves, regardless of there being a record. Round 3's own new
comment names this map as the same mechanic (`factory-guard.mjs:1683-1685`: "the mechanic `no-bare-head-count` and
`UNRESOLVABLE_SHA_BASELINE` already use"), so the class reasoning is already in the file.

Nothing re-runs this baseline either: `grep -in "unresolvable" scripts/guards/factory-guard.check.mjs` reaches only
the rule's firing checks — there is no seed, no mutation and no empty-state check for this record.

**Finding paid twice, so it belongs one rung down:** the fix is not a third hand-written `if`. It is one shared
form — a loop over the three baselines (name, size, clause, empty-state finding), the way the mutations in this
same harness are looped (`factory-guard.check.mjs:1389-1414`) — so the fourth baseline cannot be added without the
empty state coming with it.

## NON-BLOCKING FINDINGS

- **NB-a [FALSE CLAIM, `ladder:` same class as round 2's BLK1, third site]** `factory-guard.check.mjs:1510-1512`
  — *"UNFORGEABILITY … A baseline entry must NOT be reachable by writing a file: the key carries the FILE, so the
  same text in a new file is a new key and still fires."* — and `:1538` — *"the FILE in the key is what makes the
  record unforgeable"*. Both are flatly contradicted by the boundary round 3 declared, and by my measurement:
  a fabrication written at `.scratch/v28/reports/slice-8a-verify-5.md` exits 0, silent. The justification clause
  given supports only the new-path direction. The word reached the header, the docblock and the ceiling and did
  not reach the harness's own sentences.
- **NB-b [UNDER-DECLARED BOUNDARY + small FALSE CLAIM]** `slice-8b.md:942` — *"The review's reading of my ambiguous
  'label inside the fence's opening line' is the unfenced ceiling — now declared and seeded as such."* Declared:
  yes, the ceiling names unfenced content (`factory-guard.mjs:1635-1638`). Seeded as *that shape*: no — the seeded
  input is the indented member (`factory-guard.check.mjs:1613-1627`), and the member round 2 read (a fence marker
  preceded by text on the same line) still escapes: measured exit 0, `NOTHING was compared`, and no seed carries
  it. Declared family, unseeded member, and the ceiling's examples ("prose, a table cell, an inline code span") do
  not name the mid-line-marker member.
- **NB-c [MECHANISM, small]** `factory-guard.check.mjs:69-76`: the JSDoc that documents `mutatedGuard` now sits
  directly above `emptyMapCopy`, so `mutatedGuard` (`:99`) has no docblock — an orphan this diff created by
  inserting the helper between them.
- **NB-d [MECHANISM, small]** The transcript claim-list gate (`factory-guard.mjs:1861`,
  `if (rawSummaryLines) claims.push(...)`) — the thing that stops the universal claim being published over zero
  comparisons — is re-run by no check. Check 16 (`factory-guard.check.mjs:385-401`) covers the same property for
  the headers claim only. At zero range lines the run prints `NOTHING was compared` and passes: declared and
  printed, but an edit dropping the gate would keep the harness green.
- **NB-e [FALSE CLAIM, out of the builder's lane, for the orchestrator]** `factory/decisions.md:947-948` still
  carries the over-claim in the ruling's own voice — *"a fabricator cannot produce a baselined citation from a
  report — they would have to edit the guard, which is a reviewed diff"* — twelve lines above the correction that
  declares it false (`:958-966`). The correction matches the mechanism; the sentence it corrects is still
  asserted, un-annotated, at the point of assertion, and the correction is inserted mid-list (items 1, 2, the
  correction paragraphs, then 3) and contains `promiseed`. The builder declared it could not touch `factory/` —
  honest.

## "Which set did I just stop watching?" (D-030/D-025, applied to round 3)

1. **The three baselines' zero states** — watched for two of three (blocking BLK3).
2. **The path-occupancy direction** — declared, seeded, and now measured by me in both directions; it is the one
   reachable content-chosen shape left (see the one-question answer).
3. **The six sweep shapes** — now seeded, and I confirmed all six.
4. **The unseeded member of the unfenced ceiling** (a mid-line fence marker) — still unseeded (NB-b).
5. **The claim-list gate at zero comparisons** — unwatched by any check (NB-d).
6. **`factory/`'s original over-claim** — corrected below itself, still standing above (NB-e).

## Requirements traceability

| requirement | status | evidence |
|---|---|---|
| BLK1 — over-claims lowered to the measured boundary, boundary in docblock + header + ceiling | **met in those three** | `factory-guard.mjs:98-106`, `:1647-1650`, `:1663-1677`; four directions measured |
| BLK1 — no remaining over-claim | **not met (non-blocking)** | `factory-guard.check.mjs:1510-1512`, `:1538` (NB-a) |
| BLK1 — no new under-claim | **met** | no sentence asserts less than the mechanism does; the boundary clause is the only design statement |
| BLK2 — empty record a FINDING for both baselines, seed + exit-moving mutation | **met** | `:1526-1531`, `:1794-1799`; emptied-map probes exit 1 with the finding's own message; neutered copies exit 0; harness 130/130 |
| BLK2 — partial loss honest as declared | **met** | `LOST = size − absorbed`, printed every run with a record; reason is structural and stated (`:1678-1685`) |
| BLK2 — the zero-is-not-a-finding class closed | **not met** | third baseline, `:1531`, measured PASS (BLK3) |
| NB1 | **met** | 130 re-measured two ways |
| NB2 | **met** | docblock states snapshot + process promise |
| NB3 | **met** | report `:738-741`; note prints `ABSORBED` |
| NB4 | **met** | `:1742-1770` ordering verified; note wording changed |
| NB5 — six shapes seeded, each with a detection mutation; count correct | **met** | `factory-guard.check.mjs:1389-1414`; 11 harness seeds == the round-1 sweep's eleven; all six CAUGHT by my own run |
| NB5 — the ambiguous shape "declared and seeded as such" | **partially met** | family declared, member unseeded (NB-b) |
| NB6 | **met** | `slice-8b.md:728-734` |
| Baselines derive exactly; forward-only | **met** | emptied-map derivation reproduces both maps (437/671 and the two sites), 0 missing / 0 extra / 0 changed; `LOST COVERAGE 0` printed for both |
| Gate green | **met** | guard exit 0 and checker 130/130, both run by me; no lane report edited by round 3 (diff touches three files) |

## The class hunt: claims the mechanism does not support, and zeros consumed as health

- **A claim the mechanism does not support:** `factory-guard.check.mjs:1512` and `:1538` (the record is
  "unforgeable") — the mechanism absorbs a fabrication at a recorded path, measured. Third site of round 2's BLK1
  class; non-blocking because the authoritative locations are clean.
- **A measurement that comes back empty and is consumed as health:** `UNRESOLVABLE_SHA_BASELINE` at 0 recorded —
  measured exit 0, PASS, claim published (blocking BLK3). Second-order, same family: the transcript claim gate at
  zero range lines is unwatched (NB-d).
- **A claim in the ruling doc that the mechanism does not support:** `factory/decisions.md:947-948` (NB-e).

## The one question: is there a fifth shape, or is the rule sound?

**A fifth shape is reachable, and there is exactly one — it is the one round 3 declared.** The exact input:

    file:   .scratch/v28/reports/slice-8a-verify-5.md          (a RECORDED path)
    body:   # x
            (fenced block) > ✓ 7–13 zz-spec.e2e.ts (all six legs) (fenced block)

measured: exit 0, no finding, no clause. That is D-033's path-occupancy boundary: the *location* the content is
written to chooses whether the rule looks, because the key carries a path and a path is writable. It is no longer a
mis-described shape — it is declared in the docblock, the authoritative header and the ceiling list — but it is
still a shape, and it cannot be closed without machinery this rule deliberately does not carry.

**What is NOT reachable is any fifth *exemption* inside a fenced block.** Inside one, the rule compares every
range/count pair it can parse and the only absorber is the record; outside one, every escape I could construct is a
named ceiling (indented run with no marker, a marker not at line start, the count-before-range / split-count
shapes, the scan set), and the three repairs that each opened an escape before are gone by deletion rather than by
a fourth condition. So on the shape question the rule is sound: it reads everything it says it reads, it attributes
nothing, and it absorbs only through a record whose boundary is declared. I could not construct an undeclared fifth
shape, and I tried the four classes that broke it before (a syntax exemption, an attributed region, a
printing-only defence, a claim the record cannot keep).

**The reason I still cannot call it clean is not a sixth shape — it is the third instance of the zero-state class
(BLK3).** The rule is trustworthy; the baseline family around it is not yet uniform.

## Recommended next action

Give the empty-record finding one shared form across all three baselines (`BARE_HEAD_BASELINE`,
`TRANSCRIPT_QUOTATION_BASELINE`, `UNRESOLVABLE_SHA_BASELINE`) with one check per baseline — the rung below the
second instance-patch — and delete the blanket "unforgeable" clauses at `factory-guard.check.mjs:1511-1512`/`:1538`;
everything else I measured holds.

**DISCLOSURE, repeated:** sibling model, not independent. The measurements above are the evidence; the report's
prose is an input I am judging, not corroborating.
