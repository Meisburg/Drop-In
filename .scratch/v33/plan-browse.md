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

```
┌──────────────────────────────────────────────┐
│  [ Search places…                        ]   │  ← full width, expands to the
│                                              │    whole row while typing
├──────────────────────────────────────────────┤
│  WHEN   [ Open now ]                         │  tier 1
│  KIND   [ Playground ][ Indoor play ][ Café ]│  tier 2   … [ More kinds ]
│         [ Museum ]                           │
│  MINE   [ ♥ Saved ]                          │  tier 3
├──────────────────────────────────────────────┤
│  117 places ·  [ Best first ▾ ]  [ Map ]     │  ← SORT above the list, visible
├──────────────────────────────────────────────┤
│  ▸ row                                       │
│  ▸ row                                       │
└──────────────────────────────────────────────┘
```

**Defaults on load:** `Open now` **off**, kind **none**, sort **Best first**
(top-rated). Not A–Z.

### Why the sort is a control above the list, not a chip

`muyfmj1g` and `muydtkbk` are the same sentence filed twice: *"sorted
automatically by top-rated… instead of alphabetical."* A sort is a property of the
**list**, so it belongs to the list — stated once, visible, changeable, and it
never competes with the filters for a tap. A–Z stays available for a parent who
knows the name ("Greenlake"), which is exactly how `muyfmog8` was filed four
minutes earlier.

## 3 — The chip order, justified tier by tier

The old row was a flat pile of three different *kinds* of question — `Saved` (my
relationship to a place), `Open now` (time), `Playground / Indoor play / Museum` (sort
of place). Flatness is why it read as hodgepodge: nothing signalled which question
came first.

| Tier | Question | Controls | Why it sits here |
|---|---|---|---|
| **1. When** | *Can I go right now?* | `Open now` | It is the parent's **hardest constraint** and it is binary. It eliminates the most rows per tap, and on a phone with a toddler in the car it is the only question with a deadline. Nothing else can be answered before it. |
| **2. What kind** | *What sort of place?* | `Playground` · `Indoor play` · `Museum` · `Café` (… `More kinds`) | Only meaningful **after** the time constraint: an indoor playground that closed an hour ago is not an option. Four, not eight, because these are the four a parent names out loud; the rest stay reachable behind `More kinds` rather than competing for the same glance. |
| **3. Mine** | *What have I already liked?* | `Saved` | The **narrowest** question — it intersects with everything above it and is the last thing a parent applies, usually after they have already seen something they like once. Putting it last is the point: it is a memory aid, not a filter. |

Each tier is **labelled** (`When` / `Kind` / `Mine`) and separated by space, so the
grouping is stated rather than inferred. Within a tier the controls are one row of
pills that scrolls sideways at 390px; between tiers the eye gets a gap.

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
2. The three tier labels and their controls render in the order above; the tier-1
   control is the first interactive element after the search field.
3. The sort control renders **above the list**, offering at least `Best first` and
   `A–Z`; `Best first` is selected on load, and changing it reorders the rows
   **without changing which rows are shown** (a sort, never a filter — asserted by
   comparing the row count and the row set).
4. `Best first` is stable across renders on tied ratings (the same query twice
   returns the same order) — the tie-break assertion.
5. The search field expands to the full row while focused and typing, and returns
   when cleared — asserted by width, not by DOM order.
6. Every chip keeps `aria-pressed` and a ≥44px target; each tier row side-scrolls
   at 390px without widening the page (`documentElement.scrollWidth <= clientWidth + 1`).
7. `Saved` still reflects the follow/save read and still renders nothing extra for a
   signed-out viewer.
8. Every spec that located the deleted controls changes **in the same diff**
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
directory. It shows: the expanded-search state, the three labelled tiers, the sort
above the list, and the list sorted Best-first with its tie-break visible.

**One recommendation, in one paragraph, at the top of the prototype's own page**:
what changes, what it costs, and what he should look at first. No menu of options.
