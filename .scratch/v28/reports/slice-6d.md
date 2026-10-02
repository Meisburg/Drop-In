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

`npm run verify` at `ba4dd93`, run once before any edit. The raw output is quoted here rather than pointed at,
because a path is a weaker record than the lines and the scratch directory it lived in is gone (§11):

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
  limit—— kind "other" is not scannable: its word is the label function default, which every kind without its own case shares, so a match could not be attributed to it (see WHERE IT STOPS in the header)
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

`npm run verify` after the change, at `6b6a630`, one run. The raw numbers:

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
gate reads except the report itself, whose own numbers are the ones below.

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
exit 0. Nothing this slice touched changed any of them.

---

## §11 Unblocked at `35e3f20`: the BLOCKED verdict was the finding, and the gate is green

### What the BLOCKED verdict turned out to be

The return reported that `npm run verify` exits 1 at this slice's final commit for five
`factory/work/v28-r2-*.json` `lane-states-legal` findings — measured at `ba4dd93` before the first edit (§0). It was
not a slice defect and not a slice of mine to repair; it was a live defect in the **constructor of the registry
the gate reads**, now recorded as **D-029** and fixed in `35e3f20`. Read out of the code rather than out of the
commit message:

- `scripts/factory/state.mjs` built every lane of a new item with one default, so `acceptance` started at
  `pending`. It now constructs `acceptance: lane({ state: 'blocked', reason: null })`, with the reason inline at
  the site.
- `factory/config.json` declares `acceptance_states = {blocked: [pass, waived], pass: [], waived: []}`, and
  `factory-guard.mjs` reads exactly that for this one lane (`const legal = lane === 'acceptance' ?
  acceptanceStates : workStates`) — because acceptance is the gate OVER the work and has its own vocabulary.
  `pending` is not in it, so `factory work init` produced a registry its own validator rejects, on every item,
  every time. Slice 6c escaped notice only because its acceptance had already reached a legal terminal state.
- The five items now read `acceptance: blocked` and each carries the repair in its own history
  (`repair: newWorkItem defaulted acceptance to pending, which its own guard rejects …`); `v28-r2-6c.json` is
  unchanged at `acceptance: pass`.
- `scripts/factory/scheduler.test.mjs` gains one test that mirrors the rule against `realConfig`, so the
  constructor cannot drift from its validator again. That test is why the suite below reads `2068`, one more than
  `2067` at `ba4dd93`: **the delta is D-029's, not this slice's** — test FILES stay at 71, and no vitest file of
  mine was added.

**The verdict was environmental, and it was the most useful thing here**: the gate could not be green while the
registry's own constructor emitted an illegal state, and the report's job was to say so with the raw output rather
than to absorb it or to "fix" a file that belongs to the orchestrator. §0 and §9 named the file and the owner and
left it alone.

### The gate at `35e3f20`, run as mine: exit 0

`npm run verify`, one run, raw tail:

```
factory-guard check: all 90 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
EXIT=0
```

Same run, the numbers this slice is accountable for: `Test Files  71 passed (71)`, `Tests  2068 passed (2068)`,
81 warnings (`grep -c ': warning '`), 0 errors, `ok — AGENTS.md (1789 words, ceiling 1800)`, zero `FINDING` lines
in the whole gate, my guard `PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and
the copy names no category it did not declare.` and my check
`copy-taxonomy-guard check: all 23 checks passed, 0 failed, across 22 guard invocations (6 of them against a
mutated copy of the guard).`

### And no file this slice touched changed

Not "the diffs look equivalent" — the blob ids, read with `git rev-parse <commit>:<path>`:

| file (mine) | blob id at `7564034` | blob id at `35e3f20` |
|---|---|---|
| `scripts/guards/copy-taxonomy-guard.mjs` | `21f53d8` | `21f53d8` |
| `scripts/guards/copy-taxonomy-guard.check.mjs` | `186062c` | `186062c` |
| `src/lib/firstRunTour.ts` | `ccea378` | `ccea378` |
| `docs/agents/code-structure.md` | `d28e159` | `d28e159` |
| `scripts/guards/run-all.sh` | `9d69ea1` | `9d69ea1` |
| `.scratch/v28/reports/slice-6d.md` | `37bc9a5` | `37bc9a5` |

All six identical across the fix that unblocked the gate. That is the pairing worth having on the record: the
files were green the whole time, and the red was in the tooling that initializes the registry.

### The two rulings, recorded as ceilings (both were already the state of the tree)

**Ceiling 1 — Tier 2 (live-count claims) is NOT built, and it stays stopped.** The reason, unchanged from §5.1:
a count claim in copy ("184 of 239 rows have hours") can only be asked of the live database;
`src/lib/db.ts:117` throws at module load without its environment, which `.github/workflows/verify.yml:24-25`
records in the CI's own words; so an in-gate count check adds a live dependency to the gate, and a committed dated
report rots with the suite green — the slice-5 review defect the brief quotes. **An instrument that cannot run in
the gate must not be claimed by the gate.** No half-version will be built. Count claims in copy therefore remain
unchecked by anything, declared as such in §3 and in the guard's WHERE IT STOPS.

