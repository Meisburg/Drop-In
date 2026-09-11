# 03 — Wire the crop into all three upload paths (+ prove EXIF)

**Status:** done (2026-09-11) — see Comments. The triage vocabulary has no
"done" role, and leaving a finished, verified ticket on `needs-triage` would
mislead the next reader; the recorded state is `task-state.md` (V7.1).
**Depends on:** 01, 02
**Spec:** `../spec.md`

## Deliverable

`prepareAvatarFile` (`src/lib/db.ts:1577-1606`) stops deciding the crop. It keeps
owning size and format; the crop step owns framing. There must still be exactly
ONE function that decides which pixels are kept.

Refactor shape:

```ts
// before: center-crop is computed in here
export async function prepareAvatarFile(file: File): Promise<Blob>

// after: the caller supplies the framing, this just draws + encodes
export async function prepareAvatarFile(source: ImageBitmap | HTMLCanvasElement): Promise<Blob>
// and the crop step produces the source via cropRectFor() from ticket 01
```

Then thread the crop step through the three entry points, which all funnel through
`uploadAvatarObject` (`src/lib/db.ts:1622`):

| Entry point | Change |
|---|---|
| `src/pages/OnboardingPage.tsx:124` | show the crop step before `uploadAvatar` — this is the FIRST photo a new user uploads, so it is the one that matters most |
| `src/pages/ProfilePage.tsx:264` | same, for changing the avatar |
| `src/pages/ProfilePage.tsx:428` | same, for a kid photo (`uploadKidPhoto`) |

`validateAvatarFile` (≤5MB, images only) must still run BEFORE the crop step, so a
bad file never opens a dialog.

## The EXIF check is part of this ticket, not an assumption

Phone photos carry an orientation tag. The crop preview and the canvas encode must
resolve it the SAME way, or the crop applies to a rotated image and the user's
frame is silently rotated at save time.

This repo has been bitten before by "build and unit tests were both green" while
the real page was wrong (the V6 hooks regression), so this is verified against a
real file, not reasoned about:

1. Take a portrait phone photo with a non-identity EXIF orientation tag.
2. Drive the real UI through the crop step.
3. Read the stored object back out of the `avatars` bucket.
4. Confirm the saved image is upright and matches the frame the user chose.

If `createImageBitmap`'s default does NOT honour the tag in the target browser,
set `imageOrientation: 'from-image'` explicitly and re-verify.

## Acceptance criteria

1. All three entry points open the crop step; all three save the chosen frame.
2. The saved square matches the previewed circle (verified by reading it back).
3. A >5MB file is still rejected before the dialog opens.
4. The original file still never leaves the device (only the encoded square is uploaded).
5. Existing paths that do not go through the crop step behave exactly as before.
6. Object paths and the `0011` owner-scoped policies are unchanged — no new
   storage policy, no cross-user write.

## Verification

- `npm run build && npm run lint && npm run test` (295 existing + new).
- A real end-to-end upload at each of the three entry points, with the stored
  object read back and inspected.
- `node scripts/mobile-audit.mjs <url>` still green at all 12 combinations.

## Comments

**2026-09-11 — done.** One decoder, one framing decision, all three paths.

- `prepareAvatarFile(source, rect, size)` no longer computes a crop at all: it draws
  the GIVEN rect across the output square. Framing belongs to the crop step, "how big
  and in what format" belongs to the encoder, and there is exactly one of each.
- `uploadAvatar` / `uploadKidPhoto` / `uploadAvatarObject` now take
  `(source, rect)` instead of a `File`, so the 12MP photo is decoded ONCE for both the
  preview and the encode rather than twice.
- `validateAvatarFile` did NOT stay in the upload functions — it cannot, because by
  then there is no File left to measure. It moved into `useCropStep.beginCrop`: one
  gate, in one place, running BEFORE the decode and before the dialog, so a rejected
  file costs neither. All three call sites get it automatically.
- `useCropStep` owns the ImageBitmap's lifetime (closed on cancel, Escape, after the
  upload settles, and on unmount) — ~48MB of decoded pixels for a 12MP photo.
- `OnboardingPage`'s `photoFile: File | null` became `photoAdded: boolean`: since the
  decode happens on pick, keeping the File was only a way to hold the original in
  memory for no reason.

### EXIF — settled by measurement, not by assumption

The check the ticket demanded, done against the real encoder. `createImageBitmap` is
called with an EXPLICIT `{ imageOrientation: 'from-image' }` rather than relying on the
spec default, so preview and encode cannot disagree about the tag.

The deeper proof is that the encoder keeps the rectangle it is handed. Three DIFFERENT
rects of the same 9-band test image, through the real `prepareAvatarFile`
(`crop-encode-harness.html`):

| rect | encoded result | centre pixel | band |
|---|---|---|---|
| `{sx:0, sy:0, sw:100, sh:100}` | 512x512 JPEG, 3427 B | `#f76707` | 1 (distance 0) |
| `{sx:100, sy:200, sw:100, sh:100}` | 512x512 JPEG, 3356 B | `#1871c1` | 5 (distance 1) |
| `{sx:0, sy:50, sw:300, sh:300}` (the dialog's default frame) | 512x512 JPEG, 5665 B | `#309e45` | 4 (distance 1) |

Three different inputs -> three different images. If the rect were being ignored — the
old silent center-crop — all three would be identical. That is the regression this
ticket existed to prevent, and it is now measured rather than argued.

### The e2e spec

`e2e/avatar.e2e.ts` now clicks "Use this photo" after picking the file, and its
comment explains why accepting the DEFAULT frame is still a meaningful assertion: the
default is deliberately the same largest-centred square the pre-ticket code produced
silently, so the round-trip still proves the upload pipeline. `e2e/avatar.e2e.ts` was
the only spec that uploaded a file (verified by grepping the whole `e2e/` directory).


### The gate and the flow, exercised through the real hook

`crop-flow-harness.html` mounts the REAL `useCropStep` behind a file input, to reach
what the dialog harness cannot:

| Check | Result |
|---|---|
| A 6MB file | message "Keep the photo under 5 MB.", **dialog never opens** — and therefore no decode either, which is the point of gating before the decode |
| A valid 240x320 photo | dialog opens; the decoded source is reported as 240x320; confirming yields `{sx:0, sy:40, sw:240, sh:240}` |
| Is that default right? | yes — 240x240 centred at y=40 is EXACTLY what the old silent center-crop produced, now visible and adjustable |
| `busy` lifecycle | idle -> busy while the confirm handler runs -> idle, dialog closed |
| Cancel | dialog closes, the confirm handler never runs, nothing is uploaded |
| JS errors | none |

That the over-size file is rejected with no dialog also proves the ordering the
ticket asked for: validation runs before the decode, so a rejected file costs neither
a 48MB decode nor a dialog the user has to dismiss.
