/**
 * The /profile save seam (V8 ticket 10): "Save profile" is ONE submit for the
 * whole form, and it writes ONLY the sections that actually changed.
 *
 * WHY THIS EXISTS. /profile used to carry six separate Save buttons (display
 * name, location, bio, interests, plus one per kid row). Six buttons means six
 * round trips for one intention, six places a parent has to remember to press,
 * and — the real cost — six ways to walk away believing you saved something
 * you did not. One submit fixes that, but one submit has a decision in it:
 * which sections does this submit actually write? That decision is pure and
 * lives here, so it is unit-tested instead of being spread across the page's
 * handlers.
 *
 * THE RULES (the pins):
 *  - CHANGE IS COMPARED TRIMMED. Typing a trailing space is not an edit; it
 *    must not make the form dirty, and it must not put a whitespace-only
 *    value on the wire (the writers trim too — this is the same rule, one
 *    step earlier).
 *  - A NO-OP SAVE ISSUES NO WRITE AT ALL (`empty: true`): no request, no
 *    "Profile saved." lie.
 *  - INVALID BLOCKS ONLY ITSELF. A section (or one kid row) that is changed
 *    but fails its validator goes into `blocked*` with the message the inline
 *    error already shows; every other changed section still writes. The page
 *    keeps the per-section inline errors it always had — this seam just
 *    decides what a submit may write, not what it may say.
 *  - AN INVALID VALUE IS STILL A CHANGE. Clearing a kid's age is not "no
 *    edit" — it is an edit that cannot be saved yet, so it stays pending
 *    (the form stays dirty, the guard still warns) instead of vanishing.
 *
 * Validation is INJECTED (the page passes db.ts's own validators) so the seam
 * stays pure and free of React/Supabase, the feed.ts / trust.ts convention.
 */

/** The form sections that ride the one "Save profile" submit. */
export type ProfileSection = 'name' | 'location' | 'bio' | 'interests'

/** The profile section values as EDITABLE TEXT (name/zip/bio/interests + the radius). */
export interface ProfileFormValues {
  name: string
  homeZip: string
  radiusMiles: number
  bio: string
  interests: string
}

/**
 * One kid row's editable values. `age` is the INPUT's string (an empty field
 * is a real state — Number('') is 0, the add-kid trap), never a coerced 0.
 */
export interface KidFormValues {
  firstName: string
  age: string
  likes: string
}

/** One kid row as it stands on the server (the save baseline). */
export interface KidRowValues {
  id: string
  firstName: string
  age: number
  likes: string
}

/** A kid row write, normalized: trimmed text, age as the integer (NaN when blank/invalid). */
export interface KidSave {
  id: string
  firstName: string
  age: number
  likes: string
}

/** What one submit may write, and what it may not (with the inline message for each). */
export interface ProfileSavePlan {
  /** Changed AND valid sections, in the form's own order. */
  sections: ProfileSection[]
  /** Changed but invalid — the inline error is already on screen; nothing is written. */
  blockedSections: Array<{ section: ProfileSection; error: string }>
  /** Changed AND valid kid rows, in the rows' own order. */
  kids: KidSave[]
  /** Changed but invalid kid rows (one row's error never blocks another row). */
  blockedKids: Array<{ id: string; error: string }>
  /** True when NOTHING differs, valid or not — a no-op save issues no write. */
  empty: boolean
}

/**
 * The validators, injected by the caller (the page passes db.ts's own — the
 * single source of each message, so the seam can never disagree with what the
 * field renders inline).
 */
export interface ProfileSaveValidators {
  name?: (value: string) => string | null
  bio?: (value: string) => string | null
  interests?: (value: string) => string | null
  kid?: (kid: KidSave) => string | null
}

/** The profile row a fresh /profile seeds its form from (pre-0022 columns optional). */
export interface ProfileSeedSource {
  display_name: string
  bio?: string | null
  interests?: string | null
  home_zip?: string | null
  radius_miles?: number | null
}

/** The whole-form input: what is on the server, what is in the inputs. */
export interface ProfileSaveInput {
  baseline: ProfileFormValues
  draft: ProfileFormValues
  kidRows: KidRowValues[]
  kidDrafts: Record<string, KidFormValues>
  validators?: ProfileSaveValidators
}

/**
 * The kid age field's value as a number: an integer 0–17, or null when the
 * field is blank or not a whole number in range. Null is what makes an
 * invalid edit count as a CHANGE (see the header) and what the injected
 * validator turns into the inline "Age must be a whole number from 0 to 17."
 */
export function normalizeKidAge(age: string): number | null {
  const trimmed = age.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < 0 || value > 17) return null
  return value
}

/** Trimmed comparison for the text fields (a trailing space is not an edit). */
function differs(a: string, b: string): boolean {
  return a.trim() !== b.trim()
}

/** The sections whose draft differs from the baseline, in the form's own order. */
export function changedProfileSections(
  baseline: ProfileFormValues,
  draft: ProfileFormValues,
): ProfileSection[] {
  const sections: ProfileSection[] = []
  if (differs(draft.name, baseline.name)) sections.push('name')
  if (
    differs(draft.homeZip, baseline.homeZip) ||
    draft.radiusMiles !== baseline.radiusMiles
  ) {
    sections.push('location')
  }
  if (differs(draft.bio, baseline.bio)) sections.push('bio')
  if (differs(draft.interests, baseline.interests)) sections.push('interests')
  return sections
}

