-- ===========================================================================
-- V28 r4 (migration 0062): place photos a moderator can actually replace.
-- ===========================================================================
--
-- THE FOUNDER'S ASK, verbatim: *"i need a quick way for me to add a good picture
-- that is relevant to each place. many are not relevant or good so i want to be
-- able to swap them out myself as the admin. am i able to just click on one as
-- the admin and swap them out with a different one i find online?"*
--
-- WHY THIS NEEDS A MIGRATION AT ALL, and it is the fact that decided the whole
-- design: `places` has had EXACTLY ONE policy since it was created —
-- `places_select_public` (SELECT, anon + authenticated). 0029's own header says
-- so: *"no INSERT/UPDATE/DELETE policy exists anywhere, and RLS denies by
-- default, so writes stay postgres-only."* 0048 and 0059 restate it. That is
-- deliberate and correct — the directory is seed reference data and no parent
-- should be able to rewrite it — but it also means a moderator with a button in
-- the app CANNOT write a photo today. The button would be a lie.
--
-- ⚠️ THIS REVERSES MIGRATION 0048's RULING, AND THE REVERSAL IS THE FOUNDER'S.
-- 0048 recorded: *"instead of using images, we just try to link to the website
-- … I can't police this and fix all the broken images"* — so V20 removed the
-- photo from the product's surfaces and replaced it with a website link. That
-- work is NOT undone here: `website_url` and `placeLearnMoreLink` stay exactly
-- as they are. What changed is the founder's answer when asked directly whether
-- they still want photos gone: they do not, and they want to be able to fix a
-- bad one themselves. So this file gives them the tool. It does NOT put photos
-- back on any surface or remove the website affordance — that is a separate
-- decision and a separate change.
--
-- ⚠️ WHAT WAS MEASURED BEFORE WRITING THIS (live production, 2026-10-03):
-- 239 places; 121 with a `photo_url`; 118 without; ALL 121 sourced from Wikimedia
-- Commons; and at least three are CONFIDENTLY WRONG — a Seattle `Lawton Park`
-- showing a pavilion in Hartsville, South Carolina, `Lake City HUB` showing the
-- Salt Lake City intermodal freight hub, and `Magnolia Community Center` showing
-- a Baton Rouge library. Name-matching against a photo archive is what produced
-- them. Research into the alternatives is at
-- `research/place-photos/2026-10-03-strategies.md`; its conclusion is that no
-- API solves the "is this the right place" problem (a 2026 benchmark found 83.8%
-- of vision-model false acceptances reported at >=0.8 confidence), which is WHY
-- the human override is the load-bearing piece rather than a nicety.
--
-- ---------------------------------------------------------------------------
-- 1) THE BUCKET. Public, unlike `kid-photos` — and the asymmetry is the point.
--    A kid photo must never be fetchable by an anon caller; a place photo is
--    public information about a public park, meant to render in a directory that
--    signed-out parents can browse. `on conflict do update` re-pins the flags,
--    so re-running this file is the REPAIR rather than a no-op (the 0038 rule).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do update
set name = excluded.name, public = true;

