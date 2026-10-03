# Slice 6c fix-7 FINAL VERIFY — the declaration pass (commit 05edac7)

**Lane:** deterministic verifier (fresh context). **Working tree:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
**Branch:** `Meisburg/onboarding` · **HEAD:** `05edac7` ("fix-7 final: declare each rule's true boundary …11/11 paraphrases escape")
**Repo untouched:** all mutations on `/tmp` copies; guard files recorded sha256 at start and end.

## Guard file sha256 — START (before any run)

| file | sha256 start |
|---|---|
| `scripts/guards/factory-guard.mjs` | `9597040a585409e23c0903849baab176a93858d9ecad21656242622407f0b7ea` |
| `scripts/guards/factory-guard.check.mjs` | `311d400625fb0cb1c753c1cbe4fa3530ff28789a26bec9dfaaf098e16c736d7b` |
| `scripts/guards/regexp-escape-guard.check.mjs` | `8493f7e8f3ad4a7799a248138aea3d928e6615122607441461b394f68a4d7bde` |
| `scripts/guards/run-all.sh` | `536bdaeac46bd6c85d3f45c3076d476fd40d6bf9b705f922e8a3707ae072aeda` |
| `scripts/steering-lint.sh` | `d50fde3fbe794f76dc1fbd1d06475861d6ac23c552bf907ae959fd2c2efdc557` |

`git status --porcelain` at start: **empty** (tree clean). `node --check` on both guard files: **OK**.

---

## 1. `npm run verify` (gate) + harness-race check
=== RUN: npm run verify (isolated, no concurrent deriver) ===
EXIT: 0
--- tail of raw output ---
  ✓ every counted git command naming no fixed revision is CAUGHT (the property, not the list)
  ✓ MUTATION: narrowing ARM 3 back to a name list lets those seeds PASS (so the check can fail)
  ✓ the same count once it names a resolvable revision passes (control)
  ✓ a git read behind a global option is CAUGHT
  ✓ MUTATION: dropping the global-option prefix lets those seeds PASS (so the check can fail)
  ✓ a quoted moving revision is CAUGHT
  ✓ MUTATION: dropping the quote from the rev lead lets those seeds PASS (so the check can fail)
  ✓ a dressed count naming a bogus sha is CAUGHT (B1: the decidable half)
  ✓ ... and all three dressed counts are COUNTED as provenance tokens, not skipped (B1)
  ✓ MUTATION: narrowing the count token back lets that bogus sha PASS (so the check can fail)
  ✓ a dressed count resolved through bare HEAD is CAUGHT (B1: the detector half)
  ✓ a canonical `at <sha>` followed by a comma or a colon is CAUGHT when the sha is bogus (B2)
  ✓ ... and those tokens are COUNTED, so the run does not silently skip them (B2)
  ✓ MUTATION: dropping the attached-punctuation lead lets that bogus sha PASS (so the check can fail)
  ✓ the same parenthetical naming a real commit passes and is counted (control)
  ✓ a counted git command piped through a filter is CAUGHT (N1: the property, not the spelling)
  ✓ MUTATION: restoring the pipe-excluding middle lets that seed PASS (so the check can fail)
  ✓ a stale `--repo` is reported as the reason, naming the argument (N3)
  ✓ ... and the note names what it did NOT consult instead of claiming a lookup order it never walked (N3, control)
  ✓ MUTATION: restoring the old step-order sentence turns that control red (so the control can fail)
  ✓ with no --repo, the fallback to this instrument's repository is named (control)
  ✓ an exclusive git-call claim the file itself contradicts is CAUGHT
  ✓ MUTATION: dropping the exclusive-git-claim test lets that seed PASS (so the check can fail)
  ✓ a named alternative with no such construct in the source is CAUGHT
  ✓ MUTATION: dropping the named-construct test lets that seed PASS (so the check can fail)
  ✓ a prose claim that the pointer RESOLVES is CAUGHT (a capability the rule lacks)
  ✓ MUTATION: dropping the capability-claim test lets that seed PASS (so the check can fail)
  ✓ an abandoned formula restated as current prose is CAUGHT
  ✓ MUTATION: dropping the abandoned-formula scan lets that seed PASS (so the check can fail)
  ✓ a claim carried by a check NAME is read and CAUGHT (check-file prose)
  ✓ MUTATION: not reading check names lets that seed PASS (so the coverage can fail)
  ✓ a prose number the map contradicts is CAUGHT (prose number vs artifact)
  ✓ MUTATION: dropping the number-vs-artifact test lets that seed PASS (so the check can fail)
  ✓ a pasted transcript citing a line without its sha is CAUGHT (reproducibility)
  ✓ MUTATION: dropping the transcript test lets that seed PASS (so the check can fail)

