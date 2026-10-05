# The tightened tier-1 gate — builder report (2026-10-05)

Batch: `.scratch/place-photo-sourcing/`. Base: `4881dc8` (the slice that built the
pipeline). Everything below is measured this session; the raw evidence is the
logs and reports beside this file.

## 1. The rule, in one paragraph

Tier 1 (the tier that is LIVE to parents) now requires **the place's name AND an
independent PLACE signal**: the candidate's title/description (plus its Commons
categories) must contain one of the place-kind words the product already uses
(park, playground, playfield, pool, wading pool, splash pad, beach, trail,
garden, field, court, plaza, community center, library, museum, P-Patch, …), or
the directory's city/neighbourhood, or a Commons category that says so — and an
any-order "loose" name match must additionally echo the kind words the place
calls ITSELF ("International District **Community Center**"), because a bag of
tokens can reassemble into a different referent. On top of that, anything that
reads as a **work or a document** is DROPPED, not demoted: a title with a
pre-1955 year (a scan of Thomas Mann's *Das Wunderkind*, 1914), a catalogue /
pamphlet / treatise / annual report / price list / DPLA or `(ia …)` scan marker,
a `.pdf`/`.djvu`, a person's name behind a role word (now including `Rev.`), or a
title a human read and winced at. And a candidate that carries **its own
geotag** more than 50 km from the place is dropped whatever its title says,
because Commons name search is not locality-bound and a photograph 4,000 km away
looks exactly like a correct answer.

## 2. Unit tests added, and the exact false positives they pin

`src/lib/placePhotoSourcing.test.ts` — **70 tests** (suite 2306 → 2335, +29, no
new lint warnings). Newly pinned, each a real string a source actually returned:

| # | Place | Pinned candidate title | Verdict pinned |
|---|---|---|---|
| 1 | Wunderkind | `Thomas Mann Das Wunderkind 1914` | DROP `archival` |
| 2 | Wunderkind | `Thomas_Mann_Das_Wunderkind_1914` (the file-name form) | DROP `archival` |
| 3 | Baker Park on Crown Hill | `Price list. Fall 1919 - Baker Bros. Co. (IA CAT31301958).pdf` | DROP `blocklisted` |
| 4 | 12th West / West Howe Park | `Filial tribute to the memory of Rev. John Moffat Howe, M.D (IA filialtributetom00reid_0).pdf` | DROP `person-name` |
| 5 | Alki Community Center | `Visit of Maria Damanaki, Member of the EC, to Greece (P-018025-00-05)` | DROP `blocklisted` |
| 6 | International District Community Center | `Chinatown-International District, Seattle, Washington` | tier 2 (loose match, no own kind word) |
| 7 | International District Community Center | `Hing Hay Park, Chinatown-International District, Seattle, Washington` | tier 2 (kind word belongs to another place) |
| 8 | Ross Playground | `File:Dan Ross Playground 2025 jeh.jpg` (geotag 40.62255, −74.0218) | DROP `wrong-location` |
| 9 | Beacon Hill Playground | `File:Beacon Hill Playground - geograph.org.uk - 1152815.jpg` (geotag 51.12273, −0.7549) | DROP `wrong-location` |
| 10 | Washington Park | `White house details, … octagonal window, black shutters, Washington Park, Seattle, Washington, USA` | DROP `reviewed-non-place` |
| 11 | Pritchard Beach | `A babe of a house in Pritchard Beach` | DROP `reviewed-non-place` |

Still pinned from before: the spec's four probe false positives (dump truck,
kitchen countertops, keyboard rig, Councilmember Sally Clark), the person-shape
rule even when the title names the place, and the two-class drop-vs-demote rule.

Still ACCEPTED (the positive controls, proved in the same run):
`Olympic Hills, Albert Davis Park` → "Albert Davis Park"; `Albert Davis Park
playground panorama`; `Warren G. Magnuson Park` → "Warren G Magnuson"; `Woodland
Park`; `West Howe Park.jpg` → "12th West / West Howe Park"; `Beacon Hill
Playground - geograph.org.uk - 1152815.jpg` (no geotag = unknown, not wrong);
`Pritchard Beach, Seattle`; `Wunderkind, Seattle`; `Wunderkind indoor play
space`; a category `Category:Indoor playgrounds in Seattle`.

The name test is *shown* firing on the novella
(`titleNamesPlace('Thomas Mann Das Wunderkind 1914', 'Wunderkind') === true`) —
the point is that the name test alone is not the gate.

## 3. DRY pass — tier-1 before / after, and every candidate demoted

Tool's dry run at `4881dc8` (saved as `dry-run-before.json`):

```
applied 58 (tier1 31, tier2 27) | no candidate 54 | failed 0 | requested 112
```

Final dry run with the tightened gate (`dry-run-final.json`) and the LIVE run
(`report.json`, identical tier-1 list):