**Ceiling 2 — the unscanned copy stays REPORTED, not fixed.** Named ceilings, with `file:line`, and the scanner
is NOT widened to catch them this slice (that is the treadmill, and D-027 already ruled the widening away):
`src/lib/feed.ts:918`; `src/components/LocationModal.tsx:39`; `src/components/PlaydateFormFields.tsx:339` and
`:919`; `src/pages/PlaceDetailsPage.tsx:617`; `src/lib/vibeChips.ts:34`; and the function-produced copy
(`rsvpConfirmationCopy`, `kindEmptyCopy` and its siblings). Whether `feed.ts:918`'s "park" becomes true is a
product question, not a mechanism question, and it is the orchestrator's to route.

### One cleanup, and it is mine

`35e3f20` also swept in `.scratch/v28/tmp/firstRunTour.pristine.ts` — my hand-restore snapshot from the seed
proofs. Measured: byte-identical to `src/lib/firstRunTour.ts`, referenced by nothing in the tree. A duplicate of a
live module is a trap for the next reader, and this report states that directory is uncommitted scratch, so the
file and the rest of that scratch directory are removed in the commit that carries this section. Every log it held
is quoted verbatim in the sections that cite it, which is why the pointers to it are convenience and not evidence.

---

## §12 Fix round 1 — three blockers, and the boundary rungs under them

**Reviewed:** `.scratch/v28/reports/slice-6d-review.md` (229 lines, **NEEDS_CHANGES**, 3 blocking + 2
non-blocking). **Verdict accepted in full**; nothing in it is re-litigated here and no rule was weakened to make
a check pass. **Base for this round:** `248d897`. Nothing above is rewritten — this is appended.

### B3 — the scan set had no tripwire, and the guard refuted itself (a MECHANISM defect, D-030)

The review's repro, reproduced as a pair so both halves are mine and raw. Two throwaway trees, same input in
both — every `case '<kind>':` return in `placeKindLabel` collapsed onto the label function's own default word,
which is the state where the guard can attribute a copy match to no kind at all:

```
$ for d in zt6d-old zt6d-new; do rm -rf /tmp/$d; mkdir -p /tmp/$d/scripts/guards; cp -r src /tmp/$d/src; ln -s "$PWD/node_modules" /tmp/$d/node_modules; done
$ git show 248d897:scripts/guards/copy-taxonomy-guard.mjs > /tmp/zt6d-old/scripts/guards/copy-taxonomy-guard.mjs
$ cp scripts/guards/copy-taxonomy-guard.mjs        /tmp/zt6d-new/scripts/guards/copy-taxonomy-guard.mjs
$ python3 - <<'PY'   # collapse every case return, in BOTH trees, onto the default word
/tmp/zt6d-old: collapsed 9 case returns onto the default word
/tmp/zt6d-new: collapsed 9 case returns onto the default word
PY
$ node /tmp/zt6d-old/scripts/guards/copy-taxonomy-guard.mjs /tmp/zt6d-old | grep -E "scanned words|^PASS|^FAIL|^  - "
  scanned words: 0 (none)
PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
OLD_EXIT=0
$ node /tmp/zt6d-new/scripts/guards/copy-taxonomy-guard.mjs /tmp/zt6d-new | grep -E "scanned words|^PASS|^FAIL|^  - "
  scanned words: 0 (none)
FAIL — 1 finding(s):
  - src/lib/places.ts: the scan found NO word it can attribute to a kind — every kind's word resolves to the label function's own default or is shared with another kind, so rules 3 and 4 would test NOTHING and a report of health would mean the guard did not look (see limit—— lines above)
NEW_EXIT=1
```

**What changed.** The zero-tripwires covered `allKindSet`, `labels`, `constsRead`, `stringsRead` and
`claimsRead`; the **scan** set (`kindsByLabel`) had none, so rules 3 and 4 ran against an empty set and the
guard printed health. The invariant is now the one D-030 writes down — **zero and `null` are findings, never
passes** — as a tripwire on `kindsByLabel.size === 0`, and the header's self-policing sentence gained the case
it was missing ("no word it can attribute to a kind"). The PASS line is now unreachable in that state.

**The check proves it fires, and that the tripwire is why it fires** — a premise, a finding, and a mutation of
the rule that restores the silent pass the review reproduced:

```
$ node scripts/guards/copy-taxonomy-guard.check.mjs | grep -E "label function only|no word to any kind|27 checks"
  ✓ the B3 seed shared one word across every kind, inside the label function only (its own premise)
  ✓ a scan that can attribute no word to any kind is a FINDING, not a pass (B3)
  ✓ B3 — MUTATION: dropping the scan-set tripwire lets that seed PASS — the silent state the review reproduced
copy-taxonomy-guard check: all 27 checks passed, 0 failed, across 24 guard invocations (7 of them against a mutated copy of the guard), against scripts/guards/copy-taxonomy-guard.mjs.
```

