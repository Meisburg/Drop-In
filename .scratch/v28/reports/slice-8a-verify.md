# Slice 8a — independent verification (fresh context)

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
Slice under test: `8d1170d..ae578c2` (18 commits, 23 files, +606/−514 — confirmed with `git log`/`git diff --stat`).
Note on provenance: the worktree's HEAD is **`322902f`** = `ae578c2` + one meta-only commit
(`.scratch/v28/ledger.md`, `.scratch/v28/reports/slice-8a.md`, `factory/work/v28-r2-8a.json`; `git diff ae578c2..322902f` shows
no source/test file). Every code measurement below is identical at `ae578c2` and `322902f`.

**VERIFY: PASS** — every commanded lane ran and exited green; the one headline claim worth doubting (the wire
mutation) was re-derived from scratch and holds. Three numbers in the builder's report do not match my
measurement and are named in §5.

---

## 1. `npm run verify` — re-measured raw

    > npm run verify
    > drop-in@0.0.0 verify
    > npm run build && npm run test && npm run lint && npm run a11y:focus && npm run steering-lint && npm run guards
    ...
     Test Files  71 passed (71)
          Tests  2061 passed (2061)
    ...
      ok — AGENTS.md (1789 words, ceiling 1800)
      ok — every steering doc is reachable from AGENTS.md
    PASS — steering layer is clean.
    ...
    factory-guard check: all 90 checks passed.
    ===========================================================
    GUARDS: PASS — all deterministic rules hold.
    EXIT=0   (real 1m9.410s)

| Figure | Builder claimed | **I measured** | Match |
|---|---|---|---|
| exit code | 0 | **0** | ✓ |
| test files | 71 | **71** (`Test Files 71 passed (71)`) | ✓ |
| tests (final) | 2061 | **2061** (`Tests 2061 passed (2061)`) | ✓ |
| lint `: warning ` lines | 81 | **81** (`grep -c ': warning '` on the run + a fresh `npm run lint`) | ✓ |
| lint `: error ` lines | 0 | **0** | ✓ |
| `AGENTS.md` words vs 1800 | 1789 | **1789 / 1800** | ✓ |
| GUARDS | PASS | **PASS**, `GUARDS_EXIT=0` standalone too | ✓ |

## 2. The −7 test delta — re-derived from the two trees, not repeated

Method: `git archive` of both commits + a real `git clone` (so the git-backed guard tests can run), `node_modules`
symlinked, then `npx vitest run --reporter=json` per file and whole-suite.

Baseline `8d1170d` (clean clone, real `.git`):

    2068 tests, 71 test files, exit 0.

Final `ae578c2` (tree `322902f`, `git status` clean): **2061 tests, 71 test files** (§1). Test-FILE list is byte-identical between
the trees (68 `src/**/*.test.ts(x)` files at each; 71 total vitest files at each) — **no test file was added,
deleted, renamed, or silently dropped.**

Per-file counts, measured in each tree:

| file | `8d1170d` | `ae578c2` | delta | the tests removed/added (named) |
|---|---:|---:|---:|---|
| `src/lib/db-v2.test.ts` | 24 | 19 | **−5** | `missingProfileItems` describe: "lists everything when nothing is present", "is empty when photo + bio + kids are all present", "treats an empty/whitespace bio as missing", "treats a missing avatar_url as missing the photo", "treats a null (unsettled/failed) kids load as not-present" |
| `src/lib/onboarding.test.ts` | 14 | 12 | **−2** | `needsOnboarding`: "is true when the user has no home zip", "is false when the user has a home zip" |
| `src/lib/geocode.test.ts` | 30 | 22 | **−8** | `zipFromAddressQuery` ×3 (trimmed query / empty short-circuit / failed lookup) **and** `zipFromAddressQueryBounded` ×5 (fast win / stall-at-deadline / failed-before-deadline / empty short-circuit / rejecting-clears-timer) |
| `src/lib/firstRun.test.ts` | 21 | 29 | **+8** | the `resolveCard` legs (name / set-zip→finish / kids-pending / kids / area / skipped→area / skip-is-session / non-skippable-in-list) |
| **sum** | | | **−7** | −5 −2 −8 +8 = **−7** |

**The builder's breakdown is EXACT**: it wrote −5 (`db-v2`: `missingProfileItems`) −2 (`onboarding.test.ts`:
`needsOnboarding`) −5 (`geocode.test.ts`: `zipFromAddressQueryBounded`) −3 (`geocode.test.ts`:
`zipFromAddressQuery`) +8 (`firstRun.test.ts`: `resolveCard`) = −7 — i.e. −5 −2 −8 +8. Measured −5 −2 −8 +8.

Cross-check independent of vitest: static `^\s*(it|test)\(` count over `src/**/*.test.ts` is **1981 → 1974**
(−7) — the same delta, the same tree, via a different instrument.

