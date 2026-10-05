# Place photos: fill the 112 blanks automatically — spec (2026-10-05)

**Founder's ask, verbatim:**

> *"What are we doing about automatically populating all of the images using like
> web scraping or just trying to link them to whatever website exists that has a
> picture and we can just connect to their hosting for their image. That needs to
> happen because I have all these places in here around Seattle that are blank
> pictures. And I don't want to have to manually populate them if I don't have to."*
>
> *"…so that I can just go through all the places visually and then fix the ones
> that I feel like don't look right — that would be the best system."*

Measured state, THIS TURN, against the live database:

```
select count(*) filter (where photo_url is null), count(*) from places;
→ 112 blanks / 239 places
```

## 1. What the sources actually yield (measured, not assumed)

Probed on 2026-10-05 against three blank places (12th West / West Howe Park,
6th Ave NW Pocket Park, Albert Davis Park):

| Source | Measured result | Verdict |
|---|---|---|
| Wikimedia Commons **`generator=geosearch`** on the place's own coordinates | "1914 Packard dump truck", "Lifting the pink stairs", "Seattle City Councilmember Sally Clark at Seattle Animal Shelter", "Back to the future — olden days keyboard rig", "Kitchen stone countertops", "Hamburger stop" | **REJECTED.** These are photos taken *near* the park, not *of* it. My earlier recommendation, disproved by its own probe. |
| **Wikidata P18** | No entity exists for any of the three | **No yield.** These parks are not notable enough to have items. |
| **Openverse** (`api.openverse.org/v1/images/`, no key, `q="<name> Seattle"`) | *Albert Davis Park* → **3 real photos**, titled "Olympic Hills, Albert Davis Park", source `flickr`, licence `by-nc`, URLs on `live.staticflickr.com` | **THE SOURCE.** Aggregates Flickr + Wikimedia + others; hotlinkable. |
| Commons **name** search (`scripts/fetch-place-photos.mjs`, the V18 pipeline) | The 121 places that already have photos came from this | **Keep as a second source**, with the precision gate below. |

**The precision gate is the whole design.** Every false positive above is caught
by one rule that the good hits pass:

> **The candidate's own title (or its description) must contain the place's
> distinctive name.** "Olympic Hills, **Albert Davis Park**" passes; "1914
> Packard dump truck" and "Kitchen stone countertops" cannot.

## 2. Slice 5 — source, gate, apply (link-first)

**`scripts/source-place-photos.mjs`** (new; the network shell, thin, like
`fetch-place-photos.mjs`, with the pure matching rules in `src/lib/` and
sibling-tested):

1. Read `places where photo_url is null` (112 today), id + name + neighbourhood +
   kind + lat/lng.
2. For each, query **Openverse** (`q: "<name> Seattle"`, `page_size=8`) and
   **Commons name search**. Respect a descriptive `User-Agent` and a pacing
   delay — the repo's own note records Commons 403/429 as the two ways this kind
   of script silently reports "no photo exists".
3. **Gate each candidate** (pure function, unit-tested — this is the module that
   matters):
   - title/description must contain the place's distinctive tokens (the full
     name, or the name minus generic words, allowing a `"<Neighbourhood>, <Name>"`
     prefix);
   - REJECT if the title contains a person-name shape or one of a small blocklist
     of non-place words (`dump truck`, `keyboard`, `countertop`, `portrait`,
     `councilmember`, …) — every one of those came from a real probe;
   - REJECT a licence we cannot use if the founder's ruling ever changes back
     (record the licence either way; do not gate on it now — the founder's
     2026-10-05 ruling is that attribution is not wanted);
   - require an image response (`content-type: image/*`) with a HEAD/GET of the
     URL, so a link that 404s is never written.
4. **Apply** the first passing candidate per place: write the REMOTE url through
   the existing `setPlacePhoto` patch (`placePhotoPatch`), with `sourceUrl` and
   the licence recorded in the columns that already exist — **no download, no
   copy into our bucket** (the founder's hosting ruling: link-first, and we only
   copy when a moderator frames the picture).
5. **Report** (`.scratch/place-photo-sourcing/report.md` + console): per place —
   applied URL + source, or `no candidate` with the reason (`0 results`,
   `all failed the gate`). The report's second list is the founder's manual
   worklist, and it is the honest measure of what automation could not do.
