# Slice 6d — FRESH-CONTEXT REVIEW

**Verdict: NEEDS_CHANGES**

**Reviewed:** `git diff 38eb722..248d897` in `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`,
branch `Meisburg/onboarding`. Note: HEAD in the worktree is `587a901`, not the brief's `248d897`; the two
commits on top (`248d897`→`587a901`) touch only `.scratch/v28/reports/slice-6d.md` and
`factory/work/v28-r2-6d.json` (`git diff --stat 35e3f20..HEAD` → report, the `firstRunTour.pristine.ts`
cleanup, and the item JSON — **no code**), so the range I reviewed is the whole of the code.

**DISCLOSURE (required, D-007/D-015): I am a sibling model, not an independent one.** I am the same model
family as the builder that produced this slice. This review is not independent verification and should be
read as a same-family reading with the citations below, each reproduced against the artifact it names.

---

## 0a. What I ran (raw)

| command | result |
|---|---|
| `node scripts/guards/copy-taxonomy-guard.mjs` | exit 0, output byte-identical to the report's §2 paste |
| `node scripts/guards/copy-taxonomy-guard.check.mjs` | exit 0, `all 23 checks passed, 0 failed, across 22 guard invocations (6 of them against a mutated copy of the guard).` |
| `sha256sum scripts/guards/copy-taxonomy-guard.mjs` | `42ae1649b401da3b…581d5066` — matches the report's §8 |
| `wc -l` both instruments | `475` / `370` — matches the report's §8 |
| seeded `park` into the Places line, temp tree `/tmp/zt6d2` | exit **1**, the finding the report pastes |
| `git rev-parse 7564034:<f>` vs `35e3f20:<f>` | all six blob ids identical — the report's §11 table reproduces |
| `node …check.mjs` with `COPY_TAXONOMY_GUARD_UNDER_TEST=<path>` | exit 0; **zero** occurrences of `copy-taxonomy-guard.mjs` in the output (finding B2) |

I did **not** run `npm run verify` (my shell is not permitted to run the suite); item 6 below is therefore
attested by the report, and I say so rather than pretending to have reproduced it.

---

## 0b. The class this batch paid for eleven times — and it is here three times

The batch's class is *a claim about the instrument that the mechanism does not support*. I read every claim in
the new guard, its check, `run-all.sh`'s new comment and `code-structure.md`'s new section, and asked whether
the code below it does that. The mechanism itself is sound (rules 1–4 all exist and do what their names say; see
§2). **The defects are in the prose about the mechanism**, which is the same finding slice 6c returned ten of and
the same one D-025/D-027/D-028 ruled on. Per the ladder rule, findings B1 and B2 are prefixed `ladder:`.

### Blocker B1 — `ladder:` FALSE CLAIM: `code-structure.md` names a "SCOPE paragraph" the guard does not have

`docs/agents/code-structure.md:145`:

> `` `scripts/guards/copy-taxonomy-guard.mjs`, whose SCOPE paragraph — not this one — is the authoritative
> statement of what it covers ``

`grep -n "SCOPE" scripts/guards/copy-taxonomy-guard.mjs` → **exit 1, no match.** The guard's boundary paragraph
is titled **`WHERE IT STOPS`** at `scripts/guards/copy-taxonomy-guard.mjs:38` (`WHERE IT STOPS — the boundary,
and it is the whole of the claim`). The word `scope` appears in the guard only as a lowercase common noun at
`:39` ("Read this as the scope"), never as a paragraph name. The two *other* guards this doc pattern fits do have
one — `scripts/guards/regexp-escape-guard.mjs:31` (`SCOPE — a written boundary…`) and
`scripts/guards/factory-guard.mjs:92` (`SCOPE — the boundary this instrument reads…`) — and
`docs/agents/code-structure.md:121` establishes that convention for those. So `:145` is a referent copied from a
guard shape this guard does not use.