The seed asserts its own premise (the rewrite is scoped to the one function and every case return was rewritten)
and the mutation branch asserts the restored state contains `scanned words: 0 (none)` **and** exits 0 — i.e. the
same input the review reproduced as a silent pass. **The check count at the end of this round was 27 across 24
invocations, 7 of them mutated.**

### B1 — the build law named a paragraph the guard does not have

`docs/agents/code-structure.md` said *"whose SCOPE paragraph"*; `grep -n "SCOPE"` on the guard exits 1 (the
boundary paragraph is `WHERE IT STOPS`), while `run-all.sh`'s new comment names it correctly — two coverage
claims this slice added, disagreeing, 20 lines under the law that calls that disagreement the defect. Fixed by
**D-028**: the paragraph name is DELETED, not corrected — the sentence now names nothing a reader has to resolve:

```
$ grep -n "SCOPE" scripts/guards/copy-taxonomy-guard.mjs ; echo "exit=$?"
exit=1
$ sed -n '144,146p' docs/agents/code-structure.md
The rule, the declaration it reads and the boundary of the scan are stated in
`scripts/guards/copy-taxonomy-guard.mjs`, whose header — not this section — is the
authoritative statement of what it covers: the copy consts the guard is
$ sed -n '34,36p' scripts/guards/run-all.sh
#                     words. One taxonomy, one direction of scan per rule, and
#                     a written boundary: see WHERE IT STOPS in its header.
```

Both now point at the header; `run-all.sh` adds the section's name, which exists.

### B2 — "the run says which file it used" was not true of the run that matters

The sentence is now backed rather than deleted, because printing the resolved path is trivial: the check's
FIRST line names the guard it resolved, whether the override is in force, and asserts that the file it names is
the file every mutation is built from. The reviewer's own repro command, before → after:

```
$ node scripts/guards/copy-taxonomy-guard.check.mjs | sed -n '1p;$p'      # shipped
  ✓ the guard under test is scripts/guards/copy-taxonomy-guard.mjs (this repo) — and it is the file the mutations are built from
copy-taxonomy-guard check: all 27 checks passed, 0 failed, across 24 guard invocations (7 of them against a mutated copy of the guard), against scripts/guards/copy-taxonomy-guard.mjs.
  grep -c copy-taxonomy-guard.mjs = 2

$ COPY_TAXONOMY_GUARD_UNDER_TEST=/tmp/zt6d/scripts/guards/copy-taxonomy-guard.mjs node scripts/guards/copy-taxonomy-guard.check.mjs   # override
  ✓ the guard under test is /tmp/zt6d/scripts/guards/copy-taxonomy-guard.mjs (from COPY_TAXONOMY_GUARD_UNDER_TEST) — and it is the file the mutations are built from
copy-taxonomy-guard check: all 27 checks passed, 0 failed, across 24 guard invocations (7 of them against a mutated copy of the guard), against /tmp/zt6d/scripts/guards/copy-taxonomy-guard.mjs.
  grep -c copy-taxonomy-guard.mjs = 2     ← was 0 before this fix
```

**What is proven and what is not.** The path in that line is built from the resolved file (`path.relative` for
a path inside the repo, the absolute path for one outside it), the override marker reflects the environment
variable, and the check asserts the named file is byte-identical to the text every mutation derives from. A
green override run and a green shipped run therefore print different identity lines — the property the sentence
claims. It is not a proof that a human reads the line; the reviewer's grep is that half, and it returns 2 either
way now. (The override must sit at the same depth as the shipped guard — its `../../src/lib/escapeForRegExp.mjs`
import is resolved from its own location — which is why the pair above uses `/tmp/zt6d/scripts/guards/`.)

### The two non-blocking findings, both the same shape: a boundary list narrower than the boundary

**Rule 3's sentence and the boundary list now name both exclusions.** There are two ways a kind's word becomes
unattributable — it is the label function's default, or two kinds resolve to the SAME word — and both keep the
kind out of the scan; rules 3 and 4 skip it. The list carries both now, `WHERE IT STOPS` says rules 3 and 4 skip
such a kind entirely, and rule 3's own sentence in the rules list is qualified to "every declared kind whose word
the guard can attribute a match to". The mechanism additionally now **names each DECLARED kind whose claim rule 3
left unchecked**, so the skip is visible for the claim it skipped and not only for the kind:

```
$ node scripts/guards/copy-taxonomy-guard.check.mjs | grep -E "collapses to the generic default"
  ✓ a kind whose word collapses to the generic default is not judged, and the run prints its limit line
$ … that seed also requires, and the review's own repro prints:
  limit—— src/lib/firstRunTour.ts: the declared kind "beach" is not scannable, so rule 3 does not check its claim (its word is the label function default or is shared with another kind — see WHERE IT STOPS)
```

No rule's semantics changed beyond B3's tripwire; no rule was weakened; the declaration, the two ceilings and the
scanner's scope are untouched.

### Anchors re-measured — including the ones the brief's own table had stale