factory-guard check: all 90 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
```
$ npm run verify
60: Test Files  71 passed (71)
61:      Tests  2067 passed (2067)
170:  ok — AGENTS.md (1789 words, ceiling 1800)
171:  ok — docs/agents/coordinator.md (700 words, ceiling 900)
483:PASS — the registry can be trusted and no work item claims evidence it does not have.
725:factory-guard check: all 90 checks passed.
728:GUARDS: PASS — all deterministic rules hold.
```


 RUN  v5.0.0 /home/jmeisburg/orca/workspaces/playdate-app/onboarding


 Test Files  71 passed (71)
      Tests  2067 passed (2067)
   Start at  09:09:15

**`npm run verify` result: exit 0.** Raw summary lines:

```
 Test Files  71 passed (71)
      Tests  2067 passed (2067)
oxlint warnings (`: warning `)  81      [grep -c ': warning ' over the oxlint section = 81]
oxlint errors   (`: error `)    0       [grep -c ': error '  over the oxlint section = 0]
  ok — AGENTS.md (1789 words, ceiling 1800)
factory-guard check: all 90 checks passed.
GUARDS: PASS — all deterministic rules hold.
```

Claim → measured, all confirmed:
- 71 files / 2067 tests / 81 warnings / 0 errors / AGENTS.md 1789/1800 — **all exactly as claimed.**

### No test file in the delta

```
$ git show --name-only --format= 05edac7
.scratch/v28/ledger.md
.scratch/v28/reports/slice-6c-fix-7.md
scripts/guards/factory-guard.mjs
$ git diff --name-only 1f29068..HEAD    # whole fix-7 slice, base→HEAD
.scratch/v28/ledger.md
.scratch/v28/reports/slice-6c-fix-6.md
.scratch/v28/reports/slice-6c-fix-7.md
factory/decisions.md
scripts/guards/factory-guard.check.mjs
scripts/guards/factory-guard.mjs
```

`git diff --name-only 1f29068..HEAD | grep -E '\.test\.|\.spec\.|/e2e/|vitest'` → **NONE.** No test file (and no `src/`, no `e2e/`) appears in the slice delta; the test count 2067 is unchanged from the builder's baseline (`slice-6c-fix-7.md` §7).

### Harness race — method artefact, not a guard defect

The builder reported its first `verify` failed because a concurrently-running baseline deriver truncated `factory-guard.mjs` mid-read. Checked deterministically:
- `git status --porcelain` → **empty**; `git rev-parse HEAD` → `05edac73b77e27ae4bf5edb425ce7662a31d334b`.
- `node --check scripts/guards/factory-guard.mjs` → **OK**; `node --check scripts/guards/factory-guard.check.mjs` → **OK**.
- sha256 of `factory-guard.mjs` before and after all reads is identical (`9597040a…`), i.e. the file never changed under the read.
- `npm run verify` run **alone** (no concurrent node process) → **exit 0**, and `factory-guard check: all 90 checks passed.` inside it.

Conclusion: stable tree + isolated green gate ⇒ the builder's failure was a **method race** (two processes writing/reading the same in-progress file), not a defect in the guard. No guard defect to chase.

---

## 2. `node scripts/guards/factory-guard.mjs` (isolated)
```
$ node scripts/guards/factory-guard.mjs
Factory guard — the scheduler registry and the work state
===========================================================
  note — no-bare-head-count: baseline holds 628 recorded occurrence(s); a new count resolved through bare HEAD is a finding
  note — no-bare-head-count: scanned 127 WORKING-TREE file(s); git tracks 127 under the same paths (0 untracked, 0 tracked-but-absent)
  note — count-provenance: 130 provenance token(s) in the scan, 25 distinct sha(s) resolved with `git cat-file -e <sha>^{commit}` against /home/jmeisburg/orca/workspaces/playdate-app/onboarding (the scan root) — 10 unresolvable
  note — count-provenance: 10 recorded unresolvable-sha record(s) absorbed (historical lane records that QUOTE a probe seed, by re-derivation); a NEW unresolvable sha, or a second occurrence of a recorded one in the same file, is a finding
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at, no report or brief count resolved through bare HEAD beyond the recorded baseline, no count's provenance sha unresolvable beyond the recorded records (the records are historical lane reports that QUOTE a probe seed, absorbed by re-derivation — a NEW unresolvable sha still fails), every pasted provenance transcript that cites a `.scratch/` file still carries the sha it names (or is marked historical; other paths and other rules are ceilings)

PASS — the registry can be trusted and no work item claims evidence it does not have.
EXIT: 0
```

