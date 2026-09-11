# Spec: photo crop / zoom on upload

**Status:** needs-triage
**Reported by:** the human, 2026-09-11 — *"when a user uploads a photo they need
an opportunity to zoom/crop the photo because my kids pictures are not displaying
properly in the circle."*

## The problem

Every uploaded photo is **automatically center-cropped to a square** and there is
no way for the user to influence which part survives. A portrait photo of a kid —
the overwhelmingly common case on a phone — gets its middle strip kept and its
top and bottom discarded, and the face is frequently off-center enough that it is
cut or pushed to the edge. The square is then drawn into a **circle**
(`rounded-full object-cover`), which removes the corners too, so the visible
window is even tighter than the square the user never chose.

Result: a parent uploads a photo of their kid and the app shows a circle of
shoulder.

## Root cause (exact)

`prepareAvatarFile` — `src/lib/db.ts:1577-1606`:

```ts
// Cover-crop: scale the photo to fill the square, center-crop the overflow.
const scale = Math.max(size / bitmap.width, size / bitmap.height)
const drawWidth = bitmap.width * scale
const drawHeight = bitmap.height * scale
ctx.drawImage(bitmap, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight)
```

`(size - drawWidth) / 2` is the whole bug: the crop window is pinned to the dead
center of the source image, with no pan, no zoom and no preview. Everything else
in the pipeline is fine and should be kept.

## Blast radius — one function, three entry points

`prepareAvatarFile` is called from `uploadAvatarObject` (`src/lib/db.ts:1622`),
which every upload site funnels through:

| # | Entry point | What it uploads to |
|---|---|---|
| 1 | `src/pages/OnboardingPage.tsx:124` | the parent's own avatar — **the first photo a new user ever uploads** |
| 2 | `src/pages/ProfilePage.tsx:264` | the parent's avatar (change it) |
| 3 | `src/pages/ProfilePage.tsx:428` | a **kid photo** (`<uid>/kids/<kidId>`) |

Onboarding is the worst place for this to bite: the very first photo a parent
puts in the app is the one that gets silently mis-cropped.

There is no separate playdate-photo pipeline. "Photos" in this product means
avatars (parent + kid), all in the single public-read `avatars` bucket created in
`supabase/migrations/0011_profiles_v2.sql`.

## Approach

Insert a **crop step** between "file picked" and "upload", and keep the rest of
the existing pipeline intact:

```
pick file → validate (≤5MB, images only) → [NEW: crop + zoom] → encode JPEG → upload → set url
                        validateAvatarFile        crop seam + UI     canvas   storage   db
```

The crop step owns the *framing*; the existing encode step keeps owning the
*size and format*. Concretely: the crop produces a square `ImageBitmap`/canvas
region, and `prepareAvatarFile` is refactored to take that region instead of
computing its own center — so there is still exactly ONE place that decides what
pixels are kept.

### The seam (why this is testable)

Gesture state and crop geometry are separable. The pure part — "given the image
size, the crop square size, and a (zoom, offset) pair, what source rectangle do
we draw, and what are the legal bounds for that offset?" — is arithmetic with no
DOM, and belongs in a pure module with unit tests, exactly like
`src/lib/passwordReset.ts` (12 tests) and the rest of the `src/lib` seams. The
component then only translates touches into (zoom, offset) and renders.

This matters because the clamp maths is where this class of feature actually
breaks: panning must stop at the image edge, zoom must not go below "fills the
square", and the preview and the final encode must resolve to the SAME rectangle
or the user crops one thing and gets another.

## Decisions to make

1. **Required step or optional?** Recommendation: always show it, pre-centered
   on the existing center-crop, with one gesture to adjust and one tap to
   confirm. Never make a parent fight a dialog to accept what they already had.
2. **Store a bigger square?** See ticket 04 — the 256px cap (`AVATAR_SIZE_PX`,
   `src/lib/db.ts:1472`) is now too small for the lightbox V6 added. This is the
   cheap moment to fix it, while the pipeline is open.
3. **Keep the original?** Currently the original never leaves the device (only
   the 256px square is uploaded). Recommendation: keep that — it is a privacy
   feature, not a limitation, and this app is privacy-first by policy.

## Risks

- **EXIF orientation.** Phone photos carry an orientation tag. `createImageBitmap(file)`
  with no options is *specified* to honour it (`imageOrientation: 'from-image'`),
  but the crop preview and the canvas encode must resolve it identically or the
  crop is applied to a rotated image. This needs an explicit end-to-end check
  with a real portrait-with-EXIF camera file, not an assumption.
- **Circular mask vs square preview.** The user picks a square but sees a circle.
  Show the circle overlay in the crop UI so what they frame is what they get.
- **iOS**: no viewport zoom on focus (the V6 `<16px` input rule in `index.css`),
  44px minimum targets, `pb-safe`/`pt-safe` respected, and the crop surface must
  not fight the browser's own pinch-zoom.
- **Memory**: `createImageBitmap` on a 12MP phone photo is ~48MB decoded; close
  the bitmap (`bitmap.close()`) as the current code already does.

## Acceptance criteria

1. A parent can zoom and pan before the photo is saved, at all three entry points.
2. The preview shows a circular mask, and the saved result matches that frame.
3. The existing `validateAvatarFile` (≤5MB) still rejects before any work is done.
4. The upload still sends only a small JPEG — the original never leaves the device.
5. Existing behaviour is unchanged for anyone who does not touch the crop step.
6. Unit tests cover the clamp/geometry seam; the mobile audit still passes at all
   12 viewport/route combinations.

## Verification

- `npm run test` — the seam's unit tests (new) plus the existing 295.
- `npm run build && npm run lint`.
- `node scripts/mobile-audit.mjs <url>` — contrast, tap targets, tiny text, at all
  12 viewport/route combinations.
- A real end-to-end upload through the UI at each of the three entry points, with
  a portrait phone photo, confirmed by reading the stored image back.
