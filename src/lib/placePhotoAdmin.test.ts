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
import {
  PLACE_PHOTO_MAX_BYTES,
  PLACE_PHOTO_TYPES,
  clearPlacePhotoPatch,
  formatMegabytes,
  placePhotoObjectPath,
  placePhotoPatch,
  validatePhotoFile,
  validatePhotoUrl,
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
