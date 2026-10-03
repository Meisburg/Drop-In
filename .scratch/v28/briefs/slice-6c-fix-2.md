# Slice 6c — FIX ROUND 2 (findings from the fix-round-1 reviewer and from `ocr`, verbatim)

**Working directory:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
**Base for this round:** `50009ae` — **plus one orchestrator ledger commit, `0205c8d`, on top. Both are report-only.**
**Round 1's slice commit:** `c2ec32e`.
**Read `docs/agents/code-structure.md`.** Small edits only. **Report to `.scratch/v28/reports/slice-6c-fix-2.md`.**

---

## ⚠️ STATE AT DISPATCH — a previous builder did part of this round and was OOM-KILLED. You are a fresh builder continuing it.

**Its work is ON DISK, UNCOMMITTED. Do not redo it; verify it and finish it.**

- **`scripts/guards/regexp-escape-guard.check.mjs`** — modified (`+172/−…`, net 116 insertions / 75 deletions):
  the `seedCase(...)` helper (O5), the split-out premise check (N3/O1/O3), the nested-skip case (O2), the
  `.d.cts` case (O4), and the `all N checks passed` line.
- **`scripts/guards/regexp-escape-guard.mjs`** — modified (`+19`): the success line (N2) and the printed scope
  line (O6).
- **`.scratch/v28/reports/slice-6c-fix-2.md`** — **exists with its per-finding table already filled in**, and
  every section below the table still reads `_(appended as produced)_`.
- **NOT YET TOUCHED — these findings are still OPEN:** `docs/agents/code-structure.md` (**N1**), the `260` at
  `.scratch/v28/reports/slice-6c.md:267` (**B1**), and the `+181/−19` in `.scratch/v28/reports/slice-6c-fix-1.md` (**N4**).

**It died mid-sentence on a self-caught defect, and that sentence is worth acting on.** Its last recorded
words were: **"The premise check passed on its own error message — a check that cannot fail. Fixing:"** — so
**audit the premise check you inherit for exactly that**: a check which passes because it is asserted against
its own error message passes for the wrong reason. **A check that cannot fail is not pinning anything.**

**Why it died, so you do not repeat it:** `systemd-oomd` killed the local model process (58 processes, 53.8 GB
peak). **It is not your builder's fault and not its work — the local model needs ~55 GB resident and this repo's
`npm run verify` must run inside the same 62 GB machine.** `strata-max` is **deliberately stopped** for this
round: **do not start it, and do not treat its absence as a finding.** RAM is free now.

**The report convention is load-bearing and it worked:** a lane died, its evidence did not, because it was
told to write the report first and append as it went. **Keep doing that** — append each raw tail to
`.scratch/v28/reports/slice-6c-fix-2.md` as you produce it.

---

## Round 1's three lanes, and what each said

| lane | verdict |
|---|---|
| `orchestrator-verifier` (cloud) | **VERIFY: PASS** — `npm run verify` exit 0, **70 files / 2030 tests / 81 warnings / 0 errors / GUARDS PASS**; guard exit 0 (one hit); check exit 0 (`all 9 checks passed`); `run-all.sh` exit 0; **every figure the report quoted reproduced.** Its full report is committed at `.scratch/v28/reports/slice-6c-fix-1-verify.md` |
| `orchestrator-reviewer` (cloud) | **NEEDS_CHANGES** — 1 blocking, 4 non-blocking. Full report: `.scratch/v28/reports/slice-6c-fix-1-review.md` |
| `ocr` (local, machine lane) | **status `complete`**, 6 findings across the 2 code files (2 medium, 4 low). **Findings pasted verbatim below — `ocr`'s JSON is `.scratch/ocr-6c-fix-1.json`, which `.gitignore:112` excludes, so this brief is where they enter the artifact.** |

**Verify PASSED and review did not.** The gate is green and stays green: **the baseline must not move in this round either.**

---

## [BLOCKING] B1 — a number the round corrected in two places and left standing in a third

**Reviewer, verbatim:**

