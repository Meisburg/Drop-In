# V27 — the inbox, built for drop-in coordination

Origin: the founder asked how to improve `/inbox` so parents can actually
coordinate drop-in meetups. Five recommendations were made; the founder said
"scope all five … build them all out. And then I'll review them after they're
complete."

- Plan: `plan-v27.md` (5 slices, pinned interfaces, acceptance criteria)
- Event log: `.scratch/v27/ledger.md`
- Per-slice builder briefs: `.scratch/v27/briefs/`
- Base: `5258395` (V26 close) → Head: `6b4488e`
- Not pushed. Branch `Meisburg/Inbox`.

## The five, shipped

| # | Recommendation | Commit | What changed |
|---|---|---|---|
| 1 | A new message notifies the other participants | `1d53c29` | Migration `0056` (+445): `new_message` joins the kind CHECK (7); `notification_payload` gains the branch; `notify_new_message()` AFTER INSERT on `messages` writes one **re-armable** row per other participant (host ∪ pingers, minus `new.sender_id`). TS twin: `pushCopy.ts` `messageThreadUrl` + copy; `EMAIL_KINDS` drift guard; `push.ts` kind copy. `send-push` needed no change (generic drain). |
| 2 | The conversation list is live, and refetches on focus | `39c41a0` | `InboxPage.tsx`: a no-filter `messages` INSERT subscription (`inbox-list`, RLS-scoped) bumps `reloadToken`; `visibilitychange`→visible bumps it. Open-thread path byte-for-byte unchanged. |
| 3 | The Inbox tab shows there is something to read | `f9faac2` + `e829ec8` | New `InboxUnreadProvider` + pure `sumUnread`; `NavTab` badge, only when > 0, `aria-label="Inbox, N unread"`, 14px floor. |
| 4 | The thread names the group and pins the drop-in | `d525ca2` | Pure `groupLabel` + `threadContextLine`; the playdates fallback read always resolves the `?thread=` context (window/place/participants); the header shows `Name + N more`, `when · place`, and links to `/playdate/:id`. |
| 5 | Fast one-handed, and a failed send never vanishes | `6b4488e` | `QUICK_REPLIES` chips (fill the draft, never auto-send), day separators + per-bubble times, and a failed send that keeps its bubble with `Not sent · Retry` (re-sends the same body; no duplicate when already reconciled). |

## Verification

- Each slice's builder ran `npm run verify` (build + test + lint + a11y:focus +
  steering-lint + guards) to exit 0.
- **The orchestrator independently re-ran `build + test + lint` for every slice
  in a detached `git worktree` at that slice's commit** — 1 through 5 — each
  EXIT 0 (test counts: 1790 → 1790 → 1794 → 1806 → 1818).
- **Migration `0056` was executed against the LIVE database inside a
  rolled-back transaction** (`begin; … rollback;` via `scripts/db-sql.sh`): the
  read-back DO block passed (HTTP 201), and a post-probe read confirmed zero
  persistence (CHECK still 6 kinds, no `notification_new_message` trigger).
  Transaction control was first proven with a sentinel table that did not
  persist.
- Final `npm run verify` on the tip `6b4488e` (fresh, this session): **EXIT 0 —
  56 files / 1818 tests passed; 79 lint warnings / 0 errors; a11y:focus PASS;
  steering-lint PASS; GUARDS: PASS.**

## Deliberate decisions (so they are not silently reversed)

- **No message content in any push.** The push names the sender and says
  `Tap to reply in "<drop-in>"`. A parent's message on a lock screen is a
  privacy leak this product does not take.
- **One re-armable notification row per conversation**, not a history: each new
  message resets `sent_at`/`created_at` on the same `(profile, kind, playdate)`
  row, so the next message buzzes again. `do nothing` would buzz once ever.
- **Free-form DM notifications are deferred** (not built): the producer
  early-returns on `playdate_id is null`. A DM needs its own URL
  (`/inbox?dm=`), recipient set (`message_recipients`), and NULL-distinct
  dedupe — its own slice. Slice 4 still renders DM threads.
- **The drop-in context line + link are additive for every playdate thread**
  (including 1:1); a `?dm=` header is byte-identical to before.
- The `notification_payload` function keeps its 5-argument signature and its
  `prosecdef = false` posture (asserted by the read-back).

## ACTION REQUIRED — one paired human step (do NOT do half)

This worktree has **no Supabase CLI and no `.env.push.local`**, so neither
production step could run here. They must be done **together**:

1. Apply the migration:
   `bash scripts/db-sql.sh --file supabase/migrations/0056_messages_push.sql`
2. Redeploy the sender:
   `bash scripts/push-deploy.sh` (or
   `npx supabase functions deploy send-push --project-ref ayzvjwxbxyrcgyoeaxuk`)

**Why paired:** the currently-deployed `send-push` still has the 6-kind table;
its drain falls back to `isNotificationKind(row.kind) ? row.kind : 'starting_soon'`
(`send-push/index.ts:627`). Applying `0056` alone would send correct copy but tag
every message push as `starting_soon` — the wrong notification tag and the wrong
per-kind mute. Until both run, the feature is simply dormant (no producer, so
nothing mislabeled).

## Not run / known gaps

- **Playwright e2e** was not run: the two-account Realtime specs are a known
  flake (task-state V21 records them timing out in SETUP). No browser lane was
  started — the human's Chrome is never touched.
- **`scripts/mobile-audit.mjs` does not cover `/inbox`** (its routes are
  `/login`, `/playdate/:id`, `/browse`), so the 44px / 14px floors on the new
  controls were met by construction, not measured. The one regression it WOULD
  have caught was found by inspection and fixed in `e829ec8` (a 10px badge).
- **No separate reviewer subagent** was dispatched (the workspace's
  `orchestrator-reviewer` is an opencode agent, not available in this DSH
  session). The orchestrator inspected every diff, ran the independent worktree
  verification, and ran the live rolled-back migration probe. Recorded as a
  deviation; the human is the final reviewer.