The review's non-blocking item 2 is right: my §1 said which module anchors I re-measured but not the
`run-all.sh` ones. Measured now, with the brief's numbers beside them:

| brief's anchor | at base `38eb722` | after this slice (`248d897`) |
|---|---|---|
| `run-all.sh:61` — `for guard in …` | **`:81`** | **`:87`** |
| `run-all.sh:85` — the `run_check` block | **`:105`** (`run_check()`), invocations `:120-128` | **`:126-135`**, the new line at `:131` |
| `run-all.sh:100-103` | the invocation block is `:120-128` | `:126-135` |

So the brief was 20 lines short on the first anchor and off the block entirely on the others; no number this
report quotes is stale, and this is the note that was missing.

### What the lane reads now, and the four findings this round has to absorb

- `node scripts/guards/copy-taxonomy-guard.mjs` → **exit 0**, output byte-identical to §2's paste (the clean tree
  prints no new line: no declared kind is unscannable, and the tripwire's state does not arise).
- `node scripts/guards/copy-taxonomy-guard.check.mjs` → **exit 0**, `all 27 checks passed, 0 failed, across 24
  guard invocations (7 of them against a mutated copy of the guard)`.
- `npx oxlint` on both instruments → no output, so the gate's warning count is unchanged.
- `bash scripts/guards/run-all.sh` → **exit 1 on four `no-bare-head-count` findings, and every one of them is in
  another lane's historical record**: `slice-6d-review.md` and `slice-6d-verify.md` quote bare-HEAD counts in
  their own prose. Per **D-011 item 2 / D-021 item 2** those records KEEP their labels; they are absorbed by
  re-deriving the instrument's own baseline, never by editing them, and that derivation is done once at the end
  of this round so that this section's own prose is inside it too. The baseline's size is printed by every run
  and is not typed here — the map in `scripts/guards/factory-guard.mjs` is the authority.

### The four lane-report findings, absorbed by re-derivation — not edited, not hand-keyed

`slice-6d-review.md` and `slice-6d-verify.md` are other lanes' historical records and they keep their labels
(D-011 item 2): the reviewer's own counted `git diff` against a moving revision, and the verifier's counts pinned
to the bare token, are theirs to keep. The map was re-derived from the instrument's own matches, which is the
mechanism the map's comment and D-021 item 2 both name:

1. a throwaway copy of `scripts/guards/factory-guard.mjs` (in `/tmp`, never committed) has ONE line patched — the
   baseline comparison becomes a print of the pair the absorber itself computes (`key = file::matched-text`, and
   the running count for it). Nothing else about the scan changes, so the keys and counts are the instrument's;
2. it ran against this worktree twice; the two derived maps were byte-identical;
3. the derived map was compared with the committed one **before** anything was inserted:
   `new: 4 · lost: 0 · decreased: 0` — no previously-matched key or occurrence disappeared, so nothing had to be
   reported as lost coverage;
4. the four keys were inserted (script-generated text, sorted, with a comment naming the derivation), and the
   comparison was then re-run: **new: 0, lost: 0, decreased: 0** — the map and the derivation now agree exactly.

The four keys are the four findings `run-all.sh` reported. The map's SIZE is printed by every run of
`factory-guard.mjs` and is deliberately not typed here or in any header (D-028): the map in
`scripts/guards/factory-guard.mjs` is the authority, and the run's own note line is the size.

### The gate at the end of fix round 1

`npm run verify`, one run on the fix-round tree (the two instruments fixed, the build law corrected, the map
re-derived, and this section appended after the run):

| what | result |
|---|---|
| exit code | **0** |
| build, test, lint, a11y, steering | all ran and passed (`GUARDS: PASS — all deterministic rules hold.`) |
| test files | `Test Files  71 passed (71)` — **unchanged**: this round added `.check.mjs` code only, never a `.test.mjs` |
| tests | `Tests  2068 passed (2068)` — **unchanged from `248d897`**: the one-test step from 2067 was D-029's, and this round adds none |
| warnings / errors | 81 warnings (`grep -c ': warning '`), **0 errors** |
| AGENTS.md | `ok — AGENTS.md (1789 words, ceiling 1800)` |
| real finding lines | `grep -c '^  FINDING'` → **0**. (`grep -c FINDING` returns 1: the match is this round's own check NAME, `✓ a scan that can attribute no word to any kind is a FINDING, not a pass (B3)`, which is a passing line — worth saying rather than leaving a count that looks like a finding) |
| `copy-taxonomy-guard.mjs` | exit 0, PASS, 0 findings |
| `copy-taxonomy-guard.check.mjs` | exit 0, `all 27 checks passed, 0 failed, across 24 guard invocations (7 of them against a mutated copy of the guard)` |
| `bash scripts/guards/run-all.sh` | exit 0, `GUARDS: PASS — all deterministic rules hold.` |

**No clock, network or database dependency was added**: the guard's imports are unchanged (`node:fs`,
`node:path`, `typescript`, the one `escapeForRegExp` module), and everything B3 added reads the taxonomy source
that was already being read.

