# Verifier brief — V28 r2 slice 6c, fix round 1

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Deterministic referee: run the real commands, paste the real output, interpret nothing, fix nothing.
**Your output is evidence, not judgment.**

- **Base:** `c484648` · **slice commit `c2ec32e`** · **HEAD is a report-only micro commit** on top.
  Report the actual HEAD, and confirm the micro commit changed **only** a `.scratch/v28/reports/*.md` file.

## 1. The gate — run all of it, and read each stage's exit code separately

`npm run verify` (= `build && test && lint && a11y:focus && steering-lint && guards`).

**Expected, and say whether each was met:**

| check | expected |
|---|---|
| `npm run verify` overall | **exit 0** |
| test files | **70 passed (70)** |
| tests | **2030 passed (2030)** |
| lint | **81 warnings / 0 errors** — ⚠️ this oxlint prints **no summary banner when its output is not a TTY**, so count the finding lines (`grep -c ': warning '` / `': error '`) **and say that you did**, or run it under a pty. **A count read from a banner that does not exist is a fabricated number.** |
| guards | **`GUARDS: PASS`** |

**The baseline must not move.** If any figure differs, **say by how much and do not adjust the claim** —
a moved count is the finding, not something to explain away.

## 2. The slice's own instruments, run directly

1. `node scripts/guards/regexp-escape-guard.mjs` → **exit 0**, exactly one hit, `src/lib/escapeForRegExp.mjs:37`.
2. `node scripts/guards/regexp-escape-guard.check.mjs` → **exit 0**, `all 9 checks passed`.
3. `bash scripts/guards/run-all.sh` → **exit 0**.

Run each one **in the foreground** and read its tail. Never poll for a background job; never put a pattern
on a `pgrep`/`rg` command line that matches the shell running it (bracket it, `[p]attern`).

## 3. Confirm the report's pasted tails are real

`.scratch/v28/reports/slice-6c-fix-1.md` pastes a gate tail, a guard tail, a check tail and a `run-all`
tail. **Diff the report's quoted numbers against what your own run produces.** A report that quotes a run
which did not happen, or quotes a figure the run no longer produces, is the finding.

Specifically: the report claims the check prints **nine** cases and that the guards tail inside `npm run
verify` shows all nine green. Confirm **nine, not six** — `six` is the pre-round count and still appears in
the older report.

## 4. The specific claims worth a deterministic check

- **`git ls-files .scratch | wc -l`** — the guard header names **262** as the figure at `c484648`. Measure
  it **at that commit** (`git ls-files .scratch | wc -l` on a clean checkout of it, or count from
  `git ls-tree`) and at HEAD, and report both. The header is *supposed* to carry a dated measurement plus
  the command, not an invariant — say whether what you measure matches what the header says.
- **`git ls-files '.scratch/**/*.mjs' | wc -l`** → the header claims **23, all under `.scratch/v4/`**.
- **`.scratch/guard-a03fc54.mjs` line 635** — the header cites it as holding the one-liner, which is the
  stated reason `.scratch` is skipped whole. **Read that line and quote it.**
- **`.gitignore`** — the header cites it for `.vitest` and for `.scratch/**/*.mjs`. Quote the lines.

## 5. Do NOT

- Do not run `npm run test:e2e` — `verify` does not include Playwright and this round touches no shipped
  code. If you think e2e is relevant, say so as a residual risk instead.
- Do not fix anything. Do not `git add` or `git commit`. **Leave the tree exactly as you found it** — report
  `git status --short` at the end so we can see it is unchanged.

## Report

Per-command: the command, its **exit code**, and its **raw tail**. Then a verdict line:
**`VERIFY: PASS`** or **`VERIFY: FAIL`** with the exact failing output. Nothing softened, nothing inferred.
