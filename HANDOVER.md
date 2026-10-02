# HANDOVER — V28 r2 onboarding batch (read this first in a new session)

**Project:** `/home/jmeisburg/Projects/playdate-app` · worktree **`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`** · branch **`Meisburg/onboarding`** · base `e2570c9`.
**Nothing is pushed** (batch rule: *do not push mid-batch*). **Production is still V27.**

## Read these three, in this order, then continue

1. **`.scratch/v28/ledger.md`** — the long-lived record. Every adjudication, every ruling, every measurement. **It is ~530 KB; read the last ~400 lines, not the whole thing.**
2. **`plan.md`** — the executor-grade plan. **`task-state.md`** — phase/slice state.
3. **`.scratch/v28/briefs/`** — one brief per unit of work. `.scratch/v28/reports/` — the raw evidence lanes wrote.

## State at handover

**CLOSED (three lanes green each):** r2 slices **1, 2, 3, 4, 5, 6a**. *(7a and 7b were completed in r1.)*

**OPEN, in the order I would take them:**

| unit | state | its brief |
|---|---|---|
| **6c fix 1** | ⚠️ **WORK ON DISK, UNCOMMITTED, BUILDER DIED** — 4 files modified (`regexp-escape-guard{,.check}.mjs`, `docs/agents/code-structure.md`, `.scratch/v28/reports/slice-6c.md`), +181/−19. **A copy is at `/tmp/6c-fix1-wip/`.** | `.scratch/v28/briefs/slice-6c-fix-1.md` |
| **6b fix 2** | queued (7 real `ocr` findings; the 8th was already fixed by `bce017e`) | `.scratch/v28/briefs/slice-6b-fix-2.md` |
| **6d** | not started — the repo-wide honesty guard. **Anchors re-measured today** (`firstRunCopy.ts:75`, `:123`) | `.scratch/v28/briefs/slice-6d.md` |
| **8a** | not started — the stale-docs sweep. **Three falsified claims now named** (`plan.md:118-119`, `docs/product/onboarding-first-run.md:275`, `V28-BATCH-SUMMARY.md:28`) | `.scratch/v28/briefs/slice-8a.md` |
| **8b-1** | not started — trailing-newline sweep + guard, and `scripts/slice-diff.sh` (**both measured missing**) | `.scratch/v28/briefs/slice-8b.md` |
| **8b-2** | not started — the two specs that could lie | `.scratch/v28/briefs/slice-8b-2.md` |
| **8b-3** | not started — `useCropStep`'s `| void` (**measured still live**), post-unmount effect, slice-3 leftovers | `.scratch/v28/briefs/slice-8b-3.md` |
| **8c** | not started — the kid-photo spec's mint/src assertions | `.scratch/v28/briefs/slice-8c.md` |
| **8d** | not started — the typed-zip family | `.scratch/v28/briefs/slice-8d.md` |

**Gate baseline: `npm run verify` → 70 test files / 2030 tests / 81 lint warnings / 0 errors / GUARDS PASS.**

## Model routing (set by the human)

- **builder + explorer → LOCAL** `strata-max/qwen3.8-flash-next-iq3_s`
- **reviewer + verifier + researcher → CLOUD** `ollama-cloud/deepseek-v4.1-flash:cloud`
- **`ocr`** (the machine lane) → **LOCAL**, `:8081` (**needs `STRATA_API_KEY`; it is in the server's environment and in ocr's own config**)
- **The point of the split is not only cost: a local builder with a cloud reviewer means the reviewer is NOT the builder's sibling** — which the batch's escalation ladder requires.

## The rules that have actually caught things (do not drop these)

1. **Read a lane's STATUS, never its findings count** — a failed run and a clean run both report zero findings. *(Paid twice.)*
2. **A seed that is green against the broken version is not a regression test.** The proof is the seed failing against the OLD code.
3. **A seed must assert its own premise.**
4. **Read the value out of the command that produces it, in the same call that records it** — never from memory or a report.
5. **Never `rg -r`** (it is `--replace` and fabricates). Never put a shell-mangled pattern on a command line — **write the needle to a file and use `-f`.**
6. **Budget a lane in TURNS** (~1 min/turn local), and **have it write evidence INCREMENTALLY** to a file, so a death leaves evidence.
7. **A stated boundary that is not the mechanism** is this batch's most-recurring class. Check the sentence against the code.
8. **The orchestrator delegates; it never edits product code or runs the gate.** It may run read-only greps/diffs and may edit machine config on the human's behalf.
9. **Serialized: one builder at a time. Review/verify may run in parallel** (they are read-only).
10. **Every builder writes `.scratch/v28/reports/<slice>.md` with raw tails and commits it with the slice** — *a warning that is not in the artifact does not exist for the next reader.*

## Known fragilities

- **The local model holds ~50 of 62 GB** and has been OOM-killed twice and cleanly stopped once (**Hermes**, confirmed by the human). It idle-unloads after 1h, returning ~42 GB free. **If builders die with connection errors, check `systemctl --user status strata-max` and `curl :8081`.**
- **A report committed BY a commit cannot contain that commit's own hash** — a report-only follow-up commit writes it in.
- **`lib-sibling-guard` globs `src/lib/*.ts` only**, so it cannot see `.mjs` siblings. Named, not fixed.

## Batch-boundary items for the HUMAN (not for an agent)

- **Deploy authorization** — *"publish, deploy, production changes ... require explicit human authorization."* Production is V27 today.
- **The batch-closing playtest gate (r2-D1):** the resume check — have her **bounce out of an already-finished profile first**, phone, screenshots.
- **The email-invite batch** — parked as its own batch; the **sending domain has the longest lead time** and gates nothing today.
- **6 marker accounts await the batch-end sweep** (`e2e-*`, `e2e-la-*`, `e2e-lb-*`).
