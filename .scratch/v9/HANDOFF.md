# V9 handoff — start here in a fresh session

Written 2026-09-13 at the end of a very long session (V8 built end to end +
V9 filed). **Everything needed to continue lives in files, not in a chat
window** — this page is the index to them.

## Where things stand

| Thing | State |
|---|---|
| V8 (the retention/places/everything batch) | **complete, deployed, verified** — commits `dd0642e`…`31c04bd`, on `master`, live at https://drop-in-mu.vercel.app |
| Migrations | **0028–0034 applied live and probed.** 0035–0039 are RESERVATIONS for V9 |
| Gate (baseline) | build exit 0 · **655/655 unit (20 files)** · **e2e 48/48** · lint 0 errors |
| V9 | **spec + 9 tickets filed, none built.** `.scratch/v9/spec.md` + `.scratch/v9/issues/01`–`09` |
| Push notifications | **parked at the device boundary**: schedule ticks, drain runs, rows stamped — but `push_subscriptions` is still 0 rows, so no push has ever reached a device |
| Email verification | schema live (0034), the visible chip deliberately held until the Supabase toggle is flipped (`docs/email-verification-setup.md`) |
| Live DB | 2 founders, 0 e2e markers, 5 founder posts |

## Read these, in this order

1. `AGENTS.md` — the workflow rules (orchestrator/coordinator, one writer, files are the system of record).
2. `task-state.md` → **Current position** at the top, then the **V8** section (what shipped, what was found) and the **Push** paragraphs.
3. `.scratch/v9/spec.md` — the queue, the four judgment calls, the baseline gate.
4. `.scratch/v9/issues/NN-*.md` — the ticket you are about to build. Each carries its own ACs **and** its own migration check.
5. `.scratch/v8/spec.md` — the migration-check procedure every ticket inherits (DO-block idempotency, the 0014/0023/42501/0011 lessons, red-by-design specs).

## Commands you will need

```bash
# the gate (run it yourself; never trust a builder's numbers alone)
npm run build && npm run test && npm run test:e2e     # e2e ≈5 min, live Supabase

# migrations / read-only probes (needs the CDP Chrome on :9222)
bash scripts/cdp-migration-tooling.sh                 # launch it if down
node scripts/apply-migration.mjs supabase/migrations/0035_x.sql
node scripts/apply-migration.mjs --sql "select 1"     # probes; refuses destructive SQL

# housekeeping / live verification
node scripts/sweep-e2e-markers.mjs select|delete|verify
node scripts/verify-pwa.mjs <url> ; node scripts/verify-splash.mjs <url>
node scripts/mobile-audit.mjs <url>
bash scripts/push-deploy.sh                            # re-deploy send-push (needs npx supabase login)
```

## Known traps (each cost time once already)

- **Two live-API flakes**: `e2e/guest-list.e2e.ts` and `e2e/post-edit-delete.e2e.ts` occasionally fail on a viewer-signup hiccup and pass in isolation. Re-run alone before reporting a failure as real.
- **Never weaken a test to make it pass.** A broken spec is a finding. Copy-string updates are allowed only when the ticket changes that copy — say so in the report.
- **Red-by-design specs**: a spec for an unapplied migration must fail at the documented point with a quoted error, never crash.
- **E2E mints `e2e-*` marker accounts** in the live project: make every new spec cascade-safe and sweep afterwards.
- **`.env.push.local` holds the VAPID keypair** (gitignored, 0600). It is the ONLY copy of the private key — the Management API returns secret *hashes*, not values. Do not delete it.
- **The service-role key lives in the `cron.job` row** (the dashboard's Schedules tab is plan-gated and unavailable here; `vault` is not offered). Documented in `docs/push-setup.md`; treat DB-admin access as key access.
- **A second writer exists** (the human's other opencode pane). It has edited `task-state.md` and `docs/push-setup.md` mid-session. Re-read a file before editing it; keep to one writer at a time.
- **`net._http_response` shows `timed_out: true`** for the push dispatch (pg_net here has no `timeout_ms`). Cosmetic — monitor delivery via `notification_log` instead.

## Four decisions waiting on the human (defaults are in each ticket)

1. **02** — approximate times suppress the "Happening now / Starts soon" badges (recommended: yes).
2. **06** — map provider: **Leaflet + OpenStreetMap** recommended (no key, no billing, no Google ToS on derived data).
3. **08** — hide kid photos and remove the upload control, **delete nothing** (this reverses the 2026-09-09 kid-photo decision).
4. **09** — messaging scope: **shared-drop-in threads only** (host ↔ pinger, or two families on one event). Adults contacting strangers about children is the riskiest thing in the backlog — **do not dispatch 09 without an explicit yes.**

Tickets already answerable with the recommended defaults: 01, 03, 04, 05, 07 (**no human step**), 02/06/08 (defaults pinned, one-line confirmation is enough), 09 (needs the yes).

## Recommended first moves in the new session

1. `git log --oneline -3` and `npm run test` — confirm the baseline before touching anything.
2. Build **01** (location first, migration 0035) and **03–05** straight through: all are `ready-for-agent`, and 01/03/04/05 need no decision from anyone.
3. Stop at **06** for the map-provider answer, and hold **09** for the scope yes.

**Paste-ready kickoff prompt:**

> Read `.scratch/v9/HANDOFF.md`, then `task-state.md`'s Current position + V8 section, then
> `.scratch/v9/spec.md`. Build V9 tickets 01, 03, 04 and 05 in queue order using the same
> discipline as V8: builder → independent gate re-run by you → fresh-context reviewer for any
> large diff → commit per ticket → update `task-state.md` at each close-out. Apply migration
> 0035 with `scripts/apply-migration.mjs` and probe it before the live check. Sweep the
> `e2e-*` markers when the suite has run. Do not weaken any test; report findings instead of
> papering over them.