**What this round did NOT touch**, per the brief: the four rules' semantics beyond B3's tripwire (rules 1, 2 and
4 are byte-identical in behaviour and their seeds are unchanged), the declaration in `firstRunTour.ts`, the
Tier-2 ceiling, the unscanned-copy ceiling, and the scanner's scope. No rule was weakened to make a check pass;
the only rule-side change is the tripwire that makes an empty scan FAIL.

---

## §13 Fix round 2 — instance 4 (D-030), the sets the repair stopped watching, and two rungs under it

**Reviewed:** `.scratch/v28/reports/slice-6d-review-2.md` (223 lines, **NEEDS_CHANGES**): B2b (mechanism), two
non-blocking mechanisms (N2, N4) and one wrong number (N1). Verdict accepted in full; the two ceilings, the
declaration, rules 1/2/4's semantics and the scanner's scope are untouched, and no rule was weakened.
**B1b was already closed by the orchestrator** (D-030 now names *what* each site is, never *where*) and is not
touched here. **Base for this round:** the tree as left after fix round 1 (the guard and its check at
`45cd77b`, the lane record at `3e395ad`).

### B2b — the run could test NONE of a module's declared claims and still print PASS

The review's repro, reproduced as a pair so both halves are mine and raw: two throwaway trees, the same input in
both — the three **declared** kinds' `case` returns (`playground`, `pool`, `beach`) set to the label function's
own default, the other six left scannable.

```
$ node /tmp/zt6d3-old/scripts/guards/copy-taxonomy-guard.mjs /tmp/zt6d3-old | grep -E "scanned words|not check its claim|^PASS|^FAIL|^  - "
  scanned words: 6 (Park, Indoor play, Museum, Splash pad, Library, Trail)      ← non-empty, so round 1's tripwire stays silent
  limit—— src/lib/firstRunTour.ts: the declared kind "playground" is not scannable, so rule 3 does not check its claim (…)
  limit—— src/lib/firstRunTour.ts: the declared kind "pool" is not scannable, so rule 3 does not check its claim (…)
  limit—— src/lib/firstRunTour.ts: the declared kind "beach" is not scannable, so rule 3 does not check its claim (…)
PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
OLD_EXIT=0                            ← the guard at 45cd77b
$ node /tmp/zt6d3-new/scripts/guards/copy-taxonomy-guard.mjs /tmp/zt6d3-new | grep -E "scanned words|not check its claim|^PASS|^FAIL|^  - "
  scanned words: 6 (Park, Indoor play, Museum, Splash pad, Library, Trail)
  … the same three limit—— lines, with their reason spelled out …
FAIL — 1 finding(s):
  - 3 declared claim(s) this guard accepted as kinds could not be CHECKED by rule 3 — src/lib/firstRunTour.ts claims "playground", src/lib/firstRunTour.ts claims "pool", src/lib/firstRunTour.ts claims "beach". An unscannable declared kind leaves the run unable to call that declaration backed, so a PASS would claim backup the mechanism did not test (D-030): the limit—— line above says why, and THIS is the finding
NEW_EXIT=1
```

**What changed.** A counter — the declared claims rule 3 could actually CHECK — now exists beside the tripwires,
and a declared kind it could not check is a FINDING. The PASS sentence ("… is backed by the copy") is therefore
unreachable in that state, and the tripwires' own comment no longer claims a rule it does not hold: it now reads
that **every measurement this guard consumes as evidence must come back with something in it**, which is the
invariant as a counter rather than as a comment.

**The round's own check pinned the class green, and that is fixed with a mutation proof.** The single-kind seed
(the one the review found asserting exit 0) is now the review's repro: it requires the finding *and* both limit
lines, and the mutation removes the counter and requires the seed back at **exit 0 with the claim still
unchecked** — the silent state, proven to come from that rule:

```
  ✓ a declared claim rule 3 cannot CHECK is a FINDING, not a limit line (B2b)
  ✓ B2b — MUTATION: dropping the counter lets that seed PASS with the claim unchecked — printing is not failing
  ✓ a kind the label function names no word for is reported as that, not as the default word (N4)
  ✓ B3 — MUTATION: with the scan-set tripwire removed AND the claim counter removed that seed PASSES — the two are one invariant at two granularities
copy-taxonomy-guard check: all 29 checks passed, 0 failed, across 26 guard invocations (8 of them against a mutated copy of the guard), against scripts/guards/copy-taxonomy-guard.mjs.
```

Two interactions the fix had to settle rather than discover later:

- **a declared kind the taxonomy does not have is rule 1's finding, not the counter's.** The counter counts only
  declared kinds the guard ACCEPTED as kinds (`allKindSet.has(kind)`), because such a kind is unattributable by
  construction — counting it there would make one defect fire two rules and would leave each of their mutations
  unable to clear its seed alone. The finding's own words say so.
- **with every word collapsed, BOTH tripwires fire**, so the B3 seed's mutation removes both; §14 records the
  verifier's measurement that they co-fire redundantly rather than as independent checks.

### The sweep: every other measurement on this path that can come back empty

