# Implementation Plan: V27 — the inbox, built for drop-in coordination

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below must be executable without interpretation.
>
> The default slice gate is `npm run verify` (build + test + lint + focus +
> steering-lint + guards). Pin anything extra (targeted e2e, a live check)
> explicitly in the slice.
>
> Origin: the founder asked how to improve `/inbox` so parents can actually
> coordinate drop-in meetups. Five recommendations were made and the founder
> said "scope all five … build them all out." This plan is those five.
>
> Plan file convention: V23 used `plan-v23.md`; this is the same shape. V26's
> record in `plan.md` is untouched.

## Goal

A parent and another parent who both signalled "I'm going" to the same drop-in
can actually coordinate: a new message reaches them without the app being open,
the inbox list is live instead of a stale snapshot, the Inbox tab shows there is
something to read, the thread names everyone in it and pins the drop-in's
time/place with a way back to it, and the thread is fast to use one-handed
(one-tap replies, visible times, a failed send that can be retried instead of
vanishing).

Done when: all five slices' acceptance criteria hold and the final tree passes
`npm run verify`; the one live step (migration `0056` applied + `send-push`
redeployed) is recorded as ACTION REQUIRED because this worktree has no `.env`.

## Non-goals

- **No free-form-DM push notification in this batch.** The producer below fires
  only for `messages.playdate_id is not null`. DM notifications need their own
  URL/recipient/dedupe shape (`/inbox?dm=<peer>`, `message_recipients`,
  NULL-distinct dedupe) and get their own slice later. Slice 4 still renders DM
  threads.
- **No message content in any push.** A parent's message body on a lock screen
  is a privacy leak this product does not take. The push names the sender and
  points at the thread; the body is never carried.
- No new route. No change to the messaging RLS/participation rules.
- No group-chat schema change: the playdate thread is already shared by RLS
  (`0042_messages.sql:51-66,75-86`); slice 4 only stops the UI pretending it is
  1:1.
- No email-specific behaviour for `new_message` beyond what every kind already
  gets from `send-push`'s existing fallback.
- No redesign of the nav; the badge is the only `App.tsx` change.

## Interfaces (pinned; builders do not re-decide these)

**Kind (slice 1).** `'new_message'` is appended to
`NOTIFICATION_KINDS` in `supabase/functions/_shared/pushCopy.ts` (7 kinds).
Copy, pinned char-for-char on both twins:
- title: `` `${actor} messaged you` ``
- body: `` `Tap to reply in ${subject}` `` (subject = `quotedSubject`,
  i.e. `"Saturday at Gas Works"`; fallback `"your drop-in"`)
- url: `/inbox?thread=<encodeURIComponent(playdateId)>` — a NEW sibling rule
  `messageThreadUrl(playdateId)`, exactly like `reviewPromptUrl`; every other
  kind keeps `notificationUrl`'s `/playdate/:id`.

**SQL twin signature unchanged.** `notification_payload(text, uuid, text,
text, int)` keeps its 5 arguments; `new_message` uses the existing ones. Do NOT
add a body argument. The URL branch is a `case p_kind when 'new_message' …`.

**Migration.** `supabase/migrations/0056_messages_push.sql`. Idempotent +
re-paste-safe, 0041/0055 structure: the kind CHECK is matched by column (any
table CHECK whose key includes `kind`), `notification_payload` is DROP+CREATE,
the trigger is `drop trigger if exists` + `create trigger`, and a read-back DO
block raises on any mismatch (the 0055 pattern).

**Producer semantics (pinned).** `notify_new_message()` is AFTER INSERT on
`public.messages`, `security definer`, `set search_path = public, pg_temp`.
Recipients = the post's host UNION its `going_pings` profiles, minus
`new.sender_id` (NOT `auth.uid()`). The dedupe key is
`(profile_id, kind, playdate_id)`, so the row is **re-armed** on each new
message: `on conflict … do update set title=excluded.title, body=excluded.body,
url=excluded.url, created_at=now(), sent_at=null, error=null`. One pending
notification per conversation, re-fired by the next message — documented,
deliberate (a chat must buzz again; `do nothing` would buzz once ever).

