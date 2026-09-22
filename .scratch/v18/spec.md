# V18 — Real place photos (V17 t05)

> **Status:** open, 2026-09-21. Founder-ruled: build t05 photos.
> **Base:** `192a48e` (V17 closed). Baseline gate re-verified this session:
> `npm run verify` exit 0 · 980/980 unit (27 files) · lint 0 errors / 62 warnings.
> **Spec parent:** `.scratch/v17/spec.md` §5 t05, §4.1.1, §4.1.2, D1.

## 1. What this is

V17 built the Airbnb-style places redesign but deliberately shipped cards
**without photos**, falling back to a per-`kind` illustration. The card's real
photo branch is already written and unreachable — `BrowsePage.tsx:1348` renders
`<img data-photo="real">` whenever `place.photo_url` is non-empty, and it is
dead code today because **all 239 seeded places have `photo_url IS NULL`**
(verified against the live DB this session: `total=239, with_photo=0`).

V18 fills that slot with real photographs from **Wikimedia Commons**, curated
by the founder, with a license/attribution record for every image.

## 2. Why Commons, and why curation is mandatory

D1 (V17 spec) ruled Google out on licensing. Commons is the source because its
images carry explicit reusable licenses.

**The measured finding that shapes this whole batch** (V17 spec §4.1.2, from a
probe against the real 239 seeded names): Commons returns ≥1 image for **~80%
of place names**, all on reusable licenses (CC BY / CC BY-SA / CC0 / PD).
**But the usable rate is lower than the hit rate** — of five top hits inspected,
two were wholly wrong (a congressman's portrait for "Warren G Magnuson", a 1980
seniors' outing for a playground) and one was marginal.

**Therefore an automated backfill that trusts the top hit WILL put visibly
wrong photos on cards.** Curation is a required step in this batch, not a
nice-to-have. Founder ruling this session: **the candidate sheet is reviewed
before anything is written to the DB.**

## 3. Two operational constraints (both learned the hard way)

Recorded in V17 spec §4.1.2 and re-verified in this session's probe:

1. **Commons answers `403` without a `User-Agent`.** A descriptive UA with a
   contact URL is required. Verified working: `DropInPlaydateApp/1.0
   (https://drop-in-mu.vercel.app; contact: jonmeisburg@gmail.com)`.
2. **Commons answers `429` under fast pacing.** The script paces its requests.

**A naive script reads both as "no photo exists"** and silently leaves places
empty that have perfectly good images. An early version of the V17 probe did
exactly that and reported 0% — a measurement bug, not a fact. The script MUST
distinguish **"no result"** from **"request failed"**, and the candidate sheet
MUST report the failures separately.

## 4. Scope

### In scope

1. **Migration 0046** — an additive, idempotent photo attribution record:
   source page URL, license, author, and the license's required attribution
   string, per place. `places.photo_url` already exists (`types.ts:308`) and is
   NOT re-added.
2. **A paced backfill script** that queries the Commons API for all 239 names,
   respects the UA and pacing constraints, distinguishes failure from absence,
   and writes a **candidate sheet** — NOT the database.
3. **The candidate sheet**, human-readable, grouped for fast review, carrying
   for each candidate: place name + kind, image thumbnail URL, the Commons file
   page URL, license, author, and a **usable / doubtful / wrong** disposition
   the founder sets.
4. **An apply step** that writes ONLY the founder-approved rows.
5. **Attribution rendering** — CC BY / CC BY-SA require attribution, so every
   rendered photo must be able to show it.
6. **Kind-illustration fallback stays** for every place curation leaves empty.
   This is not a degraded path; it is the permanent answer for gaps.

### Non-goals (explicit)

- **No Google-sourced imagery**, scraped or via Places API (V17 §4.1.1, D1).
- **No `saved_places` table**; no second save concept (V17 §4.2).
- **No per-card follower counts** (V17 §4.2).
- **No re-introduction of a points-fit** — V16 t07 item 2 (`93f313b`) deleted
  it; reverting is the failure mode (V17 D3).
- **No new route**, so `.scratch/playtest/routes.json` is unchanged
  (`.opencodereview/rule.json` requires a same-commit update IF one is added).
- **Not the feed's map/list toggle** — that is V16 t06 item 3, still unshipped.
- **No upload path.** Parents do not add place photos in V18.

## 5. Decisions

| D | Question | Ruling | Source |
|---|---|---|---|
| **D1** | Photo source? | Wikimedia Commons, curated | V17 D1 |
| **D2** | When is the DB written? | **Only after the founder reviews the candidate sheet** | Founder, 2026-09-21 |
| **D3** | What about places with no usable photo? | Keep the `PLACE_KIND_ICONS` illustration — permanent, not a fallback-to-be-fixed | V17 t01 |
| **D4** | Licensing record? | Every applied photo carries source page + license + author + attribution string in the DB | V17 §5 t05.1 |

## 6. Acceptance criteria

1. `npm run verify` exits 0 on the final tree.
2. The candidate sheet covers **all 239** places, and states explicitly how many
   had hits, how many had none, and **how many requests FAILED** (the three
   numbers must be separate — §3).
3. No row is written to `places.photo_url` that the founder did not approve.
4. Every row with a `photo_url` also has a non-null source page, license, and
   author.
5. On `/browse`, a curated place renders `<img data-photo="real">` and an
   uncurated place renders `data-photo="kind"` — both asserted in e2e, so the
   fallback is proven to still work rather than assumed.
6. Attribution is reachable from the rendered photo.
7. Unit coverage for every new `lib/` seam, with a sibling `.test.ts` per the
   build law (`docs/agents/code-structure.md`).

## 7. Risks

1. **Wrong photos reach cards.** Mitigated by D2 (human review) + the sheet's
   per-row disposition.
2. **False negatives from 403/429.** Mitigated by §3's separation of failure
   from absence, and by re-running failed names rather than recording them
   as empty.
3. **License compliance.** CC BY / CC BY-SA require attribution; the migration
   stores it and AC 6 renders it.
4. **239 rows × an image is a real phone cost.** The V17 lead/overflow
   structure (`BROWSE_LIST_LEAD_LIMIT = 6`, the "See all" door) is unchanged,
   and `loading="lazy"` is already on the `<img>`.
5. **Hotlinking Commons.** The thumb URLs are served by Wikimedia's CDN. This
   is permitted for reasonable use and is what the V17 feasibility probe
   assumed; recorded rather than hidden.

## 8. Status log

- 2026-09-21 — spec opened. Live DB verified: 239 places, 0 photos. Commons
  probe re-confirmed working with a User-Agent, returning real imageinfo +
  extmetadata (license/author) for a seeded name.
