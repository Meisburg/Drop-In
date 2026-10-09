SENTINEL: V33-D2-BROWSE-RETRY-N3Q7

**Slice v33-D (RETRY 1/3) — the /browse restructure.** The previous session wedged
with zero changes; this is the same slice on a fresh lane.

**READ ONLY THESE TWO THINGS. Nothing else. Do not read the prototype HTML, the
rulings, or any other file except the code you edit.**
1. `.scratch/v33/plan-browse.md` — the plan (already corrected in place)
2. `.scratch/v33/BATCH-STATE.md` **§14 only** (the two later corrections) — read
   just that section, e.g. with `sed -n '/## 14/,/## 15/p'`

Repo: `~/Projects/playdate-app`. Base: HEAD `5c97c5a`. **Do not push.**

📌 **WORK ECONOMICALLY — this is the ONE local lane (~98k).** Edit first, verify
after. If you find yourself reading a fourth file, stop and start editing.

Report to **`.scratch/v33-d-report.md`**. Reply with only:

```
Sentinel: V33-D2-BROWSE-RETRY-N3Q7
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-d-report.md
```

---

## The work, all of it (`src/components/PlaceDirectory.tsx` + specs)

The plan carries the detail and the §14 corrections supersede its wording. In
essence:

1. **Delete the Filters modal and its trigger** (`:1529`, `places-filter-*`). Its
   contents already live on the page.
2. **`Top rated` leaves the chip row** (`:994`) — it existed twice (`:994` chip,
   `:1529` option); now it exists **once**, as the sort.
3. **ONE flat pill row**, no labels, no stacking, **WRAPPING** (not side-scrolling —
   §14 correction A: every pill visible at 390px, tight even gaps), order:
   `Open now · Playground · Indoor play · Café · Museum · Saved · More kinds`
4. **The coffee control appears ONCE in that row** (§14 correction B): keep the
   `places-coffee-filter` toggle; the external Google Maps **door** stays but moves
   **out of the pill row** (it answers the *area* question, not a filter).
5. **The sort moves above the list**: **`Best first`** (default) + `A–Z`.
6. **Default sort becomes `Best first`, not `alpha`** (`:235` is the defect); reuse
   the existing bulk rating read.
7. **Tie-break: rating desc → review count desc → name**, in `src/lib/` with a
   sibling test that names the defect it detects (tied rows reordering between
   renders). **230 of 234 places have no reviews** — this is the line that stops
   the list reshuffling.
8. **Search expands to the full row while typing** (`muydrqml`), returns when
   cleared.
9. **No second map entry point** — the floating toggle already appears on scroll
   (`:46`).
10. **§14 correction B, the threshold**: `scripts/refresh-coffee-nearby.mjs`'s
    distance threshold becomes **400 m (¼ mile)**, with a comment recording that it
    **narrows v32-10's 750 m** by founder instruction, and a unit test on the
    script's pure decision. **Do NOT run a live Overpass pass** (that endpoint
    throttles; the re-run is queued separately).

## Acceptance criteria

1. No Filters trigger, no filter modal (`places-filter-*` absent — an absence claim
   that waits for paint).
2. One wrapping pill row, no labels, in the order above; **every pill visible at
   390px** (each pill's box inside the viewport; `documentElement.scrollWidth <=
   clientWidth + 1`; nothing clipped).
3. The coffee **toggle** count in the row is 1; the Maps door still exists and is no
   longer a pill there.
4. Sort above the list; `Best first` selected on load; switching to `A–Z` reorders
   **without changing which rows are shown** (compare row count and set).
5. `Best first` stable: same list twice → same order; ties break by review count
   then name (its own `lib/` unit test, mutation-proved).
6. `Top rated` is not in the pill row.
7. Search expands while typing (asserted by width) and returns when cleared.
8. Pills keep `aria-pressed` and ≥44px; `Saved` renders nothing extra signed out.
9. Every spec that located the deleted controls changes **in the same diff**
   (`scripts/guards/stale-locator-guard.mjs`); `/browse` stays in the playtest
   `routes.json` set.
10. The 400 m threshold is proven by a unit test (no network).

## Verification (quote raw output)

```bash
cd ~/Projects/playdate-app
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # GUARDS: PASS, exit 0
```

**Expected and NOT yours:** `steering-lint` fails with findings naming
`docs/agents/*` (another lane's untracked docs). Everything else must pass: build ✓,
typecheck:e2e ✓, test ✓ (**92 files / 2705 tests**, growing), lint ✓ (**0 errors**),
a11y:focus ✓, `guards` **PASS**. **Do not touch `AGENTS.md` or `docs/agents/*`.**
Any other failure = stop, BLOCKED.

Then `E2E_BASE_URL=http://localhost:4210 npx playwright test e2e/auth.setup.ts` and
`… e2e/place-filters.e2e.ts e2e/places.e2e.ts --reporter=list` (private port
4210–4218; mint the marker on it; kill by port/PID, never `pkill -f`).

Stage **by path only**; never `git add .`/`-A`; never touch `vite.config.ts`,
`src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`. Pre-existing failures
never to claim: `feed-empty-state.e2e.ts:301`, `places.e2e.ts:2655`, the flake
`places-map-view.e2e.ts:730`. Blocked → `Status: BLOCKED` with the one question.
