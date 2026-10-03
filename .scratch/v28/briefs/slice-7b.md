# Slice 7b — The batch-end lanes

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → **Slice 7b**, then `docs/agents/browser-lanes.md` (**the human works
here — never touch their Chrome; headless always**) and
`docs/agents/e2e-fixture-convention.md`.

All 12 builder slices and Slice 7a's guards are done and verified. **This slice runs the
gates a batch is required to pass before a human sees it**, plus the one spec the plan
named and nobody wrote.

## Job 1 — the no-zip e2e (the plan's named item, still unwritten)

**The honesty gap Slice 2c closed has no regression guard.** Measured: a parent whose
`home_zip` is null gets **an empty list from the feed query** (`db.ts:582` —
`if (viewer.homeZip === null) return []`), so `posts.length === 0` fires and
`RadiusEmptyState` renders a **lie** — *"Nothing within N miles yet."* — whose only
controls were inert. 2c's fix is an **early return inside `RadiusEmptyState`** rendering
the 2a-built `LocationRequiredNotice`, so **every caller is fixed by construction**:
`FeedPage.tsx` and **Browse** (`PlaceDirectory.tsx`, via `radiusReason`) and `/new`'s
embedded copy.

**Write the spec to pin it.** Assert the **notice**, not the lie, for a no-zip viewer —
on the feed and on Browse, since the second caller is the one that was nearly missed.
A no-zip viewer is creatable without walking the interview to the end (or by REST-nulling
`home_zip`); use the existing fixture conventions, including the `e2e-` marker so the
sweep covers what you create. **Say in your report how you made the viewer zip-less.**

## Job 2 — the FULL e2e sweep

```
nice -n 19 npx playwright test
```

Every spec, headless, **the whole suite** — this is the batch-end lane and it is the only
place the full set runs. **Paste the totals and the per-file breakdown**, and the
`[setup]` line. Expect roughly 8–10 minutes.

**If a spec fails, that is a finding — fix the walk (or the flow), never loosen an
assertion to go green, and report it.** `e2e/auth.setup.ts` is a **second, independent
walk** of this flow and has broken **four times**; it is in scope by name if it breaks.

## Job 3 — the marker sweep (the plan's named acceptance criterion)

```
node scripts/sweep-e2e-markers.mjs delete
npm run verify
```

**Paste BOTH tails.** The sweep must report what it removed, and `verify` must still be
green afterwards — the plan's criterion is that the repo is clean *and* that cleanup
broke nothing. Builders have created throwaway accounts across this batch
(`e2e-seam3a-…`, `e2e-1790703913@…`, and Slice 4c's `e2e-r1-…`/`e2e-r2-…`), so expect real
removals. **If the sweep reports zero removals when accounts are known to exist, that is
a finding, not a success.**

**Note the environmental flake:** `scripts/guards/no-bypass-guard` can fail once on a
`/tmp` git-clone hardlink error (seen in ~3 of 6 recent runs). If it does,
**re-run that guard in isolation and report both outcomes.**

## Job 4 — docs (light)

Only what the lanes themselves require — a stale claim **inside a file you are already
editing**. **The phrase-based stale-claim sweep and the dead-export sweep are NOT this
slice** — they are the hygiene slice that runs **after** the human's playtest, because
`/onboarding` cannot appear in the routes sweep (a signed-out visitor is redirected to
`/login`) so **the playtest is the only lane that can falsify the flow**, and it goes
first.

## Verify and report

```
nice -n 19 npx playwright test          # the full suite
node scripts/sweep-e2e-markers.mjs delete
npm run verify
```

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
The no-zip spec: <the file; how you made the viewer zip-less; what it asserts on the feed AND on Browse>
The full sweep: <totals, the per-file breakdown, the [setup] line, and the duration>
The marker sweep: <the removal tail, and the verify tail>
Flake: <did no-bypass fail? both outcomes, or "did not occur">
Specs that failed and why: <or "none">
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```

**Scoped `git add`, COMMIT WHEN GREEN and state the sha, do not push.**
