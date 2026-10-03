
# Slice 6d — VERIFICATION, ROUND 3 (fresh context)

**Verdict line: VERIFY: PASS**

Working dir: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
Reviewed fix-round-2 code state: `a6d72f6` (guards byte-identical at HEAD). Lane evidence `026818b`.

Every number below was re-measured on this tree; nothing is copied from a lane report. Where a number
differs from the brief, I name the number I measured.

---

## 0. Shas, re-derived with `git log`/`git rev-parse` (as instructed)

| ref | sha | what it is |
|---|---|---|
| `git rev-parse HEAD` | **`4b9a8ef`** | two commits PAST the fix round 2 code |
| `a6d72f6` | `a6d72f61bdd8fa8158870b3353aa1620ca48aa97` | slice 6d fix round 2 (the code: guard + check) |
| `026818b` | `026818bdbc32feb9bb169a46e8e0d167c483fbb8` | lane evidence for round 2 |
| `efeeeda` | `efeeeda82dad73889c3976766ac0e8e0295c6272` | pre-round-2 state |
| `45cd77b` | `45cd77b25e64149f2e188fef6a69b4a80298178a` | fix round 1 (the pre-round-2 guard) |

**Discrepancy named:** the brief says "Fix round 2 is at HEAD `a6d72f6`". HEAD is actually `4b9a8ef`,
two commits later (`026818b`, `4b9a8ef`). It does not matter for this verification: the two later commits
touch only `.scratch/v28/ledger.md` and `factory/work/v28-r2-6d.json`, and
`git diff --stat a6d72f6 HEAD -- scripts/guards/copy-taxonomy-guard.mjs scripts/guards/copy-taxonomy-guard.check.mjs`
is **empty**. The working guard's `sha256` is `97cfd19747f91ee651d6cad3d3f3defd15c62d9304f94e73b2375aa8e84d3a41`,
identical to `git show a6d72f6:scripts/guards/copy-taxonomy-guard.mjs | sha256sum`.

**Pre-round-2 guard:** `git diff --stat 45cd77b efeeeda -- scripts/guards/copy-taxonomy-guard.mjs` is **empty**,
so `git show 45cd77b:scripts/guards/copy-taxonomy-guard.mjs` IS the pre-round-2 guard. Used as specified.

---

## 1. `npm run verify` — exit 0

`npm run build && npm run test && npm run lint && npm run a11y:focus && npm run steering-lint && npm run guards`
→ **exit 0** (captured to `/tmp/v3_verify.log`; the chain reached every stage — build produced `dist/`,
vitest ran, oxlint ran, the a11y check, steering-lint, and the guard suite all ran).

| measure | command | value I measured |
|---|---|---|
| test files | `grep 'Test Files'` | **`Test Files  71 passed (71)`** |
| tests | `grep 'Tests  '` | **`Tests  2068 passed (2068)`** |
| lint warnings | `grep -c ': warning '` | **81** |
| lint errors | `grep -c ': error '` | **0** |
| AGENTS.md figure vs 1800 | steering-lint output | **`ok — AGENTS.md (1789 words, ceiling 1800)`** → 1789, under the 1800 ceiling, with 11 words of headroom |
| GUARDS | `grep 'GUARDS:'` | **`GUARDS: PASS — all deterministic rules hold.`** |
| lines matching `^  FINDING` | `grep -c '^  FINDING'` | **0** |
| plain `grep -c FINDING` | `grep -c FINDING` | **2** — verified, and the disclosure is TRUE |

The builder's disclosure ("a plain `grep -c FINDING` returns 2 because two PASSING check names contain the
word") is **correct, verified, not repeated from the report**. The two matches are the ✓ (passing) check
names, and neither is a finding:

```
634:  ✓ a declared claim rule 3 cannot CHECK is a FINDING, not a limit line (B2b)
638:  ✓ a scan that can attribute no word to any kind is a FINDING, not a pass (B3)
```

There is no `  FINDING`-prefixed line anywhere in the verify output (0), because this guard prints findings
as `  - <message>` and the `FINDING` string only occurs inside the two check NAMES.

---

## 2. `bash scripts/guards/run-all.sh` — exit 0

```
GUARDS: PASS — all deterministic rules hold.
```
and inside it, line 457 of the run log:
`copy-taxonomy-guard check: all 29 checks passed, 0 failed, across 26 guard invocations (8 of them against a mutated copy of the guard), against scripts/guards/copy-taxonomy-guard.mjs.`

---

## 3. `node scripts/guards/copy-taxonomy-guard.mjs` (real tree) — exit 0

Run's own counts:

```
  taxonomy: src/lib/places.ts
  kinds read: 10; offered: 8; words: 9
  scanned words: 9 (Park, Playground, Indoor play, Museum, Pool, Splash pad, Library, Beach, Trail)
  limit—— kind "other" is not scannable: its word is the label function default, which every kind without its own case shares, ...
  module: src/lib/firstRunCopy.ts  copy consts read: 2 of 2 named; declared claims: 0 (none)
  module: src/lib/firstRunTour.ts  copy consts read: 4 of 4 named; declared claims: 3 (playground, pool, beach)
  module: src/lib/push.ts          copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/theme.ts         copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/feed.ts          copy consts read: 2 of 2 named; declared claims: 0 (none)
PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
EXIT=0
```

**scanned words: 9; declared claims: 3.** (The run does not print the *checked* count; see §5(b) — I
instrumented a throwaway copy to read it: **claimsChecked = 3**.)

---

## 4. `node scripts/guards/copy-taxonomy-guard.check.mjs` — exit 0, counted independently

I did NOT take the summary line. I counted two ways:

- **checks:** `grep -c '  ✓ '` = **29**; `grep -c '  ✗ '` = **0** → **29 checks**.
- **invocations:** I put a logging `node` shim first on `PATH` for the run, so every `execSync('node …')`
  invocation of the guard is logged independently of the script's own counters.
  - total lines logged: **26** → **26 guard invocations**.
  - shipped guard (`…/scripts/guards/copy-taxonomy-guard.mjs`): **18**.
  - mutated copy (`…/zz-mutated-guard.mjs` in the sandbox): **8** → **8 mutated**.
  - 18 + 8 = 26 ✓.

**Builder claim 29 checks / 26 invocations / 8 mutated (from 27/24/7): CONFIRMED, number for number.**
I also re-derived the "from 27/24/7" parent by running the pre-round-2 check (`efeeeda`):
`grep -c '  ✓ '` = **27**, `  ✗ ` = 0, shim total = **24**, mutated = **7** → **27/24/7**, exit 0.
Delta over the fix: **+2 checks, +2 invocations, +1 mutation**.

---

## 5. The four things the brief asked me to settle by re-derivation

### (a) B2b, both halves — the fix's premise HOLDS

Throwaway tree `/tmp/v3a`: a full copy of `src/` with ONLY the three DECLARED kinds (`playground`, `pool`,
`beach` — the kinds `TOUR_TAXONOMY_CLAIMS` names) collapsed onto the label function's own default
(`return 'Place'`); the other six kinds left scannable. This is the review's `/tmp/zt6d3` state.
Old guard = `git show 45cd77b:…`; current guard = the shipped file (sha256 byte-identical to `a6d72f6`).

**OLD (pre-round-2) guard, raw — exit 0, `scanned words: 6`, PASS:**
```
Copy-taxonomy guard — a category this copy names must be one the app has and offers
====================================================================================
  taxonomy: src/lib/places.ts
  kinds read: 10; offered: 8; words: 9
  scanned words: 6 (Park, Indoor play, Museum, Splash pad, Library, Trail)
  limit—— kind "playground" is not scannable: its word resolves to the label function's own default, so a match could not be attributed to it (see WHERE IT STOPS in the header)
  limit—— kind "pool" is not scannable: its word resolves to the label function's own default, so a match could not be attributed to it (see WHERE IT STOPS in the header)
  limit—— kind "beach" is not scannable: its word resolves to the label function's own default, so a match could not be attributed to it (see WHERE IT STOPS in the header)
  limit—— kind "other" is not scannable: its word resolves to the label function's own default, so a match could not be attributed to it (see WHERE IT STOPS in the header)
  module: src/lib/firstRunCopy.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)
  module: src/lib/firstRunTour.ts
  copy consts read: 4 of 4 named; declared claims: 3 (playground, pool, beach)
  limit—— src/lib/firstRunTour.ts: the declared kind "playground" is not scannable, so rule 3 does not check its claim (its word is the label function default or is shared with another kind — see WHERE IT STOPS)
  limit—— src/lib/firstRunTour.ts: the declared kind "pool" is not scannable, so rule 3 does not check its claim (its word is the label function default or is shared with another kind — see WHERE IT STOPS)
  limit—— src/lib/firstRunTour.ts: the declared kind "beach" is not scannable, so rule 3 does not check its claim (its word is the label function default or is shared with another kind — see WHERE IT STOPS)
  module: src/lib/push.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/theme.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/feed.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)

PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
OLD EXIT=0
```