Two things make this a blocking finding rather than a typo: (a) the same diff's `run-all.sh:34` gets it right
(`a written boundary: see WHERE IT STOPS in its header`), so the two coverage claims added by this slice
**disagree with each other**; and (b) the very paragraph 20 lines above the new section states the law this
sentence breaks — `docs/agents/code-structure.md:121-127`: *"that header, not this paragraph, is the
authoritative statement of what the guard covers. When the header and the implementation disagree, that mismatch
**is** the defect."* This is D-025's shape (a construct named in prose but absent from the source).

Reproduce: `grep -n "SCOPE" scripts/guards/copy-taxonomy-guard.mjs` (no output, exit 1) vs
`grep -n "WHERE IT STOPS" scripts/guards/copy-taxonomy-guard.mjs` → `38: * WHERE IT STOPS — the boundary…`.

### Blocker B2 — `ladder:` FALSE CLAIM: the check says the run names which guard file it used; it does not

`scripts/guards/copy-taxonomy-guard.check.mjs:55-58`:

> `COPY_TAXONOMY_GUARD_UNDER_TEST runs these seeds against a DIFFERENT copy of the guard … It is not a way to
> make this check pass: the default is the guard in this repo, and the run says which file it used.`

The only place the guard path is ever printed is the missing-file error at
`scripts/guards/copy-taxonomy-guard.check.mjs:64` (`console.error(\`check: guard missing at ${guard}\`)`), which
fires only when the guard is absent. The passing summary (`:367-370`) prints counts and the guard-run total — no
path. The claim exists precisely to make the escape hatch auditable, and it does not hold for the run that
matters (the green one): a green run under `COPY_TAXONOMY_GUARD_UNDER_TEST` is indistinguishable from a green
run of the shipped guard.

Reproduce: `COPY_TAXONOMY_GUARD_UNDER_TEST="$PWD/scripts/guards/copy-taxonomy-guard.mjs" node
scripts/guards/copy-taxonomy-guard.check.mjs` → exit 0, and `grep -c "copy-taxonomy-guard.mjs"` on its output →
**0**.

### Blocker B3 — FALSE CLAIM + MECHANISM: "zero is a finding, in every direction" — `scanned words: 0` passes

`scripts/guards/copy-taxonomy-guard.mjs:450`:

> `// The instrument's own tripwires: zero is a finding, in every direction.`

The header repeats the intent at `:71-72` — *"an instrument that matches nothing looks exactly like a clean
repo"*. But the **scan** set (`kindsByLabel`) has no tripwire. When every kind's word collapses to the label
function's default — or every word is ambiguous — `kindsByLabel` is empty, rules 3 and 4 test nothing, and the
guard **exits 0 and prints PASS**.

Reproduce (temp tree, no repo file touched):

```
mkdir -p /tmp/zt6d/scripts/guards && cp -r src /tmp/zt6d/src
cp scripts/guards/copy-taxonomy-guard.mjs /tmp/zt6d/scripts/guards/
ln -s "$PWD/node_modules" /tmp/zt6d/node_modules
# every `return '<word>'` in placeKindLabel rewritten to `return 'Place'` (the default)
node /tmp/zt6d/scripts/guards/copy-taxonomy-guard.mjs /tmp/zt6d
```

tail of the run:

```
  kinds read: 10; offered: 8; words: 9
  scanned words: 0 (none)
  limit—— kind "park" is not scannable: …   (×10)

PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
EXIT=0
```

So a run that scans **zero** words prints `PASS — … is backed by the copy` while rule 3 never ran and rule 4
found nothing. The `limit——` lines make the blind spot visible (that part of the header holds), but the claim
"zero is a finding, in every direction" and the PASS sentence do not. The 23 checks cannot see it: the only
collapse seed (`check.mjs:322-330`) collapses **one** kind (`beach`) and explicitly requires exit 0, so no seed
exercises `kindsByLabel.size === 0`. A tripwire on that size (or lowering the comment plus the PASS sentence) is
the fix; the choice is the builder's.

