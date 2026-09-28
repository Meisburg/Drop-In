# V27 Slice 4 brief — the thread names the group and pins the drop-in

Read `plan-v27.md` "Slice 4" (AMENDED design) and this file. Repo:
`/home/jmeisburg/orca/workspaces/playdate-app/Inbox`. Do not push. Do not touch
any other worktree. Do NOT edit `src/lib/db.ts`.

## Scope
- `src/pages/InboxPage.tsx`
- `src/lib/inbox.ts` + `src/lib/inbox.test.ts` (a pure helper only)

## The change
### 1. Pure helper in `src/lib/inbox.ts`
`groupLabel(participants: ReadonlyArray<{ id: string; name: string }>, viewerId: string | null): string | null`
- drop the viewer (by `id`) and dedupe by `id`;
- 0 others → `null`; 1 other → `null` (the existing counterpart header stands,
  unchanged); ≥2 others → `` `${firstName} + ${n - 1} more` `` using the first
  participant with a non-blank name; if nobody has a name → `` `${n} parents` ``.
Never returns a name for the viewer. Sibling tests in `src/lib/inbox.test.ts`.

### 2. Thread context read (InboxPage)
The playdates fallback effect (around line 548) currently returns early when the
conversation row already has a name. Change it so that, for a `?thread=` id, it
ALWAYS resolves the thread context (not only the counterpart name):
- select from `playdates`: `title, starts_at, ends_at, host_profile_id,
  host:profiles!playdates_host_profile_id_fkey ( id, display_name ),
  pings:going_pings ( profile:profiles!going_pings_profile_id_fkey ( id, display_name ) ),
  place:places!playdates_place_id_fkey ( name )`
- land the results in THEIR OWN new state (`contextStartsAt`, `contextEndsAt`,
  `contextPlaceName`, `contextParticipants`) — NEVER inside the t11
  `fallbackCounterpart`/`fallbackTitle` writers, so the existing
  `firstNamedCounterpart([...])` priority is untouched.
- Keep the existing counterpart-name fallback behaviour otherwise.
- A `?dm=` thread does NOT run this read.

### 3. Header render
Current (≈line 1043): a `div.min-w-0` with two `<p>` (name, title). Extend:
- name line: `groupLabel(contextParticipants, userId) ?? threadHeaderName`.
- title line: unchanged (`threadHeaderTitle`).
- when `threadId !== null` and any context exists, a context line:
  `` `${when} · ${placeName}` `` where `when` comes from an EXISTING formatter in
  `src/lib/feed.ts` (`cardWhenLabel(startsAt, endsAt)` or
  `formatDayLabel` + `formatTimeWindow` — reuse, do NOT invent a new date
  format). Omit a missing half rather than rendering `null` or a dangling `·`.
- make the header a link to `/playdate/${threadId}` (the group name + context).

## Acceptance
- 1:1 header byte-identical to today when there is one participant.
- Group label from the helper; no participant misattributed.
- Missing start/place renders nothing, never `null`/`undefined`/stray `·`.
- Header links to `/playdate/:id`.
- t11 unit tests still pass; `npm run verify` exit 0. Commit only your files,
  message prefix `V27 s4:`.

## Report
Status; files; commit sha; verify tail; anything not met.
