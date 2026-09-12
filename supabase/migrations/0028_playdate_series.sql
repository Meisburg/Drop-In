-- ===========================================================================
-- V8 ticket 06 (migration 0028): STANDING PLAYDATES — the weekly series.
-- ===========================================================================
--
-- What this adds: a `playdate_series` row ("Green Lake, Saturdays 10am")
-- plus `playdates.series_id`, and ONE generator function that materializes
-- the series' next occurrences as REAL `playdates` rows.
--
-- Pinned decisions (ticket 06 + .scratch/v8/spec.md; every one of these is
-- load-bearing, not a preference):
--
-- (a) OCCURRENCES ARE REAL `playdates` ROWS with `series_id` set — not
--     virtual rows, not a second ping table. That is the whole reason this
--     migration is small: every existing read path, RLS policy, RPC, guest
--     list, kids picker, ICS/share surface, public view and e2e spec keeps
--     working UNTOUCHED, because an occurrence is an ordinary post that
--     happens to remember where it came from.
--
-- (b) WALL CLOCK + IANA TIMEZONE, NEVER A UTC INSTANT. The series stores
--     `weekday` (0=Sun..6=Sat) + `start_minutes` (minutes past LOCAL
--     midnight) + an IANA `timezone` captured in the browser
--     (Intl.DateTimeFormat().resolvedOptions().timeZone, falling back to
--     'UTC'). Occurrences are computed as
--         ((d::timestamp + make_interval(mins => s.start_minutes))
--            at time zone s.timezone)
--     i.e. a naive local timestamp INTERPRETED in that zone. A 10:00 AM
--     series therefore stays 10:00 AM across the March and November DST
--     transitions — the UTC instant shifts by an hour, which is exactly
--     right. Storing a UTC instant would silently move everyone's meetup an
--     hour twice a year, which for a standing weekly meetup is the worst
--     possible failure (everyone shows up at the wrong time, together).
--     The client-side twin of this arithmetic is the pure
--     `nextOccurrenceDates` seam (src/lib/series.ts, DST-unit-tested).
--
-- (c) BOUNDED HORIZON, IDEMPOTENT TOP-UP. 21 days ahead, never unbounded;
--     `unique (series_id, starts_at)` + `on conflict do nothing` make a
--     re-run a no-op. The function RETURNS the number of rows it CREATED,
--     so idempotency is directly testable (call twice → N then 0; never
--     trust a dashboard DML result line, it reports "0 rows" for
--     everything).
--
-- (d) `playdates.series_id` is `on delete set null`: deleting a series row
--     must never delete posts — other families have said they are going to
--     those weeks. "Stop repeating" (`active = false`) is the product
--     action; the already-generated occurrences STAY as normal posts.
--
-- (e) NO EXISTING POLICY CHANGES. `playdates`, `going_pings`, `comments`,
--     `playdate_kids`, `ping_kids` — nothing here alters one policy, one
--     SELECT posture, or one column of those tables beyond the new nullable
--     `playdates.series_id`. The new `series_id` key is OMITTED from every
--     insert payload unless a series is actually being created
--     (src/lib/series.ts `seriesIdField`), so pre-apply posts are
--     byte-identical to today's.
--
-- (f) v1 PINGS ARE PER OCCURRENCE, NOT PER SERIES. Each week's roster is its
--     own (going_pings, guest list, kids — all unchanged). There is no
--     standing-RSVP table and none is intended: the standing commitment is
--     delivered by the notification and one-tap-repeat tickets (08/09).
--
-- (g) NO CHANGE TO THE PUBLIC SIGNED-OUT SURFACE. `get_public_playdate`
--     keeps its 12 fields and is not touched here: an occurrence is an
--     ordinary post, so no series field crosses to anon (the 0015
--     count-only discipline).
--
-- (h) GENERATION IS CLIENT-TRIGGERED at (a) series creation and (b) the HOST
--     opening their own series/detail page. NEVER on a viewer's read — a
--     viewer's page load must not write to the database. pg_cron is a
--     human-owned dashboard toggle (not enabled here, and not needed): the
--     (a)+(b) fallback is what keeps the feature correct.
--
-- VOLATILITY NOTE (the one deliberate deviation from the ticket's wording,
-- and the reason is a Postgres rule, not a preference): ticket 06's bullet
-- says "stable SECURITY DEFINER". A STABLE function CANNOT WRITE —
-- PostgreSQL rejects any INSERT issued inside a non-volatile function with
--     ERROR: INSERT is not allowed in a non-volatile function
-- (the planner executes a STABLE/IMMUTABLE body under a read-only SPI
-- snapshot). Marking this function STABLE would therefore make the apply
-- verification fail with 0 occurrences created, i.e. the feature would be
-- dead on arrival. It is therefore declared VOLATILE, and every other part
-- of the pinned shape holds EXACTLY: SECURITY DEFINER, `search_path` pinned
-- to (public, pg_temp), EXECUTE granted to `authenticated` ONLY with PUBLIC
-- and anon revoked (an anon probe must fail closed — 401/42501 is the pass
-- condition).
--
-- ACCEPTED RESIDUALS (documented, not fixed — the 0025 header's discipline):
--
-- (1) The `playdates` INSERT policy (0005, unchanged) checks only that the
--     poster is the row's host, so a signed-in user could attach their own post
--     to ANOTHER host's series id. The blast radius is one cosmetic marker
--     ("· weekly") on their own post: the generator always writes occurrences
--     for the SERIES' own host (s.host_profile_id), so nobody can inject rows
--     into someone else's series, read its data, stop it, or touch its roster.
--     Closing it would need a guard trigger on `playdates` — i.e. new DDL on an
--     existing table's write path, which pin (e) forbids. Recorded here so the
--     reviewer sees the tradeoff rather than missing it.
--
-- (2) The function is deliberately NOT gated on the caller being the series'
--     host, and that is a decision, not an oversight. It is SECURITY DEFINER
--     (so it can write past `playdates`' RLS) and it materializes only the
--     series' OWN rule for the series' OWN host — a caller who is not the host
--     gains nothing, and once the horizon is full the call returns 0 (the work
--     is bounded to [1, 60] days by the clamp below). Adding an
--     `auth.uid() = host_profile_id` gate would instead break the documented
--     post-apply probe, which calls this function through the dashboard SQL API
--     as the schema owner with NO JWT (auth.uid() is null there) and expects it
--     to create the occurrences. anon is revoked, which is the boundary that
--     matters: an unauthenticated visitor cannot trigger generation at all.
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): the table is
-- `create table if not exists`; the column is `add column if not exists`;
-- the FK, the unique index and EVERY policy are DO-block guarded (Postgres
-- has no CREATE POLICY IF NOT EXISTS, and a bare ADD CONSTRAINT is not
-- re-runnable); the function is DROP FUNCTION IF EXISTS + CREATE (the 0021
-- structure); GRANT/REVOKE are themselves re-runnable.
-- ===========================================================================

-- 1) The series itself: the RULE ("every Saturday, 10:00, in this zone"),
--    plus everything the /new form collected so the generated occurrences
--    are full posts and not stubs.
create table if not exists public.playdate_series (
  id uuid primary key default gen_random_uuid(),
  host_profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  place text not null,
  address text,
  details text,
  neighborhood_id uuid not null references public.neighborhoods (id) on delete restrict,
  -- 0 = Sunday … 6 = Saturday (Postgres extract(dow) order; the client
  -- derives it from the chosen start date — src/lib/series.ts).
  weekday smallint not null check (weekday between 0 and 6),
  -- Minutes past LOCAL midnight (the wall clock). The 30-minute GRID is an
  -- app rule (the /new stepper), NOT a CHECK — the 0021 address lesson: the
  -- DB enforces what must be true, the UI enforces what is tidy.
  start_minutes smallint not null check (start_minutes between 0 and 1439),
  duration_minutes smallint not null,
  -- IANA zone name as captured in the browser; 'UTC' when the device
  -- reported nothing (resolveTimeZone). See pin (b).
  timezone text not null default 'UTC',
  -- "Stop repeating": false halts generation. Existing occurrences stay.
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.playdate_series enable row level security;

-- 2) The occurrence link. The column first, then the FK as a NAMED
--    constraint in its own guard: an add-column-if-not-exists that carried
--    the reference inline would silently skip the FK on a re-paste over a
--    half-applied database.
do $$
begin
  alter table public.playdates add column if not exists series_id uuid;
  if not exists (
    select 1 from pg_constraint
    where conname = 'playdates_series_id_fkey'
      and conrelid = 'public.playdates'::regclass
  ) then
    alter table public.playdates
      add constraint playdates_series_id_fkey
      foreign key (series_id) references public.playdate_series (id) on delete set null;
  end if;
