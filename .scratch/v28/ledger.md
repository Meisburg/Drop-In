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
- NOT dispatched: Slice 1 (the pure first-run model).
