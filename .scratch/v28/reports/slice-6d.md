# Slice 6d — the repo-wide honesty guard (and where the climb has to stop)

**Lane:** builder (fresh context). **Worktree:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`,
branch `Meisburg/onboarding`. **Brief:** `.scratch/v28/briefs/slice-6d.md` (its re-measure banner is obeyed
below). **Report status:** written FIRST, appended as produced.

**Committed as:** `b92b83e` the rule in the build law · `327b8a5` the declaration · `13af7a2` the guard, its
check and the gate registration · `6b6a630` two needless escapes · `2c2bc23` this report's first commit ·
`79991bd` the accuracy fix · `f02245c` this report's final gate section · `64b6ac6` the §8 stat table · and the
commit that carries this line. **Not pushed** — production is V27 and this batch does not push mid-batch.
**Tree measured for every number below:** `6b6a630` plus this report (prose only); the final gate run is §9.
**Base I read:** `ba4dd93` (slice 6c close entry). While I was reading, the orchestrator committed `38eb722`
("work registry: initialize 6d/8a/8b/8c/8d …"), so the tree I built on is `38eb722`.

---

## §0 Baseline, measured before any edit — and it is NOT green

`npm run verify` at `ba4dd93`, run once before any edit. Raw output kept in `.scratch/v28/tmp/verify-baseline.log`
(uncommitted scratch) and quoted here, because a path is a weaker record than the lines:

| what | measured |
|---|---|
| exit code | **1** |
| build (`tsc -b && vite build`) | ran, no error (the chain reached the tests) |
| test files | `Test Files  71 passed (71)` |
| tests | `Tests  2067 passed (2067)` |
| lint warnings (`grep -c ': warning '`) | 81 |
| lint errors | 0 |
| `bash scripts/steering-lint.sh` | PASS — `ok — AGENTS.md (1789 words, ceiling 1800)` |
| `bash scripts/guards/run-all.sh` | **FAIL — 6 factory finding(s)** |

The six `factory-guard` findings at the base commit, verbatim:

```
  FINDING [lane-states-legal]: v28-r2-6d.json: lane 'acceptance' is in state 'pending', which is not a legal state for that lane
  FINDING [artifacts-exist]: v28-r2-6d.json: lane 'implementation' names artifact '.scratch/v28/reports/slice-6d.md', which is not on disk
  FINDING [lane-states-legal]: v28-r2-8a.json: lane 'acceptance' is in state 'pending', which is not a legal state for that lane
  FINDING [lane-states-legal]: v28-r2-8b.json: lane 'acceptance' is in state 'pending', which is not a legal state for that lane
  FINDING [lane-states-legal]: v28-r2-8c.json: lane 'acceptance' is in state 'pending', which is not a legal state for that lane
  FINDING [lane-states-legal]: v28-r2-8d.json: lane 'acceptance' is in state 'pending', which is not a legal state for that lane
