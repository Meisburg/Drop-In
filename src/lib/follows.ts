/**
 * V8 ticket 09 — loop-closing: the PURE seams (migration 0033).
 *
 * No I/O and no globals beyond the imported pure formatters (the
 * `series.ts` / `places.ts` discipline: its only imports are themselves
 * pure, so the feed page, the detail page, /u/:handle, /place/:id, /profile
 * and the e2e spec all evaluate the SAME rules through this module, and
 * `follows.test.ts` is the guarantee).
 *
 * What a follow IS (the pinned decision, enforced by absence): a bookmark on
 * a family or on a place — never a friend request, and never a score ON A
 * FOLLOW. There is no mutual-friend seam here, no reciprocal flag: the only
 * things this module can compute are "is this target well-formed", "how many
 * families you've bookmarked are going", and "when is that series' next
 * meetup". Ratings DO exist in the app — parents rate a place on its own
 * reviews table (migration 0052) — but a rating is a separate object with its
 * own rules; saving a place says nothing about how it rates, and this module
 * never computes one. `validateFollowTarget` mirrors the DB's
 * `follows_one_target_check` exactly — the CHECK is the wall, this is the
 * client's copy of the same rule so a bad target never reaches the wire.
 */
import { formatDayLabel, formatTimeLabel } from './feed'

// ---------------------------------------------------------------------------
// The target: exactly one of a family or a place
// ---------------------------------------------------------------------------

/** A well-formed follow target (the exactly-one rule, resolved). */
export type FollowTarget =
  | { kind: 'family'; profileId: string }
  | { kind: 'place'; placeId: string }

/**
 * A candidate target as it arrives from a form/call site: both fields are
 * optional, and a blank string is treated as ABSENT (a trimmed-empty id is
 * not an id — the `validateHomeZip` shape).
 */
export interface FollowTargetInput {
  followeeProfileId?: string | null
  placeId?: string | null
}

/** Trimmed value, or null when it is missing/blank. */
function presentId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The exactly-one-target rule (the client twin of
 * `follows_one_target_check`, migration 0033): a follow targets EITHER a
 * family OR a place, never both, never neither. Returns a human-readable
 * refusal, or null when the target is well-formed (the house validator
 * shape — validateHomeZip / validateKid / validateBio all return
 * `string | null`).
 */
export function validateFollowTarget(input: FollowTargetInput): string | null {
  const profileId = presentId(input.followeeProfileId)
  const placeId = presentId(input.placeId)
  if (profileId !== null && placeId !== null) {
    return 'A follow is either a family or a place — not both.'
  }
  if (profileId === null && placeId === null) {
    return 'Pick a family or a place to follow.'
  }
  return null
}

/** The snake_case `follows` fields the seams read (PostgREST's own names). */
export interface FollowRowLike {
  followee_profile_id?: string | null
  place_id?: string | null
}

/**
 * The resolved target of a stored `follows` row (snake_case, as PostgREST
 * returns it), or null when the row breaks the exactly-one rule. The row
 * cannot break it while the CHECK stands, so null here means the data
 * predates 0033 or the CHECK is missing: the Following list SKIPS such a row
 * rather than rendering a link it cannot resolve (a defensive read-side twin
 * of the validator, never a crash).
 */
export function followTargetOf(row: FollowRowLike): FollowTarget | null {
  const profileId = presentId(row.followee_profile_id)
  const placeId = presentId(row.place_id)
  if (validateFollowTarget({ followeeProfileId: profileId, placeId }) !== null) return null
  return profileId !== null
    ? { kind: 'family', profileId }
    : { kind: 'place', placeId: placeId as string }
}

/** The viewer's own follow targets, split by kind — the read-side aggregate. */
export interface MyFollowTargets {
  /** The family profile ids the viewer follows (the "met before" input). */
  followeeIds: ReadonlySet<string>
  /** The place ids the viewer follows. */
  placeIds: ReadonlySet<string>
}

/**
 * Split the viewer's own `follows` rows into the two id sets the UI needs:
 * `followeeIds` feeds `metBeforeLine`, `placeIds` tells /place/:id whether
 * the Follow control is pressed. Invalid rows (both/neither target) are
 * skipped — this never throws on data it cannot resolve.
 */
export function followTargetsFrom(rows: ReadonlyArray<FollowRowLike>): MyFollowTargets {
  const followeeIds = new Set<string>()
  const placeIds = new Set<string>()
  for (const row of rows) {
    const target = followTargetOf(row)
    if (target === null) continue
    if (target.kind === 'family') followeeIds.add(target.profileId)
    else placeIds.add(target.placeId)
  }
  return { followeeIds, placeIds }
}

// ---------------------------------------------------------------------------
// The card line: "N families you've met before are going"
// ---------------------------------------------------------------------------

/** One going ping, as far as the met-before line is concerned. */
export interface MetBeforePinger {
  profileId: string
}

