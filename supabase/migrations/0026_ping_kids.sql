-- V6: which KIDS are coming — the missing half of "N going".
--
-- First phone feedback: "if I say I'm going to an event and then it shows on
-- that component one going, it only says like one going as in like the parent,
-- but it doesn't show the kids that are going... you're trying to set this up
-- for kids to have a play date with other kids."
--
-- The gap was structural, not a rendering oversight: a going_ping records the
-- PARENT only. There is no kid data on the viewer side anywhere in the schema
-- (playdate_kids links a POST to the HOST's kids — a different question). So
-- "how many kids are coming" could not be answered by any query: the tap has
-- to start collecting it.
--
-- SHAPE. ping_kids is the join between a ping and the pinger's OWN kids:
--   * the FK targets going_pings(playdate_id, profile_id), not playdates: a
--     kid selection cannot outlive the ping that justifies it, so un-pinging
--     is a cascade rather than a second delete the app must remember to issue.
--   * the FK to kids(id) means a removed kid takes its attendance rows along.
--   * PK (playdate_id, profile_id, kid_id): picking the same kid twice is a
--     no-op and re-POSTing the selection is idempotent.
--
-- DECISION #2 (human, 2026-09-11) — WHO SEES WHAT. The human chose "count on
-- the card, names and ages only for the host and people going":
--   * CARDS: a bare COUNT, for every authenticated viewer. It crosses through
--     a SECURITY DEFINER counter so the rows themselves stay closed — the same
--     "the count is public, the identities are not" split 0015 used for the
--     going count (going_pings stays authenticated-broad for counts, names go
--     through get_guest_list).
--   * DETAIL: first name + age, only to the host or to a caller who has
--     pinged (get_kids_going mirrors the 0025 guest-list gate exactly), plus
--     moderators.
--   * Strangers and signed-out visitors get neither names nor a count.
--
-- RLS on ping_kids is the WRITE gate; the two functions are the READ gates
-- (SECURITY DEFINER bypasses RLS by design and projects exactly what is
-- allowed — the 0015/0023/0025 pattern).
--
-- SUPERSEDED IN PART BY 0040 — DO NOT RE-PASTE `ping_kids_insert_own`
-- (V9 ticket 10, review cycle 1, F4 — recorded here because this file's own
-- DO block recreates the weak version from a NAME-BASED existence guard).
-- 0040 re-creates that policy with ONE added clause: the attached kid must be
-- the CALLER'S OWN (`kid_owned_by_caller`). The reason is that 0040's kid-name
-- gate reads these attachment rows as its input, so without the clause a pinger
-- who knew one kid uuid could attach that child to their own ping, read the
-- child's row through the new gate, AND expose the child's first name + age to
-- that post's host and to every pinger through get_kids_going below. Re-pasting
-- this file would find the policy absent, recreate the WEAK version, and —
-- policies of the same command being ORed — silently re-open the bypass with no
-- error and no warning. Everything else here (the table, the index, the two
-- SECDEF functions) is `if not exists` / DROP+CREATE and stays safe to re-run.
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): CREATE TABLE IF
-- NOT EXISTS, policies inside DO-block existence guards (Postgres has no
-- CREATE POLICY IF NOT EXISTS), functions DROP + CREATE.
-- (The insert policy is the ONE exception since 0040 — see the note above.)

create table if not exists public.ping_kids (
  playdate_id uuid not null,
  profile_id uuid not null,
  kid_id uuid not null references public.kids(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint ping_kids_pkey primary key (playdate_id, profile_id, kid_id),
  constraint ping_kids_ping_fkey foreign key (playdate_id, profile_id)
    references public.going_pings(playdate_id, profile_id) on delete cascade
);

create index if not exists ping_kids_playdate_idx on public.ping_kids (playdate_id);

alter table public.ping_kids enable row level security;

-- SELECT: your own selections, or the host of that post, or a moderator.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ping_kids'
      and policyname = 'ping_kids_select_own_host_mod'
  ) then
    create policy "ping_kids_select_own_host_mod"
      on public.ping_kids for select
      to authenticated
      using (
        profile_id = auth.uid()
        or exists (
          select 1 from public.playdates p
          where p.id = ping_kids.playdate_id and p.host_profile_id = auth.uid()
        )
        or exists (
          select 1 from public.profiles me
          where me.id = auth.uid() and me.moderators
        )
      );
  end if;
end $$;

-- INSERT: only your own rows. The FK to going_pings is the second wall — you
-- cannot attach kids to a post you have not pinged.
--
-- SUPERSEDED BY 0040 (V9 ticket 10, review cycle 1): the live policy additionally
-- requires `public.kid_owned_by_caller(kid_id)` — a pinger may only attach a kid
-- they own. Re-creating the version below would OR the weak policy back on and
-- re-open the forged-attach bypass (see the header note).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ping_kids'
      and policyname = 'ping_kids_insert_own'
  ) then
    create policy "ping_kids_insert_own"
      on public.ping_kids for insert
      to authenticated
      with check (profile_id = auth.uid());
  end if;
end $$;

-- DELETE: only your own rows (the un-ping / change-my-mind path).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ping_kids'
      and policyname = 'ping_kids_delete_own'
  ) then
    create policy "ping_kids_delete_own"
      on public.ping_kids for delete
      to authenticated
      using (profile_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The card's count: a number for every signed-in viewer, identities for none.
-- ---------------------------------------------------------------------------
drop function if exists public.count_kids_going(uuid);

create function public.count_kids_going(p_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(count(*), 0)::integer
  from public.ping_kids pk
  where pk.playdate_id = p_id;
$$;

grant execute on function public.count_kids_going(uuid) to authenticated;
revoke execute on function public.count_kids_going(uuid) from public;
revoke execute on function public.count_kids_going(uuid) from anon;

-- ---------------------------------------------------------------------------
-- The detail page's names + ages: the 0025 guest-list gate, applied to kids.
-- ---------------------------------------------------------------------------
drop function if exists public.get_kids_going(uuid);

create function public.get_kids_going(p_id uuid)
returns table (kid_id uuid, first_name text, age integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid;
begin
  caller := auth.uid();
  -- No caller (anon / no JWT), or a caller who is neither the host, nor going,
  -- nor a moderator -> no names cross (the stranger surface stays count-only).
  if caller is null then
    return;
  end if;
  if not exists (
        select 1 from public.playdates p
        where p.id = p_id and p.host_profile_id = caller
      )
     and not exists (
        select 1 from public.going_pings gp
        where gp.playdate_id = p_id and gp.profile_id = caller
      )
     and not exists (
        select 1 from public.profiles me
        where me.id = caller and me.moderators
      ) then
    return;
  end if;
  return query
    select k.id, k.first_name, k.age
    from public.ping_kids pk
    join public.kids k on k.id = pk.kid_id
    where pk.playdate_id = p_id
    order by k.age asc nulls last, k.first_name asc;
end;
$$;

grant execute on function public.get_kids_going(uuid) to authenticated;
revoke execute on function public.get_kids_going(uuid) from public;
revoke execute on function public.get_kids_going(uuid) from anon;
