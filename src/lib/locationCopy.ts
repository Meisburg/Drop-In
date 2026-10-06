/**
 * The device-location notes — what a parent reads when "Use my location" cannot
 * hand back a fix. One home for the words, shared by the two places that ask
 * (`src/components/LocationModal.tsx` and `src/pages/OnboardingPage.tsx`).
 *
 * WHY THIS MODULE EXISTS — A FOUNDER'S NOTE NOBODY ANSWERED (2026-09-xx 15:24,
 * pinned to the note that used to read *"Location is off for Drop In"*):
 *
 *   "I'm not sure why it says location is off for a drop-in. I never turned it
 *    off and it should just be on by default, right I also don't see in the
 *    settings where you turn it off or on either."
 *
 * Both sentences were the COPY's fault. "Location is off for Drop In" names the
 * app as the thing holding the setting — and the app has no such setting at all.
 * What is off is the BROWSER'S per-site permission, which is why his second
 * sentence is the natural next move: he went looking in settings for a control
 * that does not exist. The note was also written out twice, with its clauses
 * swapped, so the two sites had already drifted in emphasis. That is the
 * one-copy rule firing on a string (`docs/agents/code-structure.md`).
 *
 * HOW THE `denied` NOTE IS FRAMED NOW, and the properties
 * `locationCopy.test.ts` pins so the old reading cannot come back:
 *
 *  - **The browser is the SUBJECT, and the scope is this site.** "Your browser
 *    is blocking location for this site" — the holder of the permission is
 *    named, and "this site" says the setting is per-site, not an app-wide
 *    switch. The `unsupported` note already modelled this ("This browser cannot
 *    share your location"); the `denied` note was the only wrong one.
 *  - **The way forward comes first in the second sentence.** The parent is
 *    stuck at that moment and needs an action, not a diagnosis — and `denied`
 *    is a choice they may have made, so we do not re-ask in the same breath
 *    (`OnboardingPage.tsx`, the per-case failure-copy comment). Typing an
 *    address is offered before the browser-settings route.
 *  - **No scolding, no jargon.** "blocking" is the plain word for what the
 *    browser reports; we do not tell the parent they did something wrong, and
 *    we do not say "permission", "origin" or "policy".
 *
 * WHY ONE VARIANT AND NOT TWO (the deliberate call the brief asks for). The two
 * call sites used to differ by one word — "Type AN address instead" in the modal
 * vs "Type YOUR address instead" in onboarding. That is NOT kept as a variation:
 * both screens have the address field rendered beside the note (the modal's
 * `location-address-input`, and the onboarding card's own address/ZIP field, its
 * copy already saying "type it below"), so "your address" is true at both, and
 * it is the warmer, more direct of the two. One variant is also the reason this
 * module exists: a per-site parameter would re-open exactly the drift the
 * founder's note exposed.
 *
 * The statuses come from `GeolocationOutcome` (lib/geolocation.ts) — imported as
 * a TYPE only, so this module carries no runtime dependency and its test needs
 * no browser.
 */
import type { GeolocationOutcome } from './geolocation'

/** The three failure statuses a note is written for (`granted` needs none). */
export type DeviceLocationFailure = Exclude<GeolocationOutcome['status'], 'granted'>

/**
 * The note per failure, as data. Keyed by the outcome `readDeviceCoords` already
 * returns, so a caller renders the words and never re-writes them, and a new
 * status cannot be added without a compile error here.
 */
export const DEVICE_LOCATION_NOTES: Record<DeviceLocationFailure, string> = {
  unsupported: 'This browser cannot share your location. Type your address instead.',
  denied:
    'Your browser is blocking location for this site. Type your address instead, or allow it in your browser settings.',
  unavailable: "We couldn't get your location just now. Try again, or type your address.",
}
