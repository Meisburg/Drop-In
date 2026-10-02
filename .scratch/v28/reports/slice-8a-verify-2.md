# Slice 8a — VERIFICATION, ROUND 2 (fresh context)

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

**VERIFY: PASS** — the fix round is sound at both granularities, and the two mutations that are its
whole point were re-derived from scratch in throwaway clones. One lane (standalone `guards`) is red for a
reason OUTSIDE the slice, named in §3; it is the batch's documented corpus tax, not a fix-round defect.

## 0. Provenance — what I ran against, and one discrepancy in the brief

- Branch tip measured at start and end: **`4d3af39`**, not `ece6fd4`. `4d3af39` = `ece6fd4` + one meta-only
  commit (ledger + the two round-1 lane records: `.scratch/v28/reports/slice-8a-review.md`,
  `.scratch/v28/reports/slice-8a-verify.md`). `git diff --stat ece6fd4..4d3af39` names **no** source/test
  file, so every measurement below is of the same code tree as `ece6fd4`.
- `git rev-list --count ae578c2..4d3af39` → **9**; the fix round proper is the **7** commits
  `e010e47 4421354 b3bb57e e486fbd bc00d04 3f2da79 ece6fd4`, matching the brief.
- All mutation work happened in throwaway clones (`/tmp/v8a-mut2`, `/tmp/v8a-base-clone`); the repo itself
  was never edited. No inference server started or stopped; no push.

## 1. `npm run verify` — re-measured raw

    > npm run verify
    > npm run build && npm run test && npm run lint && npm run a11y:focus && npm run steering-lint && npm run guards
    EXIT=0   (real 1m7.587s)

| Figure | Builder claimed | **I measured** | Match |
|---|---|---|---|
| exit code | 0 | **0** | ✓ |
| test files | 71 | **71** (`Test Files 71 passed (71)`) | ✓ |
| tests | 2063 | **2063** (`Tests 2063 passed (2063)`) | ✓ |
| lint `: warning ` lines | 81 | **81** (`grep -c ': warning '` on the run) | ✓ |
| lint `: error ` lines | 0 | **0** (`grep -c ': error '`) | ✓ |
| `AGENTS.md` words vs 1800 | 1789 | **1789 / 1800** | ✓ |
| GUARDS (inside verify) | PASS | **PASS**, `factory-guard check: all 90 checks passed` | ✓ |

## 2. The +2 test delta — re-derived per file, not repeated

Method: `git clone` of the repo into `/tmp/v8a-base-clone`, `git checkout ae578c2`, `node_modules`
symlinked, `.env` copied, then `npx vitest run --reporter=json`; the same on the real tree. No test file was
added, removed, renamed, or silently dropped.

    baseline ae578c2 (clean clone, real .git):  numTotalTests 2061  passed 2061  files 71  EXIT=0
    branch tip 4d3af39 (real tree):             numTotalTests 2063  passed 2063  files 71  EXIT=0
    files only in baseline: []      files only in tip: []

    per-file count differences (the ONLY entries that differ):
      src/lib/avatarUrl.test.ts : 3 -> 5   (+2)
      src/lib/firstRun.test.ts  : 29 -> 29  (0; one leg RENAMED, no leg added/removed)
      src/lib/firstRunTour.test.ts : 18 -> 18  (0; one word changed)

**Confirmed: the +2 is exactly `src/lib/avatarUrl.test.ts`, and nothing else moved.** The fix round touched
exactly three `*.test.*` files; of those, two are net-zero on legs, so the whole `2061 → 2063` lands in
`avatarUrl.test.ts` (3 → 5). The builder's per-file claim is exact.

## 3. `bash scripts/guards/run-all.sh` and `bash scripts/steering-lint.sh`

    $ bash scripts/steering-lint.sh
    STEERING EXIT=0
    PASS — steering layer is clean.

    $ bash scripts/guards/run-all.sh
    GUARDS EXIT=1
      note — no-bare-head-count: scanned 144 WORKING-DIR file(s); 1 untracked
      FINDING [no-bare-head-count]: .scratch/v28/reports/slice-8a-review-2.md:52: ...
      FINDING [no-bare-head-count]: .scratch/v28/reports/slice-8a-review-2.md:98: ...
    FAIL — 2 factory finding(s).
    GUARDS: FAIL — 1 guard(s) reported findings.

**The standalone guards lane is red, and I measured the cause: it is the ROUND-2 REVIEW lane's untracked
report, not the slice.** Timeline (mtimes, `-0700`):

