/**
 * V9 ticket 03 — the /new SUMMARY: two pure seams, the whole read-back.
 *
 * The ticket's shape: the page opens on the one thing the parent can judge at
 * a glance — the day, the time answer and the place, read back as text — with
 * the three decisions (place, how long, Post) visible and everything else
 * behind ONE "More options" disclosure.
 *
 * Three rules come out of that, and all are pure so they are unit-tested
 * without React or a database:
 *
 * - `generatedTitle(place)`: the title is no longer a question. It is
 *   "Drop-in at <place>" — trimmed, capped at the form's own 80, and NEVER
 *   empty — and the summary shows it as an editable line. V8 ticket 01 already
 *   auto-filled a title when a place arrived; this ticket makes that the
 *   DEFAULT rather than a convenience.
 * - `postSummaryLines(values, options)`: the read-back, one string per line, in
 *   the order the parent answers them (day + how long, then the window, then
 *   the place and its address). It is built from the SAME values the submit
 *   writes — one source, never a recomputation — so a hidden default cannot
 *   change what the parent is agreeing to. The two things the read-back needs
 *   that are NOT in `PlaydateFormValues` ride in as options for that reason:
 *   the address (V2 pinned it outside the form's value shape) and the page-local
 *   "Repeat weekly" toggle.
 * - `addressAfterPlaceTextEdit(address, addressTouched)`: the address a PICK
 *   wrote is dropped when the parent types over the place text, and an address
 *   the parent typed is kept. Without it the address would be a hidden default
 *   (review cycle 1, F1) — the exact failure the sentence above promises not to
 *   have.
 *
 * WHY THIS IS ITS OWN MODULE and not part of feed.ts: the read-back needs three
 * things that live in three modules — feed's formatters (formatStartDayLabel,
 * formatTimeLabel, durationLabel, TITLE_MAX_LENGTH), places' alias rule
 * (stripPlaceAlias: `@` is a gesture, not text) and series' weekday words
 * ("every Saturday"). feed.ts is imported BY places.ts and series.ts, so a
 * seam living there could not import either without a cycle; a leaf module that
 * imports all three is the way to REUSE those rules instead of restating them
 * (the house lesson: import the seam, never a second copy of it).
 */
import { TITLE_MAX_LENGTH, durationLabel, formatStartDayLabel, formatTimeLabel } from './feed'
import type { PlaydateFormValues } from './feed'
import { stripPlaceAlias } from './places'
import { everyWeekdayLabel, weekdayFromDateIso } from './series'

/**
 * What the generated title says when a place is known.
 *
 * "Drop-in at <place>" — NOT "Playdate at <place>", renamed in V23.
 *
 * WHY, in the founder's words: *"Playdate(change to 'Title')"*. Taken literally
 * that points at the FIELD, and the field's label already read "Title" — what
 * the parent actually sees is this generated VALUE sitting in it. The founder
 * was saying the word should not be there, and the product's own vocabulary
 * agrees: the nav tab is "Drop Ins", the button says "Post a drop-in", the page
 * heading says "Post a drop-in". This constant was the one place the app called
 * its own central noun something else.
 *
 * WHAT THIS DOES NOT DO: it does not rewrite existing posts. `title` is a
 * stored column and a parent's own words are never silently replaced, so a
 * drop-in posted before this change keeps what it was created with. Only NEWLY
 * generated titles use the new prefix — correct behaviour, and it does mean old
 * and new posts read differently for a while.
 */
export const GENERATED_TITLE_PREFIX = 'Drop-in at '

/**
 * The generated title with no place to name — still a title ("never empty"
 * is the contract, and the field is required). A parent who picks nothing
 * sees this rather than a blank they have to fill in before they can post.
 *
 * Renamed with the prefix above so the two cannot disagree about the product's
 * own noun: a parent who picked a place and one who did not should not read two
 * different names for the same thing. The clone's restatement in `feed.ts`
 * (`generatedTitleFromParts`) carries the same word, and the unit tests pin the
 * pair together.
 */
export const GENERATED_TITLE_FALLBACK = 'Drop-in'

