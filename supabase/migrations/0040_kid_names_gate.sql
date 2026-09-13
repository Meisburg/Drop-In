-- ===========================================================================
-- V9 ticket 10 (migration 0040): a child's FIRST NAME gets a gate.
-- ===========================================================================
--
-- AMENDED IN PLACE (review cycle 1, 2026-09-13 — F2; the reason is
-- load-bearing): section 4 below is NEW. The gate this file installs reads the
-- two ATTACHMENT tables (`playdate_kids`, `ping_kids`) as its INPUT, and
-- neither table's INSERT policy checked whose kid was being attached:
-- `playdate_kids_insert_host` (0022:95-104) required only that the caller host
-- the post, and `ping_kids_insert_own` (0026:90-93) only that `profile_id =
-- auth.uid()`. So any signed-in parent who knew ONE kid uuid could attach that
-- child to a post they host (or to a ping they make) and then read the child's
-- whole row through the very policy section 3 adds — clause (b)/(c) becomes
-- true for them — including `avatar_url` and `likes`, the two columns
-- `get_playdate_kids` deliberately withholds. The forged row also poisons every
-- OTHER reader: a forged `ping_kids` row puts the victim's `first_name` + `age`
-- in front of that post's host AND every pinger through 0026's SECDEF
-- `get_kids_going`, which never consults this file's policies at all. The fix
-- is section 4: an attachment row may only name a kid the caller OWNS.
-- Amended in place rather than as a new file because this file owns the gate
-- (the 0028 / 0032 precedent), and RE-APPLYING THIS FILE IS THE REPAIR: the
-- policy DDL is `drop policy if exists` + a DO-block-guarded create, so every
-- other section no-ops and only the two INSERT policies change.
--
-- RESIDUAL AFTER THE FIX (recorded, deliberately NOT repaired here): this
-- closes the forge going FORWARD. A forged attachment row created BEFORE the
-- fix is still a valid input to the gate — clause (b)/(c) is satisfied by the
-- row itself — so the coordinator should probe for pre-existing forged rows and
-- decide what to do with them; a migration does not delete anybody's rows.
-- Probe (both expected to return 0 rows):
--   select pk.id, pk.playdate_id, pk.kid_id, p.host_profile_id, k.profile_id
--     from public.playdate_kids pk
--     join public.playdates p on p.id = pk.playdate_id
--     join public.kids k on k.id = pk.kid_id
--    where k.profile_id <> p.host_profile_id;
--   select gk.playdate_id, gk.profile_id, gk.kid_id, k.profile_id as kid_owner
--     from public.ping_kids gk
--     join public.kids k on k.id = gk.kid_id
--    where k.profile_id <> gk.profile_id;
--
-- TWO PROPERTIES OF THE GATE THAT ARE ACCEPTED AND RECORDED (review cycle 1,
-- F6 — neither is a defect, both are things a reader of this gate should know):
--   * `playdate_kid_row_visible(pid, kid)` is a MEMBERSHIP ORACLE for anyone
--     who already holds a kid uuid: it answers "is this child attached to that
--     drop-in?" for any (uuid, uuid) pair they choose. That is unavoidable —
--     the gate must evaluate exactly the question the caller is asking — and it
--     is not enumeration-reachable: kid ids are random uuids that only cross to
--     viewers who may already see the child. The grants stay: a policy is
--     evaluated AS THE CALLER, so revoking EXECUTE would break the gate itself.
--   * `kid_ages_for` is an unchecked-by-id reader (any authenticated caller can
--     ask for any post's age bounds) ON PURPOSE: ages are broadly visible by the
--     confirmed scope, which is the whole reason the function exists. It returns
--     two integers per post and nothing else.
--
-- THE PROMISE BEFORE THIS FILE — and the reason the ticket exists:
--   "A first name is optional — skip it and your kid still shows up by age
--    (the cards say “ages 3–6”, never a name). A name appears only on your
--    profile and on a drop-in's page, and only to signed-in families."
--   (src/pages/ProfilePage.tsx, the Kids block — V9 ticket 05 shipped that
--   sentence because it was TRUE about the schema it shipped against, after
--   refusing to ship the ticket's own stronger sentence. It was true because
--   both tables were wide open:
--     * 0011_profiles_v2.sql:86-89 —
--       `create policy "kids_select_authenticated" on public.kids for select
--        to authenticated using (true)`
--     * 0022_kids_v3.sql:84-87 —
--       `create policy "playdate_kids_select_authenticated" on
--        public.playdate_kids for select to authenticated using (true)`
--   A signed-in parent could therefore read EVERY family's `kids` rows —
--   first_name, age AND the kid-photo `avatar_url` — plus which kid is
--   attached to which drop-in, over plain REST, with no surface involved.)
--
-- THE PROMISE AFTER THIS FILE. The human CONFIRMED this scope on 2026-09-13
-- (recorded in .scratch/v9/issues/10-kid-names-privacy-gate.md): a kid's
-- first name (and the kid photo that rides the same row) is visible to
--   (a) the kid's own family .................. kids.profile_id = auth.uid()
--   (b) the HOST of a drop-in that kid is attached to
--   (c) a family who PINGED that drop-in ...... exactly 0026's get_kids_going
--   (d) moderators
-- AGES STAY BROADLY VISIBLE. That is V9 ticket 05's whole point (ages are the
-- signal a parent actually decides on), and it is why section 4 below has to
-- exist: the ages derivation reads the very table this file narrows.
--
-- THE SURFACES, and what each one now reads:
--   * /playdate/:id "Kids coming" (the post's HOST-picked kids, 0022): was
--     `playdate_kids` joined to `kids` (db.listPlaydateKidNames,
--     PlaydateDetailPage's mount load) with no host/pinger check at all.
--     NOW: the gated SECURITY DEFINER `get_playdate_kids` (section 3) — the
--     0026 get_kids_going shape and gate, so the rule lives in one place.
--   * /playdate/:id "Other kids coming" (the PINGERS' kids, 0026): unchanged,
--     already gated and already SECDEF (`get_kids_going`), so narrowing the
--     base tables cannot touch it (T6 — probed anyway, a regression there
--     would be a real finding).
--   * /u/:handle kid list: read `kids` through the profiles embed
--     (db.getProfileByHandle) for ANY signed-in visitor — V2 shipped that
--     deliberately. NOW RLS filters it to (a)-(d); the page renders the list
--     only in the SELF view, and the honest ages signal that remains on that
--     page is the one on its own post cards (V9 ticket 05).
--   * the feed / place / profile cards' `ages 3–6` line (V9 ticket 05): was a
--     batched `playdate_kids` ⋈ `kids.age` read, i.e. under the very policy
--     this file narrows, AND best-effort by contract (FeedPage/PlacePage/
--     UserPage settle to `{}` on failure) — so a naive narrowing would have
--     SILENTLY blanked every card's ages line: no error, no warning, just
--     nothing. It now reads the ages-only `kid_ages_for` (section 4).
--   * `playdates.age_min` / `age_max` (0037) — the host's STATED chips — ride
--     the `playdates` row and are untouched; they need no function.
--   * the /new and /edit kid pickers and the /profile kids editor: the OWNER's
--     own kids. `kids_insert_own` / `kids_update_own` / `kids_delete_own`
--     (0011) are NOT touched by this file, and `playdate_kids_delete_host`
--     (0022) is not either. The owner clause in the new SELECT policy is
--     therefore not optional: `addKid` writes with `.select()` (RETURNING) and
--     `listKids` reads back the owner's own rows, so a SELECT policy that
--     excluded the owner's new row would 42501 that read-back — the 0014
--     lesson, twice over here (owner + host).
--   * the two attachment INSERTs: TIGHTENED (amendment, section 4) — a host or
--     a pinger may only attach a kid they own. That is what makes the gate's
--     input trustworthy.
--   * signed-out (anon): nothing, exactly as before — both new policies stay
--     `to authenticated` and both new functions revoke EXECUTE from
--     public/anon, so an anon read is an empty answer, never an error.
--   * push payloads (`buildNotificationPayload`, the SQL twin
--     `public.notification_payload`) and the ICS export (`src/lib/ics.ts`)
--     carry no kid field at all — structural, not a policy question.
--
-- WHY THE CROSS-TABLE HALF IS A FUNCTION AND NOT A SUBQUERY — both house
-- lessons, both load-bearing here:
--   * T2 / the 0026 precedent: a policy expression is evaluated AS THE
--     CALLER, so a subquery over another RLS-protected table is itself
--     filtered by THAT table's policy. `ping_kids_select_own_host_mod` inlines
--     an EXISTS over `playdates` only because playdates' authenticated SELECT
--     is `using (true)`. This file narrows BOTH `kids` and `playdate_kids`, so
--     either one reading the other through a bare subquery would be filtered
--     by the new policy — a gate that eats itself.
--   * the 0023 42P17 lesson: a policy whose USING references its own table
--     makes Postgres's RLS rewrite recursive. Both cross-table clauses
--     therefore go through STABLE SECURITY DEFINER helpers (sections 1-2): the
--     rewrite sees a function call, and the helpers run as their owner, so the
--     inner reads are not RLS-expanded and see the true rows.
--
-- WHAT THIS FILE DOES NOT DO: it changes no column, no existing function's
-- body (0026's get_kids_going and 0027's count_kids_going_for are read-only and
-- already SECDEF, and they READ what section 4 now guarantees: only a family's
-- own kid can sit in an attachment row), and it does not touch `ping_kids`' own
-- SELECT gate (own / host / moderator — already correct, stays as 0026 wrote
-- it). The two INSERT policies it does change are strictly NARROWING: they add
-- one clause to what was already required, so no legitimate write path loses
-- anything (the /new, /edit and "who's coming with you" pickers all offer the
-- caller's OWN kids — `listKids(auth.uid())`).
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): Postgres has no
-- CREATE POLICY IF NOT EXISTS, so each replaced policy is `drop policy if
-- exists` + a DO-block existence guard (the 0014 pattern) — that is how the two
-- SELECT policies in section 3 AND the two INSERT policies in section 4 are
-- swapped; the three helpers are CREATE OR REPLACE (the 0023 shape — a helper's
-- signature never changes) and the two table-returning functions are DROP +
-- CREATE (the 0026/0027 shape, so a future payload change re-pastes cleanly);
-- every GRANT/REVOKE pair is re-runnable. Re-pasting this whole file is a no-op,
-- AND re-pasting it is the repair for the F2 amendment (see the header).
--
-- POST-APPLY PROBES (coordinator):
--   (1) a signed-in stranger's direct select of another family's `kids` AND
--       `playdate_kids` returns NO rows (and an anon select stays empty);
--   (2) the owner's own read still works, and `insert ... returning` (addKid)
--       still returns its row — the 0014 interaction;
--   (3) `kid_ages_for` returns (age_min, age_max) — never empty — for a post
--       with kids, and its payload contains no name and no kid id;
--   (4) `get_playdate_kids` returns names for the host and for a pinger, and
--       NOTHING for a stranger — while `count_kids_going_for` and
--       `get_kids_going` (0026/0027) still return their shapes;
--   (5) anon fails closed on all four (two tables, two functions);
--   (6) THE FORGED-ATTACH PATH (the amendment's own probe) — as a signed-in
--       parent P who owns post PO and owns ping PG, but NOT kid K (either
--       someone else's kid, or one P cannot see):
--         insert into public.playdate_kids (playdate_id, kid_id) values (PO, K);
--         insert into public.ping_kids (playdate_id, profile_id, kid_id)
--           values (PG, auth.uid(), K);
--       BOTH must fail with 42501 (new row violates row-level security policy),
--       and afterwards P's own `select` of K must still return NO rows, and
--       `get_kids_going(PG)` must NOT name K. A host attaching their OWN kid
--       still works (that is the /new and /edit path), and a pinger attaching
--       their OWN kid still works (the "who's coming with you" picker);
--   (7) the pre-existing forged-row probe above returns 0 rows on both tables.

-- ---------------------------------------------------------------------------
-- 1) The per-ROW gate: may the caller see this (post, kid) attachment row?
--    The primitive — the rule itself, in one place. SECDEF (0023 escape
--    hatch): it reads `kids` / `playdates` / `going_pings` / `profiles`
--    unfiltered, which is exactly what makes it usable from inside a policy.
-- ---------------------------------------------------------------------------
create or replace function public.playdate_kid_row_visible(pid uuid, kid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- (a) the kid's own family
    exists (
      select 1 from public.kids k
      where k.id = kid and k.profile_id = auth.uid()
    )
    -- (b) the HOST of that drop-in
    or exists (
      select 1 from public.playdates p
      where p.id = pid and p.host_profile_id = auth.uid()
    )
    -- (c) a family who PINGED that drop-in (0026's gate, applied to the post)
    or exists (
      select 1 from public.going_pings gp
      where gp.playdate_id = pid and gp.profile_id = auth.uid()
    )
    -- (d) a moderator
    or exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.moderators
    );
$$;

grant execute on function public.playdate_kid_row_visible(uuid, uuid) to authenticated;
revoke execute on function public.playdate_kid_row_visible(uuid, uuid) from public;
revoke execute on function public.playdate_kid_row_visible(uuid, uuid) from anon;

-- ---------------------------------------------------------------------------
-- 2) The per-KID gate: is this kid attached to ANY drop-in the caller hosts
--    or pinged? The `kids` policy needs this direction (it knows the kid, not
--    the post), and it is the cross-table half of the same rule — so it
--    delegates to (1) rather than restating it.
-- ---------------------------------------------------------------------------
create or replace function public.kid_visible_to_viewer(kid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.playdate_kids pk
    where pk.kid_id = kid
      and public.playdate_kid_row_visible(pk.playdate_id, pk.kid_id)
  );
$$;

grant execute on function public.kid_visible_to_viewer(uuid) to authenticated;
revoke execute on function public.kid_visible_to_viewer(uuid) from public;
revoke execute on function public.kid_visible_to_viewer(uuid) from anon;

-- ---------------------------------------------------------------------------
-- 3) The two SELECT policies, REPLACED (not added to — `using (true)` is the
--    thing being removed, so both tables have exactly one SELECT policy
--    afterwards, as they did before).
--
--    `profile_id = auth.uid()` and the moderator clause stay INLINE in the
--    kids policy on purpose (the 0014 discipline: the owner clause must be in
--    the policy, not somewhere the policy merely happens to reach), and the
--    cross-table half goes through the helpers above (T2).
--
--    The playdate_kids policy delegates the whole rule to (1): a row of that
--    table already carries its own (playdate_id, kid_id) pair, so "the row is
--    visible" IS "the caller is that post's host, or pinged it, or owns that
--    kid, or moderates".
-- ---------------------------------------------------------------------------
drop policy if exists "kids_select_authenticated" on public.kids;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kids'
      and policyname = 'kids_select_own_host_pinger_mod'
  ) then
    create policy "kids_select_own_host_pinger_mod"
      on public.kids for select
      to authenticated
      using (
        profile_id = auth.uid()
        or exists (
          select 1 from public.profiles me
          where me.id = auth.uid() and me.moderators
        )
        or public.kid_visible_to_viewer(id)
      );
  end if;
end $$;

drop policy if exists "playdate_kids_select_authenticated" on public.playdate_kids;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdate_kids'
      and policyname = 'playdate_kids_select_host_pinger_mod'
  ) then
    create policy "playdate_kids_select_host_pinger_mod"
      on public.playdate_kids for select
      to authenticated
      using (public.playdate_kid_row_visible(playdate_id, kid_id));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) THE WRITE-SIDE HOLE (amendment — review cycle 1, F2). The gate above is
