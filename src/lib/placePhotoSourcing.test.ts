import { describe, expect, it } from 'vitest'
import {
  PLACE_SIGNAL_WORDS,
  SOURCE_BLOCKLIST,
  candidateText,
  carriesArchivalYear,
  chooseSourceCandidate,
  distinctivePlaceTokens,
  gateCandidate,
  hasPersonNameShape,
  hasPlaceKindWord,
  hasPlaceSignal,
  matchesBlocklist,
  normalizeForMatch,
  placeNameAliases,
  rankCandidates,
  renderSourcingReport,
  reviewStateForTier,
  sourcingPhotoPatch,
  titleNamesPlace,
  type SourceCandidate,
  type SourcingRow,
} from './placePhotoSourcing'

/**
 * Place-photo sourcing (slice 5) — the gate, pinned by the MEASURED results it
 * exists to reject.
 *
 * The spec's §1 probe is the fixture here rather than an invented one: every
 * string in the "false positives" table below is a real title the sources
 * returned for a real blank Seattle park on 2026-10-05. A gate that is only
 * argued for is a gate that drifts; these tests are what make it fire.
 */

function candidate(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    title: 'Some photo',
    url: 'https://example.test/photo.jpg',
    source: 'openverse',
    ...overrides,
  }
}

describe('the measured false positives (spec §1) are all rejected from tier 1', () => {
  /**
   * The three blanks the probe searched were "12th West / West Howe Park",
   * "6th Ave NW Pocket Park" and "Albert Davis Park". Each row below pairs the
   * place with a title the probe actually got back for it.
   */
  const measured: Array<{ place: string; title: string }> = [
    { place: '12th West / West Howe Park', title: '1914 Packard dump truck' },
    { place: '6th Ave NW Pocket Park', title: 'Kitchen stone countertops' },
    { place: '12th West / West Howe Park', title: 'Back to the future — olden days keyboard rig' },
    {
      place: 'Albert Davis Park',
      title: 'Seattle City Councilmember Sally Clark at Seattle Animal Shelter',
    },
  ]

  it.each(measured)('$title is not tier 1 for $place', ({ place, title }) => {
    expect(gateCandidate(place, candidate({ title })).tier).not.toBe('tier1')
  })

  it.each(measured)('$title is DROPPED entirely, not demoted to tier 2', ({ place, title }) => {
    // A truck is not a worse answer than the illustration — it is a wrong answer
    // wearing a confident picture, and the founder should never have to reject it.
    expect(gateCandidate(place, candidate({ title })).tier).toBeNull()
  })

  it('catches the person shape even when the title NAMES the place', () => {
    // The ordering that matters: the name check would say tier 1 here, and a
    // photograph of a person at a podium would go live to parents.
    const verdict = gateCandidate(
      'Seattle Animal Shelter',
      candidate({ title: 'Seattle City Councilmember Sally Clark at Seattle Animal Shelter' }),
    )
    expect(verdict).toEqual({ tier: null, reason: 'person-name' })
  })

  it('rejects a nearby-subject title with a person role and a name, with no blocklist word', () => {
    expect(
      gateCandidate('Green Lake Park', candidate({ title: 'Mayor Bruce Harrell at Green Lake Park' }))
        .tier,
    ).toBeNull()
  })

  it('routes a merely-WEAK nearby photo to tier 2 rather than dropping it', () => {
    // "Lifting the pink stairs" was in the same probe and has no blocklist word
    // and no name: the amended model says it is applied for review, not dropped.
    expect(gateCandidate('12th West / West Howe Park', candidate({ title: 'Lifting the pink stairs' })))
      .toEqual({ tier: 'tier2', reason: null })
  })

  it('drops a blocklisted candidate but only demotes a weak one (the two-class rule)', () => {
    const blocked = rankCandidates('Albert Davis Park', [candidate({ title: '1914 Packard dump truck' })])
    expect(blocked.accepted).toEqual([])
    expect(blocked.rejected).toBe(1)

    const weak = rankCandidates('Albert Davis Park', [candidate({ title: 'A sunny afternoon' })])
    expect(weak.accepted.map((entry) => entry.tier)).toEqual(['tier2'])
    expect(weak.rejected).toBe(0)
  })
})

