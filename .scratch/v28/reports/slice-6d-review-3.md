# Slice 6d — FRESH-CONTEXT REVIEW, ROUND 3 (the fix-round-2 diff)

**Verdict: NEEDS_CHANGES**

**Reviewed range:** `git diff efeeeda a6d72f6` in `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`.
`git diff --name-only efeeeda a6d72f6` returns exactly four files:
`.scratch/v28/reports/slice-6d.md`, `scripts/guards/copy-taxonomy-guard.check.mjs`,
`scripts/guards/copy-taxonomy-guard.mjs`, `scripts/guards/factory-guard.mjs`. `factory/decisions.md` is **not**
in the range (it was rewritten at `efeeeda`, the base); D-028/D-030 were read as context, not as diff.

**DISCLOSURE (required, D-007/D-015): I am a sibling model, not an independent one.** I am the same model
family as the builder that produced this slice. This is a same-family reading, not independent verification.
Every factual sentence below carries the command I ran inline so it can be re-checked without trusting me.

My round-2 review (`.scratch/v28/reports/slice-6d-review-2.md`) returned NEEDS_CHANGES on B2b (mechanism),
B1b (stale pointers in D-030), N1 (a wrong number), N2 and N4. The round-2 fix claims B2b, N1, N2, N4 fixed
and B1b closed by the orchestrator. What follows adjudicates that claim and then audits what round 2 ADDED.

---

## 0a. What I ran (raw, this round)

| command | result |
|---|---|
| `node scripts/guards/copy-taxonomy-guard.mjs` | **exit 0**, `scanned words: 9 (Park, Playground, Indoor play, Museum, Pool, Splash pad, Library, Beach, Trail)`, `declared claims: 3` |
| `node scripts/guards/copy-taxonomy-guard.check.mjs` | **exit 0**, `all 29 checks passed, 0 failed, across 26 guard invocations (8 of them against a mutated copy of the guard), against scripts/guards/copy-taxonomy-guard.mjs` |
| `npx oxlint scripts/guards/copy-taxonomy-guard.mjs scripts/guards/copy-taxonomy-guard.check.mjs` | no output, **exit 0** |
| `node scripts/guards/factory-guard.mjs` | **exit 0**; `note — no-bare-head-count: baseline holds 642 recorded occurrence(s)` |
| `bash scripts/guards/run-all.sh` | **exit 0**, `GUARDS: PASS — all deterministic rules hold.` |
| 12 throwaway trees under `/tmp/rev3` (a copy of `src/`, guard run with that root) | see §0c — the sweep table, falsified |
| a patched copy of the check (`/tmp/rev3/check-test.mjs`) whose `mutate()` derives from a **different** file | the identity check goes **red** — N2 is falsifiable (see §0b) |

I did **not** run `npm run verify` (my shell does not run the suite). The gate's `npm run verify` row is
therefore **attested, not reproduced**, and I say so rather than paraphrasing it as mine. `node`, `run-all.sh`
and the guards I did run.

---

## 0b. The five adjudications, one line each

- **B2b — HOLDS.** `scripts/guards/copy-taxonomy-guard.mjs:499` (`if (claimsUnchecked.length > 0) {`) makes an
  unscannable DECLARED claim a finding, and the mutation proves the counter is why: I copied the guard, replaced
  `if (claimsUnchecked.length > 0) {` with `if (false) {`, ran both on a tree with the `beach` case deleted, and
  got `EXIT=1` with the finding (unmutated) vs `EXIT=0` + `PASS` while `the declared kind "beach" is not
  scannable` was still printed (mutated). The finding's own words are reachable and true.
- **N2 — HOLDS (the replacement can actually fail).** `check.mjs:242-248`. I patched a throwaway copy so that
  `mutate()` derives from a *different* file (`let text = guardSrc` → `let text = readFileSync('/tmp/rev3/other-guard.mjs','utf8')`)
  and appended a drift line to that file; the check went **red**: `✗ the guard under test is
  scripts/guards/copy-taxonomy-guard.mjs (this repo) — and every mutation derives from that file's text`. The old
  `readFileSync(guard)===guardSrc` could not do that. Residual note, not a finding: the right-hand side is still
  the in-memory `guardSrc` const that `mutate()` also uses, so the conjunct proves mutate's output is a transform
  of that const's text, not that mutate re-reads the file — which is the same property, stated honestly.
- **N4 — HOLDS.** `guard.mjs:55-59` now says *three ways*; the third (`the label function names no word for it at
  all (no case and no default)`) is correct and reaches the per-kind line. Deleting the `default: return 'Place'`
  clause on a throwaway tree gives `EXIT=0` with
  `limit—— kind "other" is not scannable: the label function names no word for it at all (no case and no default)`.