end
$$;

-- 3) The idempotency wall: one occurrence per (series, instant). A second
--    generator run over the same horizon conflicts on this index and
--    creates nothing (the function returns 0 — pin (c)).
--    A UNIQUE INDEX (not a constraint) is enough for ON CONFLICT inference,
--    and NULLs are distinct, so every STANDALONE post (series_id null) is
--    unaffected — any number of one-off posts may share a start time.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'playdates'
      and indexname = 'playdates_series_id_starts_at_key'
  ) then
    create unique index "playdates_series_id_starts_at_key"
      on public.playdates (series_id, starts_at);
  end if;
end
$$;

-- 4) RLS on the series (pinned): READ for any signed-in parent (the detail
--    page renders the "Weekly · every Saturday 10 AM" line for the host,
--    and a signed-in viewer may read the label a `· weekly` occurrence
--    points at), WRITE for the host only. Every policy in a DO-block guard.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdate_series'
      and policyname = 'playdate_series_select_authenticated'
  ) then
    create policy "playdate_series_select_authenticated"
      on public.playdate_series for select
      to authenticated
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdate_series'
      and policyname = 'playdate_series_insert_host'
  ) then
    create policy "playdate_series_insert_host"
      on public.playdate_series for insert
      to authenticated
      with check (host_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdate_series'
      and policyname = 'playdate_series_update_host'
  ) then
    create policy "playdate_series_update_host"
      on public.playdate_series for update
      to authenticated
      using (host_profile_id = auth.uid())
      with check (host_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdate_series'
      and policyname = 'playdate_series_delete_host'
  ) then
    create policy "playdate_series_delete_host"
      on public.playdate_series for delete
      to authenticated
      using (host_profile_id = auth.uid());
  end if;