describe('THE 2026-10-05 DEFECT: a name match alone put a novella on a kids’ play space', () => {
  /**
   * Every string here is a real title a source returned for a real blank Seattle
   * place — the dry run of 2026-10-05, and the V18 ledger it repeats. The first
   * pair is THE defect: "Wunderkind" is a one-word place name, and the candidate
   * is a Wikimedia scan of Thomas Mann's 1914 novella *Das Wunderkind*. The old
   * gate made it TIER 1, the tier that is live to parents.
   */
  const works: Array<{
    place: string
    title: string
    reason: 'archival' | 'blocklisted' | 'person-name'
  }> = [
    { place: 'Wunderkind', title: 'Thomas Mann Das Wunderkind 1914', reason: 'archival' },
    // The same file as Commons serves it in a URL / a file name.
    { place: 'Wunderkind', title: 'Thomas_Mann_Das_Wunderkind_1914', reason: 'archival' },
    {
      place: 'Baker Park on Crown Hill',
      title: 'Price list. Fall 1919 - Baker Bros. Co. (IA CAT31301958).pdf',
      reason: 'blocklisted',
    },
    {
      place: '12th West / West Howe Park',
      // A Victorian memorial pamphlet for Rev. John Moffat Howe. The role shape
      // fires now that "rev" is a role ("reverend" already was); the blocklist's
      // "(ia " / ".pdf" / "tribute" catch it independently.
      title: 'Filial tribute to the memory of Rev. John Moffat Howe, M.D (IA filialtributetom00reid_0).pdf',
      reason: 'person-name',
    },
    {
      place: 'Alki Community Center',
      // An EU fisheries visit — a photograph of people, from an agency archive.
      title: 'Visit of Maria Damanaki, Member of the EC, to Greece (P-018025-00-05)',
      reason: 'blocklisted',
    },
  ]

  it.each(works)('DROPS $title for $place — not even tier 2', ({ place, title, reason }) => {
    // A book is not a worse answer than the illustration, it is a wrong answer
    // wearing a confident picture. The founder reviews tier 2; he should never
    // have to reject a Thomas Mann novella.
    expect(gateCandidate(place, candidate({ title }))).toEqual({ tier: null, reason })
  })

  it('shows the NAME test firing on the novella — which is why the name test is not the gate', () => {
    // The anchor for the regression: the name really is in there. Nothing about
    // fixing this is about making matching smarter about the word "Wunderkind" —
    // it is about requiring a second, independent signal.
    expect(titleNamesPlace('Thomas Mann Das Wunderkind 1914', 'Wunderkind')).toBe(true)
  })

  it('keeps the same shape out of tier 1 even without the year (belt and braces)', () => {
    // The year gives the outright drop; the PLACE SIGNAL is what stops the same
    // work without a year from going live. Both halves are load-bearing.
    expect(gateCandidate('Wunderkind', candidate({ title: 'Thomas Mann Das Wunderkind' })).tier).toBe(
      'tier2',
    )
  })

  it('is not fooled by a long id, and does not call a recent photo archival', () => {
    expect(carriesArchivalYear('Dan Ross Playground 2025')).toBe(false)
    expect(carriesArchivalYear('Beacon Hill Playground - geograph.org.uk - 1152815')).toBe(false)
    expect(carriesArchivalYear('IMG_1914')).toBe(false)
    expect(carriesArchivalYear('Boys exercising at Hiawatha Playfield, Seattle, 1911')).toBe(true)
    expect(carriesArchivalYear('Southwest Branch, Seattle Public Library, 1961')).toBe(false)
  })
})

describe('the PLACE SIGNAL — the second half of tier 1', () => {
  it('demotes a one-word place name when the title says nothing about a place', () => {
    expect(gateCandidate('Wunderkind', candidate({ title: 'Wunderkind' })).tier).toBe('tier2')
  })

  it('accepts the same one-word place when the title carries a place-kind word', () => {
    expect(gateCandidate('Wunderkind', candidate({ title: 'Wunderkind indoor play space' })).tier).toBe(
      'tier1',
    )
  })

  it('accepts the city and the neighbourhood as the signal', () => {
    expect(
      gateCandidate('Wunderkind', candidate({ title: 'Wunderkind, Seattle' }), { city: 'Seattle' }).tier,
    ).toBe('tier1')
    expect(
      gateCandidate('Wunderkind', candidate({ title: 'Wunderkind, Ravenna' }), {
        neighbourhood: 'Ravenna',
      }).tier,
    ).toBe('tier1')
    // …and neither fires when it is not in the text.
    expect(
      gateCandidate('Wunderkind', candidate({ title: 'Wunderkind, Ravenna' }), { city: 'Seattle' }).tier,
    ).toBe('tier2')
  })

  it('accepts a Commons category that says the file is a place', () => {
    const inAPlaygroundCategory = candidate({
      title: 'Wunderkind',
      categories: ['Category:Indoor playgrounds in Seattle'],
    })
    expect(gateCandidate('Wunderkind', inAPlaygroundCategory).tier).toBe('tier1')
    // A category about the work, not the place, is no signal at all.
    expect(
      gateCandidate('Wunderkind', candidate({ title: 'Wunderkind', categories: ['Category:Novellas'] })).tier,
    ).toBe('tier2')
  })

  it('reads the product’s own place-kind vocabulary, word-wise', () => {
    for (const term of [
      'park',
      'playground',
      'playfield',
      'wading pool',
      'community center',
      'library',
      'museum',
      'beach',
      'trail',
      'splash pad',
      'p patch',
    ]) {
      expect(PLACE_SIGNAL_WORDS).toContain(term)
      expect(hasPlaceKindWord(`A ${term} in Seattle`)).toBe(true)
    }
    // Word-wise, so a substring is not a signal.
    expect(hasPlaceKindWord('Parking lot')).toBe(false)
    expect(hasPlaceKindWord('Courtney’s house')).toBe(false)
    expect(hasPlaceSignal('Wunderkind', 'Wunderkind', { city: 'Seattle' })).toBe(false)
  })
})

