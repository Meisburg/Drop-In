import { describe, expect, it } from 'vitest'
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  PRIVACY_PATH,
  PRIVACY_POLICY,
  TERMS_OF_USE,
  TERMS_PATH,
  type LegalDoc,
} from './legal'

/**
 * The legal pages are COPY, and copy rots silently. These tests pin the claims
 * that would become untrue the day the product changes — a processor is added,
 * analytics are introduced, or someone finally builds the delete button and
 * forgets that the policy still says to email us.
 */

const allText = (doc: LegalDoc): string =>
  [doc.title, doc.summary, ...doc.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])])]
    .join('\n')
    .toLowerCase()

describe('the legal documents are well formed', () => {
  it.each([
    ['privacy', PRIVACY_POLICY],
    ['terms', TERMS_OF_USE],
  ])('%s has a title, a summary, a date and several sections', (_name, doc) => {
    expect(doc.title.length).toBeGreaterThan(3)
    expect(doc.summary.length).toBeGreaterThan(40)
    expect(doc.updated).toBe(LEGAL_EFFECTIVE_DATE)
    expect(doc.sections.length).toBeGreaterThanOrEqual(5)
    for (const section of doc.sections) {
      expect(section.heading.trim()).not.toBe('')
      const body = [...(section.paragraphs ?? []), ...(section.bullets ?? [])]
      expect(body.length).toBeGreaterThan(0)
      for (const line of body) expect(line.trim()).not.toBe('')
    }
  })

  it('the two paths are absolute, lowercase, and distinct', () => {
    for (const path of [PRIVACY_PATH, TERMS_PATH]) {
      expect(path.startsWith('/')).toBe(true)
      expect(path).toBe(path.toLowerCase())
      expect(path).not.toContain(' ')
    }
    expect(PRIVACY_PATH).not.toBe(TERMS_PATH)
  })

  it('the effective date is an ISO date, so "dated" is readable and sortable', () => {
    expect(LEGAL_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(LEGAL_EFFECTIVE_DATE))).toBe(false)
  })
})

describe('the privacy policy claims only what the code does', () => {
  const text = allText(PRIVACY_POLICY)

  it('names every processor the code actually calls', () => {
    for (const processor of ['supabase', 'vercel', 'resend', 'google']) {
      expect(text).toContain(processor)
    }
  })

  it('discloses that place photos and maps are fetched from other sites', () => {
    // A reader would never guess this, and it is the one place a third party
    // sees their IP address through normal use of the app.
    expect(text).toContain('wikimedia')
    expect(text).toContain('flickr')
    expect(text).toContain('openstreetmap')
  })

  it('claims no ads, no selling, and no third-party analytics', () => {
    expect(text).toContain('do not sell')
    expect(text).toContain('do not run ads')
    expect(text).toContain('do not use third-party analytics')
  })

  it('claims an area, not a position', () => {
    expect(text).toContain('never asks for or stores gps')
    expect(text).toContain('zip')
  })

  it('describes deletion as a request, because there is no delete button yet', () => {
    // If someone builds the in-app delete, this test should fail so the policy
    // is updated in the same change rather than drifting away from the product.
    expect(text).toContain('no self-service delete button')
    expect(text).toContain(LEGAL_CONTACT_EMAIL.toLowerCase())
  })

  it('keeps the kid rules the product enforces', () => {
    expect(text).toContain('first name')
    expect(text).toContain('age')
    expect(text).toContain('no public kid profiles')
  })
})

describe('the terms state the matching risk plainly', () => {
  const text = allText(TERMS_OF_USE)

  it('says we do not vet anyone and do not supervise', () => {
    expect(text).toContain('do not run background checks')
    expect(text).toContain('do not verify')
    expect(text).toContain('do not supervise')
  })

  it('requires an adult account holder', () => {
    expect(text).toContain('18 or older')
  })

  it('protects other people’s kids by rule, not by hope', () => {
    expect(text).toContain('without their parent')
  })
})