The question D-030 asks is not "is this set empty?" but **"which set did I just stop watching?"**, so the whole
path was walked rather than the one set the review named.

| measurement on the path | can it be empty? | what it is consumed as | outcome now |
|---|---|---|---|
| `allKindSet` (`PLACE_KINDS`) | yes | the taxonomy every rule is asked against | FAIL (tripwire predates this slice) |
| `offeredKindSet` (`PLACE_KIND_CHIP_KINDS`) | yes | rule 2's authority | FAIL (predates this slice) |
| `labels` (`placeKindLabel`'s words) | yes | rules 3 and 4's vocabulary | FAIL (predates this slice) |
| `kindsByLabel` (words attributable to a kind) | yes | the scan rules 3 and 4 run over | FAIL — **closed in round 1 (B3)** |
| `claimsChecked` (declared claims rule 3 actually tested) | yes | the PASS sentence's "is backed by the copy" | FAIL — **closed this round (B2b)** |
| `constsRead` / `stringsRead` / `claimsRead` | yes | that the registry, the copy text and the declaration mechanism were really read | FAIL (predate this slice) |
| `constsHere` (per module) | yes | that a registered const was found | FAIL when one is renamed or deleted (predates this slice) |
| `fallback` (the label function's default word) | `null` is legitimate | a kind's word | **deliberately not a failure**: a label function with no default clause is a real shape; the third unattributable REASON now covers it (N4) |
| a word two kinds share (the ambiguity itself) | a word can be unwatched while the scan is non-empty | rule 4's coverage of a copy word | **deliberately not a failure**: it is a taxonomy shape, not an empty measurement; each affected KIND prints a limit line naming the shared word and its owners, and `WHERE IT STOPS` names it. A **declared** kind on such a word *is* a finding (the counter) |
| the check's own premises (`mutate`'s anchor count, `collapseEveryWord`'s rewrite count, `editFile`'s occurrence count) | yes | that a seed is the input it claims | FAIL as a seed failure, and N2 made the strongest of them real |
| `offeredKinds ⊄ allKinds` (a chip naming a kind the taxonomy lacks) | not empty, just unset | rule 2 | **not this guard's rule**: the taxonomy's own test pins subset membership; named here rather than silently assumed |

The rule the sweep produced, and the reason it is a table rather than a sentence: **a repair that watches one set
has told you which other sets to look at.** Round 1 watched the scan set and left the claims behind it; this
round watched the claims and checked the rest of the path, and closes them all with the two deliberate
exceptions above, each with its reason.

### N4 — the third way a word cannot be attributed, and the printed reason that was false

A kind with no `case` **and** no `default` makes `wordOf` return `null`, which the two-case enumeration did not
name — and in that state the printed reason ("its word resolves to the label function's own default") was false.
Both halves, same input (the `default` clause deleted, so `other` has no word at all):

```
$ node /tmp/ztN4-old/scripts/guards/copy-taxonomy-guard.mjs /tmp/ztN4-old | grep 'limit—— kind "other"'
  limit—— kind "other" is not scannable: its word resolves to the label function's own default, so a match could not be attributed to it (see WHERE IT STOPS in the header)
$ node /tmp/ztN4-new/scripts/guards/copy-taxonomy-guard.mjs /tmp/ztN4-new | grep 'limit—— kind "other"'
  limit—— kind "other" is not scannable: the label function names no word for it at all (no case and no default), so a match could not be attributed to it (see WHERE IT STOPS in the header)
```

`WHERE IT STOPS` now says **three ways** (the default word; two kinds sharing one word; no word named at all),
the per-kind `limit——` line carries that kind's own reason, and the declared-skip line carries the same reason
instead of a second, separately-maintained enumeration. A check seeds it (exit 0 is right there: `other` is not
declared, so no claim went unchecked).

### N2 — the assertion that could not fail

The identity check compared `readFileSync(guard, 'utf8')` with `guardSrc`, which *is* that same read: a
tautology. It now makes one throwaway copy through `mutate()` and compares the **file on disk** with the named
guard's text plus that one replacement — plus asserts the shipped guard contains the anchor and does not already
contain the mutated line. If the mutation path ever derived from a different file, that check goes red; a re-read
of the same read could not. The name says what it does: *"the guard under test is … — and every mutation derives
from that file's text"*.

### N1 — the wrong number

The sentence in §12 that called the check growth "one check" was wrong (§2 recorded 23, the count was then 27).
Per D-028 the comparison is **deleted, not corrected**: §12 now states the count and the composition without an
arithmetic claim. §2's pasted run was also refreshed for the one line this round's per-kind reason reworded — the
whole block was compared against a fresh run, verbatim, and this round's changes are why.

### The gate at the end of fix round 2

| what | result |
|---|---|
| `node scripts/guards/copy-taxonomy-guard.mjs` | **exit 0**, PASS, 0 findings — `scanned words: 9`, `declared claims: 3` |
| `node scripts/guards/copy-taxonomy-guard.check.mjs` | **exit 0**, `all 29 checks passed, 0 failed, across 26 guard invocations (8 of them against a mutated copy of the guard)` |
| `npx oxlint` on both instruments | no output — the gate's warning count is unchanged |
| `bash scripts/guards/run-all.sh` | **exit 0**, `GUARDS: PASS — all deterministic rules hold.` |
| `npm run verify` | **exit 0** — `Test Files  71 passed (71)`, `Tests  2068 passed (2068)`, 81 warnings, 0 errors, `ok — AGENTS.md (1789 words, ceiling 1800)`, `^  FINDING` = 0 (`grep -c FINDING` returns 2 here: this round's own check NAMES for B2b and B3, both passing lines) |
| test delta | **none**: this round touched `.check.mjs` and the guard only, never a `.test.mjs`; test FILES stay 71 and tests stay 2068 |
| the seven new `no-bare-head-count` findings | the two round-2 lane reports' quotations, absorbed by re-deriving `factory-guard`'s baseline (new 7, lost 0, decreased 0, derivation run twice byte-identically). The map's size is the run's own note line and is not typed here |

---

## §14 Fix round 3 — the two orphans, three deleted clauses, and what the sweep does NOT cover

**Reviewed:** `.scratch/v28/reports/slice-6d-review-3.md` (227 lines, **NEEDS_CHANGES**): one mechanism finding
(F3, two orphans), three prose findings (F1, F2, F4), one boundary finding (F6), and the reviewer's audit of the
sweep table — which is the most useful thing in the round. Verdict accepted in full; **F5 is the orchestrator's
own text and is not touched**; the declaration, both ceilings, rules 1/2/4's semantics and the scanner's scope
are untouched and no rule was weakened. **Base:** `a6d72f6`.

### F3 — the two orphans, decided one at a time

| orphan | decision | why |
|---|---|---|
| `ambiguousWords` (declared, pushed, never read — round 2 deleted its only reader) | **DELETED** | nothing observable is lost: the per-kind reason already carries the shared word and its owners, so the per-word grouping was a second copy of the same information. Raw, on two non-declared kinds made to share one word: `limit—— kind "park" is not scannable: its word "Park" is the label of 2 kinds (park, indoor_play) …` and the same line for `indoor_play` — **per KIND, and no per-word line** |
| `claimsChecked` (initialised, incremented, never read) | **WIRED** | it is now the invariant's subject rather than a by-product: the tripwire asks `claimsChecked < claimsAccepted` (accepted = declared kinds rule 1 accepted), `claimsUnchecked` names which went unchecked, and the run prints the pair |

```
$ node scripts/guards/copy-taxonomy-guard.mjs | tail -3
  declared claims CHECKED by rule 3: 3 of 3 the taxonomy accepts

PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
$ grep -n "ambiguousWords" scripts/guards/copy-taxonomy-guard.mjs ; echo exit=$?
exit=1
```

The three counters are now each read: `claimsAccepted` by the tripwire and the printed line, `claimsChecked` by
both, `claimsUnchecked` by the finding's list and by the per-kind line. **`npx oxlint` was silent on both
orphans**, so the gate cannot be relied on for this class — which is why each is pinned in the check instead
(the zoo seed asserts the line and the accounting; the B2b seed asserts the counter and its mutation).

**And the reviewer's §0e is the finding I accept without qualification**: `ambiguousWords` is *the set round 2's
own diff stopped watching* — produced by the round that existed to close exactly that hazard, in a diff whose
report then certified the sweep row as watched. That is D-030 instance 4's shape a third time, found in the
audit artifact rather than in the mechanism: **a repair that changes one granularity must re-read the sets its
own edit touched, not only the sets it listed.**

### F1, F2, F4 — three clauses deleted rather than restated (D-028)

- the guard header's *"…a `limit——` line per such kind **or per shared word**"* — the per-word printer is gone;
  the clause is deleted and the sentence now says per such kind, naming which of the three reasons applies.
- §13's sweep row said a shared word *"is printed per word"* — deleted, and the row is renamed from the dead
  variable to the thing it is about (*a word two kinds share*), with the mechanism described as measured above.
- §13's *"B2b's counter fires before B3's tripwire"* — backwards; the ordering claim is deleted (the consequence,
  that both fire on that seed, is kept and is corrected in the next subsection).

```
$ grep -n "per shared word\|printed per word\|fires before" scripts/guards/copy-taxonomy-guard.mjs .scratch/v28/reports/slice-6d.md ; echo exit=$?
exit=1
```

### F6 — a declared kind the taxonomy does not have now prints its own reason

Raw, on a declaration extended with a kind `PLACE_KINDS` does not have:

```
  limit—— src/lib/firstRunTour.ts: the declared kind "zoo" is not scannable: the taxonomy has no kind "zoo" at all, which is rule 1's finding, so rule 3 has nothing to check
  declared claims CHECKED by rule 3: 3 of 3 the taxonomy accepts
FAIL — 1 finding(s):
  - src/lib/firstRunTour.ts: the declaration names the category "zoo", which PLACE_KINDS does not have — a category this copy names must be one of the kinds the app has
```

The counter's denominator excludes it (rule 1 owns that defect, and one defect firing two rules would leave each
of their mutations unable to clear its own seed), and the zoo seed now asserts **both** fragments — the rule-1
finding and this line — through `rule()` accepting a list of fragments; its mutation still clears the seed.