## 3. Absorber / baseline (independent recount from source)

`factory-guard.mjs` prints the note but not the key count, so the "10 records / 2 keys" claim was re-derived from the map literal at `factory-guard.mjs:1286-1294`:

```
$ grep -n 'deadbee",' scripts/guards/factory-guard.mjs      # the two absorber keys
1289:  [".scratch/v28/reports/slice-6c-fix-6-review.md::deadbee", 9],
1290:  [".scratch/v28/reports/slice-6c-fix-6-verify.md::deadbee", 1],
```

**2 keys** (`slice-6c-fix-6-review.md::deadbee`, `slice-6c-fix-6-verify.md::deadbee`), counts `9 + 1` = **10 records**. The run's own note confirms: `10 recorded unresolvable-sha record(s) absorbed`. Baseline note: `baseline holds 628 recorded occurrence(s)`. **628 / 10 records / 2 keys — all confirmed.**

---

## 4. `node scripts/guards/factory-guard.check.mjs` — 90 checks, three independent counts
```
$ node scripts/guards/factory-guard.check.mjs
EXIT: 0
--- first 3 / last 5 lines ---
factory-guard behavior check — every rule must be able to fail
===========================================================
  ✓ a clean registry with a present artifact passes
...
  ✓ MUTATION: dropping the number-vs-artifact test lets that seed PASS (so the check can fail)
  ✓ a pasted transcript citing a line without its sha is CAUGHT (reproducibility)
  ✓ MUTATION: dropping the transcript test lets that seed PASS (so the check can fail)

factory-guard check: all 90 checks passed.
```

**Exit 0. Three independent counts of the same quantity — all agree at 90:**

| method | command | result |
|---|---|---|
| printed lines | `grep -c '^  ✓ ' /tmp/gcheck-out.txt` | **90** |
| call sites | `grep -cE '^ *check\(' scripts/guards/factory-guard.check.mjs` | **90** |
| run-time counter | summary line `factory-guard check: all 90 checks passed.` (from `let ran = 0; ran += 1` at `:85/:87`) | **90** |

`grep -c 'check(' scripts/guards/factory-guard.check.mjs` = **92**; the two extras are a seed **string literal** (`:1117 "check('the \`ZZQ2\` alternative …"`) and the failure epilogue `:1209 console.error(… check(s) failing …)` — neither is a call site. Confirms the builder's "two extras are strings".

---

## 5. `regexp-escape-guard.check.mjs`, `run-all.sh`, `steering-lint.sh`
```
$ node scripts/guards/regexp-escape-guard.check.mjs
  ✓ one copy in the WRONG file FAILS — the count is not the whole rule
  ✓ restored sandbox passes again

regexp-escape-guard check: all 12 checks passed.
EXIT: 0

$ bash scripts/guards/run-all.sh
  ✓ MUTATION: dropping the transcript test lets that seed PASS (so the check can fail)

factory-guard check: all 90 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
EXIT: 0

$ bash scripts/steering-lint.sh
[2] Size ceilings (words)
  ok — AGENTS.md (1789 words, ceiling 1800)
  ok — docs/agents/coordinator.md (700 words, ceiling 900)
  ok — every steering doc is reachable from AGENTS.md
PASS — steering layer is clean.
EXIT: 0
```

### Lane 4/5 results (raw, above)

| lane | command | result |
|---|---|---|
| regexp-escape-guard | `node scripts/guards/regexp-escape-guard.check.mjs` | **exit 0**, `all 12 checks passed` |
| run-all | `bash scripts/guards/run-all.sh` | **exit 0**, `GUARDS: PASS — all deterministic rules hold` |
| steering-lint | `bash scripts/steering-lint.sh` | **exit 0**, `ok — AGENTS.md (1789 words, ceiling 1800)`, `PASS — steering layer is clean` |