```
applied 50 (tier1 24, tier2 26) | no candidate 62 | failed 0 | requested 112
```

Every candidate that was tier 1 before and is not tier 1 now:

| Place | Candidate title (before, live to parents) | Now | Why it went |
|---|---|---|---|
| Wunderkind | `Thomas Mann Das Wunderkind 1914` | no candidate | ARCHIVAL — a 1914 novella scan. **The defect.** |
| Southwest Branch, Seattle Public Library | `Southwest Branch, Seattle Public Library, 1961 - DPLA - …` | no candidate | BLOCKLISTED — a DPLA archival scan |
| Hiawatha Playfield Wading Pool | `Hiawatha Playfield wading pool, 1912` | no candidate | ARCHIVAL 1912 |
| South Park Playground | `South Park Playground, 1910` | tier 2 (hidden) | ARCHIVAL 1910 |
| Beacon Hill Playground | `Beacon Hill Playground - geograph.org.uk - 1152815.jpg` | tier 2 (hidden) | WRONG LOCATION — the file's own geotag is England (51.12, −0.75) |
| Ross Playground | `File:Dan Ross Playground 2025 jeh.jpg` | tier 2 (hidden) | WRONG LOCATION — the Commons page says "park in Brooklyn, NYC" (40.62, −74.02) |
| International District Community Center | `Chinatown-International District, Seattle, Washington` | tier 2 (hidden) | LOOSE MATCH — the neighbourhood's tokens, the place's own kind words ("community center") absent |

Demoted by human reading, then **replaced by a better candidate that stayed tier 1**:

| Place | Candidate rejected by hand | Replaced by |
|---|---|---|
| Washington Park | `White house details, … black shutters, Washington Park, Seattle, Washington, USA` — a house, not the park | `After the roddies are done blooming, … view of 520 floating bridge from Washington Park, Seattle, Washington, USA` |
| Pritchard Beach | `A babe of a house in Pritchard Beach` — a house/person, not the beach | `pritchard beach` |
| Hiawatha Playfield | `Boys exercising at Hiawatha Playfield, Seattle, 1911` (archival) | `File:Seattle - Hiawatha Playfield 03.jpg` (modern) |

Also dropped from tier 2 (already hidden, so no parent ever saw them): Cheryl
Chow Park (DPLA), Colman Playground (1910 DPLA), Lincoln Park Wading Pool (ca.
1911 MOHAI), View Ridge Playfield Wading Pool (1904 book scan), Baker Park on
Crown Hill and Hutchinson Playground and Webster Playground (UK geograph files).

### The 24 that ARE live to parents, read title by title

Albert Davis Park ← "Olympic Hills, Albert Davis Park" · Bitter Lake Community
Center ← "Linden Ave connection to Bitter Lake Community Center and Fields." ·
Colman Pool ← "Colman Pool" · Genesee Park and Playfield ×2 ← "Genesee Park and
Playfield — Seattle, Washington" · Georgetown Playfield ← "Georgetown Playfield
Panorama (CC)" · Green Lake Park Wading Pool ← "Green Lake Wading Pool" ·
Hiawatha Playfield ← "File:Seattle - Hiawatha Playfield 03.jpg" · Kirke Park ←
"File:P-Patch at Kirke Park, Seattle, Washington.JPG" · Loyal Heights Community
Center ← exact · Meridian Playground ← "Welcome to Meridian Playground" · Miller
Community Center ← "File:Seattle - Miller Community Center 01.jpg" · Miller
Playfield ← "Jack @ Miller Playfield, 7/22/2012" · Mounger Pool ← "mounger pool
in magnolia" · Pratt Park ← "Kids playing at Edwin Pratt Park, 2002" · Pritchard
Beach ← "pritchard beach" · Rainier Beach Community Center ×2 ← "Comcast Cares
Day - Rainier Beach Community Center" · Ravenna Park ← "Bluebells in Ravenna
Park, Seattle" · Sam Smith Park ← "Sam Smith Park" (Openverse tags: `seattle`,
`centraldistrict`) · Soundview Playfield ← "Seattle: Soundview Playfield +
Softball" · Warren G Magnuson ← "Dogs at play, … Warren G. Magnuson Dog Park,
Seattle, Washington, USA" · Washington Park ← the rhododendron/520-bridge garden
photo · Woodland Park ← "Me, Camp Tomato, Woodland Park, Seattle, WA".

Five ambiguous Openverse hits were locality-checked through their own tags:
Sam Smith Park (`seattle`, `centraldistrict`), Meridian Playground
(`wallingford`), Georgetown Playfield (`georgetown`, `seattle`), Green Lake Park
Wading Pool (`seattle`), plus the Seattle-prefixed Soundview title.

Three left LIVE with a flag, because the brief named them as accepted examples
(Warren G Magnuson, Woodland Park) or because the title is genuinely the park
(Washington Park, Miller Playfield, Bitter Lake Community Center): a dog-park
photo, a personal "Me, Camp Tomato" photo, a garden-plot photo, and a photo of a
child named Jack. None is a *wrong place*; each is a *not-ideal picture* the
moderator can replace via the existing editor.