```

**Five of the six are the scheduler registry's own state** (`factory/work/v28-r2-*.json`, committed by the
orchestrator as `38eb722`), which is the orchestrator's file, not this slice's — this builder does not edit it.
The sixth cleared the moment this report existed. **So the brief's stated expectation
(`bash scripts/guards/run-all.sh` → `GUARDS: PASS`) is not reachable from inside this slice at its own base
commit.** The raw result is recorded here instead of quietly absorbed, and the supervisor was told mid-flight
(the channel message is quoted in §7). The slice's own guard is proven independently of that: its own exit
code, its seeds, its mutations, and the per-guard line `run-all.sh` prints for it.

---

## §1 The items, found by SYMBOL first — and the numbers I had to re-measure

Every line number below was read out of the command that produced it, in the same call, with
`grep -n '<symbol>' <file>` and, for the base, `git show ba4dd93:<file> | grep -n '<symbol>'`.

| brief's item | symbol | brief said | measured at `ba4dd93` | re-measured after my edit (at `6b6a630`) | change |
|---|---|---|---|---|---|
| `firstRunCopy.ts` | `FIRST_RUN_COPY` | `:75` *(brief's own re-measure of `:27`)* | `:75` — **confirmed** | `:75` (file untouched) | none — enumerated into the guard's registry |
| `firstRunCopy.ts` | `FIRST_RUN_NUDGE_COPY` | `:123` *(brief's own re-measure of `:71`)* | `:123` — **confirmed** | `:123` (file untouched) | none — enumerated into the guard's registry |
| `firstRunTour.ts` | `TOUR_BANNED_COPY` | `:229` | **`:230`** — **the brief is one line off, and its banner did not flag this one** | `:257` (+27 lines from my own insert) | none — named in the coverage statement, not registered (it is a pin list, not rendered copy) |
| `firstRunTour.ts` | `TOUR_TITLE` / `TOUR_BODY` / `TOUR_PROGRESS_LABEL` / `TOUR_LINES` | not listed individually | `:102` / `:127` / `:99` / `:145` | `:103` / `:128` / `:100` / `:146` (+1 import line) | **registered** in the guard |
| `firstRunTour.ts` | *(new)* `TOUR_TAXONOMY_CLAIMS` | — | — | **`:205`** | **added** — the declaration the guard reads |
| `push.ts` | `NOTIFICATION_KIND_COPY` | `:63` "verified unchanged" | `:63` — **confirmed** | `:63` | none — registered |
| `theme.ts` | `THEME_CHOICE_COPY` | `:94` "verified unchanged" | `:94` — **confirmed** | `:94` | none — registered |
| `feed.ts` | `RADIUS_SAVE_REJECTED_COPY` | `:186` | `:186` — **confirmed** | `:186` | none — registered |
| `feed.ts` | `RADIUS_SAVE_FAILED_COPY` | `:199` | `:199` — **confirmed** | `:199` | none — registered |
| `.github/workflows/verify.yml` | the database-module quote | `:24-25` | `:24-25` — **confirmed verbatim** | `:24-25` | none — it is the measurement §6 leans on |

**Re-measured, and reported as re-measured:** `TOUR_BANNED_COPY` is at `:230`, not the `:229` the brief states;
the brief's own banner flagged `firstRunCopy.ts` and did not flag this one, which is the banner's point made
twice. Everything else the brief marked "verified unchanged" is still exactly where it says, and the two anchors
its banner had already re-measured are correct at `ba4dd93`.

**Items already done — evidence about the brief, not work.** None of the brief's items was already fixed; what
the brief *does* contain that I could not improve on is its banner: I re-measured both drifted anchors and both
are where its banner says. The one "nearest existing hook" it names — slice 6a's `FIRST_RUN_COPY` field guard —
is `scripts/guards/copy-field-consumption-guard.mjs`, already registered in both places of `run-all.sh`; this
slice adds a second guard beside it rather than changing it (its registry still judges exactly
`src/lib/firstRunCopy.ts`).

---

## §2 The declaration mechanism, the four rules, and both halves raw

**The mechanism, in one paragraph a reader can check.** A copy module declares the taxonomy kinds its words name
as an **exported top-level const holding an array of string literals** — kinds (`'playground'`), never labels,
never a category the app does not have. `COPY_MODULES` in the guard names that const per module, so the guard
reads a declaration rather than guessing one. Today one module carries one:
`TOUR_TAXONOMY_CLAIMS: readonly PlaceKind[] = ['playground', 'pool', 'beach']` at `src/lib/firstRunTour.ts:205`,
declared next to the words it is about, and typed so a kind the taxonomy lacks is also a `tsc` error.

**The rules over each registered module's copy consts** (the guard's own header carries the same list):

| # | rule | what it catches |
|---|---|---|
| 1 | a declared category must EXIST in `PLACE_KINDS` | a declaration naming a category the app does not have |
| 2 | a declared category must be OFFERED (`PLACE_KIND_CHIP_KINDS`) | a declaration naming a kind the app withholds |
| 3 | a declared category's word must appear in the copy | a declaration drifted off the words it is about |
| 4 | a word in the copy must belong to a declared kind | **the defect this guard was written for**: a withheld kind's word in copy, declared or not |

### The guard passes on the current tree (acceptance item 2)

`node scripts/guards/copy-taxonomy-guard.mjs` → **exit 0**, raw:

```
Copy-taxonomy guard — a category this copy names must be one the app has and offers
====================================================================================
  taxonomy: src/lib/places.ts
  kinds read: 10; offered: 8; words: 9
  scanned words: 9 (Park, Playground, Indoor play, Museum, Pool, Splash pad, Library, Beach, Trail)
  limit—— kind "other" is not scannable: its word resolves to the label function's own default, so a match could not be attributed to it (see WHERE IT STOPS in the header)
  module: src/lib/firstRunCopy.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)
  module: src/lib/firstRunTour.ts
  copy consts read: 4 of 4 named; declared claims: 3 (playground, pool, beach)
  module: src/lib/push.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/theme.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/feed.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)

PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
```

That includes slice 5's own tour card — `module: src/lib/firstRunTour.ts / copy consts read: 4; declared claims:
3 (playground, pool, beach)` — so the guard passes on the card whose copy was made true by measurement. Two
runs of the guard, byte-compared: `diff` reports `IDENTICAL`, so the answer is a property of the tree.

### It fails on a seeded violation (acceptance item 3) — raw, both directions

**Seed: a WITHHELD kind's word added to the tour card's Places line** (the offered kinds left standing, so only
rule 4 can fire). Edit applied with a Python replace that asserts one occurrence:

```
$ python3 - <<'PY'  … "a beach, and pick where to host" -> "a beach, a park, and pick where to host" …
seeded (additive: park added, the offered kinds left standing)

$ node scripts/guards/copy-taxonomy-guard.mjs   # tail
FAIL — 1 finding(s):
  - src/lib/firstRunTour.ts: the copy names "Park" — the taxonomy kind "park", a kind the app WITHHOLDS (it is absent from PLACE_KIND_CHIP_KINDS) — and no declaration in this module claims it. Declare the kind (if the copy may name it at all) or take the word out of the copy.

These are deterministic findings, not opinions. Either the copy stops naming the
category, or the declaration says what the copy claims and the taxonomy backs it.
GUARD_EXIT=1
```

**Restored**, and the guard is green again on the same command:

```
$ cp .scratch/v28/tmp/firstRunTour.pristine.ts src/lib/firstRunTour.ts
$ node scripts/guards/copy-taxonomy-guard.mjs | tail -2
PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
EXIT_AFTER_RESTORE=0
$ git diff --stat src/lib/firstRunTour.ts
 src/lib/firstRunTour.ts | 27 +++++++++++++++++++++++++++
 1 file changed, 27 insertions(+)     ← only the declaration; the seed is gone
```

(That diff was taken before the declaration was committed as `327b8a5`; after it, the same command prints nothing, which
is the same statement — the tree carries no version of the seed.)

**Seed: a NON-EXISTENT category declared** — the brief's other permitted seed:

```
seeded a NON-EXISTENT category
FAIL — 1 finding(s):
  - src/lib/firstRunTour.ts: the declaration names the category "zoo", which PLACE_KINDS does not have — a category this copy names must be one of the kinds the app has
GUARD_EXIT=1
   … restored …
