SENTINEL: V33-E-WT-FIRST-RUN-J6K1

**Slice v33-E (`muzkh36s`) — a brand-new profile gets no first-run orientation.**

⚠️ **YOU ARE IN YOUR OWN WORKTREE, NOT THE MAIN ONE.** Do this first:

```bash
cd ~/Projects/playdate-app
git worktree add /tmp/pd-wt/v33e -b v33e HEAD     # if it already exists, just cd into it
cd /tmp/pd-wt/v33e && npm install --silent 2>/dev/null || true
```
**Every command from here on runs inside `/tmp/pd-wt/v33e`.** Commit on branch
`v33e`. **Never touch the main worktree, never push.** One writer here: you.

**READ ONLY** `.scratch/v33/briefs/v33-e-brief.md` — the contract, already written;
read it and execute it as-is. Work economically: edit first, verify after.

Summary of that brief (the detail is in it): the tour's gate is
`signedIn && homeZipSet && armed && !dismissed` (`src/lib/firstRunTooltips.ts:223`),
and `dismissed` is a **per-tab sessionStorage** fact shared with the nudge — so a
brand-new profile in a used tab gets no orientation. **Reproduce first** on a
private port (four measurements: fresh tab; flag pre-set; flag cleared; ZIP
skipped), **name the measured cause**, then fix it in a `lib/` seam with a sibling
test that mutation-proves itself, keeping the dismissal behaviour for a session
that already dismissed. Acceptance criteria and the gate/landmine lists are in the
brief. Report to `.scratch/v33-e-report.md` (in the worktree) and reply:

```
Sentinel: V33-E-WT-FIRST-RUN-J6K1
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-e-report.md
```