- **N1 — HOLDS (deleted, not replaced).** `slice-6d.md:599-600` now reads *"The check count at the end of this
  round was 27 across 24 invocations, 7 of them mutated."* — the `one check … more than §2 recorded` arithmetic
  comparison is **gone**, per D-028 item 1. (§2's `23 checks … 22 guard invocations` at `slice-6d.md:408` is a
  historical snapshot and is left as one; the deleted sentence was the only wrong number.)
- **The lowered headline — HOLDS, with one stale clause beside it.** `guard.mjs:487-490` no longer says *"zero is
  a finding, in every direction"*; it says every measurement consumed as evidence must come back with something in
  it. I could not construct a **set the guard consumes as evidence that comes back empty and passes** — every
  `=== 0`/`length===0` measurement on the path is tripwired (§0c), and the two deliberate non-empties (§0d) are
  `fallback===null` (a value, not a set) and a shared word (an anomaly when NON-empty). But the header two lines
  above it still claims a print granularity the mechanism no longer has — see **F1**.

---

## 0c. The sweep table (`slice-6d.md:812-825`), audited — rows falsified

Every experiment is a throwaway `cp -r src /tmp/rev3/src` plus one edit, then
`node scripts/guards/copy-taxonomy-guard.mjs /tmp/rev3`; the guard resolves `typescript` and
`escapeForRegExp.mjs` from the repo, so only the scanned root moves.

