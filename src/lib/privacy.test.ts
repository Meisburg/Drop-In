import { describe, expect, it } from 'vitest'
import { buildPrivacyReport, kidsSummary, photoSummary } from './privacy'

describe('kidsSummary', () => {
  it('names nothing when there are no kids', () => {
    expect(kidsSummary([])).toBe('No kids added yet')
  })

  it('uses the first name and age when a name exists', () => {
    expect(kidsSummary([{ first_name: 'Ada', age: 5 }])).toBe('Ada (5)')
  })

  it('falls back to age alone when the name is blank or null', () => {
    expect(kidsSummary([{ first_name: null, age: 3 }])).toBe('Age 3')
    expect(kidsSummary([{ first_name: '   ', age: 3 }])).toBe('Age 3')
  })

  it('joins multiple kids', () => {
    expect(
      kidsSummary([
        { first_name: 'Ada', age: 5 },
        { first_name: null, age: 2 },
      ]),
    ).toBe('Ada (5), Age 2')
  })
})

describe('photoSummary', () => {
  it('pluralises honestly', () => {
    expect(photoSummary(0)).toBe('No photos yet')
    expect(photoSummary(-1)).toBe('No photos yet')
    expect(photoSummary(1)).toBe('1 family photo')
    expect(photoSummary(3)).toBe('3 family photos')
  })
})

describe('buildPrivacyReport', () => {
  const empty = buildPrivacyReport({
    displayName: null,
    bio: null,
    homeZip: null,
    kids: [],
    familyPhotoCount: 0,
  })

  it('lists the four visible surfaces and the four kept ones', () => {
    expect(empty.visible.map((fact) => fact.label)).toEqual([
      'Your family name',
      'About your family',
      'Your kids',
      'Family photos',
    ])
    expect(empty.kept.map((fact) => fact.label)).toEqual([
      'Your email',
      'Your street address',
      'Your home area',
      'Who can reach you',
    ])
  })

  it('states the unset values honestly rather than leaving a blank', () => {
    expect(empty.visible[0].value).toBe('Not set yet')
    expect(empty.visible[1].value).toBe('Nothing yet')
    expect(empty.visible[2].value).toBe('No kids added yet')
    expect(empty.visible[3].value).toBe('No photos yet')
    expect(empty.kept[2].value).toBe('Not set yet')
  })

  it('fills the visible list from the profile', () => {
    const report = buildPrivacyReport({
      displayName: 'The Nguyens',
      bio: '  Two kids, one dog.  ',
      homeZip: '98103',
      kids: [{ first_name: 'Ada', age: 5 }],
      familyPhotoCount: 2,
    })
    expect(report.visible[0].value).toBe('The Nguyens')
    expect(report.visible[1].value).toBe('Your short bio')
    expect(report.visible[2].value).toBe('Ada (5)')
    expect(report.visible[3].value).toBe('2 family photos')
    expect(report.kept[2].value).toBe('98103 area')
  })

  it('never claims the street address or email are shared', () => {
    const report = buildPrivacyReport({
      displayName: 'A',
      bio: 'B',
      homeZip: '98103',
      kids: [],
      familyPhotoCount: 1,
    })
    const email = report.kept.find((fact) => fact.label === 'Your email')
    const address = report.kept.find((fact) => fact.label === 'Your street address')
    expect(email?.value).toBe('Private')
    expect(address?.value).toBe('Private')
  })

  it('gives every fact a non-empty label, value and detail', () => {
    for (const fact of [...empty.visible, ...empty.kept]) {
      expect(fact.label.trim()).not.toBe('')
      expect(fact.value.trim()).not.toBe('')
      expect(fact.detail.trim()).not.toBe('')
    }
  })
})
