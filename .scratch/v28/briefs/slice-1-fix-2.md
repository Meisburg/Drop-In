# Fix round 2/5 — V28 Slice 1 (the purity scan covers prose, not just code)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You completed fix round 1 at `7619057` — gate green (64 files, 1971 tests,
GUARDS PASS), and the orchestrator independently confirmed `firstRun.ts`'s logic
is byte-identical apart from the EOF newline. Findings 1–4 are closed.

**You flagged the one remaining item yourself**, in your Risks: the
forbidden-token scan now runs over the file *including its doc comments*, so a
future comment rewrite that happens to contain the word `location` or `window`
would fail a **purity** test. Credit for spotting it — it is a defect in the
instruction you were given, not in your work.

## Why this is worth fixing rather than documenting

This module is *about places*: the area card sets the home location. Scanning
comments means the proof is partly about **prose**, not purity — so the proof is
both **weaker** than it claims and **more brittle** than it needs to be. It is a
false-failure generator, and a false failure in a suite is worse than a missing
test, because it burns a future builder's context on a non-bug.

## The one required change

**Strip comments before matching, so the scan proves the CODE is pure.**

- Remove line comments (`// …`) and block comments (`/* … */`) from the source
  string, then run the forbidden-token checks against what remains.
- Keep **every** existing token — `location`, `navigator`, `Date(`, the clock,
  `window`/`document`, storage, `fetch`/XHR, `supabase`, and the
  no-import-statements check. Do not weaken any of them; the point is to make
  them *more* usable, not fewer.
- **Prove the strip works.** Extract the scan into a small helper that takes
  source text and returns the offending token (or null), then unit-test it
  directly with a sample whose *comment* mentions `location` and `window` and
  asserts **no** finding, and a second sample whose *code* mentions `location`
  and asserts a finding. A strip that is only exercised through the real file is
  not proven — it is assumed.
- Keep the 32-combination clock spy exactly as it is. It is correct now.

**Do not change a single line of `firstRun.ts` logic, and do not change its doc
comment.** The comment was just reviewed and approved; this round touches the
test's scanner only.

## Do not touch

`plan.md`, `task-state.md`, `.scratch/v28/ledger.md`, `.opencode/`. Use a
**scoped** `git add` for the files you changed — the orchestrator's records may
be in the working tree.

## Verify and commit

```
npm run verify
```

Paste the real output tail (test count and the GUARDS line). Commit only when
green, message:

```
V28 slice 1 fix 2/5: scan code, not comments — strip prose before the purity check
```

Do **not** push.

## Report back

```
Status: DONE | BLOCKED
Files changed:
  - <path> <what changed and why>
Commands run:
  - <command> -> <result>   (real output tail)
Behaviour changed: NONE — test scanner only
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
