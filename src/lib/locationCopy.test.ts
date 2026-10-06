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
 *
 * ⚠️ EDITED ON PURPOSE IN SLICE 2d — HERE IS WHY, and what did NOT change. There
 * are now TWO records, because the holder of the permission is a platform fact:
 * `DEVICE_LOCATION_NOTES` (the browser's per-site setting) and
 * `DEVICE_LOCATION_NOTES_NATIVE` (the Android APP's permission). In the shell the
 * founder's objection INVERTS: the app really is the holder, so a native note
 * that named a browser would be the false one. Therefore:
 *
 *  - every WEB assertion is kept exactly as it was — that copy is live and
 *    correct, and `statesLocationAsAnAppSetting` stays pinned FALSE for it;
 *  - the native record gets the properties that are TRUE for it instead: it names
 *    the app ("for Drop In") and names the Settings route
 *    (Settings → Apps → Drop In → Permissions → Location), and it is pinned
 *    against promising another ask, which Android will not necessarily deliver;
 *  - each property is proven able to FAIL (the old strings for the web pair, an
 *    invented "when we ask" sentence for the native ones), so none of this is a
 *    predicate that asserts nothing.
 */
import { describe, expect, it } from 'vitest'
import {
  DEVICE_LOCATION_NOTES,
  DEVICE_LOCATION_NOTES_NATIVE,
  deviceLocationNotes,
} from './locationCopy'

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
 *
 * ⚠️ WEB ONLY, since slice 2d: in the shell the app IS the holder, and this
 * predicate is exactly what the native note must satisfy. Applying it to both
 * records would pin the browser-era framing as universal and make the correct
 * native note unrepresentable.
 */
function statesLocationAsAnAppSetting(note: string): boolean {
  return /location is (off|on)/i.test(note) || /for drop in/i.test(note)
}

/**
 * True when the browser — the actual holder of the permission — is the note's
 * SUBJECT. Required of the WEB `denied` note alone: it is the one that explains
 * a refused permission, so it must attribute the refusal to the browser rather
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

/**
 * The native twin of `statesLocationAsAnAppSetting`, and its deliberate
 * negation: in the shell the app IS the holder, so the `denied` note must say
 * so. Naming the app is what lets the parent match the note to the Android
 * dialog and the Settings screen they will actually see.
 */
function namesTheAppAsTheHolder(note: string): boolean {
  return /for drop in/i.test(note)
}

/**
 * True when the note names the ONE route that works for a permission the app may
 * never be allowed to ask for again. The route is Android's own:
 * Settings → Apps → Drop In → Permissions → Location.
 */
function namesTheAndroidSettingsRoute(note: string): boolean {
  return /settings/i.test(note) && /apps\s*→\s*drop in\s*→\s*permissions\s*→\s*location/i.test(note)
}

/**
 * A promise the shell cannot keep. Android stops drawing the system dialog after
 * a couple of refusals, and a denied-once and a denied-forever permission are
 * indistinguishable to the app (both `PERMISSION_DENIED`, no UI), so no note may
 * tell the parent to wait to be asked again. Narrow on purpose: "try again"
 * (retry the FIX) is allowed and needed — re-asking for the PERMISSION is not.
 */
function promisesToAskAgain(note: string): boolean {
  return /ask (you )?again|we'?ll ask|when we ask|next time you (use|tap|open)/i.test(note)
}

const ALL_WEB_NOTES = Object.entries(DEVICE_LOCATION_NOTES)
const ALL_NATIVE_NOTES = Object.entries(DEVICE_LOCATION_NOTES_NATIVE)
const BOTH_NOTES = [...ALL_WEB_NOTES, ...ALL_NATIVE_NOTES]

describe('locationCopy — the failure notes', () => {
  it('the web properties FAIL the old strings, so a regression cannot pass', () => {
    for (const old of OLD_DENIED_NOTES) {
      expect(statesLocationAsAnAppSetting(old)).toBe(true)
      expect(opensByNamingTheBrowser(old)).toBe(false)
    }
  })

  it('the native properties FAIL a browser-era / re-ask note, so they can fire', () => {
    for (const wrong of [
      'Your browser is blocking location for this site. Type your address instead.',
      'Location is off for Drop In. Allow it when we ask, or type your address instead.',
    ]) {
      expect(namesTheAndroidSettingsRoute(wrong), wrong).toBe(false)
    }
    expect(promisesToAskAgain('Allow it when we ask.')).toBe(true)
  })

  it('never states location as a setting of this app — in the BROWSER copy', () => {
    for (const [status, note] of ALL_WEB_NOTES) {
      expect(statesLocationAsAnAppSetting(note), `${status}: ${note}`).toBe(false)
    }
  })

  it('names the browser as the holder when the permission is denied — in the BROWSER copy', () => {
    const denied = DEVICE_LOCATION_NOTES.denied
    expect(opensByNamingTheBrowser(denied), denied).toBe(true)
    expect(denied).toMatch(/browser settings/i)
    // Per-site, not an app-wide switch — the scope that makes it the browser's
    // permission rather than a Drop In setting.
    expect(denied).toMatch(/for this site/i)
  })

  it('names the APP and the Settings route when denied — in the SHELL copy', () => {
    const denied = DEVICE_LOCATION_NOTES_NATIVE.denied
    expect(namesTheAppAsTheHolder(denied), denied).toBe(true)
    expect(namesTheAndroidSettingsRoute(denied), denied).toBe(true)
    // The web framing, in the shell, would send the parent to a browser that is
    // not there: the exact bug this variant exists to end.
    expect(opensByNamingTheBrowser(denied), denied).toBe(false)
    expect(denied).not.toMatch(/browser/i)
  })

  it('never promises another permission ask in either variant', () => {
    for (const [status, note] of BOTH_NOTES) {
      expect(promisesToAskAgain(note), `${status}: ${note}`).toBe(false)
    }
  })

  it('offers the typed address in every failure note, in both variants', () => {
    for (const [status, note] of BOTH_NOTES) {
      expect(offersTheTypedAddress(note), `${status}: ${note}`).toBe(true)
    }
  })

  it('writes a note for each failure and nothing empty, in both variants', () => {
    const keys = ['denied', 'unavailable', 'unsupported']
    expect(Object.keys(DEVICE_LOCATION_NOTES).sort()).toEqual(keys)
    expect(Object.keys(DEVICE_LOCATION_NOTES_NATIVE).sort()).toEqual(keys)
    for (const [status, note] of BOTH_NOTES) {
      expect(note.trim().length, `${status} is empty`).toBeGreaterThan(0)
    }
  })

  it('picks the record by the platform answer the caller already resolved', () => {
    expect(deviceLocationNotes(false)).toBe(DEVICE_LOCATION_NOTES)
    expect(deviceLocationNotes(true)).toBe(DEVICE_LOCATION_NOTES_NATIVE)
  })
})
