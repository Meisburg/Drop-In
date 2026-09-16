# V11 t02 handoff — Places: remove the "Fits my kid's age" filter

Date: 2026-09-16 · From: orchestrator/coordinator → tab-5 dev agent (`w4:p12`).
State: V11 batch in progress. **t01 (radius narrow-back) is SHIPPED** @ `aa7e991`
(+ task-state `14c8354`). This is ticket **02 of 6**; four more follow (03–06).

## 1. Cold-start read order (no chat history needed)
1. `AGENTS.md` — repo rules, gate commands, coordinator/dev-agent split, ADHD style.
2. `task-state.md` — the V11 bullet + `## V11` section (t01 DONE, t02 next).
3. `.scratch/v11/spec.md` — batch spec + verify gate.
4. `.scratch/v11/issues/02-remove-age-filter.md` — **your brief** (pinned mechanics + AC + gate).

## 2. The deliverable (ticket 02)
Delete the "Fits my kid's age" filter from the Places page (`/browse`). Only the
filter goes — the place-detail age LINE (`placeAgeFitLabel`, "Ages 4–8") stays.

Files to change (line numbers pinned in the ticket — re-verify before editing):
- `src/lib/places.ts` — delete `placeFitsKidAges` (L326–337); drop the browsePlaces
  age guard (L460) and the `kidAges` field from `PlaceFilters`; renumber the
  doc filter-step list (L437 "3. AGE FIT") + the L415 doc reference.
- `src/lib/types.ts` L274 — remove the "places.placeFitsKidAges" doc parenthetical.
  `age_min`/`age_max` STAY on the type.
- `src/pages/BrowsePage.tsx` — delete the toggle button (L252–267), `kidAges`
  state (L69), `fitsAges` state (L73), the `listKids` import+effect (L5), and the
  `kidAges: fitsAges ? kidAges : null` arg (L170). Drop `!fitsAges` from
  `radiusIsTheReason` (L187–188). Delete the module doc bullet (L33).
- `src/lib/places.test.ts` — drop the `placeFitsKidAges` import (L9), the whole
  `describe` block (L164–194), the `kidAges: null` field in `NO_FILTERS` (L243),
  and the browsePlaces age-filter test (~L284).
- E2E: zero specs assert the toggle (grep "Fits my kid" in `e2e/` → 0 hits).
  The suite stays green unmodified.

## 3. Gate (must be green before you commit)
1. `npm run build` → exit 0.
2. `npm run test` → **record the new green count** (it will be LOWER than t01's
   825 because the `placeFitsKidAges` describe block is removed — report the exact number).
3. `npm run test:e2e` → green. (The 1 pre-existing conditional skip at
   `e2e/polish.e2e.ts:209` — moderator un-hides a comment — is expected, unrelated.)
4. `npm run lint` → exit 0.
5. Grep gates: `grep -rn "placeFitsKidAges" src e2e` → 0 hits;
   `grep -n "kidAges" src/lib/places.ts` → 0 hits.

## 4. Do NOT touch
- `opencode.json` — it carries an NInfer endpoint + a **real API key**. Leave it
  modified/unstaged. NEVER commit it.
- `supabase/` — **no migration this ticket** (the columns stay; only the
  client-side filter is removed). So the post-code "Supabase apply" step is a NO-OP.
- Tickets 03–06 files, and the other untracked `.scratch/*.cjs` files.
- The place-detail age line / `placeAgeFitLabel` behavior.

## 5. Commit convention
- ONE code commit: `V11 t02: remove the "Fits my kid's age" filter from /browse (browsePlaces age plumbing + toggle + tests)` —
  code + test changes + flip `.scratch/v11/issues/02-remove-age-filter.md` status
  `TODO` → `DONE (2026-09-16 …)`. Do NOT push.
- Then a separate `task-state:` commit recording the t02 closure + the new unit count.

## 6. Report back (structured)
(1) files changed + one-liner each · (2) AC checklist pass/fail ·
(3) gate output (build exit, unit count, e2e count, lint) ·
(4) deviations + why · (5) commit hash.

## 7. After you finish (coordinator does)
- Re-run the gate myself (build + test + e2e + lint) and inspect the diff.
- No DB apply (no migration). Then route ticket 03.