Note the three zero-tripwires that *do* exist are real and each has a seed (`constsRead`/`stringsRead`/
`claimsRead`, guard `:452-464`, checks at `:290-320`). The gap is only the scan set.

---

## 1. The brief's specific tests, claim by claim

| claim | where | verdict |
|---|---|---|
| rule 1 "must EXIST in `PLACE_KINDS`" | guard `:17`, code `:405-413` | **HOLDS** — `declared.filter(kind => !allKindSet.has(kind))`; seeded + mutation-proven (`check.mjs:227-232`) |
| rule 2 "must be OFFERED (`PLACE_KIND_CHIP_KINDS`)" | guard `:18-19`, code `:415-419` | **HOLDS** — `!offeredKindSet.has(kind) && allKindSet.has(kind)`; seeded + mutated |
| rule 3 "each declared kind's label appears in the copy text" | guard `:20-21`, code `:421-431` | **HOLDS for scannable declared kinds; UNDER-DECLARED BOUNDARY for the rest** — a declared kind whose word is the fallback (or is ambiguous) is silently `continue`d, so rule 3 does not hold for *every* declared kind. WHERE IT STOPS (`:53-56`) covers the generic case and the run prints the `limit——` line; the rule sentence itself is unqualified. Non-blocking |
| rule 4 "copy must not name a category the declaration omits … fails whether or not a declaration exists" | guard `:22-24`, code `:433-444` | **HOLDS** — seeded twice (with a declaration and in a module that declares nothing) + mutated |
| "WHERE IT STOPS … the mechanism IS this list" | guard `:38-68` | **Honest for its four bullets** (registry/one taxonomy/lexical/count-claims, each true as written), **UNDER-DECLARED BOUNDARY**: it omits the second exclusion the mechanism really has — *two kinds sharing one word are kept out of the scan* (guard `:295-297`, logic `:296-309`). Printed at runtime per ambiguous word, unreachable on today's taxonomy. Non-blocking |
| "every zero is a finding" | guard `:450` | **FALSE** — see B3 |
| "an unscannable word is printed as a `limit——` line" | guard `:53-56`, code `:327-336` | **HOLDS** — `for (const kind of genericWordKinds) console.log('  limit—— …')`; seeded (`check.mjs:322-330`) |
| "a run that sees no kinds / no words / no registered const / no copy text / no declaration is a FAIL, never a pass" | guard `:71-74` | **HOLDS as enumerated** — five distinct failing tripwires (`:288-309` taxonomy, `:317-322` label fn, `:452-464`), all seeded. The word `words` here means labels read (`labels.size`), which is exactly the case that fails; the *scan* set is the un-tripwired one (B3) |
| run-all.sh coverage comment | `run-all.sh:31-35` | **HOLDS** — "may only name a PLACE CATEGORY the app has and OFFERS" (named ⇒ declared ⇒ offered, rules 4+2), "every category it names must be declared in the module" (rule 4), "the declaration must be backed by the words" (rule 3), and it names `WHERE IT STOPS` correctly |
| code-structure.md coverage claim | `code-structure.md:145` | **FALSE** — "SCOPE paragraph" does not exist, see B1 |
| check "23 checks / mutation per rule" | `check.mjs:1-52`, output | **HOLDS** — 23 checks exit 0; 6 mutations, one per rule-seed, each requiring the seed to stop firing; anchors required to occur exactly once |

**`TOUR_TAXONOMY_CLAIMS` is THE declaration the guard reads.** `grep -n "TOUR_TAXONOMY_CLAIMS"
src/lib/firstRunTour.ts` → `205:export const TOUR_TAXONOMY_CLAIMS: readonly PlaceKind[] = ['playground', 'pool',
'beach']`; the guard names it at `copy-taxonomy-guard.mjs:118-121` (`{ module: 'src/lib/firstRunTour.ts', …,
claims: 'TOUR_TAXONOMY_CLAIMS' }`) and reads it with `stringArrayConst` (`:186-200`), which returns `null` (a
finding, `:395-402`) unless it is an exported top-level array literal of string literals. **HOLDS.**