describe('tier 1 STILL ACCEPTS the good ones (name AND place signal)', () => {
  const good: Array<{ place: string; title: string }> = [
    // THE positive control, straight from the spec's probe.
    { place: 'Albert Davis Park', title: 'Olympic Hills, Albert Davis Park' },
    { place: 'Albert Davis Park', title: 'Albert Davis Park playground panorama' },
    // The two good tier-1 hits the 2026-10-05 dry run actually made live: a park
    // named after a person, and a park whose name is also a common word.
    { place: 'Warren G Magnuson', title: 'Warren G. Magnuson Park' },
    { place: 'Woodland Park', title: 'Woodland Park' },
    { place: '12th West / West Howe Park', title: 'West Howe Park.jpg' },
    { place: 'Beacon Hill Playground', title: 'Beacon Hill Playground - geograph.org.uk - 1152815.jpg' },
    { place: 'Pritchard Beach', title: 'Pritchard Beach, Seattle' },
  ]

  it.each(good)('$title is tier 1 for $place', ({ place, title }) => {
    expect(gateCandidate(place, candidate({ title }), { city: 'Seattle' })).toEqual({
      tier: 'tier1',
      reason: null,
    })
  })
})

describe('tier 1 — the title names the place', () => {
  it('accepts "Olympic Hills, Albert Davis Park" for the place "Albert Davis Park"', () => {
    // THE positive control, straight from the spec's probe: Openverse returned
    // three real photos titled exactly this.
    expect(
      gateCandidate('Albert Davis Park', candidate({ title: 'Olympic Hills, Albert Davis Park' })),
    ).toEqual({ tier: 'tier1', reason: null })
  })

  it('accepts a Commons file title with its extension and File: prefix', () => {
    expect(titleNamesPlace('File:Albert Davis Park.jpg', 'Albert Davis Park')).toBe(true)
  })

  it('accepts the place name as a contiguous run with words around it', () => {
    expect(
      titleNamesPlace('Playground at Albert Davis Park, Seattle, morning light', 'Albert Davis Park'),
    ).toBe(true)
  })

  it('accepts a two-token core with the words in any order', () => {
    expect(titleNamesPlace('Davis Park, Albert — panorama', 'Albert Davis Park')).toBe(true)
  })

  it('refuses to call a single distinctive word a name (the one-token floor)', () => {
    // "Howe" alone is a street, a surname and half of Seattle. One word is not
    // evidence, and tier 1 goes live to parents with no review.
    expect(titleNamesPlace('Howe Street sidewalk cleanup', 'Howe Park')).toBe(false)
    expect(gateCandidate('Howe Park', candidate({ title: 'Howe Street sidewalk cleanup' })).tier).toBe(
      'tier2',
    )
    // …while the full name still passes.
    expect(titleNamesPlace('Howe Park, spring', 'Howe Park')).toBe(true)
  })

  it('does not treat a name that is entirely generic words as present anywhere', () => {
    expect(distinctivePlaceTokens('Seattle Community Park')).toEqual([])
    // The full name is still a full name; what must NOT pass is the generic
    // words rearranged, which is what a "count the shared words" rule would do.
    expect(titleNamesPlace('Seattle community park playground', 'Seattle Community Park')).toBe(true)
    expect(titleNamesPlace('Community park in Seattle', 'Seattle Community Park')).toBe(false)
  })

  it('matches the second half of a slash-joined city name', () => {
    // The city dataset names this row "12th West / West Howe Park": the slash
    // separates two names, and a file titled after either one is a match.
    expect(placeNameAliases('12th West / West Howe Park')).toEqual(['12th west', 'west howe park'])
    expect(titleNamesPlace('West Howe Park.jpg', '12th West / West Howe Park')).toBe(true)
    expect(titleNamesPlace('12th West street end', '12th West / West Howe Park')).toBe(true)
  })

  it('also accepts the parenthetical-stripped form of a name', () => {
    expect(placeNameAliases('Green Lake Park (East)')).toContain('green lake park')
    expect(titleNamesPlace('Green Lake Park in autumn', 'Green Lake Park (East)')).toBe(true)
  })

  it('reads a description as well as a title', () => {
    expect(
      titleNamesPlace(
        candidateText({ title: 'Park in Seattle', description: 'Albert Davis Park playground' }),
        'Albert Davis Park',
      ),
    ).toBe(true)
  })
})

