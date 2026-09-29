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
- Slice 1: review returned NEEDS_CHANGES (run 15e1f9cd). Reviewer independently
  enumerated all 32 fact combinations and found the CODE correct everywhere —
  every finding was doc/test quality, not logic. Adjudicated: 4 accepted, 1
  rejected.
  - ACCEPTED (blocking): firstRun.ts:42-53 doc block still quotes the
    pre-correction (b)-only rule and claims termination.
  - ACCEPTED (minor): stale "one extra tap" figure (plan says up to two).
  - ACCEPTED (minor): guard order covered but not pinned — add the two
    unreachable-but-contractual states.
  - ACCEPTED (minor): purity scan misses location/navigator/`Date(`; clock spy
    only traverses 2 of 32 paths.
  - REJECTED: "no trailing newline, against repo convention, e.g. a11y.ts ends in
    \n". The cited evidence is FALSE — a11y.ts has no trailing newline, and a
    40-file src/lib sample is 25 with / 15 without. No convention exists, so no
    deviation. Ruling: the code stands; EOF newlines are an optional tidy, not a
    finding. (Lesson: the reviewer's factual citations need adjudication too.)
  - Note: the reviewer's third residual risk ("could not audit the builder's
    verify output") was already discharged by the orchestrator running
    `npm run verify` directly — green end-to-end.
- Slice 1: fix round 1/5 dispatched (revived original builder a4f27dcc ->
  run 510ba2e5), findings verbatim via
  .scratch/v28/briefs/slice-1-fix-1.md. Hard constraint: doc comment + tests
  only, NO production behaviour change.
- DECISION 16 (human answered "yes"): the interview renders BARE — no header,
  no bottom nav, no push prompt, no resume nudge. Implementation pinned as CHROME
  SUPPRESSION inside ProtectedShell, not a route move. Grounded by reading
  src/App.tsx: ProtectedShell is not chrome-with-a-guard, it IS the guard, and
  its order is load-bearing (/mod guard and post-edit fallback must precede the
  signed-out gate; the return target only on gate==='pass'). Re-mounting that
  ladder outside the shell risks a reordering bug worse than the nav it removes.
  One `isFirstRun = pathname === ONBOARDING_PATH` constant already exists at
  App.tsx:~200 for the redirect branch — reuse it for the chrome seam. This also
  gives DECISION 10 its mechanism: the same flag suppresses PushOptInPrompt,
  which `App.tsx:~313` mounts "once for the whole authed shell" (so it DOES
  currently render on /onboarding — the collision is real, now confirmed by
  reading, not assumed).
- NEW CONSEQUENCE OF SLICE 2, recorded not discovered: the `I'm coming` return
  target applies only on gate==='pass', and today 'pass' implies a zip. Removing
  'onboard' makes 'pass' true for a no-zip parent, so a new signup who tapped
  "I'm coming" can be routed OUT of the interview to that playdate, skipping
  cards 3-5. Ruling: acceptable (honours an explicit tap; the nudge covers the
  rest), but Slice 2 now pins it with a test.
- plan.md updated: decision 16 + its rationale, decision 10's mechanism, Slice 3a
  scope/approach/acceptance (src/App.tsx bare-render seam), Slice 2 acceptance
  (return-target test), Risks rewritten.
- Slice 1: fix round 1/5 complete (commit 7619057, 4 files +50/-18). Verified by
  the orchestrator, not taken on report: `git diff` proves firstRun.ts's only
  non-comment change is the EOF newline (logic byte-identical), the two new
  guard-order tests pin exactly the mutations they name, the scan gained
  location/navigator/`Date(`, and the clock spy now walks all 32 fact
  combinations. Gate re-run by the orchestrator: 64 files, 1971 tests,
  GUARDS PASS. Findings 1-4 CLOSED. Finding 5 stays rejected (false evidence).
- Slice 1: fix round 2/5 dispatched — ONE item, and it is the builder's own risk
  flag, caused by the ORCHESTRATOR's instruction: adding `location`/`navigator`
  to a scan that runs over the whole file *including comments* makes a PURITY
  test fail on PROSE. The module is about places, so a future comment saying
  "location" would trip it. Ruling: fix, don't document — the proof is both
  weaker than it claims and a false-failure generator, and false failures burn a
  future builder's context. Fix: strip comments, scan the code, and PROVE the
  strip with a two-sample unit test (comment-with-token = no finding,
  code-with-token = finding). firstRun.ts's logic and comment are frozen this
  round.
- Slice 1: fix round 2/5 ATTEMPT 1 FAILED — lane infrastructure, not code.
  Run 012fe8be, 6.2s, error "Subagent produced no output (possible model
  cold-start or empty response)". Protocol followed: worktree verified CLEAN
  (HEAD d95f9cf, no modified files, empty `git diff`) so there was no partial
  work to recover; runner.stderr held only an unrelated undici proxy warning
  ("undici.install is not a function"). Diagnosed as a transient cold-start on
  the local model — the same model completed three prior runs on this worktree.
  ACTION: same-protocol retry, run 8ef33a00, with an explicit note that nothing
  was half-done and not to re-read already-read files.
