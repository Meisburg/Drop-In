import { describe, expect, it } from 'vitest'
import { normalizePublicPlaydate } from './db'
import type { PublicPlaydateDetail } from './types'

/**
 * The public-surface normalizer (V4 bug fix, found while looking at the real
 * page in a browser): the get_public_playdate RPC answers a missing/hidden id
 * with an all-null row over HTTP 200, not a JSON null — so the detail page's
 * `?? null` check never fired and a stale link rendered a phantom drop-in.
 */
const row: PublicPlaydateDetail = {
  id: 'pd-1',
  title: 'Playground time',
  place: 'Green Lake',
  address: null,
  starts_at: '2026-09-12T22:00:00.000Z',
  ends_at: '2026-09-13T00:00:00.000Z',
  age_hint: null,
  details: null,
  neighborhood_name: 'Green Lake',
  host_display_name: 'Jon',
  host_avatar_url: null,
  going_count: 2,
}

describe('normalizePublicPlaydate', () => {
  it('passes a real row through untouched', () => {
    expect(normalizePublicPlaydate(row)).toEqual(row)
  })

  it('turns a JSON null into not-found', () => {
    expect(normalizePublicPlaydate(null)).toBeNull()
    expect(normalizePublicPlaydate(undefined)).toBeNull()
  })

  it('turns the all-null row PostgREST returns for a missing id into not-found', () => {
    const allNulls = Object.fromEntries(
      Object.keys(row).map((key) => [key, null]),
    ) as unknown as PublicPlaydateDetail
    expect(normalizePublicPlaydate(allNulls)).toBeNull()
  })

  it('turns an empty-string id into not-found', () => {
    expect(normalizePublicPlaydate({ ...row, id: '' })).toBeNull()
  })
})
