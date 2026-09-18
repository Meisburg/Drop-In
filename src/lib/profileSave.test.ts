/**
 * Unit tests for the /settings autosave seam (V8 ticket 10; the page
 * autosaves since V12 t01): the changed-section patch builder behind one
 * autosave pass.
 *
 * The three things these tests exist for:
 *  1. only CHANGED sections are written (a no-op pass issues no write);
 *  2. change is compared TRIMMED, and a kid's age as a NUMBER;
 *  3. an INVALID section blocks only itself — the other sections still write,
 *     and an invalid value still counts as a change (so it stays pending,
 *     not dropped).
 */
import { describe, expect, it } from 'vitest'
import {
  changedProfileSections,
  kidRowChanged,
  normalizeKidAge,
  planProfileSave,
  seedKidDrafts,
  seedProfileFormValues,
  toKidRowValues,
  toKidSave,
  type ProfileFormValues,
  type KidRowValues,
} from './profileSave'

const BASE: ProfileFormValues = {
  name: 'Sam at Green Lake',
  homeZip: '98107',
  radiusMiles: 5,
  bio: 'Two kids, one dog.',
  interests: 'Legos',
}

/** A stand-in for db.ts's validators (the messages are the page's, not the seam's). */
const validators = {
  name: (value: string) => (value.trim() === '' ? 'Give your family a name.' : null),
  bio: (value: string) => (value.length > 500 ? 'Keep the bio to 500 characters.' : null),
  interests: (value: string) =>
    value.trim().length > 120 ? 'Keep interests to 120 characters.' : null,
  kid: (kid: { firstName: string; age: number; likes: string }) => {
    // V9 ticket 05 (review cycle 1, F11): this mock used to begin
    // `if (kid.firstName.trim() === '') return 'Give your kid a first name.'` —
    // the rule db.validateKidName no longer has. The stand-in now mirrors the
    // real validator: a blank name is valid (it is written as NULL).
    if (!Number.isInteger(kid.age) || kid.age < 0 || kid.age > 17) {
      return 'Age must be a whole number from 0 to 17.'
    }
    if (kid.likes.trim().length > 100) return 'Keep likes to 100 characters.'
    return null
  },
}

const KID: KidRowValues = { id: 'kid-1', firstName: 'Bernie', age: 6, likes: 'dinosaurs' }

function plan(
  draft: Partial<ProfileFormValues>,
  kids: { rows?: KidRowValues[]; drafts?: Parameters<typeof planProfileSave>[0]['kidDrafts'] } = {},
) {
  return planProfileSave({
    baseline: BASE,
    draft: { ...BASE, ...draft },
    kidRows: kids.rows ?? [],
    kidDrafts: kids.drafts ?? {},
    validators,
  })
}

describe('planProfileSave — only the changed sections are written', () => {
  it('an untouched form is empty: a no-op save issues no write', () => {
    const result = plan({})
    expect(result.empty).toBe(true)
    expect(result.sections).toEqual([])
    expect(result.blockedSections).toEqual([])
    expect(result.kids).toEqual([])
    expect(result.blockedKids).toEqual([])
  })

  it('whitespace-only typing is not an edit (the comparison is trimmed)', () => {
    const result = plan({
      name: `  ${BASE.name}  `,
      homeZip: ` ${BASE.homeZip} `,
      bio: `${BASE.bio}\n`,
      interests: ` ${BASE.interests}`,
    })
    expect(result.empty).toBe(true)
    expect(result.sections).toEqual([])
  })

  it('writes only the section that changed, in the form’s own order', () => {
    expect(plan({ bio: 'Three kids now.' }).sections).toEqual(['bio'])
    expect(plan({ name: 'Sam at Ballard', interests: 'Legos and trains' }).sections).toEqual([
      'name',
      'interests',
    ])
    expect(plan({ name: 'Sam at Ballard', bio: 'Three kids now.', radiusMiles: 20 }).sections).toEqual(
      ['name', 'location', 'bio'],
    )
  })

  it('a radius-only change is still the location section', () => {
    const result = plan({ radiusMiles: 20 })
    expect(result.sections).toEqual(['location'])
  })

  it('clearing a field is a change (the writers clear on an empty string)', () => {
    const result = plan({ bio: '', interests: '   ' })
    expect(result.sections).toEqual(['bio', 'interests'])
  })
})

describe('planProfileSave — an invalid section blocks only itself', () => {
  it('the blocked section carries the inline message and stays unwritten', () => {
    const draft = { ...BASE, name: '   ', bio: 'x'.repeat(501) }
    expect(changedProfileSections(BASE, draft)).toEqual(['name', 'bio'])
    const result = planProfileSave({
      baseline: BASE,
      draft,
      kidRows: [],
      kidDrafts: {},
      validators,
    })
    expect(result.sections).toEqual([])
    expect(result.blockedSections).toEqual([
      { section: 'name', error: 'Give your family a name.' },
      { section: 'bio', error: 'Keep the bio to 500 characters.' },
    ])
    // An invalid edit is still an edit: the form stays dirty (the guard warns).
    expect(result.empty).toBe(false)
  })

  it('a valid section still writes while a sibling is blocked', () => {
    const result = plan({ name: '   ', interests: 'Legos and trains' })
    expect(result.sections).toEqual(['interests'])
    expect(result.blockedSections).toEqual([
      { section: 'name', error: 'Give your family a name.' },
    ])
    expect(result.empty).toBe(false)
  })

  it('the location section is left to the write path (the zip rule needs the gazetteer)', () => {
    const result = plan({ homeZip: '00000' })
    expect(result.sections).toEqual(['location'])
    expect(result.blockedSections).toEqual([])
  })
})

