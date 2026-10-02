# Slice 6d — FRESH-CONTEXT REVIEW, ROUND 2 (the fix-round diff)

**Verdict: NEEDS_CHANGES**

**Reviewed range:** `git diff 248d897..HEAD` in `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
(branch `Meisburg/onboarding`). HEAD = `a6163ac`. The commits in range are `587a901`, `8607243`, `377d534`,
`1ab511d`, `45cd77b` (fix round 1, the code), `3e395ad`, `a6163ac`.

**DISCLOSURE (required, D-007/D-015): I am a sibling model, not an independent one.** I am the same model
family as the builder that produced this slice. This review is not independent verification; it is a
same-family reading, and every factual sentence below carries the command I ran inline so it can be
re-checked without trusting me.

---

## 0a. What I ran (raw, this round)

| command | result |
|---|---|
| `node scripts/guards/copy-taxonomy-guard.mjs` (real tree) | **exit 0**, `scanned words: 9 (Park, Playground, …)` |
| `node scripts/guards/copy-taxonomy-guard.check.mjs` | **exit 0**, `all 27 checks passed, 0 failed, across 24 guard invocations (7 of them against a mutated copy of the guard)` |
| `COPY_TAXONOMY_GUARD_UNDER_TEST="$PWD/scripts/guards/copy-taxonomy-guard.mjs" node scripts/guards/copy-taxonomy-guard.check.mjs \| grep -c copy-taxonomy-guard.mjs` | **2** (round 1 measured **0**) |
| `COPY_TAXONOMY_GUARD_UNDER_TEST=/tmp/zt6d2/scripts/guards/copy-taxonomy-guard.mjs node …check.mjs` | **exit 0**, first line names the override path, summary ends `against /tmp/zt6d2/…` |
| B3 pair, throwaway trees `/tmp/ztB3old` (guard from `248d897`) and `/tmp/ztB3new` (guard at HEAD), 9 case returns collapsed onto the default | OLD **exit 0 / PASS**, NEW **exit 1** with the new `the scan found NO word it can attribute to a kind` finding |
| `/tmp/zt6d3` — the THREE DECLARED kinds collapsed onto the default, other six left scannable | **exit 0 / PASS**, while rule 3 checked **none** of the three declared claims (see B2b) |
| `grep -n "SCOPE" scripts/guards/copy-taxonomy-guard.mjs; echo exit=$?` | `exit=1` (no match) — the false paragraph name is gone from the guard *and* from the doc sentence |
| `node scripts/guards/factory-guard.mjs` | **exit 0**, `baseline holds 635 recorded occurrence(s)`; `631 + 4 = 635`, matching D-030's ledger line |

I did **not** run `npm run verify` (my shell does not run the suite). The gate claims in §12 and in the work
item are therefore **attested, not reproduced**, and I say so rather than paraphrasing them as mine.

---

## 0b. The three blockers, adjudicated one line each

- **B1 — HOLDS.** `docs/agents/code-structure.md:144-146` no longer names a paragraph: it reads *"whose header
  — not this section — is the authoritative statement of what it covers"*, and `scripts/guards/run-all.sh:36`
  reads *"a written boundary: see WHERE IT STOPS in its header"*. Both point at the guard's header, which
  exists; `WHERE IT STOPS` exists at `scripts/guards/copy-taxonomy-guard.mjs:40`. The only surviving `SCOPE`
  in the doc is `docs/agents/code-structure.md:121`, which is about `regexp-escape-guard.mjs` and which
  `grep -n "SCOPE" scripts/guards/regexp-escape-guard.mjs` resolves — a different guard's real paragraph name,
  correctly left alone. The two coverage claims now agree and both resolve.
- **B2 — HOLDS.** `scripts/guards/copy-taxonomy-guard.check.mjs:234-238` is the run's first line and names the
  guard in both modes (`(this repo)` vs `(from COPY_TAXONOMY_GUARD_UNDER_TEST)`), and
  `scripts/guards/copy-taxonomy-guard.check.mjs:444-446` appends `against ${guardDisplay}` to the summary. The
  reviewer's own repro now returns `grep -c copy-taxonomy-guard.mjs = 2`, was `0`. It also asserts the named
  file is what the mutations derive from (`check.mjs:236`), though weakly — see N2.
- **B3 — HOLDS.** The tripwire is on the right condition and does not fire on a healthy tree:
  `node scripts/guards/copy-taxonomy-guard.mjs` on the real tree is **exit 0** with `scanned words: 9`, and the
  `/tmp/ztB3old` vs `/tmp/ztB3new` pair reproduces the round's own before/after (0/PASS → 1/FAIL). The check
  proves the tripwire is the *reason*: `check.mjs:414-423` mutates `if (kindsByLabel.size === 0) {` to
  `if (false) {` (anchor asserted to occur exactly once by `mutate()`) and requires the seed back at exit 0. I
  re-ran the check and the three new B3 checks all pass. **But the same class is not closed one granularity
  down — see B2b.**
- **Round-1 non-blocking #1 (WHERE IT STOPS naming both attribution failures) — REAL NOW.**
  `scripts/guards/copy-taxonomy-guard.mjs:55-61` names both (the label function's own default, and two kinds
  resolving to the SAME word) and says rules 3 and 4 skip such a kind entirely. The rule-3 sentence is
  qualified at `:20-23`. There is a third case not named — see N4.
- **Round-1 non-blocking #2 (the per-kind declared-skip line) — REAL NOW.**
  `scripts/guards/copy-taxonomy-guard.mjs:432-436` prints it, and I saw it live in `/tmp/zt6d3`:
  `limit—— src/lib/firstRunTour.ts: the declared kind "playground" is not scannable, so rule 3 does not check
  its claim …`. `check.mjs:386` now asserts it alongside the generic line.

---

## 0c. Blocking findings

### B1b — `ladder:` FALSE CLAIM / WRONG NUMBER: D-030's own pointers do not resolve, two of them rotted inside this round

`factory/decisions.md:835-836` is new text this round and it is the decision that *names* the class it is
committing:

- `factory/decisions.md:835` — `| 2 | \`factory-guard.mjs:863\` (**D-024**) | \`git\` absent → bare \`catch\` → \`false\` |`.
  `sed -n '863p' scripts/guards/factory-guard.mjs` → `[".scratch/v28/briefs/slice-1-verify.md::git rev-parse HEAD", 1],`
  — a `BARE_HEAD_BASELINE` entry. The bare catch the row is about is at `scripts/guards/factory-guard.mjs:1330`
  (`grep -n "function isCommit" scripts/guards/factory-guard.mjs` → `1325`; the function is
  `try { execFileSync('git', ['cat-file', …]) } catch { return false }`). `git show 248d897:scripts/guards/factory-guard.mjs | sed -n '863p'`
  → the same baseline entry, so the pointer was already stale when it was copied in. This is D-028 item 1's
  exact subject: *"a pointer at `factory-guard.mjs:1424` where the mechanism is at `:1446`"* — the same file,
  the same shape, still being typed.
- `factory/decisions.md:836` — `| 3 | \`copy-taxonomy-guard.mjs:450\` (**B3**) | … and the guard's own header at \`:71-72\` says … |`.
  In the shipped guard, `sed -n '450p' scripts/guards/copy-taxonomy-guard.mjs` → `const undeclared = namedInCopy.filter(...)`
  and `sed -n '71p;72p'` → the `WHAT IT CANNOT DO` paragraph. The lines the row means are now `:463-464` (the
  tripwires comment and `if (kindsByLabel.size === 0) {`) and `:77-78` (`grep -n "matches nothing"` → `77`).
  D-030 was committed at `377d534`, **before** the fix `45cd77b`; that fix moved exactly these lines, and the
  same round re-measured the *report's* anchors (`slice-6d.md:669`) and did not re-measure the decision's.
  A wrong pointer is a false claim under D-028 item 1 whatever its history: D-030's own rule is that a sentence
  that needs no line number cannot have a wrong one.
- The row that *does* resolve is row 1: `factory/decisions.md:834` cites `scheduler.mjs:427-429`, and
  `sed -n '427,429p' scripts/factory/scheduler.mjs` is `const usable = available === null ? null : available - held` / blank /
  `if (usable !== null && required > usable) {` — accurate. So the defect is the two pointers, not the class
  description.

### B2b — MECHANISM / FALSE CLAIM: the empty measurement is still read as health one granularity down — `declared ∩ scannable` can be zero and the run prints PASS

The round closed `kindsByLabel.size === 0` and left the *declared* scan set untripwired. There is now a second
zero that is consumed as health: **a run in which rule 3 checks none of a module's declared claims still prints
the PASS sentence**, whose words are *"every declared taxonomy claim exists, is offered, **is backed by the
copy**"* (`scripts/guards/copy-taxonomy-guard.mjs:486`).

Reproduced on the real tree's own sources in `/tmp/zt6d3` — the three DECLARED kinds' `case` returns
(`playground`, `pool`, `beach`) set to the label function's own default, the other six left scannable:

```
  scanned words: 6 (Park, Indoor play, Museum, Splash pad, Library, Trail)      ← non-empty, so no tripwire
  limit—— src/lib/firstRunTour.ts: the declared kind "playground" is not scannable, so rule 3 does not check its claim …
  limit—— src/lib/firstRunTour.ts: the declared kind "pool" is not scannable, so rule 3 does not check its claim …
  limit—— src/lib/firstRunTour.ts: the declared kind "beach" is not scannable, so rule 3 does not check its claim …
PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
EXIT=0
```

Three findings, and they are all in the instrument's own additions:

1. `scripts/guards/copy-taxonomy-guard.mjs:463` still says *"zero is a finding, in every direction"*. It is
   false in this direction: the set of declared claims rule 3 actually tested is **0**, and nothing fails.
2. `scripts/guards/copy-taxonomy-guard.mjs:486` prints a claim the mechanism did not establish. The run says
   the declaration "is backed by the copy" for three claims rule 3 never checked. That is D-025's shape (a
   stated capability the mechanism does not have) *and* D-030's (a measurement that came back empty, read as a
   clean result) in one line.
