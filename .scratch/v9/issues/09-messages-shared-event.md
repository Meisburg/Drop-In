# 09: Messages — parent-to-parent, tied to a shared drop-in

**What to build:** His words: *"would like way to message people in the app."*

This is the highest-risk feature in the whole backlog: it is **adults
contacting strangers about their children**. Every other part of this app has
been built so that a parent can show up to a public playground without handing
anyone a private channel; messaging changes that in one step. It therefore does
not ship as an open inbox.

**Blocked by:** Ticket 08 (one-writer) **and a human decision on scope** — see
the block at the bottom. Do not dispatch this ticket until that is answered.

**Status:** needs-human-decision (then `ready-for-agent`)

- [ ] **Threads exist only with a shared drop-in.** A thread can be opened, and
  only be opened, when the two parents share an event: one is the host and the
  other pinged that drop-in, or both pinged the same drop-in. There is **no**
  open inbox, no search-for-a-parent, no message request from someone with no
  shared event — the shared event IS the consent, and it is checkable from the
  data (`going_pings` + `playdates`), not from memory
- [ ] Entry points are only where the shared event is visible: the detail page's
  host/attending panel ("Message @handle") and the guest list. A thread opened
  from anywhere else is a bug
- [ ] Thread contents: **text only** (≤500 chars, the comment rules), no
  attachments, no kid names rendered by the app, no read receipts, no presence.
  A parent's own name/handle is all that is shown
- [ ] Trust tools are inline and first-class: **Report** and **Block** from
  inside the thread (the existing `ReportDialog` + `blocks` machinery), and a
  block silences the thread for both sides immediately. Leaving a thread hides it
  without deleting the other parent's copy (evidence survives a report — the
  0008 nullable-refs discipline)
- [ ] A message to a parent with notifications on produces a **`message`**
  notification kind through the existing pipeline (0032's CHECK gains the kind,
  and the sender's copy rule gains it) — and the in-app "while you were away"
  inbox (V8/03) gains a "N new messages" item so a parent who denied push still
  learns about it
- [ ] `/messages` is a real route: the list of threads (who + the event + the
  last line + unread count), one thread view, a composer, and a designed empty
  state ("Messages start from a drop-in you're both part of")
- [ ] Non-participants read **zero rows** (RLS, proved with a live probe); a
  participant sees only their own threads; the participation check itself goes
  through a stable SECURITY DEFINER helper (the 0023 42P17 lesson — a policy that
  must consult another table's rows does not subquery it directly)
- [ ] Pure seams + unit tests: `canMessage(viewerContext, postContext)`
  (the shared-event rule, all four combinations), `threadTitle(thread, viewerId)`,
  `unreadCount(messages, lastReadIso)`, and the message validator
- [ ] New e2e `messages.e2e.ts`: host and a pinger see the entry point and can
  exchange a message; a third parent who pinged nothing sees **no** entry point
  and reads 0 rows over REST; Report and Block work from inside a thread; the
  `message` notification row appears in `notification_log` for the recipient;
  **red-by-design pre-0039**
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0039_messages.sql`**
(number reserved; next free wins if the queue reorders).

- *Objects:* `message_threads` (id, `playdate_id`, two participant ids, created_at,
  unique on the participant pair per event) + `messages` (id, `thread_id`
  cascade, `author_profile_id`, body ≤500 with a DB CHECK, created_at,
  `read_at timestamptz null` per participant — pin the exact shape in the header);
  an `after insert` trigger on `messages` writing a `notification_log` row of kind
  `message` for the other participant (SECURITY DEFINER, `search_path` pinned,
  never notifying the author); and an **alter** of 0032's `notification_log_kind_check`
  to include `'message'` (DO-block guarded drop + re-add — the 0019 pattern).
- *RLS:* participant-only SELECT on both tables; INSERT on `messages` only by a
  participant of that thread; **no UPDATE/DELETE policy for anyone but the author's
  own soft-delete** (pin it explicitly); the participation predicate lives in a
  stable SECURITY DEFINER helper, EXECUTE to `authenticated` only (revoke public
  and anon — an anon probe must fail closed).
- *Header must document:* the shared-event consent rule and where it is enforced,
  the notification kind addition, that blocking silences a thread, and that
  reporting never loses evidence.
- *Apply path (coordinator only):* `node scripts/apply-migration.mjs supabase/migrations/0039_*.sql`.
- *Post-apply probes:* (1) tables + constraints + the widened CHECK exist;
  (2) a participant pair can create a thread and message each other, while a third
  account reads **0 rows** and cannot insert (assert ROWS, not status — the 0014
  lesson); (3) the `message` notification row appears for the recipient and NOT
  for the author; (4) anon is denied both tables and the helper.
- *Human-owned:* the scope decision below, plus a read of the safety posture.

**JUDGMENT CALL — the scope, needing an explicit yes (recommended default =
exactly what is written above).** The alternative shapes are worse in specific
ways worth naming: (a) an open inbox lets any account cold-message any parent
about their kids — the classic failure mode of every app like this; (b) a
"message request" model is the same thing wearing a hat; (c) doing nothing leaves
the group chat as the only channel, which is what the app exists to replace. The
recommendation is the shared-event thread, because consent is derivable from data
the app already has, and every message is attached to a real, reportable event.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/messages.e2e.ts` (red pre-apply); full suite; live two-device pass — host and
pinger exchange a message and a third account cannot see the thread exists.

## Comments
