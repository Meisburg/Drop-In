-- V3 slice 7 (ticket 10): one-level comment replies — comments.parent_id
-- (uuid, nullable, self-referencing FK, ON DELETE CASCADE) + the 0014
-- SELECT-policy amendment (a reply is visible to non-moderators only
-- when its parent is visible).
--
-- FIX RUN 2026-09-10 (amended in place; the column/FK parts applied
-- cleanly and stay — only the policy + this header change): the
-- original parent-visibility check was a self-referencing subquery in
-- the policy's USING, which 42P17'd live (root-cause note below). It is
-- now the comment_parent_visible SECDEF helper (section 2, the 0015
-- pattern).
--
-- ROOT-CAUSE NOTE (2026-09-10, live-proven twice via REST with a
-- marker JWT — HTTP 500 42P17 on EVERY authenticated SELECT on
-- comments; anon unaffected, the policy is TO authenticated): a policy
-- whose USING references its own table makes Postgres's RLS rewrite
-- recursive — the rewrite of a SELECT on comments expands the policy,
-- which references comments, which re-expands the same policy -> 42P17
-- "infinite recursion detected in policy for relation comments". The
-- documented RLS-recursion escape hatch (the 0015 house pattern) is a
-- SECURITY DEFINER helper: comment_parent_visible(uuid) — language sql,
-- stable, search_path pinned (SECDEF hygiene: never inherits the
-- caller's search_path), EXECUTE scoped to authenticated only (revoke
-- public/anon). The policy rewrite sees a function call, not the table,
-- so it terminates; the function runs as its owner (postgres), so the
-- internal subquery is NOT RLS-expanded and reads the parent's true
-- hidden_at.
--
-- Pinned decisions (plan-v3.md slice 7, ticket 10; human decision
-- 2026-09-09 feedback call (c): replies open to ALL authenticated users,
-- one level, reply delete = reply author OR event host):
-- (a) THE ONE-LEVEL PIN: parent_id references comments.id — the DB
--     intentionally ALLOWS parent_id to point at a reply (NO trigger,
--     NO check): reply-to-replies is blocked CLIENT-SIDE only (the detail
--     page offers the "Reply" affordance on top-level comments only, and
--     renders replies one level indented — the groupCommentsForRender
--     seam). Documented edge: an API-level insert with a HIDDEN
--     parent_id succeeds, but the reply is invisible to non-moderators
--     (its parent is hidden -> rule (b)) — harmless, V1.
--     ONE-LEVEL SCOPE (addendum): the parent-visibility check is now
--     via the helper (one level only) — comment_parent_visible
--     (section 2) inspects only the pointed-at row's hidden_at. A
--     DB-allowed reply-to-reply row whose parent reply is visible but
--     whose top-level grandparent is hidden therefore stays API-visible
--     to non-moderators while the client seam
--     (groupCommentsForRender's orphan defense) drops it from render —
--     DB-allowed / client-enforced, no UI leak.
-- (b) HIDDEN-PARENT RULE: a reply is visible to a NON-moderator only
--     when its own hidden_at is null AND its parent's hidden_at is null
--     (the comment_parent_visible helper, section 2, inspects the
--     pointed-at row's hidden_at directly — it runs as its owner,
--     postgres, bypassing RLS, so it reads the parent's TRUE hidden_at;
--     a hidden parent's replies vanish with it; for a moderator the mod
--     branch short-circuits and sees everything).
--     DELETING A PARENT HARD-DELETES ITS REPLIES: the FK's ON DELETE
--     CASCADE (cascade enforcement is internal — no RLS involved, the
--     replies' own RLS is bypassed by the cascade, which is intended).
--     COUNTERFACTUAL: an FK-impossible orphan reply would evaluate
--     comment_parent_visible as true (the not exists over the missing
--     parent) and stay API-visible; orphans are impossible via the
--     ON DELETE CASCADE self-FK, so this is documentation-only.
-- (c) 0014 LESSON RE-CHECK: Postgres ALSO evaluates the SELECT policy's
--     USING against the NEW row of an UPDATE (42501, live-proven
--     2026-09-09). The moderator hide path (0013's
--     comments_update_moderators) sets hidden_at on a top-level
--     comment OR on a reply; the amended USING keeps the 0014 mod
--     branch FIRST — row-independent (no reference to the new row's
--     columns) — so the re-check for the helper form is:
--       (i)   mod-hide UPDATE on a TOP-LEVEL comment: the new row is
--             admitted by the mod branch alone;
--       (ii)  mod-hide on a REPLY: the mod branch admits the new row;
--             if the helper IS evaluated on the new row, a visible
--             parent returns true and a null pid returns true
--             (not exists over id = null) — no error path either way;
--       (iii) the non-mod branch CANNOT REACH the UPDATE path — the
--             UPDATE policy is moderator-only, so a non-moderator never
--             evaluates the non-mod branch on a new row.
--     No new 42501 surface; and no 42P17 either — the RLS rewrite sees
--     a function call (comment_parent_visible), not the comments table.
-- (d) INSERT / DELETE / UPDATE policies are UNCHANGED — the WHY:
--     - comments_insert_own (author_profile_id = auth.uid()) already
--       allows ANY authenticated user to author a reply (the
--       replies-open-to-all pin — NOT host-only; a reply's
--       author_profile_id is the replying user's own id, exactly as a
--       top-level comment's).
--     - comments_delete_author_or_host already = the ROW's author OR the
--       event's host (the playdates subquery on the row's own
--       playdate_id, which a reply shares with its parent): a reply is
--       deletable by the REPLY'S author or the event's host, and the
--       PARENT'S author does NOT get reply delete (the pin — the policy
--       keys on the row's own author_profile_id, not its parent's).
--     - comments_update_moderators already covers replies (the
--       moderator hide path hides replies like comments — the UPDATE
--       policies are row-independent).
-- (e) NO NEW INDEX: the thread list is per-playdate (listComments's
--     .eq('playdate_id') + created_at order), and the existing
--     (playdate_id, created_at) index (0013's
--     comments_playdate_id_created_at_idx) covers that scan — replies
--     and their parents sit in the same playdate, and the one-level
--     grouping (parent_id -> child) is done client-side in the
--     groupCommentsForRender seam over the per-playdate row set.
-- (f) PGRST201: the app's author embed stays pinned to the FK
--     constraint name (`author:profiles!comments_author_profile_id_
--     fkey`, 0013) — the new self-referencing comments FK adds no
--     second comments->profiles edge, so the explicit hint stays
--     unambiguous; the real-DB REST smoke probe runs at the live check.
--
-- Idempotent + re-paste-safe (2026-09-04 house lesson: no CREATE POLICY
-- IF NOT EXISTS — the column add is ADD COLUMN IF NOT EXISTS inside a DO
-- block (the 0020/0021/0022 structure); the helper is CREATE OR REPLACE
-- + re-runnable GRANT/REVOKE (the 0015 structure, section 2); the
-- SELECT-policy re-create is DROP POLICY IF EXISTS + a DO-block-guarded
-- CREATE, the 0014 pattern — all three re-runnable).
--
-- Applied live after code green via the dashboard SQL API (the 0021 /
-- 0022 header pattern; task-state's tooling note amendment #2 — the
-- Monaco SPA is broken in the CDP Chrome).
--
-- RE-APPLY NOTE (2026-09-10 fix run): 0023 was live-applied as
-- originally written and the live check proved the 42P17 defect
-- (root-cause note above). RE-APPLYING THIS AMENDED FILE IS THE LIVE
-- REPAIR: the column/FK section no-ops (ADD COLUMN IF NOT EXISTS), the
-- helper is created (CREATE OR REPLACE), and the policy DROP + guarded
-- CREATE replaces the 42P17-broken policy with the helper-based one.
-- The re-apply is a later, separate orchestrator step (dashboard SQL
-- API) — NOT part of the code gate.

-- 1) The column (the 0021 DO-block house structure).
do $$
begin
  alter table public.comments add column if not exists parent_id uuid
    references public.comments (id) on delete cascade;
