SENTINEL: V33-6G-COMMIT-ONLY-T5Y1

**v33-6 fix, FINISH PASS — COMMIT ONLY.** The previous session finished the work
and **wedged before committing** (no child process, steps frozen for hours). The
tree is complete; `npm run typecheck:e2e` already exits 0. **Do not read the diff.
Do not survey. Do not improve anything.** Run the gate, commit, report.

Repo: `~/Projects/playdate-app`. HEAD: `e53c421`. **Do not push.**

Files to commit (exactly these, they are the v33-6 fix):
`src/pages/PlaydateDetailPage.tsx`, `e2e/inbox.e2e.ts`,
`e2e/rsvp-confirmation.e2e.ts`, `src/lib/feed.ts`.

## The commands

```bash
cd ~/Projects/playdate-app
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify 2>&1 | tail -30
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards 2>&1 | tail -3
```

- **Expected:** test **92 files / 2705 tests** (growing only if unit tests were
  added), lint **0 errors**, `GUARDS: PASS` exit 0.
- **Expected and NOT yours:** `steering-lint` fails with findings naming
  `docs/agents/*` — another lane's untracked docs, unreachable from `AGENTS.md`.
  **Do not touch `AGENTS.md` or `docs/agents/*`.**
- If anything else fails, **stop and report `Status: BLOCKED` with the raw output.**
  Do not fix it.

## Then commit, by path only

```bash
git add src/pages/PlaydateDetailPage.tsx e2e/inbox.e2e.ts e2e/rsvp-confirmation.e2e.ts src/lib/feed.ts
git commit -m "fix(drop-ins): the host's Message controls render again, and the specs can fail

ocr caught a regression v33-6 introduced: the per-pinger \"Message <name>\" row
moved inside a {!isHost ? (} branch, but hostPingerNames is derived as host-only,
so the host could never see its own message buttons — and two spec assertions
moved into the same branch and passed vacuously. The row renders outside the
branch again; both assertions are restored and mutation-proved. Folded in:
one message-control className, an extracted goingButtonLabel (the nested
ternary), a stable key for the per-pinger buttons, the invalid
page.locator(sel, { hasText }) replaced with .filter({ hasText }), a guarded
context.close(), a scoped viewport pin, and three doc-drift lines in
src/lib/feed.ts that still claimed the duration is one of the four chips.

SENTINEL: V33-6G-COMMIT-ONLY-T5Y1"
```

**Never `git add .` / `-A`.** Never stage or edit `vite.config.ts`,
`src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`.

## Report

Write four lines to `.scratch/v33-6-report.md` (create it): the commit sha, the
gate numbers, the guards result, the steering-lint isolation. Then reply with:

```
Sentinel: V33-6G-COMMIT-ONLY-T5Y1
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-6-report.md
```