> `.scratch/v28/reports/slice-6c.md:267` states "git TRACKS 260 files under `.scratch/`" as the reviewer's
> measurement. It reproduces nowhere this round can point at. Measured this run:
> `git ls-files .scratch | wc -l` → **262** at the round's base `c484648` (also 262 at `4c2d2ab`, `c336d07`);
> `git ls-tree -r --name-only <c> .scratch | wc -l` → **259** at `ce3479c`/`32e9f48`, the commits this round names
> as where the review's G1/G2 measurements were taken; **265** at `c2ec32e`/HEAD.
> The same round's own report declares exactly this figure stale — `slice-6c-fix-1.md:30,36,48` … **and corrected
> it in the header (`regexp-escape-guard.mjs:44`) and the case-4 comment (`regexp-escape-guard.check.mjs:114`).**
> The sentence carrying 260 was **added by this round** to one of the four in-scope files, and 260 sits at neither
> the base nor the reviewer's commits. **Same class as this round's GAP B (a stated count that does not
> reproduce); the correction went to two of the three places the number lives.**

**The orchestrator re-measured it independently and gets the same answer: 262 at `c484648`, 259 at `32e9f48`,
265 at HEAD. 260 reproduces at no commit.** It also attributes 260 to *the reviewer*, and **the ledger does not
contain that measurement** — so the sentence is wrong twice: the number and its provenance.

**RULING: do not replace 260 with 262.** Per this round's own rule (*a total over a corpus the report itself
grows is stale the moment anyone writes about it*), **delete the number and point at the header's dated figure**
— exactly as the G2 correction block was fixed to do. The sentence must stop claiming a reviewer measurement
that is not on record.

---

## Non-blocking findings — the orchestrator rules ALL FIVE IN. Fix every one.

**All five are the same class this batch has paid for six times: a sentence that states something other than
what the mechanism is.** None is cosmetic; each is a claim a future reader would act on.

### N1 — `docs/agents/code-structure.md:100-101` attributes words to two lanes that only one lane used

**Reviewer, verbatim:**

> `docs/agents/code-structure.md:100-101` — "**Two review lanes named the risk in the same words**: *a missed
> metacharacter in one copy silently over-matches the pin it builds*". Measured: the only wording on record is
> `ocr`'s, quoted identically at `.scratch/v28/briefs/slice-6c.md:12-13` and `.scratch/v28/briefs/slice-6.md:132`
> — *"implementations that drift independently — a missed metacharacter in one silently over-matches the pin"* —
> with the second lane recorded as having "flagged the same duplication as a drift risk", not as having used those
> words. The law doc's version is a paraphrase in quote position and adds "copy" / "it builds" / a clause the
> source doesn't have.

**Confirmed by the orchestrator by reading both files: `.scratch/v28/briefs/slice-6c.md:11-13` says exactly
"`ocr` called the copies *…* and the reviewer flagged the same duplication as a drift risk."** So the docs
section contradicts the record it is summarizing, inside quotation marks, in the build law.

**Fix:** quote `ocr` **verbatim** and describe the second lane as having flagged **the same duplication** — not
the same words. Do not invent a second quotation.

### N2 — `regexp-escape-guard.mjs:148` claims something the guard never measures

**Reviewer, verbatim:**