/**
 * The card's met-before line: how many of THIS post's going families the
 * viewer has bookmarked. Returns null (the line is HIDDEN) when the count is
 * 0 — which covers "the viewer follows nobody", the ordinary case, so a
 * viewer who has never followed anyone sees exactly the card they see today.
 *
 * The count is over DISTINCT family ids (a pinger cannot ping one post
 * twice, but the line must not depend on that), and it counts families only:
 * a followed PLACE is not a family you have met, and the copy says so.
 *
 * Pluralisation is the pinned copy: "1 family you've met before is going" /
 * "2 families you've met before are going".
 */
export function metBeforeLine(
  goingPings: ReadonlyArray<MetBeforePinger>,
  followeeIds: ReadonlySet<string>,
): string | null {
  if (followeeIds.size === 0) return null
  const seen = new Set<string>()
  for (const ping of goingPings) {
    const profileId = presentId(ping.profileId)
    if (profileId === null) continue
    if (followeeIds.has(profileId)) seen.add(profileId)
  }
  const count = seen.size
  if (count === 0) return null
  return count === 1
    ? '1 family you’ve met before is going'
    : `${count} families you’ve met before are going`
}

/**
 * The /place/:id save line, through the 0033 SECDEF count (never a broad
 * read). Saving keeps a place on your shortlist so you can find it again —
 * that is the benefit this line states, and nothing more: no notification
 * promise. 0 is a state worth saying out loud, and the house empty-state
 * pattern names the PLACE rather than reporting a shortfall ("no one saves
 * this yet" invites the first save), in the same tone as `placeCommentCountLabel`
 * and `reviewRatingLine`. A blank name degrades to the "here" form so a place
 * row with no name cannot render "about ." — the caller still gets a usable
 * line.
 */
export function placeFollowerLine(count: number, placeName: string): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
  const name = placeName.trim()
  if (n === 0) {
    return name === ''
      ? 'No families have saved this place yet'
      : `No families have saved ${name} yet`
  }
  return n === 1
    ? `1 family has saved ${name === '' ? 'this place' : name}`
    : `${n} families have saved ${name === '' ? 'this place' : name}`
}

// ---------------------------------------------------------------------------
// "Same time next week": the ended-window gate and the next occurrence
// ---------------------------------------------------------------------------

/**
 * How long after a post ends the "Same time next week" affordance stays on
 * its page (the pinned 7 days). Older than that, the plan is stale and the
 * honest answer is to post a new one — the affordance is gone.
 */
export const ENDED_REWIND_DAYS = 7

/**
 * True when the post ended within the last `days` (default 7): the pinned
 * window for "Same time next week". `ends_at` in the future is NOT recently
 * ended (the post has not happened yet), and neither is one that ended long
 * ago — the boundary is inclusive at exactly `days`, and exactly at
 * `ends_at === nowIso` (that post has just ended, which is the whole point).
 * An unparseable instant is never "recently ended" (no invented action).
 */
export function endedWithinDays(
  post: { ends_at: string },
  nowIso: string,
  days: number = ENDED_REWIND_DAYS,
): boolean {
  const now = Date.parse(nowIso)
  const ends = Date.parse(post.ends_at)
  if (!Number.isFinite(now) || !Number.isFinite(ends)) return false
  const window = Math.max(0, days) * 24 * 60 * 60_000
  return ends <= now && now - ends <= window
}

/** The series rule as the chooser needs it (the 0028 row's `active` flag). */
export interface SeriesRuleLike {
  active: boolean
}

/** One occurrence row of a series (a REAL `playdates` row, 0028 pin (a)). */
export interface OccurrenceLike {
  id: string
  starts_at: string
  ends_at?: string | null
}

/**
 * The next occurrence of a series post, or the honest reason there is none.
 * `kind: 'occurrence'` carries the row to ping; `kind: 'none'` carries WHY,
 * because the two reasons need different copy and one of them ("stopped") is
 * something the host did on purpose:
 *  - 'stopped'  → the host turned repeating off (`active = false`) and no
 *                 week is posted ahead.
 *  - 'no-more'  → repeating is still on, but no future week has been
 *                 materialized (the 0028 horizon was never topped up).
 * In both cases the page says so and offers the /new prefill instead — NEVER
 * a dead one-tap control.
 */
export type NextOccurrencePlan =
  | { kind: 'occurrence'; id: string; startsAt: string }
  | { kind: 'none'; reason: 'stopped' | 'no-more' }

/**
 * Pick the series' next occurrence: the SOONEST sibling that has not ended
 * yet (`ends_at > now`, falling back to `starts_at > now` when a row carries
 * no end — the same "upcoming = not ended" boundary `partitionPostsByTime`
 * uses, so a meetup that is happening RIGHT NOW still counts as the next one:
 * you can walk to it). Ties and unordered input are handled by sorting.
 *
 * This is the pure chooser the detail page renders from; the page reads the
 * sibling rows (a plain `playdates` read filtered by `series_id`) and hands
 * them in, so the DB holds no occurrence-picking rule of its own.
 */