**Slice 4 data (AMENDED — smaller design).** Do NOT change `src/lib/db.ts` or
`ConversationSummary`. The thread header's context comes from ONE read the page
already makes: the playdates fallback effect (`InboxPage.tsx:~548`), which is
extended to ALWAYS run when `?thread=` is present (not only when the row is
unnamed) and to select `title, starts_at, place:places!playdates_place_id_fkey
(name), host_profile_id, host, pings`. Its result lands in new, separate state
(`contextStartsAt`, `contextPlaceName`, `contextParticipants`) so it cannot
clobber the t11 counterpart derivation. `?dm=` threads get no context read. The
header renders `Sat, Sep 27 · 3:00 PM · Gas Works Park` + a `/playdate/:id`
link + the group label from those participants. Fields are nullable; a missing
value renders nothing, never "null". This keeps all of V27 out of `db.ts`
(which also de-risks the sibling `Meisburg/v27` worktree's uncommitted
`db.ts` changes).

**Slice 5 helpers** live in `src/lib/inbox.ts` (pure, tested):
`QUICK_REPLIES`, `messageTimestampLabel(iso, nowIso)`,
`daySeparatorLabel(iso, nowIso)` (built on `localDayKey` from `./feed` — the
app's one day rule).

## Slices

### Slice 1: a new message notifies the other participants

- **Objective:** inserting a playdate-scoped message writes one re-armable
  `new_message` row per other participant, and the kind is a first-class member
  of the app's and sender's kind table.
- **Files in scope:** `supabase/migrations/0056_messages_push.sql` (new),
  `supabase/functions/_shared/pushCopy.ts`, `supabase/functions/send-push/index.ts`
  (only if the kind table requires it), `src/lib/push.ts`,
  `src/lib/push.test.ts`, `src/components/NotificationsSection.tsx` (only if a
  kind map needs the entry), plus any test that pins kind counts.
- **Approach:** as pinned under Interfaces. `send-push`'s drain is generic; it
  should need no new branch — verify, don't invent one.
- **Acceptance criteria:**
  - `NOTIFICATION_KINDS` has 7 entries including `'new_message'`; the existing
    length assertion is updated.
  - `buildNotificationPayload({kind:'new_message', …})` returns the pinned
    title/body and `/inbox?thread=<id>`; the id is encoded.
  - `NOTIFICATION_KIND_COPY` has a `new_message` entry (the `Record` forces it).
  - Migration 0056: widens the CHECK to 7, DROP+CREATEs `notification_payload`
    with the `new_message` branch (same 5-arg signature; revokes/grants name
    the SAME 5-arg signature), adds `notification_new_message` AFTER INSERT on
    `messages`, and its read-back block raises unless the CHECK admits 7 kinds,
    the function is STABLE/SECURITY DEFINER as before, and the three pinned
    strings render.
  - `npm run verify` exit 0.
- **Verification command:** `npm run verify`
- **Extra (not the gate):** `bash scripts/db-sql.sh --check-migration supabase/migrations/0056_messages_push.sql` — ACTION REQUIRED, needs `.env` (absent in this worktree).
- **Budget:** one builder context.
- **Depends on:** nothing.

### Slice 2: the conversation list is live, and refetches on focus

- **Objective:** a message arriving while the parent is looking at the inbox
  LIST updates the row (preview/time/unread) with no reload; returning to the
  tab refetches.
- **Files in scope:** `src/pages/InboxPage.tsx`, `e2e/inbox.e2e.ts` (a new
  spec if the realtime harness allows), `src/lib/inbox.ts` +
  `src/lib/inbox.test.ts` for any pure piece extracted.
- **Approach:** the realtime effect currently early-returns when no thread is
  open (`InboxPage.tsx:611-612`). Make the list case its own subscription on
  the `messages` table with NO server filter (RLS scopes delivery) that bumps
  `reloadToken`; add a `visibilitychange`→visible listener that bumps it too.
  Keep the per-thread subscription's existing filtered behaviour and its
  optimistic reconciliation untouched.
- **Acceptance criteria:**
  - With `?thread=`/`?dm=` absent, a `messages` INSERT bumps `reloadToken`
    (visible in the diff; the list reload effect already keys on it).
  - `document.visibilityState === 'visible'` bumps `reloadToken`.
  - The open-thread path is unchanged (same channel name, same filter, same
    reconcile-on-echo).
  - The subscription is torn down on unmount (no leaked channel).
  - `npm run verify` exit 0.
- **Verification command:** `npm run verify`
- **Extra (not the gate):** `npx playwright test e2e/inbox.e2e.ts` — two-account
  realtime is a known flake (task-state V21 note); run it, record the result,
  do not treat a setup timeout as a product failure.
- **Budget:** one builder context.
- **Depends on:** nothing.

### Slice 3: the Inbox tab shows there is something to read

- **Objective:** when the signed-in parent has unread messages, the Inbox tab
  carries a visible, accessible unread marker.
- **Files in scope:** `src/App.tsx`, a new
  `src/components/InboxUnreadProvider.tsx` (context + hook), `src/lib/inbox.ts`
  + `src/lib/inbox.test.ts` (a pure `sumUnread` helper), `src/lib/db.ts` only if
  an existing seam does not already return unread counts.
- **Approach:** reuse the EXISTING seams — `listConversations` and
  `listDirectConversations` already return `unreadCount` per row. A provider
  inside the protected shell computes `sumUnread(...)` on mount, on the
  `messages` realtime INSERT, and on `visibilitychange`→visible; `sumUnread` is
  pure and unit-tested. `NavTab` (or a wrapper) renders a dot/count only when
  > 0, with an accessible label (the row must not rely on colour alone —
  `MASTER-IMPROVEMENTS.md` items 13/15).
- **Acceptance criteria:**
  - `sumUnread` is pure + tested (zero rows → 0; sums both kinds; never NaN).
  - The Inbox tab shows a marker only when the count > 0, and the marker is
    announced (aria-label / visually-hidden text), not colour-only.
  - No extra per-route query storm: the count is computed on mount + realtime
    INSERT + refocus.
  - `npm run verify` exit 0.
- **Verification command:** `npm run verify`
- **Budget:** one builder context.
- **Depends on:** slice 2's realtime understanding (not a hard dependency; can
  run in either order, but serialized).

