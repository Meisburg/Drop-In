# V34 slice D — the place page shows the place's own attributes as pills

**Sentinel:** `V34-D-PLACE-PILLS-P5L9`
**Status:** DONE
**Commit:** `026776c` — `feat(place): the place page shows its own attributes as pills`
**Branch:** `place-pills-p5l9` @ `/tmp/pd-wt/place-pills-p5l9`
**Base:** `5c97c5a` · **Not pushed.**

This session **resumed** a stalled run: the branch already carried the work
uncommitted. What follows is that work, reviewed against the brief, corrected in
two places, re-gated end to end, and now committed.

---

## What shipped

On `/place/:id`, the meta sentence `{kind} · {indoor} · {distance} from your zip`
is replaced by a **wrapping pill row** carrying the place's own stored facts:

| Pill | Source | Rendering rule |
|---|---|---|
| `place-pill-kind` | `placeKindLabel(place.kind)` + `PLACE_KIND_ICONS` | always (the column is `not null` per 0029's CHECK) |
| `place-pill-indoor` | `placeIndoorLabel(place)` | always |
| `place-pill-coffee` | `placeHasCoffeeNearby(place)` — the **existing** pure seam | **only when `coffee_nearby === true`** |

- **Anatomy reused verbatim** from the directory row: `whitespace-nowrap`,
  `shrink-0`, `rounded-full`, `px-4`, `text-sm font-medium`, the same
  `border-slate-200 bg-white text-slate-700` ground. The kind glyph is
  `PLACE_KIND_ICONS[place.kind]` — the same map the directory chip draws.
- **Labels, not filters.** `<li>` elements, no `button`/`a`/`input`, no
  `aria-pressed` — asserted positionally (count 0 inside the row) *and* by
  `tagName === 'LI'`.
- **No new read or fetch.** Every pill renders from the `Place` row the page
  already loads. The coffee predicate is the **existing** pure seam
  `placeHasCoffeeNearby` (`src/lib/places.ts:1503`) — no second copy of `=== true`
  in a render site. **No `lib/` seam was added or needed.**
- **Distance line survives.** The paragraph now renders only when `distance !==
  null`, so a coordinate-less place gets no empty `<p>` and no dangling
  separator.

## The three coffee cases (the point of the column's design)

`places.coffee_nearby` is three-valued and the slice treats it that way. Each
case was written to the live row, **read back to prove the write landed**, then
reloaded in the browser:

| stored value | meaning | pill? |
|---|---|---|
| `true` | OSM asked, a cafe is near | **yes** — "Coffee nearby" |
| `false` | OSM asked, none found | **no** |
| `null` | **never asked** (every pre-0068 row) | **no** |

**Mutation-proved, not asserted.** Collapsing the predicate to
`placeHasCoffeeNearby(place) || place.coffee_nearby === false` (the defect —
rendering a pill for "asked, none found") makes the coffee test FAIL:

```
✘ coffee nearby: true renders the pill, false and null render none (V34-D)
  Error: expect(locator).toHaveCount(expected) failed
  Locator:  getByTestId('place-pill-coffee')
  Expected: 0
  Received: 1
```

while the other four pill tests still pass. The test is load-bearing.

## Acceptance

| # | Criterion | Evidence |
|---|---|---|
| 1 | kind + indoor pills, asserted on rendered text | 2 assertions, built from the row read back over PostgREST, then from the seams |
| 2 | `true` renders; `false` and `null` render none — three separate assertions | one test, three cases, mutation-proved |
| 3 | wraps at 390px, `scrollWidth <= clientWidth + 1` | asserted + each pill's right edge ≤ 391; measured overflow **0** |
| 4 | signed-out visitors see the same pills | separate anon context, same words, no control in the row |
| 5 | nothing else on the place page changes | `place-reviews` **10/10**, the place-page subset of `places.e2e` **4/4**, including its reading-order test |
| 6 | diff scope | `PlacePage.tsx` + the new spec + the spec's `fixtures.ts` helpers + one assertion line in `places.e2e.ts` — **4 files** |

## Gate

```
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only
  server.host change (another session), not this slice" npm run verify
  → EXIT=0
```

- `build` ✓ `typecheck:e2e` ✓ `test` **92 files / 2705 passed** ✓
- `lint` **88 warnings, 0 errors**
- `a11y:focus` ✓ PASS
- `steering-lint` **green** on this worktree (28 files — the other lane's
  untracked `docs/agents/*`, which are the expected red in the MAIN worktree, do
  not exist here)
- `guards` **GUARDS: PASS — all deterministic rules hold.**

### Targeted e2e — private port **4214**

4210 was occupied by another lane's listener, so this run used 4214. Marker
minted on the worktree; listener killed by port.

| Spec | Result |
|---|---|
| `place-pills.e2e.ts` (new, 5 tests) | **6 passed** (setup + 5) |
| `places.e2e.ts` place-page subset (`:1708`, `:1892`, `:1948`) | **4 passed** |
| `place-reviews.e2e.ts` (10 tests) | **10 passed** |

A full `places.e2e.ts` run exceeds a single tool call; the place-page subset is
the part this slice can reach, and it is green. `:1948` asserts the page's
reading order, which pins the pill row's position between the `h1` and the
description.

### ⚠️ Independent re-verification (the resuming session, on the committed state)

A **second session** resumed this worktree and re-ran everything against the
committed tree (`026776c`) rather than trusting the report above. Every number
was reproduced on private port **4210** (the listener this session owned; killed
by PID):

| Check | Result |
|---|---|
| `npm run verify` (with the config waiver) | **EXIT=0** — 92 files / 2705 tests, lint 88 warnings / **0 errors**, a11y:focus PASS, steering-lint PASS, **GUARDS: PASS** |
| `place-pills.e2e.ts` | **6 passed** (setup + 5) |
| `place-reviews.e2e.ts` | **10 passed** |
| `places.e2e.ts` place-page subset (`:1708`, `:1892`, `:1948`) | **4 passed** |

**The coffee mutation was re-proved independently.** Changing the render
condition to `placeHasCoffeeNearby(place) || place.coffee_nearby === false`
(the defect) and rebuilding made the coffee test red —
`Expected: 0, Received: 1` — while its sibling leg passed. Restored; the tree
then matched the commit exactly.

**Rendered evidence, re-measured:** at 390px on `/place/:id` the row reads
`Playground` / `Outdoor` / `Coffee nearby`, and
`documentElement.scrollWidth - clientWidth = 0`. Screenshot
`/tmp/pd-wt/pp-390.png`.

### ⚠️ What a full `places.e2e.ts` run did here (and why it is not this slice)

A full `places.e2e.ts` run in the resuming session reported **12 failed / 12
passed**. Inspected, the failures are environmental, not code:

- the failing tests' page snapshots show the app on the **"Sign in" page** — the
  reused marker `storageState` was invalid for those legs (a session/contention
  failure, and the machine was at load 7 with 39 Chrome processes from other
  lanes);
- every failing test is **outside this slice's reach** (feed map pins, category
  chips, heart/follow, radius control) and none touches the place page's meta
  line;
