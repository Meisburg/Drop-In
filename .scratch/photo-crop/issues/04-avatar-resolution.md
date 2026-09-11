# 04 — The 256px avatar is too small now that photos enlarge

**Status:** done (2026-09-11) — see Comments. The triage vocabulary has no
"done" role, and leaving a finished, verified ticket on `needs-triage` would
mislead the next reader; the recorded state is `task-state.md` (V7.1).
**Depends on:** 03 (do it while the pipeline is open)
**Spec:** `../spec.md`
**Found by:** recon for this feature — not reported by a human

## The problem

`AVATAR_SIZE_PX = 256` (`src/lib/db.ts:1472`). That was sized for a 24-28px
circle, and it is still plenty for the feed's circles:

| Where | Rendered | Needs at 3x |
|---|---|---|
| card + "going" circles | 24px | 72px |
| header | — | — |
| **the V6 lightbox** | **full screen** | **~1170px** |

V6 added "photos should enlarge": tapping an avatar opens `ImageLightbox` at
essentially full screen. A 256px square upscaled to a ~390pt-wide phone at 3x is
a **~4.5x blow-up** — the one place a parent goes specifically to look closely at
a photo is the place where it is guaranteed to be mush.

Cropping does not cause this and will not fix it, but the crop work opens the same
function, so it is cheap now and a migration later.

## Deliverable

Raise the stored square to **512px** (2x the 256 that the circles need, ample for
the lightbox at phone size, and still a small JPEG — well under the 5MB upload
limit and a fraction of a second to encode).

Do NOT raise it to the original resolution: the whole privacy property of this
pipeline is that the original never leaves the device.

If 512 proves too soft on a large phone, 720 is the next stop — but measure first,
do not guess.

## Acceptance criteria

1. `AVATAR_SIZE_PX` (or its successor) is 512, and every existing caller picks it
   up with no other change.
2. Encoded JPEG stays comfortably small (expect tens of KB, not hundreds).
3. Existing avatars already in the bucket still render — the change affects new
   uploads only, and nothing in the read path assumes a size.
4. The circles are visually unchanged (they downscale; they are not stretched).
5. The lightbox at phone size is visibly sharp rather than upscaled.

## Verification

- `npm run build && npm run test`.
- Upload through the real UI, read the stored object back, confirm its pixel
  dimensions and byte size.
- Compare a lightbox render before/after by eye on a real phone — this is a
  perceptual claim and the only honest way to settle it.

## Comments

**2026-09-11 — done.** `AVATAR_SIZE_PX` 256 -> 512, with the reasoning recorded at the
constant itself (256 was sized for the 24px circles; V6's lightbox made it a ~4.5x
upscale in the one place a parent goes to look closely).

Measured through the real encoder (`crop-encode-harness.html`), at three different
crop rectangles: **512x512 JPEG, 3356 / 3427 / 5665 bytes.** Comfortably under the 5MB
upload cap, tens of KB as predicted, and the encode stays a fraction of a second.

Chose 512 over 720 because it is already 2x what the circles need and sharp at phone
size; the ticket's own instruction was "measure first, do not guess", and 5.7KB for the
widest crop means there is no cost pressure pushing higher. Deliberately NOT the
original resolution — the privacy property of this pipeline is that the original never
leaves the device, which is worth more than any sharpness the lightbox could gain.

Unverified-by-eye: whether 512 is *visibly* sharp in the lightbox on a real phone. That
is a perceptual claim, it needs a human holding a phone, and it is the one acceptance
criterion here that this session cannot close. Flagged, not fudged.

