/**
 * Unit tests for the V9 ticket-11 storage seams (src/lib/photoStorage.ts) plus
 * the two db.ts pieces that ride them: the family-photo validator (which must BE
 * the avatar rules) and the batched signed-URL mint (which must be best-effort,
 * deduped, and keyed by the STORED value).
 *
 * THE OTHER HALF OF THIS PROOF lives in `scripts/migrate-kid-photos.test.mjs`:
 * the move script classifies object keys with its OWN copy of the path rules (it
 * is plain JS and cannot import this TypeScript module), so that file imports
 * both implementations and asserts they agree. It sits next to the script — and
 * OUTSIDE src/ — because this project's `tsc -b` cannot type a `.mjs` import,
 * and a shim would only hide the drift risk the cross-check exists to catch.
 *
 * Note: importing db.ts runs its module-scope Supabase client creation, which
 * reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the repo .env (the
 * db-v2.test.ts note) — the gate runs in this repo, where .env is present.
 */
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AVATAR_MAX_BYTES, signedFamilyPhotoUrlsWithClient, signedKidPhotoUrlsWithClient, validateAvatarFile, validateFamilyPhotoFile } from './db'
import {
  FAMILY_PHOTO_FILE,
  FAMILY_PHOTO_URL_TTL_SECONDS,
  PHOTO_BUCKET,
  familyPhotoMintPaths,
  familyPhotoObjectPath,
  familyPhotoPath,
  familyPhotoVisibility,
  isKidPhotoPath,
  kidPhotoMintPaths,
  kidPhotoPath,
  kidPhotoStoredRef,
  kidPhotoVisibility,
  normalizePhotoExt,
  profileBlurbOrder,
  profileHasBio,
} from './photoStorage'

const UID = '11111111-2222-4333-8444-555555555555'
const KID = '99999999-8888-4777-8666-555555555555'
const OTHER_UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('the kid-photo path and visibility decision (V9 ticket 11)', () => {
  it('places a kid photo at <uid>/kids/<kidId> in the PRIVATE bucket', () => {
    expect(kidPhotoPath(UID, KID)).toBe(`${UID}/kids/${KID}`)
    expect(kidPhotoStoredRef(UID, KID)).toBe(`${PHOTO_BUCKET}/${UID}/kids/${KID}`)
    // The bucket is the ticket's, and the class folder is the policy's own
    // second segment (0038 keys on storage.foldername(name)[2] = 'kids').
    expect(PHOTO_BUCKET).toBe('kid-photos')
  })

  it('classifies the kid class on the SECOND segment, exactly as the policies do', () => {
    expect(isKidPhotoPath(`${UID}/kids/${KID}`)).toBe(true)
    expect(isKidPhotoPath(`kids/${UID}/${KID}`)).toBe(false)
    expect(isKidPhotoPath(`${UID}/avatar`)).toBe(false)
    expect(isKidPhotoPath(`${UID}/family/photo.jpg`)).toBe(false)
    expect(isKidPhotoPath(`${UID}/kids/${KID}/extra`)).toBe(true)
    expect(isKidPhotoPath('')).toBe(false)
  })

  it('allows the OWNER alone, and denies a signed-in stranger and an anon caller', () => {
    expect(kidPhotoVisibility(UID, UID)).toBe('owner')
    // THE CASE THIS TICKET EXISTS FOR: another signed-in parent.
    expect(kidPhotoVisibility(OTHER_UID, UID)).toBe('denied')
    expect(kidPhotoVisibility(null, UID)).toBe('denied')
    expect(kidPhotoVisibility('', UID)).toBe('denied')
  })
})

