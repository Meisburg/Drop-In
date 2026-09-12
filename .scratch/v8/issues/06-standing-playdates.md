# 06: Standing playdates — the weekly series (migration 0028)

**What to build:** The single biggest retention gap. `playdates` carries one
`starts_at`/`ends_at` (`0005:17-18`) and no recur/weekly/series concept exists
anywhere in the repo, so the weekly park meetup — how parents actually meet —
has to be hand-typed every single week, and each post lives and dies alone. Add
a **series**: "Green Lake, Saturdays 10am" created once, its next occurrences
generated automatically, each occurrence a normal drop-in that all existing
machinery (pings, guest list, kids, comments, rain badge, ICS, share, public
view) already handles with **zero changes**.

Design pins (decided here so the builder doesn't have to guess):

- **Occurrences are real `playdates` rows.** Not virtual rows, not a second
  ping table. This is why the migration is small: every read path, RLS policy,
  RPC and e2e spec keeps working untouched.
- **Times are wall-clock in the host's timezone.** The series stores
  `weekday` + `start_minutes` + an IANA `timezone` captured in the browser
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`); occurrences are computed
  server-side as `(date + start_minutes) at time zone timezone`. Storing a UTC
  instant would drift an hour at DST and silently move everyone's meetup.
- **Bounded horizon, idempotent top-up.** Generous 21 days ahead, never
  unbounded; `unique (series_id, starts_at)` makes re-running the generator a
  no-op.
- **v1 pings are per occurrence, not per series** (each week's roster is its
  own). The standing commitment is delivered by ticket 08's "starts in an hour"
  notification and ticket 09's one-tap repeat — not by a new standing-RSVP
  table.

**Blocked by:** Ticket 05 (one-writer). Independent of tickets 07–11, but it
comes first in the queue.

**Status:** ready-for-agent

- [ ] **Migration 0028** — `playdate_series`: `id`, `host_profile_id` (FK profiles, cascade), `title`, `place`, `address`, `details`, `neighborhood_id`, `weekday smallint check 0..6`, `start_minutes smallint check 0..1439` (30-min grid enforced in the app, not by CHECK — the 0021 free-text lesson), `duration_minutes smallint`, `timezone text`, `active boolean not null default true`, `created_at`; plus `playdates.series_id uuid null references playdate_series(id) on delete set null` + a unique index on `(series_id, starts_at)`
- [ ] **Migration 0028** — `ensure_series_occurrences(p_series_id uuid, p_horizon_days int default 21)`: stable SECURITY DEFINER (the 0015/0025 pattern — `search_path` pinned, EXECUTE granted to `authenticated` only, revoke public/anon), insert-on-conflict-do-nothing over the generated dates; returns the number created so a test can assert it
- [ ] **RLS in 0028**: `playdate_series` SELECT to `authenticated` (the card/meta line needs the label), INSERT/UPDATE/DELETE **host-only** (`host_profile_id = auth.uid()`); all policies in DO-block guards (Postgres has no `CREATE POLICY IF NOT EXISTS`); **no change to any existing table's policies** — occurrences ride `playdates`' existing posture
- [ ] **Generation strategy, pinned with a fallback:** occurrences are created (a) when the series is created, (b) when the host opens their series, and (c) by a daily `pg_cron` top-up **if** the extension is enabled. `pg_cron` is a human-owned dashboard toggle — the coordinator raises it; the fallback (a)+(b) must keep the feature correct without it. Never write on a *viewer's* read
- [ ] `/new` gains a **"Repeat weekly"** control (off by default): when on, the weekday is derived from the chosen start date (and shown back in words: "every Saturday"); the created post links to a series instead of standing alone
- [ ] Detail page host panel gains a series line (**"Weekly · every Saturday 10 AM"**) and **Stop repeating** (sets `active = false`; already-generated occurrences stay as normal posts — no silent deletion of other families' plans)
- [ ] Card + detail meta lines show `· weekly` as **text** after the time window — **not** a new badge (the badge slot already carries status/ended/happening-now/starts-soon/rain; the no-new-badge rule stands)
- [ ] Public signed-out surface unchanged: `get_public_playdate` keeps its 12 fields (an occurrence is an ordinary post; no series field crosses to anon — the 0015 count-only discipline)
- [ ] Unit tests: the pure occurrence-date seam (`nextOccurrenceDates(weekday, startMinutes, timezone, fromIso, horizonDays)`) incl. a DST boundary in `America/Los_Angeles` (a 10:00 AM series stays 10:00 AM across the March and November transitions), the "every Saturday" label, and the no-duplicate guarantee
- [ ] New e2e `weekly-series.e2e.ts`: host creates a weekly series → the next occurrences appear in the feed on the right days with `· weekly` → a viewer pings one occurrence → the guest list / going line work exactly as on a normal post → **red-by-design pre-apply** at series creation (PGRST205/42703), never a crash
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0 (the weekly spec is the documented red point until the coordinator applies 0028)

**Migration check:** **REQUIRED — `supabase/migrations/0028_playdate_series.sql`** (number reserved in
`.scratch/v8/spec.md`; if the queue reorders, the next free number wins and
`task-state.md` records what was applied).

- *Idempotency:* every DDL statement in a DO block; `create table if not
  exists`/`alter table ... add column if not exists` are fine, **policies and
  triggers are not** — DO-block guards only.
- *Header must document:* the wall-clock + timezone decision, the 21-day
  horizon, the per-occurrence ping decision, `on delete set null` on
  `playdates.series_id`, and that no existing policy changed.
- *Grants:* `ensure_series_occurrences` is SECDEF with `search_path` pinned and
  EXECUTE scoped to `authenticated` (revoke `public` and `anon`). An anon probe
  must fail closed (401/42501) — that failure is the pass condition, not a bug.
- *Apply path (coordinator only):* CDP Chrome via
  `bash scripts/cdp-migration-tooling.sh`, dashboard session token from Local
  Storage `supabase.dashboard.auth.token` (1 h TTL), then
  `POST https://api.supabase.com/v1/projects/<ref>/database/query`. The Monaco
  SQL editor in that Chrome is known-broken — do not use it.
- *Post-apply probes:* (1) `pg_proc`/`information_schema` proving the table,
  the column, the unique index and the function exist; (2) a PostgREST
  `playdate_series` SELECT returning 200 (no `PGRST205` schema-cache stall);
  (3) an anon call to `ensure_series_occurrences` failing closed; (4) the
  generator called twice on one series creating occurrences the first time and
  **0** the second (the idempotency proof — never trust a DML result line, it
  reports "0 rows" for everything).
- *Human-owned:* enabling the `pg_cron` extension (dashboard toggle) for the
  daily top-up. Not a blocker — the (a)+(b) fallback keeps the feature correct.

**Verify:** `npm run build && npm run test` (occurrence seam + DST tests);
`npx playwright test e2e/weekly-series.e2e.ts` (red-by-design pre-apply, green
after the coordinator applies 0028); live marker pass: create a series, confirm
3 occurrences land on the right dates, ping one, confirm the roster is that
occurrence's alone. Sweep markers.

## Comments
