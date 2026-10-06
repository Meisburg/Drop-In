/**
 * Pins the device-location notes' FRAMING — the property the founder's note
 * ("I never turned it off ... I don't see in the settings where you turn it off
 * or on either") was about, not a snapshot of the current sentence.
 *
 * A snapshot would pass forever after any edit, and the edit that matters is the
 * one that walks "Location is off for Drop In" back in: a state of the APP,
 * which has no such setting, when the state belongs to the BROWSER'S per-site
 * permission. So the assertions below are about what the note must DO — name the
 * browser as the one holding the permission, and offer the typed address as the
 * way forward — and the first test feeds the OLD strings through the same
 * predicate to prove the predicate can fail (it is not a test that asserts
 * nothing).
 */
import { describe, expect, it } from 'vitest'
import { DEVICE_LOCATION_NOTES } from './locationCopy'

/** The two strings this slice replaced, verbatim, as the regression record. */
const OLD_DENIED_NOTES = [
  'Location is off for Drop In. Turn it on in your browser settings, or type an address.',
  'Location is off for Drop In. Type your address instead, or turn it on in your browser settings.',
]

/**
 * The reading the founder had, mechanised. True when a note states location as a
 * STATE ("location is off/on") or names the app's own feature as the holder
 * ("for Drop In") — both of which say the APP has a setting it does not have.
 * A property that holds of every note, because no note may make that claim.
 */
function statesLocationAsAnAppSetting(note: string): boolean {
  return /location is (off|on)/i.test(note) || /for drop in/i.test(note)
}

/**
 * True when the browser — the actual holder of the permission — is the note's
 * SUBJECT. Required of the `denied` note alone: it is the one that explains a
 * refused permission, so it must attribute the refusal to the browser rather
 * than to the app. (`unavailable` claims no holder at all — no signal or a
 * timeout — so it is not held to this.)
 */
function opensByNamingTheBrowser(note: string): boolean {
  return /^(your|this) browser\b/i.test(note)
}

/** True when the note hands the stuck parent an action they can take right now. */
function offersTheTypedAddress(note: string): boolean {
  return /type your address/i.test(note)
}

const ALL_NOTES = Object.entries(DEVICE_LOCATION_NOTES)

describe('locationCopy — the failure notes', () => {
  it('the properties FAIL the old strings, so a regression cannot pass', () => {
    for (const old of OLD_DENIED_NOTES) {
      expect(statesLocationAsAnAppSetting(old)).toBe(true)
      expect(opensByNamingTheBrowser(old)).toBe(false)
    }
  })

  it('never states location as a setting of this app', () => {
    for (const [status, note] of ALL_NOTES) {
      expect(statesLocationAsAnAppSetting(note), `${status}: ${note}`).toBe(false)
    }
  })

  it('names the browser as the holder when the permission is denied', () => {
    const denied = DEVICE_LOCATION_NOTES.denied
    expect(opensByNamingTheBrowser(denied), denied).toBe(true)
    expect(denied).toMatch(/browser settings/i)
    // Per-site, not an app-wide switch — the scope that makes it the browser's
    // permission rather than a Drop In setting.
    expect(denied).toMatch(/for this site/i)
  })

  it('offers the typed address in every failure note', () => {
    for (const [status, note] of ALL_NOTES) {
      expect(offersTheTypedAddress(note), `${status}: ${note}`).toBe(true)
    }
  })

  it('writes a note for each failure and nothing empty', () => {
    expect(Object.keys(DEVICE_LOCATION_NOTES).sort()).toEqual([
      'denied',
      'unavailable',
      'unsupported',
    ])
    for (const [status, note] of ALL_NOTES) {
      expect(note.trim().length, `${status} is empty`).toBeGreaterThan(0)
    }
  })
})