3. The round's own check **requires that exit to be 0** — `scripts/guards/copy-taxonomy-guard.check.mjs:383-388`
   asserts `r.exit === 0 && r.out.includes('limit—— kind "beach" is not scannable') && r.out.includes('the
   declared kind "beach" is not scannable, so rule 3 does not check its claim')`. So the class is not merely
   left open, it is pinned green by the instrument that exists to catch it. That is the same shape as the
   vacuity defect D-024 catalogued *inside* `factory-guard.check.mjs`.

What is *not* wrong here, and matters for the fix: a tripwire on this direction cannot fire on a healthy tree.
On the real tree every declared kind is scannable (`node scripts/guards/copy-taxonomy-guard.mjs` → `exit 0`,
`scanned words: 9`, `declared claims: 3 (playground, pool, beach)`), so a counter of claims rule 3 actually
checked would read 3 there and only 0 in the blind state. The brief's warning about a tripwire that fails a
healthy tree does not apply to this one. Either remedy is the builder's — count and fail, or lower `:463` and
`:486` so the run does not claim backup it did not test — but "the limit line makes it visible" is not
sufficient once D-030 is the repo's written rule, because the line is a `console.log`, not a finding, and the
exit code is what a lane reads.

---

## 0d. Non-blocking findings

**N1 — WRONG NUMBER.** `.scratch/v28/reports/slice-6d.md:600-601`: *"The check count is now 27 across 24
invocations, 7 of them mutated — **one check** and two invocations more than §2 recorded"*. §2 recorded
`23 checks … 22 guard invocations` (`.scratch/v28/reports/slice-6d.md:408`; same string at `:203`), and the
delta is **four** checks (`23 → 27`), not one — the diff adds the identity check plus the B3 premise, finding
and mutation checks (`check.mjs:234-238`, `:397-423`), while the limit-line check at `:383` was extended, not
added. The invocations half (`22 → 24`) is right. D-028's sharpest lesson is this exact act — replacing a true
number with a false one while asserting a measurement; the durable fix is to drop the delta.