- `/tmp/verify-round2.log` (the whole `npm run verify`, GUARDS: PASS) → **11:51:26**
- `.scratch/v28/reports/slice-8a-review-2.md` written → **11:52:04** (the concurrently-running sibling
  review run `2ab773ac`, still running)
- `/tmp/guards-standalone.log` (EXIT=1) → **11:53:09**

The guard's own note shows the delta: verify scanned 143 tracked files; the standalone run scans 144 with
**1 untracked** — exactly the new review report. Both findings point only at that file (lines 52 and 98).
`git status --short` in the repo reports only `?? .scratch/v28/reports/slice-8a-review-2.md`. Every
factory-guard self-test is green in the same run (`✓ a declared claim rule 3 cannot CHECK …`, etc.), so no
rule is broken; the corpus grew.

This is D-021's known behaviour: a lane report that quotes the class re-grows the red, and it is **absorbed
by re-deriving the baseline, never by hand-editing the record** (see §6). The fix round's own tree passed
this same lane inside `npm run verify` 38 seconds earlier, before the sibling artifact existed.

## 4. The two mutations that are the whole point — re-derived in `/tmp/v8a-mut2`

Clone of the branch tip, `node_modules` symlinked, `.env` copied. Baseline first: `npx playwright test
zip-radius.e2e.ts` → **`3 passed (18.9s)`**.

### (A) The stub never fires — the pattern matches nothing

Edit: `e2e/fixtures.ts:33` `NOMINATIM_ROUTE`'s `search\?` → `search2\?`. Command `npx playwright test
zip-radius.e2e.ts`:

    Running 3 tests using 1 worker
      ✘  1 [setup] › e2e/auth.setup.ts:66:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (7.7s)
        Error: finishSignup's address-lookup stub NEVER FIRED: the area card's Nominatim request did not reach page.route(NOMINATIM_ROUTE). Either the route pattern no longer matches the URL the app requests, or the card never asked. This is a FINDING, not a flake — without the stub the walk is answered by the REAL network, whose postcode for "1200 1st Ave S, Seattle" is a SEEDED gazetteer zip, so validateHomeZip would pass and this walk would write a DIFFERENT home zip while still going green. Fix the stub or the address.
        expect(received).toBeGreaterThan(expected)
        Expected: > 0
        Received:   0
        Call Log:
        - Timeout 5000ms exceeded while waiting on the predicate
           at fixtures.ts:600
      1 failed
        [setup] › e2e/auth.setup.ts:66:1 › sign up the marker, onboard it (zip + radius), save the signed-in state
      2 did not run

**FAILS QUICKLY (leg 7.7s — the 5s poll, not a ~30s ending-card hang) with the tripwire's own message.** Not
green. The builder's `1 failed in 7.7s` is exact.

### (B) The stub answers a DIFFERENT SEEDED zip (98104)

Edit: `e2e/fixtures.ts:531` the fulfilled postcode `options.homeZip` → `'98104'` (matching nothing else).
Command `npx playwright test zip-radius.e2e.ts`:

    Running 3 tests using 1 worker
      ✘  1 [setup] › e2e/auth.setup.ts:66:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (18.7s)
        Error: expect(locator).toContainText(expected) failed
        Locator: getByTestId('feed-location-control')
        Expected substring: "98107"
        Received string:    "Drop-ins near youNear 98104 · within 5 miles"
        Timeout: 15000ms
      1 failed
        [setup] › e2e/auth.setup.ts:66:1 › sign up the marker, onboard it (zip + radius), save the signed-in state
      2 did not run

**The walk COMPLETED** (18.7s; the ending card rendered and the setup leg reached the assertion — i.e. 98104
is a seeded zip that passed `validateHomeZip`, exactly the silent-wrong-zip path) **and the ZIP PIN caught
it.** The pin IS load-bearing. The builder's claim (18.2s, `Expected substring '98107'` / `Received '…Near
98104 · within 5 miles'`) is reproduced. **This is NOT a blocking finding — the original defect is closed.**

### Restored

`git checkout -- e2e/fixtures.ts` then `npx playwright test zip-radius.e2e.ts`:

    Running 3 tests using 1 worker
      ✓  1 [setup] › e2e/auth.setup.ts:66:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (3.6s)
      ✓  2 [chromium] › e2e/zip-radius.e2e.ts:34:1 › the marker's /settings edits distance but not the home ZIP (V27) (1.2s)
      ✓  3 [chromium] › e2e/zip-radius.e2e.ts:52:1 › a host marker's drop-in reaches a viewer's radius feed with an "N mi" label (6.2s)
      3 passed (16.5s)

