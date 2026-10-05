/**
 * Sibling tests for `lib/placePhotoAdmin.ts` (the build law: every lib module
 * ships a test beside it).
 *
 * WHAT THESE GUARD, beyond coverage. Two of the functions here are SECURITY
 * BOUNDARIES rather than conveniences — `validatePhotoUrl` is the only thing
 * standing between a moderator's clipboard and a `javascript:` value rendered
 * into an `<img src>` on a public directory — and one is a CORRECTNESS boundary:
 * `placePhotoPatch` must never write a photo without its provenance, because a
 * mis-attributed image is a licensing problem the app cannot detect later.
 * Those two get the adversarial cases, not the happy path.
 */
import { describe, expect, it } from 'vitest'
import { AVATAR_SIZE_PX } from './db'
import {
  PLACE_PHOTO_HEIGHT_PX,
  PLACE_PHOTO_MAX_BYTES,
  PLACE_PHOTO_SIZE,
  PLACE_PHOTO_TYPES,
  PLACE_PHOTO_WIDTH_PX,
  clearPlacePhotoPatch,
  fetchPlacePhotoFile,
  formatMegabytes,
  linkFallbackNotice,
  placePhotoObjectPath,
  placePhotoPatch,
  validatePhotoFile,
  validatePhotoUrl,
  validatePlacePhotoCropFile,
} from './placePhotoAdmin'

describe('validatePhotoUrl (the security boundary)', () => {
  it('accepts an https URL and returns it trimmed', () => {
    expect(validatePhotoUrl('  https://example.org/park.jpg  ')).toEqual({
      url: 'https://example.org/park.jpg',
    })
  })

  it('accepts http as well as https', () => {
    expect(validatePhotoUrl('http://example.org/park.jpg')).toEqual({
      url: 'http://example.org/park.jpg',
    })
  })

  it('REJECTS a javascript: URL — the injection this exists for', () => {
    // The value is rendered into an <img src> and an anchor href. A javascript:
    // URL there is an XSS vector, and this is the only thing stopping it.
    const result = validatePhotoUrl('javascript:alert(1)')
    expect('error' in result).toBe(true)
  })

  it('REJECTS a data: URL', () => {
    const result = validatePhotoUrl('data:image/png;base64,AAAA')
    expect('error' in result).toBe(true)
  })

  it('REJECTS a file: URL', () => {
    const result = validatePhotoUrl('file:///etc/passwd')
    expect('error' in result).toBe(true)
  })

  it('rejects an empty or whitespace-only value with an actionable sentence', () => {
    expect(validatePhotoUrl('')).toEqual({ error: 'Paste an image link first.' })
    expect(validatePhotoUrl('   ')).toEqual({ error: 'Paste an image link first.' })
  })

  it('rejects something that is not a URL at all', () => {
    const result = validatePhotoUrl('not a link')
    expect('error' in result).toBe(true)
  })
})

