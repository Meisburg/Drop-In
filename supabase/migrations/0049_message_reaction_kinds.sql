-- ===========================================================================
-- V21 t03 (migration 0049): message reaction KINDS — one row per person, six
-- kinds, kind is a mutable attribute.
-- ===========================================================================
--
-- What this does: adds ONE column to `public.message_reactions` —
-- `kind text not null default 'like'` — with a CHECK constraint pinning it to
-- exactly the six kinds the app offers (like / love / laugh / wow / sad /
-- angry). It touches no existing row's data in a destructive way: every
-- pre-existing row gets the DEFAULT 'like', which is the only reaction kind
-- that existed before this migration, so an old thumbs-up reads back as a
-- "like" and nothing is lost or mislabelled.
--
-- Why (the founder's wife's ask, 2026-09-23): Facebook-style reactions instead
-- of only a thumbs-up — "smile, laugh, shocked, sad, angry as well as the
-- thumbs up, and heart reaction." The table (0043) stored one row per
-- (message_id, profile_id) with NO kind column, i.e. it could express
-- "thumbs-up yes/no" and nothing else. Six kinds need a kind column.
--
-- THE PINNED DESIGN DECISION (spec.md t03 — a ruling, not a guess):
--   * One reaction PER PERSON PER MESSAGE (the Facebook model). So the unique
--     index STAYS on (message_id, profile_id) — it is NOT widened to include
--     kind. A person has at most one reaction; changing its kind REPLACES it
--     in place, it does not add a second row.
--   * `kind` is therefore a MUTABLE ATTRIBUTE of the row, never part of the
--     key. Changing your 👍 to ❤️ is an UPDATE of kind on the SAME row (the
--     count must not increment), and tapping your current kind DELETES the row.
--   This is why the write path moves from INSERT-or-DELETE to an UPSERT keyed
--   on the (message_id, profile_id) PK (src/lib/db.ts toggleReactionWithClient),
--   and why applyReactionToggle generalises to applyReactionSet.
--
-- WHY A CHECK AND NOT FREE TEXT: the app branches on a closed set of six, so a
-- CHECK is right here (the account_links_status_chk precedent, 0047) — an
-- unknown kind would render as nothing and silently strand a reaction. The
-- value list MUST stay in sync with REACTION_KINDS in src/lib/db.ts (the
-- house rule for duplicated closed sets, cf. parent_cards_position_chk); a unit
-- test asserts the TS list equals this SQL list so drift is caught as a
-- divergence rather than rendering as nothing.
--
-- RLS POSTURE UNCHANGED (read 0043's policies before touching any of them):
--   * SELECT — participant-only (message_recipients OR playdate host/pinger).
--     Unchanged: a new column rides the existing whole-row posture, and adding
--     a column must not quietly re-scope a table's policies (the 0014/0016/0021/
--     0046 column-add lesson).
--   * INSERT — own only (profile_id = auth.uid()). Still correct: the upsert's
--     insert branch writes the caller's own row, and the CHECK applies to the
--     inserted kind too.
--   * DELETE — own only (profile_id = auth.uid()). Still correct: removing your
--     own reaction deletes your own row.
--   * UPDATE — there is NO update policy today (V15 shipped only the
--     INSERT-or-DELETE shape). The new replace-in-place write needs an UPDATE
--     policy, so EXACTLY ONE is added below: `message_reactions_update_own`,
--     mirroring the delete policy's own-only posture (using + with check both
--     on profile_id = auth.uid()). No other policy is touched, so the posture
--     is preserved, not widened.
--
-- REPLICA IDENTITY: NO CHANGE REQUIRED. Supabase Realtime delivers a DELETE's
-- removed row under `old` using the table's replica identity. The default
-- replica identity is the PRIMARY KEY, and this table's PK is
-- (message_id, profile_id) — exactly the two fields the realtime handler
-- (InboxPage.tsx applyReactionEvent) reads to reconcile the counter. Adding a
-- non-key `kind` column does not change the PK, so the default identity still
-- carries both ids into the DELETE payload. Setting REPLICA IDENTITY FULL would
-- be a needless widening (it ships every column on every change); the
-- handler needs only the PK columns, so the migration deliberately leaves
-- replica identity untouched.
--
-- Idempotent + re-paste-safe (house pattern, 2026-09-04 lesson; 0041/0045/0046/
-- 0048 precedents): the column add is guarded on information_schema.columns
-- (0048's shape — `add column if not exists` is supported but the explicit
-- guard converges on a partial prior application); the named CHECK constraint
-- is guarded on pg_constraint by name (a constraint has no IF NOT EXISTS, the
-- 2026-09-04 rule); the single new policy is DO-block guarded on pg_policies
-- by name (`create policy` has no IF NOT EXISTS). Run once or a hundred times,
-- the schema ends in the same state.
--
-- Apply order: independent. Assumes only that `public.message_reactions`
-- exists (it has since 0043). The last applied migration is 0048.

-- ---------------------------------------------------------------------------
-- 1. The kind column (defaults to 'like' — the only kind that existed before).
--    Guarded on information_schema so a partial prior application converges.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_reactions'
      and column_name = 'kind'
  ) then
    alter table public.message_reactions
      add column kind text not null default 'like';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The CHECK constraint: kind is one of the six pinned values.
--
--    Named + guarded on pg_constraint by name (Postgres has no
--    `add constraint if not exists`). On a fresh database the column was just
--    added above with default 'like', so every row satisfies the CHECK; on a
--    live database every pre-existing row already defaulted to 'like' in step 1
--    (or carried a real kind from a prior partial run), so the constraint is
--    always satisfiable when it is created.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'message_reactions_kind_chk'
  ) then
    alter table public.message_reactions
      add constraint message_reactions_kind_chk
      check (kind in ('like', 'love', 'laugh', 'wow', 'sad', 'angry'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The ONE new policy: UPDATE own-only (the replace-in-place write).
--
--    Mirrors message_reactions_delete_own's posture exactly (own rows only),
--    so the table's RLS stance is preserved — a parent can rewrite only their
--    own reaction's kind, never another parent's. USING covers the old row,
--    WITH CHECK the new one; both key on profile_id = auth.uid().
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_reactions'
      and policyname = 'message_reactions_update_own'
  ) then
    create policy "message_reactions_update_own"
      on public.message_reactions for update
      to authenticated
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());
  end if;
end
$$;