# V14 T01 — Inbox: parent↔parent messaging

Status: done
Depends on: none (V13 is shipped; last migration 0041 live)
Migration: 0042 (messages + conversation_reads + RLS)

## What

Add a "Inbox" tab as the 2nd item in the bottom nav (between Nearby and
Places). The /inbox page shows a conversation list (one row per playdate the
caller participates in that has ≥1 message) and an inline thread view
(?thread=<playdate_id>). Messaging is scoped to a specific drop-in meetup:
you can only message parents you share a playdate with (host ↔ pinger).
New messages arrive in real-time via Supabase Realtime.

## Mechanics (component-level)

### Migration 0042 (supabase/migrations/0042_messages.sql)

- `public.messages`: id (uuid PK), playdate_id (uuid FK→playdates, NOT NULL,
  ON DELETE CASCADE), sender_id (uuid FK→profiles, NOT NULL, ON DELETE
  CASCADE), body (text NOT NULL, CHECK char_length between 1 and 2000),
  created_at (timestamptz NOT NULL DEFAULT now()).
- `public.conversation_reads`: playdate_id (uuid FK→playdates, NOT NULL,
  ON DELETE CASCADE), profile_id (uuid FK→profiles, NOT NULL, ON DELETE
  CASCADE), last_read_at (timestamptz NOT NULL DEFAULT now()),
  PRIMARY KEY (playdate_id, profile_id).
- RLS on messages:
  - SELECT: authenticated AND (sender_id = auth.uid() OR EXISTS a
    conversation the caller participates in — i.e., the playdate's host is
    the caller OR the caller has a going_pings row on that playdate).
    Use a SECURITY DEFINER helper or inline EXISTS subquery (house pattern
    from 0025 get_guest_list).
  - INSERT: authenticated AND sender_id = auth.uid() AND the caller is a
    participant (host or pinger on that playdate).
  - No UPDATE, no DELETE policies (messages are immutable in V14).
- RLS on conversation_reads:
  - SELECT: authenticated AND profile_id = auth.uid().
  - INSERT: authenticated AND profile_id = auth.uid().
  - UPDATE: authenticated AND profile_id = auth.uid().
- Index: `idx_messages_playdate_created` ON messages (playdate_id, created_at).
- Idempotent + re-paste-safe (IF NOT EXISTS on tables; DO blocks for policies;
  DROP INDEX IF EXISTS before CREATE INDEX).

### db.ts seams (src/lib/db.ts)

- `listConversations(userId: string): Promise<ConversationSummary[]>` —
  returns one row per playdate the user participates in (host or pinger)
  that has ≥1 message. Each summary: playdate_id, playdate_title,
  other_party_display_name, latest_message_preview (truncated to 60 chars),
  latest_message_at, unread_count (messages where created_at >
  conversation_reads.last_read_at, or total if no read row).
  Implementation: query messages joined with playdates + profiles +
  going_pings, filtered to the caller's participation, grouped by
  playdate_id, ordered by latest_message_at desc. May need a PostgREST
  subquery or two sequential requests (verify in the gate).
- `sendMessage(playdateId: string, body: string): Promise<void>` —
  inserts a row into messages. Client-side validation: body.trim() length
  1–2000. The RLS INSERT policy enforces sender_id = auth.uid() +
  participation at the DB level.
- `queryMessagesForPlaydate(playdateId: string): Promise<MessageRow[]>` —
  all messages for a playdate, ordered by created_at asc. Used by the
  thread view.
- `markConversationRead(playdateId: string): Promise<void>` — upserts
  conversation_reads (playdate_id, profile_id = auth.uid(), last_read_at =
  now()). Called when the user opens a thread.
- Type exports: `MessageRow`, `ConversationSummary`.

### Real-time subscription (src/pages/InboxPage.tsx or a hook)

- On mount (when a thread is open), subscribe to Supabase Realtime:
  `supabase.channel('messages-' + playdateId).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `playdate_id=eq.${playdateId}` }, (payload) => appendMessage(payload.new))`.
- Unsubscribe on unmount / thread change.
- The conversation list also gets a lightweight refresh: when a new message
  arrives in any open thread, bump the preview + unread count in the list
  (or just refetch listConversations on focus — simpler, acceptable for V14).

### UI (src/pages/InboxPage.tsx)

- **Route**: `/inbox` (add to App.tsx Routes, inside ProtectedShell).
- **Conversation list** (default, no ?thread param):
  - Fetch listConversations on mount.
  - One card per conversation: other party's display_name (bold), playdate
    title (muted, truncated), latest message preview (truncated ~60 chars,
    muted), relative time (e.g., "2h ago"), unread badge (a small rounded
    pill with the count, only when > 0).
  - Tap → navigate to `/inbox?thread=<playdate_id>`.
  - Empty state: "No conversations yet." + subtext "Message a parent from a
    drop-in page once you're both going." + a Link to /browse.
