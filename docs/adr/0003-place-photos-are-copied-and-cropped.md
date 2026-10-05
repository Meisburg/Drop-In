# 0003 — Place photos are cropped, and copied only when the moderator frames one

**Status:** accepted (2026-10-05; the link-first half amended the same day, after
slice 1 landed)

## Context

V28 r4 (`457fc8d`, migration 0062) shipped the moderator's place-photo editor
(`src/components/PlacePhotoAdmin.tsx`) and wrote two rules into its docblock:

1. **"PROVENANCE IS REQUIRED, NOT OPTIONAL."** The editor asked for *Who took
   it*, *Licence* and *Where it came from*, because 0046 sourced 121 Wikimedia
   Commons photos where CC BY / CC BY-SA require attribution, and a replacement
   that blanked the four provenance columns would attribute the new picture to
   the old photographer.
2. **"THIS COMPONENT DOES NOT DOWNLOAD ANYTHING."** It stored a URL the
   moderator supplied, or a file the moderator chose. It never fetched a
   third-party image on its own behalf, because Google's Maps Platform Terms
   3.2.4(a)(i) forbid *"pre-fetch, index, store, reshare, or rehost Google Maps
   Content"* (the same shape holds at TripAdvisor and Foursquare — see
   `research/place-photos/2026-10-03-strategies.md`).

Then the founder hit the real workflow and asked for something the second rule
had ruled out:

> *"After I paste the link or I upload a file, I need the ability to either pan
> it or zoom it in or out to crop it to make sure it displays properly for all
> the users."*
>
> *"All I need … is the ability to either upload a file manually or grab a photo
> and put it in our database by pasting the link and then be able to like pan it
> or crop it to make it look right for our app."*

Framing a photo means having its pixels. A remote URL cannot be framed
client-side — the canvas would be tainted by a cross-origin image, and the
stored URL would keep changing under us. And the provenance form turns a
thirty-second fix ("this picture is wrong") into a licensing research task.
The founder was shown both trades and ruled, 2026-10-05:

> *"we don't need to put who took it, license, or where it came from."*

## Decision

**A pasted link STAYS A LINK unless the moderator frames it.** URL mode has two
exits:

- **Save** stores the remote URL exactly as the editor always did. Nothing is
  fetched, nothing is uploaded, no object exists in `place-photos`. A link the
  browser cannot load still saves fine.
- **Crop or adjust** fetches the image (`fetchPlacePhotoFile`), opens the crop
  dialog, and on confirm uploads OUR copy and stores that URL.

The reason is cost, in the founder's words the day after slice 1 landed:

> *"I think we should prefer hosting using whoever has already got the image
> hosted on their link if possible, but then you have the option to — if you need
> to crop or pan the image — then it gets copied to our database, because
> otherwise we're going to be paying to serve up every image for everyone."*

Upload mode always stores our copy, necessarily: a chosen file has no remote
home. Both modes converge on the same encoder, the same upload and the same
patch — the only difference is where the bytes came from.

**The stored crop lands on a 1200px square** — the one shape both surfaces eat
(the place banner `h-48 w-full` ~1.87:1 and the card thumb `h-16 w-20` 4:5
portrait, both `object-cover`). The moderator's pan/zoom is what fixes the
framing; the aspect is not parameterized.

**The three provenance fields come out of the editor.** Existing rows keep
whatever is already stored and `photo_attribution` keeps rendering. A photo
replaced by this editor clears the four provenance columns *with the photo*
(`placePhotoPatch` already writes all five together), so a new picture is never
attributed to the old photographer.

### The two accepted risks, recorded not argued

