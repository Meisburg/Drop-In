-- V3 slice 7 (ticket 10): one-level comment replies — comments.parent_id
-- (uuid, nullable, self-referencing FK, ON DELETE CASCADE) + the 0014
-- SELECT-policy amendment (a reply is visible to non-moderators only when
-- its parent is visible).
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
--     ONE-LEVEL SCOPE (addendum): the parent-visibility subquery
--     (section 2) checks ONE level only — the pointed-at row's
--     hidden_at. A DB-allowed reply-to-reply row whose parent reply is
--     visible but whose top-level grandparent is hidden therefore stays
--     API-visible to non-moderators while the client seam
--     (groupCommentsForRender's orphan defense) drops it from render —
--     DB-allowed / client-enforced, no UI leak.
-- (b) HIDDEN-PARENT RULE: a reply is visible to a NON-moderator only
--     when its own hidden_at is null AND its parent's hidden_at is null
--     (the parent-visibility subquery below runs under RLS: for a
--     non-moderator it returns the parent only when the parent is itself
--     visible — a hidden parent's replies vanish with it; for a
--     moderator the mod branch short-circuits and sees everything).
--     DELETING A PARENT HARD-DELETES ITS REPLIES: the FK's ON DELETE
--     CASCADE (cascade enforcement is internal — no RLS involved, the
--     replies' own RLS is bypassed by the cascade, which is intended).
-- (c) 0014 LESSON RE-CHECK: Postgres ALSO evaluates the SELECT policy's
--     USING against the NEW row of an UPDATE (42501, live-proven 2026-09-09).
--     The moderator hide path (0013's comments_update_moderators) sets
--     hidden_at on a top-level comment OR on a reply; the amended USING
--     keeps the 0014 mod branch FIRST — it admits that new row (a
--     moderator is the only role that can UPDATE a comment, and the
--     branch is row-independent), so no new 42501 surface. A
--     non-moderator can never reach the UPDATE path (the UPDATE policy
--     is moderator-only), so the non-mod branch's reply restriction
--     cannot 42501 an UPDATE either.
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
-- block (the 0020/0021/0022 structure); the SELECT-policy re-create is
-- DROP POLICY IF EXISTS + a DO-block-guarded CREATE, the 0014 pattern,
-- both re-runnable).
--
-- Applied live after code green via the dashboard SQL API (the 0021 /
-- 0022 header pattern; task-state's tooling note amendment #2 — the
-- Monaco SPA is broken in the CDP Chrome).

-- 1) The column (the 0021 DO-block house structure).
do $$
begin
  alter table public.comments add column if not exists parent_id uuid
    references public.comments (id) on delete cascade;
end
$$;

-- 2) The SELECT-policy amendment (the 0014 pattern: DROP IF EXISTS, then
--    the DO-block-guarded re-create). Top-level comments keep the 0014
--    behavior (hidden_at is null, or moderator); replies add the parent-
--    visibility rule; the mod branch is first (0014's branch, clarity +
--    the 42501 re-check in header (c)); explicit parentheses for the
--    AND/OR precedence.
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
            or exists (
              select 1 from public.comments p
              where p.id = comments.parent_id
                and p.hidden_at is null
            )
          )
        )
      );
  end if;
end
$$;