- **Thread view** (?thread=<playdate_id>):
  - Header: back button (← to conversation list), playdate title, other
    party's display_name.
  - Message list: chronological, scrollable. Each message: sender label
    (display_name, small muted text above the bubble), body text in a
    rounded bubble (right-aligned + tinted background for the caller's own
    messages; left-aligned + white background for the other party).
  - Composer: textarea (auto-grow, max ~4 lines) + Send button (disabled
    when empty). Enter-to-send on desktop (keydown handler), tap-to-send on
    mobile. On send: optimistic append + call sendMessage; on failure,
    show a toast/error.
  - On open: call markConversationRead (clears the unread badge).
  - Real-time: new messages append without reload.
- **Mobile-first**: max-w-md container (same as the rest of the app).

### Nav change (src/App.tsx + src/components/icons.ts)

- Add `inbox` glyph to NAV_ICONS: a simple envelope icon, 24px viewBox,
  stroked, currentColor, strokeWidth 1.8 (matching the existing family).
  Suggested path: `M4 6h16v12H4Z M4 6l8 6 8-6` (envelope outline + flap).
- Insert `<NavTab to="/inbox" label="Inbox" icon={<NavIcon path={NAV_ICONS.inbox} />} />`
  as the 2nd tab (after Nearby, before Places) in the bottom nav (App.tsx
  ~line 263).

### Entry point on /playdate/:id (src/pages/PlaydateDetailPage.tsx)

- Show a "Message the host" button (if the caller is a pinger, not the host)
  or "Message <pinger_display_name>" (if the caller is the host and there's
  exactly one pinger; if multiple pingers, show "Message a parent" which
  opens a small picker… decision for V14: keep it simple — show the button
  only when there's exactly one counterpart. If the caller is the host and
  there are N pingers, show N buttons (one per pinger). If the caller is a
  pinger, show one button ("Message the host").
- Button visible only when the caller has a going_ping on the post OR is the
  host AND ≥1 other parent has pinged. Hidden otherwise.
- Tap → navigate(`/inbox?thread=${playdateId}`). The inbox page creates the
  conversation context (the first message seeds it; no pre-existing
  conversation row needed — the thread view works off messages directly).

### E2E (e2e/inbox.e2e.ts)

Pinned specs (5):
1. **Two-account conversation**: marker A hosts a post, marker B pings it.
   B navigates to /playdate/:id → taps "Message the host" → lands on
   /inbox?thread=<id> → types "Can we do Saturday?" → sends → message
   appears in the thread.
2. **Host sees + reads**: A navigates to /inbox → sees the conversation row
   (unread badge = 1) → taps it → thread shows B's message → badge clears
   (markConversationRead fired).
3. **RLS isolation**: marker C (not host, not pinger) navigates to /inbox →
   no conversation row for that playdate. Direct API call
   (`GET /rest/v1/messages?playdate_id=eq.<id>`) returns [] (RLS blocks).
4. **Composer validation**: empty submit is disabled (button has
   disabled attribute); paste/type 2001 chars → client validation blocks
   send (error message or truncation).
5. **Real-time delivery**: while B's thread is open, A sends a message in a
   second browser context. B's thread receives the message within ~2s
   (no manual refresh). Use Playwright's `expect.poll` or a timeout-bounded
   wait.

### Unit tests (src/lib/db.test.ts or a new file)

- `listConversations`: mock PostgREST responses; verify grouping, ordering,
  unread count calculation.
- `sendMessage`: verify the insert payload shape + client validation
  (empty body throws, 2001-char body throws).
- `queryMessagesForPlaydate`: verify ordering (created_at asc).
- `markConversationRead`: verify the upsert payload.

## Acceptance criteria

- [ ] Migration 0042 applied live (via CDP/browser-use per AGENTS.md).
- [ ] Bottom nav shows 5 tabs: Nearby, Inbox, Places, Post, Profile.
- [ ] /inbox renders the conversation list (or empty state).
- [ ] Thread view renders messages chronologically + composer.
- [ ] "Message the host" / "Message <name>" button on /playdate/:id for
      eligible callers.
- [ ] Real-time: new messages appear without reload.
- [ ] RLS: non-participants cannot read or write messages.
- [ ] Unread badge appears/clears correctly.
- [ ] Gate: build ✓ · unit tests pass · lint 0 errors · e2e inbox.e2e.ts
      5/5 · grep gates (navigator.geolocation = 0).

## What this ticket must NOT touch

- No changes to existing playdate/posting/browsing flows (only additive:
  a new button on the detail page, a new nav tab, a new route).
- No message editing/deletion (immutable in V14).
- No push notifications.
- No group chat (1:1 per playdate only).
- No free-form DMs (all messaging is playdate-scoped).

## Verification command

```bash
npm run build && npm run test
npm run lint
npx playwright test e2e/inbox.e2e.ts
grep -r "navigator\.geolocation" src/ | wc -l   # must be 0
```