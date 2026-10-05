# Place photos: paste or upload, then frame it — spec (2026-10-05)

**Founder's ask, verbatim:**

> *"After I paste the link or I upload a file, I need the ability to either pan it
> or zoom it in or out to crop it to make sure it displays properly for all the
> users."*
>
> *"All I need … is the ability to either upload a file manually or grab a photo
> and put it in our database by pasting the link and then be able to like pan it
> or crop it to make it look right for our app."*

Two slices. Both are `PlacePhotoAdmin.tsx` (the moderator's place-photo editor,
mounted from the directory card, `/browse`'s place rows, `/place/:id` and `/mod`).

## 0. Two recorded reversals (read before touching the docblocks)

`PlacePhotoAdmin.tsx:24-35` currently states two rules that this work **reverses
by founder decision**. The docblock must be rewritten to record the reversal, not
deleted — this repo's most expensive defect class is a comment that lies.

1. **"PROVENANCE IS REQUIRED, NOT OPTIONAL."** Reversed: the three fields —
   *Who took it*, *Licence*, *Where it came from* — come OUT of the editor. The
   founder's ruling, 2026-10-05: *"we don't need to put who took it, license, or
   where it came from."* Existing rows keep whatever is already stored, and
   `place.photo_attribution` keeps rendering. A photo **replaced** by this editor
   clears the four provenance columns with the photo (`placePhotoPatch` already
   writes them together), so a new picture is never attributed to the old
   photographer.
2. **"THIS COMPONENT DOES NOT DOWNLOAD ANYTHING."** Reversed: pasting a link now
   **copies the image into our own `place-photos` bucket** so it can be framed and
   so every surface serves one stored object. The risk this rule was protecting
   against is recorded and accepted, not argued: re-hosting a third party's image
   may breach that host's terms (Google's especially) and a CC licence expects
   attribution. The founder was shown the trade and ruled. Write it as accepted.
   The ADR is `docs/adr/0003-place-photos-are-copied-and-cropped.md` (new).

## 1. Shapes and sizes (the decisions, pinned)

- **The stored shape stays SQUARE.** One square is the least-lossy single shape
  for the two surfaces this photo feeds: the place-page banner (`h-48 w-full`,
  ~1.87:1) and the directory/card thumb (`h-16 w-20`, 4:5 portrait), both
  `object-cover` — a square loses ~20% either side on the thumb and ~47% top and
  bottom on the banner; a wide crop would lose ~57% of the thumb's width, and a
  portrait crop ~57% of the banner's height. It also means the crop math
  (`src/lib/photoCrop.ts`), the dialog and the encoder are reused unchanged.
  **The moderator's pan/zoom is what fixes the framing** — that is the whole ask.
  Do NOT parameterize the aspect in this work.
- **Output size: `PLACE_PHOTO_SIZE_PX = 1200`** (square, JPEG, quality 0.85).
  The banner is ≤448 CSS px wide (max-w-md), i.e. ~1344 device px at 3× — 1200 is
  the smallest size that keeps a phone on the good side of that. Avatars stay at
  `AVATAR_SIZE_PX`.
- **No circle.** `CropPhotoDialog`'s circle overlay and its copy ("The circle is
  what other parents will see") are avatar truths. A place photo is a rectangle.

## Slice 1 — upload a file, frame it, save it

**Interface (pin these):**

- `src/components/CropPhotoDialog.tsx`: new optional prop
  `shape?: 'circle' | 'frame'` (**default `'circle'`** — the five avatar-family
  call sites must behave byte-identically). `'frame'` renders no circle overlay
  and its own copy. Add `data-testid="crop-photo-dialog"`, `"crop-confirm"`,
  `"crop-cancel"` (the dialog has NO test ids today, which is why it has no e2e
  coverage).
- `src/components/useCropStep.tsx`: third optional param
  `shape: 'circle' | 'frame' = 'circle'`, passed straight to the dialog. Keep the
  existing `validateFile` signature `(file: File) => string | null`.