## 5. The new `avatarUrl.test.ts` legs are source-level — the faithful restatement must FAIL

I wrote a FAITHFUL restatement of the predicate **WITH the `''` clause** into the throwaway clone's
`src/pages/ProfilePage.tsx`, replacing line 1227's
`{profile !== null && hasAvatarUrl(profile.avatar_url) ? (` with
`{profile !== null && profile.avatar_url !== null && profile.avatar_url !== undefined && profile.avatar_url !== '' ? (`,
then `npx vitest run src/lib/avatarUrl.test.ts`:

     ❯ src/lib/avatarUrl.test.ts (5 tests | 2 failed) 5ms
       ❯ the render site CALLS this predicate (V28 r2 slice 8a fix round 1) (2)
         × the identity card calls hasAvatarUrl 3ms
         × and never compares the column inline — the restatement this module exists to stop 1ms

     FAIL  ... > the identity card calls hasAvatarUrl
    AssertionError: ProfilePage.tsx must CALL hasAvatarUrl for its avatar branch: expected 'import { useCallback, useEffect, useR…' to match /hasAvatarUrl\(/

     FAIL  ... > and never compares the column inline — the restatement this module exists to stop
    AssertionError: ProfilePage.tsx must not restate the avatar-presence test inline: expected 'import { useCallback, useEffect, useR…' not to match /avatar_url\s*(===|!==|==|!=)/

     Test Files  1 failed (1)
          Tests  2 failed | 3 passed (5)

**Both source-level legs go RED on a faithful restatement WITH the `''` clause.** The builder's mutation C is
reproduced (its `2 failed | 3 passed`). The pin is load-bearing at source level; a restatement that passes
every behavioural test still fails the call legs. (Clone restored afterwards: `git status --porcelain` → 0.)

## 6. The declared edit to another lane's report — MEASURED, and adjudicated

**The brief's "diff against its previous commit" does not apply: the file has no previous commit.** The
report was UNTRACKED until meta-commit `4d3af39` (which records it as `new file mode`, `@@ -0,0 +1,219 @@`),
and `git log --all -- .scratch/v28/reports/slice-8a-verify.md` names only `4d3af39`. So there is no
committed "before".

**I recovered the true before anyway, from the round-1 verifier's own run.** The verifier wrote the file via
a heredoc, and that write is recorded in its run artifact
`/tmp/pi-subagents-uid-1000/async-subagent-runs/034807cd-df57-4e8d-b023-137d6ebff3c0/events.jsonl`
(`toolCallId call_8iqzpn6s`). That heredoc is the ONLY write to the file in that run (no second write, no
`sed -i`). I extracted it to `/tmp/orig-verify.md` (**13997 bytes, 219 lines**) and diffed it against the
committed/current file (219 lines). The complete diff is:

    6c6
    < (`.scratch/v28/ledger.md`, `.scratch/v28/reports/slice-8a.md`, `factory/work/v28-r2-8a.json`; `git diff ae578c2..HEAD` shows
    ---
    > (`.scratch/v28/ledger.md`, `.scratch/v28/reports/slice-8a.md`, `factory/work/v28-r2-8a.json`; `git diff ae578c2..322902f` shows
    52c52
    < Final `ae578c2` / working tree: **2061 tests, 71 test files** (§1). Test-FILE list is byte-identical between
    ---
    > Final `ae578c2` (tree `322902f`, `git status` clean): **2061 tests, 71 test files** (§1). Test-FILE list is byte-identical between

Exact before/after of the two tokens:

| # | BEFORE (round-1 verifier, verbatim) | AFTER (committed) |
|---|---|---|
| 1 | the diff's right-hand side `git diff ae578c2..HEAD` | `git diff ae578c2..322902f` |
| 2 | the label `Final \`ae578c2\` / working tree:` | the label `Final \`ae578c2\` (tree \`322902f\`, \`git status\` clean):` |

**Was any finding, number, or verdict altered? NO — measured, not asserted.** Across all 219 lines only
these two differ. Both edits are pure provenance-token substitutions whose meaning is identical (`HEAD` at
that moment WAS `322902f`; `working tree` → `tree 322902f, git status clean`). Every number is byte-identical
(`2061`, `71`, `1789`, `0`, `81`), the verdict line `**VERIFY: PASS**` (line 9) is untouched, and no
finding/section/claim text moved. So the builder's "no finding, number, verdict or claim altered" is TRUE —
and now independently provable. (The round-2 review's "there is no pre-edit snapshot anywhere / it rests on
the builder's word" is CORRECTED: the snapshot exists, in the verifier's own run log, and I diffed it.)

**Adjudication of the convention (D-011 item 2 / D-021 item 2):**

1. **Was the convention violated? YES.** The convention is that another lane's historical record KEEPS its
   labels and is ABSORBED BY RE-DERIVATION — never hand-edited. The builder hand-edited it. The record on
   disk no longer matches what the verifier wrote; a reader of the committed artifact sees tokens the
   verifier never authored.
2. **Was any finding/number/verdict altered? NO** (the measured diff above). So the damage is provenance,
   not content — a real but bounded deviation.
3. **Was re-derivation available? YES.** `scripts/guards/factory-guard.mjs` carries the `no-bare-head-count`
   baseline as a recorded map and the run PRINTS its size ("baseline holds 647 recorded occurrence(s)"); the
   batch has an established re-derivation path for exactly this case (`.scratch/v28/ledger.md`: the
   slice-6c final lane reports' own bare-HEAD quotations were "ABSORBED BY RE-DERIVATION … baseline 628 →
   631", explicitly "never hand-added"). The correct action was to re-derive the baseline (a guard edit,
   which is 8b's nominal lane / the orchestrator's call), or to have the orchestrator do it — NOT to rewrite
   the verifier's record.

**Note on this report itself (the corpus tax, stated rather than hidden):** the "before" quotes above
reproduce the exact flagged spellings, so this lane record will itself be flagged by `no-bare-head-count`
until the baseline is re-derived. That is the correct absorption path — do NOT hand-edit this file. This is
the same class the fix round was reacting to, one level up.

## 7. Residual risks

- **Standalone `guards` is red until re-derivation.** Cause: `.scratch/v28/reports/slice-8a-review-2.md`
  (round-2 review lane, untracked, written 11:52:04) — and now this report. Both are absorbed by re-deriving
  the `no-bare-head-count` baseline. Not a fix-round defect.
- **The branch tip moved under the brief** (`ece6fd4` → `4d3af39`) while I ran; the added commit is
  meta-only, so the measurements hold, but the orchestrator should expect lane-report churn to keep
  re-growing the guard red.
- The fix-round claims I did NOT re-run: the full 4-file playwright group and the "36 instances" audit
  table (outside the brief's named targets); I re-ran the mutation lane only.
- `scripts/guards/lib-sibling-guard.sh` passing at `checked=0` remains an open D-030 hole, assigned to 8b.

**Verdict: VERIFY: PASS** — every named figure re-measured; the two mutations fire at both granularities
(A: 1 failed, 7.7s, tripwire message; B: 1 failed, 18.7s, pin `Expected "98107"` / `Received "…Near 98104 ·
within 5 miles"`), the restored tree is green, and the source-level call legs fail on a faithful restatement.
The one red lane is a concurrent sibling artifact, named.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "npm run verify EXIT=0 (71 test files / 2063 tests / 81 warnings / 0 errors / AGENTS.md 1789 of 1800 / GUARDS PASS); +2 re-derived per-file by JSON diff of a clean ae578c2 clone vs the branch tip (only src/lib/avatarUrl.test.ts 3->5); mutation A 1 failed in 7.7s with the tripwire's own message; mutation B walk completed 18.7s and the zip pin failed Expected '98107' / Received '...Near 98104 ... within 5 miles'; restored 3 passed; source-level call legs 2 failed | 3 passed on a faithful restatement WITH the '' clause; the declared edit to slice-8a-verify.md measured as exactly 2 provenance tokens with no finding/number/verdict changed."
    }
  ],
  "changedFiles": [
    ".scratch/v28/reports/slice-8a-verify-2.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    { "command": "npm run verify", "result": "passed", "summary": "exit 0; 71 test files / 2063 tests; 81 warning / 0 error; AGENTS.md 1789/1800; GUARDS PASS; real 1m7.6s" },
    { "command": "npx vitest run --reporter=json (clean clone at ae578c2)", "result": "passed", "summary": "2061 tests / 71 files, all passed, exit 0" },
    { "command": "npx vitest run --reporter=json (branch tip 4d3af39)", "result": "passed", "summary": "2063 tests / 71 files; only per-file delta is avatarUrl.test.ts 3->5" },
    { "command": "bash scripts/steering-lint.sh", "result": "passed", "summary": "exit 0; PASS — steering layer is clean" },
    { "command": "bash scripts/guards/run-all.sh", "result": "failed", "summary": "exit 1; sole findings are the concurrent round-2 review artifact slice-8a-review-2.md lines 52/98 (untracked, written after verify passed); GUARDS PASS inside npm run verify at 11:51:26" },
    { "command": "npx playwright test zip-radius.e2e.ts (baseline, /tmp/v8a-mut2)", "result": "passed", "summary": "3 passed (18.9s)" },
    { "command": "npx playwright test zip-radius.e2e.ts (mutation A: pattern matches nothing)", "result": "failed", "summary": "1 failed (leg 7.7s) / 2 did not run — tripwire message, Received 0, 5s poll timeout, fixtures.ts:600" },
    { "command": "npx playwright test zip-radius.e2e.ts (mutation B: stub answers 98104)", "result": "failed", "summary": "1 failed (leg 18.7s) / 2 did not run — walk completed, pin failed Expected '98107' / Received '...Near 98104 ... within 5 miles'" },
    { "command": "npx playwright test zip-radius.e2e.ts (restored)", "result": "passed", "summary": "3 passed (16.5s)" },
    { "command": "npx vitest run src/lib/avatarUrl.test.ts (faithful restatement WITH '' clause in ProfilePage.tsx)", "result": "failed", "summary": "2 failed | 3 passed — both source-level legs red" }
  ],
  "validationOutput": [
    "Test Files 71 passed (71) / Tests 2063 passed (2063); warning lines 81; error lines 0; ok — AGENTS.md (1789 words, ceiling 1800); GUARDS: PASS",
    "baseline ae578c2: numTotalTests 2061, passed 2061, files 71, exit 0; tip: 2063, files 71; per-file diff { avatarUrl.test.ts: [3,5] }",
    "mutation A: Error: finishSignup's address-lookup stub NEVER FIRED ... / Expected: > 0 / Received: 0 / Timeout 5000ms exceeded / at fixtures.ts:600",
    "mutation B: Error: expect(locator).toContainText(expected) failed / Expected substring: \"98107\" / Received string: \"Drop-ins near youNear 98104 · within 5 miles\"",
    "mutation C: FAIL src/lib/avatarUrl.test.ts > ... > the identity card calls hasAvatarUrl / AssertionError ... to match /hasAvatarUrl\\(/ ; and the never-compares leg red on /avatar_url\\s*(===|!==|==|!=)/",
    "item 4: diff of the round-1 verifier's own heredoc write (219 lines) vs committed file = only lines 6 and 52, both provenance tokens"
  ],
  "residualRisks": [
    "Standalone guards exit 1 until the no-bare-head-count baseline is re-derived: cause is the concurrent round-2 review report (untracked) plus this report; not the fix round.",
    "The branch tip advanced from the briefed ece6fd4 to 4d3af39 (meta-only commit) while this lane ran.",
    "The full 4-file playwright group and the builder's '36 instances' audit table were not re-run (outside the named targets).",
    "scripts/guards/lib-sibling-guard.sh passes at checked=0 — open D-030 hole owned by 8b."
  ],
  "noStagedFiles": true,
  "diffSummary": "No repo file edited by this lane except the new verification artifact .scratch/v28/reports/slice-8a-verify-2.md; all mutations/reverts done in /tmp clones.",
  "reviewFindings": [
    "no blockers in the fix round: B1 closed at both granularities; B2 one copy; the +2 is exactly avatarUrl.test.ts",
    "process finding: the builder HAND-EDITED another lane's historical record (slice-8a-verify.md) instead of re-deriving the guard baseline (D-011 item 2 / D-021 item 2) — convention violated, but the measured diff is exactly 2 provenance tokens with no finding/number/verdict changed",
    "environmental: standalone guards red solely from the concurrent round-2 review artifact (slice-8a-review-2.md, untracked)"
  ],
  "manualNotes": "The brief's 'diff slice-8a-verify.md against its previous commit' premise does not hold — the file had no prior commit; I recovered the true pre-edit text from the round-1 verifier's own run artifact (034807cd events.jsonl, heredoc write call_8iqzpn6s) and diffed it. That also corrects the round-2 review's claim that no pre-edit snapshot exists. No listener on :4173 before my runs; Playwright's own webServer handled it and was gone after. No inference server touched; no push."
}
```
