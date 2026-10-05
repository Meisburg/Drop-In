# 07: A moderator can find the moderator tools

**What to build:** A moderator-only row in Settings → Account opens the existing
moderator tools. A parent who is not a moderator sees no row, the same way they
already cannot reach the tools themselves.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** annotation 5 in `source-annotations.json` — the founder could not find the place-photo tool.

- [ ] A moderator-flagged profile sees the row in Settings → Account, and it
      opens the existing moderator tools.
- [ ] A non-moderator never sees the row.
- [ ] The route's existing guard is unchanged, and remains the authority — the
      row is discoverability, not permission.
- [ ] No new route and no new navigation tab.
- [ ] `npm run verify` exits 0.
