# Implementation Plan: V18 — real place photos (V17 t05)

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below is executable without interpretation.
>
> Spec: `.scratch/v18/spec.md`. Build law: `docs/agents/code-structure.md`.
> Gate: `npm run verify` (build + test + lint + steering-lint) unless a slice
> pins more.
>
> **⚠️ EVIDENCE MUST BE A FILE, NOT PROSE.** Every slice writes its command
> output to `.scratch/v18/evidence/<slice>-<what>.log` and records the exit
> code. The V17 t02 review made prose-instead-of-artifact a **blocking
> finding**, and V17's t03/t04 review upheld two more blocking findings
> against the orchestrator for the same reason. Redirect and record:
>
> ```bash
> npm run build > .scratch/v18/evidence/<slice>-build.log 2>&1
> echo "exit=$?" >> .scratch/v18/evidence/<slice>-build.log
> ```

## Goal

Fill the card photo slot V17 t01 built with real, founder-approved photographs
from Wikimedia Commons, each carrying its license and attribution — and leave
the per-`kind` illustration in place wherever curation finds nothing usable.

**We know it worked** when: every approved place renders `<img data-photo="real">`
on `/browse`, every unapproved place still renders `data-photo="kind"`, no
applied row lacks license/author/source, and `npm run verify` is green.

## The one hard constraint

**The candidate sheet is reviewed by the founder BEFORE any row is written to
the database.** Founder ruling D2. A builder that writes `photo_url` directly
from a Commons top hit has failed the slice regardless of how the cards look —
the V17 measurement is that two of five top hits are the wrong subject.

## Non-goals

- No Google imagery. No `saved_places`. No points-fit. No new route. No upload
  path. No feed map/list toggle. Full list: spec §4.

---

## Slice t01 — the attribution record (migration 0046)

**Why first:** the apply step (t03) must write attribution in the same
statement as the photo, so the columns must exist before any photo is written.

### Interfaces (pinned)

`places` already has `photo_url text null`. V18 adds FOUR nullable text columns:

| Column | Contents | Example |
|---|---|---|
| `photo_source_url` | the Commons **file page** URL — the canonical provenance | `https://commons.wikimedia.org/wiki/File:Green_Lake-1.jpg` |
| `photo_license` | short license name, as Commons states it | `CC BY-SA 3.0` |
| `photo_author` | the author, **HTML-stripped plain text** | `en:user:Shakespeare` |
| `photo_attribution` | the ready-to-render attribution line | `en:user:Shakespeare / CC BY-SA 3.0` |

**Why `photo_author` is stripped, not raw:** Commons `extmetadata.Artist` and
`.Credit` return **HTML anchors** (verified this session). Storing raw HTML and
rendering it is an injection vector; storing it and stripping at render time
puts the work in the wrong layer. The script strips at write time and the DB
holds plain text.

**No `NOT NULL`, no CHECK.** The 0021 lesson (V3 ticket 08): free-text UI pins
with no DB CHECK. A partial attribution record is a script bug to catch in the
candidate sheet, not a constraint that blocks a legitimate later hand-edit.

### Migration shape (pinned — matches `.opencodereview/rule.json` idempotency)

Four `alter table public.places add column if not exists …` statements inside a
single `DO $$ … $$` block guarded on the column's absence, exactly as 0041 and
0045 do. **No `CREATE POLICY ... IF NOT EXISTS`** — Postgres does not support it
for policies (the 2026-09-04 lesson). No RLS change: `places` is read by
everyone already, and these columns ride the existing whole-row SELECT posture
(the 0014/0016/0021 column-add lesson).

### Acceptance criteria

1. `supabase/migrations/0046_place_photo_attribution.sql` exists and is
   **idempotent** — applying it twice is a no-op, proven by a second apply
   against the live DB, not by reading the SQL.
2. Applied live via the management API (`SUPABASE_ACCESS_TOKEN` is in `.env`
   and verified working — the V16 correction: **never claim a credential is
   missing without reading `.env` first**).
3. `information_schema.columns` read-back shows 4 new nullable text columns.
4. `src/lib/types.ts` `Place` gains the 4 fields, optional/nullable.
5. `npm run verify` exits 0.

### Verification command

```bash
npm run verify > .scratch/v18/evidence/t01-verify.log 2>&1; echo "exit=$?" >> .scratch/v18/evidence/t01-verify.log
```

Plus the live read-back saved to `.scratch/v18/evidence/t01-schema-readback.log`.

---

## Slice t02 — the paced Commons fetch + candidate sheet

**No DB writes in this slice.** Its output is a file a human reads.

### Interfaces (pinned)

