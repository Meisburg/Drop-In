# 03: Post — the twenty-second post

**What to build:** Her words: *"optimize the post page to make the ability to
post an event as simple as possible and as quick as possible."* V8 ticket 01
made the defaults correct (today, next slot, remembered places, a quick-fill
preset) and V9 tickets 01–02 remove the neighbourhood question and make the time
one tap. This ticket is the pass that follows from those two: **a post that is
three decisions**, with everything else behind one disclosure.

**Blocked by:** Ticket 02 (one-writer). Doing this first would be optimising a
form that tickets 01–02 are about to change.

**Status:** ready-for-agent

- [ ] Target, measured in the e2e: **post with 2 taps after the place picker** —
  pick a place, tap a window chip, tap Post. Nothing else may be required
- [ ] The title is no longer a required field with its own step: it is generated
  ("Playdate at <place>") and shown as an **editable line on the summary**, not
  as the first thing the parent must fill in. (V8 already auto-fills it when a
  place arrives; this makes that the default rather than a convenience)
- [ ] "Kids you're bringing" moves behind **More options** (it is a
  nice-to-have, not a gate), together with the address field's manual entry,
  Details, and the exact-time controls from ticket 02
- [ ] The page opens as a **summary** — "Saturday · this afternoon · Green Lake
  Park (East)" with the three decisions inline — and reads back exactly what
  will be posted before it is posted. No field is hidden that changes what the
  parent is agreeing to
- [ ] Validation stays honest: a place (picked or typed) and a window are the
  only required answers; every other field keeps its current rule
- [ ] `scripts/mobile-audit.mjs` stays green at 320/375/390/430 and both
  orientations, and every control on the summary is ≥44px
- [ ] Pure seams + unit tests: `postSummaryLines(values)` (the read-back, pinned
  string-per-line) and `generatedTitle(place)` (trim, cap at 80, never empty)
- [ ] Existing specs that drive `/new` must keep working **without editing their
  expectations** — the placeholders and control names they use
  (`e.g. Green Lake playground…`, `1h`, `Post drop-in`, the kids picker) stay
  reachable. Any that legitimately become unreachable because a field moved
  behind More options: open that disclosure in the spec, do not weaken it
- [ ] New e2e `post-fast.e2e.ts`: counts the interactions from a cold `/new` to
  the feed (pin: ≤4 taps + 1 typed place), and asserts the summary read-back
  matches what lands on the feed
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **NONE — UI only.** `supabase/` must be untouched; the
columns this form writes already exist (through 0036). Diff guard: no file under
`supabase/migrations/` changes in this ticket's diff.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/post-fast.e2e.ts e2e/quick-post.e2e.ts e2e/post-location.e2e.ts
e2e/post-time-window.e2e.ts`; full suite; then a real phone pass — time yourself
from "installed app icon" to "posted".

## Comments
