# V27 Slice 3 brief — the Inbox tab shows there is something to read

Read `plan-v27.md` "Slice 3" and this file. Repo:
`/home/jmeisburg/orca/workspaces/playdate-app/Inbox`. Do not push. Do not touch
any other worktree.

## Scope
- New `src/components/InboxUnreadProvider.tsx` (context + `useInboxUnread`).
- `src/lib/inbox.ts` + `src/lib/inbox.test.ts` — pure `sumUnread(...)`.
- `src/App.tsx` — mount the provider; badge the Inbox `NavTab`.

## The change
1. **Pure helper** in `src/lib/inbox.ts`:
   `sumUnread(rows: ReadonlyArray<{ unreadCount: number }>): number` — sums both
   conversation kinds, clamps nonsense (NaN/negative/undefined) to 0, never
   throws. Sibling test in `src/lib/inbox.test.ts`.
2. **Provider** `src/components/InboxUnreadProvider.tsx`:
   - reads `useSessionContext()`; when signed out, the count is 0 and nothing is
     fetched.
   - computes the count by calling the EXISTING seams `listConversations(userId)`
     and `listDirectConversations(userId)` and summing with `sumUnread`.
   - recomputes on: mount / session change; a Supabase Realtime `messages`
     INSERT (RLS scopes it); and `visibilitychange`→visible. Best-effort: a
     failed read leaves the last count, never throws into render.
   - exports `InboxUnreadProvider` and `useInboxUnread(): { unreadCount: number }`.
   - Clean up the channel/listener on unmount.
3. **App.tsx**:
   - wrap the route tree with `<InboxUnreadProvider>` (inside
     `<SessionProvider>`, so it can read the session).
   - `ProtectedShell` reads `useInboxUnread()`.
   - `NavTab` gains an optional `badge?: number` prop (or an optional `badge`
     ReactNode). The Inbox call site passes the count. Render a marker ONLY when
     count > 0, and make it ACCESSIBLE, not colour-only: an `aria-label` on the
     NavLink and/or visually-hidden text (e.g. `Inbox, 3 unread`), plus a small
     visible pill/dot with the count (cap the display at `99+` for a silly
     number). Keep the existing active/filled-icon behaviour and the 44px
     min-height target.
   - Do NOT change nav destinations or order.

## Guardrails
- No new query on every route transition: the recompute triggers are mount /
  INSERT / refocus only.
- Keep the build law: `src/lib/inbox.ts` stays pure (no React, no supabase).

## Acceptance
- `sumUnread` pure + tested (empty → 0; sums; never NaN).
- Badge visible only when count > 0; announced for a screen reader; not
  colour-only.
- `npm run verify` exit 0. Commit only your files, message prefix `V27 s3:`.

## Report
Status; files; commit sha; verify tail; anything not met.
