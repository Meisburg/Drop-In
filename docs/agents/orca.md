# Orca — the workspace substrate

Read this **before running agents in Orca**: creating a worktree or a terminal,
reading a lane's state, using the diff view, or opening its browser.

**Orca is a workspace, not an orchestrator.** It owns worktrees, terminals, the
diff view, and its own browser. It never owns plan state, tickets, the ledger, or
completion authority. Orchestration stays where `docs/agents/coordinator.md` puts
it — in this session, via DSH subagents, not in a pane.

## Measured, not assumed

| Command | Observed | Use |
|---|---|---|
| `terminal wait --for exit` | satisfied in 4.1s on `sleep 4; exit`; reports `exitCode` | waiting on a command |
| `terminal read --cursor N` | returned only the new lines (cursor `4`→`7`) | tailing a running lane |
| `terminal read --screen` | rendered frame, `source: screen` | when the answer is how output looks |
| `terminal wait --for tui-idle` | **timed out on an idle shell; satisfied on a retrying agent** | **not a completion signal** |
| `terminal list --json` | no status field — only `agentIdentity` and `preview` | — |

`tui-idle` reported idle on an agent that was still working, which would
authorize exactly the stop that must never be authorized. Use `--for exit` and
`--cursor`. `send --wait-submit` warns *"this provider cannot report delivery"* —
a submitted prompt is not a started turn.

## The browser rule is unchanged

Orca's browser uses its own Chromium partition (`persist:orca-browser`), separate
from `~/.config/google-chrome`, so it never touches the human's Chrome. It is
still a **visible window that eats CPU** — which is what
`docs/agents/browser-lanes.md` rules 1 and 5 exist to prevent.

- The Orca browser is a **human review surface**: diff walking, Design Mode.
- **Browser lanes stay as written** — headless, dedicated `--user-data-dir`,
  `nice -n 19`, backgrounded, released by listener port. Never a lane in the
  Orca browser.

## Never

- **Never `orca worktree rm --force`** — it deletes the branch with the worktree,
  and destructive changes are never covered by a rule at any stage.
- **Never launch the orchestrator under Orca's default permission bypass.** Its
  authority is that it *cannot* edit (`edit: deny`); Orca pre-fills
  `--dangerously-skip-permissions` for new launches. Set a non-empty custom
  argument for that agent in Settings → Agents to opt it out.
- **Never add a fourth worktree scheme.** `~/Projects/playdate-app.worktrees/`,
  `~/Projects/drop-in-wt/`, and `~/.treehouse/Drop-In-7e01ed/` already exist, and
  Orca's repo setting shows all of them together. Pick the owner before creating
  one.
- **Never treat Orca's runtime state as the record.** `task-state.md` is.