New pure module `src/lib/commons.ts` — **the parsing/selection logic, testable
with no network**, per the build law ("domain logic in `src/lib/` as pure
functions with injected dependencies"):

```ts
export interface CommonsCandidate {
  placeId: string
  placeName: string
  kind: string
  /** null when there is no image, or when the request failed. */
  image: CommonsImage | null
  /** WHY image is null — this is the §3 distinction. */
  miss: 'none' | 'failed' | null
}
export interface CommonsImage {
  thumbUrl: string
  filePageUrl: string
  license: string
  author: string          // HTML-stripped
  attribution: string
}
/** Pure: raw Commons JSON for one place -> a candidate. Never throws. */
export function readCommonsResponse(place: {...}, raw: unknown): CommonsCandidate
/** Pure: build the attribution line, skipping empty parts. */
export function buildAttribution(author: string, license: string): string
/** Pure: strip tags/entities from an extmetadata HTML value. */
export function stripHtml(value: string): string
```

The **network** lives in the script, not the lib — `scripts/fetch-place-photos.mjs`
— which imports nothing from `src/` (a `.mjs` script cannot import TS). The
script therefore carries the fetch loop and the pacing, and the lib carries the
shapes. **The script's correctness is evidenced by its output sheet, not by
unit tests**; the lib's is evidenced by unit tests.

### Pinned operational requirements

1. **`User-Agent` is mandatory** — Commons 403s without it. Verified working:
   `DropInPlaydateApp/1.0 (https://drop-in-mu.vercel.app; contact: jonmeisburg@gmail.com)`
2. **Pacing + 429 backoff** — a fixed delay between requests, and on `429` an
   exponential backoff with a bounded retry count.
3. **`403`/`429`/network error ⇒ `miss: 'failed'`, NEVER `miss: 'none'`.**
   This is the single most important line in the slice. A failed request
   recorded as "no photo exists" is the exact measurement bug V17 §4.1.2
   documents.
4. **`gsrnamespace=6`** (File namespace), `iiprop=url|extmetadata`,
   `iiurlwidth=800` — the V17 probe's verified parameter set.
5. **Resumable** — the script can re-run only the failed names, so a partial
   run is not a restart.
6. The sheet is written to `.scratch/v18/candidates.md` (human) **and**
   `.scratch/v18/candidates.json` (machine, for t03's apply step).

### Acceptance criteria

1. `src/lib/commons.ts` + `src/lib/commons.test.ts` exist; the test covers:
   a real-shape Commons response → populated candidate; an empty `pages`
   result → `miss:'none'`; a 403/429/network throw → `miss:'failed'`;
   HTML in `Artist` → stripped plain text; `buildAttribution` with an empty
   author and with both parts present.
2. The script covers **all 239** places and the sheet states three separate
   counts: `hits`, `none`, `failed` (spec AC 2).
3. **A red check:** with the failure branch mutated to return `miss:'none'`,
   the unit test FAILS. A test that does not fail on the bug is not evidence
   (V17's own recorded lesson).
4. `npm run verify` exits 0.

---

## Slice t03 — apply the curated set

**Runs only after the founder reviews the sheet.** This slice is the gate.

### Interfaces (pinned)

- `scripts/apply-place-photos.mjs` reads `candidates.json` **plus** the
  founder's dispositions and updates ONLY approved rows, in one statement per
  row, writing `photo_url`, `photo_source_url`, `photo_license`, `photo_author`,
  `photo_attribution` **together**.
- The apply is **idempotent** and **re-runnable**.
- Every write goes through the management API with the service token — the anon
  key cannot write `places` (no write policy, by design).

### Acceptance criteria

1. Row count written == founder-approved count, asserted by a read-back, and
   **the two numbers are recorded in the evidence file**.
2. Zero rows written that were not approved — asserted by a read-back of
   `photo_url is not null` count equal to the approved count.
3. Every applied row has non-null `photo_source_url`, `photo_license`,
   `photo_author` (spec AC 4) — asserted by SQL, not by inspecting the script.
4. No `photo_url` points at a non-Commons host.

---

## Slice t04 — render the photo and its attribution

### Interfaces (pinned)

- The `PlacePhotoSlot` real branch (`BrowsePage.tsx:1346-1356`) already renders
  `<img src={place.photo_url} alt={place.name} data-photo="real" loading="lazy">`
  — **already correct, do not rewrite it.**
- Add attribution reachably: the photo is inside a card that is itself a link,
  so the attribution must NOT be a nested interactive element (an `<a>` inside
  an `<a>` is invalid HTML and a real a11y defect). The card links to the place
  detail; attribution therefore renders as **text** in the slot's corner, with
  the full source page reachable from the detail page.
- A pure seam `photoCreditLine(place)` in `src/lib/places.ts` returns the line
  or `null` when there is no photo — so the render decides nothing.

### Acceptance criteria

1. `/browse` e2e: a curated place renders `[data-photo="real"]`, an uncurated
   place renders `[data-photo="kind"]` — **both asserted**, so the fallback is
   proven, not assumed (spec AC 5).
2. No nested `<a>`: assert the attribution element is not an anchor inside the
   card link.
3. `photoCreditLine` unit-tested: null when no photo; the line when there is.
4. Tap targets unchanged ≥44px; existing mobile audit still passes.
5. `npm run verify` exits 0.

---

## Slice t05 — lanes

1. `places.e2e.ts` green (targeted, `nice -n 19` — the human works on this
   machine; full e2e is a batch-end lane).
2. Playtest lane PASS, 8 routes, 0 uncaught JS errors — evidence file.
3. Mobile audit including `/browse`.
4. `ocr` third lane over the batch diff.
5. Clean-range check (`.scratch/check-push-range.sh`).

---

## Sequencing

t01 → t02 → **[founder review of the sheet — a hard stop]** → t03 → t04 → t05.

t02 and t01 are independent and may overlap. **t03 cannot start before the
founder's review**, and no dispatch of t03 may be inferred from a green t02.

## Ledger

Append one line per event to `.scratch/v18/ledger.md`:

```
Slice N: dispatched (base <sha7>)
Slice N: complete (commits <base7>..<head7>, review clean)
Slice N: fix round R/5 (<X> addressed, <Y> open)
Slice N: parked — <finding> — Ruling: <why the code stands>
```
