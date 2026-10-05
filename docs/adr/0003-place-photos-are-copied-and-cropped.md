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

**A pasted link STAYS A LINK unless the moderator frames it.** One action, with
no separate crop button (slice 4, 2026-10-05 — the founder: *"I don't think we
need a crop or adjust button anymore here. Basically, just when you click upload
a file, it should just automatically give you the option to crop or adjust"*):

- The editor's primary action fetches the image (`fetchPlacePhotoFile`) and opens
  the crop dialog; confirming uploads OUR copy and stores that URL. Uploading a
  file goes straight to the same dialog.
- **If the copy is refused** — CORS, an error response, a non-image, an oversize
  body — the same tap stores the REMOTE url instead, as the editor always did,
  and says so in one sentence: *"We saved the link instead. …"*. Nothing is
  uploaded, no object exists in `place-photos`, and a refusal never leaves the
  moderator with nothing.
- Finishing closes the editor and the host re-reads, so the picture appearing on
  the card (or the hero) IS the confirmation; the changed place is scrolled back
  into view so the moderator does not have to hunt for it.

The reason is cost, in the founder's words the day after slice 1 landed:

> *"I think we should prefer hosting using whoever has already got the image
> hosted on their link if possible, but then you have the option to — if you need
> to crop or pan the image — then it gets copied to our database, because
> otherwise we're going to be paying to serve up every image for everyone."*

Upload mode always stores our copy, necessarily: a chosen file has no remote
home. Both modes converge on the same encoder, the same upload and the same
patch — the only difference is where the bytes came from.

**The stored crop is a 2:1 rectangle (1400x700), and the place hero carries that
same shape** (`aspect-[2/1]`, replacing a fixed `h-48`). The founder caught the
original square himself once he used it: *"Why is it a square that I'm editing in
when what I see for each place is a rectangle? … It is the wrong size."* He was
right, and the measurement is why: a fixed `h-48` hero rendered 1.86:1 at 390px
but 3.85:1 at 844px (the content column is `max-w-md md:max-w-3xl`), so a square
was TALLER than either surface and `object-cover` re-cropped the moderator's
framing on every render. 2:1 is within ~7% of the hero and the directory card
keeps the middle band of the same image. The moderator's pan/zoom is what fixes
the framing; avatars keep their square window and circle mask (`SQUARE_WINDOW` is
still the default everywhere else).

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
gap was found while e2e-testing this work and **fixed in the same batch**: on the
place page and on the directory card the failed-load flag is now keyed to the URL
that failed, so a replacement renders over a picture that had already broken —
before that, saving over the dead `seattle.gov` row on Green Lake Park looked
like it had done nothing at all.)

The reversal is bounded rather than open-ended:

- The moderator is the only person who can reach the editor (0062 is
  UPDATE-only and moderator-gated), so a copy is a deliberate human act, not a
  crawler — and it happens only when the moderator adds or replaces a picture
  AND the fetch succeeds.
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
  **framing** a link — and of nothing else.

## Consequences

- **Two kinds of row are now deliberate**: a plain hotlink (a link whose copy was
  refused, or one of the seeded rows — no hosting cost, and a link that may rot)
  and our own `place-photos` object (a framed link, and every upload). A surface
  must therefore keep treating `photo_url` as opaque, which it already does — and
  the place page's `onError` fallback is what makes the hotlink's rot survivable.
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
