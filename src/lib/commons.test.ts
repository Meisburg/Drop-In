import { describe, expect, it } from 'vitest'
import {
  buildAttribution,
  failedCandidate,
  filePageUrlFor,
  readCommonsResponse,
  stripHtml,
  type CandidatePlace,
} from './commons'

/**
 * The tests below are built from a REAL Commons response captured during V18
 * t02 (the `action=query&generator=search` shape for "Green Lake Park
 * Seattle"), not from the API docs — the docs do not show that `extmetadata`
 * carries HTML in `Artist`, and that is the field this module most needs to get
 * right. Where a test pins a shape, the shape was observed.
 */
const PLACE: CandidatePlace = { id: 'p1', name: 'Green Lake Park', kind: 'park' }

/** A response shaped like the live one, trimmed to the fields we read. */
function liveShapedResponse(): unknown {
  return {
    batchcomplete: '',
    query: {
      pages: {
        133593835: {
          pageid: 133593835,
          ns: 6,
          title: 'File:Green Lake-1.jpg',
          index: 1,
          imageinfo: [
            {
              thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Green_Lake-1.jpg/800px.jpg',
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:Green_Lake-1.jpg',
              extmetadata: {
                LicenseShortName: { value: 'CC BY-SA 3.0' },
                // HTML, exactly as Commons returns it.
                Artist: {
                  value:
                    '<a href="https://en.wikipedia.org/wiki/user:Shakespeare" class="extiw">en:user:Shakespeare</a>',
                },
                AttributionRequired: { value: 'true' },
              },
            },
          ],
        },
      },
    },
  }
}

describe('readCommonsResponse — a real hit', () => {
  it('reads the image, licence and author out of the observed shape', () => {
    const c = readCommonsResponse(PLACE, liveShapedResponse())
    expect(c.miss).toBeNull()
    expect(c.image).not.toBeNull()
    expect(c.image?.thumbUrl).toContain('upload.wikimedia.org')
    expect(c.image?.license).toBe('CC BY-SA 3.0')
    // The HTML anchor never survives into the author.
    expect(c.image?.author).toBe('en:user:Shakespeare')
    expect(c.image?.author).not.toContain('<')
    expect(c.image?.attribution).toBe('en:user:Shakespeare / CC BY-SA 3.0')
  })

  it('derives the canonical file page from the title, not the descriptionurl', () => {
    const c = readCommonsResponse(PLACE, liveShapedResponse())
    expect(c.image?.filePageUrl).toBe('https://commons.wikimedia.org/wiki/File:Green_Lake-1.jpg')
  })

  it('carries the place identity through, so the sheet can group by place', () => {
    const c = readCommonsResponse(PLACE, liveShapedResponse())
    expect(c.placeId).toBe('p1')
    expect(c.placeName).toBe('Green Lake Park')
    expect(c.kind).toBe('park')
  })

  it('prefers the response order when several files match', () => {
    const raw = {
      query: {
        pages: {
          a: {
            index: 2,
            title: 'File:Second.jpg',
            imageinfo: [{ thumburl: 'https://x/second.jpg', extmetadata: {} }],
          },
          b: {
            index: 1,
            title: 'File:First.jpg',
            imageinfo: [{ thumburl: 'https://x/first.jpg', extmetadata: {} }],
          },
        },
      },
    }
    expect(readCommonsResponse(PLACE, raw).image?.thumbUrl).toBe('https://x/first.jpg')
  })
})

/**
 * THE LOAD-BEARING TESTS.
 *
 * These are the three-valued distinction the module exists for. If the failure
 * branch is ever collapsed into the absence branch, exactly one of these fails
 * — which is what makes them evidence rather than decoration. Red-green was run
 * in both directions during the slice (see the ledger).
 */
