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

## Comments

- **AMENDED (review cycle 1, F2): "the title is shown as an editable line on the summary" is satisfied by a tap-to-edit READ-BACK, not by an always-open input.** An input at the top of the form made the title `/new`'s first input and first tab stop, which inverts ticket 01's AC ("`/new`'s FIRST field is the place picker … so the affordance is unmistakable") — an AC whose whole point was that an undiscovered field is a field nobody uses. The summary's title line therefore renders as text with a tap that turns it into the ordinary input in place (the standard editable-summary-row pattern); collapsed `/new` has exactly one input, the place picker. Both ACs are now asserted together: `e2e/post-location.e2e.ts` for ticket 01's ordering (collapsed) and for the title still being an editable form field (with the line open), and `e2e/post-fast.e2e.ts` for the affordance itself (the line reads back as text, tapping reveals the input, and a typed title is the title that POSTS). `e2e/fixtures.ts` grew ONE helper (`editTitle`) for the specs that fill or read the title, the same shape as `openMoreOptions` for the disclosure.
- **AMENDED (review cycle 1, F1): the ADDRESS is part of the read-back, and it is dropped when the place text changes.** The address is what the detail page's Google Maps link is built from (`feed.mapsHref`), so hiding it behind the disclosure without reading it back would be exactly the hidden default the "no field is hidden that changes what the parent is agreeing to" AC forbids — and the first cut had it: pick a place (one tap writes the street), type over the place text, and the row kept the picked place's street. So `postSummaryLines` now takes the address as an option and reads it back on the place line (`Green Lake Park · 7201 East Green Lake Dr N`), and a place-TEXT edit clears an address the APP wrote while keeping one the parent typed (`postSummary.addressAfterPlaceTextEdit`, plus an `addressTouched` flag on the page). `e2e/post-fast.e2e.ts` posts the pick-then-retype sequence and asserts the row's address is NOT the picked place's street, and the non-destructive half (a typed address survives a place-text correction).
- **AMENDED (review cycle 1, F3): the repeat line is stated only when the submit will really create a series.** The first cut rendered "Repeats weekly — the weeks ahead post themselves" whenever the toggle was on, while `handleSubmit` guards on `repeatWeekly && seriesWeekday !== null` — with no start date there is no weekday, so no series is created: the summary promised one thing and the submit did another, and the disclosure's own control says the opposite in that state ("Pick a start date and this becomes a standing weekly meetup"). The line is now gated on the same condition the submit uses (the weekday is derived by the same seam, `series.everyWeekdayLabel(weekdayFromDateIso(...))`).
- **AMENDED (review cycle 1, F6): an EMPTY title is "un-touched".** The generated title follows the place until the parent writes their own — and clearing the line is not writing one, so clearing it and then picking another place seeds the generated title again (and a submit with an emptied title falls back to the generated one instead of blocking on a field the page never presents as a question). The title's required + ≤80 rule itself is untouched, and it is very much alive on `/edit`, which shares `validatePlaydateForm`.

**Migration check:** **NONE — UI only.** `supabase/` must be untouched; the
columns this form writes already exist (through 0036). Diff guard: no file under
`supabase/migrations/` changes in this ticket's diff.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/post-fast.e2e.ts e2e/quick-post.e2e.ts e2e/post-location.e2e.ts
e2e/post-time-window.e2e.ts`; full suite; then a real phone pass — time yourself
from "installed app icon" to "posted".

## Comments