end
$$;

-- 2) The parent-visibility helper (the 0015 house SECDEF pattern:
--    stable, search_path pinned, EXECUTE scoped + revoke public/anon).
--    The policy rewrite sees this function call, not the comments table
--    — no RLS re-expansion, no 42P17; the function runs as its owner
--    (postgres), so the subquery reads the parent's true hidden_at with
--    no RLS. Idempotent: CREATE OR REPLACE + re-runnable GRANT/REVOKE.
create or replace function public.comment_parent_visible(pid uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.comments p
    where p.id = pid and p.hidden_at is not null
  );
$$;
revoke execute on function public.comment_parent_visible(uuid) from public, anon;
grant execute on function public.comment_parent_visible(uuid) to authenticated;

-- 3) The SELECT-policy amendment (the 0014 pattern: DROP IF EXISTS, then
--    the DO-block-guarded re-create). Top-level comments keep the 0014
--    behavior (hidden_at is null, or moderator); replies add the parent-
--    visibility rule via the helper (section 2); the mod branch is
--    first (0014's branch, clarity + the 42501 re-check in header (c));
--    explicit parentheses for the AND/OR precedence.
drop policy if exists "comments_select_authenticated" on public.comments;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'comments'
      and policyname = 'comments_select_authenticated'
  ) then
    create policy "comments_select_authenticated"
      on public.comments for select
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
        or (
          hidden_at is null
          and (
            parent_id is null
            or public.comment_parent_visible(parent_id)
          )
        )
      );
  end if;
end
$$;
