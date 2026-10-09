SENTINEL: V33-13C-COMMIT-ONLY-Q9F2

**v33-13, FINISH PASS #2 — COMMIT ONLY.** Two sessions have already built and
polished this work; both died before committing. **Do not read the diff. Do not
survey anything. Do not improve anything.** Run three commands, commit, report.

Repo: `~/Projects/playdate-app`. HEAD: `ab33d61`. **Do not push.**

Uncommitted work to commit (already done, already typechecked):
`src/components/RsvpConfirmationDialog.tsx`, `src/components/DropInMark.tsx`,
`src/index.css`, `src/lib/confetti.ts`, `src/lib/confetti.test.ts`,
`e2e/rsvp-confirmation.e2e.ts`.

## The three commands

```bash
cd ~/Projects/playdate-app
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify 2>&1 | tail -30
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards 2>&1 | tail -3
```

- **Expected:** test **91 files / 2693+ tests** (must include the new
  `confetti.test.ts` sibling), lint **0 errors**, `GUARDS: PASS` exit 0.
- **Expected and NOT yours:** `steering-lint` fails with findings naming
  `docs/agents/{parallel-development,compute-split,fleet-capacity}.md` — another
  lane's untracked docs, unreachable from `AGENTS.md`. **Do not touch
  `AGENTS.md` or `docs/agents/*`.**
- If anything else fails, OR the new confetti test is missing from the count,
  **stop and report `Status: BLOCKED` with the raw output.** Do not fix it.

## Then commit, by path only

```bash
git add src/components/RsvpConfirmationDialog.tsx src/components/DropInMark.tsx src/index.css src/lib/confetti.ts src/lib/confetti.test.ts e2e/rsvp-confirmation.e2e.ts
git commit -m "feat(drop-ins): the Going confirmation celebrates — confetti and the drop-in mark

The founder asked for a confetti burst \"when you say you're going somewhere\"
and the drop-in logo above the modal's text (\"it looks very boring right now\").
Both are scoped to the RSVP confirmation — ModalShell is EVERY dialog's shell, so
a ConfirmDialog must stay confetti-free, and that is asserted. CSS-only, no new
dependency; the piece geometry is a seeded pure function in src/lib/confetti.ts
with a sibling test (no Math.random in the component). prefers-reduced-motion
suppresses the animation and loses no content.

SENTINEL: V33-13C-COMMIT-ONLY-Q9F2"
```

**Never `git add .` / `-A`.** Never stage or edit `vite.config.ts`,
`src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`.

## Report

Write **four lines** to `.scratch/v33-13-report.md` (create it): the commit sha,
the gate numbers you saw, the guards result, and the steering-lint isolation.
Then reply with only:

```
Sentinel: V33-13C-COMMIT-ONLY-Q9F2
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-13-report.md
```
