# V10 spec — "Post again" and friends: the fast-recall batch

Date: 2026-09-14 · Origin: the founder's goal — posting must be effortless for
distracted moms with 30 seconds and one hand. The /post audit (this batch's
starting point) found the form itself is already near-minimal (V9 ticket 03:
three decisions, ~3 taps for a returning parent with a remembered place). The
remaining cost is **recall**, not tapping: nothing on /new remembers the whole
last post, kids are behind a disclosure, and "tomorrow at 10" is a fiddly date
field. This batch attacks recall three ways.

Also in scope, from the same conversation: an AI **sentence prefill** (one
structured LLM call via a Supabase Edge Function — no chat, no CopilotKit;
research at `.scratch/agent-post-page/research.md`). The LLM never writes:
the parent reviews the normal summary and taps Post. Privacy pin: ONLY the
sentence the parent typed leaves the device, through one edge function that
logs nothing; provider zero-retention terms required (human picks provider).

## What ships (3 tickets)

1. **Ticket 01 — "Post again": clone the last post, time advances.** One chip
   on /new that prefills the ENTIRE last post (place, address, neighborhood,
   duration, details, kids) with the start moved to the next 30-minute slot
   (today if still ahead, else tomorrow same slot). Repeat posts drop to
   ~2 taps. No migration.
2. **Ticket 02 — kids chips surface when the parent has kids.** With ≤6 kids,
   "Kids you're bringing" renders inline ABOVE "More options" (not behind it)
   for parents who have kids; the disclosure keeps everything else. Parents
   with no kids see exactly today's form. No migration.
3. **Ticket 03 — sentence prefill (the LLM).** A "Describe it instead" box on
   /new: one sentence → edge function `prefill-playdate` → structured fields
   → `mergePrefill` writes them into the form → the existing summary shows the
   read-back → Post. No chat. No migration (function + secrets only).

## Out of scope (recorded, not built)

- Voice input (mic button) — after ticket 03 proves the flow, small add
- CopilotKit / chat UX — rejected for v1 (chat is MORE friction for a
  distracted user than one sentence + review); revisit only if parents
  ask for conversational iteration
- On-device-only parsing (no-LLM fallback) — parked; regex date parsing
  alone has a poor fill rate
- Any auto-post path — the LLM can never call createPlaydate

## Privacy pins (enforced in review)

- The edge function receives `{ text, todayIso, timezone }` — never kid ids,
  profile fields, or anything fetched from the DB
- No logging of `text` anywhere (function logs, Supabase logs config note,
  no error messages that echo input)
- Provider must have zero-retention/no-training API terms (human decision)
- The prefill result passes through the SAME validation as a hand-filled form;
  invalid fields are dropped, not coerced

## Migration check

**NONE for the batch.** Ticket 03 deploys a NEW edge function
(`supabase/functions/prefill-playdate/`) and sets one secret
(`supabase secrets set LLM_API_KEY=...` + provider base URL/model) — no SQL
migration, no schema change. The coordinator applies the deploy + secrets
after code review, per the send-push precedent.

## Verify (batch gate)

`npm run build && npm run test` per ticket; e2e per ticket's own spec list;
final gate = full suite + lint + a timed manual pass on a phone viewport
("open /new → posted" for the repeat case must be ≤3 interactions).