---

## THE THREE CHANGED CLAIMS — verified independently

### Claim A — Rule 2 name coverage: 26 read / 64 unread (71%)

The guard reads a check name only when the name string is on the line that opens the call (`factory-guard.mjs:415` `nameMatch = /^\s*check\(\s*(['"`])(.*?)\1/.exec(line)`). Counted independently over `scripts/guards/factory-guard.check.mjs` with the **same** regex the mechanism uses:

```
call sites (^ *check():            90
name ON opening line:              26
name NOT on opening line:          64      (e.g. :307, :317, :346, :358, :367, … — `check(` then the name on the next line)
pct unread:                        71%
```

**Claim A CONFIRMED: 26 of 90 read, 64 unread, 71%.** The declaration matches the source exactly. (The claim is about *this* file's 90 names; the mechanism also reads names in the sibling `regexp-escape-guard.check.mjs`, which does not change the count.)

### Claim B — `transcript-reproduces` narrowed to `.scratch/` citations

Mechanism (`factory-guard.mjs:1446`): `if (!cited.startsWith('.scratch/')) continue` — only a `.scratch/…` citation is resolved and compared to the named sha. The three statements now all say exactly that, and all three name the ceilings:

1. **header bullet** (`:93-99`): *"a pasted `count-provenance-unresolvable` transcript that cites a file under `.scratch/` … A citation of any OTHER path (e.g. `scripts/…`) is NOT checked, and neither is a transcript of a different rule: both are named ceilings …"*
2. **JSDoc** (`:1427-1430`): *"cites a file under `.scratch/` … A citation of any OTHER path (e.g. `scripts/…`) is NOT checked, and neither is a transcript of a different rule — both are named ceilings, not covered shapes."*
3. **`ok —` claim** (`:1522`): *"every pasted provenance transcript that cites a `.scratch/` file still carries the sha it names (or is marked historical; other paths and other rules are ceilings)"*

All three match the mechanism; none says "in this repository". **The declared ceiling is real and is a declared ceiling, not silent** — verified by construction below (P11). One note, non-blocking: the fix-7 report cites the guard line as `~factory-guard.mjs:1424`; the actual `startsWith('.scratch/')` guard is at **:1446** (the `~` is approximate and the file grew during the declaration pass, so this is drift, not a false claim).

### Claim C — the residue: 11 fresh instances, 11 escaped

The reviewer's eleven were **not** reused. Thirteen **new** paraphrases of the class were invented for this lane (P1–P13), each a false claim about an instrument's own mechanism, and each run against the **committed** guard in its own `/tmp` root (`--root <tmp> --repo <repo>`), no mutation of the repo. Result:

```
ESCAPES | exit 0 | P1  "every git read in this instrument goes through `git rev-parse`"      (absent construct)
ESCAPES | exit 0 | P2  "the `ZZQFRESH` form is matched by a distinct branch"                  (named construct absent)
ESCAPES | exit 0 | P3  "git is invoked exactly once, through `cat-file`"                      (false exclusive)
ESCAPES | exit 0 | P4  "the header pointer is looked up in the repository"                    (false capability)
ESCAPES | exit 0 | P12 "the pointer is checked against git before the claim is accepted"      (false capability)
ESCAPES | exit 0 | P13 "the `HEAD@{…}` spelling has its own branch"                           (absent construct)
ESCAPES | exit 0 | P5  check NAME "the pointer is confirmed against git" (opening line)       (check-file prose/capability)
ESCAPES | exit 0 | P6  check NAME "the map records 999 entries" (opening line)                (wrong number)
ESCAPES | exit 0 | P7  body comment "the registry holds 4242 task kinds"                      (wrong number)
ESCAPES | exit 0 | P8  "position (b) verifies the revision of a counted git command"          (abandoned formula unrecorded)
ESCAPES | exit 0 | P9  transcript, sha named "is deadbee" not "names deadbee"                 (transcript same shape)
ESCAPES | exit 0 | P10 transcript of a DIFFERENT rule that does not reproduce                 (other rule)
ESCAPES | exit 0 | P11 transcript citing a NON-.scratch path (declared ceiling)               (other path)
FIRED   | exit 1 | FINDING [instrument-headers-honest] | C1 literal "the only git call is `cat-file -e <sha>^{commit}`"
FIRED   | exit 1 | FINDING [instrument-headers-honest] | C2 literal "the baseline is 999"

13 escaped / 2 fired (of 15)
```

Every escape is **genuine**, not a root-setup artefact — proven by four further controls that fire in the same harness:

```
FIRED | exit 1 | FINDING [instrument-headers-honest]   | C3 check NAME carrying the rule-1a LITERAL
FIRED | exit 1 | FINDING [instrument-headers-honest]   | C4 check NAME carrying "the baseline is 999"
FIRED | exit 1 | FINDING [transcript-reproduces]       | C5 canonical `.scratch/` transcript that fails to reproduce
FIRED | exit 1 | FINDING [instrument-headers-honest]   | C6 abandonment recorded elsewhere, then restated
```

C3/C4 prove the check names **are** read in this root (so P5/P6 escape because the wording is unkeyed, not because names are unread). C5 proves rule 4 **runs** here (so P9/P10/P11 escape because of wording/path). C6 proves rule 1c **does** fire when the abandonment is recorded (so P8 escapes because no scanned file records the phrase — the declared boundary).

**Verdict on the residue number: NOT UNDERSTATED.** The claim "11 constructed, 11 escaped" is a measured floor; this lane adds **13 further distinct escapes**, all exit 0, so the true residue is **≥ 24** (11 reviewer + 13 verifier). The number the human is relying on is conservative, and the escape mechanism is exactly the declared one: each rule is keyed to a literal phrasing, and any paraphrase of the same shape is invisible. Adding a phrasing per escape is explicitly not the fix (D-026/D-027) and this measurement supports that ruling.

---

## Guard file sha256 — END (after every run)

| file | sha256 end | vs start |
|---|---|---|
| `scripts/guards/factory-guard.mjs` | `9597040a585409e23c0903849baab176a93858d9ecad21656242622407f0b7ea` | **identical** |
| `scripts/guards/factory-guard.check.mjs` | `311d400625fb0cb1c753c1cbe4fa3530ff28789a26bec9dfaaf098e16c736d7b` | **identical** |
| `scripts/guards/regexp-escape-guard.check.mjs` | `8493f7e8f3ad4a7799a248138aea3d928e6615122607441461b394f68a4d7bde` | **identical** |
| `scripts/guards/run-all.sh` | `536bdaeac46bd6c85d3f45c3076d476fd40d6bf9b705f922e8a3707ae072aeda` | **identical** |
| `scripts/steering-lint.sh` | `d50fde3fbe794f76dc1fbd1d06475861d6ac23c552bf907ae959fd2c2efdc557` | **identical** |

`git status --porcelain` after all runs: see below. Repo unmodified; every mutation was confined to `mkdtempSync` roots under `/tmp` and removed after each run.

---

## VERDICT

**VERIFY: PASS**

Every lane exited 0 with the claimed numbers, the tree is stable and the builder's first-verify failure is confirmed as a method (harness) race rather than a guard defect, and all three changed claims are independently confirmed:

- **A — 26 read / 64 unread (71%):** counted from source with the mechanism's own regex → **exactly 26 / 64 / 71%**. The narrow boundary is declared, not overstated.
- **B — `.scratch/` only:** the header bullet, the JSDoc and the `ok —` claim all say "a file under `.scratch/`" and all three name the other-path / other-rule ceilings. The mechanism is `if (!cited.startsWith('.scratch/')) continue` (`:1446`). A NON-`.scratch/` citation escapes (P11) — **declared, not silent**.
- **C — 11 escaped:** not understated. This lane's 13 freshly-invented paraphrases all escaped (exit 0), each proven genuine by a firing control, so the residue is **≥ 24**, and the escape mechanism is precisely the declared literal-phrasing limit.

Residual risks:
- `factory-guard.check.mjs` is the one changed guard the behaviour gate exercises; its 90 count is triply-consistent, but the *declarations* it depends on are prose and remain human-read (the measured 26/90 names plus all body comments) — the machine reads only part of them.
- The `~1424` citation in the claim vs the real `:1446` is line drift, not a false claim.
- The residue is open by ruling (D-027); a future paraphrase escapes. The lane hunt remains the enforcement for it.

Guard files: sha256 identical start→end (table above); `git status --porcelain` empty; repo unmodified.
