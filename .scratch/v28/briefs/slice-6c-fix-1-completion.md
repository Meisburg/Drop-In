# Slice 6c — FIX ROUND 1, COMPLETION ROUND (the previous builder died mid-round)

**Read `.scratch/v28/briefs/slice-6c-fix-1.md` first.** That is the round's brief; G1–G4 are its findings.
**Read `docs/agents/code-structure.md`.** **Small edits only.**

## What happened

The fix-1 builder did the work and **died before committing or writing its report**. Its four files are
**on disk, uncommitted**, at **+181/−19**:

| file | its part in the round |
|---|---|
| `scripts/guards/regexp-escape-guard.mjs` | G1 (header SCOPE rewritten to the mechanism; `.vitest` added to `SKIP_DIRS`), G3 (`.mts`/`.cts` in `SCAN_EXT`) |
| `scripts/guards/regexp-escape-guard.check.mjs` | three new cases — 6 → **9**; pins both G1 directions and G3 |
| `docs/agents/code-structure.md` | **G4** — the new "The one-copy rule" section |
| `.scratch/v28/reports/slice-6c.md` | G2 — the inline correction naming the guard as the authoritative instrument, plus a fix-round-1 table |

**Do NOT redo those edits.** Your job is to finish the round: close the two gaps below, run the gate,
write the missing report, and commit. If your own measurement **contradicts** an on-disk edit, fix the
edit and say so — a number on disk is not evidence.

## GAP A — [BLOCKING] the report the round promised does not exist

`.scratch/v28/reports/slice-6c-fix-1.md` is **referenced twice and present zero times**:

- `.scratch/v28/reports/slice-6c.md:267` — *"Current tails: `.scratch/v28/reports/slice-6c-fix-1.md`."*
- `.scratch/v28/reports/slice-6c.md:532` — same pointer, in the fix-round-1 table.

Both `slice-6c-fix-1.md` (its Report section) and the batch's standing rule **require this file** — *a
warning that is not in the artifact does not exist for the next reader*. **Write it**, with:

1. **A per-finding fixed-or-stated table** — G1, G2, G3, G4 — each with the measurement behind it.
2. **RAW TAILS**, pasted, not summarised: the guard's own run; the check's own run (all nine cases, and
   the final `all 9 checks passed` line); the `npm run verify` tail.
3. **G1's two demonstrations, both directions** — the acceptance the round asks for:
   - a copy in a **TRACKED `.scratch`** code file is **UNCCOUNTED** (show it `git ls-files`-listed *and*
     the guard passing);
   - a **`.vitest`** file holding the literal **does not** fail the lane.
   *The check's cases 4 and 5 perform both; paste their output and name the cases.*
4. **The before/after for `.vitest`** — the on-disk check comment asserts *"this seed returned exit 1
   before this round — measured"* and **no evidence for that claim exists anywhere on disk yet.**
   The round's acceptance 5 says a behaviour change is **proven, not asserted**. Reproduce it in a
   throwaway copy: run the current `.check.mjs` against the **old** `SKIP_DIRS` (no `.vitest`) and show
   the case firing, or state plainly that you could not and why. **A seed that passes against the
   broken version is not a regression test.**
5. **A `Committed as: <sha7>` line** — leave it as the literal placeholder and the orchestrator's
   report-only follow-up writes the hash in (a commit cannot name itself).

**Write this file FIRST, appending each raw tail to it as you produce it** — the last builder in this
round died and left no report; the next one should not be able to.

## GAP B — a number in the guard's own SCOPE header has drifted

The header says **"git TRACKS 260 files under `.scratch/`"**. **Re-measure it yourself** — do not trust
this sentence or the header's — with `git ls-files .scratch | wc -l`, and correct the header **and the
matching comment in `.check.mjs` case 4** to the number you measured. The orchestrator's own read-only
measurement at `4c2d2ab` returned **262**, so **at least one of the two numbers is stale** — say which
you got and when. The `.mjs` count in the same sentence (23, all under `.scratch/v4/`) measured correct.

**The whole point of G1 was that this header IS the mechanism's statement of record.** A number in it
that does not reproduce is the same defect one line down.

## ACCEPTED — do NOT change these (the orchestrator's rulings)

- **The dedupe itself** (5 → 1) — passed review and verify.
- **The `.d.mts` declaration-drift cost** — `tsc` never reads the `.mjs`, so typecheck checks call sites
  against the declaration and never the declaration against the implementation. Named, accepted.
- **`lib-sibling-guard.sh:72` cannot see the new module** (it globs `*.ts` only). Named, not this round's job.

## The gate (run it yourself, in this turn, and paste the tails)

1. `npm run verify` → **exit 0**, and **70 test files / 2030 tests / 81 lint warnings / 0 errors /
   GUARDS PASS**. The baseline **must not move**; if it does, say so rather than adjust the claim.
2. `node scripts/guards/regexp-escape-guard.mjs` → exit 0, one hit.
3. `node scripts/guards/regexp-escape-guard.check.mjs` → exit 0.
4. `bash scripts/guards/run-all.sh` → exit 0.

**Budget this in turns, not vibes.** `npm run verify` is the long pole — run it in the **foreground**
and read the tail; never poll for a background job, and never put a pattern on a `pgrep`/`rg` command
line that matches the shell running it (bracket it, `[p]attern`).

## The one rule this round exists because of

**Read every value out of the command that produces it, in the same call that records it.** This batch
has now paid six times for a sentence written ahead of its evidence. Every number that goes into the
header, the check's comments, the report and the commit message comes from a command you ran in this
round. **Never `rg -r`.** **Never put a shell-mangled pattern on a command line** — write the needle to
a file and use `-f`.

## Commit

One commit, from `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, containing the four on-disk
files **plus** the new report and this brief. **Do not push** — the batch rule is no push mid-batch.
Message shape: `V28 r2 slice 6c fix 1: <what changed>` — and no hash of itself.

## Report back

`Status: DONE | BLOCKED`, the commit sha, and the per-finding table. If `npm run verify` fails for a
cause outside this round's files, **STOP and return BLOCKED with the raw failure** — do not fix it.