### Slice 4: the thread names the group and pins the drop-in

- **Objective:** a thread header that tells the truth about who is in it and
  what/when/where the drop-in is, with a link back to the post.
- **Files in scope:** `src/pages/InboxPage.tsx`, `src/lib/inbox.ts` +
  `src/lib/inbox.test.ts` (a pure `groupLabel` / participant helper).
  NOT `src/lib/db.ts`.
- **Approach (amended — see Interfaces):** extend the existing playdates
  fallback effect to always resolve a playdate thread's context (title,
  `starts_at`, place name, host + pingers) into its OWN state; render it in the
  header. A 1:1 keeps today's exact header. Per-bubble sender labels already
  exist (`messageSenderLabel`) — do not touch that logic.
- **Acceptance criteria:**
  - A 1:1's NAME line is unchanged (`groupLabel` → null, the counterpart name
    stands); a `?dm=` thread header is byte-identical to today's. The drop-in
    context line + `/playdate/:id` link are ADDITIVE for every playdate thread
    (that IS recommendation 4 — a playdate 1:1 is not expected to be
    byte-identical). [AMENDED after the builder flagged the tension.]
  - A thread whose participant set is ≥3 people shows a group label from the
    pure helper; no participant is ever attributed another's name.
  - The drop-in line shows the formatted start + place when known, and renders
    NOTHING (no `null`, no empty separator) when either is missing.
  - The header links to `/playdate/:id`.
  - The t11 derived-counterpart behaviour is unchanged (existing `inbox.test.ts`
    cases + the fallback read still only fills the counterpart name when the
    list row has none).
  - `npm run verify` exit 0.
- **Verification command:** `npm run verify`
- **Budget:** one builder context.
- **Depends on:** nothing (touches `InboxPage.tsx` — serialize with 2/3/5).

### Slice 5: the thread is fast one-handed and never silently loses a message

- **Objective:** day separators + per-message times, one-tap meetup replies,
  and a failed send that stays visible with Retry.