--    only as trustworthy as the attachment rows it reads, and until this
--    section NEITHER insert policy asked whose kid was being attached:
--
--      * 0022's `playdate_kids_insert_host` checked only
--        "exists (select 1 from public.playdates p where p.id = playdate_id
--         and p.host_profile_id = auth.uid())" — the HOST of the post, and
--        nothing about `kid_id`. So a parent P who knows one kid uuid K can
--        host a post, attach K to it, and section 3's clause (b) ("the HOST of
--        a drop-in that kid is attached to") instantly becomes TRUE for P: P
--        reads K's whole row — `first_name`, `age`, and the two columns
--        `get_playdate_kids` deliberately withholds, `avatar_url` and `likes`.
--      * 0026's `ping_kids_insert_own` checked only `profile_id = auth.uid()`.
--        The same forge through a PING is worse, because 0026's SECDEF
--        `get_kids_going` — which this file does not touch and which never
--        consults any policy — hands the victim's `first_name` + `age` to that
--        post's host AND to every family who pinged it. Second-order: the row
--        is also input to THIS file's gate, so it grants P the victim's row.
--
--    THE FIX: both INSERT policies additionally require that the kid is the
--    caller's OWN. `public.kid_owned_by_caller(kid)` is a STABLE SECDEF helper
--    for the same T2 reason as the others — a bare `select ... from public.kids`
--    inside another table's policy would be filtered by the `kids` policy
--    (which is fine today, since the owner clause is in it, but the ownership
--    check must not depend on another policy staying that way). It is
--    deliberately NOT a second, additive policy: policies of the same command
--    are ORed, so an added policy would leave the hole wide open — each is a
--    REPLACE (`drop policy if exists` + the guarded create), keeping the names
--    the live probes already reference.
--
--    WHY THIS LOSES NO LEGITIMATE WRITE: every app path that attaches a kid
--    offers the caller's OWN kids — the /new and /edit pickers read
--    `listKids(auth.uid())` (0011's owner-scoped SELECT), and the "who's coming
--    with you" picker on the detail page does the same — so the added clause is
--    satisfied by every write the UI can produce. It is ALSO the ownership rule
--    the SELECT gate already implies: a row nobody could legitimately read
--    should not be writable either. `playdate_kids_delete_host` and the
--    pinger's own DELETE are untouched (a host removing a forged row they
--    created, or a stale row after a kid is handed over, must stay possible).
-- ---------------------------------------------------------------------------
create or replace function public.kid_owned_by_caller(kid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.kids k
    where k.id = kid and k.profile_id = auth.uid()
  );
