# V22 — the design-quality batch: close-out

> 13 slices, all complete. Base `790dca7` → working tree.
> Sources: `MASTER-IMPROVEMENTS.md` (the merged recommendation list),
> `AUDIT.md` (Impeccable, was 10/20), `DESIGN-REVIEW.md` (Apple HIG),
> `PRODUCT.md` (product truth, written during this batch).
> Per-slice evidence and every adjudication: `.scratch/v22/ledger.md`.

## Gate (all six stages, fresh)

```
build            PASS
test             1147 passed / 36 files   (baseline 790dca7: 1134)
lint             0 errors, 68 warnings
a11y:focus       PASS
steering-lint    PASS
guards           PASS (lib-sibling, config-guard, no-bypass)
```

e2e: `e2e/place-directory-in-new.e2e.ts` → **3 passed** against live Supabase.
This spec asserts `.leaflet-container` is visible, so it also proves the
code-split map still renders (see §4).

## What shipped, by the original scores

| Dimension (Impeccable, 0–4) | Before | After |
|---|---|---|
| Accessibility | 2 | **4** |
| Performance | 2 | **4** |
| Theming | 1 | **3** |
| Responsive | 1 | **4** |
| Implementation Integrity | 4 | 4 |
| **Total** | **10/20** | **19/20** |

HIG verdict: **Needs work → Good.**

## 1. The measured deltas

| Metric | Before | After |
|---|---|---|
| `role="alert"` nodes | 0 | **24** |
| `focus-visible:` | 0 | **109** |
| `motion-reduce:` | 1 | **78** |
| `loading="lazy"` | 0 | **12** |
| `prefers-color-scheme` support | none | **full dark palette** |
| `text-slate-400` body text | 3 nodes @ 3.30:1 | **0** |
| Entry JS chunk | 853 KB / 229 KB gz | **653 KB / 173 KB gz** |
| Map chunk fetched on `/login` | yes (inside entry) | **never** |
| Layout at 1024px | 448px column | **768px + left rail** |
| Nav destinations | 3 nav + 1 action | **4 nav, no action** |
| Mockups in `dist/` | present | **absent** |
| Tests | 1134 | **1147** |

## 2. New permanent gates (each proven to fail before being trusted)

| Gate | Catches | Wired into |
|---|---|---|
| `scripts/a11y-dom-check.mjs` | errors not announced to assistive tech (rendered DOM, not grep) | manual lane |
| `scripts/focus-indicator-check.mjs` | a control that removes its outline with no replacement | **`npm run verify`** |
| `scripts/dark-mode-check.mjs` | a dark palette that was computed but not *applied* | manual lane |
| `scripts/layout-width-check.mjs` | phone layout regressing, or no rail at desktop | manual lane |
| `scripts/focus-trap-check.mjs` | dialog focus escaping / not restoring | manual (needs fixture auth) |
| `src/lib/a11y.test.ts`, `src/lib/focusTrap.test.ts` | 13 new unit tests | `npm test` |

The manual-lane scripts need a live server and (mostly) a signed-in session.

## 3. The recurring lesson: a check passing is not the property holding

Four times in this batch a check was green while the thing it named was broken.
Each fix was the same: **replace the proxy with a real assertion.**

| # | The check | Why it lied |
|---|---|---|
| 1 | grep for literal `aria-describedby` | the attribute only exists at runtime (React spread) |
| 2 | grep for `activeElement` | proves the hook is *imported*, not that it traps |
| 3 | `grep -v focus-visible` | the substring appears in both the good and the bad class list |
| 4 | chunk size + "not fetched" | both true while the lazy component resolved to `undefined` |

## 4. Defects found in already-"verified" work

Recorded because the pattern matters more than the individual bugs.

1. **Slice 9 broke the public share surface.** The desktop grid applied
   unconditionally while the nav rail renders only when signed in, so
   `/playdate/:id` (the one page a signed-out visitor sees) collapsed to a
   **72px** column at 1024px. Slice 9's own audit only swept phone widths.
   *Found by orchestrator browser probe; fixed; screenshot in `docs/design-review/`.*
2. **Slice 10 shipped a crash.** `lazy(() => import('./PlaceMap'))` resolved to
   `undefined` (three named exports, no default) → React #306 on every map.
   *Found by slice 12's builder; fixed with a default export; now covered by the
   e2e spec's `.leaflet-container` assertion.*
3. **`reuseExistingServer: true` could run e2e against a stale `dist/`.**
   *Found by the repo's own new `config-guard`; fixed by adding the build to the
   webServer command rather than silencing the guard.*
4. **A `focus-visible:outline-none` control with no replacement cue**
   (`InboxPage.tsx:949`) — pre-existing, carried through the rename, invisible to
   the builder's grep. *Found by orchestrator; fixed; new gate added.*

## 5. Two audit claims retracted

- **Mockups "live in production"** — false. The HTTP 200s were Vercel's SPA
  fallback (`vercel.json` rewrites every path to `/index.html`); the served body
  was byte-identical to `dist/index.html`. They were gitignored, never committed,
  and never served. Latent risk, not exposure. Corrected in `AUDIT.md`.
- **Mixed button capitalization** — false. Both strings the HIG review cited are
  instructional prose and a native `<option>`. A scan of every
  `<button>`/`submitLabel` found **0** title-case labels. Corrected in
  `DESIGN-REVIEW.md` and `MASTER-IMPROVEMENTS.md`.

Both were caught because a builder pushed back instead of manufacturing a change
to satisfy the brief.

## 6. Deliberately not done

- **Swipe-to-go-back** — the browser owns the gesture in a web PWA, and the tap
  alternative Apple requires already exists.
- **Appearance toggle** — Apple explicitly warns against one.
- **`GoingCircle` display names** — the feed type carries no name; adding one is
  a data-shape change with 351 dependent tests, outside slice 13's scope.
- **Remaining 653 KB entry chunk** — React + Supabase + router; further wins need
  splitting those, not the map.

## 7. Open, filed rather than dropped

- **320px overflow on the signed-in feed** (Distance select, home-zip Save form).
  Proven pre-existing (reproduced on baseline). The mobile audit only sweeps
  signed-out routes, which is why nothing caught it.
- **`scripts/*-check.mjs` lanes are manual.** They need a server and auth; wire
  them into `verify` once an e2e fixture account exists in CI.

## 8. Files

Design/a11y docs: `PRODUCT.md`, `AUDIT.md`, `DESIGN-REVIEW.md`,
`MASTER-IMPROVEMENTS.md`, this file.
Screenshots: `docs/design-review/{dark-mode-login,light-mode-login,desktop-public-1024,feed-nav-390}.png`.
Plan and per-slice evidence: `plan.md`, `.scratch/v22/ledger.md`.