- `src/lib/db.ts`: rename `prepareAvatarFile` → **`prepareSquarePhotoFile`**
  (it is already generic: the frame comes from the caller, the size is a
  parameter; only *its name* claims avatars). Update its docblock, its call
  sites, and the stale mentions in `photoCrop.ts`, `CropPhotoDialog.tsx`,
  `photoCrop.test.ts`, `photoStorage.ts`. Keep `size` defaulting to
  `AVATAR_SIZE_PX` so avatar call sites do not change behaviour.
- `src/lib/placePhotoAdmin.ts`: add `PLACE_PHOTO_SIZE_PX = 1200` and
  `validatePlacePhotoCropFile(file): string | null` — a **module-level** adapter
  over the existing `validatePhotoFile` (stable reference; `useCropStep` takes it
  as a dependency). Returns the error message or null.
- `src/components/PlacePhotoAdmin.tsx`:
  - delete the `sourceUrl`/`license`/`author` state, inputs and their comments;
    `placePhotoPatch` is called with `sourceUrl: null, license: null, author: null`;
  - upload mode: choosing a file calls `crop.beginCrop(file)` and shows the
    returned message as the error; the dialog renders from `crop.dialog`;
  - the hook's `onConfirm(source, rect)` does: `prepareSquarePhotoFile(source,
    rect, PLACE_PHOTO_SIZE_PX)` → `new File([blob], 'place-photo.jpg', { type:
    'image/jpeg' })` → `uploadPlacePhoto(place.id, file, Date.now())` →
    `setPlacePhoto(...)` → `setDone(true)` + `onSaved()`;
  - the Save button and the file input share ONE path: picking a file opens the
    dialog, and Save is not a separate upload step (the dialog's confirm IS the
    save). Keep `photo-save-btn` meaningful for URL mode (slice 2).

**Acceptance criteria (slice 1):**

1. On a place with no photo, a moderator picks a file, the crop dialog opens, and
   confirming saves a **square** JPEG to `place-photos` and points the row at it.
2. Cancelling the dialog leaves the row untouched (no upload, no URL, no error).
3. The three provenance inputs are gone from the DOM; no test id for them exists.
4. The avatar/kid/family crop flows are unchanged: their dialogs still show the
   circle and "The circle is what other parents will see."
5. The row's stored `photo_url` is a `place-photos` URL, not a third-party URL.

**Verification (slice 1):**

```bash
npm run verify                       # build + test + lint + a11y:focus + steering-lint + guards
node scripts/mobile-audit.mjs <base> # the crop dialog is a new surface on /browse
npx playwright test e2e/place-photo-admin.e2e.ts   # + a NEW upload test (see below)
```

Baseline that must not regress: `75 files / 2197 tests / 86 warnings / 0 errors /
GUARDS PASS`. The test count MUST grow (new unit tests + the new e2e test).

**New e2e test (same file):** drive upload mode with
`setInputFiles('public/pwa-192x192.png')` (a committed, decodable, same-origin
PNG — no network), confirm the crop dialog (`crop-photo-dialog` → `crop-confirm`),
assert `photo-admin-done`, then assert the card/hero shows the picture. Follow the
file's existing discipline exactly: snapshot the five photo columns, restore in
`finally`, assert the restore, un-elevate the marker.

## Slice 2 — paste a link: link-first hosting, copy only when you frame it

**AMENDED 2026-10-05 by the founder, after seeing slice 1 land:**

> *"I think we should prefer hosting using whoever has already got the image
> hosted on their link if possible, but then you have the option to — if you need
> to crop or pan the image — then it gets copied to our database, because
> otherwise we're going to be paying to serve up every image for everyone."*

So a pasted link **stays a link** unless the moderator frames it. Cropping a link
is what moves the bytes into our bucket. The upload path (slice 1) always stores
our copy, necessarily: a chosen file has no remote home.

**The one trade to record, not argue:** a hotlinked image can rot or be blocked by
the host later, while our own copy cannot. The app already renders the kind
illustration when a photo fails (`onError`), so a dead link degrades the way a
missing photo does. Write that sentence into the ADR.

**Interface (pin these):**

- `src/lib/placePhotoAdmin.ts`: new
  `fetchPlacePhotoFile(url: string, deps?: { fetchImpl?: typeof fetch }): Promise<
  { ok: true; file: File } | { ok: false; error: string }>`
  - the injected `fetchImpl` is the seam (the build law: `lib/` injects its
    dependency); no other module fetches;
  - rejects: not-ok response, `content-type` outside `PLACE_PHOTO_TYPES`,
    `content-length`/blob size over `PLACE_PHOTO_MAX_BYTES`, and a thrown
    fetch (the CORS case) — each with a plain-language sentence;
  - the CORS failure must name the way out, e.g. *"That site wouldn't let us copy
    the photo. Save it to your device and use Upload a file."*
  - sibling test in `src/lib/placePhotoAdmin.test.ts` for every branch.
- `PlacePhotoAdmin.tsx` — **URL mode has TWO exits, not one:**
  - the pasted image is **previewed inline** as soon as a link is entered (the
    moderator has to see it to judge whether it needs framing);
  - **Save** (no crop): `validatePhotoUrl` → store the REMOTE url as `photo_url`,
    exactly as today. Nothing is fetched, nothing is uploaded, no new object
    exists in `place-photos`. A link the browser cannot fetch still saves fine.
  - **"Crop or adjust"**: `fetchPlacePhotoFile` → `crop.beginCrop(file)` → the
    SAME confirm path as slice 1 (one encoder, one upload, one patch) → our own
    `place-photos` URL is stored.
  - a failed fetch therefore blocks only the crop, never the save; it reports the
    friendly message and stores nothing.
  - the pasted URL is still never written to `photo_source_url` (the three
    provenance fields stay deleted).

**Acceptance criteria (slice 2):**

1. Paste a link → **Save** stores that remote URL as `photo_url` and creates **no**
   object in `place-photos` (the founder's cost rule, and what the two existing
   tests already do).
2. Paste a link → **Crop or adjust** opens the crop dialog on the fetched image;
   confirming stores OUR `place-photos` URL and the row no longer points at the
   remote one.
3. A host that refuses the fetch: **Crop or adjust** shows the friendly message
   and stores nothing; **Save** on the same link still succeeds.
4. A non-image or oversize response is reported specifically by the crop path.
5. `place-photo-admin.e2e.ts`'s two existing tests keep passing **unchanged**
   (they paste + Save, and now that also proves criterion 1); a NEW test walks
   paste → Crop or adjust → confirm → asserts our own stored URL. The donor URL
   is another seeded row's own `place-photos` object, so the fetch is
   same-project and CORS-clean.

**Verification (slice 2):** `npm run verify`, then the private-port e2e run below.

## How to run e2e while another checkout owns :4173

⚠️ `firstmate/worktrees/mei-6-followed-new-dropin` has a `vite preview` on **4173**
right now, and `playwright.config.ts` sets `reuseExistingServer: true` — a plain
`npx playwright test` will silently test THAT app. Also **29 spec files hardcode
`http://localhost:4173`** for their own `browser.newContext`, so a private port
only covers the specs that use the config's `baseURL`.