$$;

grant execute on function public.kid_owned_by_caller(uuid) to authenticated;
revoke execute on function public.kid_owned_by_caller(uuid) from public;
revoke execute on function public.kid_owned_by_caller(uuid) from anon;

drop policy if exists "playdate_kids_insert_host" on public.playdate_kids;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdate_kids'
      and policyname = 'playdate_kids_insert_host'
  ) then
    create policy "playdate_kids_insert_host"
      on public.playdate_kids for insert
      to authenticated
      with check (
        exists (
          select 1 from public.playdates p
          where p.id = playdate_id
            and p.host_profile_id = auth.uid()
        )
        and public.kid_owned_by_caller(kid_id)
      );
  end if;
end $$;

drop policy if exists "ping_kids_insert_own" on public.ping_kids;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ping_kids'
      and policyname = 'ping_kids_insert_own'
  ) then
    create policy "ping_kids_insert_own"
      on public.ping_kids for insert
      to authenticated
      with check (
        profile_id = auth.uid()
        and public.kid_owned_by_caller(kid_id)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) THE AGES-ONLY DERIVATION (T1 — the coupling, and the reason a naive
--    narrowing would have blanked every card's ages line in silence).
--
--    WHAT CROSSES, exactly: `playdate_id`, `age_min`, `age_max`. NO name, NO
--    kid id, NO avatar_url, NO playdate_kids row id, and no way to tell how
--    many kids a post has. Ages are broadly visible by the confirmed scope,
--    so this is a READ gate on the two tables, not a privacy concession.
--
--    Shape follows 0027's batched counter: ONE call for a whole feed, and a
--    post with no kids (or with no kid carrying an age) is simply ABSENT from
--    the result rather than returned as a row of nulls — the client maps by id
--    and treats "absent" as "nothing to say".
--
--    Why it is needed at all: the card's derived range is `min`/`max` over the
--    host's picked kids' ages, the read behind it is best-effort (a failure
--    means "no ages line", never an error), and the rows now belong to a
--    narrowed policy. Deriving them through a SECDEF function is the only way
--    the range can stay broadly visible while the ROWS do not.
-- ---------------------------------------------------------------------------
drop function if exists public.kid_ages_for(uuid[]);

create function public.kid_ages_for(p_ids uuid[])
returns table (playdate_id uuid, age_min integer, age_max integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pk.playdate_id,
         min(k.age)::integer as age_min,
         max(k.age)::integer as age_max
  from public.playdate_kids pk
  join public.kids k on k.id = pk.kid_id
  where pk.playdate_id = any(p_ids)
    and k.age is not null
  group by pk.playdate_id;
$$;

grant execute on function public.kid_ages_for(uuid[]) to authenticated;
revoke execute on function public.kid_ages_for(uuid[]) from public;
revoke execute on function public.kid_ages_for(uuid[]) from anon;

-- ---------------------------------------------------------------------------
-- 6) The detail page's names, gated (0026's get_kids_going shape and gate,
--    applied to the HOST's announced kids instead of the pingers').
--
--    Payload: kid_id, first_name, age. NOT avatar_url — the kid-photo pin
--    (photos render only in the profile kids list). A caller who is neither
--    the host, nor going, nor a moderator gets ZERO ROWS (not an error): the
--    line simply does not appear for them, which is what makes a stranger's
--    page show the ages line alone.
-- ---------------------------------------------------------------------------
drop function if exists public.get_playdate_kids(uuid);

create function public.get_playdate_kids(p_id uuid)
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
    from public.playdate_kids pk
    join public.kids k on k.id = pk.kid_id
    where pk.playdate_id = p_id
    order by k.first_name asc nulls last;
end;
$$;

grant execute on function public.get_playdate_kids(uuid) to authenticated;
revoke execute on function public.get_playdate_kids(uuid) from public;
revoke execute on function public.get_playdate_kids(uuid) from anon;