**CURRENT guard, raw — exit 1, finding names the three unchecked claims:**
```
Copy-taxonomy guard — a category this copy names must be one the app has and offers
====================================================================================
  taxonomy: src/lib/places.ts
  kinds read: 10; offered: 8; words: 9
  scanned words: 6 (Park, Indoor play, Museum, Splash pad, Library, Trail)
  limit—— kind "playground" is not scannable: its word is the label function default, which every kind without its own case shares, so a match could not be attributed to it (see WHERE IT STOPS in the header)
  limit—— kind "pool" is not scannable: its word is the label function default, which every kind without its own case shares, so a match could not be attributed to it (see WHERE IT STOPS in the header)
  limit—— kind "beach" is not scannable: its word is the label function default, which every kind without its own case shares, so a match could not be attributed to it (see WHERE IT STOPS in the header)
  limit—— kind "other" is not scannable: its word is the label function default, which every kind without its own case shares, so a match could not be attributed to it (see WHERE IT STOPS in the header)
  module: src/lib/firstRunCopy.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)
  module: src/lib/firstRunTour.ts
  copy consts read: 4 of 4 named; declared claims: 3 (playground, pool, beach)
  limit—— src/lib/firstRunTour.ts: the declared kind "playground" is not scannable, so rule 3 does not check its claim (its word is the label function default, which every kind without its own case shares — see WHERE IT STOPS)
  limit—— src/lib/firstRunTour.ts: the declared kind "pool" is not scannable, so rule 3 does not check its claim (its word is the label function default, which every kind without its own case shares — see WHERE IT STOPS)
  limit—— src/lib/firstRunTour.ts: the declared kind "beach" is not scannable, so rule 3 does not check its claim (its word is the label function default, which every kind without its own case shares — see WHERE IT STOPS)
  module: src/lib/push.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/theme.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/feed.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)

FAIL — 1 finding(s):
  - 3 declared claim(s) this guard accepted as kinds could not be CHECKED by rule 3 — src/lib/firstRunTour.ts claims "playground", src/lib/firstRunTour.ts claims "pool", src/lib/firstRunTour.ts claims "beach". An unscannable declared kind leaves the run unable to call that declaration backed, so a PASS would claim backup the mechanism did not test (D-030): the limit—— line above says why, and THIS is the finding

These are deterministic findings, not opinions. Either the copy stops naming the
category, or the declaration says what the copy claims and the taxonomy backs it.
NEW EXIT=1
```

Both halves land exactly as the brief states. The old guard's premise was correct: at `45cd77b` this tree
was a **silent PASS** while rule 3 checked none of the three declared claims. The current guard turns that
same tree into **exit 1**, with the finding
`3 declared claim(s) this guard accepted as kinds could not be CHECKED by rule 3 — … claims "playground", … claims "pool", … claims "beach"`.
(Old guard prints four top-level `limit—— kind …` lines — the three declared kinds plus `other` — and three
per-declared-kind `limit—— src/lib/firstRunTour.ts: the declared kind "…"` lines. Current guard prints the
same shape but with the real reason and then fails.)

### (b) Both tripwires are SAFE ON A HEALTHY TREE — CONFIRMED

The real tree must not be failed by the new tripwires. Running the shipped guard on the real tree: **exit 0**
(§3). The two tripwires are internal, so I instrumented a **throwaway print-only copy** of the guard
(`/tmp/v3b/scripts/guards/probe.mjs`, guard body otherwise byte-identical; `src` and `node_modules`
symlinked) and ran it on the real repo root:

```
  [PROBE] scannedSet=9 claimsChecked=3 claimsUnchecked=0 declared=3
PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
PROBE EXIT=0
```

- scan-set tripwire condition `kindsByLabel.size === 0` → **9** (nonzero) → does not fire.
- counter tripwire condition `claimsUnchecked.length > 0` → **0** → does not fire.
- the measured set the counter is about → **claimsChecked = 3** (nonzero).

So neither fix is worse than the bug: on a healthy tree the guard PASSES with a nonzero scan set AND a
nonzero checked-claim count. (Note: `claimsChecked` is not printed by the shipped guard — the counter
tripwire keys on the *unchecked* list, so the checked value is never emitted. The value 3 above comes from the
instrumented copy, not from any shipped output.)

### (c) "One invariant at two granularities" — TRUE as to outcome; the two tripwires are NOT independent at the all-collapsed granularity

I built `/tmp/v3c` (all-collapsed seed: every `case` return collapsed to one shared word `ZzShared`, so
`scanned words: 0`) and `/tmp/v3d` (the B2b seed: only the `beach` case deleted, so `scanned words: 8`),
each with three guard variants mutated at the two anchors
(`if (kindsByLabel.size === 0) {` → `if (false) {`; `if (claimsUnchecked.length > 0) {` → `if (false) {`;
both anchors occur exactly once in the shipped text).

| tree | base | scan-set tripwire removed ONLY | counter tripwire removed ONLY | BOTH removed |
|---|---|---|---|---|
| all-collapsed (`scanned words: 0`, 3 declared claims unchecked) | **EXIT 1** — 2 findings (both tripwires fire) | **EXIT 1** — 1 finding (counter still fires) | **EXIT 1** — 1 finding (scan tripwire still fires) | **EXIT 0 / PASS** |
| B2b (beach deleted, `scanned words: 8`, 1 declared claim unchecked) | **EXIT 1** — 1 finding (counter) | **EXIT 1** — 1 finding (counter) | **EXIT 0 / PASS** | — |

