SENTINEL: V37-B-KIDS-IN-FLOW-T6N3

Slice B (v37): a parent who has no kids yet is not sent away to Settings when the
outing flow needs one - they add a kid right there. OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/kids-in-flow-t6n3 -b kids-in-flow-t6n3 HEAD
Work only there; commit on branch kids-in-flow-t6n3; never touch main or another lane's path.
DO NOT edit AGENTS.md, CONTEXT.md, docs/RELEASE-CHECKLIST.md or vite.config.ts - those are the orchestrator's.

WHY (the founder's own usability review, verbatim):
"I'd also bring 'add your kids' into the outing flow instead of stopping the parent
and sending them to Settings."

THE DEFECT, PRECISELY: the flow already degrades gracefully - src/pages/NewPlaydatePage.tsx
(~line 604) says the no-kids case "degrades to the designed empty state (add your kids),
never a crash". But the recovery path it offers is a trip to Settings, which abandons a
half-written outing. The parent is stopped at the exact moment they are most committed.

WHAT EXISTS ALREADY - reuse, do not rebuild:
- The kid-adding form and its validation live in the onboarding/settings surfaces.
  READ how a kid is added there (the same fields, the same limits, the same errors) and
  REUSE that shape. Do NOT invent a second kid schema or a second validation rule.
- The degradation seam at NewPlaydatePage.tsx ~604 is the anchor. Find it BY CONTENT.

WORK:
1. At the point in the outing flow that needs a kid and finds none, offer an INLINE
   add-a-kid affordance - a compact form in place, not a link to Settings.
2. Submitting it adds the kid and RETURNS THE PARENT TO THE FLOW with their draft intact.
   No navigation away, no lost form state, no second tap to resume.
3. The fields, validation and error copy match the existing kid form exactly. Read it
   first; if the existing form is a component, use that component.
4. If the add fails (network, validation), the parent stays in place with their draft
   intact and sees the existing error copy. Never a crash, never a lost draft.
5. Keep the existing Settings path available for a parent who prefers it - do not remove
   it. This adds a door; it does not close the other one.
6. Do not add this affordance anywhere the flow does not already need a kid. It appears
   ONLY at the moment it is needed.

ACCEPTANCE: (a) a parent with no kids, mid-outing, sees an inline add-a-kid form instead
of a Settings instruction; (b) submitting adds the kid (verify the row exists) and the
parent is back in the flow with the draft intact - the previously entered fields still
hold their values; (c) a failed add leaves the parent in place with the draft intact;
(d) the fields and messages match the existing kid form; (e) the Settings path still
works; (f) 390px, no overflow.

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. The gate must be fully green. Specs on a private port 4210-4218 (mint marker there; kill by port/PID, never pkill -f). Stage BY PATH ONLY.
Report .scratch/v37-b-report.md, then reply:
Sentinel: V37-B-KIDS-IN-FLOW-T6N3
Status: DONE | BLOCKED
Commit: <sha7>
