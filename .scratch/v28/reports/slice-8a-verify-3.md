# Slice 8a — VERIFICATION, ROUND 3 (fresh context)

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

**VERIFY: PASS** — every named figure re-measured; the BLK-1 restoration is byte-for-byte (sha256
equal), the baseline re-derivation matches the corpus exactly with **no key lost**, and all three
`avatarUrl` mutations are RED on throwaway copies. One brief premise did not hold (the tip had moved),
and one builder parenthetical is imprecise (named in §5); neither is a slice defect.

## 0. Provenance — the brief's HEAD is stale, and that is meta-only

The brief says "fix round 2 is 3 commits at HEAD `1c30d6a`". Measured:

```
$ git rev-parse --short HEAD          -> 01930a7
$ git log --oneline -4
01930a7 8a: fix round 2 recorded — ...
7647401 ledger: cite the avatar pin assertion by symbol, ...
1c30d6a 8a fix round 2: the round-2 section, the four in-place corrections, and the rule
3b170d1 8a fix round 2: the avatarUrl call legs are comment-proof, ...
$ git rev-list c3f65b2~1..1c30d6a     -> 1c30d6a 3b170d1 c3f65b2   (the 3 fix-round-2 commits)
$ git diff --stat 1c30d6a..HEAD       -> .scratch/v28/ledger.md | 6 +++++-   (ONLY)
```

So the 3 fix-round-2 commits are `c3f65b2` (BLK-1 record restore + baseline re-derivation), `3b170d1`
(the legs), `1c30d6a` (round-2 section + corrections + the rule). Two later commits (`7647401`,
`01930a7`) touch **only** `.scratch/v28/ledger.md`; no source/test/guard file changed after `1c30d6a`.
All measurements below are of the same code tree as `1c30d6a`.

Read first (as instructed): `.scratch/v28/reports/slice-8a-review-2.md` and the `# FIX ROUND 2` section
of `.scratch/v28/reports/slice-8a.md` (`:550`-`701`).

## 1. `npm run verify` — re-measured raw

```
$ npm run verify        > /tmp/verify-r3.log 2>&1 ; VERIFY EXIT=0
```

| Figure | Builder claimed | **I measured** | Match |
|---|---|---|---|
| exit code | 0 | **0** | ✓ |
| test files | 71 | **71** (`Test Files 71 passed (71)`) | ✓ |
| tests | 2063 | **2063** (`Tests 2063 passed (2063)`) | ✓ |
| lint `: warning ` lines | 81 | **81** (`grep -c ': warning '` on the run) | ✓ |
| lint `: error ` lines | 0 | **0** (`grep -c ': error '`) | ✓ |
| `AGENTS.md` words vs 1800 | 1789 | **1789 / 1800** (`ok — AGENTS.md (1789 words, ceiling 1800)`) | ✓ |
| GUARDS (inside verify) | PASS | **PASS**, `factory-guard check: all 90 checks passed` | ✓ |
| `no-bare-head-count` printed size | 658 | **`baseline holds 658 recorded occurrence(s)`** | ✓ |

### The "2063 tests, ZERO delta" claim — re-derived per file, not repeated

Method: `git clone` of the repo to `/tmp/r3-base`, `git checkout 4d3af39` (the round-2 verify lane's own
tip), `node_modules` symlinked, `.env` copied, `npx vitest run --reporter=json --outputFile=...`; same on
the real tree (`01930a7`). No test file was edited, added, removed or renamed.

```
BASE (4d3af39):  numTotalTests 2063   files 71   EXIT=0
HEAD (01930a7):  numTotalTests 2063   files 71   EXIT=0
files only in HEAD: []      files only in BASE: []
total per-file count diffs: 0        sum head 2063 == sum base 2063
```

And the structural confirmation that the legs were REWRITTEN, not added:

```
$ git diff --name-only 91ecb7f..01930a7 -- '*test*'   -> src/lib/avatarUrl.test.ts   (the ONLY one)
$ git show 91ecb7f:src/lib/avatarUrl.test.ts | grep -c '  it('   -> 5
$ grep -c '  it(' src/lib/avatarUrl.test.ts                       -> 5
```