describe('validatePhotoFile (type before size, deliberately)', () => {
  const ok = { type: 'image/jpeg', size: 1024 }

  it('accepts a JPEG within the cap', () => {
    expect(validatePhotoFile(ok)).toEqual({ ok: true })
  })

  it('accepts every advertised type', () => {
    for (const type of PLACE_PHOTO_TYPES) {
      expect(validatePhotoFile({ type, size: 1024 })).toEqual({ ok: true })
    }
  })

  it('rejects an unsupported type', () => {
    const result = validatePhotoFile({ type: 'image/gif', size: 1024 })
    expect(result.ok).toBe(false)
  })

  it('reports a TYPE error for a huge unsupported file, not a size error', () => {
    // The ordering rule: telling a moderator to "pick a smaller file" when they
    // actually picked a video sends them to fix the wrong thing.
    const result = validatePhotoFile({ type: 'video/mp4', size: PLACE_PHOTO_MAX_BYTES * 10 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/file type/i)
  })

  it('rejects a file over the cap, naming both sizes', () => {
    const result = validatePhotoFile({ type: 'image/png', size: PLACE_PHOTO_MAX_BYTES + 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain(formatMegabytes(PLACE_PHOTO_MAX_BYTES))
      expect(result.error).toContain(formatMegabytes(PLACE_PHOTO_MAX_BYTES + 1))
    }
  })

  it('accepts a file exactly at the cap (the boundary is inclusive)', () => {
    expect(validatePhotoFile({ type: 'image/png', size: PLACE_PHOTO_MAX_BYTES })).toEqual({
      ok: true,
    })
  })

  it('rejects an empty file', () => {
    const result = validatePhotoFile({ type: 'image/png', size: 0 })
    expect(result.ok).toBe(false)
  })
})

/**
 * The crop step's gate (place-photo-crop 2026-10-05). `useCropStep` takes it as
 * a dependency and wants the message-or-null shape, so the interesting property
 * is the DELEGATION: the message a moderator sees must be `validatePhotoFile`'s
 * own, not a second copy that drifts from it.
 */
describe('validatePlacePhotoCropFile (the crop step gate)', () => {
  it('returns null for every supported type inside the cap', () => {
    for (const type of PLACE_PHOTO_TYPES) {
      expect(validatePlacePhotoCropFile({ type, size: 1024 } as File)).toBeNull()
    }
  })

  it('returns the SAME message validatePhotoFile gives for an unsupported type', () => {
    const file = { type: 'image/gif', size: 1024 } as File
    const checked = validatePhotoFile(file)
    expect(checked.ok).toBe(false)
    if (!checked.ok) expect(validatePlacePhotoCropFile(file)).toBe(checked.error)
  })

  it('returns the size message, naming both sizes, for an oversize file', () => {
    const message = validatePlacePhotoCropFile({
      type: 'image/png',
      size: PLACE_PHOTO_MAX_BYTES + 1,
    } as File)
    expect(message).toContain(formatMegabytes(PLACE_PHOTO_MAX_BYTES))
    expect(message).toContain(formatMegabytes(PLACE_PHOTO_MAX_BYTES + 1))
  })

  it('rejects an empty file, and accepts one exactly at the cap', () => {
    expect(validatePlacePhotoCropFile({ type: 'image/png', size: 0 } as File)).not.toBeNull()
    expect(
      validatePlacePhotoCropFile({ type: 'image/png', size: PLACE_PHOTO_MAX_BYTES } as File),
    ).toBeNull()
  })
})

describe('the stored place-photo shape (slice 3, spec §3)', () => {
  it('is the pinned 1400×700 — a 2:1 rectangle, not a square', () => {
    expect(PLACE_PHOTO_WIDTH_PX).toBe(1400)
    expect(PLACE_PHOTO_HEIGHT_PX).toBe(700)
    expect(PLACE_PHOTO_WIDTH_PX / PLACE_PHOTO_HEIGHT_PX).toBeCloseTo(2, 9)
    // The window the editor draws and the pixels the encoder writes are the same
    // value, so what the moderator framed is what is stored.
    expect(PLACE_PHOTO_SIZE).toEqual({ width: 1400, height: 700 })
  })

  it('is larger than an avatar on both axes, because it feeds a full-width banner', () => {
    // 448 CSS px wide at 3x is ~1344 device px; the avatar's 512 would be mush.
    expect(PLACE_PHOTO_WIDTH_PX).toBeGreaterThan(AVATAR_SIZE_PX)
    expect(PLACE_PHOTO_HEIGHT_PX).toBeGreaterThan(AVATAR_SIZE_PX)
  })
})

describe('formatMegabytes', () => {
  it('renders one decimal place', () => {
    expect(formatMegabytes(8 * 1024 * 1024)).toBe('8.0 MB')
  })
})

describe('placePhotoObjectPath (the cache-busting generation)', () => {
  it('derives the extension from the MIME type, never the filename', () => {
    expect(placePhotoObjectPath('abc', 'image/jpeg', 1)).toBe('abc/1.jpg')
    expect(placePhotoObjectPath('abc', 'image/png', 1)).toBe('abc/1.png')
    expect(placePhotoObjectPath('abc', 'image/webp', 1)).toBe('abc/1.webp')
  })

  it('a NEW generation is a NEW path, which is what busts the browser cache', () => {
    // The V28 r2 R1 lesson: a stable path means the browser serves the OLD
    // bytes after a replacement, and the moderator concludes the tool is broken.
    expect(placePhotoObjectPath('abc', 'image/jpeg', 1)).not.toBe(
      placePhotoObjectPath('abc', 'image/jpeg', 2),
    )
  })

  it('scopes every object under the place id, so one place cannot overwrite another', () => {
    expect(placePhotoObjectPath('place-1', 'image/jpeg', 1).startsWith('place-1/')).toBe(true)
  })
})

describe('placePhotoPatch (provenance travels with the image)', () => {
  it('writes all five columns together, never photo_url alone', () => {
    const patch = placePhotoPatch({
      photoUrl: 'https://example.org/park.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Park.jpg',
      license: 'CC BY-SA 4.0',
      author: 'A Photographer',
    })
    expect(Object.keys(patch).sort()).toEqual([
      'photo_attribution',
      'photo_author',
      'photo_license',
      'photo_source_url',
      'photo_url',
    ])
  })

  it('builds the attribution line from author and licence', () => {
    const patch = placePhotoPatch({
      photoUrl: 'https://example.org/p.jpg',
      license: 'CC BY-SA 4.0',
      author: 'A Photographer',
    })
    expect(patch.photo_attribution).toBe('A Photographer / CC BY-SA 4.0')
  })

  it('normalises absent provenance to null, never to an empty string', () => {
    // `photoCreditLine` treats '' and null alike, but only null is honest about
    // the value being absent — and an empty string is what a careless form
    // submits.
    const patch = placePhotoPatch({ photoUrl: 'https://example.org/p.jpg' })
    expect(patch.photo_source_url).toBeNull()
    expect(patch.photo_license).toBeNull()
    expect(patch.photo_author).toBeNull()
    expect(patch.photo_attribution).toBeNull()
  })

  it('treats whitespace-only provenance as absent', () => {
    const patch = placePhotoPatch({
      photoUrl: 'https://example.org/p.jpg',
      license: '   ',
      author: '  ',
    })
    expect(patch.photo_license).toBeNull()
    expect(patch.photo_attribution).toBeNull()
  })

  it('trims the URL it stores', () => {
    const patch = placePhotoPatch({ photoUrl: '  https://example.org/p.jpg  ' })
    expect(patch.photo_url).toBe('https://example.org/p.jpg')
  })

  it('does NOT lose the attribution when only one half is given', () => {
    const patch = placePhotoPatch({ photoUrl: 'https://x/p.jpg', author: 'Someone' })
    expect(patch.photo_attribution).toBe('Someone')
  })
})

describe('clearPlacePhotoPatch', () => {
  it('clears all five columns, so provenance cannot outlive the image', () => {
    const patch = clearPlacePhotoPatch()
    expect(Object.values(patch).every((value) => value === null)).toBe(true)
    expect(Object.keys(patch)).toHaveLength(5)
  })
})

/**
 * The copy (place-photo-crop slice 2, amended 2026-10-05): a pasted link stays a
 * link unless the moderator frames it, and framing is the only thing that fetches.
 *
 * EVERY BRANCH GETS A CASE. The injected `fetchImpl` is the point: the refusals
 * are what a moderator actually meets (a host that blocks CORS, a page instead of
 * an image, a 40 MB original), and they must be provable with no network at all.
 * The failure sentences are the product here — "it didn't work" is not an answer
 * a person at a keyboard can act on, so each one is asserted, not just the ok
 * flag.
 */
describe('fetchPlacePhotoFile (the copy only the crop path asks for)', () => {
  /** A fetch that always answers with `response`. */
  function answerWith(response: Response): typeof fetch {
    return async () => response
  }

  /**
   * The shape the function actually reads. A real `Response` cannot carry a
   * `content-length` that disagrees with its body, and cannot have a body that
   * dies — and both are branches worth pinning.
   */
  function fakeResponse(init: {
    status?: number
    headers?: Record<string, string>
    body?: Blob
    blobThrows?: boolean
  }): Response {
    const status = init.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => init.headers?.[name.toLowerCase()] ?? null },
      blob: async () => {
        if (init.blobThrows === true) throw new Error('the body died mid-transfer')
        return init.body ?? new Blob([])
      },
    } as unknown as Response
  }

  it('copies a real image response into a File typed from the header', async () => {
    const result = await fetchPlacePhotoFile('https://example.org/park.jpg', {
      fetchImpl: answerWith(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        }),
      ),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.file.type).toBe('image/webp')
      expect(result.file.size).toBe(3)
    }
  })

  it('reads the BARE media type, so a charset parameter does not reject a JPEG', async () => {
    const result = await fetchPlacePhotoFile('https://example.org/park.jpg', {
      fetchImpl: answerWith(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg; charset=binary' },
        }),
      ),
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.file.type).toBe('image/jpeg')
  })

  it('accepts a body exactly at the cap (the boundary is inclusive)', async () => {
    const result = await fetchPlacePhotoFile('https://example.org/park.png', {
      fetchImpl: answerWith(
        fakeResponse({
          headers: { 'content-type': 'image/png' },
          body: new Blob([new Uint8Array(PLACE_PHOTO_MAX_BYTES)]),
        }),
      ),
    })
    expect(result.ok).toBe(true)
  })

  it('refuses a response that is not ok, naming the status', async () => {
    const result = await fetchPlacePhotoFile('https://example.org/gone.jpg', {
      fetchImpl: answerWith(fakeResponse({ status: 404 })),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('404')
      expect(result.error).toMatch(/upload a file/i)
    }
  })

  it('refuses a response that is not one of our image types', async () => {
    const result = await fetchPlacePhotoFile('https://example.org/page.html', {
      fetchImpl: answerWith(
        fakeResponse({
          headers: { 'content-type': 'text/html; charset=utf-8' },
          body: new Blob(['<html></html>']),
        }),
      ),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/not an image/i)
      expect(result.error).toMatch(/jpeg, png, or webp/i)
    }
  })

  it('refuses a DECLARED length over the cap BEFORE reading the body', async () => {
    // The body would throw if it were read, so the size sentence proves the
    // order: a 40 MB original is refused without downloading it.
    const result = await fetchPlacePhotoFile('https://example.org/huge.jpg', {
      fetchImpl: answerWith(
        fakeResponse({
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(PLACE_PHOTO_MAX_BYTES + 1),
          },
          blobThrows: true,
        }),
      ),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain(formatMegabytes(PLACE_PHOTO_MAX_BYTES + 1))
      expect(result.error).toContain(formatMegabytes(PLACE_PHOTO_MAX_BYTES))
    }
  })

  it('refuses a body over the cap when the length was never declared', async () => {
    // `content-length` is absent under chunked encoding, and a host may simply
    // lie: the measured size is the one that decides.
    const result = await fetchPlacePhotoFile('https://example.org/huge.jpg', {
      fetchImpl: answerWith(
        fakeResponse({
          headers: { 'content-type': 'image/jpeg' },
          body: new Blob([new Uint8Array(PLACE_PHOTO_MAX_BYTES + 1)]),
        }),
      ),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(formatMegabytes(PLACE_PHOTO_MAX_BYTES))
  })

  it('names the way out when the fetch itself throws — the CORS case', async () => {
    const result = await fetchPlacePhotoFile('https://gmaps.example/photo.jpg', {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/wouldn't let us copy the photo/i)
      expect(result.error).toMatch(/upload a file/i)
    }
  })

  it('gives the same way out when the body dies mid-transfer', async () => {
    const result = await fetchPlacePhotoFile('https://example.org/flaky.jpg', {
      fetchImpl: answerWith(
        fakeResponse({ headers: { 'content-type': 'image/jpeg' }, blobThrows: true }),
      ),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/wouldn't let us copy the photo/i)
  })
})

/**
 * Slice 4's fallback message. The refusal itself is tested above; this pins the
 * half the moderator reads AFTER the link was stored, which is the sentence that
 * stops "we could not copy it" from reading as "nothing was saved".
 */
describe('linkFallbackNotice (the refused copy that stored the link)', () => {
  it('states the outcome FIRST, so it agrees with the photo already on the card', () => {
    const notice = linkFallbackNotice('That link answered with 404.')
    expect(notice.startsWith('We saved the link instead. ')).toBe(true)
  })

  it("carries the refusal's own sentence, including its way out", () => {
    const notice = linkFallbackNotice(
      "That site wouldn't let us copy the photo. Save it to your device and use Upload a file.",
    )
    expect(notice).toContain("wouldn't let us copy the photo")
    expect(notice).toMatch(/upload a file/i)
  })

  it('says NOTHING about the copy succeeding, and nothing about the crop', () => {
    // The honest sentence: the bytes were never read. A word like "copied" or
    // "adjusted" here would claim work that did not happen.
    const notice = linkFallbackNotice('That link is not an image we can use.')
    expect(notice).not.toMatch(/copied/i)
    expect(notice).not.toMatch(/adjust/i)
  })
})
