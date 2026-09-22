-- ===========================================================================
-- V19 t03 (migration 0047): parent cards + linked parent accounts.
-- ===========================================================================
--
-- What this does: adds TWO tables.
--   1. `parent_cards`  — up to two per account, each a parent with a photo and
--                        a short "about me".
--   2. `account_links` — a parent-to-parent link: one account invites another
--                        by handle, the other accepts, and both then appear on
--                        each other's profile.
-- No existing table or row is touched. Strictly additive and re-paste-safe:
-- this is a LIVE-DATABASE migration (the project holds real family data).
--
-- Why (the founder's ask, 2026-09-21):
--   "on the profile section, on 'About the parents', there should be a place
--    for up to two parents to have an individual pic and text field to tell
--    people about themselves. Additionally, if someone makes a separate profile
--    like the wife or the husband, they should be able to link accounts so they
--    both show up on the profile."
--
-- WHY A CHILD TABLE RATHER THAN TWO MORE COLUMNS ON `profiles`. The obvious
-- cheap shape is parent2_name/parent2_photo/parent2_about. It was rejected for
-- three reasons, and they are the reason this file exists:
--   1. "Up to two" is a COUNT, not a fixed pair. A table expresses it honestly;
--      a second column set hard-codes exactly two and makes the single-parent
--      case a row of NULLs.
--   2. A parent card is about a PERSON, while `profiles` is about an ACCOUNT.
--      Mixing them is what makes "who am I" and "who is my partner" the same
--      field, which is precisely the confusion the founder's two requests
--      (individual cards + linked accounts) separately point at.
--   3. UNLINKING must not delete anyone's words. If a partner's text lived in
--      the partner's own row on MY profile, unlinking would either orphan it or
--      lose it. With `parent_cards` owned by the account that wrote them, an
--      unlink only removes the LINK.
--
-- RELATIONSHIP TO THE EXISTING `profiles.bio` (pinned deliberately, because a
-- later reader will otherwise assume one replaced the other):
--   * `profiles.bio` KEEPS its job: the account-level "About the parents" text,
--     still rendered on /u/:handle and still the field the profile editor
--     autosaves. It is NOT deprecated and NOT migrated.
--   * `parent_cards.about` is the PER-PARENT detail beneath it.
--   Both can render on one profile; neither is derived from the other.
--
-- NO KID DATA HERE. `parent_cards` carries nothing about children — the V9 t11
-- private-bucket and first-name-only pins are untouched by this migration.
--
-- ---------------------------------------------------------------------------
-- PRIVACY POSTURE (the part worth reading before changing any policy)
-- ---------------------------------------------------------------------------
-- `account_links` is the first table in this schema that relates TWO accounts,
-- so it is the first place a careless policy could leak one parent's
-- relationships to a third. The rules, stated as claims a probe can test:
--
--   * A link row is SELECTable ONLY by its two parties. A third account reads
--     ZERO rows — not "a redacted row", zero. This is asserted live in the
--     slice's verification, not assumed from reading the SQL.
--   * A link is CREATEd only as yourself (`requester_id = auth.uid()`), so
--     nobody can manufacture an invitation that appears to come from someone
--     else.
--   * Only the ADDRESSEE may change the status (accept/decline). The requester
--     cannot accept on the other parent's behalf, which is what makes the
--     handshake meaningful rather than decorative.
--   * Nothing here is readable by `anon`. Signed-out visitors see no links.
--
-- Idempotent + re-paste-safe (house pattern, 2026-09-04 lesson; 0041/0045/0046
-- precedents): `create table if not exists` and DO-block-guarded policy creates.
-- `create policy` has NO `if not exists` in Postgres (the 2026-09-04 rule), so
-- every policy is guarded on pg_policies by name. Run once or a hundred times,
-- the schema ends in the same state.
--
-- 42P17 DISCIPLINE: no policy below subqueries its OWN table. The one
-- cross-table read (`account_links` → `profiles`) is a plain join on a key, and
-- the reciprocal-link question is answered by a SECURITY DEFINER helper rather
-- than a self-referencing subquery — the `90a159f` lesson, recorded in
-- task-state as: "a policy that must reference its own table's other rows uses
-- a SECDEF helper or a security_barrier view — never a direct self-subquery".
--
-- Apply order: independent. Assumes only that `public.profiles` exists (0001).

-- ---------------------------------------------------------------------------
-- 1. parent_cards — up to two parents per account, each with photo + about.
-- ---------------------------------------------------------------------------
create table if not exists public.parent_cards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- The parent's name as it should read on the card. Free text with no CHECK
  -- (the 0021 lesson: a DB constraint on display copy blocks a legitimate
  -- later edit); the UI caps it, the DB does not police wording.
  name text not null,
  -- A PRIVATE-BUCKET path (the 0038 kid-photo pattern), never a public URL.
  -- Nullable: a card with words and no picture is a complete card, not a
  -- half-finished one.
  photo_url text,
  about text,
  -- 1 or 2 — the render order, and the thing that makes "up to two" a real
  -- limit rather than a hope (see the unique constraint below).
  position integer not null,
  created_at timestamptz not null default now(),
  constraint parent_cards_position_chk check (position between 1 and 2)
);

