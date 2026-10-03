# Fix round 2/5 — V28 Slice 2c (two adjacent comments contradict each other)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Your fix round 1 at `a6a74a4` did the job: the early-return comment (lines
~107-121) is now exactly right — the belt-and-braces explanation with all three
citations, and what happens if a future caller forgets to guard on the profile.

**But the other comment you rewrote now contradicts it**, and the orchestrator
verified this by reading both side by side.

## The contradiction

`RadiusEmptyState.tsx` (~line 96), the `escapesDisabled` comment:

> …but in-flight ones still fall through to this guard, where the clause is
> load-bearing **(the in-flight window is real on these pages)**…

`RadiusEmptyState.tsx` (~line 113), the early-return comment, **fifteen lines
below**:

> …no surface renders this component while the profile is in flight: FeedPage
> renders "Loading…" while `posts === null` … BrowsePage returns "Loading…" on a
> null profile … NewPlaydatePage's embedded sheet sits behind its own `loading`
> guard.

Both cannot be true. **The second one is the correct one** — a fresh-context
reviewer proved it with those citations. So the first one's parenthetical is
false as written.

## What is actually true (write this, and nothing grander)

- The clause `!hasHomeZip(homeZip)` **does evaluate true** when `profile` is null,
  because `homeZip` is `profile?.home_zip ?? ''` and `!hasHomeZip('')` is true.
  So the guard is *not wrong*.
- But **no current caller renders this component in that window** (the three
  citations above), so the clause is **unreachable**, not "real on these pages".
- The settled no-zip parent — the case that matters — is diverted by the early
  return before the guard is ever consulted.

Rewrite that parenthetical so it says the guard is *evaluated* in that window but
*unreachable* there, and points at the early-return comment for the proof. **Do
not restate the citations in both places** — cross-reference instead, so the two
comments cannot drift apart again.

## The one instruction that matters

**Read the two comments together before you report.** Make them agree. If you
find a third inconsistency in this file, **report it in your report rather than
fixing it and continuing** — this is the last comment round; a fourth consecutive
single-comment dispatch would be round inflation, not rigor.

Comment-only. Zero code lines. Do not touch any other file. `plan.md`,
`task-state.md` and the ledger are the orchestrator's.

## Verify and commit

```
npm run verify
```

Paste real tails: lint at the **80 warnings / 0 errors** baseline, tests at
**65 files / 1975 tests**. A comment-only change cannot move either — if one
moved, something else changed and you must say so. Also paste the output of a
diff filter proving **zero non-comment lines changed**:

```
git show <sha> | grep -E "^[+-]" | grep -vE "^(\+\+\+|---)" | grep -vE "^[+-][[:space:]]*(\*|//|/\*)"
```

(That should print nothing.)

Scoped `git add`. Only when green:

```
V28 slice 2c fix 2/5: the two comments agree about the in-flight window
```

Do not push.

## Report

```
Status: DONE | BLOCKED
Files changed: <path> — what the parenthetical now says
The two comments now agree: <quote the two sentences that were in conflict>
Third inconsistency found? <no, or the citation — do not fix it>
Commands run: <real tails; lint vs 80/0; tests vs 65/1975>
Zero non-comment lines changed: <the grep printed nothing — yes/no>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
```
