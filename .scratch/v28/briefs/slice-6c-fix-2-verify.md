# Verifier brief — V28 r2 slice 6c, FIX ROUND 2

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Deterministic referee: run the real commands, paste the real output, interpret nothing, fix nothing.
**Your output is evidence, not judgment.**

- **Base:** `0205c8d` · **slice commit:** `04921d8` (= HEAD). Report the actual HEAD and confirm the tree is clean.
- ⚠️ **`strata-max` (the local model on :8081) is deliberately STOPPED.** Do not start it; its absence is not a
  finding. Nothing in your lane needs it.

## 1. The gate — run it all, read each stage's exit code

`npm run verify` (= `build && test && lint && a11y:focus && steering-lint && guards`).

| check | expected |
|---|---|
| `npm run verify` overall | **exit 0** |
| test files | **70 passed (70)** |
| tests | **2030 passed (2030)** |
| lint | **81 warnings / 0 errors** — ⚠️ oxlint prints **no summary banner off-TTY**, so count the finding lines (`grep -c ': warning '` / `': error '`) **and say that you did**, or run it under a pty. **A count read from a banner that does not exist is a fabricated number.** |
| guards | **`GUARDS: PASS`** |

**The baseline must not move.** If any figure differs, say by how much — **a moved count is the finding, not
something to explain away.**

## 2. The slice's own instruments

1. `node scripts/guards/regexp-escape-guard.mjs` → **exit 0**, exactly one hit, `src/lib/escapeForRegExp.mjs:37`.
2. `node scripts/guards/regexp-escape-guard.check.mjs` → **exit 0**, and **the summary line must print a count
   that equals the number of cases that actually ran**. ⚠️ **This count is now computed at run time** — it was
   `9` in fix round 1 and the round claims `12`. **Report the number the run prints and the number you counted.**
   *A self-reported count that drifts from the cases is the exact class this round exists to fix.*
3. `bash scripts/guards/run-all.sh` → **exit 0**. Report its line count (fix round 1 measured **436**).

Run each in the **foreground** and read its tail. Never poll for a background job; never put a pattern on a
`pgrep`/`rg` command line that matches the shell running it (bracket it, `[p]attern`).

## 3. Confirm the report's pasted tails are real

`.scratch/v28/reports/slice-6c-fix-2.md` pastes a gate tail, a guard tail, a check tail, a `run-all` tail and
four mutation proofs with SHA-256 before/after. **Diff the report's quoted numbers against your own run.** A
report that quotes a run which did not happen, or a figure the run no longer produces, is the finding.

Specifically: the report claims `npm run verify` produced a **623-line** log and `run-all.sh` a **439-line** log.
Report what you measure.

## 4. The deterministic claims worth checking

- **`260` must appear nowhere in `.scratch/v28/reports/slice-6c.md`.** Report what replaces it, and **run the
  re-measuring command the replacement names** — report the number you get and at which commit.
- **The check count.** `git diff 0205c8d..HEAD -- scripts/guards/regexp-escape-guard.check.mjs` — count the
  seeded cases and the bare checks in the final file, and compare with the printed summary.
- **`.scratch` tracked count**, still the header's dated figure: report it at HEAD (it moves — this commit adds
  `.scratch` files).

## 5. Do NOT

- Do not run `npm run test:e2e` — `verify` excludes Playwright and this round changes no shipped code. Say so
  as a residual risk if you think it matters.
- Do not fix anything. Do not `git add` or `git commit`. **Leave the tree exactly as you found it** and report
  `git status --short` at the end.

## Report

Per-command: the command, its **exit code**, and its **raw tail**. Then a verdict line: **`VERIFY: PASS`** or
**`VERIFY: FAIL`** with the exact failing output. Nothing softened, nothing inferred.
