/**
 * THE PROFILE'S PAST LIST — the pure decisions behind the archive rows
 * (`.scratch/profile-archive/spec.md`, 2026-10-05).
 *
 * WHY THIS MODULE EXISTS. The profile's Past section rendered the same
 * `DropInCard` the feed uses, up to the fetch's cap, and then ended in a DEAD
 * paragraph: "+N older". Measured before this slice: ~50 cards ≈ 5548px of
 * scroll, and the tail promised rows nothing in the app could reach. The
 * spec's three defects: (1) a cap with no door, (2) history wearing the card
 * of an invitation, (3) no anchors in a flat run.
 *
 * The render (`ProfileView`'s Past section) is now a bounded page of compact
 * rows plus one real control, and every decision in that sentence lives HERE,
 * pure and tested:
 *
 *   - how many rows the first paint shows and what the next page adds
 *     (`PAST_FIRST_PAGE`, `PAST_PAGE_SIZE`, `nextPastVisible`);
 *   - the tail button's label, and that there is NO button when nothing is
 *     left (`showMoreLabel` — the empty button is the AC-5 failure);
 *   - the month headings with their counts once the list is long enough to
 *     need anchors (`pastMonthGroups`, `PAST_MONTH_HEADING_MIN`);
 *   - the honest line for the rows even the raised fetch cannot reach
 *     (`olderPastNote` — the brief's "never silently drop the remainder").
 *
 * The dates' calendar words are NOT re-derived here: the month key and its
 * label come from feed's own `localMonthKey` / `formatMonthLabel`, which share
 * `formatDayLabel`'s MONTHS_SHORT table (the one-copy rule — a second month
 * table is a second way to spell September).
 *
 * NOT THIS MODULE'S JOB: fetching (`db.listPostsByHost`) and the Upcoming /
 * Past split (`feed.partitionPostsByTime`). This module is handed the past
 * rows already in hand, in the order the split put them (most recent first).
 */
import { formatMonthLabel, localMonthKey } from './feed'

/**
 * The rows the Past list shows on first paint (the spec's "render the 5 most
 * recent"). The cap is deliberately small: the founder's complaint was a page
 * that "scrolls forever", so the first paint is finite on a phone screen.
 */
export const PAST_FIRST_PAGE = 5

/**
 * The rows each "Show more" tap adds (the spec's 5, then +20). One page size,
 * one place to change it: the label and the slicing both read this.
 */
export const PAST_PAGE_SIZE = 20

/**
 * The past-row count at which month headings earn their space (the spec's
 * "more than ~15"). Strictly more than this — 15 rows is still short enough to
 * read as one run, so the first paint of a host with 15 past drop-ins carries
 * no headings and no extra chrome.
 *
 * It is judged on the ARCHIVE (`past.length`, the rows the fetch returned),
 * not on the rows currently visible: a host with 30 past drop-ins learns the
 * month they are looking at on first paint, rather than only after the list
 * has already scrolled.
 */
export const PAST_MONTH_HEADING_MIN = 15

/**
 * One month's slice of the Past list, ready to render: its key ("2026-09"),
 * its heading label ("Sep 2026") and the rows under it.
 *
 * `label` is null for the SINGLE group a short (ungrouped) list renders — the
 * render then emits no heading at all, which is how "a host with exactly 5
 * renders as today" survives the grouping code path. It is also null for rows
 * whose `starts_at` no longer parses: a heading the app cannot name is not
 * invented (`localMonthKey` / `formatMonthLabel` answer '' for garbage, the
 * same answer `formatStartDayLabel` gives an unparseable date), while the rows
 * themselves still render — the archive never drops a row to tidy a heading.
 */
export interface PastMonthGroup<T> {
  key: string
  label: string | null
  /** How many of THIS group's rows are being rendered. */
  count: number
  rows: T[]
}

/** Everything the Past section renders, decided in one pure call. */
export interface PastArchivePlan<T> {
  /**
   * Always at least one group (an empty list yields one empty group, and the
   * caller's `past.length > 0` gate means it renders nothing). A short list is
   * ONE group with a null label; a long one is one group per month.
   */
  groups: PastMonthGroup<T>[]
  /** The "Show N more" button's label, or null when nothing is left to show. */
  showMore: string | null
  /** The honest line about rows beyond the fetch, or null when there are none. */
  olderNote: string | null
}

/**
 * How many rows the next "Show more" tap reveals: the current page plus one
 * page, never past the end (a list of 25 asked for 20 more shows 25, and the
 * button then disappears — the label's own arithmetic is `showMoreLabel`'s).
 *
 * `visible` is the CALLER's state and is trusted to be sane here: the plan
 * clamps it against the rows in hand, so a stale state (a shorter profile
 * swapping in under a larger one) renders the shorter list rather than an
 * empty one.
 */
