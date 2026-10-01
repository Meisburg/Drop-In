# Slice 6b — FIX ROUND 2 (queued): the machine lane's 8 findings, 7 of them real

*(6b was closed on review+verify; **the third lane came back late with 7 open items, so it reopens** — the
late-finding rule. One of the 8 is already fixed, and that is recorded rather than re-done.)*

Read `docs/agents/code-structure.md`. **Small edits only**; write your report to
`.scratch/v28/reports/slice-6b-fix-2.md` with raw tails and commit it with the slice.

## The one already fixed — do NOT redo it

**`ocr` #4** (`check-acceptance-greps.check.mjs:257`): *"the check name claims the blockquote tag is counted as a
QUOTATION, but the assertion only proves it is not judged as a claim."* **FIXED BY `bce017e`** (the micro-round):
case 11 now asserts `/1 untagged quotation line(s) ignored/`, and the verifier **mutation-proved** it — against a
guard that drops the blockquote line, the old assertion **passed** (a real false pass) and the new one **fails**.
**Record it as fixed-by-`bce017e` and move on.**

## The seven that are open

**F1 — [`ocr` #7, medium, and it is CENTRAL to this guard] `check-acceptance-greps.mjs:110`**
*"Dropping `>` from the marker allowance closes only the blockquote shape of the quoted-example trap; **the identical
shape survives for examples inside FENCED code blocks and 4-space indented code blocks.**"*
**This is the trap the guard was built to avoid — a document quoting a bad grep must not be judged as claiming it.**
The previous round closed one shape and the reviewer could only say *"no corpus line blockquotes a tag."*
**Close the fenced and indented shapes, or state precisely which shapes remain open.** *A boundary narrower than the
statement is the class this whole batch keeps catching.*

**F2 — [`ocr` #1, medium] `no-bypass-guard.check.mjs:140`** — case 3 asserts the guard's refusal **but never asserts
its own premise**, unlike case 1 (which verifies the flag left no trace *before* judging the guard). **If a git
version normalised the reflog, the case would still "pass" while testing nothing.** *This is the batch's own
"a seed must assert its own premise" rule, missing from one case.* **Add it.**

**F3 — [`ocr` #8, low] `no-bypass-guard.check.mjs:147`** — case 3 seeds only the `--no-verify` alternative of the
guard's reflog grep; **the `core\.hooksPath` alternative is a third bypass vector** and is not seeded here.
**Seed it, or state that its coverage lives elsewhere.**

**F4 — [`ocr` #5, medium] `check-acceptance-greps.mjs:266`** — it **re-runs the exact same `rg` invocation** whose
output the `try` block above already captured. `commented` is by definition `all.length - observed`, so **the second
subprocess is redundant.** **Compute it; delete the subprocess.** *(Cheaper and one less thing to get wrong.)*

**F5 — [`ocr` #6, low] `check-acceptance-greps.mjs:248`** — forcing `-H -n` guarantees a complete `path:line:`
prefix **only for line-oriented output**: a claim whose own command carries `-l/--files-with-matches` prints **paths
only**, so the prefix assumption breaks. **Handle it or state it** — it is the same family as the `-H`/`-n` fixes.

**F6 — [`ocr` #2, low] `no-bypass-guard.check.mjs:147`** — it **inlines a second `execFileSync('git', …)`**,
duplicating the `encoding`/`stdio` conventions the `git()` helper at line 70 centralises. **Use the helper** (extend
it to take `env`) rather than a second call spelling the same conventions again.

**F7 — [`ocr` #3, low] `no-bypass-guard.check.mjs:150`** — the failure-detail expression
`` `exit ${r.exit}: ${r.out.split('\n').filter(Boolean).join(' | ')}` `` is now **repeated FOUR times** in the file.
**Extract it once.** *(Note: this is the same construct the verifier caught as "a second non-comment line" — it is
duplication, not a defect on its own.)*

## Acceptance

1. **F1 has a case that fails against the current code** (a fenced or indented quoted example over a bare directory).
2. **F2 and F3 have cases that assert their own premise.**
3. **F4 removes the subprocess** and the guard's output is otherwise unchanged — **show it**.
4. `npm run verify` exit 0 (**70 files / 2030 tests**, **81 warnings / 0 errors** — the baseline must not move),
   both acceptance-grep artifacts exit 0 (**14 checks**), `no-bypass-guard.check.mjs` exit 0 (**6 checks**),
   `run-all.sh` exit 0.
5. **No executable behaviour change except where a finding requires one** — and where it does, **prove the before/after
   difference rather than asserting it.**

## Report

**`Committed as: <sha7>`**, a per-finding fixed-or-stated table with evidence, and the note that #4 was already fixed
by `bce017e`.
