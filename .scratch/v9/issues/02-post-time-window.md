# 02: Post — a time WINDOW, not an hour ("we'll be here this afternoon")

**What to build:** Her words: *"instead of start time you should just be able to
say like we'll be here from time to time (don't put a specific hour amount)"*.
Today `/new` requires a date, a start time on a 30-minute grid, and a duration
chip — three answers to a question most parents answer with "this afternoon".
Add a **window**: one tap says when, roughly, and the exact hour becomes an
optional refinement for the parents who want it.

**Blocked by:** Ticket 01 (one-writer).

**Status:** ready-for-agent — **pending one human confirmation** (see the
judgment call below; the ticket ships the recommended default unless told
otherwise)

- [ ] `/new` offers window chips as the PRIMARY time input: **Right now · This
  morning · After nap · This afternoon · After school · This evening** (labels
  pinned; the set is easy to extend later). One tap sets the date (today) and
  the window
- [ ] The exact-time controls (the date input, the 30-minute stepper, the
  duration chips) move behind **"Pick an exact time instead"** — still available,
  never required. Choosing a window and never touching them must be enough to
  post
- [ ] **Migration 0036:** `playdates.time_hint text` (nullable) holding the
  window's label key (`'now' | 'morning' | 'after_nap' | 'afternoon' |
  'after_school' | 'evening'`), with `starts_at`/`ends_at` still set to the
  window's real start/end so ordering, the day sections, the ICS export and the
  rain badge keep working unchanged. A post with an exact time has
  `time_hint = NULL` (and no other column changes; no policy changes)
- [ ] The card and the detail page render the WINDOW when it is approximate
  ("this afternoon") and the clock window when it is exact ("3 PM–5 PM") — never
  both
- [ ] **The honest consequence, pinned:** an approximate post never claims
  precision — "Happening now" and "Starts soon" are SUPPRESSED for posts with a
  `time_hint` (a window cannot promise "starts in 20 min"); the day section
  headers still work; the ICS export writes the window's real times and appends
  the hint to the `DESCRIPTION` so a calendar entry is still honest
- [ ] Pure seams + unit tests: `TIME_HINT_OPTIONS` (label ↔ key ↔ window
  start/end), `isApproximateTime(post)`, `timeHintsToWindow(key, nowIso)` across
  a DST boundary, and the badge-suppression rule (`isStartingSoon` /
  `isHappeningNow` return false for approximate posts — the rule lives in the
  pure seams, not in the components)
- [ ] The V8 quick-fill preset ("We're here until …") survives as one of the
  window chips ("Right now"), and the two affordances must not both claim the
  time — one control, one answer
- [ ] New e2e `post-time-window.e2e.ts`: post with ONLY a window chip → lands on
  the feed → the card reads "this afternoon" and no clock window → the detail
  page agrees → an exact-time post still shows its clock window and can still
  earn the badges; **red-by-design pre-0036** (the insert 42703s on the missing
  column), never a crash
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0036_playdates_time_hint.sql`**
(number reserved; next free wins if the queue reorders).

- *Idempotency:* `add column if not exists` + a DO-block guarded CHECK
  constraint (`time_hint is null or time_hint in (...)`) — a bare
  `add constraint` is not re-runnable.
- *Header must document:* the window→`starts_at` mapping, that approximate posts
  suppress the time badges (with the reason), that the ICS export stays honest,
  and that no RLS policy changed.
- *Apply path (coordinator only):* `node scripts/apply-migration.mjs supabase/migrations/0036_*.sql`.
- *Post-apply probes:* (1) the column + the CHECK exist
  (`information_schema` / `pg_constraint`); (2) an insert with a valid key
  succeeds and with a bogus key fails closed; (3) a probe post built from a
  window returns the hint through the normal read AND through
  `get_public_playdate` (if the hint is added to the public surface, say so —
  the recommendation is NOT to add it: the signed-out card keeps its current
  fields).
- *Human-owned:* none, beyond confirming the badge-suppression rule.

**JUDGMENT CALL (recommended default = ship as written):** ordering and badges
depend on an exact instant, so an approximate post has to pick one. The
recommendation: `starts_at` = the window's start, the card shows the hint
instead of the clock, and time badges are suppressed. The alternative (keep the
badges by guessing) would tell a parent "starts soon" about a post that only
said "this afternoon" — worse than saying nothing.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/post-time-window.e2e.ts` (red pre-apply); full suite; live marker pass on a
phone — post with one tap on "This afternoon" and read the card back.

## Comments
