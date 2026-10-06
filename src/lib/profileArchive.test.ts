/**
 * Unit tests for the profile archive's pure decisions
 * (src/lib/profileArchive.ts — `.scratch/profile-archive/spec.md`).
 *
 * WHAT THIS FILE PINS, and why each one is an acceptance criterion rather than
 * a line count:
 *
 *   - the FIRST PAGE is 5 rows for an archive longer than 5 (AC 1), all of them
 *     for a shorter one, and the page grows by 20 (the spec's "5, then +20");
 *   - the tail control EXISTS while rows remain, says how many it will add, and
 *     is NULL when nothing is left — so a host with exactly 5 past drop-ins
 *     gets no empty button and no extra chrome (AC 2, AC 5);
 *   - the dead "+N older" paragraph is gone, replaced by a line that names the
 *     fetch's cap and says the older rows are NOT listed here (the brief's
 *     "never silently drop the remainder");
 *   - month headings appear only once the archive is longer than ~15 rows, with
 *     the count of the rows actually beneath each heading (AC 6).
 *
 * The month words themselves are feed's (`localMonthKey` / `formatMonthLabel`),
 * tested where they live (feed.test.ts); here they are asserted only as they
 * appear in a group.
 */
import { describe, expect, it } from 'vitest'
import {
  PAST_FIRST_PAGE,
  PAST_MONTH_HEADING_MIN,
  PAST_PAGE_SIZE,
  nextPastVisible,
  olderPastNote,
  pastMonthGroups,
  planPastArchive,
  showMoreLabel,
} from './profileArchive'

/** A minimal past row: the archive only ever reads `starts_at` (and passes rows through). */
function row(id: string, startsAt: string, overrides: Record<string, unknown> = {}) {
  return { id, starts_at: startsAt, ends_at: startsAt, title: `drop-in ${id}`, ...overrides }
}

/** `n` past rows, most recent first, one day apart from 2026-09-30 backwards. */
function rowsEndingAt(n: number, lastDay = '2026-09-30'): ReturnType<typeof row>[] {
  const end = Date.parse(`${lastDay}T12:00:00Z`)
  return Array.from({ length: n }, (_, i) =>
    row(`p${i}`, new Date(end - i * 86_400_000).toISOString()),
  )
}

/** The archive plan for `n` past rows with the reader on the first page. */
function planFor(n: number, olderCount = 0, fetchLimit = 200) {
  const past = rowsEndingAt(n)
  return planPastArchive(past, PAST_FIRST_PAGE, olderCount, fetchLimit)
}

describe('planPastArchive — the first page (AC 1)', () => {
  it('renders exactly the first 5 rows of a longer archive, and offers the rest', () => {
    const plan = planFor(25)
    const rendered = plan.groups.flatMap((g) => g.rows)
    expect(rendered).toHaveLength(PAST_FIRST_PAGE)
    expect(rendered.map((r) => r.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
    expect(plan.showMore).toBe('Show 20 more')
  })

  it('renders every row when the archive is shorter than the first page', () => {
    const plan = planFor(3)
    expect(plan.groups.flatMap((g) => g.rows).map((r) => r.id)).toEqual(['p0', 'p1', 'p2'])
    expect(plan.showMore).toBeNull()
  })

  it('never mutates the caller’s rows', () => {
    const past = rowsEndingAt(6)
    const before = past.map((r) => r.id)
    planPastArchive(past, 5, 0, 200)
    expect(past.map((r) => r.id)).toEqual(before)
  })
})

describe('planPastArchive — zero chrome at the boundaries (AC 5)', () => {
  it('a host with no past drop-ins gets no button and no tail line', () => {
    const plan = planPastArchive([], PAST_FIRST_PAGE, 0, 200)
    expect(plan.groups.flatMap((g) => g.rows)).toEqual([])
    expect(plan.showMore).toBeNull()
    expect(plan.olderNote).toBeNull()
  })

  it('a host with exactly 5 past drop-ins gets all 5 rows and NO empty button', () => {
    const plan = planFor(5)
    expect(plan.groups.flatMap((g) => g.rows)).toHaveLength(5)
    expect(plan.showMore).toBeNull()
    expect(plan.olderNote).toBeNull()
    // A 5-row archive is short: one flat group with no heading (the render
    // emits no month chrome at all).
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0].label).toBeNull()
  })

  it('a stale page state larger than the list renders the list, not an empty page', () => {
    const plan = planPastArchive(rowsEndingAt(4), 20, 0, 200)
    expect(plan.groups.flatMap((g) => g.rows)).toHaveLength(4)
    expect(plan.showMore).toBeNull()
  })
})

