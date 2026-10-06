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
 * HOW THE WEB `denied` NOTE IS FRAMED NOW (and the native twin below reverses the
 * first point deliberately — see the platform paragraph further down), and the
 * properties `locationCopy.test.ts` pins so the old reading cannot come back:
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
 * WHY ONE VARIANT PER PLATFORM AND NOT TWO PER CALL SITE (the deliberate call the
 * brief asks for). The two call sites used to differ by one word — "Type AN
 * address instead" in the modal vs "Type YOUR address instead" in onboarding.
 * That is NOT kept as a variation: both screens have the address field rendered
 * beside the note (the modal's `location-address-input`, and the onboarding
 * card's own address/ZIP field, its copy already saying "type it below"), so
 * "your address" is true at both, and it is the warmer, more direct of the two.
 * One variant per platform is also the reason this module exists: a per-site
 * parameter would re-open exactly the drift the founder's note exposed.
 *
 * ⚠️ SLICE 2d — THE BROWSER-ERA OBJECTION REVERSES IN THE ANDROID SHELL, and the
 * paragraph above is why the reversal is a PLATFORM split and not a rewrite. The
 * founder's note was about a note that named the APP as the holder of a setting
 * the app did not have; in a browser the holder is the browser's per-site
 * permission, which is what `DEVICE_LOCATION_NOTES` still says and must keep
 * saying. Inside the shell there is no browser and no per-site setting: the
 * holder IS the app, the control is the Android app-permission, and the only
 * route that works for a PERMANENTLY denied permission is
 * **Settings → Apps → Drop In → Permissions → Location**. So the native note
 * names the app deliberately — that is the point of the split, not a regression
 * — and `locationCopy.test.ts` was edited on purpose to give each variant the
 * property that is true FOR IT (`statesLocationAsAnAppSetting` stays pinned as
 * FALSE for the web copy, and the native note is pinned as naming the app and
 * that route).
 *
 * ⚠️ THE NATIVE `denied` NOTE MUST NOT PROMISE "WE'LL ASK AGAIN". Android stops
 * showing the system dialog after a couple of refusals ("the user's action
 * implies 'don't ask again', and is considered a permanent denial",
 * developer.android.com/training/permissions/requesting), and the app CANNOT
 * tell denied-once from denied-forever: both arrive as `PERMISSION_DENIED` with
 * no UI at all (research §3b/§4). So the note offers the route that works in
 * both cases — Settings — instead of an ask that may never appear.
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

/**
 * THE SHELL COPY — the same three statuses inside the Android app, where the
 * holder of the permission is the APP and the parent's route is
 * **Settings → Apps → Drop In → Permissions → Location**.
 *
 * `denied` is the whole reason this variant exists. It names the app as the
 * holder ("Location is off for Drop In") — the sentence the founder rejected for
 * the BROWSER, where it was false — and it names the settings route, because a
 * permanently denied permission is the one case the app cannot re-ask and cannot
 * even detect. It deliberately does NOT say "allow it when we ask": Android
 * stops re-prompting after a couple of refusals and both refusals arrive
 * identically (`PERMISSION_DENIED`, zero UI), so that sentence would be a lie to
 * exactly the parent who needs the note. The app name is `strings.xml`'s
 * `app_name` ("Drop In") — the same name the OS dialog and the Settings screen
 * show, so the parent can match the words to what they see.
 *
 * `unavailable` is byte-for-byte the web sentence ON PURPOSE: the shell's
 * taxonomy cannot tell a timeout from no signal from Location-services-off
 * (research §4), so a native-specific sentence would claim a cause the app has
 * not observed. `unsupported` is unreachable in the shipped shell — the origin is
 * always `https://localhost` — but the record stays total, and it says "app"
 * rather than "browser" because inside the shell that is what would be true.
 */
export const DEVICE_LOCATION_NOTES_NATIVE: Record<DeviceLocationFailure, string> = {
  unsupported: 'This app cannot share your location. Type your address instead.',
  denied:
    'Location is off for Drop In. Turn it on in Settings → Apps → Drop In → Permissions → Location, or type your address instead.',
  unavailable: "We couldn't get your location just now. Try again, or type your address.",
}

/**
 * The one question a caller asks: is this the native shell? `native` is the
 * platform answer the caller already resolves through the existing seam
 * (`nativePushShellPlatform`, the same one `NotificationsSection` uses) — this
 * module does no detection of its own and stays a pure function of its argument,
 * exactly like `notificationSectionCopy`.
 */
export function deviceLocationNotes(
  native: boolean,
): Record<DeviceLocationFailure, string> {
  return native ? DEVICE_LOCATION_NOTES_NATIVE : DEVICE_LOCATION_NOTES
}
