-- ===========================================================================
-- V8 ticket 08 (migration 0031): PUSH SUBSCRIPTIONS — the capability store.
-- ===========================================================================
--
-- What this adds: one row per BROWSER/DEVICE that has opted in to web push,
-- holding the three values a Web Push POST needs (the endpoint URL plus the
-- `p256dh` / `auth` encryption keys). 0032 (`notification_log`) is the outbox
-- that the sender drains against these rows.
--
-- Pinned decisions (ticket 08 + .scratch/v8/spec.md; load-bearing, not
-- preferences):
--
-- (a) A SUBSCRIPTION ENDPOINT IS A CAPABILITY, NOT A PROFILE FIELD. Anyone
--     holding the endpoint + keys can push arbitrary content to that parent's
--     device, and cannot be made to prove they are the parent. Therefore the
--     RLS posture is OWNER-ONLY ON ALL FOUR VERBS and there is deliberately NO
--     read for any other signed-in parent — not even a count, not even a
--     moderator. This is the one table in the project where the default
--     "authenticated may read" posture (0001/0005/0007) would be a real
--     vulnerability rather than a convenience, so it is inverted here. Every
--     policy is `profile_id = auth.uid()`; anon has NO policy at all (fail
--     closed — a signed-out probe gets 0 rows / 42501, never a key).
--
-- (b) `endpoint` IS GLOBALLY UNIQUE (inline `unique` → constraint
--     `push_subscriptions_endpoint_key`). The push service hands the SAME
--     endpoint string back for the same browser profile forever, so the
--     endpoint — not a composite with profile_id — is the natural key: it is
--     what makes re-subscribing an UPSERT (the client writes on every opt-in
--     and every `pushsubscriptionchange`) instead of an ever-growing pile of
--     dead rows for one device. The `profile_id` FK is `on delete cascade`:
--     deleting a parent removes their capability rows with them.
--
--     Note the failure mode this creates, which is the CORRECT one: a second
--     profile that POSTs an endpoint already owned by someone else hits the
--     unique index and the ON CONFLICT UPDATE path, which the UPDATE policy's
--     USING clause hides from them — so the write FAILS CLOSED (42501 / 0
--     rows) instead of letting one parent steal another's device. Do not
--     "fix" that by widening the policy.
--
-- (c) `p256dh` / `auth` / `user_agent` are NULLABLE on purpose. The columns
--     the DB enforces are the ones that must be true; a subscription pushed
--     through a nonstandard test harness may carry no keys, and the sender
--     treats a keyless row as unsendable (it stamps `error` rather than
--     crashing the whole drain). `user_agent` is diagnostic only — never a
--     security input (it is written by the client and is trivially forged).
--
-- (d) `last_seen_at` is bumped on every successful opt-in/re-subscribe,
--     `created_at` is written once. This is what lets a human audit which
--     devices are actually still alive without touching the keys (a device
--     that has not re-registered in months is a candidate to prune by hand;
--     the automated prune is the sender's 404/410 path, not a time sweep).
--
-- (e) NOTHING ELSE IN THIS MIGRATION TOUCHES AN EXISTING OBJECT. No existing
--     table, column, policy, or function is altered — the only new surface is
--     this table plus its own four policies. 0032 owns the producers.
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): `create table if
-- not exists`; the unique constraint is declared INLINE inside the create
-- (so a re-paste of an already-created table is a no-op rather than a
-- duplicate-constraint error); every policy is DO-block guarded (Postgres has
-- no `CREATE POLICY IF NOT EXISTS`).
-- ===========================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- The push service's URL for this browser profile. Globally unique (pin b).
  endpoint text not null unique,
  -- The client's Web Push encryption keys (pin c: nullable, sender-safe).
  p256dh text,
  auth text,
  -- Diagnostic only — forged by the client, never trusted (pin c).
  user_agent text,
  created_at timestamptz not null default now(),
  -- Bumped on every re-subscribe (pin d).
  last_seen_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Owner-only on all four verbs (pin a). Each policy is a separate DO block
-- guard keyed on its own policyname, so a half-applied paste completes
-- cleanly on the next run.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'push_subscriptions_select_owner'
  ) then
    create policy "push_subscriptions_select_owner"
      on public.push_subscriptions for select
      to authenticated
      using (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'push_subscriptions_insert_owner'
  ) then
    create policy "push_subscriptions_insert_owner"
      on public.push_subscriptions for insert
      to authenticated
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'push_subscriptions_update_owner'
  ) then
    -- USING is what makes the ON CONFLICT (endpoint) upsert fail closed for a
    -- non-owner (pin b) — do not drop it.
    create policy "push_subscriptions_update_owner"
      on public.push_subscriptions for update
      to authenticated
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'push_subscriptions_delete_owner'
  ) then
    -- "Turn off notifications" (the /profile toggle) deletes THIS row, which
    -- is the whole opt-out: with no subscription the sender has nowhere to
    -- post, so opting out needs no flag anywhere else.
    create policy "push_subscriptions_delete_owner"
      on public.push_subscriptions for delete
      to authenticated
      using (profile_id = auth.uid());
  end if;
end
$$;