export function nextPastVisible(visible: number, total: number): number {
  return Math.min(visible + PAST_PAGE_SIZE, total)
}

/**
 * The tail control's label, or NULL when there is nothing more to show — the
 * one decision that keeps an empty button off a host with exactly 5 past
 * drop-ins (AC 5) and retires the control once the last page is in view (AC 2).
 *
 * The count is CLAMPED to what is left ("Show 7 more", never "Show 20 more"
 * over 7 rows): a control that promises more than it can deliver is the exact
 * defect this slice exists to remove, and the dead "+N older" was that promise
 * made in text instead of in a button. (Photos and Mail always name the batch
 * size because their stores are effectively unbounded; here the whole archive
 * is bounded and in hand, so the honest number is the one that exists.)
 */
export function showMoreLabel(visible: number, total: number): string | null {
  if (visible >= total) return null
  return `Show ${Math.min(PAST_PAGE_SIZE, total - visible)} more`
}

/**
 * The honest line for past rows BEYOND the fetch's cap, or null when the fetch
 * reached the end of the archive.
 *
 * THE CAP IS TWO NUMBERS, and this is the second: `HOST_POSTS_LIMIT` (raised
 * to 200 by this slice — brief §1 option A) is what the fetch reads, and
 * `olderCount` is the rows beyond it, which no column, query or door reaches
 * today. "Show N more" pages only the rows in hand, so this line must not
 * promise them: it NAMES the limit and states plainly that the older rows are
 * not listed here. The old "+N older" text was the same fact phrased as a
 * dangling promise, which is why the spec calls it a dead end.
 *
 * Singular/plural is spelled out because the line is the only place the number
 * meets a verb ("1 older drop-in is", "3 older drop-ins are").
 */
export function olderPastNote(olderCount: number, fetchLimit: number): string | null {
  if (olderCount <= 0) return null
  const older =
    olderCount === 1 ? '1 older drop-in is' : `${olderCount} older drop-ins are`
  return `Showing your ${fetchLimit} most recent past drop-ins — ${older} not listed here.`
}

/**
 * The visible rows grouped into months, in the order their FIRST row appears
 * (the caller's rows are most-recent-first, so the groups descend through the
 * calendar), with each group carrying the count of the rows it actually holds.
 *
 * COUNT = ROWS UNDER THE HEADING, deliberately, not every row of that month in
 * hand: the heading labels the rows beneath it, and a heading saying "Sep 2026
 * · 12" over 5 rendered rows reads as 7 missing rows. As the reader pages, the
 * count grows with the rows it names. (The rows in hand are the whole visible
 * page, never the archive: a month whose rows are all still behind the button
 * gets no heading, because a heading with nothing under it is not an anchor.)
 *
 * The label comes from feed's `formatMonthLabel` (the app's one month table),
 * and an unparseable `starts_at` yields a null label — see PastMonthGroup.
 */
export function pastMonthGroups<T extends { starts_at: string }>(
  rows: readonly T[],
): PastMonthGroup<T>[] {
  const groups = new Map<string, PastMonthGroup<T>>()
  for (const row of rows) {
    const key = localMonthKey(row.starts_at)
    const existing = groups.get(key)
    if (existing === undefined) {
      const label = formatMonthLabel(row.starts_at)
      groups.set(key, {
        key,
        label: label === '' ? null : label,
        count: 1,
        rows: [row],
      })
    } else {
      existing.rows.push(row)
      existing.count += 1
    }
  }
  return [...groups.values()]
}

/**
 * The whole Past section's render, decided purely from what the page has:
 * the rows in hand (most recent first), how many the reader has paged to, the
 * fetch's beyond-the-cap count and the cap itself.
 *
 * The caller executes: it renders `groups` (skipping a null label), the
 * `showMore` button (its click runs `nextPastVisible`), and the `olderNote`.
 */
export function planPastArchive<T extends { starts_at: string }>(
  past: readonly T[],
  visible: number,
  olderCount: number,
  fetchLimit: number,
): PastArchivePlan<T> {
  const rows = past.slice(0, Math.max(0, visible))
  const groups =
    past.length > PAST_MONTH_HEADING_MIN
      ? pastMonthGroups(rows)
      : [{ key: 'all', label: null, count: rows.length, rows: [...rows] }]
  return {
    groups,
    showMore: showMoreLabel(rows.length, past.length),
    olderNote: olderPastNote(olderCount, fetchLimit),
  }
}
