-- ===========================================================================
-- Slice 2b (migration 0065): DEVICE TOKENS — the NATIVE push capability store.
-- ===========================================================================
--
-- What this adds: one row per INSTALLED APP that has registered for native push,
-- holding the per-install registration token the provider send addresses. 0065
-- is the native twin of 0031 (`push_subscriptions`), and deliberately its
-- mirror: 0031 stores the Web Push triple (endpoint + p256dh + auth), this
-- stores the one opaque string a native provider send has (the Web Push triple
-- does not exist here — no endpoint, no keys, no service worker).
--
-- A NATIVE TOKEN IS NOT A VAPID SUBSCRIPTION. They coexist: the sender's web
-- path reads `push_subscriptions`, the native path reads `device_tokens`, and
-- neither is derived from the other. Do not "unify" them, and do not delete
-- either table's rows from the other's code path.
--
-- Pinned decisions (load-bearing, not preferences):
--
-- (a) A DEVICE TOKEN IS A CAPABILITY, NOT A PROFILE FIELD. Anyone holding it
--     can push arbitrary content to that parent's phone, and cannot be made to
--     prove they are the parent. So the RLS posture is OWNER-ONLY ON ALL FOUR
--     VERBS, exactly as 0031 pinned it for `push_subscriptions`, and there is
--     deliberately NO read for any other signed-in parent — not even a count,
--     not even a moderator. Every policy is `profile_id = auth.uid()`; anon has
--     NO policy at all (fail closed — a signed-out probe gets 0 rows / 42501,
--     never a token). The DO block at the end of this file ASSERTS that
--     posture instead of assuming it: RLS enabled, exactly the four owner-only
--     policies, each scoped to `authenticated` and each mentioning
--     `auth.uid()`, or the migration fails loudly.
--
-- (b) `token` IS GLOBALLY UNIQUE (inline `unique` → constraint
--     `device_tokens_token_key`), and THAT IS THE UPSERT KEY. The provider
--     hands the same registration token back for the same install, so the
--     token — not a composite with profile_id — is the natural key: it is what
--     makes re-registering an UPSERT
--       insert … on conflict (token) do update
--         set profile_id = excluded.profile_id,
--             last_seen_at = now(),
--             app_version = excluded.app_version
--     instead of an ever-growing pile of duplicate rows for one phone. The
--     client writes exactly that upsert (`onConflict: 'token'`); the
--     `last_seen_at` bump on the update branch is the "this device is still
--     alive" signal (pin d). The `profile_id` FK is `on delete cascade`:
--     deleting a parent removes their device rows with them (0058's account
--     deletion therefore needs no change).
--
--     Note the failure mode this creates, which is the CORRECT one and the
--     same one 0031 pin (b) documents: a second profile that registers a token
--     already owned by someone else hits the unique index and the ON CONFLICT
--     UPDATE path, which the UPDATE policy's USING clause hides from them — so
--     the write FAILS CLOSED (42501 / 0 rows) instead of letting one parent
--     take over another's device. Do not "fix" that by widening the policy.
--
-- (c) `platform` IS A CHECK, NOT FREE TEXT: 'ios' | 'android'. The sender
--     branches on it (the FCM message carries an `android` block for android
--     only), and an unknown platform would silently take the wrong branch. The
--     two values are also the ones the send path can address; a 'web' device
--     belongs in `push_subscriptions`, not here.
--
-- (d) `last_seen_at` is bumped on every successful re-registration, `created_at`
--     is written once. This is what lets a human audit which installs are still
--     alive without touching the tokens (an install that has not re-registered
--     in months is a candidate to prune by hand; the AUTOMATED prune is the
--     sender's dead-token response — UNREGISTERED / 404 / 410 — not a time
--     sweep).
--
-- (e) `app_version` is NULLABLE and diagnostic only. It is written by the
--     client and is trivially forged; it exists so a human can tell "the new
--     build registers fine, the old one does not" apart without guessing.
--
-- (f) NOTHING ELSE IN THIS MIGRATION TOUCHES AN EXISTING OBJECT. No existing
--     table, column, policy, or function is altered — the only new surface is
--     this table, its index, and its own four policies. The sender branch that
--     reads it is code (slice 2b), not SQL, and it tolerates this table being
--     absent (a pre-0065 project) rather than stranding the drain.
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson, and 0031's shape):
-- `create table if not exists`; the unique constraint and the platform CHECK
-- are declared INLINE inside the create (so a re-paste of an already-created
-- table is a no-op rather than a duplicate-constraint error); the index is
-- `create index if not exists`; every policy is DO-block guarded (Postgres has
-- no `CREATE POLICY IF NOT EXISTS`); and the assertion block at the end is
-- itself re-runnable (it only reads the catalog).
-- ===========================================================================

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- 'ios' | 'android' (pin c). Inline, so a re-paste cannot try to add it twice.
  platform text not null check (platform in ('ios', 'android')),
  -- The provider's per-install registration token. Globally unique, and the
  -- upsert key on re-registration (pin b).
  token text not null unique,
  -- Diagnostic only — written by the client, never trusted (pin e).
  app_version text,
  created_at timestamptz not null default now(),
  -- Bumped on every re-registration (pin d).
  last_seen_at timestamptz not null default now()
);

