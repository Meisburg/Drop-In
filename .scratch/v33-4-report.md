# v33-4 report — the drop-in page says where the place is (`muye9a6l`)

SENTINEL: V33-4-PLACE-ON-DROPIN-S1K6
Status: DONE
Commit: `a5efc68` (this session's delta) on branch `v33-4`; the slice's core
work — the page's facts line, the moved exact-text pin, the free-text
count-of-zero — is `83ac2bf`, **already in this branch's base** (`f981c98`).
Worktree: `/tmp/pd-wt/v33-4`

> **Resumed re-dispatch.** `.scratch/v33/BATCH-STATE.md` §10d/§10e records this
> exact case: the lane that built v33-4 was seen "dead" but had already
> committed (`83ac2bf`, "check `git log` before re-dispatching it"). This
> dispatch found the page + spec work already in the base. Nothing was
> re-done; the session added the one thing the base owed, **AC3's proof**
> (`a5efc68`), and re-verified the whole gate fresh.

## 1. What the base (`83ac2bf`) already contained — measured, not assumed

- `src/pages/PlaydateDetailPage.tsx:1684` — `detailPlaceTrustLabel =
  placeTrustLine(detail.place_ref)`; the facts line renders at `:2407-2415` as
  `<p data-testid="detail-place-trust">` **only** when
  `detailPlaceTrustLabel !== null && detail.place_id != null` — a free-text
  post renders nothing, no placeholder, no dangling separator.
- The name stays a `Link` to `placePath(detail.place_id)` (directory place),
  the Maps `<a>` (free text), plain text otherwise; the `·` neighbourhood
  suffix stays on the name line (`:2403-2405`).
- The v32-9 rating line (`:2416-2448`) sits **below** the facts line,
  untouched.
- `e2e/post-location.e2e.ts`'s exact-text pin moved in that same diff (the
  old `toHaveText(PLACE_NAME)` on the paragraph became a testid assertion),
  and the free-text test asserts `detail-place-trust` count 0.

## 2. What this session added (`a5efc68`) — the AC3 proof

AC3 requires: *prove the rendered string is built by the shared label
helpers*. The base's assertion was `toContainText('·')` — a separator-only
check that would also pass a line the page invented on its own. This commit
re-pins it exactly:

- `e2e/post-location.e2e.ts` imports `placeTrustLine` from `../src/lib/places`
  (the same seam the feed card uses; it composes `placeKindLabel` +
  `placeIndoorLabel` — the one way the app says kind and indoor/outdoor).
- `readPlacePhotoFields` — the spec's **existing** anon read of the picked
  place row — now also selects `kind,indoor` (the two fields the app's
  `place_ref` embed carries), so the spec asserts the rendered text against
  `placeTrustLine({ kind, indoor })` on the **same live row** the app reads.
  A re-import that changes the kind keeps the spec honest; a page that
  stops using the shared helper turns the spec red.
- The moved-pin comment records, deliberately, why the paragraph's
  exact-text pin moved to the facts-line assertion in the same diff.

**No new read for the app**: the facts line is `placeTrustLine(
detail.place_ref)` — `place_ref` is the embed `getPlaydateDetail` already
selects (id, kind, indoor, photo fields). No query, fetch, or embed field
added in either commit. The spec's read is the same single-row anon request
it already issued, extended by two columns.

Facts the plan mentioned but were **dropped** (not in `detail` /
`detail.place_ref`): **distance** and **open state** — neither field is in
the embed, and adding a read was out of mandate. The facts line is exactly
`<kind label> · <indoor label>` ("Park · Outdoor" for the seeded place).

## 3. Acceptance criteria

1. **Directory place: name link + facts line, asserted on rendered text.**
   `post-location.e2e.ts:371` — `detail-place-trust` asserted
   `toHaveText(placeTrustLine({ kind, indoor }))` (exact shared-helper
   output), name link visible. ✓ (e2e 19/19)
2. **Free-text: no facts line, Maps link kept.** `post-location.e2e.ts:689`
   — `detail-place-trust` count 0; the Maps link is still the tappable
   door (href + `target="_blank"` asserted). ✓
3. **Facts from `place_ref`/`detail` only.** Page reads
   `detail.place_ref` only (`PlaydateDetailPage.tsx:1684`); the spec proves
   the string via `placeTrustLine` (lib/places.ts:144) — the shared seam.
   No new read added (stated above). ✓
