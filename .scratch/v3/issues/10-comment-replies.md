# 10: Comment replies (one level)

**What to build:** Feedback #12 ("as a host I would like to be able to respond to this specific comment… nested, connected to this comment itself"). One-level replies on event comments: any signed-in parent can reply (human decision 2026-09-09: replies open to ALL authenticated users, not host-only); replies render indented under their parent (ml-8, 24px avatar); NO reply-to-replies (one-level pin). Migration 0023: `comments.parent_id` (uuid, nullable, references comments(id) ON DELETE CASCADE) + RLS (a reply is only visible when its parent is visible — the client hides replies under a hidden parent; moderator hide covers replies like comments). Permissions: reply delete = reply author OR event host (the parent's author does NOT delete replies — pin); the moderator hide path covers replies. Pure seam: `groupCommentsForRender(comments)` (parents + nested children, children ordered created_at asc) — unit-tested.

**Blocked by:** Ticket 09 (one-writer).

**Status:** ready-for-agent

- [ ] Migration 0023: `comments.parent_id` + RLS amendments (DO-block idempotent; header documents the one-level pin + hidden-parent rule); applied live after code green
- [ ] Detail page: "Reply" affordance on top-level comments (any authenticated user); the composer targets the parent (parent_id set); replies render one level indented
- [ ] No reply affordance on replies (one-level pin)
- [ ] Delete: reply author OR event host; moderator hide covers replies
- [ ] Pure `groupCommentsForRender(comments)` in feed.ts (or trust.ts) + unit tests (nesting, ordering, hidden-parent exclusion)
- [ ] One new e2e spec: comment → reply → nested render + delete permission
- [ ] npm run build && npm run test && npm run test:e2e exit 0

## Comments