-- The drain reads BY profile_id for each queued row, and the SELECT policy also
-- filters on profile_id — without this the read is a sequential scan of every
-- install on every notification. `token` already carries the unique index.
create index if not exists device_tokens_profile_id_idx
  on public.device_tokens (profile_id);

alter table public.device_tokens enable row level security;

-- Owner-only on all four verbs (pin a). Each policy is a separate DO block
-- guarded on its own policyname, so a half-applied paste completes cleanly on
-- the next run.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_tokens'
      and policyname = 'device_tokens_select_owner'
  ) then
    create policy "device_tokens_select_owner"
      on public.device_tokens for select
      to authenticated
      using (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_tokens'
      and policyname = 'device_tokens_insert_owner'
  ) then
    create policy "device_tokens_insert_owner"
      on public.device_tokens for insert
      to authenticated
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_tokens'
      and policyname = 'device_tokens_update_owner'
  ) then
    -- USING is what makes the ON CONFLICT (token) upsert fail closed for a
    -- non-owner (pin b) — do not drop it. The update branch is also how a
    -- re-registration refreshes `last_seen_at` (pin d), so the policy is not
    -- optional: without it the upsert would raise 42501 for everyone.
    create policy "device_tokens_update_owner"
      on public.device_tokens for update
      to authenticated
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_tokens'
      and policyname = 'device_tokens_delete_owner'
  ) then
    -- "Turn off notifications" (the /settings toggle) deletes THIS row, which
    -- is the whole opt-out: with no device row the sender has nothing to
    -- address natively. (A provider-side prune of a dead token is the same
    -- delete, run with the service role.)
    create policy "device_tokens_delete_owner"
      on public.device_tokens for delete
      to authenticated
      using (profile_id = auth.uid());
  end if;
end
$$;

-- ===========================================================================
-- THE ASSERTION (pin a). "A third party must read ZERO rows" is an acceptance
-- criterion, so it is asserted here rather than assumed by whoever reads the
-- policy list. A permissive default, a policy added later without this naming
-- convention, or an RLS flag that never got switched on all fail this block
-- LOUDLY, on the migration run itself. It reads the catalog only, so a re-paste
-- re-asserts the same facts.
-- ===========================================================================
do $$
declare
  owner_policies integer;
  foreign_policies integer;
  unguarded integer;
  rls_on boolean;
begin
  select c.relrowsecurity into rls_on
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'device_tokens';

  if rls_on is distinct from true then
    raise exception 'device_tokens: row level security is NOT enabled — a third party could read every device token';
  end if;

  -- Exactly the four owner policies, and nothing else. A fifth policy (or a
  -- renamed one) is a finding even when it happens to be restrictive: the point
  -- is that the ONLY door in is `profile_id = auth.uid()`.
  select count(*) into owner_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'device_tokens'
    and policyname in (
      'device_tokens_select_owner',
      'device_tokens_insert_owner',
      'device_tokens_update_owner',
      'device_tokens_delete_owner'
    );

  select count(*) into foreign_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'device_tokens';

  if owner_policies <> 4 or foreign_policies <> 4 then
    raise exception 'device_tokens: expected exactly 4 owner-only policies, found % (owner-named: %) — a third party may be able to reach a device token',
      foreign_policies, owner_policies;
  end if;

  -- Each policy must be `to authenticated` (never `public`/`anon`) and each must
  -- carry `auth.uid()` in the clause the verb ACTUALLY uses: USING for
  -- select/delete, WITH CHECK for insert, both for update. `pg_policies.qual`
  -- and `.with_check` are the rendered clauses, so this checks what Postgres
  -- will enforce, not what the text above intended. (The per-verb CASE is
  -- load-bearing: an INSERT policy has a NULL `qual`, so a single
  -- "qual must mention auth.uid()" test would fail a CORRECT migration.)
  select count(*) into unguarded
  from pg_policies
  where schemaname = 'public'
    and tablename = 'device_tokens'
    and (
      roles <> '{authenticated}'::name[]
      or (
        case cmd
          when 'SELECT' then coalesce(qual, '')
          when 'DELETE' then coalesce(qual, '')
          when 'INSERT' then coalesce(with_check, '')
          when 'UPDATE' then coalesce(qual, '') || ' ' || coalesce(with_check, '')
          else ''
        end
      ) not like '%auth.uid()%'
    );

  if unguarded <> 0 then
    raise exception 'device_tokens: % policy(ies) are not owner-only (need role authenticated and an auth.uid() clause) — a third party could read device tokens',
      unguarded;
  end if;
end
$$;