4. **Rating line unchanged, under the place block.** `83ac2bf` did not
   touch `:2416-2448`; neither did this commit. `place-reviews.e2e.ts:622`
   (V32-9 A10 "drop-in page shows the PLACE's rating") passes. ✓
5. **Exactly one `h1`, status chip its immediate next sibling.** The title
   block (`:2367-2374`) is untouched by both commits; the facts line sits
   *after* the paragraph, never between h1 and chip. The six adjacency
   specs (host-status / while-away) are unaffected — the diff never
   touches that region. ✓
6. **Exact-text pin updated in the same diff, comment says why.** Done in
   `83ac2bf` (pin move) and re-annotated in `a5efc68` (the comment at
   `post-location.e2e.ts:578-592` records the deliberate move and the
   shared-helper proof). ✓
7. **Diff touches only the page + its spec.** Whole-slice diff
   `83ac2bf^..a5efc68`: `src/pages/PlaydateDetailPage.tsx` and
   `e2e/post-location.e2e.ts` only. This commit alone touches only the
   spec. ✓

## 4. Verification (raw output quoted)

Environment note: the worktree arrived without `node_modules` and without
the gitignored `.env` (both live only in the main checkout). Ran `npm ci`
(lockfile identical to main) and copied `.env` / `.env.local` from
`~/Projects/playdate-app` — env only, no tracked change.

### Gate

```
$ ALLOW_CONFIG_CHANGE="…" npm run verify
> build        ✓ (tsc -b && vite build; 212 modules, 27 precache entries)
> typecheck:e2e ✓
> test         Test Files  94 passed (94)
               Tests  2746 passed (2746)
> lint         0 error lines (warnings only, pre-existing)
> a11y:focus   PASS — every control that suppresses its outline provides a focus cue
> steering-lint
  FINDING: pointer to a non-existent path: docs/agents/builder-routing.md
  FINDING: pointer to a non-existent path: docs/agents/compute-split.md
  FINDING: pointer to a non-existent path: docs/agents/fleet-capacity.md
  FINDING: pointer to a non-existent path: docs/agents/lane-health.md
  FAIL — findings above.
VERIFY-EXIT:1

$ npm run guards
factory-guard check: all 185 checks passed.
GUARDS: PASS — all deterministic rules hold.
GUARDS-EXIT:0
```

**Shape matches the brief's expected green-for-you:** build ✓,
typecheck:e2e ✓, test ✓ (94/2746 — the brief's 92/2705 predates the base
moves; it says "growing with yours"), lint ✓ (0 errors), a11y:focus PASS ✓,
steering-lint ✗ **with only the cross-lane `docs/agents/` findings**,
guards PASS ✓. The four findings are the other lane's untracked docs —
measured: `docs/agents/{builder-routing,compute-split,fleet-capacity,
lane-health}.md` are **untracked** in the main checkout (`git status` →
`??`), so they are absent here and `AGENTS.md`'s pointers to them read as
stale. Not touched, per the brief.

### E2E (marker minted on :4214 first, dev server killed by port afterwards)

```
$ E2E_BASE_URL=http://localhost:4214 npx playwright test e2e/auth.setup.ts
  ✓  1 [setup] › e2e/auth.setup.ts › sign up the marker … (6.7s)
  1 passed

$ E2E_BASE_URL=http://localhost:4214 npx playwright test e2e/post-location.e2e.ts e2e/place-reviews.e2e.ts --reporter=list
  ✓ 19 passed (1.6m)
```

All 19, including `post-location.e2e.ts:371` (facts line = exact
`placeTrustLine` output on the live row), `:689` (free-text: count 0, Maps
link), and `place-reviews.e2e.ts:622` (the V32-9 rating line still under
the place block). No pre-existing-failure lines claimed.

## 5. Notes for the orchestrator

- `83ac2bf`'s e2e comment claimed the seeded place yields "Park · Outdoor";
  the live row's kind is not asserted here by literal — the spec now pins
  the **helper's** output on the DB row, so whatever the live kind is, the
  assertion stays correct and any divergence between page and helper is
  caught. (The `.scratch/v18` snapshot shows kind `beach`; the comment's
  "Park" was a stale guess — immaterial now that the assertion is data-driven.)
- The `ocr` pass for v33-4 was already owed at `83ac2bf`
  (BATCH-STATE §10e); it covers this commit too if run
  `--from 83ac2bf^ --to a5efc68`.