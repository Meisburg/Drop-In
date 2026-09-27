/**
 * The REVIEW-PROMPT SCAN decision (V26 slice 2) — PURE. No I/O, no client, no
 * clock, no `Deno.env`, no `import.meta.env`.
 *
 * Two runtimes import this one file:
 *
 *   supabase/functions/send-push/index.ts   the sender, whose every-5-minutes
 *                                           catch-up scan will ask this module
 *                                           "is this finished drop-in a
 *                                           candidate?" (slice 3 wires it)
 *   src/lib/reviewScan.ts                   the app's re-export seam, which is
 *                                           what the vitest spec imports
 *
 * It lives under `supabase/functions/_shared/` for the same reason
 * `emailFallback.ts`, `emailCopy.ts` and `pushCopy.ts` do: that is the layout
 * the Supabase CLI bundles for a deployed function (a relative import that
 * escapes `supabase/` is not something the deploy step promises), and the app
 * can import INTO it at no cost. Same pairing as `src/lib/push.ts` ↔
 * `pushCopy.ts`.
 *
 * WHY THIS IS A MODULE AND NOT FIVE LINES OF `if` INSIDE THE SCAN. The scan
 * runs in a Deno Edge Function against live Postgres through a service-role
 * client; it cannot be unit-tested. The one decision that MUST be right — who
 * gets asked to rate a place — is therefore extracted here, where vitest pins
 * it, and the Deno function is left with nothing but the query and the upsert.
 *
 * `now` IS AN ARGUMENT, NEVER `Date.now()`. A clock read inside a rule makes the
 * rule untestable: the same facts would answer differently depending on when the
 * test ran, and the window boundary ("exactly 24 hours ago") could never be
 * asserted at all. The caller reads the clock once and hands it over.
 *
 * THE SIX RULES, in order. Each one is a rejection, and each is mutation-checked
 * by `src/lib/reviewScan.test.ts` (flip any one of them to always-true and at
 * least one named test fails):
 *
 *  a. `status !== 'on'`            → NOT a candidate. `cancelled` means the host
 *                                    called it off, and `ended` means the host
 *                                    ended it early (migration 0041) — the
 *                                    "don't drive to an empty park" kinds. A
 *                                    parent who was told not to go is never asked
 *                                    how it was. Nothing sets `'ended'`
 *                                    automatically, so a drop-in that simply
 *                                    expired keeps `status = 'on'` forever —
 *                                    which is why (d)+(e), not the status, are
 *                                    how "it's over" is expressed.
 *  b. blank `placeId`              → NOT a candidate. `playdates.place_id` is
 *                                    nullable BY DESIGN: most drop-ins are at a
 *                                    typed address with no directory place, and
 *                                    a home drop-in has no place to attach
 *                                    stars to. Blankness is decided on the
 *                                    TRIMMED value, the same rule
 *                                    `pushCopy.ts` applies — `'   '` is not an
 *                                    id.
 *  c. unparseable/absent `endsAt`  → NOT a candidate. "Finished" needs a real
 *                                    end instant; a null, empty or garbage
 *                                    timestamp is not one. (Without this branch
 *                                    `NaN` would fall through every comparison
 *                                    below and be read as a candidate.)
 *  d. `endsAt` in the future       → NOT a candidate. The drop-in has not
 *                                    happened yet; `starting_soon` owns that
 *                                    moment. Exactly-now counts as not-yet-over,
 *                                    so the boundary is strictly `>=`.
 *  e. `endsAt` older than the
 *     window                       → NOT a candidate. The window keeps the
 *                                    every-5-minutes query bounded: without it
 *                                    the scan walks all history forever. It
 *                                    governs which drop-ins are CONSIDERED, not
 *                                    how long a parent has to act — the row,
 *                                    once inserted, is never withdrawn.
 *  f. `alreadyReviewed` is true     → NOT a candidate. A parent who already rated
 *                                    this place is never asked twice — `reviews`
 *                                    is one row per (place_id, author_profile_id)
 *                                    (0052), the same record the place page
 *                                    writes, so a prompt here asks them to edit a
 *                                    review they already left.
 *
 * THE PAYLOAD IS NOT RE-SPELLED HERE. Title, body and url all come from
 * `buildNotificationPayload` in `./pushCopy.ts`, which is the one place the copy
 * lives and which keeps `reviewPromptUrl` the single source of
 * `/place/<placeId>/details`. This module decides WHO and WHICH ROW SHAPE; it
 * never re-decides the words.
 */
import { buildNotificationPayload } from './pushCopy.ts'

