# V27 Slice 5 brief — fast one-handed, and a failed send never vanishes

Read `plan-v27.md` "Slice 5" and this file. Repo:
`/home/jmeisburg/orca/workspaces/playdate-app/Inbox`. Do not push. Do not touch
any other worktree.

## Scope
- `src/lib/inbox.ts` + `src/lib/inbox.test.ts`
- `src/pages/InboxPage.tsx`

## The change
### 1. Pure helpers + constants in `src/lib/inbox.ts` (sibling tests)
- `QUICK_REPLIES: readonly { label: string; body: string }[]` — exactly five,
  in this order: `On my way` / `Running late` (`Running about 10 minutes
  late.`) / `We're here` / `Still on?` / `Can't make it` (`Can't make it after
  all — sorry!`). Labels are short; bodies are what gets sent.
- `messageTimestampLabel(iso: string, nowIso: string): string` — the local
  time-of-day (e.g. `3:04 PM`). Invalid/empty ISO must not throw (return `''`).
- `daySeparatorLabel(iso: string, nowIso: string): string` — `Today` /
  `Yesterday` / an older local date (e.g. `Sat, Sep 27`), decided on
  `localDayKey` from `./feed` (the app's ONE day rule). Invalid ISO → `''`.

### 2. Thread rendering (InboxPage)
- Between messages, render a day separator whenever a message's `localDayKey`
  differs from the previous message's (the first message gets one).
- Each bubble shows `messageTimestampLabel(message.created_at, now)` in the
  existing small muted style.

### 3. Quick replies
- A horizontally scrollable row of the five chips above the composer (each a
  ≥44px control). Tapping a chip sets `draft` to its `body` and focuses the
  textarea. It does NOT auto-send (the parent may amend). Hidden while
  `sending`; keep the composer's existing layout.

### 4. Failed send never vanishes
Today `handleSend`'s catch DELETES the optimistic row (`:800-806`). Change it:
- keep the optimistic bubble, and track failed ids in local state (e.g.
  `const [failedIds, setFailedIds] = useState<string[]>([])`);
- a failed bubble renders a small `Not sent · Retry` control;
- `Retry` re-calls the same send seam with the SAME body (`message.body`), not
  `draft`; on success clear the failed id (the realtime echo reconciles the
  `pending-` row via `reconcileOptimisticMessage`, which matches on
  sender+body — see `src/lib/db.ts:5226`);
- on failure re-add the failed id and show the inline error;
- guard the retry: if the `pending-` row is already gone (the echo landed), do
  nothing rather than sending a duplicate.

## Acceptance
- Pure helpers tested (today/yesterday/older; invalid ISO no-throw; exactly 5
  quick replies with non-empty bodies).
- Day separators appear only on day change; every bubble shows a time.
- Quick replies fill the draft (Send still needs a tap / Enter).
- A failed send leaves the bubble + a working Retry; success clears the marker.
- `npm run verify` exit 0. Commit only your files, message prefix `V27 s5:`.

## Report
Status; files; commit sha; verify tail; anything not met.