Copying a third party's image into our bucket may breach that host's terms
(Google's especially), and a CC-licensed image expects attribution that we are no
longer asking the moderator to supply. A hotlinked image, by contrast, **can rot
or be blocked by the host later, while our own copy cannot.** Both are accepted:
the copy is what "pan or zoom it … to make it look right" costs, and the hotlink
is what "we're going to be paying to serve up every image" costs. Neither was
decided by the code.

The hotlink's failure mode is already the app's existing one: a photo that fails
to load falls back to the per-kind illustration (`onError`), so a dead link
degrades the way a missing photo does rather than as a broken card. (One known
gap, found while e2e-testing this work and recorded here rather than fixed: on
the place page `photoFailed` is never reset when the row's photo changes, so a
dead current link also hides a replacement saved in the same session until the
page reloads. `src/pages/PlacePage.tsx:135/452/490`.)

The reversal is bounded rather than open-ended:

- The moderator is the only person who can reach the editor (0062 is
  UPDATE-only and moderator-gated), so a copy is a deliberate human act, not a
  crawler — and with the amended rule it happens only when the moderator chooses
  **Crop or adjust**.
- A host that refuses the fetch (CORS, an error response, a non-image, an
  oversize body) is **reported**, not worked around — the message names the way
  out: *save it to your device and use Upload a file.* There is no server-side
  fetch and no proxy; an Edge Function that defeats CORS is its own future
  slice.
- The evidence about which hosts refuse lives in
  `research/place-photos/2026-10-03-strategies.md`, not in a comment that will
  rot.

## Considered options

- **Keep the URL and crop it at render time.** Rejected: a cross-origin image
  taints the canvas, so the encoder cannot read it; and every surface would
  depend on a third party's uptime, hotlinking policy and URL stability.
- **Fetch server-side (an Edge Function) so CORS never blocks a copy.**
  Deferred, not rejected: it is a real answer for the refusing hosts, and it is
  a bigger change than this ask. Client-side first; the message tells the
  moderator what to do meanwhile.
- **Keep asking for provenance, pre-filled from the source.** Rejected by the
  founder's ruling. The metadata also cannot be recovered reliably from an
  arbitrary pasted URL, so the form was mostly asking a human to guess.
- **Frame a link without copying it.** Impossible rather than rejected: framing
  is encoding pixels, and a cross-origin image taints the canvas, so nothing can
  produce a cropped file without already holding the bytes — which is the copy.
- **Copy every pasted link.** This was slice 2's first shape, and the founder
  reversed it on cost the next day: it makes us pay to serve every image,
  including the ones the host already serves fine. Copying is now the price of
  **Crop or adjust** alone.

## Consequences

- **Two kinds of row are now deliberate**: a plain hotlink (Save, no hosting cost,
  and a link that may rot) and our own `place-photos` object (Crop or adjust, and
  every upload). A surface must therefore keep treating `photo_url` as opaque,
  which it already does — and the place page's `onError` fallback is what makes
  the hotlink's rot survivable.
- The pasted URL is never written to `photo_source_url`. The three provenance
  fields are gone from the editor entirely, so there is no field left to put it
  in.
- The docblocks at `PlacePhotoAdmin.tsx` and `lib/placePhotoAdmin.ts` no longer
  state either reversed rule; they record the reversal, per this repo's rule
  that a comment which lies is its most expensive defect class. The applied
  migration 0062 and ADR 0002 are historical records and are **not** edited.
- `placePhotoPatch` still writes all five columns together and still ACCEPTS
  source/licence/author. The editor passes `null`; the invariant that a new
  photo never inherits the old credit is preserved by the clearing, not by the
  asking.
- `prepareAvatarFile` is renamed `prepareSquarePhotoFile`: it was already
  generic (the frame comes from the caller, the size is a parameter) and only
  its name claimed avatars. Avatars keep `AVATAR_SIZE_PX`; place photos pass
  `PLACE_PHOTO_SIZE_PX`.
- `CropPhotoDialog` gains a `shape` prop (`'circle' | 'frame'`, default
  `'circle'`) and test ids, so the avatar-family dialogs behave identically while
  a place photo draws a rectangle.
- The 239 seeded photos are **not** backfilled or re-cropped. A row keeps its
  Commons photo, its credit and its non-square aspect until a moderator replaces
  it.