**The guard reads the REAL words, not a copy that drifts.** It restates no kind and no word: `PLACE_KINDS` /
`PLACE_KIND_CHIP_KINDS` are read from `src/lib/places.ts` source and `placeKindLabel`'s switch is walked for its
case→return words (`kindLabels`, `:203-224`); the copy text is read from the module sources. `grep -c
"'playground'" scripts/guards/copy-taxonomy-guard.mjs` → 0. **HOLDS.** One fragility to record, non-blocking:
`kindLabels` recognises only a `FunctionDeclaration` containing a `switch`, so a legitimate refactor of
`placeKindLabel` to an arrow/record would make `labels.size === 0` and go **red** ("yielded no kind word") — a
loud false positive, not a silent drift.

**The two declared ceilings match the code.** Tier 2: the guard imports only `node:fs`, `node:path`,
`typescript` and the repo's `escapeForRegExp` (`:76-80`) — no network, no `db.ts`, no clock — and its header
`:57-64` disclaims count claims and refuses a dated report. No live-count script exists in the diff
(`git diff --name-only 38eb722..248d897 | grep -i count` → none). Unscanned copy: `:40-43` says non-registered
copy is not scanned; the report §4/§11 lists the six sites, all of which I spot-checked and all of which are
exactly where it says — `feed.ts:918` `errors.place = 'Add a place (park, lot, field).'`,
`LocationModal.tsx:39` `addressPlaceholder = 'e.g. Green Lake Park, Seattle'`,
`PlaydateFormFields.tsx:339`/`:919`, `PlaceDetailsPage.tsx:617`, `vibeChips.ts:34`. **HOLDS.**

---

## 2. Requirements traceability (`.scratch/v28/briefs/slice-6d.md`)

| brief item | status | evidence |
|---|---|---|
| 1. declaration mechanism documented in the guard header + one real declaration | **met** | header `THE DECLARATION MECHANISM` `guard:26-36`; `firstRunTour.ts:205` |
| 2. guard passes on the current tree, incl. slice 5's tour card | **met** | exit 0; `module: src/lib/firstRunTour.ts / copy consts read: 4 of 4 named; declared claims: 3 (playground, pool, beach)` (reproduced) |
| 3. fails on a seeded violation, both outputs pasted | **met** | report §2; I reproduced the `park` seed independently (exit 1, identical finding) |
| 4. `.check.mjs` proves the checker fires, exits 0 | **met** | 23/23, exit 0 (reproduced). Its header sentence "the run says which file it used" is B2 |
| 5. `run-all.sh` both places; `.check.mjs` never `.test.mjs` | **met** | `run-all.sh:87` (`for guard in …`) and `:131` (`run_check`); no `.test.mjs` added (diff adds only `.check.mjs`; 71 test files unchanged) |
| 6. `npm run verify` exits 0 and no clock/network/db dependency | **met, attested not reproduced** | report §11 shows exit 0 at `35e3f20` with the pasted tail; the guard's imports are all offline. I could not run the suite. The green was reached by D-029 (`35e3f20`), not by a change in this slice's files — the six blob ids are identical across it |
| 7. coverage statement (in / out / why) | **met** | report §3 + guard `WHERE IT STOPS` `:38-68`. The report names the right paragraph; only `code-structure.md:145` misnames it (B1) |
| the banner's "say which numbers you had to re-measure" | **partially met** | `TOUR_BANNED_COPY` re-measured `:229`→`:230` (I confirm: `git show 38eb722:src/lib/firstRunTour.ts \| grep -n TOUR_BANNED_COPY` → `230`); `push.ts:63`, `theme.ts:94`, `feed.ts:186/199`, `verify.yml:24-25` confirmed; **`run-all.sh`'s anchors were also stale and were not reported as re-measured** — the brief says `:61`/`:85`/`:100-103`, at the base it is `:81` and `:120-128`, after it is `:87` and `:131` (`git show 38eb722:scripts/guards/run-all.sh \| grep -n "for guard in"` → `81`). The report quotes the current numbers so it makes no false claim — it just omits the re-measure note. Non-blocking |
| "if ALREADY FIXED, say so" | **correct** | report §1 says none of the brief's items was already fixed; I found none either. The brief's "nearest existing hook" (`copy-field-consumption-guard.mjs`) is genuinely still registered and unmodified |
| anchors drifted | **handled correctly** | brief's `firstRunCopy.ts:75/:123` confirmed at base; `TOUR_BANNED_COPY` is the third drifted anchor the banner did not flag |