EXIT_AFTER_RESTORE=0
```

### The `.check.mjs` proves the checker fires, and exits 0 (acceptance item 4)

`node scripts/guards/copy-taxonomy-guard.check.mjs` → **exit 0**, raw tail:

```
  ✓ a withheld kind named in the copy (the acceptance seed) — the seed is CAUGHT
  ✓ a withheld kind named in the copy (the acceptance seed) — MUTATION: dropping the rule lets that seed PASS (so the check can fail)
  ✓ a declaration naming a category the taxonomy does not have — the seed is CAUGHT
  ✓ a declaration naming a category the taxonomy does not have — MUTATION: dropping the rule lets that seed PASS (so the check can fail)
  ✓ a declaration naming a kind the app withholds — the seed is CAUGHT
  ✓ a declaration naming a kind the app withholds — MUTATION: dropping the rule lets that seed PASS (so the check can fail)
  ✓ a declaration naming an offered kind that appears nowhere in the copy — the seed is CAUGHT
  ✓ a declaration naming an offered kind that appears nowhere in the copy — MUTATION: dropping the rule lets that seed PASS (so the check can fail)
  ✓ a withheld kind named in a registered module whose copy declares nothing — the seed is CAUGHT
  ✓ a withheld kind named in a registered module whose copy declares nothing — MUTATION: dropping the rule lets that seed PASS (so the check can fail)
  ✓ a declaration that names fewer categories than the words do — the seed is CAUGHT
  ✓ a declaration that names fewer categories than the words do — MUTATION: dropping the rule lets that seed PASS (so the check can fail)
  ✓ the declaration deleted while the words still name categories is a finding on both counts
  ✓ a registered copy const that was renamed is a finding (not a silent drop)
  ✓ a registered copy const left with no string literal is a finding
  ✓ a registered module that is gone is a finding
  ✓ a taxonomy walk that reads no kinds is a finding
  ✓ a label function that yields no word is a finding
  ✓ a run that reads no declaration anywhere is a finding, even when the words name no category
  ✓ a kind whose word collapses to the generic default is not judged, and the run prints its limit line
  ✓ the seeds left the tree as it was — the clean run still passes at the end