describe('the blocklist and the person shape', () => {
  it('names each measured non-place subject', () => {
    for (const term of ['dump truck', 'keyboard', 'countertop', 'councilmember']) {
      expect(SOURCE_BLOCKLIST).toContain(term)
    }
  })

  it('is case- and punctuation-insensitive', () => {
    expect(matchesBlocklist('KITCHEN  STONE  COUNTERTOPS')).toBe(true)
    expect(matchesBlocklist('Dump-Truck at the fair')).toBe(true)
  })

  it('catches scanned documents structurally as well as by name', () => {
    expect(matchesBlocklist('A treatise on civic improvement')).toBe(true)
    expect(matchesBlocklist('Annual report of the park board')).toBe(true)
    expect(matchesBlocklist('Some scan (IA filialtributetom00reid_0)')).toBe(true)
    expect(matchesBlocklist('Park map.pdf')).toBe(true)
  })

  it('needs a role word before it will infer a person', () => {
    expect(hasPersonNameShape('Councilmember Sally Clark speaks')).toBe(true)
    expect(hasPersonNameShape('Mayor Bruce Harrell at the park')).toBe(true)
    // The true positive must survive the person rule: two proper nouns are a
    // PARK name here, not a person.
    expect(hasPersonNameShape('Olympic Hills, Albert Davis Park')).toBe(false)
  })

  it('does not block the word "park" or a real neighbourhood', () => {
    expect(matchesBlocklist('Olympic Hills, Albert Davis Park')).toBe(false)
    expect(matchesBlocklist('West Howe Park playground')).toBe(false)
  })
})

describe('normalizeForMatch', () => {
  it('drops a file extension and punctuation, and collapses whitespace', () => {
    expect(normalizeForMatch('File:Albert  Davis Park.JPG')).toBe('file albert davis park')
    expect(normalizeForMatch('12th West / West Howe Park')).toBe('12th west west howe park')
  })
})

describe('rankCandidates — tier 1 always outranks tier 2', () => {
  it('orders every tier 1 before any tier 2, preserving order inside a tier', () => {
    const ranked = rankCandidates('Albert Davis Park', [
      candidate({ title: 'A nearby playground', url: 'https://example.test/weak-1.jpg' }),
      candidate({ title: 'Albert Davis Park', url: 'https://example.test/strong.jpg' }),
      candidate({ title: 'Olympic Hills, Albert Davis Park', url: 'https://example.test/strong-2.jpg' }),
      candidate({ title: 'Another nearby field', url: 'https://example.test/weak-2.jpg' }),
    ])
    expect(ranked.accepted.map((entry) => [entry.tier, entry.candidate.url])).toEqual([
      ['tier1', 'https://example.test/strong.jpg'],
      ['tier1', 'https://example.test/strong-2.jpg'],
      ['tier2', 'https://example.test/weak-1.jpg'],
      ['tier2', 'https://example.test/weak-2.jpg'],
    ])
  })

  it('collapses the same URL offered by both sources', () => {
    const same = 'https://example.test/same.jpg'
    const ranked = rankCandidates('Albert Davis Park', [
      candidate({ url: same, source: 'openverse', title: 'Albert Davis Park' }),
      candidate({ url: same, source: 'commons', title: 'Albert Davis Park' }),
    ])
    expect(ranked.accepted).toHaveLength(1)
  })

  it('ignores a candidate with no URL at all', () => {
    expect(rankCandidates('Albert Davis Park', [candidate({ url: '   ' })]).accepted).toEqual([])
  })
})

