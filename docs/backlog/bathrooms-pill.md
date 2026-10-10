# A "bathrooms available" pill — deferred until the data exists

> ## ✅ SHIPPED 2026-10-09 — this file records the *pre-build* reasoning
>
> The column exists now: migration `0070_places_bathrooms_nearby.sql` added
> `places.bathrooms_nearby boolean`, and the refresh script is
> `scripts/refresh-bathrooms-nearby.mjs` (Overpass `amenity=toilets`, mirroring the
> coffee path). The pill reads it through the strict tri-valued predicate
> `placeHasBathroomsNearby` in `src/lib/places.ts` — `true` renders, `false` and
> `null` render NOTHING. Merged as `8acae8d` (slice v36-bathrooms-pill).
>
> **Read the rest of this file as history, not as a pending plan.** It is kept
> because the reasoning below is why the column is tri-valued and why the pill was
> not built before the data — both still true.

Parked 2026-10-08. Recorded so a future reader does not rebuild it from scratch,
and so the reason it is not in the pill row is a written decision rather than an
omission.


## The ask

> *"Another pill category that my wife said would be important in finding a place
> is bathrooms available."* — `muzka6tz`, on the `/browse` pill row.

It is a good ask: a parent choosing a place for a toddler cares about a bathroom
more than almost any other attribute, and it is the kind of fact a directory is
for.

## Why it is not built now

**The pill would be a control with nothing behind it.** Every pill in the row
today filters on a real, populated column:

| Pill | Column | Populated |
|---|---|---|
| Open now | computed from open hours | yes |
| Playground / Indoor play / Café / Museum | `places.kind` | yes |
| Saved | the follow/save read | yes |
| Coffee nearby | `places.coffee_nearby` | 18 true / 1 false / 215 null |

There is **no column for bathrooms**, and no source for one. Adding the pill
without the column renders a control that filters nothing — the exact "dead
control" class this batch has been deleting (the founder's *"if I can't edit
anything, what's the point of having it here"* applies equally to a filter that
cannot filter).

## What building it actually requires

It is a **data** slice before it is a UI slice, and it has a working precedent to
copy — the coffee-nearby path, end to end:

1. **A migration** adding `places.bathrooms boolean` (nullable three-valued, like
   `coffee_nearby` — `true`/`false`/`null` where null means "we never asked", never
   "no bathroom").
2. **A refresh script** modelled on `scripts/refresh-coffee-nearby.mjs`: an
   Overpass query for `amenity=toilets` within a chosen radius, paced (6s+ spacing,
   a descriptive `User-Agent` — the endpoint 406s without one), idempotent and
   re-runnable, writing the cached column.
3. **A radius decision** — coffee uses 400 m (a quarter mile). A bathroom is
   arguably the same order of magnitude; that is a judgement call for the founder,
   not a default to guess.
4. **Then** the pill, reading the column through a pure seam, plus its empty-state
   copy that distinguishes "no bathroom nearby" from "we never checked".

## Revisit when

**A `places.bathrooms` column exists and is populated.** Then the pill is a small,
honest slice. Until then it is a filter that lies.

## The cheap half, if wanted sooner

The pill row already has `More kinds`. If the founder wants the *word* on the
place page before the filter exists, the place's own facts line (the V33-4 trust
line) could carry "Bathroom" for a place we have confirmed one at — but that still
needs the data, so it is the same prerequisite. No free lunch here; the column is
the gate.
