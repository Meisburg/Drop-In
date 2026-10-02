/**
 * V28 r2 slice 2 (fix round 1) — the name card's photo-upload gate.
 *
 * The gate itself is a one-line decision (in-flight blocks, the bounded
 * escape unblocks), so this test is the decision's table — the states that
 * matter are exactly the ones the ruling named: no photo, failed upload,
 * in-flight, and in-flight past the bound.
 */
import { describe, expect, it } from 'vitest'
import { ADDRESS_LOOKUP_TIMEOUT_MS } from './geocode'
import { PHOTO_UPLOAD_TIMEOUT_MS, photoUploadBlocksContinue } from './photoUpload'

describe('PHOTO_UPLOAD_TIMEOUT_MS (the bounded wait)', () => {
  it('is a finite, positive wait', () => {
    expect(Number.isFinite(PHOTO_UPLOAD_TIMEOUT_MS)).toBe(true)
    expect(PHOTO_UPLOAD_TIMEOUT_MS).toBeGreaterThan(0)
  })

  // The escape is the pending-state rule's idiom — the same bounded-wait
  // number as the area card's address lookup (the rule has one idiom, and
  // two different waits would quietly say the photo is more patient than
  // the address, which nothing in the product says).
  it('matches the area-card lookup escape (one idiom, one number)', () => {
    expect(PHOTO_UPLOAD_TIMEOUT_MS).toBe(ADDRESS_LOOKUP_TIMEOUT_MS)
  })
})

describe('photoUploadBlocksContinue (the in-flight gate + its escape)', () => {
  // The photo is optional: NO photo at all (nothing in flight, nothing
  // expired) and a FAILED upload (settled — not in flight) must never
  // block Continue. That is the ruling's first state: a failure proceeds.
  it('never blocks when nothing is in flight (the no-photo and failed-upload paths)', () => {
    expect(photoUploadBlocksContinue(false, false)).toBe(false)
    expect(photoUploadBlocksContinue(false, true)).toBe(false)
  })

  // The ruling's second state: an IN-FLIGHT upload blocks Continue, so the
  // URL is known before the profiles row is written (the race the fix
  // closes — a row born with avatar_url NULL and a URL nothing reads).
  it('blocks while the upload is in flight', () => {
    expect(photoUploadBlocksContinue(true, false)).toBe(true)
  })

  // The bounded escape: a HUNG upload (in flight past the bound) must
  // never trap the parent on the name card — the gate opens and the run
  // proceeds without the photo.
  it('the bounded escape unblocks a hung upload', () => {
    expect(photoUploadBlocksContinue(true, true)).toBe(false)
  })
})
