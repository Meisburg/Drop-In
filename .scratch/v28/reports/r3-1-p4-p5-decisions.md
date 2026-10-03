# r3-1 — the human's P4 (recovery) and P5 (durability) decisions

**Recorded 2026-10-03. The human's words, not an agent's inference.**

## P4 — DATA RECOVERY: recorded NOT RECOVERABLE FROM THE REPOSITORY

**The human's instruction:** *"Do not spend time attempting recovery of the deleted
`going_pings` row unless PITR status can be determined safely and immediately without
introducing unrelated work. Record it as not recoverable from the repository and preserve
the incident evidence."*

**PITR status was probed once, cheaply, and is NOT determinable from this repo:**

| probe | result |
|---|---|
| `GET /v1/projects/<ref>/config/backups` | **HTTP 404** — no such endpoint |
| `GET /v1/projects/<ref>` filtered for plan/pitr/backup | **no such field** (region + status only) |
| `GET /v1/organizations` | **`[]`** — the token is project-scoped and cannot read the org plan |

PITR is a paid add-on and only the org plan + the dashboard can confirm it. **Per the
instruction, no further work was spent.** Recorded:

- **The deleted `going_pings` row is NOT RECOVERABLE FROM THE REPOSITORY.**
- Incident evidence is **preserved unmodified** in `r3-1-delete.txt`,
  `r3-1-verify.txt`, `r3-1-confirmation.md`, `r3-1-incident.md`, `r3-1-safety-verify.txt`.
- **If the human later confirms PITR is enabled on the org plan**, the row is recoverable
  within the retention window and that window is theirs to check in the dashboard. **No
  agent action is pending on this.**

## P5 — DURABILITY: the e2e environment WILL be split from production

**The human's decision:** *"Yes, split the e2e environment from production. The live
production database must not be used by the e2e suite going forward. Treat the separate
Supabase project or branch as the long term architecture. For now, keep the newly added
collateral hazard gate and use the automated pre-release cleanup only as the temporary
bridge until the e2e environment is separated."*

**So, binding:**

1. **LONG TERM: a separate Supabase project (or branch) for e2e.** The live production
   database must not be used by the e2e suite going forward.
2. **TEMPORARY BRIDGE: keep the collateral hazard gate** and use automated pre-release
   cleanup until the split lands. The gate is NOT to be removed when the split happens
   without a decision — it is what makes the bridge safe.
3. **The migration is a SEPARATE INFRASTRUCTURE TASK, not a feature slice** — explicitly
   not folded into r3. Tracked below; do not expand r3-2…r3-8 with it.

## The tracked infrastructure task (not scheduled, not started)

**`infra-e2e-env-split` — separate the e2e environment from production.**

Scope when it is picked up (named now so it is not rediscovered):

- a second Supabase project (or a branch), with migrations applied to both;
- `e2e/fixtures.ts` reading its own `E2E_SUPABASE_URL` / `E2E_SUPABASE_ANON_KEY`, never
  the production pair (`e2e/fixtures.ts:61-67` today reads the production `.env`);
- `playwright.config.ts` pointed at the e2e target;
- seed data for the specs that assume a populated place directory;
- `docs/agents/e2e-fixture-convention.md`, `docs/agents/browser-lanes.md` and
  `docs/agents/ci.md` updated together (the convention doc's "Changing the convention"
  section requires the sweep, the guard and the doc to move in one commit);
- a decision on what happens to `sweep-e2e-markers.mjs` once fixtures no longer touch
  production — it may become CI-only, or be deleted;
- ⚠️ **the collateral gate is kept regardless**, because the marker convention still
  governs whatever database the specs write to.

**Owner: the human, to schedule. Not this batch.**

## Standing instruction, recorded

**Do not run another destructive production sweep.** No `delete` mode runs again without a
fresh explicit confirmation.