### The sweep held under attack — and the boundary the sweep does NOT cover

**It held.** The reviewer falsified **8 of the 13 rows** on throwaway trees — emptying `PLACE_KINDS`, the chip
kinds, renaming the label function, collapsing every word, making a declared claim unscannable, deleting the
declaration, emptying it, renaming every const — and every row behaved as the table claims, including both
deliberate non-failures. The round's own B2b repro reproduced verbatim. That is the table earning its keep, and
it is what a sweep should be subjected to.

**What it does not cover, stated because a sweep that claims completeness is the next instance of this class:**

1. **the sets its own diff touched** — `ambiguousWords` is the proof. The sweep enumerated measurements on the
   guard's path and did not re-read the ones round 2's edits had already changed. Found by review, not by the
   sweep.
2. **the check's internal sets beyond its seed premises** — `pristine`, `extras`, `guardRuns`, `mutationRuns`:
   printed or premise-checked, and not consumed as health (a check's counters are its output, not a verdict), so
   they are outside the class rather than closed by it.
3. **other instruments' sets** — `factory-guard`'s three baselines, the copy-field guard's shape table. Not this
   guard's path; each carries its own obligation and its own sweep.
4. **coverage, not emptiness** — the reviewer's own measurement: collapsing the six NON-declared kinds onto one
   shared word leaves the scan set non-empty (`scanned words: 3 (Playground, Pool, Beach)`) and the run PASSES
   while rule 4's coverage of those six is gone. It is a **declared** gap (printed per kind, named in
   `WHERE IT STOPS`) and it is **not tripwired**. Recorded here as the sweep's known boundary, not as a closed
   item.