describe('nextPastVisible — 5, then +20 (the spec’s page size)', () => {
  it('adds one page', () => {
    expect(nextPastVisible(PAST_FIRST_PAGE, 100)).toBe(PAST_FIRST_PAGE + PAST_PAGE_SIZE)
    expect(nextPastVisible(25, 100)).toBe(45)
  })

  it('never runs past the end of the rows in hand', () => {
    expect(nextPastVisible(5, 25)).toBe(25)
    expect(nextPastVisible(20, 6)).toBe(6)
    expect(nextPastVisible(0, 0)).toBe(0)
  })

  it('is the page size the module exports', () => {
    expect(PAST_PAGE_SIZE).toBe(20)
    expect(PAST_FIRST_PAGE).toBe(5)
  })
})

describe('showMoreLabel — the control’s own arithmetic (AC 2)', () => {
  it('names the rows it will actually add, never a batch it cannot deliver', () => {
    expect(showMoreLabel(5, 25)).toBe('Show 20 more')
    expect(showMoreLabel(5, 6)).toBe('Show 1 more')
    expect(showMoreLabel(0, 3)).toBe('Show 3 more')
  })

  it('is null when nothing is left — no button at the end, none at exactly 5', () => {
    expect(showMoreLabel(5, 5)).toBeNull()
    expect(showMoreLabel(25, 25)).toBeNull()
    expect(showMoreLabel(6, 5)).toBeNull()
    expect(showMoreLabel(0, 0)).toBeNull()
  })
})

describe('paging through the whole archive', () => {
  it('reaches the last row, then retires the button and keeps the groups honest', () => {
    const past = rowsEndingAt(25)
    const first = planPastArchive(past, PAST_FIRST_PAGE, 0, 200)
    const second = planPastArchive(past, nextPastVisible(PAST_FIRST_PAGE, past.length), 0, 200)

    expect(first.showMore).toBe('Show 20 more')
    expect(second.groups.flatMap((g) => g.rows)).toHaveLength(25)
    expect(second.showMore).toBeNull()
    // Counts describe the rows under the headings, so they now account for
    // every row in the archive.
    expect(second.groups.reduce((sum, g) => sum + g.count, 0)).toBe(25)
  })
})