**N2 — MECHANISM.** `scripts/guards/copy-taxonomy-guard.check.mjs:236`,
`readFileSync(guard, 'utf8') === guardSrc`, where `guardSrc` *is* `readFileSync(guard, 'utf8')` twelve lines
earlier (`check.mjs:72`) and nothing writes `guard` in between. The assertion cannot fail, so it is not the
evidence its own name claims ("and it is the file the mutations are built from"). The property it names is true
(`mutate()` at `check.mjs:170-186` builds every mutation from `guardSrc`), and the half of B2 that mattered —
the run naming the file in both modes — is carried by `guardDisplay`/`usingOverride`, which are correct. But a
future `mutate()` reading a different file would leave this check green; to be evidence it has to compare
against something the mutation path cannot redefine (e.g. re-read the mutated file and assert it contains the
expected replacement while the shipped guard does not).

**N4 — UNDER-DECLARED BOUNDARY.** `scripts/guards/copy-taxonomy-guard.mjs:56` says *"are two ways that
happens"* (default word, shared word) and the new per-kind line at `:434-435` enumerates the same two ("its
word is the label function default or is shared with another kind"). There is a third: the label function
names **no** word for the kind — `wordOf` (`:296`) returns `null` when there is no `case` **and** no `default`
clause. Verified reachable by deleting the `default: return 'Place'` clause in a throwaway tree:

```
  limit—— kind "other" is not scannable: its word resolves to the label function's own default, so a match could not be attributed to it
EXIT=0
```

— false, because in that tree there is no default (`places.ts`'s `placeKindLabel` has cases and no fallback),
and the reason printed is a third one the two enumerations do not name. Unreachable on today's taxonomy (the
default clause exists), so non-blocking; it is the same sentence-narrower-than-the-mechanism shape this round
was fixing, and the same shape as round 1's non-blocking #1.

**N5 — Scope note, not a finding.** The range also carries the ledger's hardening queue, the work-item state
machine (`factory/work/v28-r2-6d.json`, `reopened` with a reason per D-009/D-010) and the four re-derived
`BARE_HEAD_BASELINE` keys (`scripts/guards/factory-guard.mjs:1264-1271`). I checked the one claim that matters:
`node scripts/guards/factory-guard.mjs` → **exit 0**, `baseline holds 635 recorded occurrence(s)`, and
`631 + 4 = 635` matches the ledger's *"6d's two reports cost 4 absorbed occurrences"*; a lost or decreased key
would have failed the run, so the map agrees with the tree. The round's own comment there is D-028-compliant
(it prints the size rather than typing it).

---

## 1. Requirements traceability (fix round 1, `.scratch/v28/reports/slice-6d.md` §12)

| claim in §12 | status | evidence |
|---|---|---|
| B3 tripwire on `kindsByLabel.size === 0`, empty scan is a FAIL | **met** | `guard:464`; `/tmp/ztB3new` exit 1 vs `/tmp/ztB3old` exit 0 |
| the check proves the tripwire is why it fires | **met** | `check.mjs:414-423`; `27/24/7`, all green, mutation anchor asserted once |
| the tripwire does not fire on a healthy tree | **met** | real tree exit 0, `scanned words: 9` |
| B1 paragraph name DELETED, both claims point at the header | **met** | `code-structure.md:144-146`, `run-all.sh:36`, `grep -n SCOPE` on the guard → exit 1 |
| B2 the run names the guard in both modes, and names what mutations derive from | **met (weakly)** | `check.mjs:234-238`, `:446`; repro grep = 2; the "derive from" half is N2 |
| both round-1 non-blocking findings real | **met** | `guard:55-61`, `guard:432-436`; third case unnamed — N4 |
| "zero and null are findings, never passes" now holds | **not met** | `declared ∩ scannable` can be 0 with `PASS` printed — B2b |
| report §12 numbers | **one wrong** | "one check" should be four — N1 |
| D-030's three pointers resolve | **not met** | two of three do not — B1b |

---

## 2. Honesty check on §12

Every mechanism number I could reproduce was right: the 27/24/7 summary, the before/after B3 pair, the
`against scripts/guards/copy-taxonomy-guard.mjs` suffix on both modes, the re-measured `run-all.sh` anchors
(`for guard in` at base `:81` → `:87`; `run_check()` at base `:105`; the new invocation at `:131` — all three
verify), and the §12 disclosure that `grep -c FINDING` returns 1 because of the check's own name. The two
deviations are N1 (a check delta) and B1b (pointers in the decision the section cites). The gate row I mark
attested.

---

## 3. Recommended next action

One correction pass, no mechanism rewrite: (1) re-derive or delete the two stale pointers in D-030 — do not
correct them, delete the line numbers, per D-028 item 1; (2) close the `declared ∩ scannable === 0` direction
with a counter tripwire that fails, or lower `guard:463` and `guard:486` so the run does not claim backup it
did not test — and update `check.mjs:383-388` with it; (3) drop the "one check" delta in `slice-6d.md:601`;
(4) optional: make `check.mjs:236` falsifiable, and name the third unattributable case.

**Ladder note (D-025/D-030):** B1b is the same class round 1's B1 returned (a referent that does not resolve)
and B2b is the same class round 1's B3 returned (an empty measurement read as health), each found again in the
new text this round. A fourth hand sweep is the thing D-026/D-027 measured as non-converging; the durable form
is the construct-presence check D-025 queued and the "zero is a finding, in every direction" invariant applied
as a counter rather than as a comment.