/**
 * One kid row as its draft would be written: the trimmed text + the parsed
 * age (NaN when the field is blank/out of range, so the injected validator
 * rejects it rather than the write silently storing a 0).
 */
export function toKidSave(row: KidRowValues, draft: KidFormValues | undefined): KidSave {
  const source = draft ?? { firstName: row.firstName, age: String(row.age), likes: row.likes }
  return {
    id: row.id,
    firstName: source.firstName.trim(),
    age: normalizeKidAge(source.age) ?? NaN,
    likes: source.likes.trim(),
  }
}

/** True when this kid row's draft differs from the row (age compared as a NUMBER). */
export function kidRowChanged(row: KidRowValues, draft: KidFormValues | undefined): boolean {
  if (draft === undefined) return false
  if (differs(draft.firstName, row.firstName)) return true
  if (differs(draft.likes, row.likes)) return true
  const age = normalizeKidAge(draft.age)
  // A blank/invalid age is an edit that cannot be saved yet — never "no change".
  return age === null ? true : age !== row.age
}

/**
 * THE DECISION: what does this submit write?
 *
 * Every changed section and kid row is validated through the injected
 * validators; the valid ones land in `sections` / `kids`, the invalid ones in
 * `blockedSections` / `blockedKids` with the message the field already shows.
 * `empty` is true only when nothing differs at all — the caller then issues no
 * write (and, on the page, the submit is disabled).
 */
export function planProfileSave(input: ProfileSaveInput): ProfileSavePlan {
  const { baseline, draft, kidRows, kidDrafts } = input
  const validators = input.validators ?? {}
  const plan: ProfileSavePlan = {
    sections: [],
    blockedSections: [],
    kids: [],
    blockedKids: [],
    empty: true,
  }

  for (const section of changedProfileSections(baseline, draft)) {
    plan.empty = false
    const error = sectionError(section, draft, validators)
    if (error !== null) {
      plan.blockedSections.push({ section, error })
    } else {
      plan.sections.push(section)
    }
  }

  for (const row of kidRows) {
    if (!kidRowChanged(row, kidDrafts[row.id])) continue
    plan.empty = false
    const kid = toKidSave(row, kidDrafts[row.id])
    const error = validators.kid?.(kid) ?? null
    if (error !== null) {
      plan.blockedKids.push({ id: row.id, error })
    } else {
      plan.kids.push(kid)
    }
  }

  return plan
}

/**
 * One changed section's inline error, from the injected validator.
 *
 * The location section has no validator slot on purpose: its zip rule needs
 * the seeded gazetteer (an async read), so it stays in the write path —
 * db.updateHomeZipRadius validates and throws, and that message lands in the
 * location section's own error line (the behaviour /profile already had).
 * Documented so the missing branch reads as a decision, not an oversight.
 */
function sectionError(
  section: ProfileSection,
  draft: ProfileFormValues,
  validators: ProfileSaveValidators,
): string | null {
  switch (section) {
    case 'name':
      return validators.name?.(draft.name.trim()) ?? null
    case 'bio':
      return validators.bio?.(draft.bio) ?? null
    case 'interests':
      return validators.interests?.(draft.interests) ?? null
    case 'location':
      return null
  }
}

/** Seed the whole form from the profile row (pre-0022 columns seed ''). */
export function seedProfileFormValues(
  profile: ProfileSeedSource,
  defaultRadiusMiles: number,
): ProfileFormValues {
  return {
    name: profile.display_name,
    homeZip: profile.home_zip ?? '',
    radiusMiles: profile.radius_miles ?? defaultRadiusMiles,
    bio: profile.bio ?? '',
    interests: profile.interests ?? '',
  }
}

/**
 * One row's inputs, seeded from the row itself (the shape seedKidDrafts uses;
 * exported so a page never has to invent a blank fallback for a row whose
 * draft has not landed yet — inventing one is how a keystroke wipes a name).
 */
export function toKidFormValues(row: KidRowValues): KidFormValues {
  return { firstName: row.firstName, age: String(row.age), likes: row.likes }
}

/**
 * Seed every kid row's inputs from the fresh rows: an in-flight local value
 * (existing) wins over the row's saved value — the seed-once discipline, per
 * kid, so a re-list (an add, a remove, a photo upload) can never drop what the
 * parent is typing.
 */
export function seedKidDrafts(
  rows: KidRowValues[],
  existing?: Record<string, KidFormValues>,
): Record<string, KidFormValues> {
  const next: Record<string, KidFormValues> = {}
  for (const row of rows) {
    next[row.id] = existing?.[row.id] ?? toKidFormValues(row)
  }
  return next
}

/**
 * The row values the save baseline compares against, off the loaded kid rows.
 *
 * V9 ticket 05: a kid's first name is OPTIONAL, so the column arrives NULL for
 * a nameless kid and is normalised to '' here — the form's own "blank" state,
 * which is what makes `kidRowChanged`'s trimmed comparison work instead of
 * calling `.trim()` on a null.
 */
export function toKidRowValues(row: {
  id: string
  first_name: string | null
  age: number
  likes?: string | null
}): KidRowValues {
  return {
    id: row.id,
    firstName: row.first_name ?? '',
    age: row.age,
    likes: row.likes ?? '',
  }
}