end
$$;

-- 5) The generator (pins (b), (c), (h)). SECURITY DEFINER with a pinned
--    search_path, EXECUTE to authenticated ONLY (see the header's
--    VOLATILITY NOTE for why this is volatile rather than stable).
--
--    Returns the number of rows CREATED by THIS call (0 on a re-run, on an
--    inactive series, and for a series that does not exist) — the
--    idempotency signal the post-apply probe and the unit seam both assert.
drop function if exists public.ensure_series_occurrences(uuid, int);

create function public.ensure_series_occurrences(
  p_series_id uuid,
  p_horizon_days int default 21
)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s public.playdate_series;
  v_horizon int;
  v_today date;
  v_created integer := 0;
begin
  select * into s from public.playdate_series where id = p_series_id;
  if not found then
    return 0;
  end if;
  -- "Stop repeating": an inactive series generates nothing. Its existing
  -- occurrences are ordinary posts and stay exactly as they are (pin (d)).
  if not s.active then
    return 0;
  end if;

  -- The horizon is clamped to [1, 60]: the 21-day pin bounds the feature,
  -- the clamp bounds the WORK of one call even if a caller asks for years.
  v_horizon := least(greatest(coalesce(p_horizon_days, 21), 1), 60);

  -- The series' OWN local today — the wall clock the meetup lives on. A
  -- host generating at 4 PM PST must not skip a Saturday that has already
  -- begun in UTC, and a host in UTC must not generate a day early.
  v_today := (now() at time zone s.timezone)::date;

  insert into public.playdates (
    host_profile_id,
    title,
    place,
    address,
    details,
    neighborhood_id,
    starts_at,
    ends_at,
    series_id,
    -- AMENDED 2026-09-13 (ticket 07's review): without this the series'
    -- later weeks carried a NULL place_id and fell back to the host's home
    -- zip for distance, while the first occurrence was place-aware. One
    -- column, re-applied in place (the 0023 -> 90a159f amendment pattern).
    -- Requires 0030's `playdates.place_id`, so the apply order is 0029 ->
    -- 0030 -> 0028.
    place_id
  )
  select
    s.host_profile_id,
    s.title,
    s.place,
    s.address,
    s.details,
    s.neighborhood_id,
    occ.starts_at,
    occ.starts_at + make_interval(mins => s.duration_minutes),
    s.id,
    s.place_id
  from (
    select
      -- PIN (b): the naive local wall clock, INTERPRETED in the series'
      -- zone. `at time zone` on a timestamp-without-zone yields the
      -- timestamptz for that local reading, so 10:00 stays 10:00 local
      -- across both DST transitions.
      ((g::timestamp + make_interval(mins => s.start_minutes)) at time zone s.timezone) as starts_at
    from generate_series(v_today, v_today + v_horizon, interval '1 day') as g
    where extract(dow from g)::int = s.weekday
  ) as occ
  -- Only FUTURE occurrences. A week whose start already passed (or the
  -- occurrence the host just created by hand through /new) is not re-made.
  where occ.starts_at > now()
  -- PIN (c): the idempotency wall. A second call over the same horizon is
  -- a no-op, and ROW_COUNT below reports 0 for it.
  on conflict (series_id, starts_at) do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

-- 6) EXECUTE scoping (the 0015/0025 pattern, narrowed to the signed-in
--    surface): Postgres grants EXECUTE to PUBLIC by default on a new
--    function, so PUBLIC and anon are revoked explicitly and only
--    `authenticated` is granted. An anon call must fail closed
--    (401 / 42501) — that failure is the pass condition, not a bug.
--    (Every caller is a signed-in host: the client only ever calls this at
--    series creation and on the host's own detail page — pin (h).)
grant execute on function public.ensure_series_occurrences(uuid, int) to authenticated;
revoke execute on function public.ensure_series_occurrences(uuid, int) from public;
revoke execute on function public.ensure_series_occurrences(uuid, int) from anon;
