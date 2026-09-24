-- ===========================================================================
-- V23 follow-up (migration 0051): the DM read cursor — direct_conversation_reads.
-- ===========================================================================
--
-- WHAT THIS DOES: adds ONE table, `public.direct_conversation_reads`, a
-- per-(viewer, other-party) read cursor for FREE-FORM direct conversations
-- (`messages.playdate_id IS NULL`, migration 0043).
--
-- WHY (the founder's ask): direct messages showed no unread badge while
-- playdate-scoped conversations did. The existing cursor, `conversation_reads`
-- (0042), is keyed by `playdate_id uuid NOT NULL references playdates(id)` —
-- so it structurally cannot carry a read position for a DM, which has no
-- playdate. The inbox therefore hardcoded `unreadCount: 0` for DMs. This table
-- closes that gap: an unread DM shows a count + dot, and the dot clears when the
-- thread is opened — the behaviour playdate conversations already have.
--
-- THE PINNED DESIGN DECISION (chosen over the alternative): a SEPARATE TABLE,
-- not a nullable `conversation_reads.playdate_id` widened to carry a second
-- identity column. The playdate cursor is a live, working path; making its
-- `playdate_id` nullable would mean altering the PK + the NOT NULL + the FK on a
-- table with real read rows, and every `conversation_reads` query would then
-- need an `IS NOT NULL`-style guard to avoid mixing the two shapes. A separate
-- table keeps the playdate path byte-for-byte untouched (the task's hard
-- constraint: "the playdate path's behaviour must not change") and matches the
-- existing cursor pattern (own-rows-only RLS, composite PK, last_read_at
-- upsert). It costs one table; it risks nothing that already works.
--
-- IDENTITY: a free-form thread has no playdate id, so from a VIEWER's
-- perspective it is identified by the OTHER party's profile id. The PK is
-- therefore (profile_id, other_profile_id): one cursor per viewer per
-- counterpart, and the upsert target mirrors conversation_reads' composite PK
-- shape. The pair is symmetric only in intent — each side stores its own row
-- keyed on the counterpart, exactly as each side of a DM has its own view.
--
-- RLS POSTURE (mirrors 0042's conversation_reads policies exactly — each
-- profile manages only its own cursors):
--   * SELECT  — own only (profile_id = auth.uid()).
--   * INSERT  — own only (profile_id = auth.uid()).
--   * UPDATE  — own only (profile_id = auth.uid(), using + with check).
-- No other table's policy is touched.
--
-- NO REALTIME ENTRY: like conversation_reads, the cursor is not broadcast —
-- unread counts refresh on the inbox list reload, not on a realtime event
-- (0042's header records the same decision for the playdate cursor).
--
-- Idempotent + re-paste-safe (house pattern, 2026-09-04 lesson; 0042/0043/0044
-- precedents): the table is `create table if not exists`; every policy is
-- DO-block guarded on pg_policies by name (`create policy` has no IF NOT
-- EXISTS). Run once or a hundred times, the schema ends in the same state.
--
-- Apply order: independent. Assumes only that `public.profiles` exists (it has
-- since 0001). The last applied migration is 0050.

create table if not exists public.direct_conversation_reads (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  other_profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (profile_id, other_profile_id),
  -- A cursor on yourself is meaningless (you cannot DM yourself): the UI never
  -- offers it, and the pair constraint keeps a malformed row out of the table.
  constraint direct_conversation_reads_not_self_chk check (profile_id <> other_profile_id)
);

alter table public.direct_conversation_reads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'direct_conversation_reads'
      and policyname = 'direct_conversation_reads_select_own'
  ) then
    create policy "direct_conversation_reads_select_own"
      on public.direct_conversation_reads for select
      to authenticated
      using (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'direct_conversation_reads'
      and policyname = 'direct_conversation_reads_insert_own'
  ) then
    create policy "direct_conversation_reads_insert_own"
      on public.direct_conversation_reads for insert
      to authenticated
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'direct_conversation_reads'
      and policyname = 'direct_conversation_reads_update_own'
  ) then
    create policy "direct_conversation_reads_update_own"
      on public.direct_conversation_reads for update
      to authenticated
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());
  end if;
end
$$;
