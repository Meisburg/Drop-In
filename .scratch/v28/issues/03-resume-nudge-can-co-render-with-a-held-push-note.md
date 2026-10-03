# Issue 03 — the resume nudge can co-render with a held push note

**Filed:** 2026-09-29, from V28 Slice 3c's review. **Status:** accepted residual,
not a 3c defect. **Owner:** unassigned — needs `src/components/PushOptInPrompt.tsx`.

## The defect

V28's resume nudge ("Finish setting up") must **never render at the same time as
V25's `PushOptInPrompt`** (plan decision 10: the first run must not fight it). The
nudge achieves this by standing down while a push trigger is **armed**, observed
through `subscribePushArmed` / `armedPushTrigger()` (`src/lib/pushClient.ts`) —
the same seam the prompt itself consumes, so no cross-component flag was invented.

That seam is *almost* sufficient. The gap:

1. The parent taps the prompt's **"Not now"**.
2. That calls `dismissPushPrompt(trigger)`, which clears the armed trigger **and**
   calls `notifyArmed()`.
3. The nudge's listener fires, `pushArmed` becomes `false`, and the nudge becomes
   eligible to render.
4. **But the prompt is not gone** — it keeps a held one-line `note`
   (`DISMISSED_POINTER`) in its own local state and renders the fallback note card
   until the parent taps "Got it".

**Window:** from "Not now" until "Got it" or a reload, both lines can be on screen
together, across client-side route changes.

## What is verified, and what it is not

- **Verified by the reviewer from the code:** the residual is real; it opens at
  "Not now" and closes at "Got it" / reload.
- **The browser-*denied* variant does NOT co-render.** The denied fallback path
  calls `clearArmedPushPrompt()`, which **deliberately does not `notifyArmed`** —
  so the nudge's `pushArmed` stays `true` and it stands down. Side effect: the
  nudge stays suppressed for the rest of that tab session (it fails **safe** —
  hidden, never a co-render).
- **During the interview the rule holds absolutely.** Both mount on the
  `navRenders` seam (`src/App.tsx:520`, `:525`), which is false on `/onboarding`,
  so **neither is mounted during the first run**. decision 10's actual concern —
  the interview fighting a notification prompt — is fully met.
- So this is a **bounded stack of two banners, outside the interview, both
  dismissible.** It is *not* a first-run violation.

## Why it is an issue and not a slice

The clean fix touches **`src/components/PushOptInPrompt.tsx`**, a **V25** surface
that V28's plan explicitly declares untouched ("Not a notifications redesign").
**No V28 slice owns that file**, so folding it into a card slice would be
unowned scope creep.

## The proposed fix (from the builder, endorsed)

Add a module-level **"prompt-visible" observable** to `src/lib/pushClient.ts`,
analogous to the existing `armListeners`: set by `PushOptInPrompt` whenever **any**
of its cards (the ask card *or* the held note) is on screen; the nudge subscribes
and stands down while it is visible. That closes both windows — the armed case
*and* the held-note case — with one honest signal instead of two overlapping ones.

## Acceptance for whoever takes it

- With the prompt's ask card **or** its held note on screen, the nudge does not
  render.
- The nudge returns once the prompt is fully gone (no permanent suppression —
  note the *denied* path's side effect above as a separate, acceptable behaviour).
- A test covers the signal, and `npm run verify` stays green.