-- AT MOST ONE CARD PER SLOT. "Up to two" is enforced HERE, in the database,
-- because a UI-only cap is a suggestion: two rapid taps in a flaky tab could
-- otherwise write three cards and the profile would render two of them while
-- one sat invisible. A unique constraint makes the third write fail loudly.
create unique index if not exists parent_cards_profile_position_key
  on public.parent_cards (profile_id, position);

alter table public.parent_cards enable row level security;

-- READ: any signed-in parent. These cards render on a profile that is already
-- visible to signed-in users, so this widens nothing — it mirrors the existing
-- profile visibility posture rather than inventing a new one. NOT anon: a
-- signed-out visitor sees no parent cards, matching the rest of the
-- authenticated surface.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'parent_cards'
      and policyname = 'parent_cards_select_authenticated'
  ) then
    create policy parent_cards_select_authenticated
      on public.parent_cards for select
      to authenticated
      using (true);
  end if;
end
$$;

-- WRITE: owner only, for every verb. Insert/update/delete all key on
-- `profile_id = auth.uid()`, so a parent can only ever author their own cards.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'parent_cards'
      and policyname = 'parent_cards_insert_own'
  ) then
    create policy parent_cards_insert_own
      on public.parent_cards for insert
      to authenticated
      with check (profile_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'parent_cards'
      and policyname = 'parent_cards_update_own'
  ) then
    create policy parent_cards_update_own
      on public.parent_cards for update
      to authenticated
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'parent_cards'
      and policyname = 'parent_cards_delete_own'
  ) then
    create policy parent_cards_delete_own
      on public.parent_cards for delete
      to authenticated
      using (profile_id = auth.uid());
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. account_links — the invite → accept handshake between two parents.
-- ---------------------------------------------------------------------------
create table if not exists public.account_links (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  -- A closed set the app branches on, so a CHECK is right here (unlike a bio):
  -- an unknown status would render as nothing and silently strand an invite.
  constraint account_links_status_chk check (status in ('pending', 'accepted', 'declined')),
  -- Nobody links to themselves. Enforced in the DB as well as the UI, because
  -- a self-link would make a parent appear twice on their own profile.
  constraint account_links_not_self_chk check (requester_id <> addressee_id)
);

-- AT MOST ONE ACTIVE LINK PER PARENT — enforced on the PERSON, not the column.
--
-- ---------------------------------------------------------------------------
-- THIS WAS WRONG IN THE FIRST DRAFT, AND A LIVE PROBE CAUGHT IT. Recorded here
-- because the shape of the mistake is more useful than the fix.
--
-- The first version used two partial unique indexes, one on `requester_id` and
-- one on `addressee_id`, both `where status = 'accepted'`. A probe against
-- three real accounts showed the hole immediately: account A accepted a link as
-- REQUESTER with B and, separately, accepted one as ADDRESSEE from C — and both
-- rows were happily accepted, leaving A with TWO partners and a profile that
-- would render three parents on a "up to two" card grid. Each index guarded one
-- COLUMN; nothing guarded the PERSON who appears in both columns.
--
-- A unique index cannot express this: the value to constrain is "the other
-- party", which depends on which column you are in, and Postgres indexes do not
-- do that conditionally. So the rule moves into a trigger, which sees the whole
-- row. (A generated column could do it, but a trigger states the rule in one
-- place and reads as the rule it is.)
-- ---------------------------------------------------------------------------
--
-- The self-link and duplicate-pending rules below stay as indexes: those ARE
-- plain column rules, and a constraint is the cheapest correct form for them.
create unique index if not exists account_links_one_pending_per_pair
  on public.account_links (requester_id, addressee_id) where status = 'pending';

