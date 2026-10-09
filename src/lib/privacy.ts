/**
 * The Privacy & safety panel's facts (V27).
 *
 * WHY THIS EXISTS: the app's privacy model is structural — kids are first name +
 * age, there are no public kid profiles, and a signed-out visitor sees nothing —
 * but that promise lived only in the signup screen's copy and in the schema. A
 * parent opening Settings could not see it stated anywhere. This module turns
 * the parent's OWN data into the two lists the panel renders: what other parents
 * can see, and what never leaves the account.
 *
 * It is deliberately pure: it takes the profile facts and the kids, and returns
 * rows. It does no fetching and no deciding about UI. Sibling test:
 * src/lib/privacy.test.ts.
 */
import type { Kid } from './types'

export interface PrivacyFact {
  label: string
  value: string
  /** One honest sentence about why it is in this list. */
  detail: string
  /**
   * The screen that owns CHANGING this fact, when one does (v33-8). The row
   * renders as a chevron link to it: a settings row is either a control, a
   * doorway to the control that owns it, or a read-only line that says why
   * (its `detail`). Undefined when nothing owns the change — the row stays
   * text and the detail line is the why.
   */
  editAt?: string
}

export interface PrivacyReport {
  /** What another signed-in parent can see on this family's profile. */
  visible: PrivacyFact[]
  /** What stays with the account and is never shown to other parents. */
  kept: PrivacyFact[]
}

export interface PrivacyInput {
  displayName: string | null | undefined
  homeZip: string | null | undefined
  kids: readonly Pick<Kid, 'first_name' | 'age'>[]
  familyPhotoCount: number
}

/** A short, human summary of the kids others can see. */
export function kidsSummary(kids: readonly Pick<Kid, 'first_name' | 'age'>[]): string {
  if (kids.length === 0) return 'No kids added yet'
  return kids
    .map((kid) => {
      const name = typeof kid.first_name === 'string' ? kid.first_name.trim() : ''
      return name === '' ? `Age ${kid.age}` : `${name} (${kid.age})`
    })
    .join(', ')
}

/** Pluralised photo count for the visible list. */
export function photoSummary(count: number): string {
  if (count <= 0) return 'No photos yet'
  return count === 1 ? '1 family photo' : `${count} family photos`
}

/**
 * Build the two lists. Every string here is a fact the app can actually back —
 * the panel is reassurance, and reassurance that overclaims is a lie.
 */
export function buildPrivacyReport(input: PrivacyInput): PrivacyReport {
  const name = typeof input.displayName === 'string' ? input.displayName.trim() : ''
  const zip = typeof input.homeZip === 'string' ? input.homeZip.trim() : ''

  return {
    visible: [
      {
        label: 'Your family name',
        value: name === '' ? 'Not set yet' : name,
        detail: 'Shown next to your posts, comments, and profile.',
        // The profile editor (V15 T07) owns the name — /settings already points
        // here as "Your family profile", so the row is a doorway, not a second
        // editor (v33-8).
        editAt: '/profile',
      },
      {
        label: 'About your family',
        value: 'The parent card "About me" text you write.',
        detail: 'Only signed-in parents can read it.',
      },
      {
        label: 'Your kids',
        value: kidsSummary(input.kids),
        detail: 'First name and age only — never a full name, school, or birthday.',
        // Kids are added and edited in the profile editor's kids section.
        editAt: '/profile',
      },
      {
        label: 'Family photos',
        value: photoSummary(input.familyPhotoCount),
        detail: 'Visible to signed-in parents. Never to a signed-out visitor.',
        // The photos themselves live in the profile editor's photo section.
        editAt: '/profile',
      },
    ],
    kept: [
      {
        label: 'Your email',
        value: 'Private',
        // Contractual, set when the account was created (v33-8): text plus the
        // why-line, no control.
        detail:
          'Set when you created your account. Used for your account and the alerts you ask for. Never shown to another parent.',
      },
      {
        label: 'Your street address',
        value: 'Private',
        detail: 'Used once to find your area. It is never shown to other parents.',
      },
      {
        label: 'Your home area',
        value: zip === '' ? 'Not set yet' : `${zip} area`,
        detail: 'Set when you signed up. Other parents see distance, not the ZIP itself.',
      },
      {
        label: 'Who can reach you',
        value: 'Parents you message',
        detail: 'Messaging is inside Drop In. Your inbox is never public.',
      },
    ],
  }
}