/**
 * The title /new GENERATES from the place (V9 ticket 03): "Drop-in at Green
 * Lake Park" (renamed from "Playdate at …" in V23 — see GENERATED_TITLE_PREFIX).
 * Trimmed, capped at `TITLE_MAX_LENGTH` (a generated value must
 * never be one the form's own validator refuses), and never empty.
 *
 * The `@` alias is stripped by the same seam the picker matches with
 * (places.stripPlaceAlias), so the alias's most natural use — type `@`, pick
 * from the list — cannot seed "Playdate at @": the character is a gesture, and
 * a bare `@` is no place at all (the V9 ticket 01 finding, e2e/post-location).
 *
 * The cap can bite only on a very long place name (12 characters of prefix +
 * 68 of place): the truncation is a plain slice, because a generated title the
 * parent can then edit freely is better than one the validator rejects.
 */
export function generatedTitle(place: string): string {
  const name = stripPlaceAlias(place)
  if (name === '') return GENERATED_TITLE_FALLBACK
  return `${GENERATED_TITLE_PREFIX}${name}`.slice(0, TITLE_MAX_LENGTH)
}

/** The read-back's words for an answer the parent has not given yet. */
export const SUMMARY_NO_DAY = 'no day picked'
export const SUMMARY_NO_DURATION = 'no duration picked'
export const SUMMARY_NO_PLACE = 'no place picked'

/**
 * One day, in minutes — the boundary the window's "(next day)" suffix turns
 * on. The same number and the same suffix the visible "Ends …" line uses
 * (PlaydateFormFields' DAY_MINUTES): the two read-backs are the same rule, so
 * they cannot disagree about a window that crosses midnight.
 */
const DAY_MINUTES = 24 * 60

/**
 * What the ADDRESS becomes when the parent edits the place TEXT by hand
 * (review cycle 1, F1) — the one rule that keeps the read-back honest.
 *
 * The address is filled by the PICK (places.placePickPatch writes the
 * directory's published street), and until this ticket it sat in a visible
 * input right under the place field. Behind the disclosure it is invisible, so
 * a stale value would be a hidden default: pick "Green Lake Park", type
 * "Ballard Playground" over it, and the row still carries Green Lake's street —
 * which the detail page renders as the Google Maps link. The place TEXT is what
 * the parent last said; the address it came with is not theirs any more.
 *
 * The `addressTouched` half is what keeps the fix from being destructive: an
 * address the parent TYPED (or corrected) is theirs, so correcting the place
 * text must not wipe it. That is the same rule the place handler already states
 * for the place link — "the post must never claim a directory place it no
 * longer names" — applied to the other value a pick writes.
 *
 * Pure, and deliberately takes no form values: this is a rule about two
 * page-local fields (the page owns both).
 */
export function addressAfterPlaceTextEdit(address: string, addressTouched: boolean): string {
  return addressTouched ? address : ''
}

/** What the summary says when the parent has turned the weekly repeat on. */
export const SUMMARY_REPEATS_SUFFIX = 'the weeks ahead post themselves'

export interface PostSummaryOptions {
  /**
   * /new's "Repeat weekly" toggle. It is page-local state, not part of
   * `PlaydateFormValues` (V8 ticket 06 pinned the form's value shape), and it
   * is the one thing behind the disclosure that changes WHAT IS POSTED — one
   * drop-in or a standing series — so the read-back must state it.
   *
   * It states it ONLY when the submit would really create the series — see the
   * guard in `postSummaryLines` (review cycle 1, F3).
   */
  repeatsWeekly?: boolean
  /**
   * The optional street address (review cycle 1, F1). It is NOT part of
   * `PlaydateFormValues` (V2 pinned that shape, and the address lives outside
   * it on both pages), so it arrives as an option — the seam stays pure and the
   * read-back stays complete.
   *
   * WHY it is read back: the detail page's Maps link is built from
   * (place, address) (feed.mapsHref), so the address is part of what the parent
   * is posting, not a detail of the form. Behind the collapsed disclosure it
   * would otherwise be invisible.
   */
  address?: string
}

