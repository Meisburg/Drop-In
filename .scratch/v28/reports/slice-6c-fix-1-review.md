# Reviewer — V28 r2 slice 6c, fix round 1 (judge the diff)

Worktree `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
Diff under review: `git diff c484648..HEAD`; code at `c2ec32e`; `50009ae` is the report-only micro commit.
Judged against `.scratch/v28/briefs/slice-6c-fix-1.md` (and its completion brief), not the builder's table.

**Confirmed first, as required:** `git diff --stat c2ec32e..HEAD` is **one `.scratch/v28/reports/*.md` file**
(+6/−2, `slice-6c-fix-1.md`), nothing else. All code judgement below is against `c2ec32e`.

---

    Verdict: NEEDS_CHANGES
    Blocking findings:
      - ladder: `.scratch/v28/reports/slice-6c.md:267` states "git TRACKS 260 files under `.scratch/`" as the
        reviewer's measurement. It reproduces nowhere this round can point at. Measured this run:
        `git ls-files .scratch | wc -l` → **262** at the round's base `c484648` (also 262 at `4c2d2ab`,
        `c336d07`); `git ls-tree -r --name-only <c> .scratch | wc -l` → **259** at `ce3479c`/`32e9f48`, the
        commits this round names as where the review's G1/G2 measurements were taken; **265** at `c2ec32e`/HEAD.
        The same round's own report declares exactly this figure stale — `slice-6c-fix-1.md:30,36,48`: "The
        header said 260 … 262 is what I measured; 260 in the on-disk header was stale" — and corrected it in the
        header (`regexp-escape-guard.mjs:44`) and the case-4 comment (`regexp-escape-guard.check.mjs:114`).
        The sentence carrying 260 was **added by this round** to one of the four in-scope files, and 260 sits at
        neither the base nor the reviewer's commits. Same class as this round's GAP B (a stated count that does
        not reproduce); the correction went to two of the three places the number lives.
    Non-blocking findings:
      - `docs/agents/code-structure.md:100-101` — "**Two review lanes named the risk in the same words**: *a
        missed metacharacter in one copy silently over-matches the pin it builds*". Measured: the only wording on
        record is `ocr`'s, quoted identically at `.scratch/v28/briefs/slice-6c.md:12-13` and
        `.scratch/v28/briefs/slice-6.md:132` — *"implementations that drift independently — a missed
        metacharacter in one silently over-matches the pin"* — with the second lane recorded as having "flagged
        the same duplication as a drift risk", not as having used those words. The law doc's version is a
        paraphrase in quote position and adds "copy" / "it builds" / a clause the source doesn't have.
      - `scripts/guards/regexp-escape-guard.mjs:148` — the success line begins "**every other caller imports
        it**". The guard's actual test is `hits.length === 1 && hits[0].startsWith(SANCTIONED)` (`:143`); it never
        looks at callers. The sentence is true of today's tree (measured: `firstRunTour.ts:83`,
        `weekly-series.e2e.ts:15`, `place-directory-in-new.e2e.ts:40`, `stale-locator-guard.mjs:90`,
        `vacuous-absence-guard.mjs:98` all import it), but it is a claim this instrument does not measure.
        Inherited clause (the base guard printed the same words); the round changed only the parenthetical,
        which is accurate.
      - `scripts/guards/regexp-escape-guard.check.mjs:17-18,121` — the case-4 comment says the seed "is `git
        add`ed first, so the case can only pass on a genuinely tracked seed". True of the assertion (the
        `git ls-files` check gates it), but the git step is not the mechanism: the guard skips by directory
        **name** and never consults git. Measured: an **untracked** `.scratch/zz-probe.mjs` seed also returns
        exit 0 with the seed unnamed. So the git init pins the case's premise, not the skip.
      - Unverifiable, not a defect: `.scratch/v28/reports/slice-6c-fix-1.md:14` (and the `c2ec32e` message)
        claim the previous builder's four files were "+181/−19". The committed four-file diff is
        **+191/−19** (`git diff --numstat c484648 c2ec32e -- <the four files>`), and the pre-round working-tree
        state was never committed, so 181 cannot be reproduced by anyone. The +10 is consistent with this
        round's own in-place corrections, but the figure is unverifiable by construction; I state that rather
        than pass it.
    Requirements traceability:
      - "G1's implementation and its sentence agree, and both directions have a case" -> met. Header and code
        compared clause by clause: `SKIP_DIRS` (11 names: node_modules, dist, dist-ssr, test-results,
        playwright-report, .git, .vitest, .scratch, .qa, .agents, .omo) and the header's list are the same set,
        and `SCAN_EXT = /\.(ts|mts|cts|tsx|js|jsx|mjs|cjs)$/` matches the header's eight extensions exactly,
        both directions. Case 4 (tracked `.scratch` seed → uncounted) and case 5 (`.vitest/cache.mjs` → does not
        fail) both green in my run of the check.
      - "G2's caveat is in the report, naming the guard as the authoritative instrument" -> met
        (`.scratch/v28/reports/slice-6c.md:271-275` names `node scripts/guards/regexp-escape-guard.mjs`; the same
        text in `slice-6c-fix-1.md`, G2 row).
      - "G3 done or stated; G4 written into docs/agents/code-structure.md" -> met. `.mts`/`.cts` in `SCAN_EXT`
        (`regexp-escape-guard.mjs:104`), header names them (`:36-38`), case 6 proves it; "The one-copy rule"
        section exists (`docs/agents/code-structure.md:93-130`).
      - "`npm run verify` exit 0 (70/2030/81/0), guard + check exit 0, run-all.sh exit 0" -> partially met by
        me. I reproduced guard exit 0 (one hit, `src/lib/escapeForRegExp.mjs:37`), check exit 0 (all 9),
        `run-all.sh` exit 0 (`GUARDS: PASS`, log **436 lines** — the report's "full log is 436 lines" is exact,
        and the "55 non-exempt module(s)" line matches). I did **not** re-run `npm run verify` — that is the
        verify lane's job, not the reviewer's — so 70/2030/81/0 rests on the report's pasted tail, whose stated
        method (grep counts, no banner, because oxlint prints none to a non-TTY) is consistent with everything I
        could re-check.
      - "If a behaviour change is required, prove the before/after" -> met, and I re-ran the proof: the current
        9-case check against the pre-round guard (`c484648:scripts/guards/regexp-escape-guard.mjs`) fails
        **cases 5 and 6** (5: exit 1; 6: exit 0) and passes the other seven, so those two are regression tests.
        Case 4 passes against the old guard too — the report states that honestly under Risks
        (`slice-6c-fix-1.md:445-449`).
    Recommended next action: change `260` to `262` at `.scratch/v28/reports/slice-6c.md:267` (one line, report
    only — no code, guard, docs or lane is affected), or delete the number and point at the header's dated
    figure; then re-run the check and the guards lane.

---

## The seven probes, with what each produced

**1. Does the header's SCOPE equal `SKIP_DIRS` + `SCAN_EXT` as implemented?**
Yes, clause by clause, in both directions. Header (`regexp-escape-guard.mjs:32-59`) says the skip is a match
on a directory **name at any depth** — code `:111` `if (!SKIP_DIRS.has(entry.name)) walk(...)`. Header lists
build output `node_modules, dist, dist-ssr, test-results, playwright-report` and harness/generated
`.git, .qa, .agents, .omo, .scratch, .vitest` = 11 names; `SKIP_DIRS` (`:92-107`) holds exactly those 11, no
more, no fewer. Header lists `.ts/.mts/.cts/.tsx/.js/.jsx/.mjs/.cjs`; `SCAN_EXT` (`:104`) is exactly those
eight. Header's "Net" bullet names src/, e2e/, scripts/, supabase/functions/ as caught — measured caught: a
seeded copy in `src/components/zz-seed.ts`, `e2e/`, `scripts/` and `supabase/functions/x/index.mjs` each
returned exit 1 naming the seed; a `.d.mts` seed likewise (case 6). **No instance of the old defect class
found in the new text, either direction** — with the one stale-number exception in slice-6c.md (blocking
finding above), which is a number, not a boundary.

**2. Reproduce the `.scratch` skip claim.** `git ls-files .scratch | wc -l` → **262 at `c484648`** (the
commit the header names), **265 at HEAD**; `git ls-files '.scratch/**/*.mjs' '.scratch/*.mjs' | wc -l` → **23**,
all 23 under `.scratch/v4/` (`uniq -c` → `23 .scratch/v4`). The header carries the figure **dated and with its
own re-measuring command** ("measured at c484648 — it grows with every committed report, so re-measure it
rather than trust this figure"), so it reads as a dated measurement, not an invariant. The reason also
reproduces: `.scratch/guard-a03fc54.mjs:635` is verbatim
`const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`, and a copy of the guard with `.scratch`
removed from `SKIP_DIRS`, run against the real tree, exits **1** naming exactly that file (2 copies found).
The two places that repeat the 262 without the command — `regexp-escape-guard.check.mjs:114` and the header
itself — are adjacent to it; the one place that still says **260** is slice-6c.md:267.

**3. The `.vitest` before/after.** The current 9-case check, run in a temp root whose
`scripts/guards/regexp-escape-guard.mjs` is `git show c484648:...` (verified: no `.vitest` in `SKIP_DIRS`,
`SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/`) and whose `.check.mjs` is this round's:

    ✓ clean tree passes and names the one implementation
    ✓ a sixth copy in e2e/ is CAUGHT and named
    ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
    ✓ a TRACKED .scratch copy is UNCCOUNTED — the header states the boundary it is not counted under
    ✗ a generated .vitest cache file holding the literal does NOT fail the lane — exit 1
    ✗ a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list — exit 0
    ✓ a ZERO count FAILS — an instrument that matched nothing is not a pass
    ✓ one copy in the WRONG file FAILS — the count is not the whole rule
    ✓ restored sandbox passes again
    regexp-escape-guard check: 2 check(s) failed — the guard is not doing its job.   (exit 1)

Cases **5 and 6 fail against the pre-round guard** → they are regression tests, not decoration. **Case 4
passes against both**, exactly as the report says (`slice-6c-fix-1.md:445`): `.scratch` was already in
`SKIP_DIRS`, so case 4 pins the sentence against future drift and is not evidence G1a ever existed. That is
honestly stated.

**4. Still a detector, not a story.** `node scripts/guards/regexp-escape-guard.mjs` → exit **0**, exactly one
hit, `src/lib/escapeForRegExp.mjs:37`; the tail is byte-identical to the report's paste. Seeded copies caught
(exit 1, seed named) in `src/`, `e2e/`, `scripts/`, `supabase/functions/`, and `src/lib/zz-seeded.d.mts`.

**5. "A stated boundary that is not the mechanism" in the printed/comment/docs prose.** The printed scope
line (`:148-149`) is accurate about scope; its first clause over-claims (non-blocking finding 2). The check's
case comments are accurate except the case-4 "tracked" note (non-blocking finding 3). The header is accurate.
The docs section states a rule the guard enforces and defers scope to the header explicitly
(`code-structure.md:126-129`) — no false boundary there, only the borrowed-quote overstatement (non-blocking
finding 1).

**6. G4's shape.** `docs/agents/code-structure.md:93-130` states the rule (one expression → one module), names
the implementation, states the two properties that are part of the rule (detector not prohibition; zero count
fails), names the enforcing guard and what it does, states that the guard's own header is the authoritative
scope, and points back to `borrowed-guards.md` rule 1 — which is the standard cited (`:165-177`: "Write the
rule into `docs/agents/code-structure.md` first, then the guard"), and it is in the file's own voice (bolded
rule sentence, then prose, same as "The one rule" / "Test discipline"). Met.

**7. Numbers, re-measured.** Reproduced: 262 at `c484648` / 23 `.mjs` all `.scratch/v4/` (header);
`.scratch/guard-a03fc54.mjs:635` verbatim (header); `.gitignore:60-61` "Vitest's own cache directory. Never
source, never committed." (header); `docs/agents/code-structure.md` **+38** (report); `git show --stat
c2ec32e` **828 insertions / 19 deletions** and per-file counts 99/76/462/62/38/64/46 (report's corrected
table — sums check out: 847 changed lines − 19 deletions = 828); `run-all.sh` log **436 lines** and "55
non-exempt module(s)" (report); naive grep breakdown `14 slice-6c.md + 1 src + 1 docs + 1 this report = 17`,
code-trees-only **1**, and the two guard files **zero** raw hits (`git grep -c -F -f` exit 1, no output)
(report). Not reproducible: **260** (blocking finding) and **+181/−19** (unverifiable). Not checked by me:
the `npm run verify` totals and its "620 lines" — see traceability.

## Residual risks I am recording, not resolving

- The `.scratch` count in the header is a dated figure with a half-life of one committed report; it was
  already 265 at `c2ec32e` minutes later. The header says so and carries the command; the check comment
  (`:114`) and `slice-6c.md:267` repeat it without it. Any future reader can get stale numbers from the two
  copies that lack the command.
- The `.d.mts` declaration-drift cost and `lib-sibling-guard.sh:72` globbing `*.ts` only remain named,
  accepted, and untouched — as the orchestrator ruled.
- `SCAN_EXT` widening is a one-way door for existing `.mts`/`.cts` files; only one such file is tracked
  (`src/lib/escapeForRegExp.d.mts`) and it holds no literal, so today's tree is green — a measurement, not a
  property.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Verdict NEEDS_CHANGES with one ladder-class blocking finding (slice-6c.md:267, 260 vs measured 262/259/265) plus four non-blocking findings and residual risks; every finding cites file:line and carries its reproduction."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git diff --stat c484648..HEAD; git show --stat 50009ae c2ec32e",
      "result": "passed",
      "summary": "micro commit 50009ae is one .scratch report file only (+6/-2); code judged at c2ec32e"
    },
    {
      "command": "node scripts/guards/regexp-escape-guard.mjs",
      "result": "passed",
      "summary": "exit 0, one hit: src/lib/escapeForRegExp.mjs:37"
    },
    {
      "command": "node scripts/guards/regexp-escape-guard.check.mjs",
      "result": "passed",
      "summary": "exit 0, all 9 checks passed"
    },
    {
      "command": "bash scripts/guards/run-all.sh",
      "result": "passed",
      "summary": "exit 0, GUARDS: PASS, 436-line log, 55 non-exempt modules"
    },
    {
      "command": "current .check.mjs run against pre-round guard (git show c484648:scripts/guards/regexp-escape-guard.mjs) in a temp root",
      "result": "passed",
      "summary": "cases 5 and 6 fail against the old guard (proving the regression tests), case 4 passes against both"
    },
    {
      "command": "seeded copies in src/, e2e/, scripts/, supabase/functions/, .d.mts; guard run against each",
      "result": "passed",
      "summary": "each seed caught, exit 1 naming the file"
    },
    {
      "command": "copy of guard with '.scratch' removed from SKIP_DIRS, run against the real tree",
      "result": "passed",
      "summary": "exit 1, 2 copies incl. .scratch/guard-a03fc54.mjs:635 — reproduces the stated reason for the skip"
    },
    {
      "command": "git ls-files .scratch | wc -l at c484648 and HEAD; git ls-tree counts across commits; git grep -F -f needle",
      "result": "passed",
      "summary": "262 at c484648 (header correct), 265 at HEAD, 259 at ce3479c/32e9f48; 23 .mjs all .scratch/v4; grep breakdown 14+1+1+1=17 and code-trees-only 1 reproduced; 260 reproduced nowhere"
    },
    {
      "command": "npm run verify",
      "result": "not-run",
      "summary": "not run by me (reviewer role; the verify lane holds the gate) — the 70/2030/81/0 figures rest on the report's pasted tail, whose other artifacts I did reproduce"
    }
  ],
  "validationOutput": [
    "guard: 'found: src/lib/escapeForRegExp.mjs:37' ... 'PASS — the escape has exactly one home.' exit 0",
    "check: 9/9 green, 'regexp-escape-guard check: all 9 checks passed.' exit 0",
    "current check vs pre-round guard: '✗ a generated .vitest cache file ... — exit 1', '✗ a copy in a DECLARATION file (.d.mts) ... — exit 0', '2 check(s) failed' exit 1",
    "guard with .scratch unskipped: 'found: .scratch/guard-a03fc54.mjs:635' + 'found: src/lib/escapeForRegExp.mjs:37' exit 1",
    "git ls-files .scratch | wc -l -> 262 at c484648, 265 at HEAD; 23 .mjs, all .scratch/v4",
    "slice-6c.md:267 reads 'git TRACKS 260' — no commit in range reproduces 260 (262 at c484648, 259 at ce3479c/32e9f48)"
  ],
  "residualRisks": [
    "slice-6c.md:267 still states 260 tracked .scratch files; the round's own report declares that figure stale and corrected it only in the guard header and the case-4 comment.",
    "The dated .scratch count is repeated in two places without its re-measuring command (regexp-escape-guard.check.mjs:114, slice-6c.md:267), so those copies can go stale silently again.",
    "docs/agents/code-structure.md:100-101 quotes a lane in words no artifact records, and attributes them to two lanes.",
    "The guard's PASS line asserts 'every other caller imports it', which the guard does not measure.",
    "+181/-19 for the previous builder's four files is unverifiable: the committed four-file diff is +191/-19 and the intermediate state was never committed.",
    "npm run verify's totals (70/2030/81/0) were not independently reproduced by this review; they rest on the report's pasted tail."
  ],
  "noStagedFiles": true,
  "diffSummary": "Guard scope sentence rewritten to the mechanism (SKIP_DIRS matched by directory NAME; .scratch skipped whole and stated as uncounted with a dated number; .vitest added), .mts/.cts added to SCAN_EXT, three new check cases (6 -> 9) pinning both G1 directions and G3, a new 'The one-copy rule' section in docs/agents/code-structure.md (G4), a G2 correction block in slice-6c.md, plus the round's report and briefs.",
  "reviewFindings": [
    "blocker: .scratch/v28/reports/slice-6c.md:267 - states 'git TRACKS 260 files under .scratch/'; measured 262 at c484648, 259 at ce3479c/32e9f48, 265 at HEAD; the round's own report declares 260 stale and corrected it elsewhere (ladder class: same as GAP B)",
    "non-blocking: docs/agents/code-structure.md:100-101 - 'Two review lanes named the risk in the same words' + a non-verbatim quotation; only ocr's wording is on record (slice-6c.md:12-13, slice-6.md:132)",
    "non-blocking: scripts/guards/regexp-escape-guard.mjs:148 - PASS line claims 'every other caller imports it', which the guard never checks (it tests count==1 and location); inherited clause, parenthetical accurate",
    "non-blocking: scripts/guards/regexp-escape-guard.check.mjs:17-18,121 - the git-add step pins the case's premise, not the mechanism; an untracked .scratch seed also passes (measured exit 0)",
    "unverifiable: .scratch/v28/reports/slice-6c-fix-1.md:14 - '+181/-19' for the previous builder's four files; committed four-file diff is +191/-19 and the intermediate state was never committed"
  ],
  "manualNotes": "Judged the diff, not the builder's table. Acceptance items 1, 2, 3 and 5 are met and I re-ran the proofs myself (including cases 5 and 6 failing against the pre-round guard, so they are real regression tests). I deliberately did not re-run npm run verify — the verify lane owns the gate and my role inspects the diff plus the deterministic guards; the report's verify tail is internally consistent and every artifact in it that I could re-check matched exactly (436-line run-all log, 55 modules, nine check lines, GUARDS: PASS). The single blocking finding is report-only: a one-line number at slice-6c.md:267, in a scratch report the round itself superseded with the correct figure. No code, guard, docs or lane behaviour is affected, so the fix is trivially cheap but the round's own doctrine ('a number on disk is not evidence') is what it violates. Also note: the report claims 436 lines for the run-all log and I measured 436 exactly, and its corrected stat table (828/19) sums correctly against the per-file counts."
}
```