```bash
npm run build
npx vite preview --port 4180 --strictPort &      # kill by port afterwards
cat > playwright.private.config.ts <<'EOF'
import base from './playwright.config'
export default { ...base, use: { ...base.use, baseURL: 'http://localhost:4180' }, webServer: undefined }
EOF
npx playwright test --config playwright.private.config.ts e2e/place-photo-admin.e2e.ts
rm playwright.private.config.ts                   # never commit it
```

## Slice 3 — the window matches the rectangle a place actually shows

**AMENDED 2026-10-05, after the founder used slice 1 (committed `f9d7c7a`):**

> *"Why is it a square that I'm editing in when what I see for each place is a
> rectangle? When I pan it and crop it for in the square set up, it doesn't look
> right in the rectangles when it's done for each place. It is the wrong size."*

He is right and §1's square ruling is superseded. Measured from the code, not
from memory:

| Surface | Box | Ratio |
|---|---|---|
| place-page hero (`PlacePage.tsx:492`, `h-48 w-full`, max-w-md column) | 358×192 at 390px / 448×192 at `md` | **1.86:1 / 2.33:1** |
| directory card photo (`PlaceDirectory.tsx:1689`, `h-36 w-full`) | ~356×144 at 390px | **~2.5:1** |
| editor's own current-photo thumb (`h-16 w-20`) | 80×64 | 1.25:1 (a preview, not a surface) |