/**
 * The /new summary's read-back, ONE STRING PER LINE, in the parent's own
 * order:
 *
 *   0. the day + how long          "Sat, Aug 30 · 1h"
 *   1. the exact window            "3:30 PM–4:30 PM"      (start–end)
 *   2. the place (+ the address)   "Green Lake Park · 7201 East Green Lake Dr N"
 *   3. repeats, ONLY when the submit would really create a series
 *                                  "Repeats every Saturday — the weeks ahead
 *                                   post themselves"
 *
 * Every line is pinned by a unit test, including the "not answered yet" states
 * (`no day picked` / `no duration picked` / `no place picked`): the summary is
 * shown BEFORE the answers exist, so its empty state is not an edge case, it is
 * the first thing a parent sees.
 *
 * The window's end is `start + duration` — the rule the submit writes with
 * (feed.computeEndIso) and the one the visible "Ends …" line states — and it
 * carries the same "(next day)" suffix when it rolls past midnight, so the two
 * read-backs cannot disagree.
 *
 * The `—` in the repeats line is the em dash the "Repeat weekly" control's own
 * copy already uses ("Repeats every Saturday at 3:30 PM — the weeks ahead post
 * themselves."), and the words after it are its words verbatim (and come from
 * the same seam, series.everyWeekdayLabel — see below).
 *
 * The address rides on the PLACE line (`place · address`) and only when it is
 * non-empty: the two answer the same question — where — and the feed card and
 * the detail page render them that way (the place on its own line, the Maps
 * link built from both). Review cycle 1, F1: behind the disclosure it was
 * invisible, and the Maps link it drives is not.
 *
 * DST NOTE (a known gap, deliberately not changed here): this line is
 * WALL-CLOCK arithmetic — `startMinutes + durationMinutes` on the device's
 * clock — while the instant the submit writes comes from feed.computeEndIso,
 * which adds absolute milliseconds to local midnight. On a spring-forward
 * morning the two can differ by an hour for a window that crosses the
 * transition. V9 ticket 02 (approximate times) owns time semantics; changing it
 * here would move a stored instant, which is not this ticket's business. The
 * visible "Ends …" line does the same arithmetic, so the form stays internally
 * consistent either way.
 */
export function postSummaryLines(
  values: PlaydateFormValues,
  options: PostSummaryOptions = {},
): string[] {
  const endMinutes = values.startMinutes + values.durationMinutes
  const day = formatStartDayLabel(values.startDate)
  const place = stripPlaceAlias(values.place)
  const address = (options.address ?? '').trim()
  const lines = [
    `${day === '' ? SUMMARY_NO_DAY : day} · ${
      values.durationMinutes > 0 ? durationLabel(values.durationMinutes) : SUMMARY_NO_DURATION
    }`,
    values.durationMinutes > 0
      ? `${formatTimeLabel(values.startMinutes)}–${formatTimeLabel(endMinutes)}${
          endMinutes >= DAY_MINUTES ? ' (next day)' : ''
        }`
      : formatTimeLabel(values.startMinutes),
    place === '' ? SUMMARY_NO_PLACE : address === '' ? place : `${place} · ${address}`,
  ]
  // The repeat line states a SERIES — so it is gated on the SAME condition the
  // submit is: `repeatWeekly && seriesWeekday !== null` (NewPlaydatePage's
  // handleSubmit cannot create a series without a weekday to repeat on).
  // Review cycle 1, F3: the earlier version promised "the weeks ahead post
  // themselves" with no start date chosen, while the submit created nothing —
  // a silent non-series, and the exact opposite of what the disclosure's own
  // control says in that state ("Pick a start date and this becomes a standing
  // weekly meetup").
  const weekday = everyWeekdayLabel(weekdayFromDateIso(values.startDate))
  if (options.repeatsWeekly === true && weekday !== '') {
    // The weekday words come from the SAME seam the control renders
    // ("every Saturday"), derived from the chosen start date — never typed.
    lines.push(`Repeats ${weekday} — ${SUMMARY_REPEATS_SUFFIX}`)
  }
  return lines
}

