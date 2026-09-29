# V28 — the first run (onboarding). Append-only. One line per event.

Batch: card-by-card onboarding. Worktree `Meisburg/onboarding`
(/home/jmeisburg/orca/workspaces/playdate-app/onboarding), base `e2570c9`.

- Grilled: frontier emptied in 4 rounds. 15 decisions settled (plan.md table).
- Docs: `CONTEXT.md` (glossary, incl. the playdate/Drop In/drop-in naming tangle)
  and `docs/adr/0001-home-zip-stops-being-a-gate.md` written.
- Facts measured live (not assumed): 2 human accounts of 54 non-e2e profiles;
  16 drop-ins, latest 2026-09-26, ZERO upcoming; 7/54 bios, 10/54 photos;
  `profiles` has no auto-create trigger so `createProfile(displayName)` is
  explicit — which is why card 2 (name) can reuse the social-sign-in branch.
- plan.md written; V27 plan preserved byte-identically at `plan-v27-backup.md`
  (`diff -q` clean).
- (superseded by the entry below) Slice 1 was not yet dispatched at this point.
- Plan reviewed at high effort: 6 defects found, all fixed (commit 15ada15).
  Grader: plan.md now 536 lines, 9 slices, no stale refs.
- Slice 1: dispatched (base 15ada15, run a4f27dcc, agent orchestrator-builder
  on local ninfer/qwen3.8-27b, async). Brief:
  .scratch/v28/briefs/slice-1.md. Plan approved by the human.
- OPEN FOR HUMAN: whether /onboarding should render outside ProtectedShell's
  chrome (plan.md Risks). Not blocking Slice 1.
- Slice 1: complete (commits 15ada15..4660a1b, 4 files +318, 20 tests).
  Evidence re-run by the orchestrator this turn: `npm run verify` green
  end-to-end (GUARDS runs last, so its PASS proves build+test+lint+a11y+
  steering-lint all passed). Targeted rerun: 2 files, 20 tests passed.
  Builder's mutation check killed 2 named tests; verified by reading the test
  file. Builder committed with a SCOPED add (not the brief's literal
  `git add -A`) because the orchestrator's own edits were in the tree — correct
  call, recorded.
- PLAN DEFECT #7, found by the builder and corrected by the orchestrator: the
  resume rule's prose was self-contradictory. Clause (b) alone NEVER terminates
  for a childless parent (a skipped `kids` is indistinguishable from a
  not-reached one), yet the line beneath claimed it terminates. The builder
  implemented the terminating reading the acceptance criteria demanded and
  flagged the discrepancy instead of guessing silently — good behaviour.
  plan.md + task-state.md now state it as two clauses. The shipped doc comment
  in `src/lib/firstRun.ts` still QUOTES the old one-clause rule; fixing that is
  a builder's job (rule 8), batched into the post-review fix round.
- Slice 1: reviewer dispatched (run 15e1f9cd, fresh context). Open question
  still unanswered by the human: should /onboarding render outside
  ProtectedShell's chrome? Proceeding as written.
