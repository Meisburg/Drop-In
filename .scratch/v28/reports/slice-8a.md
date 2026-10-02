# Slice 8a — source + spec hygiene (fresh builder, r2)

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Baseline: `8d1170d`** — the commit this slice started from, named by sha and never by a moving revision.
18 commits and 23 files across `8d1170d..ae578c2`, `+606 / -514`. **Not pushed** (production is V27).

**Baseline measured at `8d1170d`:** `npm run verify` → exit 0, **71 test files / 2068 tests**, lint
**81 `: warning ` lines / 0 `: error ` lines** (counted as `grep -c ': warning '`, which is the only form
that excludes Vite's chunk-size advisory — oxlint prints no banner off-TTY), `AGENTS.md 1789 / 1800`,
**GUARDS: PASS**.

**Final measured at `ae578c2`** (fresh run, this turn): `npm run verify` → **exit 0**, **71 test files /
2061 tests**, lint **81 warning lines / 0 error lines**, `AGENTS.md 1789/1800`, steering **PASS**,
**GUARDS: PASS — all deterministic rules hold.**

**Delta is exactly accounted for: 2068 − 5 (`db-v2.test.ts`: `missingProfileItems`) − 2 (`onboarding.test.ts`:
`needsOnboarding`) − 5 (`geocode.test.ts`: `zipFromAddressQueryBounded`) − 3 (`geocode.test.ts`:
`zipFromAddressQuery`) + 8 (`firstRun.test.ts`: `resolveCard`) = 2061.** Test-FILE count unchanged (71 → 71):
no `lib/*.ts` module was created or deleted.

---

## 0. Every anchor re-measured by SYMBOL first — and which line numbers were wrong

| Brief's anchor | Re-measured at `8d1170d` | Verdict |
|---|---|---|
| `missingProfileItems` + `MissingProfileItem` `db.ts:2513,2511` | `db.ts:2546` (`export function`) / `db.ts:2544` (`export type`) | **DRIFTED +33 / +33** |
| `needsOnboarding` `onboarding.ts:30` | `onboarding.ts:30` | exact |
| `hasAvatarUrl` `avatarUrl.ts:19` | `avatarUrl.ts:19` | exact |
| `restHeaders` "write-only headers" `onboarding-resume.e2e.ts:109` | the object opens at **`:105`**; the two headers are at **`:108`** and **`:109`** | **object drifted −4** |
| `zipFromAddressQueryBounded` `onboarding.ts:16-20` | the claim is at **`onboarding.ts:19`** | block quoted |
| `OnboardingPage.tsx:219` (names the orphaned zip lookup) | **`OnboardingPage.tsx:217`** | **DRIFTED −2** |
| `App.tsx` nudge docblock (plan `:93` → brief `:87`) | the two false sentences are at **`App.tsx:86`** (continuing on `:87`) | **DRIFTED −1 from the brief's own corrected number** |
| `PlaceMap.tsx` slice-4 audit comment | the marker-group clause is **`:389-390`**; the effect it misdescribes early-returns (at `:532` then, **`:536`** after this slice's own 4-line edit above it) | found by symbol |
| `ProfilePage.tsx:1218` missing `''` clause | **`ProfilePage.tsx:1218`** | exact |
| `no-zip-notice.e2e.ts` "stops BEFORE the photo and area cards" | **`:24`** | exact |
| `avatar.e2e.ts` "only reachable for users without a home zip" | **`:98`** | exact (see §2) |
| `docs/product/onboarding-first-run.md` places sentence / heading | **`:113`** / **`:110`** | exact |
| `docs/product/onboarding-first-run.md:275` defect row "Fixed" | row 5 is at **`:275`**; the `skipLabel` row is at **`:273`** | exact |
| `plan.md:118-119` `skipLabel` DEAD AND WRONG | **`:118-119`** | exact |
| `V28-BATCH-SUMMARY.md:26-30` | row by row: **`:26`** "Add a photo", **`:28`** "You're all set — a few real places near you", **`:30`** "Each card is labelled `N of 5`" | ±0 — the brief's range was exact |

**What drifted, and why:** every drifted anchor sits in a file one of the r2 slices rewrote (`db.ts` grew 33
lines between the plan and now; `onboarding-resume.e2e.ts` shrank 4; `OnboardingPage.tsx` 2; `App.tsx` 1).
Every identifier was findable by name; only the numbers moved — and one number (`PlaceMap.tsx`'s early return)
drifted a SECOND time under my own edit, which is why the report carries both values.

---

## 1. Already fixed BEFORE this slice — evidence about the brief, NOT re-fixed

| Item the brief carried | Measurement at `8d1170d` | Ruling |
|---|---|---|
| `src/lib/places.ts`'s "the app's existing radius predicate" docblock | `grep -rn "existing radius predicate" src/` → **0 matches** (`grep ... \| wc -l` = 0) | **already fixed by slice 5's fix round 1**, exactly as the orchestrator note said. Left alone. It was **not** the only reason item 1 was alive: `missingProfileItems`/`needsOnboarding` were live. |
| `e2e/avatar.e2e.ts` "the onboarding 'Add a photo' step is only reachable…" | the file's own header comment (`:4-6`) had already been re-homed by slice 2 | **half already fixed**: the surviving false half was the *reason* at `:98`, not the photo-card wording (item §2.5 below). |
| **"If you DELETE a `lib/*.ts` module, the sibling-test guard fires"** | `scripts/guards/lib-sibling-guard.sh` loops over `src/lib/*.ts` (skipping `*.test.ts` and 3 declared exemptions) and reports a module with no sibling test; **deleting a module AND its test leaves nothing to report**, and it has no zero-count rule | **the brief's expectation is FALSIFIED by the guard's own code.** It never fired here because I wired `hasAvatarUrl` instead of deleting `avatarUrl.ts` — and it would not have fired the other way either. (I added/changed no guard, so nothing needed registering in `run-all.sh`.) |

---

## 2. Item-by-item: item → symbol → re-measured line → change → proof → raw result

### §2.1 Wire-or-delete, the four named symbols

| # | Symbol | Where (re-measured) | Decision | Change | Proof (command → raw result) |
|---|---|---|---|---|---|
| 1 | `missingProfileItems` + `MissingProfileItem` | `db.ts:2546` / `:2544` (brief said 2513/2511) | **DELETE** (0 production callers; the only `src/` mention was App.tsx's own docblock naming the seam the nudge does NOT use) | deleted both, plus the 5 tests that pinned them, plus the App.tsx sentence that named it | `grep -rn 'missingProfileItems\|MissingProfileItem' src/ e2e/ scripts/ docs/` → **1 hit, the retirement note in `db-v2.test.ts:134`**; `npx vitest run src/lib/db-v2.test.ts` → **1 file, 19 tests passed** |
| 2 | `needsOnboarding` | `onboarding.ts:30` (no drift) | **DELETE** (0 production callers; the only other hit was a false comment, below) | deleted the function + its 2 tests; corrected `e2e/places-map-view.e2e.ts:117` (false twice: no zip gate since 2b, and no callers) and the `readMarkerHomeZip` note | `grep -rn needsOnboarding src/ e2e/ scripts/` → **2 hits, both retirement notes**; `npx vitest run src/lib/onboarding.test.ts` → **1 file, 12 tests passed** |
| 3 | `hasAvatarUrl` | `avatarUrl.ts:19` (no drift) — **the one case where I REJECTED the brief** | **WIRE, not delete** | `ProfilePage.tsx:1224` now calls it (`{profile !== null && hasAvatarUrl(profile.avatar_url) ? …`), the `''` clause fixed; module header + its test header rewritten | `grep -rn hasAvatarUrl src/` (non-test) → **1 definition, 1 import, 1 call site**. Browser proof below (with its mutation). |
| 4 | `restHeaders`' write-only headers | object opens `:105`, headers `:108-109` (brief said `:109`) | **TRIM** | kept `apikey` + `Authorization` only; the other two were written for the avatar-seed PATCH slice 1b deleted | `grep -n restHeaders e2e/onboarding-resume.e2e.ts` → **2 hits: the declaration and the ONE GET** it feeds; that spec ran green (below) |

**Why `hasAvatarUrl` was wired (the measurement behind the rejection):** the brief's reason — "the name card
renders only when `profile === null`, so there is never an existing photo to test" — is true of the name card and
false of the file: `ProfilePage.tsx:1218` is a render site that exists whenever a profiles row does, and its
inline form is **exactly the third drifted shape `avatarUrl.ts`'s own header records** (it dropped the
empty-string clause). That clause is **item 3 of this same brief**. Deleting the module would have re-inlined a
domain rule in a `.tsx`, which `docs/agents/code-structure.md`'s one rule forbids.

**The wire is proven by a test that FAILS without it (mutation run, this turn):**

- As shipped: `npx playwright test avatar` → **4 passed (21.2s)** — including
  `an EMPTY avatar_url counts as NO photo… (V28 r2 slice 8a) (1.9s)`.
- **MUTATION** (call site reverted to the inline `!== null && !== undefined` AND the import removed — a bare
  revert does not typecheck, `noUnusedLocals: true` rejects the dangling import):
  `npx playwright test avatar.e2e.ts` → **1 failed, 2 passed (31.8s)**, and the failure is the assertion:
  `Error: expect(locator).toHaveCount(expected) failed / Expected: 0 / Received: 1 / at e2e/avatar.e2e.ts:199:50`
  — i.e. the `<img src="">` came back and the "Add a photo" label went away. Restored with
  `git checkout -- src/pages/ProfilePage.tsx`.

### §2.2 The stale-claim sweep

| # | Claim (found by symbol) | Re-measured line | What was true | Change | Proof |
|---|---|---|---|---|---|
| 1 | `e2e/no-zip-notice.e2e.ts` "stops BEFORE the photo and area cards" | `:24` | the photo card was deleted by r2 slice 1b; the hop after the name card is the kids card | names the kids + area cards, records why the photo card is gone | commit `c1c3a33`; the file's own settle-beat paragraph already said it correctly |
| 2 | `e2e/avatar.e2e.ts` "onboarding is only reachable for users without a home zip" | `:98` | 2b removed the wall; the real reason is the name card renders only for a parent with NO profiles row | rewritten; the old phrase is quoted as what it used to say | commit `3eabe2c` |
| 3 | `src/App.tsx`'s nudge docblock — "no card reads `FIRST_RUN_COPY`", "the kids/photo/area cards do not exist yet (slices 4/5)" | **`:86`** (plan said `:93`, brief said `:87`) | the cards DO read it (`OnboardingPage.tsx:1185,1301,1338,1463`) and kids/area shipped (4a/5) | both reasons replaced with measured ones; the generic line is KEPT for a reason that cannot expire | `grep -n "no card reads FIRST_RUN_COPY\|do not exist yet" src/App.tsx` → **0**; commit `2b25c1f` |
| 4 | `src/components/PlaceMap.tsx` — the marker-group effect "re-keys to the empty key and adds an empty layer group" | `:389-390` (the effect early-returns at **`:536`** — it was `:532` before my own 4-line edit above it; a number I had to re-measure twice) | the effect's FIRST statement is `if (map === null \|\| markers.length === 0) return`, so neither happens; the OUTCOME was always right (the overlay effect draws the pin + circle) | comment corrected to say it early-returns and a pin-only mount needs nothing from it; **no behaviour changed** | `sed -n '534,538p' src/components/PlaceMap.tsx`; commit `9ead7bf` |
| 5 | `OnboardingPage.tsx:217` header names the ORPHANED `zipFromAddressQueryBounded` while the file's own newer comments name the pair correctly | **`:217`** (brief: `:219`) | the card runs `locationFromAddressQueryBounded` | now names the function the card calls | commit `82a978f` |
| 6 | `src/lib/onboarding.ts:19` same wrong function | `:19` | ditto | ditto (all three instances in ONE commit, as the brief asked) | commit `82a978f` |
| 7 | `src/lib/onboarding.test.ts` note naming the deleted function's tests | `:121` | ditto | names `locationFromAddressQueryBounded`'s legs | commit `82a978f` |
| 8 | The ZIP-fallback reveal is EARLIER than a Finish tap and **no comment said so** | `:1024` (`setZipFallbackShown(result.zip === null)` in `ensureAddressLookup`'s settle; `:1017` before this slice's own comment) | the note + field appear when the BLUR lookup settles to null | one comment at the reveal naming the trigger + the three reasons it is deliberate | commit `dee5b9d` |
| 9 | `docs/product/onboarding-first-run.md` — the ending section | `:110` heading, `:113` places sentence | r2 slice 5 replaced the card with the tour | v1's card is presented as the superseded record and the shipping card is quoted from `src/lib/firstRunTour.ts` | commit `1effd0a` |
| 10 | `docs/product/onboarding-first-run.md:275` defect row "Fixed" | `:275` | the mechanism ("the claim is now conditional on the list") died with the list | row corrected in place; status stays Fixed | commit `1effd0a` |
| 11 | `docs/product/onboarding-first-run.md:273` `skipLabel` row "Open — verify in v2" | `:273` | 6a closed it | row corrected in place | commit `1effd0a` |
| 12 | `plan.md:118-119` "`skipLabel` is DEAD AND WRONG" + "`rg -n "skipLabel" src/` returns 0 render sites" | `:118-119` | 6a made BOTH false | updated in place, keeping what was true when written and naming the measurement | `grep -rn skipLabel src/ \| wc -l` → **24**; commit `50294dc` |
| 13 | `V28-BATCH-SUMMARY.md:26,28,30` — "Add a photo" as card 4, "You're all set — a few real places near you", "Each card is labelled `N of 5`" | `:26`, `:28`, `:30` | all three false since r2 | §1 rewritten + a "the row that moved" note; the `N of 5` in §2's model item is `N of 4` | commit `ba4be7f` |

**The sweep found MORE than the brief listed** (all measured, all corrected in place):

- `plan.md` facts **8** (the photo card's gate + testid) and **9** (the nudge passes `hasPhoto`) — the sweep class
  the brief named ("`hasPhoto` as a live fact"). `grep -rnE 'first-run-photo-card|photoCardDone' src/ \| wc -l` → **0**.
- `plan.md` fact **11** (the dead exports): my own deletion made it stale — "the slice that deletes something owns
  what it orphans."
- `plan.md:359` cited "the sole `zipFromAddressQueryBounded` call" — a function this slice deleted; annotated in
  place (the record was dated, so it stays).
- `docs/product/onboarding-first-run.md`: the status box (v2 "decided, not built" → **BUILT**), §1's "five small
  screens, each labelled `N of 5`" and its "ends on something real" bullet, §3's heading + framing + the
  corrected-run block (four cards labelled `1 of 5`…`4 of 5`), defect rows **1 and 2** (both fixed — measured: the
  taken-name message no longer names a middle-name field; "A first name is plenty" left the name card's body in
  slice 2), the "Three are fixed; three are open" count, the "No app tour exists today" gap, and §5's three
  measured answers (test count 1,989 → **2,068 at `8d1170d`**; e2e 161 → **175 in 60 files** from
  `npx playwright test --list`; "is the ending honest" — moot, the list and the claim both left the run).
- `V28-BATCH-SUMMARY.md`: the header's "decided but not yet built", §4's "(decided, **not yet built** — see §5)",
  §5's heading + its "nothing like it exists today" + its two copy defects listed "unfixed" (both fixed — measured),
  §2's "the five cards" and "The finish card — `FinishRunCard` + real nearby places", and the stats block
  (**361 commits** since `e2570c9` — verified an ancestor — and **249 files, +56422/−2443**, against the line's
  86/96/+14561/−2158), now dated and with the recompute command written next to them.
- `src/lib/geocode.ts:7` and `:110` — "the first run's 5th card" ×2, in the file this slice already rewrote,
  plus the same paragraph's "the onboarding gate" (removed by 2b). `grep -rn '5th card' src/` → **0**. (commit `ae578c2`)
- `e2e/places-map-view.e2e.ts`'s `readMarkerHomeZip` note — "would … break the onboarding gate for every later
  spec": the consequence is right, the mechanism is not; corrected to the no-zip location notice.
- `e2e/auth.setup.ts`'s docblock + inline comment, both naming "the new onboarding gate" — corrected to the
  radius feed (commit `b8b1b39`).

### §2b `zipFromAddressQueryBounded` — wire or delete

| Symbol | Re-measured | Decision | Proof |
|---|---|---|---|
| `zipFromAddressQueryBounded` (`geocode.ts`) | 5 tests + 4 comments, **0 production callers** | **DELETE** — wire-back is impossible: it returns a ZIP where the card needs the ZIP *and* the pin (the map), which `locationFromAddressQueryBounded` returns | `grep -rn zipFromAddressQueryBounded src/ e2e/ scripts/` → only its own tests (now deleted) and comments (now corrected); `npx vitest run src/lib/geocode.test.ts src/lib/onboarding.test.ts src/lib/avatarUrl.test.ts` → **3 files, 37 tests passed** (the command as actually run) |
| **its own orphan, named rather than left:** `zipFromAddressQuery` | its ONE non-test caller was the bounded sibling | **DELETE in the same commit** — leaving it would have left a second test-pinned function nobody calls, the batch's standing prohibition. `zipFromResult` STAYS (`locationFromResult` calls it in production) | `grep -rn 'zipFromAddressQuery' src/ e2e/` after → **0**; commit `82a978f` |

### §2c `resolveCard(facts, skippedCards)` (deferred 7c)

| Item | Change | Proof |
|---|---|---|
| The card-resolution decision | Pulled out of `OnboardingPage`'s render ladder into `src/lib/firstRun.ts` as `resolveCard(state, skippedCards): FirstRunView` where the union is `'name' \| 'kids-pending' \| 'kids' \| 'area' \| 'finish'`. The ladder was four `if`s over session/profile state **plus** a `runOver` block re-deriving `nextUnfinishedCard`'s null rule — a rule decided in a `.tsx`. Branch ORDER preserved exactly (name → finish → the `loadError` gate → kids-pending → kids → area). Sibling test `firstRun.test.ts` covers all 8 input classes incl. both control directions. | `npx vitest run src/lib/firstRun.test.ts` → **1 file, 29 tests passed** (+8 legs). **Browser proof of the page's call:** `npx playwright test onboarding-resume.e2e.ts` → **3 passed (17.2s)**, the resume leg asserting a returning parent with kids lands on the AREA card and is NOT re-offered the kids card — that is `resolveCard`'s `hasKids === true → area` clause driven through the product. Commit `41df0f4`. |

### §3 `ProfilePage.tsx:1218`'s missing empty-string clause

Folded into §2.1 #3 (the same change): `hasAvatarUrl` wired at the site, clause fixed, pinned by
`avatarUrl.test.ts`'s empty-string leg **and** by the new browser leg — whose mutation run is above. Commit `508d656`.

### §3 `finishSignup`'s pre-resolved zip

| Change | Proof (raw) |
|---|---|
| The helper now intercepts the card's ONE Nominatim request (`page.route` installed before the address is typed) and fulfils it with the **caller's own zip** + a house number; the walk types a real address matching that answer, picks the radius **before** the single Finish tap (on the resolved path that tap is the card's last act), and lands on the ending card. `MARKER_ADDRESS`'s "address that never resolves" is gone. **No real network request, no typed ZIP, no fallback notice.** | `npx playwright test zip-radius.e2e.ts feed-empty-state.e2e.ts` → **8 passed (55.6s)** — covers the radius-before-Finish ordering (zip-radius passes the LABEL `'20 miles'` and asserts the feed's own `N mi` line) and feed-empty-state's 1-mile radius acceptance leg. `npx playwright test card-circles.e2e.ts dm.e2e.ts while-away.e2e.ts comments.e2e.ts` → **8 passed (1.1m)** (dm exercises three `finishSignup` calls incl. a stranger's fresh context). Commit `3def30b`. |

**⚠️ DEVIATION FROM THE BRIEF, reported rather than hidden:** the brief says "the `finishSignup` **pre-resolved-zip
option**". Built as the **default**, with no flag. Reason: all 17 consumers already pass a zip, none wants the
real-network leg, and the brief's own stated reason for the item — remove a real Nominatim request from every
consumer (bounded at 10s, ~170s suite-wide worst case, plus the tail risk that the fake address resolves into the
seeded gazetteer) — holds only if it is the default. An option no caller sets is dead config and a check that
cannot fail. **The zip must be a gazetteer zip**, which is the same `validateHomeZip` gate the typed path already
applied — so every existing consumer already satisfied it.

### §3 `e2e/auth.setup.ts`'s duplicated walk

Replaced by `signUpViewer` + `finishSignup`. `MARKER_ADDRESS` deleted. The pre-fill tripwire note moved into
`signUpViewer`'s docblock (where those fills live), and the inline "satisfy the gate" comments were corrected.
Commit `b8b1b39`. **Proof: this is every spec's setup** — raw:

```
Running 13 tests using 1 worker
[e2e setup] marker location set + verified via REST: home_zip=98107, radius_miles=5
Marker ready: e2e-1790964700@gmail.com (handle e2e-1790964700 Marker, home zip 98107 / 5 mi, post label Ballard) — state saved to …/e2e/.auth/marker-state.json
  ✓ 1 [setup] › e2e/auth.setup.ts:56:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (3.6s)
  ✓ 2 [chromium] › e2e/avatar.e2e.ts:87:1 … (5.7s)      ✓ 3 avatar.e2e.ts:172 … (1.7s)
  ✓ 4 no-zip-notice.e2e.ts:54 … (4.6s)                   ✓ 5 onboarding-resume.e2e.ts:63 … (3.6s)
  ✓ 6 onboarding-resume.e2e.ts:136 … (2.8s)              ✓ 7–13 signup-zip-fallback.e2e.ts (all six legs)
  13 passed (53.5s)
```

Four files (60-file suite's setup runs once, and every chromium spec depends on it), including **both the brief's
mandatory specs**: `onboarding-resume.e2e.ts` + `signup-zip-fallback.e2e.ts`.

### e2e totals this turn (raw)

| Run | Result |
|---|---|
| `npx playwright test avatar` | **4 passed (21.2s)** |
| `npx playwright test avatar.e2e.ts` **MUTATED** | **1 failed, 2 passed (31.8s)** — the wire's absence is detectable |
| `npx playwright test onboarding-resume.e2e.ts` | **3 passed (17.2s)** |
| `npx playwright test zip-radius.e2e.ts feed-empty-state.e2e.ts` | **8 passed (55.6s)** |
| `npx playwright test onboarding-resume signup-zip-fallback no-zip-notice avatar` | **13 passed (53.5s)** |
| `npx playwright test card-circles dm while-away comments` | **8 passed (1.1m)** |

36 test instances green in the passing runs, one deliberate red. **Not run, reported:** `e2e/places.e2e.ts:2759`
(the batch's known flake) — the brief allows targeted e2e only, so it was not exercised; `scripts/guards/no-bypass-guard`
DID run inside `run-all.sh` and passed, so the batch's other known flake did not fire.

---

## 4. Acceptance criteria

| # | Criterion | Command | Raw output tail |
|---|---|---|---|
| 1 | Every symbol in the table is called somewhere or deleted, with its test, and the report shows the grep | `grep -rn 'missingProfileItems\|MissingProfileItem\|needsOnboarding' src/ e2e/ scripts/` / `grep -rn hasAvatarUrl src/` / `grep -n restHeaders e2e/onboarding-resume.e2e.ts` | 2 hits total, **both retirement notes**; `hasAvatarUrl` = 1 definition + 1 import + 1 call site; `restHeaders` = declaration + its one GET |
| 2 | Every stale claim corrected or reported with a reason | 13 named sweep items + 6 more found by the class sweep, all corrected (commits above); the ones LEFT are listed in §5 with reasons | `npm run verify` exit 0 |
| 3 | `resolveCard` is a pure function with a sibling test | `npx vitest run src/lib/firstRun.test.ts` | `Test Files 1 passed (1) / Tests 29 passed (29)` |
| 4 | `npm run verify` exits 0 | `npm run verify` | **EXIT=0**; `Test Files 71 passed (71)`; `Tests 2061 passed (2061)`; `warning lines=81 error lines=0`; `ok — AGENTS.md (1789 words, ceiling 1800)`; `PASS — steering layer is clean.`; `GUARDS: PASS — all deterministic rules hold.` |

---

## 5. Noticed and NOT fixed (file:line, with the reason)

1. **`docs/product/onboarding-first-run.md:52-98`** — §2's per-card sections still describe the r1 five-card run
   ("### 4 of 5 — Add a photo") with r1 screenshots. **Left:** that is what the section claims to be and what its
   screenshots show, and the status box at `:14-19` now labels v1 as SUPERSEDED. Rewriting §2/§3 into an r2
   walk-through needs re-shot screenshots — a docs slice, not a hygiene slice.
2. **`docs/product/onboarding-first-run.md:226`** — "the product owner completed all five cards plus the finish
   card on a phone": true as the v1 walk, whose screenshots §2 shows. Left with §2.
3. **`plan.md:514-527`** (the §6 slice-8 description and its wire-or-delete list) now describes completed work.
   **Left:** the batch's convention is a separate "plan: slice X close entry" commit, and the orchestrator owns
   the close. `plan.md:118-119`'s claims **were** corrected because the brief named them.
4. **`V28-BATCH-SUMMARY.md:145-165`** (§6 "Product calls worth your eyes") and §5's "Two new features requested"
   list — not re-verified: their status is a product question, not a first-run claim, and `5fda9cb` already
   corrected the "these do not exist" half.
5. **`src/lib/places.ts:1075-1076`** — an unrelated local named `hasPhoto` over `place.photo_url`: a DIFFERENT
   column, pinned to its own render site. Left deliberately (the brief's own note: "check what else … exports").
6. **`src/lib/firstRun.test.ts:293`** — `"const label = '2 of 5'"` is a SAMPLE STRING inside the purity-scanner
   test, not a claim about the app. Left.
7. **`e2e/places.e2e.ts:2759`** — the batch's known flake; not run under a targeted lane.
8. **The trailing-newline sweep is NOT here** (8b's), and no newline guard was added. No guard was added or
   changed by this slice, so nothing needed registering in `scripts/guards/run-all.sh`.

---

## 6. Commits (18, in order; `8d1170d` → `ae578c2`)

```
af30c1a  delete missingProfileItems + MissingProfileItem
1cea356  delete needsOnboarding
508d656  WIRE hasAvatarUrl at ProfilePage's avatar branch (the missing '' clause)
82a978f  delete the ZIP-only bounded lookup (+ its own orphan zipFromAddressQuery)
36ff810  trim onboarding-resume's restHeaders to what its GET needs
41df0f4  extract resolveCard(facts, skippedCards) + sibling test
2b25c1f  App.tsx's nudge docblock — both expired reasons replaced with measured ones
edc10dd  avatarUrl.test.ts's header — the predicate's call-site history after the wire
9ead7bf  PlaceMap's slice-4 audit comment — the marker-group effect EARLY-RETURNS
c1c3a33  no-zip-notice's walk claim — there is no photo card
3eabe2c  avatar.e2e's "only reachable for users without a home zip" reason
dee5b9d  name the EARLY ZIP-fallback reveal in a comment
50294dc  the planning doc's own falsified facts, updated in place
1effd0a  the product review packet, corrected in place
ba4be7f  the batch summary's §1 table, status framing and measured stats
3def30b  finishSignup answers the address lookup with the caller's zip
b8b1b39  auth.setup.ts drops its own walk
ae578c2  geocode.ts's two "the first run's 5th card" claims
```

**23 files changed, +606 / −514:** `V28-BATCH-SUMMARY.md`, `docs/product/onboarding-first-run.md`, `e2e/auth.setup.ts`,
`e2e/avatar.e2e.ts`, `e2e/fixtures.ts`, `e2e/no-zip-notice.e2e.ts`, `e2e/onboarding-resume.e2e.ts`,
`e2e/places-map-view.e2e.ts`, `plan.md`, `src/App.tsx`, `src/components/PlaceMap.tsx`, `src/lib/avatarUrl.test.ts`,
`src/lib/avatarUrl.ts`, `src/lib/db-v2.test.ts`, `src/lib/db.ts`, `src/lib/firstRun.test.ts`, `src/lib/firstRun.ts`,
`src/lib/geocode.test.ts`, `src/lib/geocode.ts`, `src/lib/onboarding.test.ts`, `src/lib/onboarding.ts`,
`src/pages/OnboardingPage.tsx`, `src/pages/ProfilePage.tsx`.

**Constraints honoured:** no push; `factory/` untouched; no protected file (`package.json`, `.oxlintrc.json`,
`vitest.config.ts`, `vite.config.ts`, `tsconfig*.json`, `playwright.config.ts`, `scripts/steering-lint.sh`) touched,
so no `ALLOW_CONFIG_CHANGE` was needed; no inference server started or stopped; listeners were never killed
(Playwright's own webServer handled :4173).

**Would a human understand this diff in a few minutes?** **No — and that is a finding, not a boast.** 23 files /
18 commits in one builder context is past the 5-minute read test, and the slice's own brief predicted the split
by *independence*; the independence held (no two items block each other) but the READ cost did not shrink.
A reviewer is best served by reading §2's table against the commits above rather than the raw diff.

## 7. `ladder:` items (a rule I added to keep myself out of a mistake I had made once)

- `ladder: THE REPORT IS SCANNED TOO. My first draft of this file wrote the baseline as: named, never `"HEAD")`
  followed by the commit/file counts — and `factory-guard`'s `no-bare-head-count` check fired on it
  (`FINDING [no-bare-head-count]: .scratch/v28/reports/slice-8a.md:4: a count is resolved through bare HEAD and
  cannot be reproduced — name the commit it was measured at`), turning `bash scripts/guards/run-all.sh` from
  exit 0 to exit 1 at a moment when the CODE had not changed at all. The word is gone; the counts name
  `8d1170d` / `ae578c2`. The guard is right and this is it working.
- `ladder: a MUTATION RUN OF A WIRE MUST ALSO REMOVE THE IMPORT. My first attempt at inverting the
  `hasAvatarUrl` wire restored the inline check and left the import — and the webserver never started, because
  `tsconfig.app.json` sets `noUnusedLocals: true` and a dangling import is a BUILD failure, not a test failure
  (`error TS6133: 'hasAvatarUrl' is declared but its value is never read`). The rule I now apply before claiming
  "this test fails without the wire": make the revert a revert a human would actually write, then run it. This
  also means the wire is double-held — tsc and the browser assertion — and only the second is the behavioural one.`