- **Files in scope:** `src/lib/inbox.ts` + `src/lib/inbox.test.ts`,
  `src/pages/InboxPage.tsx`.
- **Approach:** `QUICK_REPLIES` is a small pinned list of label+body pairs
  (`"On my way"`, `"Running ~10 min late"`, `"We're here"`, `"Still on?"`,
  `"Can't make it"`) — tapping one fills the composer (does not auto-send, so a
  parent can amend). Times/separators use the slice's pure helpers. On send
  failure, keep the optimistic bubble flagged `failed` with a Retry control
  instead of filtering it out (`:800-806` today deletes it), and keep the
  inline error line.
- **Acceptance criteria:**
  - `messageTimestampLabel` + `daySeparatorLabel` are pure + tested (today,
    yesterday, older; invalid ISO never throws).
  - Day separators appear between messages from different `localDayKey` days.
  - Each bubble shows a time.
  - The quick-reply row renders above the composer; tapping a chip sets the
    draft; Send still requires an explicit tap (or Enter).
  - A failed write leaves the bubble visible, marked failed, with a Retry that
    re-runs the same send (same body); success clears the failed marker.
  - `npm run verify` exit 0.
- **Verification command:** `npm run verify`
- **Budget:** one builder context.
- **Depends on:** slice 4 (same file, shared header/list changes) — build after.

## Risks / open questions

- **No `.env` in this worktree** → migration 0056 cannot be applied live and
  `send-push` cannot be redeployed here. Both are ACTION REQUIRED for the human
  (or a later round in a worktree that has `.env`). Code + read-back probes are
  still authored and unit-checked.
- **Realtime e2e is a known flake** (V21 task-state entry: inbox realtime spec
  times out in SETUP). The slice-2/3 live behaviour is therefore verified by
  build+unit+lint plus a careful diff, with the e2e run recorded but not gating.
- **Re-arm semantics** (one row per conversation, reset on each message) is a
  product call: it means the `/profile` notification list shows the latest
  message alert per conversation, not a history. Recorded here as the decision,
  not hidden.
- **Lock-screen privacy:** no message content in the push. If the founder wants
  previews, that is a follow-up product decision, not a builder choice.

---

## Status log (orchestrator appends after every phase transition)

- 2026-09-27 — plan written. Baseline `npm run verify` started (job bash-23).
  Slice 1 dispatching first (highest value: without a push, coordination is
  silent).
- 2026-09-27 — baseline green once the real `.env` was copied in (this worktree
  had none): 1785 tests, 0 lint errors / 78 warnings, guards PASS, exit 0.
- 2026-09-27 — Slice 1 COMPLETE (`1d53c29`, verify exit 0, 1790 tests).
  Migration `0056` validated against the LIVE DB in a rolled-back transaction
  (HTTP 201, read-back block passed, zero persistence confirmed). LIVE APPLY +
  `send-push` REDEPLOY are ONE paired ACTION REQUIRED for the human — applying
  `0056` alone would mislabel pushes as `starting_soon` on the not-yet-redeployed
  function (`send-push/index.ts:627`). No supabase CLI / `.env.push.local` here.
- 2026-09-27 — Slice 2 dispatched.
- 2026-09-27 — Slices 2–5 COMPLETE and independently verified (detached
  worktrees, build+test+lint each): `39c41a0` (live list), `f9faac2`+`e829ec8`
  (nav badge; one fix round for the 14px floor), `d525ca2` (thread context;
  acceptance amended to "context is additive for playdate threads"),
  `6b4488e` (quick replies / times / retry). Final tip `2de1331`.
- 2026-09-27 — **LIVE.** `send-push` redeployed → **v7** (updated 2026-09-28
  00:32:15 UTC) FIRST, then migration **`0056` applied** (HTTP 201). Sender-first
  removed the `starting_soon` mislabel window entirely. Post-apply read-back:
  CHECK admits 7 kinds incl `new_message`; trigger present (`prosecdef = true`).
  Rolled-back functional probe (`.scratch/v27/probe-0056-live.sql`) proved the
  producer writes one row per other participant with the pinned title/url and
  that a second message re-arms the row (`sent_at` reset); zero persistence
  confirmed. **ACTION REQUIRED resolved.**