- the place-page tests this slice can affect all **pass in isolation** —
  including `:1948` (reading order), which failed in the contended run and passes
  on its own.

So the full-file red is box noise, consistent with §"What you must know before
reading any failure list from this box" below. The slice's own evidence is the
table above.

**Rendered evidence:** at 390px `Bryant Playground` renders `Playground` (with
its kind glyph) and `Outdoor`, with `documentElement.scrollWidth - clientWidth =
0`. Screenshot `/tmp/pills-390.png`.

---

## ⚠️ The two things I corrected in the stalled run's work

1. **The fixture place was decoupled.** The draft used `Alki Playground`, which
   `place-reviews.e2e.ts` hardcodes as its own fixture **and requires to carry
   zero reviews by other parents** (`claimEmptyReviewSet`). Sharing it coupled
   two unrelated specs — mine *writes* a column of that row while the reviews
   spec *asserts a precondition* about it. Measured red in the same run:
   `Alki Playground now carries 1 review(s) by other parents`.

   The spec now uses **`Bryant Playground`**: a real seeded playground
   (`kind=playground`, `indoor=false`, `coffee_nearby=null`, coordinates present)
   that no other spec's name is on. Its stored `null` is also why the coffee spec
   snapshots and restores the column rather than assuming a value.

2. **`src/pages/PlaceDetailsPage.tsx` was reverted.** The draft edited it with a
   comment-only change. Criterion 6 scopes the diff to the place page and its
   spec, so that file is now untouched — the one fact worth keeping (the research
   page keeps its own `kind · indoor` sentence, and **no spec asserts that
   literal**) is recorded in the place page's own comment instead.