describe('kidPhotoMintPaths (V12 t04: the owner\'s batched kid-photo mint list)', () => {
  it('builds the canonical path for each kid id, in the caller\'s order', () => {
    expect(kidPhotoMintPaths(UID, [KID])).toEqual([kidPhotoPath(UID, KID)])
    expect(kidPhotoMintPaths(UID, [KID, OTHER_UID])).toEqual([
      kidPhotoPath(UID, KID),
      kidPhotoPath(UID, OTHER_UID),
    ])
  })

  it('dedupes repeated ids and skips empty ones', () => {
    expect(kidPhotoMintPaths(UID, [KID, KID, KID])).toEqual([kidPhotoPath(UID, KID)])
    expect(kidPhotoMintPaths(UID, [KID, '', KID])).toEqual([kidPhotoPath(UID, KID)])
    expect(kidPhotoMintPaths(UID, [''])).toEqual([])
    expect(kidPhotoMintPaths(UID, [])).toEqual([])
  })
})

describe('the family photo path and visibility decision (V9 ticket 11)', () => {
  it('places a family photo at <uid>/family/photo.<ext>', () => {
    expect(familyPhotoPath(UID, 'jpg')).toBe(`${UID}/family/${FAMILY_PHOTO_FILE}.jpg`)
    expect(familyPhotoPath(UID, '.jpeg')).toBe(`${UID}/family/photo.jpeg`)
    // The encoder always produces JPEG, so 'jpg' is the default AND the value
    // every real call passes; the normaliser exists so a hostile value can never
    // be interpolated into a storage key.
    expect(familyPhotoPath(UID, '')).toBe(`${UID}/family/photo.jpg`)
    expect(familyPhotoPath(UID, '.JPG?x=1')).toBe(`${UID}/family/photo.jpgx1`)
    expect(normalizePhotoExt('PNG')).toBe('png')
    expect(normalizePhotoExt('..')).toBe('jpg')
  })

  it('is readable by any signed-in family and by nobody anonymous', () => {
    expect(familyPhotoVisibility(UID)).toBe('authenticated')
    expect(familyPhotoVisibility(OTHER_UID)).toBe('authenticated')
    expect(familyPhotoVisibility(null)).toBe('denied')
    expect(familyPhotoVisibility('')).toBe('denied')
  })

  it('resolves a stored value to the object path, accepting both stored shapes', () => {
    expect(familyPhotoObjectPath(`${UID}/family/photo.jpg`)).toBe(`${UID}/family/photo.jpg`)
    expect(familyPhotoObjectPath(`${PHOTO_BUCKET}/${UID}/family/photo.jpg`)).toBe(
      `${UID}/family/photo.jpg`,
    )
    expect(familyPhotoObjectPath(`/${UID}/family/photo.jpg`)).toBe(`${UID}/family/photo.jpg`)
  })

  it('refuses a URL, an empty value, and — the one that matters — a KID path', () => {
    // A stored URL is either dead or expiring (T6): minting from one is nonsense.
    expect(
      familyPhotoObjectPath(`https://x.supabase.co/storage/v1/object/public/avatars/${UID}/avatar`),
    ).toBeNull()
    expect(familyPhotoObjectPath(null)).toBeNull()
    expect(familyPhotoObjectPath(undefined)).toBeNull()
    expect(familyPhotoObjectPath('')).toBeNull()
    expect(familyPhotoObjectPath('   ')).toBeNull()
    // THE GUARD: a wiring mistake must not be able to turn the family renderer
    // into a kid-photo reader.
    expect(familyPhotoObjectPath(kidPhotoPath(UID, KID))).toBeNull()
    expect(familyPhotoObjectPath(kidPhotoStoredRef(UID, KID))).toBeNull()
  })

  it('drops a query/fragment instead of turning it into part of the object key', () => {
    // The avatar's public URL carries a `?v=` cache-buster; a value copied from
    // one must still resolve to the object it names.
    expect(familyPhotoObjectPath(`${PHOTO_BUCKET}/${UID}/family/photo.jpg?token=abc`)).toBe(
      `${UID}/family/photo.jpg`,
    )
    expect(familyPhotoObjectPath(`${UID}/family/photo.jpg?v=123`)).toBe(
      `${UID}/family/photo.jpg`,
    )
    expect(familyPhotoObjectPath(`${UID}/family/photo.jpg#x`)).toBe(`${UID}/family/photo.jpg`)
  })

  it('dedupes the mint list (ONE batched call per page, never one per image)', () => {
    expect(
      familyPhotoMintPaths([
        `${UID}/family/photo.jpg`,
        `${UID}/family/photo.jpg`,
        `${PHOTO_BUCKET}/${UID}/family/photo.jpg`,
        null,
        `${OTHER_UID}/family/photo.jpg`,
      ]),
    ).toEqual([`${UID}/family/photo.jpg`, `${OTHER_UID}/family/photo.jpg`])
    expect(familyPhotoMintPaths([])).toEqual([])
    expect(familyPhotoMintPaths([null, undefined, 'nonsense'])).toEqual([])
  })
})

