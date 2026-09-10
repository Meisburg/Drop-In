# 04: Comments on events

**What to build:** The public question thread. Every event's detail page gains a chronological comment list: any signed-in parent can comment (≤500 chars), the host replies like anyone else, the author or host can delete a comment, and moderators can hide one (soft-hide via hidden_at, extending the /mod model). Comments render author avatar + handle; body links to /u/:handle. This is the DM replacement — zero-pressure, answers benefit everyone.

**Blocked by:** 02 (avatars exist for the comment list) and 03 (discovery/pages stable — same page being reworked).

**Status:** ready-for-agent

- [x] Any signed-in parent can comment on any event (≤500 chars); empty comment rejected client- and DB-side
- [x] Flat chronological list with author avatar + handle linking to /u/:handle
- [x] Author deletes own comment; host deletes comments on own event; nobody else
- [x] Moderator hides a comment; hidden comments invisible to everyone; /mod flow extended
- [x] RLS: authenticated select (non-hidden), author insert, author-or-host delete, moderator update(hidden_at)
- [x] Pure permission logic (planCommentAction-style) unit-tested
- [x] Live check: comment insert → visible to a second marker viewer; hide → invisible; delete → gone
- [x] npm run build && npm run test exit 0

## Comments

- 2026-09-09 — COMPLETE (dev agent, 2 sessions; dev pane w3:p5 restored after the original pane was lost). Commits 8ff38ed (slice: 0013_comments.sql + planCommentAction/validateCommentBody in trust.ts + detail-page thread + e2e/comments.e2e.ts) + b06c5c4 (0014_comments_hide_fix.sql + muted hidden chip, after the lv8 live check caught the 42501 moderator-hide break). Gates: `npm run build && npm run test` exit 0 (130/130, +10 new); `npx playwright test` exit 0 (10/10 incl. 2 new comments specs). 0013+0014 applied live via CDP (orchestrator verifier); lv8+lv9 live checks: insert 201 -> second viewer sees it -> host-deletes-non-author (the EXISTS branch) -> gone; CHECK 400s (whitespace + over-cap); mod hide 200 (post-0014; pre-fix 403/42501); hidden rows: viewer 0 rows / mod 1 row; non-mod hide silent 2xx 0 rows. Pinned embed (comments!comments_author_profile_id_fkey) 200, no PGRST201. Markers lv8/lv9 (optional sweep). All ACs met.
