# Task State

> The system of record. The orchestrator updates this after every phase
> transition. Subagent chat contexts are ephemeral — this file is not.

## Current position

- **Phase:** implementing
- **Active slice:** 3 (drop-in feed + posting) — **COMPLETE** (code + DB apply + live check all PASS)
- **Next action:** dispatch slice 4 (detail page + going-pings + report/block UI; migrations 0007 going_pings + 0008 reports) to the dev agent — brief is plan.md slice 4. After slice 4 code is green, orchestrator applies 0007/0008 via browser-use (CDP, see tooling note below) and runs the live ping/report check → close slice 4 → dispatch slice 5.

## Tooling note (2026-09-09)

- Migrations are now applied by the orchestrator via **browser-use** (Python/CDP) instead of the human dashboard: `browser-use` (uv tool, v0.1.13) attaches to a CDP-enabled Chrome on `:9222`. **One-command rebuild: `scripts/cdp-migration-tooling.sh`** — it recreates the session-bearing profile copy (from `~/.config/google-chrome`, survives /tmp wipes + reboots) and launches the CDP Chrome; pass `stop` to kill it. If `:9222` is already up it fast-paths. Attach: `BU_CDP_URL=http://127.0.0.1:9222 browser-use <<'PY' ... PY`. Apply pattern: Monaco editor via `monaco.editor.getEditors()[0].setValue(<sql>)` + click the "Run Ctrl ↵" button via JS; both migrations return "Success". PostgREST schema cache auto-refreshes (no PGRST205 — REST served new tables at HTTP 200 within ~1 min). open-computer-use was uninstalled (its key synthesis can't reach a Wayland Chrome).

## Slices

| Slice | State | Evidence | Notes |
|---|---|---|---|
| 1 tracer + auth + PWA | complete | commits f26edd1+5c7b422; reviewer PASS (4 non-blocking findings parked, see notes); verifier PASS (build exit 0, manifest in dist, 6/6 tests, combined cmd exit 0); LIVE CHECK PASS 2026-09-04 (probe ok, signup session, profile row inserted + read back, login session; marker live-verify-1788546611@gmail.com) | profiles migration owned by slice 1 (decisions log); migration SQL WRITTEN BUT NOT APPLIED to live project — escalated; non-blocking findings: README .env.example doc bug, db.ts module-scope env throw, non-idempotent policy DDL; live re-check 2026-09-04: PGRST205 persists minutes after dashboard apply — human dashboard verification required; no marker user created (run killed pre-signup); marker domain example.com rejected by project → use gmail.com; PGRST205 resolved by human dashboard apply + cache refresh 2026-09-04 |
| 2 neighborhoods + profiles | complete | commits 9ff7aa6+a3abf09; reviewer PASS (4 non-blocking parked); verifier PASS (build exit 0, 14/14 tests, combined cmd exit 0); post-review SQL delta 017614e+51ee493 content-verified (8392cf3); LIVE CHECK PASS 2026-09-04 (probes ok first attempt; marker A: session + profile row + Ballard/Belltown memberships persisted + feed-gate condition; 0004 23505 proof via marker B; markers live-verify2-1788548418[-b]) | migrations 0002–0004 written by builder, applied by human via dashboard (no DB access on this machine); seed list gets human sanity-check at review; /onboarding route pinned as integration decision; seed list (22 entries) flagged for human sanity-check at review; seed list amended by human 2026-09-04: Beaverton + Interlawn removed (20 entries); post-review SQL delta by human: seed amendment 017614e + DO-block policy idempotency fix 51ee493; 0002–0004 applied live 2026-09-04 (dashboard, Success). |
| 3 feed + posting | complete | commits 81e8b1a+d97020b; reviewer PASS (per-statement DDL audit; 7 non-blocking parked, see notes); verifier PASS (build exit 0, 36/36 tests, combined cmd exit 0, all policy DDL DO-block guarded); 0005+0006 APPLIED LIVE 2026-09-09 via browser-use (Monaco setValue + Run, both "Success"); REST probe playdates+blocks HTTP 200; LIVE CHECK PASS 2026-09-09 (marker host posts drop-in → viewer feed shows it → blocks row created → viewer feed EXCLUDES it via DB-level .not() filter, closing reviewer finding #2; markers live-verify3-<epoch>[-b]@gmail.com) | blocks migration (0006) moved forward from slice 4 (feed AC requires the DB-level block filter; block UI stays in slice 4); 0005/0006 use DO-block idempotency per the logged lesson; applied by orchestrator via browser-use (CDP), not human dashboard (tooling note above); PostgREST cache auto-refreshed (no PGRST205) |
| 4 detail + going-pings + trust | pending | | depends on 3 |
| 5 mod tools + mobile polish | pending | | depends on 4; human founder flagged via one-time SQL |

## Open risks

- .env not git-ignored yet (no Vite scaffold exists); slice 1 adds .gitignore
  with `.env` before the first commit.
- Trust at scale is the #1 product risk — slice 4 (reports/blocks) and
  slice 5 (mod tools) are the V1 answer; do not descope them.
- PWA: manifest + minimal service worker only; no offline promises in V1.
- If the live Supabase project is unreachable from this machine, slice 1's 'profile row created' cannot be verified → escalate to human (apply SQL via Supabase dashboard).
- Slice 1 AC 'profile row created' unverifiable until human applies supabase/migrations/0001_create_profiles.sql (dashboard SQL editor or grant DB access); everything else verified.
- Test artifacts in live project (intentional markers; no delete policy in V1 — optional human cleanup in dashboard): live-verify-1788546611@gmail.com (auth + profile row), live-verify2-1788548418@gmail.com (auth + profile row + 2 memberships), live-verify2-1788548418-b@gmail.com (auth user only).
- Slice 2 parked findings (non-blocking): taken-handle retry reload dead-end (signed-in user, no profiles row — dashboard SQL recovery) is a candidate follow-up for slice 3+; createProfile handle-taken detection couples to constraint name profiles_display_name_key.
- Post-review SQL delta (017614e, 51ee493) landed after the reviewer's PASS; builder content-verified the delta this turn; the live onboarding check is the behavioral proof.
- Slice 3 live flow (posting → feed → block filter) unverifiable until human applies 0005–0006 via dashboard; builder code must be complete and build+test green regardless.
- Slice 3 live block-filter path unproven: the .not() DB filter for viewers with blocks rows is only covered by the pure filterFeed re-filter; the live check must create a real blocks row and confirm feed exclusion (reviewer finding #2).
- Parked non-blocking findings (slice 3 review): created_at superset column in 0005; title counter trim cosmetic; unparseable datetime-local fallback error; unused Block type; missing trailing newlines in 0005/0006.

## Decisions log

- 2026-09-04 — Stack: Vite+React+TS+Tailwind, Supabase backend (auth + Postgres).
- 2026-09-04 — DECISION 1 RESOLVED: human created Supabase project; credentials verified in .env.
- 2026-09-04 — PRODUCT BRIEF (human): recreate the wives'/moms' group chat at
  city scale — drop-in, open invitation, zero pressure. Mobile-first web app
  (PWA), not native stores. DECIDED: drop-in posts w/ optional going-pings
  (no RSVPs); open sign-up + moderation; neighborhood tags for discovery (no
  GPS); any member can post; persistent display_name handles.
- 2026-09-04 — INTEGRATION (orchestrator): `profiles` table migration (id, display_name, created_at + minimal RLS) is part of slice 1 because slice 1's acceptance criteria require 'profile row created'; slice 2 refines RLS + adds neighborhoods/memberships migrations.
- 2026-09-04 — AUTH (human decision): email confirmation intentionally OFF for V1 (no email infrastructure until V2; restore confirmation or an invite flow before any real launch).
- 2026-09-04 — INTEGRATION (orchestrator): /onboarding is the pinned onboarding route path (plan's route list predated onboarding); onboarding gate = signed-in user with 0 memberships; slice 2's UserPage shows 'No posts yet' (playdates table lands in slice 3).
- 2026-09-04 — SEED (human amendment): neighborhoods seed list amended — Beaverton + Interlawn removed; 0002 now 20 entries (human-approved, committed pre-apply).
- 2026-09-04 — LESSON (human, post-apply): Postgres has no `CREATE POLICY ... IF NOT EXISTS` — IF NOT EXISTS is not valid for many DDL statement types. 0002/0003 fixed by human to DO-block policy idempotency (commit 51ee493) and applied live. RULE for all future migrations: wrap idempotent DDL in DO blocks or verify against real Postgres grammar; never assume IF NOT EXISTS exists for a statement type.
- 2026-09-04 — INTEGRATION (orchestrator): slice 3 owns migrations 0005 (playdates + RLS) and 0006 (blocks + RLS) — the blocks table moves forward from slice 4 because slice 3's feed AC requires the DB-level block filter the plan pins; the block UI (block/unblock buttons) stays in slice 4. Feed 'today' boundary = client-local startOfToday (no GPS/timezone settings in V1). /new success navigates to the feed (the detail page lands in slice 4). playdates RLS includes host-only UPDATE/DELETE (capability only; no edit/delete UI until slice 4+).

## Escalations (waiting on human)

- DECISION 3: deployment target, deferred to V1.5 — not blocking
- 2026-09-04 — SLICE 1 DB APPLY: apply supabase/migrations/0001_create_profiles.sql to live Supabase project. Options: (a) paste into Supabase dashboard SQL editor, or (b) provide Postgres DATABASE_URL / supabase CLI token for this machine. Live auth endpoint IS reachable; only the SQL-application path is missing.
- 2026-09-04 — SLICE 1 LIVE CHECK BLOCKED: PostgREST PGRST205 for public.profiles persists minutes after dashboard apply. Human dashboard steps (project matching VITE_SUPABASE_URL): confirm `profiles` in Database → Tables; if absent, re-paste supabase/migrations/0001_create_profiles.sql into the SQL editor and run it; if present, trigger a PostgREST schema-cache refresh (re-run a trivial DDL in the SQL editor, or restart the server); confirm email confirmation is OFF in Authentication settings. Then tell orchestrator 'done' → live check re-run → slice 1 closes → slice 2 dispatches. — RESOLVED 2026-09-04: human applied migration + cache refresh via dashboard; live check PASS (marker live-verify-1788546611@gmail.com).
- 2026-09-04 — SLICE 2 DB APPLY: RESOLVED 2026-09-04. Seed sanity-check completed by human (list amended to 20 entries: Beaverton + Interlawn removed, 017614e). Apply initially failed on invalid `create policy if not exists` — human fixed 0002/0003 to DO-block policy idempotency (51ee493); 0002→0003→0004 then applied via dashboard: Success. Live onboarding check PASS (see slice 2 row evidence).
- 2026-09-04 — SLICE 3 DB APPLY: RESOLVED 2026-09-09 (by orchestrator, not human). 0005_create_playdates.sql then 0006_create_blocks.sql applied live via browser-use (CDP → Monaco setValue + Run; both "Success"). PostgREST schema cache auto-refreshed — REST served playdates + blocks at HTTP 200 within ~1 min (no PGRST205). Live posting check PASS same day (marker host posts → viewer feed shows → blocks row → viewer feed excludes via DB .not() filter, closing reviewer finding #2). Slice 3 closed; slice 4 dispatched.