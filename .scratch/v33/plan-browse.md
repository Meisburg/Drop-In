# /browse — the design pass (V33-D)

**Owner:** the orchestrator. **Contract:** `.scratch/v33/RULING-browse-directory.md`
(the founder's ruling, which supersedes the earlier "prototypes first" ruling and
collapses `muydnms9`, `muydpqw0`, `muydrqml`, `muydtkbk`, `muyfmj1g` into **two
changes plus one design pass**). **Design system:** `impeccable` (Operate mode —
this surface's visitor completes a task), against this app's existing PRODUCT.md /
DESIGN.md; no new visual world.

**This is a plan, not five briefs. One recommendation, not a menu.**

---

## 1 — The one question the surface answers

> *"Where can I take my kids in the next two hours that I will actually enjoy?"*

Every control either narrows that answer or leaves. That test deletes the Filters
modal outright and demotes "Top rated" from a filter to the ordering — because
"best" is not a thing a parent wants to *exclude*, it is the thing they want
*sorted first*.

## 2 — The layout, top to bottom

> ⚠️ **CORRECTED 2026-10-08** by the founder's prototype review
> (`.scratch/v33/RULING-browse-correction.md`), which **supersedes §2 and §3 as
> first written**. Two things were rejected: the three labelled tiers, and a Map
> button above the list. **The correction makes the change smaller, not larger** —
> no new components, no labels, one control removed.

```
┌──────────────────────────────────────────────┐
│  [ Search places…                        ]   │  ← expands while typing
├──────────────────────────────────────────────┤
│  [Open now][Playground][Indoor play][Café]   │  ← ONE row, no labels,
│  [Museum][♥ Saved][More kinds]               │    scrolls sideways
├──────────────────────────────────────────────┤
│  117 places ·  [ Best first ▾ ]              │  ← SORT above the list
├──────────────────────────────────────────────┤
│  ▸ rows…                                     │  ← the floating map toggle
└──────────────────────────────────────────────┘    appears on scroll (V27)
```

**Defaults on load:** `Open now` **off**, kind **none**, sort **Best first**
(top-rated). Not A–Z.

**⚠️ Do not add a map entry point above the list.** It already exists: the floating
map toggle appears as the page scrolls (`PlaceDirectory.tsx:46` — *"V27: how far
 the page scrolls before the floating map toggle appears"*). A second door would
duplicate a control that is already there.

### Why the sort is a control above the list, not a chip

`muyfmj1g` and `muydtkbk` are the same sentence filed twice: *"sorted
automatically by top-rated… instead of alphabetical."* A sort is a property of the
**list**, so it belongs to the list — stated once, visible, changeable, and it
never competes with the filters for a tap. A–Z stays available for a parent who
knows the name ("Greenlake"), which is exactly how `muyfmog8` was filed four
minutes earlier.

## 3 — The chip order, justified tier by tier

**ONE flat horizontal row of pills. No labels. No stacked rows.** The founder
rejected the labelled tiers outright — *"all those pills could be all together…
why do they need to be different rows?"* — and supplied TripAdvisor's category row
(`Essentials · Travelers' Choice · Museums · Outdoors · Art`) as the reference:
one row, no captions, scrolls sideways.

**The ORDER is kept; the STRUCTURE is dropped.** The order in the row:

```
Open now · Playground · Indoor play · Café · Museum · Saved · More kinds
```

Why this order still holds without tiers:

- **`Open now` first** — the only question with a deadline, so it leads the row.
- **The kinds next** (`Playground` · `Indoor play` · `Café` · `Museum`) — the four a
  parent names out loud, in the order one would think of them for a toddler: a park,
  then somewhere indoors, then a coffee while they play, then something to look at.
  The remaining kinds stay reachable behind **`More kinds`** rather than competing
  for the same glance.
- **`Saved` near the end** — the narrowest question, a memory aid rather than a
  filter; it intersects with everything to its left.
- **`More kinds` last** — an overflow door, never a destination.

One row of pills that **scrolls sideways at 390px** without widening the page.

**Deleted: the Filters modal and its trigger** (`PlaceDirectory.tsx:1529` and the
`places-filter-*` entry point). Its contents are the pill row above. **`Top rated`
leaves the chip row entirely** and becomes the sort — the one control that was in
two places (`:994` chip and `:1529` option) now exists once.

**Deleted: the Filters modal and its trigger** (`PlaceDirectory.tsx:1529` and the
`places-filter-*` entry point). Its contents are the tier rows above. **`Top rated`
leaves the chip row entirely** and becomes the sort — the one control that was in
two places (`:994` chip and `:1529` option) now exists once.

## 4 — The two behaviour changes

1. **Default sort becomes "Best first" (top-rated, most-reviewed), not A–Z.**
   `PlaceDirectory.tsx:235` (`sortMode = 'alpha'`) is the defect; the bulk
   top-rated rating read already exists to power it. **Tie-break** must be stable
   and stated: rating desc, review count desc, then name — because the live
   directory has **4 reviews on 4 of 234 places**, so 230 rows tie and an unstable
   tie-break would reshuffle the list between renders. A–Z stays a first-class
   option.
2. **The search field expands to the full row while typing** (`muydrqml`) and
   collapses back when blurred or cleared. He cannot currently see what he types.

## 5 — Acceptance criteria (for the slice that follows the prototype)

1. `/browse` renders **no** Filters trigger and **no** filter modal (`places-filter-*`
   absent — its own assertion, an absence claim that waits for paint).
2. The pills render in **one** row, with **no tier labels**, in the order above;
   `Open now` is the first interactive element after the search field.
3. **No second map entry point**: the page renders no map control above the list
   (the floating toggle appearing on scroll is the only one — assert its absence
   above the list, not its absence everywhere).
4. The sort control renders **above the list**, offering at least `Best first` and
   `A–Z`; `Best first` is selected on load, and changing it reorders the rows
   **without changing which rows are shown** (a sort, never a filter — asserted by
   comparing the row count and the row set).
5. `Best first` is stable across renders on tied ratings (the same query twice
   returns the same order) — the tie-break assertion.
6. The search field expands to the full row while focused and typing, and returns
   when cleared — asserted by width, not by DOM order.
7. Every pill keeps `aria-pressed` and a ≥44px target; the **one** pill row
   side-scrolls at 390px without widening the page
   (`documentElement.scrollWidth <= clientWidth + 1`).
8. `Saved` still reflects the follow/save read and still renders nothing extra for a
   signed-out viewer.
9. Every spec that located the deleted controls changes **in the same diff**
   (`scripts/guards/stale-locator-guard.mjs`), and `/browse`'s route stays in the
   playtest `routes.json` set.

## 6 — The prototype (what the founder looks at)

A **static HTML** file, no app code, no new route:
`.scratch/v33/prototypes/browse/browse.html` — the restructured `/browse` at 390px
and 1280px, in **this app's own tokens** (DESIGN.md: flat-at-rest, borders not
shadows, the indigo/green accents, the existing pill anatomy, ≥44px targets,
16px inputs).

It must be built from the real component vocabulary rather than invented: the pill
and chip shapes, the row anatomy, and the type scale all come from the existing
directory. It shows: the expanded-search state, the **one flat pill row**, the sort above the
list, and the list sorted Best-first with its tie-break visible.

✅ **BUILT AND CORRECTED** — `.scratch/v33/prototypes/browse/browse.html` plus
`browse-390.png` and `browse-1280.png` (2026-10-08 06:28). **That is the visual
reference for the slice; do not rebuild it.**

**One recommendation, in one paragraph, at the top of the prototype's own page**:
what changes, what it costs, and what he should look at first. No menu of options.