**Each deletion is deliberate and explained, not a silently dropped suite:**
- `af30c1a` deletes `missingProfileItems` + `MissingProfileItem` and, in the same commit, the entire
  `describe('missingProfileItems…')` block (5 tests) — replaced by a retirement comment naming why
  (0 production callers at `8d1170d`).
- `1cea356` deletes `needsOnboarding` and its 2-test describe, replaced by a retirement comment.
- `82a978f` deletes `zipFromAddressQueryBounded` **and** its own orphan `zipFromAddressQuery`, removing exactly
  the 8 tests that pinned them; `zipFromResult` was kept because `locationFromResult` calls it in production.
- `41df0f4` adds the 8 `resolveCard` legs with the extraction.
No file disappeared, and no test was lost that did not name the symbol the commit deleted.

## 3. Guards + steering lanes (standalone)

    bash scripts/guards/run-all.sh   -> exit 0   "factory-guard check: all 90 checks passed. / GUARDS: PASS"
    bash scripts/steering-lint.sh    -> exit 0   "PASS — steering layer is clean."

## 4. Playwright — two (in fact four) groups re-run, raw counts

Ran against the live repo (its own `webServer`, no listener killed, no inference server touched):

    npx playwright test onboarding-resume signup-zip-fallback no-zip-notice avatar
      Running 14 tests using 1 worker
      ✓ [setup] auth.setup.ts:56 …  (setup counts once)
      ✓ avatar-square.e2e.ts:71 …   ✓ avatar.e2e.ts:87 …   ✓ avatar.e2e.ts:172 …
      ✓ no-zip-notice.e2e.ts:54 …  ✓ onboarding-resume.e2e.ts:63 …  ✓ onboarding-resume.e2e.ts:136 …
      ✓ signup-zip-fallback.e2e.ts (7 legs)
      14 passed (56.9s)   EXIT=0

    npx playwright test card-circles dm while-away comments
      Running 8 tests using 1 worker
      ✓ [setup] ✓ card-circles ✓ comments ×2 ✓ dm ×3 ✓ while-away
      8 passed (1.1m)   EXIT=0

    (the mutation run in §6 is a third group, re-run twice)

`npx playwright test --list` confirms the suite total the report quotes: **175 tests in 60 files**.
Count discrepancy named: the builder's raw block for the "onboarding-resume signup-zip-fallback no-zip-notice
avatar" group says **13 passed** and omits `avatar-square.e2e.ts`; the same filter as written selects it, and I
measure **14 passed** (1 setup + 1 avatar-square + 2 avatar.e2e + 1 no-zip-notice + 2 onboarding-resume + 7
signup-zip-fallback). Both are green; only the count differs.

## 5. Discrepancies I measured (named, with my number)

1. **Mutation line number is stale.** The report states the reverted-wire failure lands at
   `e2e/avatar.e2e.ts:199`. It lands at **`e2e/avatar.e2e.ts:203:50`** (measured, §6). The value 199 was
   correct at the wire commit `508d656`; commit `3eabe2c` (later in the same slice) inserted 4 lines above it and
   moved the assertion to 203. The behavioural claim (the assertion `getByTestId('avatar-photo')`
   `toHaveCount(0)` → `Expected 0 / Received 1`) is exact. **No other number in the report mismatched.**
2. **Consumer group count.** The brief's "only 9 of the ~17 spec files were exercised" does not reproduce.
   Measured: the builder's passing runs exercised **6 of the 17 consumer spec files** (see §7). The number of
   files run is not the coverage number anyway (§7).
3. Group-A instance count 13 vs my 14 (see §4) — a filter/file-set difference, both green.

## 6. THE WIRE MUTATION — re-derived from scratch (the claim most worth doubting)

Throwaway copy: `git clone` of `HEAD` (`322902f`) into `/tmp/v8a-mut`, `.env` copied, `node_modules` symlinked.
The clone's `Playwright webServer` rebuilds its own `dist/` (`reuseExistingServer` reuse is safe here **because no
server was listening on :4173** — I checked before every run; if the human's preview had been up, the mutation
would have been served the unmutated bundle and the proof would be void).