describe('the family-photo validator REUSES the avatar rules (V9 ticket 11)', () => {
  const file = (type: string, size: number): File =>
    ({ type, size }) as unknown as File

  it('is the avatar rule, message for message, at every boundary', () => {
    const cases: File[] = [
      file('image/jpeg', 1024),
      file('image/jpeg', AVATAR_MAX_BYTES),
      file('image/jpeg', AVATAR_MAX_BYTES + 1),
      file('text/plain', 10),
      file('', 10),
    ]
    for (const input of cases) {
      expect(validateFamilyPhotoFile(input)).toBe(validateAvatarFile(input))
    }
    // Pinned literally as well, so a rewrite of BOTH functions cannot quietly
    // change the words a parent reads.
    expect(validateFamilyPhotoFile(file('application/pdf', 5))).toBe('Pick an image file (a photo).')
    expect(validateFamilyPhotoFile(file('image/png', AVATAR_MAX_BYTES + 1))).toBe(
      'Keep the photo under 5 MB.',
    )
    expect(validateFamilyPhotoFile(file('image/png', AVATAR_MAX_BYTES))).toBeNull()
  })
})

/** A mock of the one client surface the signed-URL mint uses. */
function makeStorageMock(
  rows: Array<{ path: string | null; signedUrl: string | null; error: string | null }> | null,
  error?: { message: string },
): { client: SupabaseClient; calls: Array<{ bucket: string; paths: string[]; expiresIn: number }> } {
  const calls: Array<{ bucket: string; paths: string[]; expiresIn: number }> = []
  const client = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: (paths: string[], expiresIn: number) => {
          calls.push({ bucket, paths, expiresIn })
          return Promise.resolve({ data: rows, error: error ?? null })
        },
      }),
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('signedFamilyPhotoUrlsWithClient (V9 ticket 11: batched, best-effort, keyed by the stored value)', () => {
  it('mints ONE batched call for the whole list, keyed by the value the caller holds', async () => {
    const { client, calls } = makeStorageMock([
      { path: `${UID}/family/photo.jpg`, signedUrl: 'https://x/signed-a', error: null },
    ])
    const result = await signedFamilyPhotoUrlsWithClient(client, [`${UID}/family/photo.jpg`])
    expect(result).toEqual({ [`${UID}/family/photo.jpg`]: 'https://x/signed-a' })
    // The BATCHED API (createSignedUrls) with the whole path list at once.
    expect(calls).toEqual([
      { bucket: PHOTO_BUCKET, paths: [`${UID}/family/photo.jpg`], expiresIn: FAMILY_PHOTO_URL_TTL_SECONDS },
    ])
  })

  it('issues NO call at all when there is nothing mintable', async () => {
    const { client, calls } = makeStorageMock([])
    expect(await signedFamilyPhotoUrlsWithClient(client, [null, undefined, '', kidPhotoPath(UID, KID)])).toEqual({})
    expect(calls).toEqual([])
  })

  it('NEVER throws: a storage error, a null row and a thrown call all land as "no image"', async () => {
    const errored = makeStorageMock(null, { message: 'bucket not found' })
    expect(await signedFamilyPhotoUrlsWithClient(errored.client, [`${UID}/family/photo.jpg`])).toEqual({})

    const partial = makeStorageMock([
      { path: `${UID}/family/photo.jpg`, signedUrl: null, error: 'Object not found' },
      { path: null, signedUrl: 'https://x/ignored', error: null },
    ])
    expect(await signedFamilyPhotoUrlsWithClient(partial.client, [`${UID}/family/photo.jpg`])).toEqual({})

    const throwing = {
      storage: {
        from: () => ({
          createSignedUrls: () => Promise.reject(new Error('network down')),
        }),
      },
    } as unknown as SupabaseClient
    expect(await signedFamilyPhotoUrlsWithClient(throwing, [`${UID}/family/photo.jpg`])).toEqual({})
  })

  it('never returns a URL for a value that cannot be minted', async () => {
    const { client } = makeStorageMock([
      { path: `${UID}/family/photo.jpg`, signedUrl: 'https://x/signed-a', error: null },
    ])
    const result = await signedFamilyPhotoUrlsWithClient(client, [
      `kid-photos/${UID}/kids/${KID}`,
      `${UID}/family/photo.jpg`,
    ])
    expect(Object.keys(result)).toEqual([`${UID}/family/photo.jpg`])
  })
})