export function nextOccurrencePlan(
  series: SeriesRuleLike,
  occurrences: ReadonlyArray<OccurrenceLike>,
  nowIso: string,
): NextOccurrencePlan {
  const now = Date.parse(nowIso)
  if (Number.isFinite(now)) {
    const upcoming = occurrences
      .filter((occurrence) => {
        const ends =
          typeof occurrence.ends_at === 'string' && occurrence.ends_at !== ''
            ? Date.parse(occurrence.ends_at)
            : Number.NaN
        const starts = Date.parse(occurrence.starts_at)
        const boundary = Number.isFinite(ends) ? ends : starts
        return Number.isFinite(boundary) && boundary > now
      })
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    const next = upcoming[0]
    if (next !== undefined) {
      return { kind: 'occurrence', id: next.id, startsAt: next.starts_at }
    }
  }
  return { kind: 'none', reason: series.active ? 'no-more' : 'stopped' }
}

// ---------------------------------------------------------------------------
// The save toggle: the pure decision (the caller executes it)
// ---------------------------------------------------------------------------

/** What a place-save toggle should do, decided purely (the caller executes it). */
export type SaveToggleDecision = 'save' | 'unsave'

/**
 * The pure decision for toggling a viewer's SAVE of a place (the shortlist
 * bookmark — never a subscription, so no notification preference exists to
 * decide over): already saved → remove the row ('unsave'), not saved → add
 * the row ('save').
 *
 * Signature kept minimal on purpose: unlike `planPing` there is no host/no-op
 * guard here — a place has no owner whose own toggle must be refused, and a
 * malformed target is the validator's job (`validateFollowTarget`), never the
 * decision's. So the only input that can change the decision is whether the
 * viewer currently saves the place; the function is total over every boolean
 * (no throw, no undefined). The caller reads its own follow rows
 * (`followTargetsFrom`) and executes the decision through db.toggleFollowPlace.
 */
export function planSaveToggle(currentlySaved: boolean): SaveToggleDecision {
  return currentlySaved ? 'unsave' : 'save'
}

/**
 * V25 t08 — THE ONE SET RULE THE HEARTS SURFACES SHARE.
 *
 * The saved set (`followedPlaceIds`) is what the bookmark controls read AND what
 * the Saved filter narrows the directory by, on both surfaces that show it
 * (/browse and the /new picker sheet). Each host moves that set through this
 * function, so the collection can never disagree with the bookmark that produced
 * it; if each host hand-rolled the set arithmetic, a rollback on one surface
 * could restore a set the other had already moved on from.
 *
 * THE TWO HOSTS APPLY IT AT DIFFERENT MOMENTS, FROM DIFFERENT SOURCES, and that
 * difference is deliberate — this function takes the decision as a plain value
 * and does not care which produced it:
 *
 *   * `BrowsePage.handleTogglePlaceFollow` (the card's own heart) applies it
 *     OPTIMISTICALLY, BEFORE the write: the decision is derived from the LOCAL
 *     set (`planSaveToggle(followedPlaceIds.has(placeId))`), the set flips so
 *     the card moves on tap, and a REJECTED write applies the inverse decision
 *     to roll back. It never reads `toggleFollowPlace`'s return value — on
 *     success the optimistic flip is already the final state.
 *   * `NewPlaydatePage.handleTogglePickerSave` (the sheet's heart) applies it
 *     AFTER the write, from the WRITE'S OWN boolean (`nowSaved`), with NO
 *     pre-flip and no `planSaveToggle` call: the sheet's entire Saved list is
 *     derived from this set, so flipping first would add and then remove a row
 *     on a rejected write, which reads as a flicker rather than as a failure. A
 *     rejected write leaves the set untouched.
 *
 * The result is a NEW set — the input is never mutated, because React state must
 * change identity to re-render (both hosts call this inside a functional
 * updater).
 */
export function savedPlaceIdSetAfterToggle(
  savedPlaceIds: ReadonlySet<string>,
  placeId: string,
  decision: SaveToggleDecision,
): Set<string> {
  const next = new Set(savedPlaceIds)
  if (decision === 'save') next.add(placeId)
  else next.delete(placeId)
  return next
}

/**
 * "Sat, Sep 19 · 10:00 AM" — one occurrence said back as a day and a time
 * (the confirmation line's and the button's hint). Built from the existing
 * pure formatters (feed.formatDayLabel / feed.formatTimeLabel) so the app
 * never grows a second time-formatting rule. '' for an unparseable instant
 * (the caller then omits the line rather than printing "Invalid Date").
 */
export function occurrenceWhenLabel(startsAt: string, nowIso: string): string {
  const ms = Date.parse(startsAt)
  if (!Number.isFinite(ms)) return ''
  const date = new Date(ms)
  return `${formatDayLabel(startsAt, nowIso)} · ${formatTimeLabel(
    date.getHours() * 60 + date.getMinutes(),
  )}`
}