describe('pastMonthGroups — anchors with counts (AC 6)', () => {
  it('groups by local calendar month, in the order the rows arrive', () => {
    const rows = [
      ...rowsEndingAt(2, '2026-09-30'), // Sep 30, Sep 29
      ...rowsEndingAt(2, '2026-08-20').map((r) => row(`a${r.id}`, r.starts_at)), // Aug 20, Aug 19
      ...rowsEndingAt(1, '2026-07-04').map((r) => row(`b${r.id}`, r.starts_at)), // Jul 4
    ]
    const groups = pastMonthGroups(rows)
    expect(groups.map((g) => g.label)).toEqual(['Sep 2026', 'Aug 2026', 'Jul 2026'])
    expect(groups.map((g) => g.key)).toEqual(['2026-09', '2026-08', '2026-07'])
    expect(groups.map((g) => g.count)).toEqual([2, 2, 1])
    expect(groups[0].rows.map((r) => r.id)).toEqual(['p0', 'p1'])
  })

  it('counts the rows it holds, and adds to a month as the reader pages into it', () => {
    const past = rowsEndingAt(25)
    const first = planPastArchive(past, PAST_FIRST_PAGE, 0, 200)
    expect(first.groups).toHaveLength(1)
    const [september] = first.groups
    expect(september.label).toBe('Sep 2026')
    // 5 of September's 25 rows are rendered, so the heading says 5 — it labels
    // the rows beneath it, not rows still behind the button.
    expect(september.count).toBe(5)

    const second = planPastArchive(past, 25, 0, 200)
    expect(second.groups).toHaveLength(1)
    expect(second.groups[0].count).toBe(25)
    expect(second.groups[0].rows).toHaveLength(25)
  })

  it('emits no heading for a row whose date no longer parses — and drops no row over it', () => {
    const rows = [row('good', '2026-09-30T12:00:00Z'), row('bad', 'not-a-date')]
    const groups = pastMonthGroups(rows)
    expect(groups.map((g) => g.label)).toEqual(['Sep 2026', null])
    expect(groups.flatMap((g) => g.rows).map((r) => r.id)).toEqual(['good', 'bad'])
  })

  it('a short archive is ONE ungrouped group, so no months render before ~15 rows', () => {
    for (const n of [PAST_MONTH_HEADING_MIN - 1, PAST_MONTH_HEADING_MIN]) {
      // The reader has paged to the end of a short archive: every row renders
      // flat — one group, no heading, no month chrome.
      const plan = planPastArchive(rowsEndingAt(n), n, 0, 200)
      expect(plan.groups).toHaveLength(1)
      expect(plan.groups[0].label).toBeNull()
      expect(plan.groups[0].rows).toHaveLength(n)
    }
  })

  it('a longer archive groups at first paint, from the count the fetch returned', () => {
    const plan = planFor(PAST_MONTH_HEADING_MIN + 1)
    expect(plan.groups.flatMap((g) => g.rows)).toHaveLength(PAST_FIRST_PAGE)
    expect(plan.groups[0].label).toBe('Sep 2026')
    expect(plan.groups[0].count).toBe(PAST_FIRST_PAGE)
  })

  it('keeps the caller’s rows in the order they arrived inside a group', () => {
    const rows = [
      row('newest', '2026-09-30T18:00:00Z'),
      row('middle', '2026-09-12T18:00:00Z'),
      row('oldest', '2026-09-01T18:00:00Z'),
    ]
    expect(pastMonthGroups(rows)[0].rows.map((r) => r.id)).toEqual(['newest', 'middle', 'oldest'])
  })
})

describe('olderPastNote — the rows the fetch could not reach (never silently dropped)', () => {
  it('says nothing when the fetch reached the end of the archive', () => {
    expect(olderPastNote(0, 200)).toBeNull()
    expect(olderPastNote(-1, 200)).toBeNull()
  })

  it('names the cap and says the older rows are not listed here', () => {
    const note = olderPastNote(3, 200)
    expect(note).toContain('200')
    expect(note).toContain('3')
    expect(note).toContain('not listed here')
    // The dead promise this slice removes: a bare "+N older" that no control
    // could ever open.
    expect(note).not.toContain('+3 older')
  })

  it('agrees with its verb in the singular', () => {
    expect(olderPastNote(1, 200)).toBe(
      'Showing your 200 most recent past drop-ins — 1 older drop-in is not listed here.',
    )
    expect(olderPastNote(2, 200)).toBe(
      'Showing your 200 most recent past drop-ins — 2 older drop-ins are not listed here.',
    )
  })

  it('reaches the plan so the page cannot render the button without the honest line', () => {
    const plan = planFor(25, 4)
    expect(plan.olderNote).toBe(olderPastNote(4, 200))
    expect(plan.showMore).toBe('Show 20 more')
  })
})
