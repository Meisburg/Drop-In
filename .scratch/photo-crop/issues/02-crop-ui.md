# 02 — The crop / zoom UI

**Status:** done (2026-09-11) — see Comments. The triage vocabulary has no
"done" role, and leaving a finished, verified ticket on `needs-triage` would
mislead the next reader; the recorded state is `task-state.md` (V7.1).
**Depends on:** 01 (the seam)
**Spec:** `../spec.md`

## Deliverable

A crop step that sits between "file picked" and "upload": `CropPhotoDialog`
(following the existing `ReportDialog` precedent — portal to `document.body`,
Esc/backdrop to close, rendered into `body` so it is never a DOM descendant of an
interactive element).

Requirements, all driven by the V6 phone feedback rather than taste:

- **Square crop window with a CIRCULAR mask overlay**, because the avatar renders
  as a circle. The user must see the circle they are actually getting.
- **Pan** by drag; **zoom** by pinch AND by an explicit slider/stepper. Pinch-only
  is unreachable for one-handed use and unusable with a screen protector.
- **Pre-centered, pre-zoomed** to exactly the old behavior, so a user who does not
  want to think gets the previous result in one tap ("Save").
- **44px minimum** for every control; nothing rendered below 14px (the V6 floors,
  enforced by `scripts/mobile-audit.mjs`).
- Respect `pt-safe` / `pb-safe`; the toolbar must clear the home indicator.
- Do not fight the browser's own pinch-zoom on the rest of the page.
- Render at the same orientation the encode will use (see ticket 03's EXIF check).

## Acceptance criteria

1. Opens with the photo already filling the window, centered, without layout shift.
2. Pan stops exactly at the image edge — no background visible in the circle, ever.
3. Zoom out stops at "fills the window"; zoom in is capped at a sane maximum
   (recommend 3x) so the image cannot become a mosaic of pixels.
4. "Save" and "Cancel" are both reachable in one tap; Cancel leaves the previous
   photo untouched.
5. Works with mouse (drag + wheel/buttons) as well as touch, since it is a web app.
6. The dialog is keyboard-escapable and does not trap focus outside itself.
7. `node scripts/mobile-audit.mjs` passes at all 12 viewport/route combinations
   with the dialog OPEN (it has its own tap targets and text).

## Verification

- `npm run build && npm run lint && npm run test`.
- `node scripts/mobile-audit.mjs <url>` with the dialog open.
- A real phone: upload a portrait photo at each of the three entry points.

## Comments

**2026-09-11 — done.** `src/components/CropPhotoDialog.tsx` (+ the flow hook split into
`src/components/useCropStep.tsx`, because a module exporting a component AND a hook
breaks React Fast Refresh and oxlint flags it).

Design decisions worth recording:
- **A `<canvas>`, not an `<img>` with object-fit.** The preview is painted with
  `drawTransformFor` — the same function the encoder's rectangle comes from — so the
  frame the user sees and the pixels that get saved cannot disagree. That is the
  failure this feature is most likely to ship with, and this makes it structurally
  impossible rather than merely tested.
- **Zoom is a ceiling of 3x.** Past that, what the user is framing is pixels, and the
  result in a 24px circle is indistinguishable — it only makes the face harder to find.
- **The default frame is deliberately the OLD silent center-crop**, so "touch nothing
  and accept" is a no-op rather than a surprise.
- **`touch-action: none` on the canvas is load-bearing** — without it the browser
  scrolls the page out from under the pan.

VERIFICATION (the dialog is only reachable behind a session on /profile or
/onboarding, so it was driven through `crop-harness.html`, a dev-only root HTML that
Vite serves in dev but never builds, mounting the REAL component with the REAL CSS
against a synthetic 300x400 image of 9 distinct colour bands — odd count so the
default frame lands mid-band rather than on an antialiased boundary):

| Check | Result |
|---|---|
| Crop window is square, circular mask present | 324x324, mask present |
| `touch-action` on the canvas | `none` |
| Tap targets >= 44px (both buttons, the slider) | Cancel 79x44, Use this photo 141x44, slider 324x44 — all OK |
| Nothing below the 14px type floor | none (18 / 14 / 17 / 17 / 17px) |
| WCAG AA contrast of every text it renders | ALL PASS (9.59, 4.89, 7.46, 5.83, 4.97:1) |
| Preview draws the chosen region | centre pixel = band 4 green at the default frame |
| **Pan direction** | dragging the photo DOWN 400px moves the window UP (band 4 -> band 3) — the "photo fights my finger" bug is verifiably absent |
| **Zoom reframes** | the same 400px drag reaches band 3 at 1x and band 1 at 3x |
| Confirm returns a square at the right zoom | 300x300 at 1x, exactly 100x100 at 3x |
| Escape cancels | yes |
| JS errors | none |

Note on the two "wrong" colours this measurement first produced: they were the TEST's
arithmetic, not the component's — with an even band count the default frame centres on
y=200, exactly a band boundary, so the sampled pixel is a legitimate antialiased blend.
An odd band count removed the coincidence. Worth remembering before trusting a single
sampled pixel.