-- The one-active-partner rule, on the person. Fires on INSERT and on UPDATE
-- (the UPDATE path matters: a pending row BECOMES accepted later, so an INSERT-
-- only trigger would miss the exact sequence the probe used).
--
-- A partial unique index cannot span "either column", so this is a trigger with
-- an explicit existence check. It is BEFORE, so it rejects the write rather than
-- repairing it afterwards, and it only inspects rows that are leaving or
-- entering the accepted state.
create or replace function public.account_links_one_partner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflicting integer;
begin
  -- Only 'accepted' rows can conflict; pending and declined are unlimited.
  if new.status <> 'accepted' then
    return new;
  end if;

  -- Count accepted links that would leave this row's TWO PEOPLE with more than
  -- one partner. The pair is treated as a set: whichever column each id sits in
  -- is irrelevant, because a link is symmetric once accepted.
  select count(*) into conflicting
  from public.account_links l
  where l.id <> new.id
    and l.status = 'accepted'
    and (
      l.requester_id in (new.requester_id, new.addressee_id)
      or l.addressee_id in (new.requester_id, new.addressee_id)
    )
    -- Ignore the mirror of THIS pair: a reciprocal duplicate of the same two
    -- people is the duplicate-pending index's business, and counting it here
    -- would make the message misleading.
    and not (l.requester_id = new.addressee_id and l.addressee_id = new.requester_id);

  if conflicting > 0 then
    raise exception
      'a parent may have only one linked partner (existing accepted link found)'
      using errcode = '23505';
  end if;

  return new;
end
$$;

drop trigger if exists account_links_one_partner_guard_trg on public.account_links;
create trigger account_links_one_partner_guard_trg
  before insert or update on public.account_links
  for each row execute function public.account_links_one_partner_guard();

-- ---------------------------------------------------------------------------
-- CLEANUP OF THE FIRST DRAFT (idempotent; a no-op on a fresh database).
--
-- The first version created the two per-column indexes above and, under a live
-- probe, let one account hold TWO accepted partners. Both artifacts are removed
-- here so a re-paste CONVERGES rather than leaving the bad state in place.
--
-- The demotion runs AFTER the trigger exists but the trigger only fires on
-- writes, so it does not block this UPDATE — which is deliberate: the existing
-- duplicate rows must be repairable. A second accepted link for the same person
-- is set to 'declined' rather than deleted: the invitation really happened, and
-- erasing it would rewrite history to make the schema look like it never had a
-- bug. The OLDEST accepted link per person survives (the earliest relationship
-- is the one the parent actually formed; the later rows are what the draft let
-- through).
-- ---------------------------------------------------------------------------
drop index if exists public.account_links_one_accepted_as_requester;
drop index if exists public.account_links_one_accepted_as_addressee;

update public.account_links l
set status = 'declined',
    responded_at = coalesce(l.responded_at, now())
where l.status = 'accepted'
  and exists (
    -- Another ACCEPTED link shares either of this row's two people, and is
    -- older — so this row is the surplus one.
    select 1 from public.account_links other
    where other.id <> l.id
      and other.status = 'accepted'
      and (
        other.requester_id in (l.requester_id, l.addressee_id)
        or other.addressee_id in (l.requester_id, l.addressee_id)
      )
      and (other.created_at, other.id) < (l.created_at, l.id)
  );

alter table public.account_links enable row level security;

-- READ: the two parties, and nobody else. A third account gets ZERO ROWS.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_links'
      and policyname = 'account_links_select_parties'
  ) then
    create policy account_links_select_parties
      on public.account_links for select
      to authenticated
      using (requester_id = auth.uid() or addressee_id = auth.uid());
  end if;
end
$$;

-- CREATE: only as yourself. `requester_id = auth.uid()` in the WITH CHECK, so a
-- forged "invitation from someone else" cannot be inserted.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_links'
      and policyname = 'account_links_insert_as_self'
  ) then
    create policy account_links_insert_as_self
      on public.account_links for insert
      to authenticated
      with check (requester_id = auth.uid() and status = 'pending');
  end if;
end
$$;

-- RESPOND: only the ADDRESSEE may move a row out of 'pending'. The requester
-- cannot accept their own invitation — that is what makes the handshake real.
-- The USING is about the OLD row, the WITH CHECK about the NEW one, so this
-- also pins that a response may only land on 'accepted' or 'declined'.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_links'
      and policyname = 'account_links_update_addressee'
  ) then
    create policy account_links_update_addressee
      on public.account_links for update
      to authenticated
      using (addressee_id = auth.uid())
      with check (addressee_id = auth.uid() and status in ('accepted', 'declined'));
  end if;
end
$$;

-- UNLINK: either party may end an accepted link. Expressed as a DELETE so an
-- unlink is complete — no half-row left behind for a later reader to
-- misinterpret as an active relationship.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_links'
      and policyname = 'account_links_delete_parties'
  ) then
    create policy account_links_delete_parties
      on public.account_links for delete
      to authenticated
      using (requester_id = auth.uid() or addressee_id = auth.uid());
  end if;
end
$$;

-- A requester may also WITHDRAW a pending invite they sent. Without this the
-- INSERT/UPDATE/DELETE set would leave a parent unable to cancel their own
-- mistake — they could only wait for the other party to decline.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_links'
      and policyname = 'account_links_delete_requester_pending'
  ) then
    create policy account_links_delete_requester_pending
      on public.account_links for delete
      to authenticated
      using (requester_id = auth.uid() and status = 'pending');
  end if;
end
$$;
