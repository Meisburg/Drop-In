SENTINEL: V33-D-BROWSE-RESTRUCTURE-W6H4

**Slice v33-D — the /browse restructure.** The design pass is DONE; this is the
code. It is ONE slice: the five annotations are two changes plus a layout pass.

**Read, in this order, before editing:**
1. `.scratch/v33/plan-browse.md` — the plan, **already corrected in place**
2. `.scratch/v33/RULING-browse-directory.md` — the first-principles ruling
3. `.scratch/v33/RULING-browse-correction.md` — the prototype review correction
4. `.scratch/v33/prototypes/browse/browse.html` (**+ `browse-390.png`,
   `browse-1280.png`**) — **the visual reference. Do NOT rebuild it; match it.**
5. `.scratch/v33/BATCH-STATE.md` §14 — **two later corrections that supersede both
   documents above** (see §1 below)

Repo: `~/Projects/playdate-app`. Base: HEAD (`9975910`). **Do not push.**

📌 **This is the ONE local lane (~98k window).** Read only the files named here.
Edit first, verify after. Do not survey.

Report to **`.scratch/v33-d-report.md`**. Reply with only:

```
Sentinel: V33-D-BROWSE-RESTRUCTURE-W6H4
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-d-report.md
```

---

## 1 — ⚠️ THE TWO LATER CORRECTIONS (they supersede the plan's wording)

**(A) `muzk5y54` — the founder's wife, reviewing with him.** *"why aren't all these
pills together? Why are they all space-weird? … you don't even need to make them
scrollable where they're off-screen — you could show all of them together."*

- The pill row must **WRAP and show EVERY pill. None off-screen.**
- **Do NOT make it side-scroll.** This **supersedes** the correction's "scrolls
  sideways" and the plan's acceptance criterion 7 — replace criterion 7's
  side-scroll assertion with a **wrap assertion** (every pill's box is inside the
  viewport at 390px; nothing clipped, nothing scrolled away).
- Gaps must be **tight and even** (`flex-wrap` + one consistent gap), so the row
  reads as one group rather than "space-weird".

**(B) `muzk3j1e`** — two findings:
- **The coffee-nearby control renders TWICE on the row — a real duplicate-control
  defect. Fix it: one control.** Keep the **filter toggle** in the pill row
  (`places-coffee-filter`, `aria-pressed`). The external Google Maps **door** is
  kept too (v32-10's ruling: it answers the *area* question) but it **leaves the
  pill row** — it is not a filter and must not read as a second one. Put it as a
  quiet link below the list (its existing testid stays; only its place changes).
- **The coffee claim means `< ¼ mile (400 m)`**, not `750 m`: *"if there's any
  coffee shop that's less than a fourth of a mile from that location we can make
  that claim."* → change the threshold constant in
  `scripts/refresh-coffee-nearby.mjs` to **400 m** and record in its comment that
  it **narrows v32-10's pinned 750 m** by founder instruction.
- ⚠️ **Do NOT run a live Overpass pass.** The batch already proved that endpoint
  throttles (measured: 3 of 4 runs at 6 s spacing returned the "server is probably
  too busy" HTML). The column stays as it is; the re-run is queued separately as
  `v32-10b`. The report says so.

## 2 — What to change (`src/components/PlaceDirectory.tsx` + specs)

**Smaller than the plan's first draft. No new components, no tier labels.**

1. **Delete the Filters modal and its trigger** (`:1529` and the `places-filter-*`
   entry point). Its contents are the pill row.
2. **`Top rated` leaves the chip row entirely** (`:994`). It was in two places
   (`:994` chip, `:1529` option); it now exists **once**, as the sort.
3. **One flat pill row**, no labels, no stacking, **wrapping**, in this order:
   `Open now · Playground · Indoor play · Café · Museum · Saved · More kinds`
   Keep the order (deadline first, `Saved` near the end, `More kinds` last).
4. **The sort moves above the list**, visible: **`Best first`** (default) and
   **`A–Z`**.
5. **Default sort becomes `Best first`, not `alpha`** (`:235` is the defect). The
   bulk rating read already exists — reuse it.
6. **The tie-break is pinned: rating desc → review count desc → name.** This is the
   most important line in the slice: **230 of 234 places have no reviews**, so
   without a stable tie-break the list reshuffles between renders. Implement it in
   `src/lib/` (not in the `.tsx`) with a sibling test that **names the defect** it
   detects (tied rows reordering between renders).
7. **The search field expands to the full row while typing** and returns when
   cleared (`muydrqml`).
8. **No second map entry point** — the floating toggle already appears on scroll
   (`:46`). Do not add one above the list.

## 3 — Acceptance criteria

1. No Filters trigger, no filter modal (`places-filter-*` absent — an absence claim
   that **waits for paint**).
2. One pill row, no tier labels, wrapping, in the order above; **every pill visible
   at 390px** (assert each pill's box is within the viewport and the document does
   not widen: `documentElement.scrollWidth <= clientWidth + 1`).
3. **The coffee control appears once in the row** (assert the toggle's count is 1
   there); the Maps door still exists and is no longer a pill in that row.
4. The sort renders above the list; `Best first` selected on load; switching to
   `A–Z` reorders the rows **without changing which rows are shown** (compare row
   count and row set).
5. **`Best first` is stable**: the same list twice returns the same order, and tied
   ratings break by review count then name — its own unit test on the `lib/` seam.
6. `Top rated` is **not** in the pill row.
7. Search expands to the full row while typing; returns when cleared (asserted by
   width).
8. Every pill keeps `aria-pressed` and ≥44px; `Saved` still renders nothing extra
   for a signed-out viewer.
9. Every spec that located the deleted controls changes **in the same diff**
   (`scripts/guards/stale-locator-guard.mjs`), and `/browse` stays in the playtest
   `routes.json` set.
10. The 400 m threshold is proven by a **unit test on the script's pure decision**
    (no network), and the comment records the narrowing.

## 4 — Verification (quote raw output)

```bash
cd ~/Projects/playdate-app
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # GUARDS: PASS, exit 0
```

**⚠️ `steering-lint` (and therefore `verify`) exits 1 for a reason that is NOT
yours:** another lane's untracked `docs/agents/*` files are unreachable from
`AGENTS.md`. Expected shape: build ✓, typecheck:e2e ✓, test ✓ (**92 files / 2705
tests**, growing with yours), lint ✓ (**0 errors**), a11y:focus PASS ✓,
steering-lint ✗ **only** with those findings, `guards` **PASS**. **Do not touch
`AGENTS.md` or `docs/agents/*`.** Any other failure = stop, BLOCKED.

Then, on a private port you own in **4210–4218** (mint the marker ON that port
first; kill the server by port or PID — never `pkill -f`):

```bash
E2E_BASE_URL=http://localhost:4210 npx playwright test e2e/auth.setup.ts
E2E_BASE_URL=http://localhost:4210 npx playwright test e2e/place-filters.e2e.ts e2e/places.e2e.ts --reporter=list
```

## 5 — Landmines

- Stage **by path only**; never `git add .` / `-A`. Never stage, revert or edit
  `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`.
- Pre-existing e2e failures never to claim: `feed-empty-state.e2e.ts:301`,
  `places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`.
- **If the slice starts growing, something is being rebuilt that should be
  deleted.** Report that instead of building it.
- Ambiguous or blocked? `Status: BLOCKED` with the one question.