copy-taxonomy-guard check: all 23 checks passed, 0 failed, across 22 guard invocations (6 of them against a mutated copy of the guard).
```

Every rule therefore has BOTH halves: a seed that makes it fire, and a textual mutation of that rule (in a copy
of the guard placed inside the sandbox, anchor required to occur exactly once) that makes the same seed pass.
The shipped guard carries no off switch; a mutation whose anchor moved FAILS its seed rather than passing it.

### Registered in the gate in both places (acceptance item 5)

```
$ grep -n "copy-taxonomy" scripts/guards/run-all.sh
31:#   copy-taxonomy   scripts/guards/copy-taxonomy-guard.mjs — a copy const this
87:for guard in lib-sibling-guard config-guard no-bypass-guard fixture-marker-guard vacuous-absence-guard stale-locator-guard copy-field-consumption-guard copy-taxonomy-guard check-acceptance-greps regexp-escape-guard factory-guard; do
131:run_check "copy-taxonomy-guard (behavior)" scripts/guards/copy-taxonomy-guard.check.mjs
$ git status --short --untracked-files=all | grep -i 'test.mjs' || echo "(none)"
(none)                      ← .check.mjs, never .test.mjs; the vitest count below proves it is not collected
```

And inside the gate, both of the new instrument's lines:

```
PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
copy-taxonomy-guard check: all 23 checks passed, 0 failed, across 22 guard invocations (6 of them against a mutated copy of the guard).
```

---

## §3 The coverage statement, and the tier each claim kind landed in

**Tier 1 — deterministic, offline, IN the gate** (no network, no database, no clock; it reads files):

- **Claim kind in:** a PLACE-TAXONOMY CATEGORY named by a copy const — existence, offered-ness, declaration
  backing, declaration completeness (rules 1-4 above).
- **Taxonomy read:** `src/lib/places.ts` only — `PLACE_KINDS`, `PLACE_KIND_CHIP_KINDS`, `placeKindLabel`.
  The guard restates no kind and no word.
- **Copy consts in scope** (the registry is the coverage):
  `firstRunCopy.ts` `FIRST_RUN_COPY`, `FIRST_RUN_NUDGE_COPY`; `firstRunTour.ts` `TOUR_TITLE`, `TOUR_BODY`,
  `TOUR_PROGRESS_LABEL`, `TOUR_LINES` + its declaration; `push.ts` `NOTIFICATION_KIND_COPY`;
  `theme.ts` `THEME_CHOICE_COPY`; `feed.ts` `RADIUS_SAVE_REJECTED_COPY`, `RADIUS_SAVE_FAILED_COPY`.

**Tier 2 — the live-count half — NOT BUILT. This is where the climb stops.** Reasons with their measurements
in §6. Consequence, stated plainly: count claims in copy ("184 of 239 rows have hours", the dated table in
`firstRunTour.ts`'s header) are **not declared and not checked by anything this slice added**.

**Out of scope, named, with the reason** (a module absent from the registry is not judged at all):

| out of scope | why |
|---|---|
| copy that is not a registered const: `src/lib/feed.ts:918` (`'Add a place (park, lot, field).'`), `src/components/LocationModal.tsx:39`, `src/components/PlaydateFormFields.tsx:339`, `:919`, `src/pages/PlaceDetailsPage.tsx:617` | the registry reads exported copy CONSTS. An inline string inside a function and a placeholder inside a `.tsx` are not scanned. §5 carries what those strings actually say |
| `src/lib/vibeChips.ts:34` (`'Playground hang — all ages welcome'`) | a starter sentence the PARENT writes into their own Details field (`applyVibeChip` writes `chip.text`), not a statement about what the app offers. The word it uses is an offered kind, so nothing turns on it either way |
| `src/lib/places.ts`, `src/lib/types.ts` | the taxonomy's own definition sites — the kinds and their words. A rule that flagged the definition would flag the authority it judges against |
| `TOUR_BANNED_COPY` (`firstRunTour.ts:257`), `TOUR_ACTION_VERBS` | a pin list of phrases this batch removed and a list of verbs — neither is rendered copy |
| every other vocabulary: notification kinds, theme choices, indoor/outdoor | one taxonomy is the claim; the others are not judged |
| other claim kinds: a POSITION ("along the bottom"), a CAPABILITY ("where to host"), an ATTRIBUTE (hours) | none is machine-checkable offline. The position rule stays local (`firstRunTour.test.ts`'s pairing rule), the capability rule is a driver-in-code question a reviewer asks, the attribute rule is a live count |
| copy produced by a FUNCTION rather than a const (`rsvpConfirmationCopy`, `kindEmptyCopy`, `savedPlacesEmptyCopy`, `dateWindowEmptyCopy`, `PLACE_KIND_MISSING_NOTE`) | the mechanism's unit is an exported const. A category word added inside one of those functions would NOT be caught. Measured today at `6b6a630`: none of them contains a taxonomy word, and neither does any other non-test file under `src/` except the four listed above |

**The rule's own boundary, in the guard's words** (`copy-taxonomy-guard.mjs`, "WHERE IT STOPS" — that paragraph,
not this one, is authoritative): the consts in the registry; one taxonomy; one lexical phrasing per word
(whole word, optional plural, case insensitive, so an ordinary-English use of a label over-reports and a
paraphrase escapes); kinds whose word collapses to the label function's default are unscannable and print a
`limit——` line instead of being silently judged.

---

## §4 Noticed and NOT fixed (each with `file:line`)

1. **`src/lib/feed.ts:918`** — `errors.place = 'Add a place (park, lot, field).'`. A withheld kind's word in
   user-facing copy, on the post form, **inside a function, so outside the registry's scope**. It is the rule's
   lexical proxy over-reporting, and I am reporting it rather than fixing it: the field takes free text (the
   picker's "Somewhere else" path keeps what the parent typed, `NewPlaydatePage.tsx:857-864`), the placeholder
   beside it names an OFFERED kind, and "park" here is a place you can type, not a claim that the directory
   holds parks. The honest fix — if a later slice wants one — is the copy, not the rule.
2. **`src/components/LocationModal.tsx:39`** — `"e.g. Green Lake Park, Seattle"`. The same over-report in its
   bluntest form: this is an ADDRESS example, and the word happens to be a withheld kind's label. It is the
   single best argument for not scanning the whole tree (§6).
3. **`src/components/PlaydateFormFields.tsx:339`, `:919`, `src/pages/PlaceDetailsPage.tsx:617`** — placeholders
   and a review prompt naming `playground`, an OFFERED kind, in `.tsx` copy. Not registered; nothing turns on
   them today.
4. **`src/lib/vibeChips.ts:34`** — see §3; the word is an offered kind in a sentence the parent authors.
5. **The dated count table in `firstRunTour.ts`'s header** (`184 of 239 rows`, `164 of the 184`) — a Tier-2
   claim with no instrument. Not mine to change; it is declared in its own module header as a dated measurement
   with its limits named, which is more than a committed report would be.
6. **The five `factory/work/*.json` findings** in §0 — the scheduler registry's `acceptance: 'pending'` state.
   The orchestrator's file; I did not touch it.

---

## §5 Rejected, with the measurement behind the rejection

1. **Tier 2: the live-count script and/or a committed dated report.** Rejected, on measurement:
   `src/lib/db.ts:117` is `throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (see .env)')`
   at module load, and `.github/workflows/verify.yml:24-25` records the consequence in the CI's own words
   (`"src/lib/db.ts throws at module load without them, so npm run build and npm test both fail. MEASURED, not
   guessed."`). Any in-gate count check therefore puts a live dependency inside the gate, and a committed dated
   report is the slice-5 defect the brief quotes: *the dated counts are unpinned and can rot with the suite
   green*. The brief's own rule decides it — *prefer the honest limit over the noisy gate* — and it explicitly
   makes the script optional (*"plus the Tier-2 script if you built one"*). **I did not build it, and this is
   the stop.**
2. **A whole-tree label scan** (the "total-looking" form: every string literal under `src/` checked against
   every kind's word). Rejected, on measurement: it flags `src/components/LocationModal.tsx:39`
   (`"e.g. Green Lake Park, Seattle"` — an address) and `src/lib/feed.ts:918` (`'park, lot, field'` — a place
   you can type), neither of which claims the app offers parks. A rule that fires on an address is a rule that
   gets routed around, and *a known-noisy channel must not become a channel you stop reading*.
3. **A repo-wide inventory with per-module exclusions** (scan every `src/lib` file, allowlist the ones that are
   not copy). Rejected for the same measurement as (2) plus scope: it drags `places.ts` and `types.ts` — the
   taxonomy's own definition sites — into an allowlist, and the registry already makes the same information
   visible in one place a reviewer reads.
4. **Registering `vibeChips.ts` and declaring its word.** Rejected as an over-claim rather than a boundary:
   `applyVibeChip` writes `chip.text` into the parent's own Details field, so calling
   `'Playground hang — all ages welcome'` a claim the APP makes about what it offers would be the guard
   inventing a claim to have something to check.

---

## §6 The gate: exit codes, counts, and the delta accounted for

`npm run verify` after the change, at `6b6a630`, one run. Raw output in `.scratch/v28/tmp/verify-after.log`:

| what | baseline at `ba4dd93` | after, at `6b6a630` | delta |
|---|---|---|---|
| exit code | 1 | **1** | none — see §0 |
| build | ran, no error | ran, no error | none |
| test files | 71 passed | `Test Files  71 passed (71)` | **none** — I added no vitest file |
| tests | 2067 passed | `Tests  2067 passed (2067)` | **none** — the new instrument's behavior lives in a `.check.mjs`, which vitest does not collect |
| lint warnings | 81 | **81** | **none** — the two needless escapes in my own guard were the only ones and are fixed in `6b6a630` |
| lint errors | 0 | **0** | none |
| AGENTS.md | 1789 / 1800 | `ok — AGENTS.md (1789 words, ceiling 1800)` | **none** — the rule went into `docs/agents/code-structure.md`, which has no ceiling, and AGENTS.md was not touched |
| `run-all.sh` | FAIL — 6 findings | **FAIL — 5 findings**, all `factory-guard` registry-state lines | −1: the `artifacts-exist` finding for this report cleared. **Every guard and every checker passes**; `factory-guard` alone reports, on the orchestrator's files |

**Did the gate gain a dependency on the clock, the network or the database? No.** The guard reads files with
`node:fs` and parses them with `typescript` (already a devDependency, already used by
`copy-field-consumption-guard.mjs`), imports the one `escapeForRegExp` module, and reads no clock, opens no
socket, and touches no database. It is deterministic — two runs byte-compared `IDENTICAL`; same tree, same
answer, same order.

**The four named flake modes** (`no-bypass-guard`, `e2e/places.e2e.ts:2759`, vite-4173 / trace-artifact-ENOENT,
teardown `close()`): none appeared. No e2e ran — this slice changes no product behaviour (nothing renders
`TOUR_TAXONOMY_CLAIMS`; the guard is the deliverable, and it was driven directly). No listener was killed and
no inference server was started or stopped.

---

## §7 What I told the supervisor mid-flight

One `contact_supervisor` message, reason `progress_update`, sent after the baseline run and before the guard was
written: it reported the base commit's `npm run verify` → exit 1 with five `lane-states-legal` findings in
`factory/work/v28-r2-*.json` and one `artifacts-exist` finding for this report, said the report was already
written (clearing that sixth), said I was not blocked and would not stop, and asked to be told if the registry
state was to be cleared first. No reply arrived before this report; the numbers above are the post-change ones
regardless.

---

## §8 Files changed, and what a reviewer should read first

`git diff --stat 38eb722..f02245c -- . ':!factory'` — **mine only** (the base is the orchestrator's registry
commit, so the range carries no file of theirs, and the endpoint is the commit the table was READ at; the report's
own row grows with every later edit to the report, so read that row as of `f02245c`):

| file | +/- |
|---|---|
| `docs/agents/code-structure.md` | +23 |
| `src/lib/firstRunTour.ts` | +27 |
| `scripts/guards/copy-taxonomy-guard.mjs` | +467 |
| `scripts/guards/copy-taxonomy-guard.check.mjs` | +368 |
| `scripts/guards/run-all.sh` | +8 / −1 |
| `.scratch/v28/reports/slice-6d.md` | +432 |

The two new instruments grew by a few lines after that endpoint — three accuracy fixes, §10 — so their size in the
tree you are reading is given the one way a reader can check it in a single command: `wc -l` reads
`scripts/guards/copy-taxonomy-guard.mjs` at 475 and `scripts/guards/copy-taxonomy-guard.check.mjs` at 370.

sha256 of the instrument in the tree you are reading, so a reviewer can tell what they read:
`copy-taxonomy-guard.mjs` `42ae1649b401da3b…581d5066`, `copy-taxonomy-guard.check.mjs` `dccdec2516401e6a…35f61cce`.

**The 5-minute read:** `docs/agents/code-structure.md`'s new section (the rule), then
`src/lib/firstRunTour.ts:205` (the declaration), then the guard's header — "WHERE IT STOPS" is the coverage
claim and the rest of the file is the mechanism. The check is one screen per rule.

**If you stopped short, say exactly where.** I did: **Tier 2 is not built** (§5.1), and **copy that is not a
registered const is not scanned** (§3, §4.1-4.2) — an inline string in a function, a `.tsx` placeholder, and
any function-produced copy. Both are named rather than left to be discovered. What is in scope is checked in
both directions, and every rule is proven to be able to fail.

---

## §9 The final gate, at `79991bd`, with this report on disk

`npm run verify` run once at **`79991bd`** (the guard's last change committed; this report on disk and uncommitted,
which is the only part of the tree that is not code). The lines added to this report after that run are prose: the
table's final column, the §8 stat table (whose range command was then given a fixed endpoint, because a bare
`..HEAD` endpoint is a count that cannot be reproduced), and these two sentences — so the run and the artifact
differ by nothing the
gate reads except the report itself, whose own numbers are the ones below. Raw output in
`.scratch/v28/tmp/verify-final2.log`:

| what | at `ba4dd93` | at `6b6a630` | at `79991bd` (final) |
|---|---|---|---|
| exit code | 1 | 1 | **1** |
| test files | 71 | 71 | `Test Files  71 passed (71)` |
| tests | 2067 | 2067 | `Tests  2067 passed (2067)` |
| lint warnings (`grep -c ': warning '`) | 81 | 81 | **81** |
| lint errors (`grep -c ': error '`) | 0 | 0 | **0** |
| AGENTS.md | 1789 / 1800 | 1789 / 1800 | `ok — AGENTS.md (1789 words, ceiling 1800)` |
| `run-all.sh` | FAIL, 6 findings | FAIL, 5 findings | **FAIL, 5 findings** — all `factory-guard` / `lane-states-legal` on `factory/work/*.json` |
| my guard, inside the gate | — | PASS | `PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.` |
| my check, inside the gate | — | 23/23 | `copy-taxonomy-guard check: all 23 checks passed, 0 failed, across 22 guard invocations (6 of them against a mutated copy of the guard).` |
| config guard | ok | ok | `ok — no protected check config changed` |
| report provenance scan | 1 untracked report | 1 untracked report | `0 untracked, 0 tracked-but-absent` |

**Exit code 1 is the five `factory/work/v28-r2-*.json` `acceptance: 'pending'` findings and nothing else** — the
orchestrator's registry, measured identically at the base commit (§0). Every guard and every checker in the lane
passes. If those five files are cleared, the same command returns `GUARDS: PASS` and exit 0 with no change to any
file this slice touched.

**Committed as:** `b92b83e` the rule · `327b8a5` the declaration · `13af7a2` the guard, its check and the gate
registration · `6b6a630` the escapes · `2c2bc23` the report's first commit · `79991bd` the accuracy fix ·
`f02245c` this report's final gate section · `64b6ac6` the §8 stat table · and the commit that carries this text,
which is the last of the slice. **Not pushed** — production is V27.

---

## §10 One more change after the report was first committed, and why it is in the report

Commit `79991bd` changes two SENTENCES in the guard and makes one of them true. Reading the guard against its own
prose before handing over found exactly the class this batch spent eleven rounds on — a claim the mechanism does
not support:

- the ambiguous-word limit line said *a match is not attributed to either of them* while the scan still tested the
  word and attributed it to the first kind. Two kinds sharing one word are now kept out of `kindsByLabel`
  altogether, so the sentence and the code say the same thing. Unreachable on today's taxonomy — no two kinds
  share a word — which is precisely why the sentence, and not a code path, is what needed the change; the seed
  that prints the line covers the reachable half (`other`, whose word is the label function's default).
- the unreadable-declaration finding said the const *is not an exported array of string literals* whether the const
  was absent or merely held a non-literal element. It now names both causes instead of asserting one.
- the per-module line printed `copy consts read: N` from the REGISTRY — the configured count — while the label said
  READ, so a const that dropped out of the walk would still have printed the full number. It now prints what it
  read and what the registry names (`4 of 4 named`), and the rename seed asserts the drop (`copy consts read: 3 of
  4 named`), so the sentence and the mechanism agree in the direction a reviewer would test.

Re-verified after those commits, raw: `node scripts/guards/copy-taxonomy-guard.mjs` → exit 0 (two lines of its
output changed — the limit line and the per-module count — and the pasted block in §2 is the output as it now reads);
`node scripts/guards/copy-taxonomy-guard.check.mjs` → exit 0, `all 23 checks passed, 0 failed, across 22 guard
invocations (6 of them against a mutated copy of the guard)`; `npx oxlint` on both files → no warning. The full gate
was then re-run; its numbers are §9.

**One more run, at the commit that follows that one.** `npm run verify` was run a second time at `99ccdfc`
(the state above plus this report's §8 command fix), and every number is identical: exit 1; `Test Files  71 passed
(71)`; `Tests  2067 passed (2067)`; 81 warnings, 0 errors; `ok — AGENTS.md (1789 words, ceiling 1800)`;
the new guard `PASS` and its check `23/23` inside the lane; `run-all.sh` `GUARDS: FAIL — 1 guard(s) reported
findings: - factory-guard`, the same five registry lines. `bash scripts/steering-lint.sh` run on its own:
exit 0. Nothing this slice touched changed any of them, and the raw output is
`.scratch/v28/tmp/verify-end.log`.
