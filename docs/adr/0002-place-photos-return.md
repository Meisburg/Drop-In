# 0002 — Place photos return to the place page

**Status:** accepted (2026-10-05)

## Context

V18 (migration 0046) sourced Wikimedia Commons photos for a curated subset of
the 239 seeded places and shipped the attribution machinery. V20 t01 then
**removed the photo from every product surface**, in the founder's words:

> *"maybe we have to get rid of the image part of this because I can't police
> this and fix all the broken images."*

That ruling was about **maintenance**, not about whether a parent wants to see
the place. The browse directory quietly kept a picture on every card (restored
in V27, `381a11c`), so the place page was the only surface a parent could reach
that showed a place with no image at all. Two records disagreed about WHERE the
picture belongs: V25 t04 wrote the sequence as *name → picture → description*,
while the 2026-10-05 annotation settled it the other way — *"a photo of the place
above the heading text for every place. I think that's the first thing you should
see."* **The annotation wins: the picture sits above the name**, with only the
back control above it.

V28 r4 (`457fc8d`, migration 0062) changed the maintenance fact: a moderator can
now replace a place's photo by link or by upload **from the moderator tools**,
with an UPDATE-only policy copied from 0009 and a public `place-photos` bucket.
The objection that retired the photos — *I can't police this* — stopped being
true.

## Decision

The place page shows the place's photo again, **above the name**, with its
attribution, and falls back to the same per-kind illustration the directory card
draws when a place has no photo (or when its photo fails to load). Both surfaces
now share one rule for "is there a photo" (`hasPlacePhoto`) and one illustration
component (`PlaceKindArt`).

Photo editing stays **moderator-only**. A place photo is a shared fact about a
public place, not personal data; the write path is the database's to enforce
(0062 is deliberately UPDATE-only: replace a picture, never add or delete a
directory row).

## Considered options

- **Leave the page photo-free and rely on "Learn more".** Rejected: the link
  answers "where can I read about this", not "what is this place", and the browse
  card the parent just tapped already showed them a picture. The inconsistency
  was the product defect.
- **A grey placeholder frame for places with no photo.** Rejected, and it was
  already rejected in-tree (V25 t04: nothing placeholder-shaped stands in that
  slot). The per-kind illustration is honest — it says what KIND of place this is
  — where an empty frame says only "something is missing".
- **Let any signed-in parent replace a place photo.** Rejected: it needs an
  approval queue and it puts a wrong photo of a public park in front of families
  until someone notices. The honest future shape is "suggest → moderator
  approves", which is its own batch.
- **Re-crop an existing place photo in the UI.** Rejected: 0062 is UPDATE-only by
  design; replacing is the moderating action.

## Consequences

- The V20 t01 ruling is **superseded**, and the migration that recorded it is a
  historical record and is **not** edited. This ADR is the durable record of the
  reversal.
- `e2e/places.e2e.ts` no longer asserts the photo's absence; it asserts both
  halves — a place with no photo draws the illustration and shows no credit, and
  a place with one shows the picture above its name with the credit attached.
- A failed image URL must fall back to the illustration on both surfaces
  (`onError`), so the founder's original complaint — broken images —
  cannot resurface as a broken card.
- The moderator tool gains a discoverable door and a contextual entry point in
  the same batch (V30 tickets 07–09); this ADR does not depend on them, but the
  reversal is only *maintainable* because they exist.
