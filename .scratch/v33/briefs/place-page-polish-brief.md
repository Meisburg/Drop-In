# place-page-polish — brief (SENTINEL PLACE-PAGE-POLISH-COLOR-W9Q2)

The place page (`src/pages/PlacePage.tsx` + `src/pages/PlaceDetailsPage.tsx`) drew four
notes in Jon's 2026-10-08 review. TWO are already shipped; TWO are the work.

## ALREADY DONE — do NOT redo, do NOT "improve"
- `mv0ctykq` (clickable address → Google Map): SHIPPED. The address renders from the same
  `links.directions` (`feed.mapsHref`) the "Get directions" button uses (PlacePage ~934).
- `mv0cvj2y` ("Learn More button → the place website"): SHIPPED. The action row's first
  button reads "Learn more" and points at `links.learnMore`.
- `mv0culjp` ("should say host a drop in"): SHIPPED. Both pages read "Host a drop-in here"
  (PlacePage ~1217, PlaceDetailsPage ~478). The remaining "Start a drop-in" strings in the
  tree are CODE COMMENTS only — leave them, they are the historical record.
- `mv0czk74` ("put the host button below this"): the action row already sits ABOVE the map
  and the host button is below the address block; the copy is already "Host a drop-in
  here". No change needed.

## THE WORK

### 1. Bring the pills to life (`mv0cwpud`) — the main item
Jon: *"I love these pills, but they're so dull. Can we bring them to life with some color?"*

Today every pill on the place page (`place-pill-row`: `place-pill-kind`,
`place-pill-indoor`, `place-pill-coffee`) is the SAME slate-on-white
(`border-slate-200 bg-white text-slate-700`) — identical to the directory filter chips,
which is why they read flat. Give each pill a TINTED anatomy that matches the APP'S
EXISTING colour vocabulary (indigo / emerald / amber — the same families already in use),
so colour carries meaning, not decoration:

- **kind** (`place-pill-kind`): indigo family — `border-indigo-200 bg-indigo-50
  text-indigo-700`; its leading icon `text-indigo-500`.
- **indoor/outdoor** (`place-pill-indoor`): emerald family — `border-emerald-200
  bg-emerald-50 text-emerald-700`.
- **coffee** (`place-pill-coffee`): amber family — `border-amber-200 bg-amber-50
  text-amber-800`; its icon already `text-amber-700` — keep it.

Constraints:
- Keep the pill ANATOMY byte-for-byte otherwise (`shrink-0`, `whitespace-nowrap`,
  `rounded-full`, `px-4 py-1.5`, `text-sm font-medium`, `gap-1.5`, `flex items-center`).
- Do NOT touch `placeKindLabel` / `placeIndoorLabel` / `placeHasCoffeeNearby` — the words
  and which pills render are unchanged. This is colour only.
- Contrast: every tint keeps AA text contrast on its `-50` ground (indigo-700 on
  indigo-50, emerald-700 on emerald-50, amber-800 on amber-50 all pass). Do not go to
  `-100` grounds or `-600` text.
- Add a short comment naming `mv0cwpud` and the "colour carries meaning" rule.

### 2. A "View website" action when a real site exists (`mv0cw9r2`)
Jon: *"This should be a view website button that takes you to the actual website."*

Today the first action is always "Learn more", whose href is EITHER the operator's
verified site OR an OSM map-search fallback (`links.learnMore.kind` is `website` |
`map-search`). The V20 t01 honesty rule forbids calling a search URL a website. So:

- When `links.learnMore.kind === 'website'`: the button reads **"View website"** and
  opens it in a NEW TAB (`target="_blank" rel="noopener noreferrer"`), because it leaves
  the app.
- When `links.learnMore.kind === 'map-search'`: the button keeps reading **"Learn more"**
  (no new tab — it is an in-app-style search link).
- Keep the single seam (`links.learnMore`); do NOT add a second link. This is the label +
  target fork on the existing `kind`.
- Update the specs that assert this button's label/text in the SAME diff — the V20 t01
  specs in `e2e/places.e2e.ts` assert the label per kind against the href ("the label no
  longer varies with the kind at all" comment at PlacePage ~857 becomes stale: the label
  NOW varies, but only between "View website" and "Learn more", and the rule it protects
  is preserved — a search URL is never called a website). Rewrite that comment to state
  the new rule, and assert the new behavior.

## MUST NOT change
- The pill row's words, count, order, or which pills render.
- The `links.directions` / address plumbing.
- The "Host a drop-in here" copy on either page.
- Any map component (`PlaceMap.tsx` and friends) — the map specs are already red on
  master; do not touch them.
- `placeKindLabel`, `placeIndoorLabel`, `placeHasCoffeeNearby`, `feed.mapsHref`.

## Acceptance
1. The three place-page pills render with distinct tints (indigo / emerald / amber) and
   keep their exact anatomy otherwise; all text keeps AA contrast.
2. With a verified site, the first action reads "View website" and opens in a new tab;
   with only a map search, it reads "Learn more" and the old behavior holds.
3. No pill word/count/order change; the address link and "Host a drop-in here" untouched.
4. No red spec; the V20 t01 label specs are updated to the new rule in the same diff.

## Gate
```
npx tsc -b --noEmit                                   # clean
ALLOW_CONFIG_CHANGE="vite.config.ts: another lane's unstaged dev-only change, not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards   # GUARDS: PASS
```
Then the e2e that covers this page on a PRIVATE port 4220-4229, BOTH env vars set:
`BASE_URL=http://localhost:4222 E2E_BASE_URL=http://localhost:4222 npx playwright test e2e/places.e2e.ts e2e/place-directory-in-new.e2e.ts`
- `places-map-view.e2e.ts` is PRE-EXISTING RED on master (7 specs). Do NOT chase it; do
  NOT touch map code. Note it and move on.
- The gate must be FULLY green — no waivers.

Stage BY PATH ONLY. Report `.scratch/place-page-polish-report.md`, then reply:
Sentinel: PLACE-PAGE-POLISH-COLOR-W9Q2
Status: DONE | BLOCKED
Commit: <sha7>