describe('planProfileSave — kid rows', () => {
  it('an unchanged row is not written', () => {
    const result = plan({}, { rows: [KID], drafts: {} })
    expect(result.empty).toBe(true)
    expect(result.kids).toEqual([])
  })

  it('a name + age edit normalizes and writes one row', () => {
    const result = plan(
      {},
      { rows: [KID], drafts: { 'kid-1': { firstName: '  Bernadette ', age: '07', likes: 'dinosaurs' } } },
    )
    expect(result.kids).toEqual([
      { id: 'kid-1', firstName: 'Bernadette', age: 7, likes: 'dinosaurs' },
    ])
    expect(result.blockedKids).toEqual([])
    expect(result.empty).toBe(false)
  })

  it('a likes edit alone writes the row', () => {
    const result = plan(
      {},
      { rows: [KID], drafts: { 'kid-1': { firstName: 'Bernie', age: '6', likes: '  sharks ' } } },
    )
    expect(result.kids).toEqual([{ id: 'kid-1', firstName: 'Bernie', age: 6, likes: 'sharks' }])
  })

  it('an invalid row is blocked with its own message, and never blocks another row', () => {
    const rows: KidRowValues[] = [KID, { id: 'kid-2', firstName: 'Lily', age: 4, likes: '' }]
    const result = plan(
      {},
      {
        rows,
        drafts: {
          'kid-1': { firstName: 'Bernie', age: '', likes: 'dinosaurs' },
          'kid-2': { firstName: 'Lily', age: '5', likes: 'sharks' },
        },
      },
    )
    expect(result.kids).toEqual([{ id: 'kid-2', firstName: 'Lily', age: 5, likes: 'sharks' }])
    expect(result.blockedKids).toEqual([
      { id: 'kid-1', error: 'Age must be a whole number from 0 to 17.' },
    ])
    expect(result.empty).toBe(false)
  })

  it('a cleared age is a change, not a no-op', () => {
    expect(kidRowChanged(KID, { firstName: 'Bernie', age: '', likes: 'dinosaurs' })).toBe(true)
    expect(kidRowChanged(KID, { firstName: 'Bernie', age: '6', likes: 'dinosaurs' })).toBe(false)
    // "06" is the same age, not an edit (the value is compared as a NUMBER).
    expect(kidRowChanged(KID, { firstName: 'Bernie', age: '06', likes: 'dinosaurs' })).toBe(false)
    expect(kidRowChanged(KID, undefined)).toBe(false)
  })

  it('a blank age becomes NaN on the wire (never a coerced 0)', () => {
    expect(toKidSave(KID, { firstName: 'Bernie', age: '', likes: '' }).age).toBeNaN()
    expect(normalizeKidAge('')).toBeNull()
    expect(normalizeKidAge('   ')).toBeNull()
    expect(normalizeKidAge('18')).toBeNull()
    expect(normalizeKidAge('-1')).toBeNull()
    expect(normalizeKidAge('6.5')).toBeNull()
    expect(normalizeKidAge(' 6 ')).toBe(6)
    expect(normalizeKidAge('0')).toBe(0)
    expect(normalizeKidAge('17')).toBe(17)
  })

  it('a kid row with no draft falls back to the row itself (nothing to write)', () => {
    const save = toKidSave(KID, undefined)
    expect(save).toEqual({ id: 'kid-1', firstName: 'Bernie', age: 6, likes: 'dinosaurs' })
    expect(planProfileSave({ baseline: BASE, draft: BASE, kidRows: [KID], kidDrafts: {} }).empty).toBe(
      true,
    )
  })
})

describe('seedProfileFormValues / seedKidDrafts (the seed-once discipline)', () => {
  it('seeds the form from the profile row, with pre-0022 columns as empty strings', () => {
    expect(
      seedProfileFormValues({ display_name: 'Sam' }, 5),
    ).toEqual({ name: 'Sam', homeZip: '', radiusMiles: 5, bio: '', interests: '' })
    expect(seedProfileFormValues({ display_name: 'Sam', radius_miles: null }, 5).radiusMiles).toBe(5)
    expect(
      seedProfileFormValues(
        { display_name: 'Sam', home_zip: '98107', radius_miles: 20, bio: 'hi', interests: 'Legos' },
        5,
      ),
    ).toEqual({ name: 'Sam', homeZip: '98107', radiusMiles: 20, bio: 'hi', interests: 'Legos' })
  })

  it('an in-flight kid draft wins over a re-list (typing is never dropped)', () => {
    const rows: KidRowValues[] = [KID, { id: 'kid-2', firstName: 'Lily', age: 4, likes: '' }]
    const inFlight = { 'kid-1': { firstName: 'Bernadette', age: '7', likes: 'sharks' } }
    const seeded = seedKidDrafts(rows, inFlight)
    expect(seeded['kid-1']).toEqual(inFlight['kid-1'])
    expect(seeded['kid-2']).toEqual({ firstName: 'Lily', age: '4', likes: '' })
  })

  it('maps a loaded kid row to the comparison shape (likes default to empty)', () => {
    // The row's saved likes (0022; absent pre-apply) — kept as-is.
    expect(toKidRowValues({ id: 'kid-1', first_name: 'Bernie', age: 6, likes: 'dinosaurs' })).toEqual(
      KID,
    )
    expect(toKidRowValues({ id: 'kid-1', first_name: 'Bernie', age: 6 }).likes).toBe('')
    expect(toKidRowValues({ id: 'kid-2', first_name: 'Lily', age: 4, likes: null }).likes).toBe('')
  })
})
