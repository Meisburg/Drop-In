# 04: Comments on events

**What to build:** The public question thread. Every event's detail page gains a chronological comment list: any signed-in parent can comment (≤500 chars), the host replies like anyone else, the author or host can delete a comment, and moderators can hide one (soft-hide via hidden_at, extending the /mod model). Comments render author avatar + handle; body links to /u/:handle. This is the DM replacement — zero-pressure, answers benefit everyone.

**Blocked by:** 02 (avatars exist for the comment list) and 03 (discovery/pages stable — same page being reworked).

**Status:** ready-for-agent

- [ ] Any signed-in parent can comment on any event (≤500 chars); empty comment rejected client- and DB-side
- [ ] Flat chronological list with author avatar + handle linking to /u/:handle
- [ ] Author deletes own comment; host deletes comments on own event; nobody else
- [ ] Moderator hides a comment; hidden comments invisible to everyone; /mod flow extended
- [ ] RLS: authenticated select (non-hidden), author insert, author-or-host delete, moderator update(hidden_at)
- [ ] Pure permission logic (planCommentAction-style) unit-tested
- [ ] Live check: comment insert → visible to a second marker viewer; hide → invisible; delete → gone
- [ ] npm run build && npm run test exit 0