describe('chooseSourceCandidate — the best one, or the honest reason there is none', () => {
  it('reports "0 results" when the sources returned nothing', () => {
    expect(chooseSourceCandidate('Albert Davis Park', [])).toEqual({
      tier: null,
      reason: '0 results',
      rejected: 0,
    })
  })

  it('reports "all failed the gate" when every result was the wrong subject', () => {
    const choice = chooseSourceCandidate('Albert Davis Park', [
      candidate({ title: '1914 Packard dump truck', url: 'https://example.test/truck.jpg' }),
      candidate({ title: 'Kitchen stone countertops', url: 'https://example.test/stone.jpg' }),
    ])
    expect(choice.tier).toBeNull()
    if (choice.tier === null) expect(choice.reason).toBe('all failed the gate')
    expect(choice.rejected).toBe(2)
  })

  it('prefers a tier-1 candidate that arrived last', () => {
    const choice = chooseSourceCandidate('Albert Davis Park', [
      candidate({ title: 'A nearby playground', url: 'https://example.test/weak.jpg' }),
      candidate({ title: 'Albert Davis Park', url: 'https://example.test/strong.jpg' }),
    ])
    expect(choice.tier).toBe('tier1')
    if (choice.tier === 'tier1') expect(choice.candidate.url).toBe('https://example.test/strong.jpg')
  })
})

describe('reviewStateForTier / sourcingPhotoPatch — the tier becomes the review flag', () => {
  it('writes tier 1 as confirmed and tier 2 as unreviewed', () => {
    expect(reviewStateForTier('tier1')).toBe('confirmed')
    expect(reviewStateForTier('tier2')).toBe('unreviewed')
  })

  it('writes the photo, its provenance and the review flag together', () => {
    const patch = sourcingPhotoPatch({
      tier: 'tier2',
      url: 'https://live.staticflickr.com/1/2.jpg',
      sourceUrl: 'https://www.flickr.com/photos/x/2',
      license: 'by-nc',
      author: 'A Photographer',
    })
    expect(patch.photo_url).toBe('https://live.staticflickr.com/1/2.jpg')
    expect(patch.photo_source_url).toBe('https://www.flickr.com/photos/x/2')
    expect(patch.photo_license).toBe('by-nc')
    expect(patch.photo_attribution).toBe('A Photographer / by-nc')
    expect(patch.photo_review_state).toBe('unreviewed')
  })

  it('marks a tier-1 patch confirmed', () => {
    expect(sourcingPhotoPatch({ tier: 'tier1', url: 'https://example.test/a.jpg' }).photo_review_state)
      .toBe('confirmed')
  })
})

describe('renderSourcingReport — the arithmetic the acceptance criteria rest on', () => {
  const rows: SourcingRow[] = [
    { placeId: 'a', placeName: 'Albert Davis Park', outcome: 'applied', tier: 'tier1', url: 'https://x/1.jpg', source: 'openverse', license: 'by-nc' },
    { placeId: 'b', placeName: 'Howe Park', outcome: 'applied', tier: 'tier2', url: 'https://x/2.jpg', source: 'commons' },
    { placeId: 'c', placeName: 'Pocket Park', outcome: 'no-candidate', reason: '0 results' },
    { placeId: 'd', placeName: 'Blank Park', outcome: 'failed', reason: 'HTTP 429 after 4 attempts' },
  ]

  it('balances applied + no candidate against the requested count', () => {
    const report = renderSourcingReport({ rows, requested: 4, dryRun: true })
    expect(report).toContain('applied 2 + no candidate 1 = 3 of 4 requested')
    expect(report).toContain('(+1 failed')
  })

  it('keeps failures in their own section, never in the worklist', () => {
    const report = renderSourcingReport({ rows, requested: 4, dryRun: true })
    expect(report).toContain("## No candidate (1) — the founder's manual worklist")
    expect(report).toContain('## Request failures (1) — NOT the same as "no candidate"')
    expect(report).toContain('HTTP 429 after 4 attempts')
  })

  it('says out loud that a dry run wrote nothing', () => {
    expect(renderSourcingReport({ rows, requested: 4, dryRun: true })).toContain('**DRY RUN**')
    expect(renderSourcingReport({ rows, requested: 4, dryRun: false })).toContain('**LIVE RUN**')
  })

  it('states what parents see while the review is pending', () => {
    const report = renderSourcingReport({ rows, requested: 4, dryRun: true })
    expect(report).toMatch(/review\*\* badge/)
    expect(report).toContain('parents keep the per-kind illustration')
  })

  it('reports the per-place reason for an empty place', () => {
    expect(renderSourcingReport({ rows, requested: 4, dryRun: true })).toContain(
      '**Pocket Park** — 0 results',
    )
  })
})