---

## 3. Non-blocking findings

1. **UNDER-DECLARED BOUNDARY** — `guard:20-21` (rule 3) vs `guard:421-431`: rule 3 is skipped for a declared
   kind whose word is unattributable, and `guard:295-297`'s ambiguous-word exclusion is not in the
   `WHERE IT STOPS` list at `:38-56` even though that list calls itself the whole of the claim. The runtime
   prints a `limit——` line for both, so the blind spot is visible; it is the sentence, not the mechanism, that is
   narrower than the code.
2. **Completeness (report)** — the brief's banner asks which numbers had to be re-measured; the report §1 table
   covers the six modules + `verify.yml` but not `run-all.sh`'s `:61`/`:85`/`:100-103` (actual base `:81`,
   `:120-128`). No false claim is made.
3. **Fragility, not a defect** — `kindLabels` (`guard:203-224`) requires a `FunctionDeclaration` + `switch`; a
   refactor of `placeKindLabel` to an arrow/record makes the guard report "yielded no kind word" (a false-positive
   red). Loud, so it is not the silent-drift class.
4. **Scope note** — the reviewed range `38eb722..248d897` also carries D-029's fix
   (`scripts/factory/state.mjs`, `scripts/factory/scheduler.test.mjs`, `factory/decisions.md`, the five
   `factory/work/*.json`). That is the orchestrator's unblock, correctly attributed as such in report §11, and I
   verified its two load-bearing claims: `factory/config.json:229` has `acceptance_states`, and
   `scripts/guards/factory-guard.mjs:249-252` reads exactly that table for the acceptance lane. Not this slice's
   work, not a finding.

---

## 4. Honesty check on the builder's report (spot-verified)

Every number I could reproduce was right: the guard's pasted §2 output is **byte-identical** to the live run
(programmatic compare: `True`), the sha256 prefixes and `wc -l` match, the `.check.mjs` summary line matches, the
§11 blob-id table reproduces for all six files, the §4/§11 unscanned-copy `file:line`s all verify, and
`TOUR_BANNED_COPY:230` base / `:257` head verify. The report's claims about `npm run verify` I cannot reproduce
(myshell does not run the suite) and I mark them attested. No false statement found **in the report**; the three
findings above are in the guard, its check, and the build law that this diff added.

---

## 5. Recommended next action

One correction pass, three one-line changes, no mechanism rewrite: (1) `docs/agents/code-structure.md:145` —
`SCOPE` → `WHERE IT STOPS` (or delete the paragraph name and keep the pointer that `run-all.sh:34` already uses);
(2) `copy-taxonomy-guard.check.mjs:55-58` — make the run print the guard path it used (or delete the sentence);
(3) `copy-taxonomy-guard.mjs:450` (and the PASS line `:466`) — add a tripwire on `kindsByLabel.size === 0`, or
lower the claim. Then re-run the guard and its check. **Ladder note:** findings B1 and B2 are the same class
this batch has returned eleven times; per the ladder rule the durable fix is one rung down — the
construct-presence check D-025 proposed (named construct absent from source ⇒ fail) — not a fourth manual sweep.