describe('signedKidPhotoUrlsWithClient (V12 t04: batched, best-effort, keyed by kid id)', () => {
  it('mints ONE batched call for the whole kid list, keyed by KID ID', async () => {
    const { client, calls } = makeStorageMock([
      { path: kidPhotoPath(UID, KID), signedUrl: 'https://x/signed-kid', error: null },
    ])
    const result = await signedKidPhotoUrlsWithClient(client, UID, [KID])
    expect(result).toEqual({ [KID]: 'https://x/signed-kid' })
    // The BATCHED API (createSignedUrls) with the whole path list at once.
    expect(calls).toEqual([
      { bucket: PHOTO_BUCKET, paths: [kidPhotoPath(UID, KID)], expiresIn: FAMILY_PHOTO_URL_TTL_SECONDS },
    ])
  })

  it('issues NO call at all when there are no mintable kid ids', async () => {
    const { client, calls } = makeStorageMock([])
    expect(await signedKidPhotoUrlsWithClient(client, UID, [])).toEqual({})
    expect(await signedKidPhotoUrlsWithClient(client, UID, ['', ''])).toEqual({})
    expect(calls).toEqual([])
  })

  it('NEVER throws: a storage error, a missing object, and a thrown call all land as "no image"', async () => {
    const errored = makeStorageMock(null, { message: 'bucket not found' })
    expect(await signedKidPhotoUrlsWithClient(errored.client, UID, [KID])).toEqual({})

    const missing = makeStorageMock([
      { path: kidPhotoPath(UID, KID), signedUrl: null, error: 'Object not found' },
      { path: null, signedUrl: 'https://x/ignored', error: null },
    ])
    expect(await signedKidPhotoUrlsWithClient(missing.client, UID, [KID])).toEqual({})

    const throwing = {
      storage: {
        from: () => ({
          createSignedUrls: () => Promise.reject(new Error('network down')),
        }),
      },
    } as unknown as SupabaseClient
    expect(await signedKidPhotoUrlsWithClient(throwing, UID, [KID])).toEqual({})
  })
})