Revert applied (the "revert a human would actually write" — inline check restored **and** the now-dangling import
removed):

    1223:  {profile !== null && profile.avatar_url !== null && profile.avatar_url !== undefined ? (
    (import of hasAvatarUrl removed)

    npx tsc -b --noEmit          -> TSC_EXIT=0     (the reverted tree typechecks once the import is gone)

    npx playwright test avatar.e2e.ts
      Running 3 tests using 1 worker
      ✓ 1 [setup] …
      ✓ 2 [chromium] avatar.e2e.ts:87 …
      ✘ 3 [chromium] avatar.e2e.ts:172 … (V28 r2 slice 8a)
        Error: expect(locator).toHaveCount(expected) failed
        Locator:  getByTestId('avatar-photo')
        Expected: 0
        Received: 1
        Timeout:  15000ms
            201 |   await openProfileEditor(page)
            202 |
        >   203 |   await expect(page.getByTestId('avatar-photo')).toHaveCount(0)
                |                                                  ^
            204 |   await expect(page.getByTestId('avatar-photo-trigger')).toHaveCount(0)
            205 |   await expect(page.getByText('Add a photo', { exact: true })).toBeVisible()
        at /tmp/v8a-mut/e2e/avatar.e2e.ts:203:50
      1 failed / 2 passed (32.2s)   EXIT=1

Restore (`git checkout -- src/pages/ProfilePage.tsx`) and re-run, raw:

    npx playwright test avatar.e2e.ts
      Running 3 tests using 1 worker
      ✓ 1 [setup]   ✓ 2 avatar.e2e.ts:87   ✓ 3 avatar.e2e.ts:172
      3 passed (15.8s)   EXIT=0

**Conclusion: the wire IS load-bearing.** With the wire reverted the "Add a photo" identity card regresses to an
`<img src="">` and the spec fails exactly where the report says (assertion), just at line **203**, not 199. The
builder's caveat is also confirmed independently: a **bare** revert (inline call restored, import left in place)
does not compile —

    src/pages/ProfilePage.tsx(12,1): error TS6133: 'hasAvatarUrl' is declared but its value is never read.
    TSC_EXIT=2

so the revert must remove the import, exactly as the report says; the wire is held by tsc as well as by the
browser assertion, and only the latter is behavioural.

## 7. `finishSignup`'s changed DEFAULT — consumers enumerated and coverage measured

`e2e/fixtures.ts:464` is the only definition. Signature: `finishSignup(page, { homeZip, radiusMiles? })` —
**there is no flag and no second code path**, so every call exercises the changed default.

    grep -rn "finishSignup(" e2e/ | grep -v "export async function finishSignup" | wc -l
    -> 26 call sites
    grep -rl "finishSignup(" e2e/ (callers only, excluding the definition file) -> 18 files

**26 call sites / 18 files = 17 consumer spec files + `e2e/auth.setup.ts`.** The 17:
`card-circles, comment-replies, comments, dm (×4), feed-empty-state, feed-ended-out, guest-list, host-retention,
inbox (×2), kid-names-privacy, kid-photo-exposure, loop-closing, push-subscribe (×3), reactions,
rsvp-confirmation (×3), while-away, zip-radius`. (`signup-zip-fallback.e2e.ts` is NOT a consumer — it does its
own walk with its own interception.)

**Coverage of the default path — the number that matters:**

| question | measured |
|---|---|
| consumer spec files that exercise the default path (call the helper; no other path exists) | **17 / 17** |
| consumer spec files actually run against the changed helper **by this slice's targeted e2e** | **6 / 17** — `card-circles, comments, dm, feed-empty-state, while-away, zip-radius` |
| consumer spec files NOT exercised here | **11 / 17** — `comment-replies, feed-ended-out, guest-list, host-retention, inbox, kid-names-privacy, kid-photo-exposure, loop-closing, push-subscribe, reactions, rsvp-confirmation` |
| tests that would catch a *hard* regression (walk never completes): every consumer that runs, because `finishSignup` itself waits on the finish card (`first-run-finish-card`) and then the `Near you` feed heading (`fixtures.ts:537-542`) — any broken default hangs/fails that consumer's own test | **17 / 17 covered, 6 / 17 run here** |
| tests that would catch a *silent wrong-zip* regression (walk completes but the intercepted answer's `postcode` is not the caller's zip) | **1 / 17**: `zip-radius.e2e.ts` (passes `98007` + a 20-mi radius and asserts the host's post appears in the viewer's radius feed with the `N mi` label — a wrong viewer location changes membership). `auth.setup.ts` (the 18th caller) does **not** catch it: it re-PATCHes `home_zip`/`radius_miles` to the expected values *after* `finishSignup` and then GETs (`auth.setup.ts:135-148`), so a wrong zip written by the walk is overwritten before the "verified via REST" line is printed. |

So the residual risk is real but narrower than "a behaviour change": the shared walk still completes or fails
loudly in every consumer, and the only silent-failure face (the caller's zip not landing) is pinned by one spec
plus the `signup-zip-fallback.e2e.ts` resolved leg. The 11 un-run consumers are a *run* gap in this slice's
targeted e2e, not an uncovered code path in the full suite.

## 8. Lanes that do not exist for this slice

No `verify-<app>` lane, no live-smoke lane, no `scripts/check_plan.py` (`.scratch/v28/ledger.md:5959` records the
repo has no `verify-<app>` skill). `npm run verify` is the gate, plus the guards/steering lanes above. Nothing
was silently skipped.

## 9. Constraints

- No repo file edited by this lane. `git status --porcelain` in the worktree is clean except the untracked
  `.scratch/v28/reports/slice-8a-review.md` (the review lane's artifact, not mine); `git diff ae578c2 -- src e2e`
  is empty.
- No push; no inference server started or stopped; no listener killed. Playwright's own `webServer` handled
  :4173 and was gone after each run (`ss` shows no listener). All mutation/revert work happened in `/tmp/v8a-mut`.
