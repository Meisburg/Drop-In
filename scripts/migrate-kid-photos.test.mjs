/**
 * THE CROSS-CHECK (V9 ticket 11): the move script and the client must agree on
 * the path rules, or the migration is wrong in a way nothing else would catch.
 *
 * `scripts/migrate-kid-photos.mjs` decides WHICH objects are kid photos and WHAT
 * value `kids.avatar_url` becomes after the move. The client's own rules live in
 * `src/lib/photoStorage.ts` (used by the app, the render sites and the exposure
 * spec). The two cannot share code — the script is plain JS run by node, the
 * module is TypeScript built by Vite — so the script carries a second copy of two
 * tiny rules, and THIS FILE is what makes that safe: it imports both and asserts
 * they answer identically. If they ever drift, the script would move the wrong
 * objects, or leave kid photos sitting in the public bucket while reporting
 * success, and this test fails instead.
 *
 * WHY THIS FILE IS `.mjs` AND LIVES OUTSIDE `src/`: `tsc -b` (part of
 * `npm run build`) cannot type a `../scripts/*.mjs` import and the app project
 * only includes `src/`, so a `.ts` version here would either be unchecked
 * silently or need a declaration shim — and a shim is exactly the thing that
 * would hide a drift. Vitest transforms both files regardless of which is
 * TypeScript, so the cross-check runs on every `npm run test`.
 *
 * It also proves the script's IMPORT IS SIDE-EFFECT-FREE: `main()` is guarded by
 * the entry-point check, so importing it here opens no browser, reads no .env,
 * obtains no service-role key and writes nothing. If that guard were removed,
 * this file could not load without a CDP Chrome on :9222 — which is a test
 * failure, not a hang, because the guard's absence shows up immediately.
 */
import { describe, expect, it } from 'vitest'
import {
  PHOTO_BUCKET,
  isKidPhotoPath,
  kidPhotoPath,
  kidPhotoStoredRef,
} from '../src/lib/photoStorage.ts'
import {
  KIDS_FOLDER,
  avatarUrlRewriteSql,
  fingerprint,
  isKidPhotoPath as scriptIsKidPhotoPath,
  kidPhotoPathParts,
  kidPhotoStoredRef as scriptKidPhotoStoredRef,
  planKidPhotoMoves,
} from './migrate-kid-photos.mjs'

const UID = '11111111-2222-4333-8444-555555555555'
const KID = '99999999-8888-4777-8666-555555555555'
const OTHER_UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('the move script and photoStorage agree (V9 ticket 11)', () => {
  it('classifies the same paths the same way', () => {
    const paths = [
      `${UID}/kids/${KID}`,
      `${PHOTO_BUCKET}/${UID}/kids/${KID}`,
      `${UID}/avatar`,
      `${UID}/family/photo.jpg`,
      `kids/${UID}/${KID}`,
      `${UID}/kids`,
      `${UID}/kids/${KID}/extra`,
      'nonsense',
      '',
    ]
    for (const objectPath of paths) {
      expect(scriptIsKidPhotoPath(objectPath), objectPath).toBe(isKidPhotoPath(objectPath))
    }
  })

  it('writes the SAME stored reference the client expects', () => {
    expect(scriptKidPhotoStoredRef(UID, KID)).toBe(kidPhotoStoredRef(UID, KID))
    expect(scriptKidPhotoStoredRef(UID, KID)).toBe(`${PHOTO_BUCKET}/${kidPhotoPath(UID, KID)}`)
    expect(KIDS_FOLDER).toBe('kids')
  })

  it('plans only kid-class moves, and marks an existing destination as already-copied', () => {
    const plan = planKidPhotoMoves(
      [`${UID}/kids/${KID}`, `${UID}/avatar`, `${OTHER_UID}/kids/${KID}`],
      [`${OTHER_UID}/kids/${KID}`, `${UID}/family/photo.jpg`],
    )
    expect(plan.moves).toEqual([
      { path: `${UID}/kids/${KID}`, destination: `${UID}/kids/${KID}`, existing: false },
      { path: `${OTHER_UID}/kids/${KID}`, destination: `${OTHER_UID}/kids/${KID}`, existing: true },
    ])
    // The parent avatar and the family photo are NOT part of the move.
    expect(plan.moves.map((move) => move.path)).not.toContain(`${UID}/avatar`)
    expect(plan.orphans).toEqual([])
  })

  it('treats a private kid object with no public source as nothing to do (idempotent re-run)', () => {
    const plan = planKidPhotoMoves([], [`${UID}/kids/${KID}`])
    expect(plan.moves).toEqual([])
    expect(plan.orphans).toEqual([`${UID}/kids/${KID}`])
  })

  it('rewrites avatar_url only for a uuid path whose owner matches the row', () => {
    expect(kidPhotoPathParts(`${UID}/kids/${KID}`)).toEqual({ profileId: UID, kidId: KID })
    expect(kidPhotoPathParts(`${UID}/kids/not-a-uuid`)).toBeNull()
    expect(kidPhotoPathParts(`${UID}/kids/${KID}/extra`)).toBeNull()
    const sql = avatarUrlRewriteSql(UID, KID)
    expect(sql).toContain(`'${kidPhotoStoredRef(UID, KID)}'`)
    expect(sql).toContain(`id = '${KID}'`)
    expect(sql).toContain(`profile_id = '${UID}'`)
    // It only ever touches a row still holding the OLD public URL shape — so a
    // re-run cannot rewrite a value it already repointed.
    expect(sql).toContain("avatar_url like '%/storage/v1/object/public/avatars/%'")
  })

  it('fingerprints equal bytes equally and different bytes differently (verify-then-delete)', () => {
    const a = new Uint8Array([1, 2, 3, 4])
    const b = new Uint8Array([1, 2, 3, 4])
    const c = new Uint8Array([1, 2, 3])
    expect(fingerprint(a)).toBe(fingerprint(b))
    expect(fingerprint(a)).not.toBe(fingerprint(c))
    // SHA-256 (review cycle 1, F4 — it replaced a 32-bit FNV-1a): 64 hex chars,
    // and the length travels with the digest so a truncated copy cannot match.
    const [digest, length] = fingerprint(a).split(':')
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(length).toBe('4')
    expect(fingerprint(c).split(':')[1]).toBe('3')
  })

  it('fingerprints the SAME bytes identically across calls (the read-back may differ in buffer identity)', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    // A Buffer and a Uint8Array over the same bytes must fingerprint the same:
    // the source is read from the network and the read-back from another response.
    expect(fingerprint(Buffer.from(bytes))).toBe(fingerprint(bytes))
  })
})
