SENTINEL: V33-D3-FINISH-IN-MAIN-P4Z8

**Slice v33-D — FINISH THE WORK ALREADY IN THE TREE.** A previous session did most
of the restructure and then wedged. **You are in the MAIN worktree and it is
yours: no other lane may touch it.**

**READ ONLY:** `.scratch/v33/briefs/v33-d2-brief.md` (the contract — read it) and
`git diff` of the files already changed. **Do not read the prototype HTML or the
rulings.**

Repo: `~/Projects/playdate-app`. Base HEAD `5c97c5a`. **Do not push.**

## What is already in the tree (uncommitted, from the stalled session)

```
 M src/components/PlaceDirectory.tsx        (the restructure: sortMode/filterModalOpen removed, …)
 M src/lib/places.test.ts                   (+55)
 M scripts/refresh-coffee-nearby.mjs        (the 400 m threshold)
 M scripts/refresh-coffee-nearby.test.mjs   (+33)
```
(Also dirty and NOT yours: `vite.config.ts`, `src/dev/AgentationDev.tsx`,
`CONTEXT.md`.)

**Do not restart the slice from scratch.** Review that diff, finish what the brief
requires and is missing, and fix what is broken. In particular confirm: the
**wrapping** pill row (every pill visible at 390px, no side-scroll), the coffee
control **once** in the row with the Maps door moved out of it, the sort above the
list defaulting to **Best first** with the **rating → review-count → name**
tie-break in `src/lib/` (with a sibling test), the search expanding while typing,
and `/browse`'s specs updated in the same diff.

Then: `npm run typecheck:e2e`, `ALLOW_CONFIG_CHANGE="…" npm run verify`,
`ALLOW_CONFIG_CHANGE="…" npm run guards` (expected: only `steering-lint` red, on
another lane's `docs/agents/*`), the two specs on a private port, and **commit by
path only** (the four files above). Report to `.scratch/v33-d-report.md`; reply:

```
Sentinel: V33-D3-FINISH-IN-MAIN-P4Z8
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-d-report.md
```