## 4. Applied counts and live read-back

```
LIVE RUN — 112 of 112 blank place(s)
applied 50 (tier1 24, tier2 26) | no candidate 62 | failed 0 | requested 112

read-back (before): blanks 112, unreviewed 0, total 239, place_photos bucket 36 objects
read-back (after):  blanks  62, unreviewed 26, total 239, place_photos bucket 36 objects
VERIFIED: 50 row(s) written (26 tier-2 unreviewed), no bucket growth.
```

Per-row read-back (`select … where id in (the 50 applied ids)`):
**50 report rows → 50 live rows, 0 mismatches; 24 `confirmed`, 26 `unreviewed`.**

Whole-table read-back:

```
photo_review_state | rows | with a photo
null               |   62 |   0     ← the remaining blanks
confirmed          |  151 | 151     ← 127 pre-existing + 24 new tier-1 (LIVE)
unreviewed         |   26 |  26     ← new tier-2 (HIDDEN from parents)
```

## 5. Gate

Second run (the first caught a real type error of mine — see §6):

```
npm run verify → EXIT=0
build:              tsc -b && vite build — clean
Test Files  77 passed (77)
     Tests  2335 passed (2335)
lint:  Found 86 warnings and 0 errors
a11y:focus: PASS — every control that suppresses its outline provides a focus cue
steering-lint: 27 files, clean
GUARDS: PASS — all deterministic rules hold.
```

Baseline 77 files / 2306 tests / 86 warnings / 0 errors / GUARDS PASS → tests
only, +29.

## 6. Deviations, and things found but not fixed

1. **A concurrent session committed my in-progress files.** `7b0ce35`
   ("fix(places): tier 1 needs a place signal, not just the name", 13:49:48)
   contains `scripts/source-place-photos.mjs`, `src/lib/placePhotoSourcing.ts`
   and its test at the state of that minute — the version WITHOUT the
   location rule, the own-kind corroboration and the reviewed-rejection list
   (61 tests). I did not commit, stage, stash or push; my finished work is the
   uncommitted `M` diff on top of it. The parent should decide whether to amend
   that commit's contents or add a follow-up commit of mine.
2. **The Commons query is now city-qualified** (`<name> Seattle`), which the spec
   called "Commons name search". Measured both ways for eight places: the
   qualified query kept every Seattle hit and *found* ones the bare name missed
   (Kirke Park's own P-Patch instead of Norwegian churches; three modern Hiawatha
   photos). This is precision AND yield, and it is what removed the Brooklyn /
   Central Park / England / UK-geograph class at the source.
3. **`REVIEWED_REJECTIONS` is a two-entry hand-curated list**, not a learned rule:
   no rule broad enough to reject a house-details title for Washington Park keeps
   "Dogs at play … Magnuson Dog Park" live. Each entry is scoped to its place and
   carries its reasoning; both are unit-tested.
4. **The location check and the own-kind corroboration go beyond the literal
   brief.** Both were forced by reading the tightened list itself: the first made
   Beacon Hill Playground a live photo of an English playground, the second made
   Hing Hay Park the picture of a community center.
5. `npm run verify` first failed on `src/lib/placePhotoSourcing.ts(835)` —
   `DroppedCandidate.reason` did not include `'wrong-location'`. Vitest strips
   types, so only `tsc` saw it. Fixed by naming the union once (`DropReason`), and
   the gate is green on the re-run.
6. The throwaway probes `probe-drops.mjs` and `probe-commons-locality.mjs` are in
   this directory (read-only, no writes). Delete them when the batch closes.
7. **NOT FIXED, found:** `hasPersonNameShape` treats `dr` (and now `rev`) as a
   role, so a title like "Dr. Blanche Lavizzo Park" would be dropped as a
   person-name even though it is the place's own name. It does not fire on this
   corpus (that place's candidate has no such title), but it is a latent
   false negative in a file I touched.
8. **NOT FIXED, found:** `report.md`'s no-candidate list still says only "all
   failed the gate"; the per-candidate drop reasons are printed to the console
   log (`dropped` on `RankCandidatesResult`) but not written into the report.
9. **NOT FIXED, found:** the tier-2 queue is noisy — e.g. "Madison Pool ← Man
   wearing jammer on diving block", "South Park Playground ← Leschi Park
   Restroom", "Bayview-Kinnear Park ← The Queen Anne Hill counterbalance". They
   are hidden from parents by the review state, so this is a moderator-workload
   issue, not a live risk.
10. The 1955 archival threshold is inherited from the V18 pipeline; a 1975 or
    1980s photograph still passes (it might read as dated but not archival), and a
    date written as "circa 1980s" carries no 4-digit year and is not caught.