## ⚠️ What you must know before reading any failure list from this box

This slice ran while **other lanes were writing the same live database and the
same worktrees**. Three classes of noise appeared that are **not this slice**:

1. **`place-reviews.e2e.ts` failed 4× on a live-data collision**, not a code
   defect: killed runs left marker reviews on `Alki Playground`, so the spec's own
   `claimEmptyReviewSet` guard fired **as designed**. Reproduced with my diff
   **stashed at base** — identical error — so it is pre-existing. A later run was
   **10/10 green**, i.e. transient live-data drift.
2. **`test-results/` artifact-write `ENOENT` / stale-artifact failures** after a
   run was SIGTERM'd mid-flight (a full `places.e2e.ts` run exceeds one tool
   call). Clearing `test-results/` and re-running made them vanish. Harness
   noise, not assertions.
3. **The dead session had its worktree `git stash`ed by another lane.** The
   branch's work was recovered; this session re-verified it rather than trusting
   it.

## ⚠️ One assertion this slice had to change — read this

`e2e/places.e2e.ts:1718` asserted the literal `getByText('Playground ·
Outdoor')` **on `/place/:id`**. That string was carried *only* by the meta
sentence the pills replace, so the assertion broke — for a real reason, not a
flake. The assertion was **updated to the two pills**
(`place-pill-kind` → `"Playground"`, `place-pill-indoor` → `"Outdoor"`) rather
than propped up with a hidden duplicate string. (An earlier draft had hidden the
kind's word `sr-only` inside the indoor pill; that was removed — it would have
made the product lie about what it renders to satisfy a test.)

**Follow-up for the orchestrator:** that same line is touched by the other lane's
uncommitted `muzk0bae` work in the MAIN worktree (`PlaceMap.tsx` +
`places.e2e.ts`). This branch is based on `5c97c5a` and does not contain it; the
two hunks must be reconciled when that lane lands. This branch is **not** rebased
onto `0df3dfe` (the v33-D commit) either, by design — it was branched from the
briefed base and kept there.

## Files

```
src/pages/PlacePage.tsx   +123/-5    the pill row (+ the whole reason)
e2e/place-pills.e2e.ts    +274 (new) the 5 tests
e2e/fixtures.ts           +73        readPlaceCoffeeNearby / setPlaceCoffeeNearby
e2e/places.e2e.ts         +20/-1     the trust-line assertion follows the pills
```

`e2e/fixtures.ts` is touched because `postgrest` is **module-private** there, so a
spec cannot reach the writer any other way; the two new exports follow the
established `setPlacePhotos` / `readPlaceByName` shape exactly — `AdminResult`
return, and a **read-back** so a PATCH that matched zero rows fails loudly instead
of letting a "no pill" assertion pass because the value never changed. The column
is snapshotted and **restored in a `finally`, `null` included**, with the restore
asserted.

## What was deliberately left out

The annotation named "coffee nearby, outdoor, playground". All three shipped.
Nothing else was added: every other directory filter (age fit, open-now, saved,
distance) either needs data the row does not carry or is viewer state, not a fact
about the place — so no pill was invented for it, per the brief's "only facts
already stored on the place row".

## Artifacts

- `.scratch/v34-d-verify2.log` — final `npm run verify` (EXIT=0)
- `.scratch/v34-d-placepage.log` — the place-page subset of `places.e2e.ts`
- `.scratch/v34-d-reviews.log` — `place-reviews.e2e.ts` (10 passed)
- `/tmp/mut2.log` — the mutation proof for the three-valued coffee pill
- `/tmp/pills-390.png` — the rendered pill row at 390px