> the success line begins "**every other caller imports it**". The guard's actual test is `hits.length === 1 &&
> hits[0].startsWith(SANCTIONED)` (`:143`); **it never looks at callers.** The sentence is true of today's tree
> (measured: `firstRunTour.ts:83`, `weekly-series.e2e.ts:15`, `place-directory-in-new.e2e.ts:40`,
> `stale-locator-guard.mjs:90`, `vacuous-absence-guard.mjs:98` all import it), but it is a claim this instrument
> does not measure. Inherited clause (the base guard printed the same words); the round changed only the
> parenthetical, which is accurate.

**Fix:** make the printed line say what the guard actually establishes — **one occurrence, in the sanctioned
file** — and keep the scope clause. An instrument's own success line is the last place a boundary may be a story.

### N3 + O1 + O3 — the case-4 git step: it pins the premise, not the mechanism, and it can kill the run

**Reviewer, verbatim:**

> `scripts/guards/regexp-escape-guard.check.mjs:17-18,121` — the case-4 comment says the seed "is `git add`ed
> first, so the case can only pass on a genuinely tracked seed". True of the assertion (the `git ls-files` check
> gates it), but **the git step is not the mechanism: the guard skips by directory name and never consults git.**
> Measured: an **untracked** `.scratch/zz-probe.mjs` seed also returns exit 0 with the seed unnamed. So the git
> init pins the case's premise, not the skip.

**`ocr`, verbatim (two findings, same lines):**

> **(medium) 1.** Two coupled problems with the git setup in this case. … The guard never consults git —
> `walk()` is a plain `readdirSync` recursion gated by `SKIP_DIRS` name matching (`regexp-escape-guard.mjs:117-131`),
> and the header itself says "It is not a gitignore query". **So `tracked` cannot influence the guard's verdict:
> an *untracked* `.scratch` seed is equally uncounted. Gating the pass condition on `tracked.endsWith(...)`
> therefore makes this case fail (with the misleading message "the guard is not doing its job") for a reason that
> has nothing to do with the guard, and the case does not actually distinguish the mechanism its title claims to
> pin.**
>
> **(medium) 3.** These two `execSync` git calls are **the only unguarded external commands in the script, and the
> enclosing `try` has no `catch` — only `finally`. If git is missing, or git ≥2.35.2 refuses the temp repo
> (`detected dubious ownership` / `safe.directory`), or `git add` fails for any reason, the exception propagates:
> cases 5–9 and the final summary never run, and the run dies with a stack trace instead of a named check failure.**
> The script's stated contract is "exit 0 = check passes, 1 = the guard is not doing its job", so an environment
> hiccup is indistinguishable from a broken guard, and **five pinned behaviours silently stop being pinned.**
> Either wrap the git setup and feed the outcome to `check(...)`, or drop the git step entirely.

**RULING — the shape of the fix, because there is a wrong answer available:**
**Keep the tracked-ness assertion, but stop it from deciding the guard's case.** The premise matters — G1a was
that the header called `.scratch` "gitignored harness state" while **23 `.mjs` in it are tracked** — so the case
must still show a *tracked* seed. But:

1. **The git step and the `git ls-files` assertion become their OWN named check**, with a failure message that
   names **the premise**, not "the guard is not doing its job".
2. **It is wrapped so a git failure is a named failing check**, never an escaping exception. Cases 5–9 must
   still run and the summary must still print.
3. **The guard case itself asserts only what the guard establishes** — exit 0 and the seed unnamed.

**Do NOT simply delete the git step**: that would leave the case unable to show its own premise, which is the
"a seed must assert its own premise" rule this batch already wrote down.

### O2 — the "at any depth" half of the skip is stated but not pinned

**`ocr`, verbatim (low):**

> The rewritten SCOPE now makes "SKIP_DIRS is matched against a directory's **NAME at any depth**" the
> authoritative statement of the mechanism, but **neither new skip case pins the *any depth* half: both `.scratch`
> and `.vitest` seeds are written at the sandbox root.** An implementation that anchored the skip to the root
> (e.g. comparing `path.join(ROOT, '.vitest')`, or filtering on `entry.name` only at depth 1) keeps both cases
> green while the header sentence goes false — **the exact header/implementation drift this slice exists to
> prevent.** Seeding one nested copy would pin the claim.

**This is the batch's most-recurring class, named in the header of the very guard that has it.** Fix: seed a
skipped directory **not at the sandbox root** — e.g. `src/deep/.vitest/cache.mjs` — and require exit 0. *An
implementation that only skips `.vitest` at the root must fail that case.*

### O4 — `.cts` is stated in the header but never seeded

**`ocr`, verbatim (low):**

> `SCAN_EXT` now accepts `mts|cts`, and the guard header states both spellings as walked, but only `.d.mts` is
> seeded. **`.cts` (and `.d.cts`) is therefore stated-but-unpinned**, which contradicts the header's closing claim
> that "Both directions are pinned by `regexp-escape-guard.check.mjs`" — a later edit that drops `cts` from the
> alternation would keep all 9 checks green. Seeding one more file here closes the gap for the cost of two lines.

### O5 — five near-identical seed blocks, and one of them has no cleanup symmetry

**`ocr`, verbatim (low, maintainability):**

> This round grew the seed → `run()` → `check()` → `rmSync()` scaffold from three near-identical blocks to five
> (cases 2–6), differing only in path, seed name and the expected exit. The repetition is where drift creeps in —
> **e.g. cases 4/5 needed `mkdirSync` while case 6 silently relies on `src/lib` already existing**, and case 6 now
> has no cleanup symmetry with the new `.cts` seed. A small helper keeps the five cases one line each and makes
> the "seed is removed before the next case" invariant impossible to forget.

### O6 — the printed scope line splits a parenthesis across two lines

**`ocr`, verbatim (low, style):**

> The scope line is now split mid-sentence with the opening parenthesis on the first line and its match on the
> second, so each line read in isolation (or in a truncated CI log) shows an unbalanced paren. Prefer a single
> longer line, or two self-contained sentences, **so the printed scope statement stays readable when the two
> lines are not seen together.**

---

## N4 — the report's `+181/−19` is unverifiable by construction (state it as such)

**Reviewer, verbatim:**

> `.scratch/v28/reports/slice-6c-fix-1.md:14` (and the `c2ec32e` message) claim the previous builder's four files
> were "+181/−19". **The committed four-file diff is +191/−19** (`git diff --numstat c484648 c2ec32e -- <the four
> files>`), and **the pre-round working-tree state was never committed, so 181 cannot be reproduced by anyone.**
> The +10 is consistent with this round's own in-place corrections, but the figure is unverifiable by
> construction; I state that rather than pass it.

**Orchestrator measured it: `git diff --shortstat c484648 c2ec32e` over the four files = `191 insertions(+),
19 deletions(-)`.** `+181/−19` does have a source — `HANDOVER.md` records the handover working-tree figure — but
that state was overwritten. **Fix: state the committed `+191/−19`, name `HANDOVER.md` as where `+181/−19` came
from, and say plainly that the intermediate state is unreproducible.** Do not delete the history; label it.

---

## Acceptance

1. **B1 fixed** — no unreproducible number in `slice-6c.md`, and no measurement attributed to a lane that is not
   on record.
2. **N1, N2, N3, N4, O1, O2, O3, O4, O5, O6 all fixed or stated with a reason.** A finding you believe is wrong
   may be *rejected* — **but say so explicitly and show the measurement**, never silently ignore it.
3. **The two new probes are load-bearing, and you prove it**: the nested-skip case **and** the `.cts` case must
   **fail against the pre-round implementation** (i.e. against a guard whose skip is root-anchored, and against
   one whose `SCAN_EXT` lacks `cts`). *A seed that passes against the broken version is not a regression test.*
4. **`npm run verify` exit 0** — **70 files / 2030 tests / 81 warnings / 0 errors / GUARDS PASS — the baseline
   must not move.** Check count is now **more than 9**; update the `all 9 checks passed` line and **every place
   that states the count** — including `slice-6c.md`, whose fix-round table says "9 checks, not 6".
5. `regexp-escape-guard.mjs` exit 0 · `regexp-escape-guard.check.mjs` exit 0 · `bash scripts/guards/run-all.sh`
   exit 0.
6. **Report `.scratch/v28/reports/slice-6c-fix-2.md`** with a per-finding fixed-or-rejected table, the raw tails,
   and the two load-bearing proofs. **Write the file first and append as you go** — a builder in this slice
   already died leaving no report.
7. **Commit everything, including the two lane reports now sitting untracked** (`.scratch/v28/reports/slice-6c-fix-1-review.md`,
   `.scratch/v28/reports/slice-6c-fix-1-verify.md`) **and this brief.** One commit. **Do not push.**

## The rule this round is made of

**Read every value out of the command that produces it, in the same call that records it.** B1 is a number
nobody measured; N1 is a quotation nobody said. Both were written down as facts. **Never `rg -r`. Never put a
shell-mangled pattern on a command line — write the needle to a file and use `-f`.**