describe('readCommonsResponse — absent is NOT the same as failed', () => {
  it('reports an empty result as "none", the API having answered', () => {
    expect(readCommonsResponse(PLACE, { batchcomplete: '', query: {} }).miss).toBe('none')
    expect(readCommonsResponse(PLACE, { query: { pages: {} } }).miss).toBe('none')
  })

  it('reports a malformed or error response as "failed", never as "none"', () => {
    expect(readCommonsResponse(PLACE, null).miss).toBe('failed')
    expect(readCommonsResponse(PLACE, 'not json').miss).toBe('failed')
    expect(readCommonsResponse(PLACE, { error: { info: 'rate limited' } }).miss).toBe('failed')
    expect(readCommonsResponse(PLACE, { error: { info: 'rate limited' } }).failure).toContain(
      'rate limited',
    )
  })

  it('reports pages that carry no usable image as "none", not "failed"', () => {
    const raw = { query: { pages: { a: { title: 'File:X.jpg', imageinfo: [] } } } }
    expect(readCommonsResponse(PLACE, raw).miss).toBe('none')
  })

  it('never leaves both image and miss unset, in any branch', () => {
    const cases: unknown[] = [
      liveShapedResponse(),
      null,
      {},
      { query: {} },
      { query: { pages: {} } },
      { error: { info: 'x' } },
      { query: { pages: { a: { imageinfo: [] } } } },
    ]
    for (const raw of cases) {
      const c = readCommonsResponse(PLACE, raw)
      // Exactly one of the two is set — a candidate is never ambiguous.
      expect(c.image === null).toBe(c.miss !== null)
    }
  })

  it('a failed candidate can only be built as "failed"', () => {
    expect(failedCandidate(PLACE, 'HTTP 429').miss).toBe('failed')
    expect(failedCandidate(PLACE, 'HTTP 429').failure).toBe('HTTP 429')
  })
})

describe('stripHtml', () => {
  it('reduces the observed Artist anchor to its text', () => {
    expect(
      stripHtml('<a href="https://en.wikipedia.org/wiki/user:Shakespeare" class="extiw">en:user:Shakespeare</a>'),
    ).toBe('en:user:Shakespeare')
  })

  it('handles the own-work span form', () => {
    expect(stripHtml('<span class="int-own-work">Own work</span>')).toBe('Own work')
  })

  it('decodes entities to literal TEXT rather than leaving markup to render', () => {
    // The distinction that matters: the output is a JS STRING whose characters
    // happen to be angle brackets. It is never parsed as markup on the way in
    // (React escapes text children), so decoding here is safe and gives the
    // human the honest reading of the field. What must NOT happen is the tag
    // surviving as a tag through the strip step, which is why tags are removed
    // BEFORE entities are decoded.
    expect(stripHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<script>alert(1)</script>')
    // And a REAL tag in the same string is still removed.
    expect(stripHtml('<b>bold</b> &lt;i&gt;not a tag&lt;/i&gt;')).toBe('bold <i>not a tag</i>')
  })

  it('decodes &amp; last, so &amp;lt; does not turn into a tag', () => {
    expect(stripHtml('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;')
  })

  it('collapses whitespace and trims', () => {
    expect(stripHtml('  a\n\n  b  ')).toBe('a b')
  })

  it('is identity for plain text', () => {
    expect(stripHtml('Jon Meisburg')).toBe('Jon Meisburg')
  })
})

describe('buildAttribution — the licence-compliance line', () => {
  it('joins author and licence', () => {
    expect(buildAttribution('en:user:Shakespeare', 'CC BY-SA 3.0')).toBe(
      'en:user:Shakespeare / CC BY-SA 3.0',
    )
  })

  it('skips an empty author rather than emitting a dangling separator', () => {
    // Commons does not always name an author. "CC BY 3.0" alone is honest;
    // " / CC BY 3.0" reads as a name that failed to render.
    expect(buildAttribution('', 'CC BY 3.0')).toBe('CC BY 3.0')
  })

  it('skips an empty licence', () => {
    expect(buildAttribution('Someone', '')).toBe('Someone')
  })

  it('returns empty when there is nothing to say', () => {
    expect(buildAttribution('', '')).toBe('')
    expect(buildAttribution('   ', '  ')).toBe('')
  })
})

describe('filePageUrlFor', () => {
  it('uses underscores and keeps the namespace colon', () => {
    expect(filePageUrlFor('File:Green Lake-1.jpg')).toBe(
      'https://commons.wikimedia.org/wiki/File:Green_Lake-1.jpg',
    )
  })

  it('does not escape the colon (encodeURIComponent would break the title)', () => {
    expect(filePageUrlFor('File:A B.jpg')).toContain('File:A_B.jpg')
  })
})