**Confirmed: the delta is genuinely ZERO.** Fix round 2 changed exactly five files
(`.scratch/v28/ledger.md`, `.scratch/v28/reports/slice-8a-verify.md`, `.scratch/v28/reports/slice-8a.md`,
`scripts/guards/factory-guard.mjs`, `src/lib/avatarUrl.test.ts`); the only test file is
`avatarUrl.test.ts`, whose leg count is unchanged at 5. The suite count stays 2063.

## 2. Standalone lanes — both green; no lane-report tax on the committed tree

```
$ bash scripts/guards/run-all.sh      -> GUARDS EXIT=0
   factory-guard check: all 90 checks passed.
   GUARDS: PASS — all deterministic rules hold.
$ bash scripts/steering-lint.sh       -> STEERING EXIT=0
   PASS — steering layer is clean.
```

The guard's own scan note at this tree: `no-bare-head-count: baseline holds 658 recorded occurrence(s);
scanned 145 WORKING-TREE file(s); git tracks 145 under the same paths (0 untracked, 0
tracked-but-absent)`.

**No lane-report red this round.** The round-2 review's cause (an *untracked* sibling report) is gone:
all 41 `.scratch/v28/reports/*.md` files are now tracked (`git ls-files .scratch/v28/reports/ | wc -l`
→ 41), and `git status --porcelain` is empty. The standalone lane is green on the committed corpus.
(§7 measures the state after THIS report is written, which is the corpus tax the brief warned about.)

## 3. BLK-1 — restoration re-derived, BYTE-FOR-BYTE

**Recovered independently, from the round-1 verifier's own run artifact**, not from any committed copy.
`/tmp/pi-subagents-uid-1000/async-subagent-runs/034807cd-df57-4e8d-b023-137d6ebff3c0/events.jsonl`,
`toolCallId call_8iqzpn6s`. A scan of that run's events shows the file is touched by exactly two bash
calls: `call_8iqzpn6s` (the heredoc write; `tool_execution_end` → `WROTE 219 lines`) and
`call_ez2yde8y` (`ls -l` / `head` / `tail` — a read). The only tool used in the whole run is `bash`
(no `edit` tool), so the heredoc is the **only** write.

I reconstructed the heredoc body (prefix through the `\nREPORT\necho ...` terminator) to
`/tmp/orig-verify-r3.md` and diffed it against the artifact:

```
$ diff /tmp/orig-verify-r3.md .scratch/v28/reports/slice-8a-verify.md
(no output)   DIFF EXIT=0
$ sha256sum /tmp/orig-verify-r3.md .scratch/v28/reports/slice-8a-verify.md
560367396ca01e0cc3e988860b515cced6480c60ace5fd9e3f3174af2f72f730  /tmp/orig-verify-r3.md
560367396ca01e0cc3e988860b515cced6480c60ace5fd9e3f3174af2f72f730  .scratch/v28/reports/slice-8a-verify.md
```

**Raw result: EMPTY diff, identical sha256, 219 lines / 13997 bytes.** The committed artifact is the
round-1 verifier's own recorded write, exactly.

The two formerly hand-edited lines now carry the ORIGINAL spellings:

```
$ git diff 4d3af39..HEAD -- .scratch/v28/reports/slice-8a-verify.md
-(... `git diff ae578c2..322902f` shows      <- the retro-edit
+(... `git diff ae578c2..HEAD` shows         <- the verifier's own token, restored
-Final `ae578c2` (tree `322902f`, `git status` clean):   <- the retro-edit
+Final `ae578c2` / working tree:                          <- the verifier's own label, restored
```

Exactly two lines differ between the first recorded commit and HEAD, and both are the original tokens
returned. No other line moved. **BLK-1 is genuinely undone.**

## 4. The baseline re-derivation — 658 printed, idempotent, and NOTHING LOST

**(a) The printed size.** Both `npm run verify`'s guards step and the standalone guard print
`baseline holds 658 recorded occurrence(s)`. The committed map evaluates to **426 distinct keys, sum
658** (parsed out of `factory-guard.mjs` with `new Function` over its own array literal — the file's
real contents, not a transcription).

**(b) Idempotent.** `node scripts/guards/factory-guard.mjs` run twice → exit 0 / exit 0 and
`diff` of the two outputs → **IDENTICAL**.

**(c) NO key lost — the occurrence map built from scratch.** I copied `factory-guard.mjs` to
`/tmp/r3-guard-empty.mjs` with its `BARE_HEAD_BASELINE` map emptied (comments and structure intact),
ran it twice against this tree with `--root` / `--repo`, and parsed every
`FINDING [no-bare-head-count]` (658 of them, one per occurrence) back into an occurrence map:

```
emptied-map run: 658 findings (parsed 658, unparsed 0)  ->  426 distinct keys, sum 658
two runs: byte-identical logs
committed map:   426 distinct keys, sum 658
keys in committed but ABSENT from fresh derivation (COVERAGE LOSS): 0
keys in fresh derivation but ABSENT from committed: 0
count mismatches: 0
```

**A baseline that silently drops coverage would have shown up here. It does not: the fresh derivation
from the instrument's own matches reproduces the committed map exactly — same keys, same counts.**

**(d) The two-stage absorption, re-derived against the previous committed map.** Extracting
`BARE_HEAD_BASELINE` from the pre-round-2 tree (`91ecb7f`) gives **417 keys / 647 occurrences**:

```
pre-round2 (91ecb7f): keys 417  sum 647
committed now:        keys 426  sum 658
keys present pre-round2 but ABSENT now (coverage loss): 0
keys whose count changed: 0
keys added this round: 9   occurrences added: 11
```

The 9 added keys are exactly the lane-report quotations: the 7-key/8-occurrence first stage
(`slice-8a-review-2.md` ×2, `slice-8a-verify-2.md` ×3, `slice-8a-verify.md` ×2 — the last pair is the
restored spellings) plus the 2-key/3-occurrence second stage (`slice-8a.md`'s own quotations:
`199`. True at `508d656`, stale at HEAD ×1 and `git diff ae578c2..HEAD` ×2). **+7/+8 then +2/+3 = my
+9/+11, exactly.** No committed key changed its count; none disappeared.

## 5. The three `avatarUrl` mutations — re-derived on a throwaway clone

Clone of the repo at `01930a7` to `/tmp/r3-mut`, `node_modules` symlinked, `.env` copied. Baseline:
`npx vitest run src/lib/avatarUrl.test.ts` → **`5 passed (5)`**.

**(a) COMMENT-ONLY mention, code does NOT call it** (call replaced by the inline restatement; a comment
says `hasAvatarUrl(profile.avatar_url)`):

```
× the identity card calls hasAvatarUrl
× and never compares the column inline — the restatement this module exists to stop
AssertionError: ProfilePage.tsx must CALL hasAvatarUrl for its avatar branch (a mention in a comment is not a call): ... to match /hasAvatarUrl\(/
AssertionError: ProfilePage.tsx must not restate the avatar-presence test inline: ... not to match /avatar_url\s*(===|!==|==|!=)/
Tests  2 failed | 3 passed (5)
```

**RED at both legs.**

**(b) EMPTY `?raw` read** (the import pointed at a 0-byte file):

```
× the identity card calls hasAvatarUrl
× and never compares the column inline — the restatement this module exists to stop
AssertionError: the ?raw read of ProfilePage.tsx is EMPTY — this leg would measure nothing: expected 0 to be greater than 0
AssertionError: the ?raw read of ProfilePage.tsx is EMPTY — a negative assertion over nothing is vacuously true: expected 0 to be greater than 0
Tests  2 failed | 3 passed (5)
```

**RED at both legs — the D-030 hole (a negative leg green on nothing) is closed at its own granularity.**

**(c) FAITHFUL restatement** (call gone, inline check with the `''` clause, no comment):

```
Tests  2 failed | 3 passed (5)   — both source legs red
```

**RED.** Restored afterwards: `git checkout --` both files → **`5 passed (5)`**.

### The round-1 green claim — verified, with one imprecision named

The builder's parenthetical (FR2-4(b)): "the same mutated file, measured against the round-1 leg's view:
`/hasAvatarUrl\(/` over raw text → MATCH (would have been GREEN)."

Measured on mutation (a) directly against the mutated source text:

```
ROUND-1 leg1 /hasAvatarUrl\(/                      raw text -> MATCH?  true
ROUND-1 leg2 /avatar_url\s*(===|!==|==|!=)/        raw text -> MATCH?  true
```

- **The first half holds:** round 1's raw-text call leg DID match the comment-only file — the comment
  satisfies it with no call. That is the hole, measured.
- **The inference "round 1 would have been GREEN" does NOT hold for the exact file it describes.** With
  the inline restatement, round-1 leg 2 also matches, so round 1's *pair* would be **RED (1 of 2)**.
- The hole was real, but it needs the alias restatement the round-2 review named. Re-run with a local
  alias (`const url = profile.avatar_url; … url !== ''`) and the same comment:

```
ROUND-1 leg1 raw -> true    ROUND-1 leg2 raw -> false
=> round-1 PAIR GREEN while the page never calls the predicate
current (round-2) legs -> 1 failed | 4 passed   (the call leg catches it)
```

So: the substance (round 1 could be green with no call) is **verified**; the builder's shorthand is
true of leg 1 and of the pair only on the alias variant, not on the inline-restatement file quoted
beside it. Non-blocking (it is a parenthetical, not a number or a mechanism claim).

## 6. Everything else checked

- `git status --porcelain` → empty before and after all runs; `dist/` unchanged in git.
- The repo was never edited: all mutations and the emptied-map guard live in `/tmp/r3-mut`,
  `/tmp/r3-base`, `/tmp/r3-guard-empty.mjs`, `/tmp/orig-verify-r3.md`.
- No inference server started or stopped; no push.
- The round-1 heredoc recovery's own tool census: `{'bash': ['call_8iqzpn6s', 'call_ez2yde8y']}`.

## 7. Residual risks

- **The corpus tax is live again the moment this report lands.** This report quotes the flagged
  spellings (the two restored tokens in §3, `git diff ae578c2..HEAD` in §4 etc.), so the standalone
  `guards` lane will scan one extra UNTRACKED file and re-grow the red until the
  `no-bare-head-count` baseline is re-derived. That is D-021 item 2's designed absorber and the
  orchestrator's to run — **do NOT hand-edit this report.** Measured post-write state is in the line
  below (if present); if it is red, the cause is this lane report, not the slice.
- The brief's HEAD (`1c30d6a`) was two ledger-only commits behind reality; a brief that pins a moving
  tip should expect `git diff <tip>..HEAD` to be checked, not assumed.
- The two-stage baseline derivation's *intermediate* states are not reproducible from the committed
  tree (only the endpoints are); I verified the endpoint against both the pre-round map and a fresh
  derivation, which is the decidable half.
- `scripts/guards/lib-sibling-guard.sh` passing at `checked=0` remains an open D-030 hole assigned to
  8b (unchanged by this slice).

**Verdict: VERIFY: PASS.**


## 8. Post-write guard state (measured, so §7 is not a guess)

After this report was written (untracked), the standalone lane was re-run:

```
$ bash scripts/guards/run-all.sh        -> GUARDS EXIT=1
   note — no-bare-head-count: baseline holds 658 recorded occurrence(s)
   note — no-bare-head-count: scanned 147 WORKING-TREE file(s); git tracks 145 under the same paths (2 untracked, 0 tracked-but-absent)
   11 FINDING [no-bare-head-count]: 10 in .scratch/v28/reports/slice-8a-verify-3.md, 1 in .scratch/v28/reports/slice-8a-review-3.md
   FAIL — 11 factory finding(s).   GUARDS: FAIL — 1 guard(s) reported findings.
$ bash scripts/steering-lint.sh         -> STEERING EXIT=0, PASS
```

**The red is the two round-3 LANE REPORTS, not the slice.** The baseline is unchanged at 658; the delta
is two untracked files (145 → 147 working-tree files, 0 → 2 untracked). `.scratch/v28/reports/
slice-8a-review-3.md` is a concurrently-appearing sibling lane report (the round-3 review, written
while this lane ran); ten of the eleven findings are this report's own quotations of the flagged
spellings — the evidence the brief asked me to keep. This is exactly D-021's corpus tax: the reports
quote the class, so they re-grow the red by design, absorbed by **re-deriving** the baseline — never by
hand-editing either record. The committed-tree state of §2 (0 untracked, guards exit 0) is the one
that measures the slice.
