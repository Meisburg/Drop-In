/**
 * Unit tests for the V2 ticket-02 pure helpers in db.ts (the Supabase-
 * facing round-trips around them are covered by the e2e specs; these
 * validators + caps are pure and unit-testable, per the plan-v2 Interfaces
 * seam: "validators are pure").
 *
 * Note: importing db.ts runs its module-scope Supabase client creation,
 * which reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the repo .env
 * (Vitest inherits Vite's env loading). The gate runs in this repo, where
 * .env is present.
 */
import { describe, expect, it } from 'vitest'
import {
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_PX,
  BIO_MAX_LENGTH,
  MAX_KIDS_PER_PROFILE,
  validateAvatarFile,
  validateBio,
  kidAgeFromInput,
  validateKid,
} from './db'

function makeFile(bytes: number, type = 'image/png'): File {
  return new File([new Uint8Array(bytes)], 'photo.png', { type })
}

describe('the avatar pipeline constants', () => {
  // Pins the two decisions that the encoder depends on, so reverting either one
  // fails a test instead of silently changing what every upload produces.
  //
  // AVATAR_SIZE_PX: 256 until photo-crop ticket 04. 256 was sized for the 24px feed
  // circles, but V6's lightbox renders an avatar at essentially full screen, where a
  // 256px square on a 390pt phone is a ~4.5x upscale. 512 is 2x what the circles need
  // and encodes to under 6KB.
  it('stores a 512px square', () => {
    expect(AVATAR_SIZE_PX).toBe(512)
  })

  it('caps the input at 5MB', () => {
    expect(AVATAR_MAX_BYTES).toBe(5 * 1024 * 1024)
  })
})

describe('validateAvatarFile (V2 ticket 02)', () => {
  it('accepts a small image', () => {
    expect(validateAvatarFile(makeFile(1000))).toBeNull()
  })

  it('accepts exactly the 5 MB cap', () => {
    expect(validateAvatarFile(makeFile(AVATAR_MAX_BYTES))).toBeNull()
  })

  it('rejects a file over 5 MB (before any upload — ticket AC)', () => {
    expect(validateAvatarFile(makeFile(AVATAR_MAX_BYTES + 1))).toMatch(/5 MB/)
  })

  it('rejects non-image types', () => {
    expect(validateAvatarFile(makeFile(1000, 'application/pdf'))).toMatch(/image/)
  })
})

describe('validateBio (V2 ticket 02)', () => {
  it('accepts up to 500 characters', () => {
    expect(validateBio('a'.repeat(BIO_MAX_LENGTH))).toBeNull()
  })

  it('rejects 501+ characters', () => {
    expect(validateBio('a'.repeat(BIO_MAX_LENGTH + 1))).toMatch(/500/)
  })

  it('trims before measuring (502 raw chars → 500 after trim → valid)', () => {
    expect(validateBio(` ${'a'.repeat(BIO_MAX_LENGTH)} `)).toBeNull()
  })
})

describe('validateKid (V2 ticket 02 — first name + age only, the privacy pin)', () => {
  it('accepts a first name + an in-range age', () => {
    expect(validateKid('Ava', 7)).toBeNull()
  })

  it('accepts the boundary ages 0 and 17', () => {
    expect(validateKid('Ava', 0)).toBeNull()
    expect(validateKid('Max', 17)).toBeNull()
  })

  it('accepts a blank first name (V9 ticket 05 makes the name OPTIONAL)', () => {
    // THE RULE CHANGE, quoted: the ticket's AC — "the field is not required to
    // save a kid". This assertion used to be
    // `expect(validateKid('   ', 7)).toMatch(/first name/)`, i.e. the opposite
    // rule; the AC it enforced ("Give your kid a first name.") is exactly what
    // this ticket removes, so the old expectation had to go. The age rule below
    // is UNCHANGED and still guards the write.
    expect(validateKid('   ', 7)).toBeNull()
    expect(validateKid('', 4)).toBeNull()
  })

  it('rejects out-of-range ages (these are kids, 0–17)', () => {
    expect(validateKid('Ava', -1)).toMatch(/0 to 17/)
    expect(validateKid('Ava', 18)).toMatch(/0 to 17/)
  })

  it('rejects non-integer ages', () => {
    expect(validateKid('Ava', NaN)).toMatch(/0 to 17/)
  })
})

describe('kidAgeFromInput (the blank-age rule, V28 r2 fix round 2 R4)', () => {
  it('a blank age input is NaN, never 0 (0 is a LEGAL age, so a name-only row must be refused)', () => {
    expect(kidAgeFromInput('')).toBeNaN()
    expect(kidAgeFromInput('   ')).toBeNaN()
    // The trap this exists for: the bare `Number('')` the Continue write used
    // pre-R4 is 0, and `validateKid` passes 0 — a fabricated age-0 kid.
    expect(Number('')).toBe(0)
    expect(kidAgeFromInput('')).not.toBe(Number(''))
  })

  it('a filled age input is Number-parsed (whitespace-trimmed)', () => {
    expect(kidAgeFromInput('6')).toBe(6)
    expect(kidAgeFromInput('  12 ')).toBe(12)
  })

  it('a non-numeric age input is NaN (the same refusal, not a crash)', () => {
    expect(kidAgeFromInput('abc')).toBeNaN()
  })

  it('feeds the age seam: blank is refused by validateKid, a real 0 is legal', () => {
    expect(validateKid('Ava', kidAgeFromInput(''))).toMatch(/0 to 17/)
    expect(validateKid('Ava', kidAgeFromInput('0'))).toBeNull()
    expect(validateKid('Ava', kidAgeFromInput('7'))).toBeNull()
  })
})

// V28 r2 slice 8a: `missingProfileItems` + `MissingProfileItem` (the /settings
// nudge banner's completeness seam, V2 ticket 02) were DELETED — the section
// these tests pinned. Measured at 8d1170d: 0 production callers (the only
// `src/` mention was a sentence in App.tsx's nudge docblock, which named it as
// the seam the nudge does NOT use), so the tests were pinning a function
// nobody called. The nudge's own hasKids fact is a lazy `listKids` read in
// App.tsx, which is what the docblock now says.

describe('MAX_KIDS_PER_PROFILE (plan-v2 Interfaces: app-enforced cap)', () => {
  it('is 5', () => {
    expect(MAX_KIDS_PER_PROFILE).toBe(5)
  })
})