/**
 * Only drop-ins that ended within this many hours are considered. Exported (and
 * re-exported through `src/lib/reviewScan.ts`) because it is a RULE, not wiring:
 * slice 3's `send-push` imports it for its query bound, and the vitest lane
 * needs to reach the same number to test the boundary.
 */
export const REVIEW_PROMPT_WINDOW_HOURS = 24

/** Every fact the candidate decision needs — all injected. */
export interface ReviewPromptFacts {
  /** `playdates.status` as read. Only the exact string `'on'` is promotable. */
  status: string | null | undefined
  /** `playdates.ends_at` as read, ISO-8601, or null/absent/blank. */
  endsAt: string | null | undefined
  /** `playdates.place_id` as read. Nullable by design (see rule b). */
  placeId: string | null | undefined
  /**
   * Whether THIS parent already has a `reviews` row for THIS drop-in's place
   * (the `(place_id, author_profile_id)` PK pair from migration 0052).
   */
  alreadyReviewed: boolean
}

/**
 * Whether a finished, place-backed drop-in is a candidate for a review prompt.
 * Pure and total: any input, including garbage, gets an answer and reads nothing
 * outside its two arguments.
 *
 * The caller has ALREADY established that this parent said they were going
 * (`going_pings` is the scan's source of truth for who is asked) and that no
 * `review_due` row exists for them yet — dedupe is the database's unique key,
 * never this function's job.
 */
export function isReviewPromptCandidate(facts: ReviewPromptFacts, now: Date): boolean {
  // (a) Only a drop-in that is still 'on' ever finished naturally. 'cancelled'
  // and 'ended' are the host's "don't head out" signals — never promotable.
  if (facts.status !== 'on') return false

  // (b) No place, no prompt. Trimmed, so whitespace is the same as none.
  const placeId = (facts.placeId ?? '').trim()
  if (placeId === '') return false

  // (c) A real end instant is required. Date.parse answers NaN for '', null-ish
  // input and anything unparseable, and that must not be read as "long ago".
  const endedAtMs = Date.parse(facts.endsAt ?? '')
  if (!Number.isFinite(endedAtMs)) return false

  const nowMs = now.getTime()

  // (d) Still running (or starting): not over yet.
  if (endedAtMs >= nowMs) return false

  // (e) Ended too long ago to be worth asking about. `>` is deliberate: exactly
  // REVIEW_PROMPT_WINDOW_HOURS ago is still inside the window.
  const windowMs = REVIEW_PROMPT_WINDOW_HOURS * 60 * 60 * 1000
  if (nowMs - endedAtMs > windowMs) return false

  // (f) A parent who already rated this place is never asked twice: `reviews` is
  // one row per (place_id, author_profile_id) (0052), the same record the place
  // page writes, so a prompt here asks them to edit a review they already left.
  if (facts.alreadyReviewed) return false

  return true
}

/** The already-fetched values one `notification_log` row is built from. */
export interface ReviewPromptInput {
  /** The parent who pinged — the row's recipient. */
  profileId: string
  /** The drop-in that finished — half of the dedupe key. */
  playdateId: string
  /** The place to rate; the url's subject. Nullable, see rule (b). */
  placeId: string | null | undefined
  /** The drop-in's title, as a subject for the copy; null/blank falls back. */
  title: string | null
}

/**
 * One `notification_log` insert row, exactly the shape `catchUpStartingSoon`
 * already upserts: the dedupe key columns plus the payload's title/body/url.
 * `kind` is the literal `'review_due'` — never a variable, so the row cannot be
 * filed under a neighbouring kind.
 */
export interface ReviewPromptRow {
  profile_id: string
  kind: 'review_due'
  playdate_id: string
  title: string
  body: string
  url: string
}

/**
 * Map already-fetched values to the `notification_log` insert shape. Pure: the
 * caller does the reads and the insert.
 *
 * It is deliberately TOTAL rather than defensive — it does not re-run
 * `isReviewPromptCandidate`, because a second copy of the rule is a second thing
 * to keep true. The candidate predicate is the guard; this mapper only formats.
 * That is why a blank `placeId` here is not an error: `buildNotificationPayload`
 * already falls back to the drop-in route rather than emitting
 * `/place//details`, and the row's url stays the one pinned by `pushCopy.ts`.
 */
export function reviewPromptRow(input: ReviewPromptInput): ReviewPromptRow {
  const payload = buildNotificationPayload({
    kind: 'review_due',
    playdateId: input.playdateId,
    postTitle: input.title,
    placeId: input.placeId,
  })
  return {
    profile_id: input.profileId,
    kind: 'review_due',
    playdate_id: input.playdateId,
    ...payload,
  }
}
