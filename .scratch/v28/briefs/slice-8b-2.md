# Slice 8b-2 — the two specs that could lie, and the honesty fixes beside them

*(One of three subjects the old `slice-8b.md` was split into. **8b-1 is the mechanical half** — the trailing-newline
sweep + its guard, and `scripts/slice-diff.sh`. **8b-3 is the code-fix half.** Do not do their work; this brief is
only the test-honesty subject.)*

Read `docs/agents/code-structure.md`. **One builder's worth of work; if it does not fit, STOP after a coherent subset
and report which parts you did** — I will split again rather than have the tail rushed.

## The subject: assertions that can pass for the wrong reason

Slice 3's fix rounds produced the batch's two hardest-won rules, and both apply here:
> **A seed that is green against the broken version is not a regression test.**
> **A seed must assert its own premise.**

**So this slice's job is to find the assertions in two specs that could pass while the thing they name is broken,
and make each one fail for the reason it claims.**

**⚠️ RE-MEASURE EVERY LINE NUMBER. The brief this came from was written several slices ago and line numbers have
drifted repeatedly in that time.** Find items by their symbol/description first.

## Item A — the Enter-key guard, and a spec that MEASURES the browser instead of arguing

`e2e/name-card-photo.e2e.ts` is the spec in question. **Find the Enter-key guard it exercises** (a form that must not
submit, or a control that must not fire, on `Enter`) and judge whether its assertion **actually measures the browser**
or merely asserts a proxy that would also hold if the guard were gone. **A spec that argues about the DOM instead of
pressing the key is a spec that cannot fail for its stated reason.**

## Item B — the failed-upload path, pinned with a route abort

**Find the failed-upload path in `name-card-photo.e2e.ts`** and check whether it is pinned by **aborting the upload
route** (which makes the failure real) or by faking state. **If the abort is missing, add it**, and make the assertion
fail if the card does not keep the written row and stay usable — *that is the behaviour the spec exists to protect.*

## Item C — the honesty fixes in that same spec

**Two small honesty fixes** listed in the original brief (`slice-8b.md` §4, `:99`-ish). Read them there, re-measure
their anchors, and do them.

## Acceptance

1. **Every change is a change to what an assertion *can detect*.** Show, for each: **the test failing against the
   pre-fix code and passing after** — *a green run is not evidence; the red one is.*
2. **No assertion is weakened to make something pass.** If one must be loosened, say why in the test.
3. `npm run verify` exits 0; **each changed spec runs at least twice** — report every run — **one spec at a time.**
4. **Write your report to `.scratch/v28/reports/slice-8b-2.md`** with raw tails, committed with the slice.

## Verify

`npm run verify`; the changed spec(s) ×2 each. **Four named flake modes** — re-run once before believing any red:
`no-bypass-guard`, `e2e/places.e2e.ts:2759`, vite-4173 / trace-artifact-ENOENT, teardown `close()`. Kill listeners
**by port**, never `pkill -f`.

## Report

**`Committed as: <sha7>` from `git log --oneline -1`**, per item: what the assertion could and could not detect
before, and **the red-then-green evidence**.