/**
 * V27 slice 1 — the sticky Post bar's ONE-LINE read-back ("Sat, Aug 29 ·
 * 3:30 PM · Green Lake Park"). The bar pins this line above the bottom nav on
 * /new so the plan is always legible while the parent scrolls the form.
 *
 * The words are the SAME seams the rest of the app reads the plan back with:
 * `feed.formatStartDayLabel` (the day words the summary and the feed use) and
 * `feed.formatTimeLabel` (the stepper's own "3:30 PM"). Nothing is recomputed
 * here, so the bar cannot promise one time while the form writes another.
 *
 * ONE LINE, not the full `postSummaryLines`: the bar has a phone's width and a
 * button beside it. The three facts a parent glancing up needs are the day,
 * the start and the place — the duration and the address stay on the form.
 *
 * The empty states are the read-back's own: an unanswered date is simply
 * dropped (the filter below — the time seam always yields a label, so the line
 * never dangles a separator), and an unanswered place reads "Add a place",
 * which is the bar's gently-worded prompt rather than the form's
 * `SUMMARY_NO_PLACE` ("no place picked"). A line with nothing at all falls
 * back to "Add a place" too — one honest instruction, never an empty bar.
 *
 * `values.place` is TRIMMED but NOT alias-stripped: this is the bar's read-back
 * of the field as the parent is typing it, and the field is never rewritten
 * while they type (the `@` alias is dropped on the way to the database by the
 * submit, not by a read-back).
 */
export function stickyPostLine(values: PlaydateFormValues): string {
  const place = values.place.trim()
  const parts = [
    formatStartDayLabel(values.startDate),
    formatTimeLabel(values.startMinutes),
    place === '' ? 'Add a place' : place,
  ].filter((part) => part !== '')
  return parts.length === 0 ? 'Add a place' : parts.join(' · ')
}

/**
 * V27 slice 3 — the trust line the /new privacy preview carries, VERBATIM. It
 * is a fixed promise, not a computed claim: the block appears at the point of
 * posting and says who can see the post without inventing a radius or a number
 * (`/new` does not load the profile's radius — plan.md Risks).
 */
export const PRIVACY_PREVIEW_NOTE =
  'Only nearby parents can see this. Kids show as first name + age.'

/**
 * V27 slice 3 — what /new's PRIVACY PREVIEW says, as one line plus the fixed
 * trust note.
 *
 * The preview is the compact "here is what the world will see" read-back, in
 * the order a parent scans it: WHO (the selected kids, each already in
 * `kidLabel` form — first name + age, the one seam every kid label goes
 * through), WHERE (the place as typed), then WHEN (the day and the start). The
 * same two formatters the rest of the app reads a plan back with
 * (`formatStartDayLabel`, `formatTimeLabel`) are reused, so the preview cannot
 * disagree with the summary or the sticky bar.
 *
 * The empty states are the sticky bar's, deliberately: an unanswered place
 * reads "Add a place" (the gentle prompt, not the form's "no place picked"),
 * kids with nothing selected drop out entirely rather than leaving a dangling
 * separator, and an unanswered date is dropped the same way. A preview with
 * nothing at all — no kids, no day, and (impossibly, since the place slot
 * always yields a word) no place — still says "Add a place" rather than an
 * empty line, so the block never renders blank.
 *
 * `kidLabels` arrives pre-formatted (the page derives them from the selected
 * kids) so this seam stays pure and knows nothing about the kids table.
 */
export function privacyPreview(
  values: PlaydateFormValues,
  kidLabels: readonly string[],
): { preview: string; note: string } {
  const place = values.place.trim()
  const parts = [
    kidLabels.join(', '),
    place === '' ? 'Add a place' : place,
    formatStartDayLabel(values.startDate),
    formatTimeLabel(values.startMinutes),
  ].filter((part) => part !== '')
  return {
    preview: parts.length === 0 ? 'Add a place' : parts.join(' · '),
    note: PRIVACY_PREVIEW_NOTE,
  }
}
