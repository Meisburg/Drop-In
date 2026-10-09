# meetup-empty-state — report (annotation meetup-a62da3b6fca2)

The Meetup "actionable empty state" pattern, applied to Drop In. The worker wedged
in its own edit (rc=1, the predicted shape); the CoS finished the slice, corrected
its scope against a pinned test, and gated it.

## What shipped

ONE real gap closed. The empty-radius state now carries an **emptyAction** — a
**"Create one here"** control that opens `/new` seeded with the viewer's OWN
location, so the post starts where the parent already is.

- `src/lib/feedCreateHere.ts` (NEW) — the pure seam `createHerePrefill(homeZip)`:
  names the viewer's home zip as the one place the feed can name; returns null
  when none (the control then does not render). Seeds the existing `PlacePrefill`
  router state (`placeId: ''` — home is not a directory place; the write path's
  `placeIdField('')` omits the FK key; no invented address, no invented neighborhood).
- `src/lib/feedCreateHere.test.ts` (NEW) — sibling test naming the defect: a CTA
  that fires with no location, or seeds a placeId that does not match the named
  place. Round-trips the empty placeId through `placeIdField` so the two cannot drift.
- `src/components/RadiusEmptyState.tsx` — a THIRD opt-in prop `showCreateHere`
  (default FALSE; Browse never passes it, so Browse is byte-for-byte unchanged) and
  the control's JSX.
- `src/pages/FeedPage.tsx` — the feed's empty state passes `showCreateHere`.
- `e2e/feed-empty-state.e2e.ts` — (a) the control renders, enabled, named, ≥44px;
  (b) tapping it navigates to `/new` with the place field carrying `Home (98901)`.

## The correction the gate forced (the important part)

The brief's first draft ALSO added a **map band to the list view** (Meetup's
`mapItems`). A pre-existing, deliberate test caught it: `feed-empty-state.e2e.ts`'s
**S9 pin** asserts the band is ABSENT in list view *precisely so that* tapping the
Map toggle is what produces it. The map-stays-rendered half of Meetup's pattern is
**already shipped** — in the Map view (home pin + radius circle, card underneath).

So the map change was **reverted**. Lesson: the empty state's list/map split is a
pinned design decision with a founder quote behind it; the pattern's `mapItems` half
is satisfied; only `emptyAction` was a real gap. Building the map half would have
defeated the pin and overridden a decision.

## Gate (all measured, in this worktree)

| Step | Result |
|---|---|
| `tsc -b --noEmit` | exit 0 |
| `typecheck:e2e` | exit 0 |
| `npm run verify` (build + tests + lint + a11y + steering-lint + guards) | build ✓, **2751 tests pass (95 files)**, lint warnings only, a11y focus PASS |
| `npm run guards` | **PASS** — all 185 checks (after fixing the worker's two new files missing a trailing newline) |
| `steering-lint` | FAIL — the ONLY acceptable red (another lane's untracked `docs/agents/*` pointers) |
| `playwright e2e/feed-empty-state.e2e.ts` | **10 passed (1.1m)** — incl. both new assertions AND the S9 map pin (unchanged) |

## Annotation

`meetup-a62da3b6fca2` → RESOLVED (the empty action ships; the mapItems half was
already satisfied — recorded in the decision doc).
