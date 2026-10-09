# heart-not-star — report

Sentinel: HEART-NOT-STAR-PLACES-J8N5
Status: DONE
Branch: heart-not-star (worktree /tmp/pd-wt/heart-not-star)
Base: f8b81c1
Commit: a310772
Files: 6 changed, 54 insertions(+), 16 deletions(-).

## What changed

The save control's glyph is a **heart**, in one convention across every surface
that draws it:

| Surface | testid | Before | After |
|---|---|---|---|
| `PlaceDirectory.tsx` row control | `place-heart-<id>` | bookmark | **heart** |
| `PlaceDirectory.tsx` "Saved" filter pill | `places-saved-filter` | bookmark | **heart** |
| `PlacePage.tsx` save button | (text-labelled `Save/Saved <name>`) | bookmark | **heart** |
| `PlaceDetailsPage.tsx` save button | `details-follow-toggle` | bookmark | **heart** |

- The glyph is a new `NAV_ICONS.heart` (`src/components/icons.ts`), **byte-for-byte
  the app's existing heart** (`REACTION_ICONS.love`, the "love" reaction). One
  silhouette for both, not two hand-tuned variants. `bookmark` is KEPT — the
  `/settings` index names it by key for its "Following & saved" row
  (`lib/settingsIndex.ts:84`).
- The pressed-state a11y contract is **unchanged**: the glyph fills (outline →
  solid) AND the accessible name flips Save → Saved. Nothing is colour-only.
- `src/lib/places.ts` — the Saved empty-state copy said *"Tap the bookmark on a
  place to keep it here."* That becomes a lie the moment the glyph is a heart, so
  it now reads *"Tap the heart on a place…"*. Its e2e assertion
  (`e2e/hearts-collection.e2e.ts:253`) is updated in the same diff.
- **Not changed:** the follow/unfollow write path, the `followedPlaceIds` set,
  the control's size/position, the testids.

## The brief's item 2 premise is wrong about PlaceMap

Item 2 says to check "PlaceDirectory.tsx (the row control) AND PlaceMap.tsx (the
popup panel)". **`PlaceMap.tsx` does not render a save/follow control at all.** I
grepped it and read its action row: it draws "Host a drop-in" + "Learn more" (and a
website link) and nothing else — the popup's map note (`mv0cx8yz`) was pointing at
the panel that *contains* a place, and the save control it means is the place page's
own button. The surfaces that actually render it are the four in the table above,
and all four are heart now. Nothing was skipped; the list in the brief was just
short by two.

## The count is DEFERRED (acceptance 4)

No count was added. Worth recording precisely, because the brief's framing suggests
it is entirely new: a follower count **already ships** on the details page —
`placeFollowerLine` (`src/lib/follows.ts:170`) renders *"N families have saved this
place"* from a SECDEF count, under the save button. What Jon's PlaceMap note muses
about ("how many families love this") is **surfacing that number on the directory
rows and the map panel**, which is the deferred work: it needs a batched read for N
rows plus its own slice, and it is not a glyph change. This slice is the glyph only.

## Acceptance

1. **Heart outline (unsaved) / filled heart (saved)** — VERIFIED by rendering the
   exact control structure: `fill="none"` paints 9,333 px (stroke only) and
   `fill="currentColor"` paints 20,639 px (solid) on an identical bounding box. A
   rendered screenshot confirms the two states read as outline-heart and
   filled-heart. The filled state computes to `rgb(79, 70, 229)` (indigo-600) inside
   the app's `text-indigo-600` parent — not black, not colour-only.
2. **Accessible name still flips Save → Saved** — UNCHANGED; every save control
   keeps its `aria-label`/text flip and its `aria-pressed`. Pinned by the existing
   `places.e2e.ts` heart spec, which asserts the `aria-pressed` round-trip and
   passes (23/23 in that file).
3. **Both surfaces use the heart (one convention)** — VERIFIED: all four live
   call-sites now draw `NAV_ICONS.heart`, and no live `NAV_ICONS.bookmark` usage
   remains in `src/`.
4. **No follow-count added** — deferred, stated above.
5. **No red spec; updated-glyph specs in the same diff** — the copy assertion is
   updated; `hearts-collection.e2e.ts` 4/4 passes and `places.e2e.ts` 23/23 passes
   on the built app.

## Gate

`ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run verify` — green on every stage
except steering-lint, which the brief permits:

- build ✓ · typecheck:e2e ✓ · **test 2757 passed (95 files)** ✓ · lint 0 errors
  (90 warnings, pre-existing) ✓ · a11y:focus PASS ✓ · **guards: PASS — 185/185,
  GUARDS: PASS**

- **steering-lint FAIL** — pre-existing and unrelated: 3 stale pointers in
  `AGENTS.md` (`builder-routing.md`, `compute-split.md`, `fleet-capacity.md`).
  `AGENTS.md` is the orchestrator's file; untouched by this slice.

### e2e (private port 4184, headless, `nice -n 19` — never the human's :4173)

Ran `places.e2e.ts`, `places-map-view.e2e.ts` and `hearts-collection.e2e.ts`
(the last because it asserts the copy this diff changes; it is not in the brief's
list but leaving it unrun would leave the change unverified).

- **`places.e2e.ts` — 23/23 PASS.** Includes `a signed-in parent hearts a place`
  (the follow round-trip) and the place-page save specs.
- **`hearts-collection.e2e.ts` — 4/4 PASS** (re-run alone on the built app after
  the full run, to confirm the `Tap the heart` assertion).
- **`places-map-view.e2e.ts` — 8 FAIL, PRE-EXISTING AND UNRELATED.** All eight are
  map-interaction specs (Leaflet pins, the view toggle, the radius circle and the
  radius-map drag); none references the heart, the bookmark, `icons.ts`, or any file
  in this diff. The first failure is a `places-view-toggle` click timeout
  ("element is not visible" / "detached from the DOM"). I verified the cause by
  stashing this change and running two of them on the **pristine base f8b81c1**:
  `map mode draws the radius circle` fails there too. Not this slice's regression.

## Notes for the orchestrator (two, non-blocking)

1. **Cosmetic follow-up:** the `/settings` index row "Following & saved" still
   draws the **bookmark** (`lib/settingsIndex.ts:84`, `icon: 'bookmark'`). It is a
   navigation icon, not the save control, so it is outside this brief — but once
   the save glyph is a heart, that row is the last bookmark in the app. One-line
   change (`icon: 'heart'`) if you want the convention airtight; deliberately not
   done here to keep this diff to the save control.
2. The worktree needed its own `npm ci` (a fresh worktree has no `node_modules`);
   `.env` was already present. My `vite.config.ts` is unmodified — the
   `ALLOW_CONFIG_CHANGE` waiver refers to the orchestrator's checkout.

---

## ORCHESTRATOR APPENDIX (2026-10-08)

Recovered from this worktree's finished-but-unmerged branch `a310772` (base `f8b81c1`).
Rebased cleanly onto master `505a9ef` — the real scope is exactly the 6 files above.

Re-gate on the rebased tree: typecheck clean; build clean (275ms); **2767 units pass**
(95 files); a11y PASS; guards PASS; steering-lint red (3 known stale pointers, permitted).
e2e `places.e2e.ts` + `hearts-collection.e2e.ts`: **26 passed / 1 failed** — the one
failure (`places.e2e.ts:2930`, V25 t07 map-pin) is flaky, passing 2/2 when re-run alone.
The heart round-trip specs pass in both files.