Both real surfaces are WIDE. A square is taller than either, so `object-cover`
re-crops the moderator's framing on every render — the framing is thrown away.

**Decisions:**

1. **The stored shape becomes 2:1 (1400×700 JPEG)**, replacing 1200×1200. 2:1 is
   within ~7% of the hero's render (the surface that must be right) and the card
   keeps the middle ~80% of its height. One stored crop still serves both, and
   now it serves the important one almost exactly.
2. **The hero is pinned to that shape**: `aspect-[2/1]` replaces `h-48`, so the
   crop window IS what the place page shows at every width. No other surface
   moves: the card keeps `h-36` and takes a centre band.
3. `src/lib/photoCrop.ts` stops assuming a square window: the window is a
   `{ width, height }` (or an aspect) threaded through `visibleSideFor`,
   `initialCropState`, `clampCropState`, `cropRectFor`, `drawTransformFor`,
   `centerDeltaForDrag` and `zoomToPoint`. **The square case stays a first-class
   input, so every existing unit test keeps passing unchanged.**
4. `CropPhotoDialog` renders the window at that aspect; the circle mask and the
   circle copy stay exclusive to `shape='circle'`. `'frame'` gets copy that
   describes a rectangle.
5. The encoder generalizes once more: `prepareCroppedPhotoFile(source, rect,
   { width, height })`. Avatars pass `AVATAR_SIZE_PX × AVATAR_SIZE_PX`; places
   pass `PLACE_PHOTO_WIDTH_PX = 1400` × `PLACE_PHOTO_HEIGHT_PX = 700`.
6. Already-stored photos (the seeded ones, and any square upload from slice 1)
   need no migration: they render in the 2:1 box as a centre band.

**Acceptance criteria (slice 3):**

1. The crop window a place photo opens in is 2:1 (±1%) at 390px and at `md`.
2. An uploaded place photo is stored as a **1400×700** JPEG (the e2e decodes the
   stored object and asserts both dimensions).
3. **The hero's rendered box is 2:1 ±1%** — the founder's actual requirement, as
   a test: what was framed is what the place page shows.
4. Every avatar/kid/family crop still gets a square window, the circle mask and
   the circle copy; `avatar-square.e2e.ts` still passes unchanged.
5. The square crop math is unchanged: `photoCrop.test.ts`'s existing expectations
   pass without edits, with new cases added for a 2:1 window.
6. Nothing overflows at 390×664 or 844×390: the hero's new aspect must not push
   a control off screen anywhere the mobile audit measures.

## Not in scope

- The directory card's own box (`h-36 w-full`): it keeps its geometry and takes a
  centre band from the 2:1 stored photo. Changing card density is a separate
  product decision.
- Re-cropping the 239 seeded photos, or migrating the square uploads slice 1
  already stored (they render as a centre band and need nothing).
- Server-side fetching (an Edge Function). Slice 2 is client-side; a host that
  refuses CORS is reported, not worked around.
- The zoom range and the gesture layer.