6. Flags: `--dry-run` (print the table, write nothing — the default posture for a
   first run against live data), `--limit N`, `--only "Name"`.

**The review loop is already built and needs nothing new:** `/browse` renders
every place with its picture, so the visual pass the founder described IS the
directory; the one-flow editor (`PlacePhotoAdmin`, slice 4) fixes or removes
whatever looks wrong. A bespoke review queue is NOT in this slice — it would
duplicate a surface that already exists.

**AMENDED 2026-10-05, the founder's own model of the system:**

> *"The idea is that it will automatically try to add the correct images for every
> place and then I'll go through it as the manual reviewer and upload better
> photos for any that need them."*

So this is **best-effort fill, human as the filter** — NOT "only fill what is
certain". Every blank place gets attempted, and the concern moves from *precision*
to *what families see while the review is pending*. Hence two tiers:

**Tier 1 — confident (name-in-title).** The gate in §1 passes. Applied, and
**live** to parents immediately: the evidence that it is the right place is in
the file's own title.

**Tier 2 — best effort.** An image response from a real search, not passing the
name gate but not matching the blocklist either (a nearby park photo, a
neighbourhood shot, a Flickr photo of the right area with an unhelpful title).
Applied to the row, flagged **unreviewed**, and **NOT shown to parents until the
moderator confirms it** — those places keep the per-kind illustration meanwhile,
which is exactly what they show today, so nothing regresses and no unvetted
picture reaches a family card.

**The review pass is the product.** `places.photo_review_state` (new column,
migration — next free number) with `'confirmed' | 'unreviewed'`:

- the seed's 127 existing photos are `'confirmed'`;
- tier 1 writes `'confirmed'`, tier 2 writes `'unreviewed'`;
- the editor's save/keep clears it to `'confirmed'` (the moderator has now
  looked), and `Remove photo` clears the row as it does today;
- on `/browse`, a moderator sees a small **"review"** badge on unreviewed photos,
  so the pass is a visible checklist rather than a memory test;
- parents see only `'confirmed'` photos.

**If the founder would rather see tier 2 live while reviewing** (every picture on
screen, fixed afterwards), that is one flag — his call, and it does not change
the pipeline.

**Acceptance criteria (amended):**

1. A dry run over the 112 blanks prints, per place, either the candidate it would
   apply (with its tier) or `no candidate`, and writes nothing.
2. Every applied URL answers `image/*`, and `photo_url` is the REMOTE url (no new
   object exists in `place-photos`). Both tiers write a row; **no place that has
   ANY usable candidate is left blank.**
3. The gate is **proved to fire**: a unit test pins that each measured false
   positive ("1914 Packard dump truck", "Kitchen stone countertops", "Back to the
   future — olden days keyboard rig", "Seattle City Councilwoman Sally Clark…")
   is rejected from **tier 1**, and that "Olympic Hills, Albert Davis Park" for
   the place "Albert Davis Park" is tier 1. A second test pins that a blocklisted
   candidate is dropped entirely (not even tier 2) while a merely-weak one lands
   in tier 2.
4. **Parents see no unreviewed picture**: a tier-2 row renders the per-kind
   illustration on `/browse` and `/place/:id` until the moderator saves it, and
   the moderator sees the picture plus the "review" badge.
5. Re-running is idempotent for already-filled rows (they are skipped by the
   `photo_url is null` filter).
6. The report exists, and its `no candidate` list plus the applied count equals
   112.
7. `npm run verify` stays green (baseline: 75 files / 2226 tests / 86 warnings /
   0 errors / GUARDS PASS — it must grow) and `npm run guards` passes: the new
   migration must be idempotent, and a new `scripts/` entry point must not bypass
   the repo's guards (check `scripts/guards/config-guard.sh` for what a script is
   expected to declare).

**NOT in scope:** downloading/copying images, Google Places (its terms forbid
re-hosting, and the repository's own `.scratch`-era research records it), a
bespoke review UI, and re-doing the 127 places that already have photos.

**Verification:** `npm run verify`; `node scripts/source-place-photos.mjs --dry-run
--limit 10` (the real command, printed output pasted into the report); and a
10-place live apply followed by a read-back of those rows.