Raw (all-collapsed, the four variants):
```
base                EXIT=1  scanned words: 0  FAIL — 2 finding(s): scan found NO word…  +  3 declared claim(s)…could not be CHECKED
only scan-set off   EXIT=1  scanned words: 0  FAIL — 1 finding(s): 3 declared claim(s)…could not be CHECKED
only counter off    EXIT=1  scanned words: 0  FAIL — 1 finding(s): the scan found NO word it can attribute to a kind
both off            EXIT=0  scanned words: 0  PASS — …
```

Adjudication of the claim **as stated**:
- *"a mutation removing BOTH … makes the all-collapsed seed PASS again"* → **TRUE** (both off = EXIT 0).
- *"each tripwire alone is insufficient for its own seed"* → **TRUE for the scan-set tripwire on the
  all-collapsed seed** (removing it alone still fails, because the counter also fires), and **TRUE for the
  counter if "its own seed" means the all-collapsed seed** (removing it alone still fails, because the scan
  tripwire also fires). But if "its own seed" is read as the seed the check pairs it with, it is **FALSE for
  the counter**: the B2b seed trips ONLY the counter, and removing the counter ALONE clears it (EXIT 0);
  the scan-set tripwire is inert on that seed (its condition is 8 ≠ 0).
- **The two are therefore NOT independent at the all-collapsed granularity: they co-fire there (the same
  empty measurement read at two levels), so the check's B3 mutation has to remove both.** The check states
  exactly this ("the two are one invariant at two granularities") and its mutation removes both — consistent.
  What the check does NOT prove is the mutual-redundancy half: it never asserts "remove only one and it
  still fails". I proved that separately above; the claim is sound, but "two granularities" should not be
  read as "two independent tripwires".

### (d) N2's replacement assertion is real — it CAN fail

The old identity check compared `readFileSync(guard,'utf8') === guardSrc` (a tautology — the review's N2).
The new one (`check.mjs:242-249`) compares the mutated file **on disk** (`readFileSync(identityCopy,'utf8')`)
against `guardSrc.replace(B3_ANCHOR, B3_MUTATED)`. I falsified it deliberately in `/tmp/v3e`: a mirror with
`src`/`node_modules` symlinked and the shipped guard+check copied, then a `check_broken.mjs` in which
`mutate()` derives from a **different** file — the line `let text = guardSrc` becomes
`let text = guardSrc + ` + a literal backslash-n comment string — the exact real-world defect N2 named ("a future `mutate()` reading a different file would leave this check green").

```
  ✗ the guard under test is scripts/guards/copy-taxonomy-guard.mjs (this repo) — and every mutation derives from that file's text — the mutated copy on disk is not this guard file with the one replacement applied
copy-taxonomy-guard check: 1 check(s) failed — the guard is not catching its defect class.
EXIT=1
```

The assertion went **RED** (and it was the ONLY failure; the 28 other checks still passed). So the new
assertion is **falsifiable** — unlike the tautology it replaced, it can fail when the mutation path stops
deriving from the named guard. **CONFIRMED.**

---

## 6. Verdict

**VERIFY: PASS.** Every required command exited 0 on the tree as it stands
(`npm run verify` → 0; `run-all.sh` → 0; `copy-taxonomy-guard.mjs` real tree → 0; `copy-taxonomy-guard.check.mjs` → 0).
All four re-derivations land where the brief requires: (a) old guard exit 0 / `scanned words: 6` / PASS vs
current exit 1 with the three-claim finding — premise holds; (b) both tripwires safe on the healthy real tree
(exit 0, scannedSet 9, claimsChecked 3, claimsUnchecked 0); (c) "one invariant at two granularities" true as
to outcome, with the named nuance that the two co-fire (are redundant, not independent) at the all-collapsed
seed and that the counter alone clears the B2b seed; (d) the N2 replacement assertion can go red — proven.

**Discrepancies named:**
1. HEAD is `4b9a8ef`, not `a6d72f6` (brief's wording) — guards byte-identical; verified by diff + sha256.
2. `node scripts/guards/copy-taxonomy-guard.mjs` does not print a checked-claim count; the brief's
   "nonzero checked-claim count" was obtained from an instrumented throwaway copy (**claimsChecked = 3**),
   because the shipped guard consumes that value only via the unchecked list.
3. (c) nuance above: the two tripwires are NOT independent at the all-collapsed granularity.

No repo file was modified. The only file written under the tree is this report
(`.scratch/v28/reports/slice-6d-verify-3.md`); all scratch repro work lives in `/tmp/v3{a,b,c,d,e,f,g}`.