5. **anything downstream of the exit code** — this report's prose, the lane records, the work item. A guard
   cannot watch what reads it; that is the reviewer's job, and this round is the evidence.

So the sweep is an enumeration of the path its author looked at. It is not a proof of completeness, and the
falsification — not the table — is what makes it worth anything.

### The verifier's nuance, recorded rather than smoothed

The claim that the scan tripwire and the claim counter are *"one invariant at two granularities"* is **true in
outcome**: on the all-collapsed seed, removing both is what lets that seed pass. But the verifier measured that
the two are **not independent** — on that seed they **co-fire redundantly** (the run lists two findings, the scan
one first), and the counter **alone** clears the B2b seed. A true outcome is not a structural-independence claim,
and the sentence is recorded that way: §13's ordering clause is gone, and the check's name for that mutation
says *both* were removed without asserting that either is sufficient alone.

### The gate at the end of fix round 3

| what | result |
|---|---|
| `node scripts/guards/copy-taxonomy-guard.mjs` | **exit 0**, PASS, 0 findings — `scanned words: 9`, `declared claims CHECKED by rule 3: 3 of 3` |
| `node scripts/guards/copy-taxonomy-guard.check.mjs` | **exit 0**, `all 29 checks passed, 0 failed, across 26 guard invocations (8 of them against a mutated copy of the guard)` — **no new check**, so no new mutation was owed; the zoo seed gained an assertion and the three mutation anchors were re-pointed |
| `bash scripts/guards/run-all.sh` | **exit 0**, `GUARDS: PASS — all deterministic rules hold.` |
| `npx oxlint` on both instruments | no output |
| test delta | **none** — `.check.mjs` and the guard only, never a `.test.mjs`; 71 files and 2068 tests |
| the new `no-bare-head-count` findings | **measured: four, all in `.scratch/v28/reports/slice-6d-verify-3.md`** (the round-3 review report contributes none — its commands name fixed shas), absorbed by re-deriving `factory-guard`'s baseline (new 4, lost 0, decreased 0, derivation twice byte-identically). The map's size is the run's own note line and is not typed |

**The mutation anchors moved with the code, and the check said so before anything else did.** Adding the
rule-3 branch made `!allKindSet.has(kind)` occur twice, and `mutate()` refuses an anchor that is not unique —
the zoo seed went red with *"mutation anchor occurs 2× — the mutation would do nothing"* rather than silently
mutating the wrong line. Three anchors were re-pointed; the anchor discipline is why this was a two-minute fix
instead of a green check over a mutation that did nothing.

**The gate's own numbers, re-measured at the end of this round:** `npm run verify` → **exit 0**,
`GUARDS: PASS — all deterministic rules hold.`, with `Test Files  71 passed (71)`, `Tests  2068 passed (2068)`,
81 warnings (`grep -c ': warning '`), 0 errors, `ok — AGENTS.md (1789 words, ceiling 1800)` and `^  FINDING` = 0
(`grep -c FINDING` returns 2 — this round's own passing check names for B2b and B3). **No test delta**: this round
touched `.check.mjs` and the guard, never a `.test.mjs`.
