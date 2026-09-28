# V27 Slice 2 brief — the conversation list is live, and refetches on focus

Read `plan-v27.md` "Slice 2" and this file. Repo:
`/home/jmeisburg/orca/workspaces/playdate-app/Inbox`. Do not push. Do not touch
any other worktree.

## Scope
- `src/pages/InboxPage.tsx`
- `src/lib/inbox.ts` + `src/lib/inbox.test.ts` ONLY if you extract a pure piece
  (e.g. a debounce/counter helper) — prefer none.
- `e2e/inbox.e2e.ts` — add a spec ONLY if the two-account realtime harness is
  reliable here; a known flake (task-state V21) means a setup timeout is not a
  product failure. Do not fake a pass.

## The change
`InboxPage.tsx`'s realtime effect (around line 611) starts with
`if (threadId === null && dmTargetId === null) return`. Split the behaviour:

1. **Thread open (`?thread=` or `?dm=`)** — unchanged. Same channel name
   (`messages-<id>` / `dm-<id>`), same server filter / client-side filter, same
   `reconcileOptimisticMessage` echo handling, same `message_reactions`
   handlers, same teardown.
2. **List view (both params null)** — subscribe to the `messages` table
   `INSERT` with NO server-side filter. Supabase Realtime applies the caller's
   RLS, so only rows this parent may read are delivered. On each INSERT, bump
   `setReloadToken((t) => t + 1)` — the existing list-load effect already keys
   on `reloadToken` and refetches both `listConversations` and
   `listDirectConversations` (and thus unread counts).
3. **Focus** — add an effect that refetches the list when the tab becomes
   visible again: a `visibilitychange` listener that calls
   `setReloadToken((t) => t + 1)` when `document.visibilityState === 'visible'`.
   Remove the listener on unmount. (A `focus` listener is optional; do not
   double-bump on one return if you add both.)

Keep ONE channel per state; make sure the list-view channel is named uniquely
(e.g. `inbox-list`) and removed on unmount. Do not let the list subscription
write into `thread` state.

## Acceptance
- List view: an INSERT bumps `reloadToken` (assert by reading the diff).
- Visible tab: a `visibilitychange` bumps `reloadToken`.
- Thread view: byte-for-byte the old behaviour (channel name, filter, reconcile).
- No leaked channel (cleanup returns `removeChannel`).
- `npm run verify` exit 0. Commit only your files, message prefix `V27 s2:`.

## Report
Status; files; commit sha; verify tail; the playwright result if you ran it;
anything you could not meet.