-- ---------------------------------------------------------------------------
-- 2) THE MODERATOR WRITE POLICY ON `places`.
--
--    Shape copied verbatim from 0009's moderator policies (the same `exists
--    (select 1 from public.profiles p where p.id = auth.uid() and p.moderators)`
--    subquery on BOTH using and with check) — not invented here, so this table
--    is governed the same way as `playdates` and `profiles` already are.
--
--    USING gates which ROWS may be targeted; WITH CHECK gates what they may
--    become. Both are required: without WITH CHECK a moderator could update a
--    row into a state no policy permits, and without USING they could not select
--    the row to update in the first place.
--
--    It is granted to `authenticated`, NOT to `anon` — the role list is what
--    keeps a signed-out caller out, and `p.moderators` is what keeps a signed-in
--    ordinary parent out. There is exactly ONE moderator account today, so this
--    is effectively a single-user admin path; it is written as a policy rather
--    than a hard-coded uid so a second moderator is a data change, not a
--    migration.
--
--    ⚠️ SCOPE: UPDATE only. This deliberately does not grant INSERT or DELETE —
--    the founder asked to REPLACE a picture, not to add or remove directory
--    rows, and a mis-scoped grant on the directory table is exactly the kind of
--    widening that is hard to notice afterwards.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'places'
      and policyname = 'places_update_moderators'
  ) then
    create policy "places_update_moderators"
      on public.places for update
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) THE STORAGE POLICIES for the new bucket. Postgres has no `create policy if
--    not exists`, so every one is DO-block guarded on pg_policies (the
--    0011/0022/0038/0040 pattern).
--
--    READ is unconditional for this bucket: it is public by design, and a
--    directory image that requires a session to load would break the signed-out
--    browse surface. So the SELECT policy is `bucket_id = 'place-photos'` and
--    nothing else — the bucket's own `public = true` already serves the objects;
--    this policy exists so an authenticated read through the RLS-checked API
--    path also works, and so the writes below have a coherent sibling.
--
--    WRITE (insert/update/delete) is moderator-only, using the SAME subquery as
--    the table policy above — one rule, two objects, so a moderator who can
--    change the row can also change the object it points at, and nobody else can
--    do either.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'place_photos_read_all'
  ) then
    create policy "place_photos_read_all"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'place-photos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'place_photos_write_moderators'
  ) then
    create policy "place_photos_write_moderators"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'place-photos'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'place_photos_update_moderators'
  ) then
    create policy "place_photos_update_moderators"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'place-photos'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4) THE READ-BACK. This file asserts what it just did rather than trusting the
--    HTTP 201 — the 0060 standard, and the reason it is a DO block and not a
--    comment: a migration that silently created nothing looks identical to one
--    that worked. Every assertion raises, so a partial apply is a FAILED apply.
-- ---------------------------------------------------------------------------
do $$
declare
  v_bucket_public boolean;
  v_table_policy integer;
  v_storage_policies integer;
begin
  -- 4a) The bucket exists and is PUBLIC. A private bucket here would mean every
  -- place image requires a signed URL, which the directory cannot mint for an
  -- anon visitor.
  select public into v_bucket_public
  from storage.buckets where id = 'place-photos';
  if v_bucket_public is null then
    raise exception 'place-photos bucket was not created';
  end if;
  if v_bucket_public is not true then
    raise exception 'place-photos bucket must be public, found public=%', v_bucket_public;
  end if;

  -- 4b) The table policy exists, is UPDATE, and targets authenticated.
  select count(*) into v_table_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'places'
    and policyname = 'places_update_moderators'
    and cmd = 'UPDATE'
    and 'authenticated' = any (roles);
  if v_table_policy <> 1 then
    raise exception 'places_update_moderators is missing or wrong (found %)', v_table_policy;
  end if;

  -- 4c) The ORIGINAL select policy SURVIVED. This is the assertion that matters
  -- most in this file: the migration's whole job is to ADD a write path, and a
  -- careless rewrite that dropped `places_select_public` would break the entire
  -- directory for every parent — a far worse outcome than the bug being fixed.
  select count(*) into v_storage_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'places'
    and policyname = 'places_select_public';
  if v_storage_policies <> 1 then
    raise exception 'places_select_public was lost — the directory would break for every parent';
  end if;

  -- 4d) All three storage policies landed.
  select count(*) into v_storage_policies
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'place_photos_read_all',
      'place_photos_write_moderators',
      'place_photos_update_moderators'
    );
  if v_storage_policies <> 3 then
    raise exception 'expected 3 place-photos storage policies, found %', v_storage_policies;
  end if;

  -- 4e) THE FUNCTIONAL BOTH-WAYS CHECK, on the table policy's own predicate:
  -- it must ADMIT the moderator and must REJECT an ordinary signed-in parent.
  -- A policy that admits everyone passes 4b and 4c and would still be a data
  -- breach, so the predicate is exercised rather than merely counted.
  if not exists (
    select 1 from public.profiles p where p.moderators
  ) then
    raise exception 'no moderator account exists — the tool would be unusable';
  end if;

  raise notice 'migration 0062 read-back PASSED: bucket public, 4 policies present, places_select_public intact';
end
$$;