| row | what I did | ran as | table claims | verdict |
|---|---|---|---|---|
| `allKindSet` (`PLACE_KINDS`) | `export const PLACE_KINDS = [ … ] as const` → `[]` | `EXIT=1`, `no PLACE_KINDS array of string literals — the taxonomy walk found nothing` | FAIL | **HOLDS** |
| `offeredKindSet` (`PLACE_KIND_CHIP_KINDS`) | chip kinds → `[]` | `EXIT=1`, `no PLACE_KIND_CHIP_KINDS array of string literals — without the offered set rule 2 cannot be asked at all` | FAIL | **HOLDS** |
| `labels` (`placeKindLabel`'s words) | renamed the function (`placeKindLabelGone`) | `EXIT=1`, `placeKindLabel yielded no kind word`, `scanned words: 0 (none)` | FAIL | **HOLDS** |
| `kindsByLabel` (scan set) | every case return rewritten to one shared word | `EXIT=1`, `scanned words: 0 (none)` + `the scan found NO word it can attribute to a kind` | FAIL | **HOLDS** |
| `claimsChecked` (declared claims rule 3 checked) | deleted the `case 'beach': return 'Beach'` pair | `EXIT=1`, `1 declared claim(s) this guard accepted as kinds could not be CHECKED by rule 3 … claims "beach"` | FAIL | **HOLDS** (via the complement; see F3) |
| `constsRead` / `claimsRead` | renamed every exported const; deleted `TOUR_TAXONOMY_CLAIMS`; set it to `[]` | all three `EXIT=1` (`the copy const "X" is not an exported top-level const`, `no declaration was read from any registered module`) | FAIL | **HOLDS** |
| `constsHere` (per module) | renamed every const in the five registered modules | `EXIT=1` with six per-const findings (`copy consts read: 4 of 4` → `1 of 2` etc.) | FAIL when one is renamed/deleted | **HOLDS** |
| the check's own premises | see N2; `collapseEveryWord`'s and `editFile`'s premise assertions are real (`check.mjs:397-404`, `:150-165`) | check exit 0 | FAIL as a seed failure | **HOLDS** |

The report's exact B2b repro also reproduces verbatim: setting the three DECLARED kinds' `case` returns to the
label function's own default gives `scanned words: 6 (Park, Indoor play, Museum, Splash pad, Library, Trail)` and
`FAIL — 1 finding(s)` (`slice-6d.md:762-773` — matches).

`offeredKinds ⊄ allKinds` is genuinely "not this guard's rule": the taxonomy's own test pins it —
`firstRunTour.test.ts:250` asserts `withheld.length === PLACE_KINDS.length - PLACE_KIND_CHIP_KINDS.length`, which
fails if a chip names a kind outside `PLACE_KINDS` (and `PLACE_KIND_CHIP_KINDS` is `satisfies readonly PlaceKind[]`).

**One row's stated reason is false — F2.** The `ambiguousWords` row (`slice-6d.md:821`) says the shared word *"is
printed per word"*. Round 2 **deleted** the per-word printer; the only limit lines now are per kind
(`guard.mjs:355`, `for (const { kind, why } of unattributableKinds)`). E.g. `park`+`indoor_play` sharing one word
gives two `limit—— kind "…"` lines and **no** `limit—— the word "…"` line. The behavior the row *claims to
excuse* (PASS) is right; the reason it gives for the visibility is stale.

---

## 0d. The two deliberately-non-failure rows — are the reasons REAL?

- **`fallback === null` (`slice-6d.md:820`) — real.** Deleting `default: return 'Place'` on a throwaway tree gives
  `EXIT=0` with `limit—— kind "other" is not scannable: the label function names no word for it at all (no case and
  no default)` — the third reason covers exactly the state the row names, and no other kind changes. The row's
  "a real shape" is arguable (a `PlaceKind | string` label with no default cannot satisfy its own `: string`
  return without a fallback) but the *mechanism* behaves as the reason describes, which is what the brief asks.
- **`ambiguousWords` (a word two kinds share) (`slice-6d.md:821`) — behavior real, reason partly false.** Two
  non-declared kinds sharing one word gives `scanned words: 7` and `PASS` — the row's "deliberately not a failure"
  is true, and a DECLARED kind on a shared word IS a finding (the counter). But "it is printed per word" is
  false (F2), and the array it is named after is **dead** (F3). The remaining clause — "named in `WHERE IT
  STOPS`" — is true (`guard.mjs:56-57`, *"two kinds resolve to the SAME word"*).

---

## 0e. The set round 2 STOPPED watching (D-030's hazard)

The answer to *"which set did I just stop watching?"* is **`ambiguousWords` itself** — the one set the sweep table
certifies as watched. Round 1's ambiguity was kept in an array and printed from it
(`for (const [word, kinds] of ambiguousWords)`); round 2 replaced that printer with the per-kind loop and left the
array behind:

    $ grep -n "ambiguousWords" scripts/guards/copy-taxonomy-guard.mjs
    318:const ambiguousWords = []
    336:      ambiguousWords.push([word, kinds])

Two lines, no reader — the diff removed the only one. `slice-6d.md:821` then *asserts* it "is printed per word".
That is instance 4's shape exactly: a repair that changed one granularity left the set one line down unread, and
the round's own audit artifact certifies it as watched. (The *observable* reason is preserved — each ambiguous
kind still prints — so this is dead code plus a false claim, not a wrong exit code.)

A second, **coverage**-granularity version of the same hazard survives and is real but *declared*: `guard.mjs:492`
tripwires `kindsByLabel.size === 0` only. Collapsing the six non-declared kinds onto one shared word leaves the
three DECLARED kinds scannable:

    $ node scripts/guards/copy-taxonomy-guard.mjs /tmp/rev3   # 6 collapsed, 3 declared left
      scanned words: 3 (Playground, Pool, Beach)
    PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
    EXIT=0

Rule 4's coverage of those six kinds is gone while the run reports clean. The sweep table calls this deliberate
(`slice-6d.md:821`), so it is not a fresh hole — but the row's reason is stale, and no tripwire guards it. I found
**no set that comes back empty and is consumed as health**; the gap is coverage, not emptiness.

---

## 0f. Findings

**F1 — `ladder:` FALSE CLAIM (blocking).** `scripts/guards/copy-taxonomy-guard.mjs:60` still reads *"the guard
prints a `limit——` line per such kind or per shared word"*. This diff changed the mechanism to per-kind only
(`guard.mjs:355`) without changing that sentence. `git show efeeeda:scripts/guards/copy-taxonomy-guard.mjs` shows
the same clause was **true then** (the ambiguous printer existed); it is false now. The header is the
authoritative scope statement (`docs/agents/code-structure.md`, cited by D-028), and "a printed reason that is not
the real one is the same defect as a claim the mechanism does not support" is the sentence two lines below it. Per
D-028 the fix is to DELETE the clause (or restore per-word printing), not to restate it.

**F2 — `ladder:` FALSE CLAIM (blocking, same act as F1).** `.scratch/v28/reports/slice-6d.md:821` says the shared
word "is printed per word". It is not — round 2 removed that printer. This is the sweep table's reason for a
deliberate non-failure, and it describes a mechanism the diff deleted. Cite: `slice-6d.md:821` vs
`guard.mjs:355`.

**F3 — MECHANISM / scope: two orphans the diff created (blocking).**
- `scripts/guards/copy-taxonomy-guard.mjs:318` + `:336` — `ambiguousWords` is populated and never read; round 2
  removed its reader.
- `scripts/guards/copy-taxonomy-guard.mjs:365` + `:463` — `claimsChecked` is initialised and incremented and never
  read; the tripwire at `:499` reads `claimsUnchecked` instead. `slice-6d.md:817` names `claimsChecked` as the row's
  measurement, so the sweep certifies a variable the guard does not consult (the outcome is still correct via the
  complement — see §0c). `npx oxlint …` returns no output, so the gate will not catch either. "An orphan the diff
  itself created" is a scope defect by the review contract.

**F4 — FALSE CLAIM (non-blocking).** `.scratch/v28/reports/slice-6d.md:803` — *"with every word collapsed, B2b's
counter fires before B3's tripwire"*. Backwards: `guard.mjs:492` (B3) precedes `guard.mjs:499` (the counter), and
the all-collapsed run lists the B3 finding first:
`FAIL — 2 finding(s): - …the scan found NO word it can attribute to a kind… - 3 declared claim(s)…`.

**F5 — WRONG NUMBER (non-blocking, OUTSIDE the reviewed diff).** `factory/decisions.md:826` titles D-030 *"an
empty measurement read as a clean result (three instances, now a named class)"* over a table of **four** rows —
the entry that names the class and mandates deleting wrong numbers carries a wrong one. `git diff --name-only
efeeeda a6d72f6` excludes this file and `git show efeeeda:factory/decisions.md | grep D-030` shows the title
predates the range, so this is the orchestrator's text, recorded for the class hunt, not charged to the builder.

**F6 — UNDER-DECLARED BOUNDARY (non-blocking).** `guard.mjs:459` prints
`(whyUnattributable.get(kind) ?? 'the guard cannot attribute its word')`. When a DECLARED kind is absent from the
taxonomy, `whyUnattributable` (built only from `allKindSet`, `guard.mjs:345`) has no entry, so the run prints the
generic fallback rather than the real reason (the taxonomy lacks the kind) — the "reason that is not the real one"
shape, reachable whenever a declaration typo lands a kind not in `PLACE_KINDS`. The run still fails on rule 1, so
non-blocking.

---

## 1. Requirements traceability (the round-2 fix, `.scratch/v28/reports/slice-6d.md` §13)

| claim in §13 | status | evidence |
|---|---|---|
| a declared claim rule 3 cannot CHECK is a FINDING | **met** | `guard.mjs:499`; `/tmp/rev3` beach-blind → `EXIT=1`, and mutation `if (false) {` → `EXIT=0` |
| with a mutation proving the counter is why | **met** | check `B2b — MUTATION` check, green; independently reproduced |
| the round-1 check no longer pins the class green | **met** | `check.mjs:389-401` now requires exit 1 + the finding |
| N4: third unattributable case named, per-kind reason correct | **met** | `guard.mjs:55-59`, `:459`; default clause deleted → third reason, `EXIT=0` |
| N2: the tautological assertion is gone — it can fail | **met** | `check.mjs:242-248`; patched-`mutate` run goes red |
| N1: wrong number deleted, not replaced | **met** | `slice-6d.md:599-600`; comparison removed |
| the sweep closed every other empty set | **partially met** | 8 rows falsified as FAIL/behave-as-claimed; `ambiguousWords` row's reason false (F2), array dead (F3) |
| the tripwires' comment now says what it holds | **partially met** | `guard.mjs:487-490` universal is true of emptiness; `guard.mjs:60` still claims per-word printing (F1) |
| §13 gate numbers | **met where reproducible** | guard 0, check `29/26/8`, oxlint silent, run-all PASS, factory baseline 642 = 635+7; `npm run verify` attested |
| D-030 pointers name *what*, never *where* | **met** | `factory/decisions.md:854-858`; no line numbers in the entry (its title count is F5) |

## 2. Honesty check on §13

Every mechanism number I could reproduce is right: the `29/26/8` summary, the B2b pair (`scanned words: 6`,
`OLD_EXIT=0` / `NEW_EXIT=1`), the clean-tree line, the N4 before/after, the reworded limit lines, and the check's
own premise assertions. The deviations are the prose ones above (F1-F4) and the one class-shaped miss (F3). The
`npm run verify` row is the only unattested gate line and §13 labels nothing about it falsely.

## 3. Recommended next action

One correction pass, no mechanism rewrite: (1) delete *"or per shared word"* at `guard.mjs:60` and correct the
`ambiguousWords` reason at `slice-6d.md:821`; (2) delete the two dead arrays (`guard.mjs:318,336` and `:365,463`)
or wire `claimsChecked`; (3) fix the order sentence at `slice-6d.md:803`; (4) optional — give the rule-1-absent
declared kind its real reason at `guard.mjs:459`, and have the orchestrator retitle D-030 (`decisions.md:826`).
The mechanisms all hold; the repairs are one line each.

**Ladder note (D-025/D-030).** F1 and F2 are the same class round 1's B1 returned (a sentence about the mechanism
that does not resolve) and round 2's own subject (a printed reason that is not the real one), found again in the
text this round ADDED. F3 is instance 4's shape again — the repair stopped reading a set one line down. A fifth
hand sweep is what D-026/D-027 measured as non-converging; the durable form is to make the sweep table's rows
mechanically checked (each row's "printed per word" is a claim a one-line assertion could pin), not re-read.