describe('profileBlurbOrder (V9 ticket 11; V16 t05 re-pinned the order; V23 s16 named every block)', () => {
  it('returns EVERY present block in the pinned order: user, kids, about, photo', () => {
    expect(
      profileBlurbOrder({ family_photo_url: `${UID}/family/photo.jpg`, bio: 'Hi' }, true),
    ).toEqual(['user', 'kids', 'about', 'familyPhoto'])
  })

  it('drops each optional block independently (the identity card is always there)', () => {
    expect(profileBlurbOrder({ family_photo_url: null, bio: 'Hi' }, true)).toEqual([
      'user',
      'kids',
      'about',
    ])
    expect(profileBlurbOrder({ family_photo_url: `${UID}/family/photo.jpg` }, true)).toEqual([
      'user',
      'kids',
      'familyPhoto',
    ])
    expect(profileBlurbOrder({ bio: 'Hi' }, false)).toEqual(['user', 'about'])
  })

  it('an empty profile still shows the identity card — "looks finished with none of them"', () => {
    expect(profileBlurbOrder(null, false)).toEqual(['user'])
    expect(profileBlurbOrder({ family_photo_url: null, bio: null }, false)).toEqual(['user'])
    // A whitespace-only bio is empty (the /u/:handle render's own rule).
    expect(profileBlurbOrder({ bio: '   ' }, false)).toEqual(['user'])
  })

  it('V16 t05: the family photo is the CLOSER of the optional blocks, never their opener', () => {
    // The founder's reorder ask — kids first, family photo last — pinned so a
    // later edit cannot quietly restore the old leading photo.
    const blocks = profileBlurbOrder(
      { family_photo_url: `${UID}/family/photo.jpg`, bio: 'Hi' },
      true,
    )
    expect(blocks[blocks.indexOf('kids')]).toBe('kids')
    expect(blocks[blocks.length - 1]).toBe('familyPhoto')
  })

  it('counts a photo URL that is not mintable as NO photo (the render would show nothing)', () => {
    expect(profileBlurbOrder({ family_photo_url: 'https://x/object/public/a/b.jpg' }, false)).toEqual([
      'user',
    ])
    expect(profileBlurbOrder({ family_photo_url: kidPhotoPath(UID, KID) }, false)).toEqual(['user'])
  })

  it('V23 s16: the read surface omits the editor-only parent cards', () => {
    expect(
      profileBlurbOrder({ family_photo_url: `${UID}/family/photo.jpg`, bio: 'Hi' }, true, 'read'),
    ).toEqual(['user', 'kids', 'about', 'familyPhoto'])
  })

  it('V23 s16: the edit surface appends the ALWAYS-present parent cards AFTER the shared sequence', () => {
    // Their empty states are still rendered cards, so unlike the optional blocks
    // they are not gated on content — an empty profile still gets them.
    expect(
      profileBlurbOrder({ family_photo_url: `${UID}/family/photo.jpg`, bio: 'Hi' }, true, 'edit'),
    ).toEqual(['user', 'kids', 'about', 'familyPhoto', 'parentCards'])
    expect(profileBlurbOrder(null, false, 'edit')).toEqual(['user', 'parentCards'])
  })

  it('V24 11B: the "About the parents" block renders for parent NAMES alone (finding N1)', () => {
    // 11A made the read surface render its heading for a family whose only
    // content there is the parent names, while this seam pushed 'about' only for
    // a bio — the seam said a block did not exist that the DOM showed. The
    // fourth argument closes that gap: the read surface's heading gate is now
    // this function's output, not a second condition beside it.
    expect(profileBlurbOrder({ bio: null }, false, 'read', true)).toEqual(['user', 'about'])
    expect(profileBlurbOrder(null, false, 'read', true)).toEqual(['user', 'about'])
    // ...and it changes nothing when no names are visible (the default).
    expect(profileBlurbOrder({ bio: null }, false, 'read')).toEqual(['user'])
    // The photo still closes the block the names opened.
    expect(
      profileBlurbOrder({ bio: null, family_photo_url: `${UID}/family/photo.jpg` }, false, 'read', true),
    ).toEqual(['user', 'about', 'familyPhoto'])
  })

  it('V24 11B: the retired linked-parent block is not part of any surface', () => {
    // The linking AFFORDANCE moved inside the parent cards and the linked NAME
    // renders inside 'about'; naming a block that renders nowhere is the
    // falsehood finding N1 was about.
    const everyBlock = [
      ...profileBlurbOrder({ bio: 'Hi', family_photo_url: `${UID}/family/photo.jpg` }, true, 'edit', true),
      ...profileBlurbOrder({ bio: 'Hi' }, true, 'read', true),
    ]
    expect(everyBlock).not.toContain('linkedParent')
  })
})

describe('profileHasBio (V24 11B: the one bio test the seam and the view share)', () => {
  it('is false for null, absent, and whitespace-only bios', () => {
    expect(profileHasBio(null)).toBe(false)
    expect(profileHasBio({})).toBe(false)
    expect(profileHasBio({ bio: null })).toBe(false)
    expect(profileHasBio({ bio: '   ' })).toBe(false)
  })

  it('is true for any real text', () => {
    expect(profileHasBio({ bio: 'We like parks.' })).toBe(true)
  })
})

