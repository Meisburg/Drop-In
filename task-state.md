# Task State

> The system of record. The orchestrator updates this after every phase
> transition. Subagent chat contexts are ephemeral — this file is not.

## Current position

- **Phase:** implementing
- **Active slice:** 1 (tracer bullet + auth + PWA skeleton) — code complete, review+verify PASS; live profile-row check BLOCKED
- **Next action:** AWAITING HUMAN (dashboard): (1) in the Supabase project matching VITE_SUPABASE_URL, confirm `profiles` appears in Database → Tables; (2) if absent, re-apply supabase/migrations/0001_create_profiles.sql via the SQL editor; (3) if present, trigger a PostgREST schema-cache refresh (re-run a trivial DDL in the SQL editor or restart the server). Then orchestrator re-runs the live check (gmail.com marker, fixed 60s budget) → close slice 1 → dispatch slice 2.

## Slices

| Slice | State | Evidence | Notes |
|---|---|---|---|
| 1 tracer + auth + PWA | code complete (reviewer PASS, verifier PASS); live check blocked (PGRST205) | commits f26edd1+5c7b422; reviewer PASS (4 non-blocking findings, see notes); verifier: build exit 0 + manifest in dist, 6/6 tests, combined cmd exit 0 | profiles migration owned by slice 1 (decisions log); migration SQL WRITTEN BUT NOT APPLIED to live project — escalated; non-blocking findings: README .env.example doc bug, db.ts module-scope env throw, non-idempotent policy DDL; live re-check 2026-09-04: PGRST205 persists minutes after dashboard apply — human dashboard verification required; no marker user created (run killed pre-signup); marker domain example.com rejected by project → use gmail.com |
| 2 neighborhoods + profiles | pending | | human sanity-checks the Seattle neighborhood seed list at review |
| 3 feed + posting | pending | | depends on 2 |
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
- PGRST205 root cause unresolved: migration may have been applied to a different Supabase project than VITE_SUPABASE_URL, or the PostgREST schema cache needs a refresh — only inspectable via dashboard.
- If the Supabase project has email confirmation enabled, the live signup check cannot obtain a session without mailbox access — human to confirm auth settings (email confirmation off) before the re-run.

## Decisions log

- 2026-09-04 — Stack: Vite+React+TS+Tailwind, Supabase backend (auth + Postgres).
- 2026-09-04 — DECISION 1 RESOLVED: human created Supabase project; credentials verified in .env.
- 2026-09-04 — PRODUCT BRIEF (human): recreate the wives'/moms' group chat at
  city scale — drop-in, open invitation, zero pressure. Mobile-first web app
  (PWA), not native stores. DECIDED: drop-in posts w/ optional going-pings
  (no RSVPs); open sign-up + moderation; neighborhood tags for discovery (no
  GPS); any member can post; persistent display_name handles.
- 2026-09-04 — INTEGRATION (orchestrator): `profiles` table migration (id, display_name, created_at + minimal RLS) is part of slice 1 because slice 1's acceptance criteria require 'profile row created'; slice 2 refines RLS + adds neighborhoods/memberships migrations.

## Escalations (waiting on human)

- DECISION 3: deployment target, deferred to V1.5 — not blocking
- 2026-09-04 — SLICE 1 DB APPLY: apply supabase/migrations/0001_create_profiles.sql to live Supabase project. Options: (a) paste into Supabase dashboard SQL editor, or (b) provide Postgres DATABASE_URL / supabase CLI token for this machine. Live auth endpoint IS reachable; only the SQL-application path is missing.
- 2026-09-04 — SLICE 1 LIVE CHECK BLOCKED: PostgREST PGRST205 for public.profiles persists minutes after dashboard apply. Human dashboard steps (project matching VITE_SUPABASE_URL): confirm `profiles` in Database → Tables; if absent, re-paste supabase/migrations/0001_create_profiles.sql into the SQL editor and run it; if present, trigger a PostgREST schema-cache refresh (re-run a trivial DDL in the SQL editor, or restart the server); confirm email confirmation is OFF in Authentication settings. Then tell orchestrator 'done' → live check re-run → slice 1 closes → slice 2 dispatches.