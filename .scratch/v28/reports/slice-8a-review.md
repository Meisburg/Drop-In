# Slice 8a — fresh-context review (`8d1170d..ae578c2`)

## DISCLOSURE (required, D-007 / D-015)

**I am a sibling model, not an independent reviewer.** I am the same model family as the builder, so my
"fresh context" is a fresh *conversation*, not an independent instrument. D-015 records that independence in
this factory is **stronger than the word**: the reviewer floor is cleared by one registered model, so
`same_model: false` describes a *provenance channel*, not a second opinion. Weigh this verdict accordingly.

**What I did (all read-only):** `git diff`/`git show`/`git log -S` at `8d1170d` and `ae578c2`, `grep`/`awk`
over the tree, and `npx playwright test --list` (enumeration only). **What I did NOT do:** I did not run
`npm run verify`, `npm run test`, or any Playwright spec — my lane does not run the suite, and the
builder's success claim is not evidence. Every count below is a count *I* took, with the command quoted.

**Verdict: NEEDS_CHANGES** — three blocking findings, all small and all in the *verification* half of the
diff (no product-code behaviour is wrong that I found).

---

## 1. The two brief-level deviations, adjudicated

### Deviation A — `hasAvatarUrl` WIRED instead of deleted: **RIGHT, and the measurement supports it**

- The brief's reason ("slice 2 answered this one: NO legitimate use — the name card renders only when
  `profile === null`, so there is never an existing photo to test") is **true of the name card and false of
  the module's other render site.** At `8d1170d` the site measured as
  `git show 8d1170d:src/pages/ProfilePage.tsx | awk 'NR==1218'` →
  `{profile !== null && profile.avatar_url !== null && profile.avatar_url !== undefined ? (`
  — a branch that exists whenever a profiles row does, and that must decide avatar presence.
- That is exactly the drifted form the module's own header records, and **brief item §3 in the same brief
  required fixing it** ("`ProfilePage.tsx:1218`'s missing empty-string clause … Fix it, and pin it in its
  sibling test"). Deleting the module would have re-inlined a domain rule in a `.tsx`, which
  `docs/agents/code-structure.md`'s one rule forbids. Wiring satisfies §2.1 #3 *and* §3 with one change.
- **The measurement is real:** `grep -rn hasAvatarUrl src/` → 1 definition (`src/lib/avatarUrl.ts:27`),
  1 import (`src/pages/ProfilePage.tsx:12`), 1 call site (`src/pages/ProfilePage.tsx:1224`).
- **One mislabel in the argument** (non-blocking): the report calls ProfilePage's inline form "exactly the
  third drifted shape `avatarUrl.ts`'s own header records". It is the **second** of that header's three
  bullets; the third is `lib/places.ts`'s `photo_url` check. The conclusion is unaffected.

### Deviation B — `finishSignup`'s pre-resolved zip built as the DEFAULT, not an option: **RIGHT in substance, one supporting number wrong, and two consequences undeclared**

- **Right:** the options type *requires* the zip —
  `git diff 8d1170d..ae578c2 -- e2e/fixtures.ts` line `options: { homeZip: string; radiusMiles?: number | string }`
  — so an option nobody can decline is dead config, and the brief's own stated purpose (remove a real
  Nominatim request from every consumer) holds only as the default. Verified independently: every call site
  passes a zip (`grep -rn "await finishSignup(" e2e/*.ts` → 26 call sites in 18 files, all with `homeZip`).
- **WRONG NUMBER (non-blocking):** the report's argument says "**all 17 consumers** already pass a zip", and
  the new docblock says "the helper no longer re-walks the empty leg for **17 specs** that never asserted it"
  (`e2e/fixtures.ts:440`). Measured: `git grep -l "finishSignup(" 8d1170d -- e2e/ | wc -l` → **18**
  (including `fixtures.ts` itself ⇒ **17 consumers pre-slice**), and `grep -rln "await finishSignup(" e2e/*.ts | wc -l`
  → **18 consumers now** — `e2e/auth.setup.ts:85` is the slice's own 18th. The slice made the count stale and
  then wrote the old value into new prose. (The repo carries the same stale `17` in four pre-existing
  comments: `e2e/signup-zip-fallback.e2e.ts:119`, `e2e/fixtures.ts:455`, `src/components/HowItWorksCard.tsx:31`,
  `src/lib/firstRunTour.ts:209`.)
- **Undeclared consequence 1:** the default also removes the ZIP-fallback walk from *every* consumer, not just
  the network request. That coverage does survive once, in `e2e/signup-zip-fallback.e2e.ts:237` (I read it:
  note + field + the typed zip + a successful finish), so the claim "Both faces of the fallback remain pinned
  where they belong" is **true** — but the report does not say that 18 consumers stopped exercising it.
- **Undeclared consequence 2 — the serious one:** see §4/B1. The old helper's address was chosen *because it
  could never resolve* (`git show 8d1170d:e2e/auth.setup.ts`: *"It must never resolve to a seeded gazetteer
  zip … A REAL street here would make the marker's zip depend on the network's answer — exactly the
  non-determinism the deterministic zip below exists to avoid"*). The slice deleted that guard **and the
  reasoning**, replacing it with a REAL address plus a stub nothing verifies fired.

---

## 2. The wiring is proven, not asserted — symbol by symbol: what FAILS if the wire is removed?

| symbol | what fails if the wire is removed | verdict |
|---|---|---|
| `hasAvatarUrl` **(WIRED)** | Nothing fails as a *wire*. Removing the call by restating the check **with** the `''` clause (`!== null && !== undefined && !== ''`) leaves all 8 vitest legs and the new browser leg green. What fails is only the *pre-slice* restatement (clause missing) — that is what the builder's mutation ran. | **wire UNPROVEN, behaviour PROVEN** |
| `missingProfileItems` + `MissingProfileItem` **(deleted)** | — `grep -rn 'missingProfileItems\|MissingProfileItem' src/ e2e/ scripts/ docs/` → **1 hit**, the retirement note at `src/lib/db-v2.test.ts:134` | OK |
| `needsOnboarding` **(deleted)** | — `grep -rn needsOnboarding src/ e2e/ scripts/` → **2 hits**, both retirement notes (`src/lib/onboarding.test.ts:20`, `e2e/places-map-view.e2e.ts:126`) | OK |
| `zipFromAddressQueryBounded` + `zipFromAddressQuery` **(deleted)** | — `grep -rn zipFromAddressQuery src/ e2e/ scripts/` → 1 hit, the retirement note `src/lib/geocode.ts:30` (plus the dated plan record `plan.md:375`) | OK |
| `restHeaders`' write-only headers **(trimmed)** | Nothing — they are inert on a GET, so no test can pin the trim. The proof is structural and the report gives it: `grep -n restHeaders e2e/onboarding-resume.e2e.ts` → 2 hits (declaration `:109`, the one GET `:127`). **Acceptable for a header trim**; a test here would be theatre. | OK |
| `resolveCard` **(extracted)** | Nothing as a *wire*: re-inlining the ladder byte-for-byte leaves `e2e/onboarding-resume.e2e.ts` green (the behaviour it asserts — a kid-having parent lands on AREA — held before the extraction too). The extraction's real proof is the 8 new unit legs, which is the correct standard for a refactor. | **wire UNPROVEN, contract PROVEN** |
| `finishSignup`'s stub **(new)** | **Nothing.** Revert the helper to the old address + typed-zip walk and every spec passes again (with a real request). | **UNPROVEN (B1)** |

**The class:** no test can distinguish *"the page calls the predicate"* from *"the page restates it faithfully"*.
The builder's §7 ladder note half-says this ("the wire is double-held — tsc and the browser assertion — and
only the second is the behavioural one"), but three shipped sentences claim the stronger thing
(non-blocking, D-025): `e2e/avatar.e2e.ts:182-183` — *"It is the only browser-level proof that ProfilePage
CALLS the predicate rather than restating it"*; `src/lib/avatarUrl.test.ts`'s header — *"which is what
e2e/avatar.e2e.ts's '' leg pins in the browser"*; and the report's *"The wire is proven by a test that FAILS
without it"*.

---

## 3. The build law (`docs/agents/code-structure.md`)

**Respected on the substance.** The diff moves a rule *out* of a `.tsx` (`resolveCard`: name → finish →
kids-pending → kids → area, branch order preserved — read against the deleted ladder in the diff and against
`src/lib/firstRun.ts:138-151`), introduces **no** new `lib/*.ts` module (test-file count 71→71 is consistent
with that), injects no client (`firstRun.ts` has zero imports), and points `ProfilePage.tsx` *at* `lib/`
rather than away from it. `resolveCard`'s sibling test exists and asserts real behaviour (8 legs, both
control directions — e.g. `expect(resolveCard(state({ hasKids: false }), [])).toBe('kids')`).

Three law-shaped findings:

- **BLOCKING — the one-copy rule is violated by the diff itself.** The new constant is a byte-identical
  second copy of an existing one:
  `e2e/fixtures.ts:26` → `const NOMINATIM_ROUTE = /https:\/\/nominatim\.openstreetmap\.org\/search\?/`
  `e2e/signup-zip-fallback.e2e.ts:98` → `const NOMINATIM_ROUTE = /https:\/\/nominatim\.openstreetmap\.org\/search\?/`
  (verified with `grep -rn "NOMINATIM_ROUTE\s*=" e2e/`). The law is unambiguous — *"If the same expression is
  written in two files, it has two futures. A one-liner is a module, not a habit"* — and its reviewer
  checklist item 5 is *"Is there duplication of a logic block across files?"* `fixtures.ts` is imported by
  every spec, so the export channel already exists. The slice removed one duplication (the walk) in
  `e2e/auth.setup.ts` on exactly this argument while adding another in the same directory.
- **Not logic moved into a component, but an unlabelled fallthrough:** the page's last view is the AREA card
  with no `view === 'area'` branch (`src/pages/OnboardingPage.tsx:1355` is the last gate), so a future sixth
  member of `FirstRunView` would silently render the area card. Structural nit, not a defect today.
- **The page still decides one small thing** — `kidsCardDone ? SKIPPABLE_CARDS : []`
  (`src/pages/OnboardingPage.tsx:599-602`) maps a page flag to `lib`'s authority list before the call. That is
  composition, not a rule; acceptable.

---

## 4. `finishSignup`'s default path — the blast radius (what breaks for a consumer NOT run)

**Which consumers were not run.** Consumers = files with a live `finishSignup` call: 18. Exercised by the
report's lanes: `auth.setup.ts`, `card-circles`, `comments`, `dm`, `feed-empty-state`, `while-away`,
`zip-radius` (**7**). **Not exercised: 11** — `comment-replies`, `feed-ended-out`, `guest-list`,
`host-retention`, `inbox`, `kid-names-privacy`, `kid-photo-exposure`, `loop-closing`, `push-subscribe`,
`reactions`, `rsvp-confirmation`.

**What a not-run consumer could hit.**

1. **The stub is page-scoped for the life of the page and is never removed** (`e2e/fixtures.ts:473-485`
   installs `page.route(NOMINATIM_ROUTE, …)`; `grep -rn unroute e2e/` shows no `unroute` for it). Any later
   Nominatim request in that page — the LocationModal's "See places", the directory's geocode — is answered
   with the caller's zip and a fixed 47.6205/−122.3414. I checked: no consumer geocodes after the walk today
   (`grep -rn "location-address-input\|see-places" e2e/*.ts` → `feed-empty-state.e2e.ts:540,542` and
   `places-map-view.e2e.ts:1680,1681`, neither of which is a `finishSignup` page), so this is **latent, not
   live** — but it is a change to every consumer's page context that the report does not declare.
2. **BLOCKING (B1) — the intercept firing is not asserted anywhere, and its failure is invisible.** The new
   docblock states the property as fact: *"THE ADDRESS LOOKUP IS ANSWERED BY THIS FIXTURE, NOT BY THE
   NETWORK … No typed ZIP, no fallback notice, **no network**."* Nothing observes the handler. A route that
   matches zero requests looks exactly like a healthy one, and the address it types is **real**
   (`e2e/fixtures.ts:33` — `'1200 1st Ave S, Seattle'`), so a failed intercept is not self-refuting:
   - with network, Nominatim's real answer for that address carries `house_number` → `zipFromResult`
     accepts it → **and that postcode is a seeded gazetteer zip** (`supabase/migrations/0012_zip_radius.sql:93`
     `('98104', …)`, `:111` `('98134', …)`) → `handleAreaFinish`'s `validateHomeZip` passes
     (`src/pages/OnboardingPage.tsx:941`) → the walk lands on the ending card **with the wrong zip**;
   - without network, the lookup settles null → the fallback reveals → the fixture (which no longer types a
     zip) hangs at `firstRun-finish-card.waitFor({ timeout: 30_000 })` — a 30s timeout that says nothing
     about the real cause.
   **No assertion in the suite pins the zip the walk wrote.** `zip-radius.e2e.ts:105` asserts only
   `hasText: /\d+ mi\b/` — any number passes, and 98104→98107 (~5 mi) is inside its 20-mi radius either way;
   `feed-empty-state.e2e.ts:296` uses the marker zip and asserts ping/comment failures, which are
   zip-independent; `auth.setup.ts` masks it further by PATCHing `home_zip=98107` via REST afterwards.
   So this is the answer to "what can break that the tests cannot see": **the slice traded a deliberate
   non-determinism guard for a stub whose zero-match outcome is consumed as health** — D-030's shape
   ("zero and `null` are findings, never passes"), in the file this slice rewrote.
   *Fix shape (do not re-argue, just instrument): count the intercepted requests and assert ≥1 before the
   Finish tap, or keep an address that cannot resolve as a second, cheap tripwire.*
3. **A one-frame divergence introduced by dropping `session !== null`.** The old `runOver` required
   `session !== null`; `resolveCard`'s state has no session term (`src/pages/OnboardingPage.tsx:599-602`
   passes only `hasProfile/hasKids/hasZip`). On sign-out, `session` and `profile` clear in different effects
   (`src/lib/db.ts:198-218` vs `:276-285`), so for one render `profile` can still be non-null while
   `session` is null: the old page fell through toward the area card, the new one may paint `'finish'`.
   Transient and route-guarded; no test covers it. Worth one sentence in the report, not a fix.

---

## 5. The stale docs left on purpose — and whether §5 is itself an under-declared boundary

**The ones the brief called "confirmed still stale work" are genuinely fixed** (read, not trusted):
`docs/product/onboarding-first-run.md:110-113` now presents v1's card as superseded and quotes
`src/lib/firstRunTour.ts`'s shipping words; `:275`'s row is corrected in place; `V28-BATCH-SUMMARY.md:26-30`
are now a four-card table plus a "row that moved" note; `plan.md:118-129` (facts 8/9/10/11) are updated in
place and keep what was true when written.

**Leaving the rest is defensible** — and each is declared with a reason — with three boundary problems:

- **`plan.md:514-527` is the wrong pointer** (`plan.md:544-559` holds the wire-or-delete list; `:520` the
  slice header). A boundary declared with the wrong coordinates is a boundary the next reader cannot find —
  the class the brief's own re-measure paragraph exists for. (Non-blocking, WRONG NUMBER.)
- **The §5 list omits the counts this slice itself made stale** (`17 specs/consumers`, §1 above) while
  adding a fresh instance of it at `e2e/fixtures.ts:440`. "The slice that deletes something owns what it
  orphans" applies to numbers too.
- **`V28-BATCH-SUMMARY.md:146-151`** now reads *"Two copy defects found by reading the screen (real, small —
  both fixed since…)"* and then quotes them in the present tense (*"the app advises…"*, *"the name card
  says…"*). The status is right and the tense is stale — a reader can take the quote as current. I judge the
  reason given ("their status is a product question") **insufficient for a tense fix that costs one word**;
  this is my weakest disagreement with §5 and I file it as non-blocking.
- The packet's §5 table row `:226` ("the product owner completed all five cards plus the finish card") is
  declared in §5.2, but it sits in a table whose **neighbour rows were re-measured to v2** (`:224`, `:225`
  now carry dates and v1 context). The reason holds; the row would hold it better if it said so, as `:225`
  does. Non-blocking.

---

## 6. D-025 / D-030 hunt

**D-030 (empty/null read as health) — 2 live instances:**
1. **The `finishSignup` stub's match count** (B1 above) — the strongest instance in the diff.
2. **`scripts/guards/lib-sibling-guard.sh`** has no zero-count rule: with `checked=0` it prints
   `ok — all 0 non-exempt module(s) have a sibling .test.ts` and exits **PASS**. The report noticed this and
   used it correctly to falsify the brief's guard expectation ("it has no zero-count rule") — honest — but it
   remains a live D-030 hole in the guard that sits nearest this slice's deletions. **Not this slice's to
   fix** (no guard was changed here; 8b owns guards) → residual risk, recorded.
3. Mild: **`resolveCard`'s defaulted `skippedCards = []`** (`src/lib/firstRun.ts:142`) turns an *omitted*
   argument into the decision "nothing was skipped". The page always passes it, so this is a hazard, not a
   defect — but it is "a measurement that did not happen, read as a fact".

**D-025 (a claim the mechanism does not support) — 3 instances, all prose, all new:**
1. `e2e/avatar.e2e.ts:182-183` — "the only browser-level proof that ProfilePage CALLS the predicate rather
   than restating it" (echoed in `src/lib/avatarUrl.test.ts`'s header and the report's §2.1). A restatement
   with the `''` clause passes it. §2 above.
2. `e2e/auth.setup.ts`'s new docblock — *"which is the failure the ledger records three times for specs that
   carried their own locator."* The entry it points at is `.scratch/v28/ledger.md:1345-1348`: *"My
   out-of-scope lines have been wrong the same way three times: e2e/fixtures.ts was in NO slice's scope
   (defect #7); auth.setup.ts was unnamed in 4b; onboarding-resume was unnamed in 5."* That is **three** —
   but they are *briefs forgetting a spec the change broke*, and one of the three (`fixtures.ts`) is the
   shared helper, not a spec, and none of the three is about "carrying its own locator".
   `grep -rn "its own copy\|carried its own\|their own locator" .scratch/v28/ledger.md` → 0 hits.
3. `docs/product/onboarding-first-run.md:225` — *"Does the whole app still work? | Yes — 175 end-to-end
   browser tests across 60 files, measured 2026-10-02 (`npx playwright test --list`)."* A `--list` enumerates
   tests; it cannot support "the whole app still works", and the slice's own report admits
   `e2e/places.e2e.ts:2759` was not run. The **175/60** number is right (I re-ran the enumeration lane's
   input — see §7); the *instrument attached to the claim* is the defect. Fix: move the `--list` reference to
   the count and say plainly which lane ran green.

Also checked and **clean**: `avatarUrl.ts`'s new *"nothing in src/App.tsx tests avatar presence any more
(`grep -n avatar_url src/App.tsx` → zero hits)"* — measured 0 ✓; `plan.md` fact 9's *"`src/App.tsx:167`"* —
`grep -n "nextUnfinishedCard({" src/App.tsx` → `167` ✓; the packet's and summary's *"the four measurements
every line has to pass"* — `src/lib/firstRunTour.ts:23` ✓; `OnboardingPage.tsx:1017-1023`'s *"500 ms
debounce"* — `const AREA_ADDRESS_LOOKUP_DEBOUNCE_MS = 500` (`:52`) ✓; `PlaceMap.tsx:389-390`'s corrected
claim against the effect it describes (`grep -n "markers.length === 0) return" src/components/PlaceMap.tsx`
→ `536`, and `:534-536` is the `L.layerGroup` marker effect) ✓.

---

## 7. Report honesty — the numbers that reconcile, and the ones that do not

**Verified true (re-measured by me):**
- `23 files changed, +606 / −514` ✓ (`git diff --stat 8d1170d..ae578c2`), and `18 commits` ✓.
- The test-count arithmetic ✓ — counting the diff's own `it(` lines: `db-v2.test.ts` **5**, `onboarding.test.ts`
  **2**, `geocode.test.ts` **8**, `firstRun.test.ts` **+8** → 2068 − 15 + 8 = **2061** ✓.
- `V28-BATCH-SUMMARY.md`'s stats, dated to `1effd0a`: `git rev-list --count e2570c9..1effd0a` → **361**,
  `git diff --shortstat e2570c9..1effd0a` → **249 files, +56422 / −2443** ✓ — exact.
- The grep proofs for the deletions ✓ (§2), the `skipLabel` count **24** ✓, the `first-run-photo-card|
  photoCardDone` count **0** ✓, `MARKER_ADDRESS` **0** ✓, `existing radius predicate` **0** ✓.
- The mutation run's *failure* is real and its cited line was real **at the commit it was run**
  (`git show 508d656:e2e/avatar.e2e.ts` → line `199` is
  `await expect(page.getByTestId('avatar-photo')).toHaveCount(0)`, matching the quoted `199:50`), and
  `git log --oneline 508d656..ae578c2 -- src/pages/ProfilePage.tsx` → **empty**, so the conclusion still
  holds for the shipped code. The cited line no longer exists (it is `:203` now, after `3eabe2c` added 4
  lines above it). **Non-blocking WRONG NUMBER** — and it is exactly the drift the report's own §0 exists to catch.

**Does not reconcile — BLOCKING (B3):** the report's `e2e/auth.setup.ts` proof block is labelled **"raw:"**
and reads `Running 13 tests using 1 worker … ✓ 7–13 signup-zip-fallback.e2e.ts (all six legs) … 13 passed
(53.5s)`, over the command it records in its own totals table (`npx playwright test onboarding-resume
signup-zip-fallback no-zip-notice avatar`). Measured:
`npx playwright test --list onboarding-resume signup-zip-fallback no-zip-notice avatar` →
**`Total: 14 tests in 6 files`**, including `avatar-square.e2e.ts:71` — which the block does not list — and
`signup-zip-fallback` has **7** `test(` legs (`:154, :237, :293, :380, :467, :582, :643`), not "six".
The 13 fits a **different** command (`npx playwright test --list avatar.e2e.ts` → `3 tests in 2 files`;
`onboarding-resume … avatar.e2e.ts` = 13), so the block is a compressed rendering of a different run,
presented as raw output of the named one. The substantive result (the setup walk is green; both of the
brief's mandatory specs ran) is **not** in doubt — but a block labelled raw that contradicts its own
command cannot be reproduced, and "36 test instances green" inherits the off-by-one. Re-run and paste, or
correct the command; the work does not need redoing.

**Minor number slips (non-blocking, grouped):**
- Report §4 acceptance row 1: *"2 hits total, both retirement notes"* — measured for that exact command,
  `grep -rn 'missingProfileItems\|MissingProfileItem\|needsOnboarding' src/ e2e/ scripts/ | wc -l` → **3**
  (and §2.1's own counts are 1 + 2 = 3).
- Report §5.3's pointer `plan.md:514-527` (§5 above).
- Report §2.2 item 8's *"`:1017` before this slice's own comment"* — the pre-edit line was **1012**
  (`git show 8d1170d:src/pages/OnboardingPage.tsx | grep -n "setZipFallbackShown(result.zip"`), the post-edit
  line is **1024** ✓; `1017` is where the new comment begins.
- Report §0 item: "the third drifted shape" (§1, Deviation A).

---

## 8. Requirements traceability (the brief's own acceptance criteria)

| # | Criterion | Ruling | Evidence |
|---|---|---|---|
| 1 | Every symbol called somewhere or deleted, with its test, and the rg output shown | **MET** (the "with its test" half is met by *replacement*, not presence: 15 tests deleted, 8 added, and the wire gets a new e2e; the `hasAvatarUrl` call is not provable, §2) | greps re-run by me, §2 |
| 2 | Every stale claim corrected or reported with a reason | **MET** — the brief's named stale work is verifiably fixed; the leftovers are declared in §5 with reasons; three boundary slips (§5) | read at `ae578c2` |
| 3 | `resolveCard` is a pure function with a sibling test | **MET** | `src/lib/firstRun.ts:96-151`, `src/lib/firstRun.test.ts:217-275` (8 legs) |
| 4 | `npm run verify` exits 0 | **Reported, not independently re-run** (out of my lane). The tails are specific (exit 0, 71 files / 2061 tests, 81 warnings / 0 errors) and the test delta reconciles with the diff | §7 |

**Also judged as asked:** the five wire-or-delete symbols are each *called or deleted* (§2) ✓; the diff
changes no product behaviour outside the brief's list except the two declared deviations and the
sign-out one-frame divergence (§4.3); no protected file was touched (consistent with the diff's file list);
and the slice did **not** sweep trailing newlines (8b's) — `git diff 8d1170d..ae578c2 --stat` shows 23
files, none of them a whitespace-only rewrite.

---

## 9. Findings

**Blocking**
- **B1 [MECHANISM / D-030] `e2e/fixtures.ts:473-485`** (with `:26`, `:428-440`) — the intercept has no
  tripwire and its failure is invisible: the address it types is real (`:32`), the real answer's postcode is
  seeded (`supabase/migrations/0012_zip_radius.sql:93,111`) so `validateHomeZip` passes
  (`src/pages/OnboardingPage.tsx:941`), and **no** consumer's assertion pins the zip the walk wrote
  (`e2e/zip-radius.e2e.ts:115` asserts only `/\d+ mi\b/`; `e2e/feed-empty-state.e2e.ts:296` asserts
  zip-independent failures; `e2e/auth.setup.ts` masks it via the REST PATCH). The docblock still states
  "no network" as fact. *Instrument it: count the matches and assert ≥1.*
- **B2 [MECHANISM / build law one-copy rule] `e2e/fixtures.ts:26` vs `e2e/signup-zip-fallback.e2e.ts:98`** —
  a byte-identical second copy of `NOMINATIM_ROUTE`, added by a slice whose stated justification is
  anti-duplication, in a directory whose shared module (imported by every spec) already exists.
- **B3 [FALSE CLAIM / verification gate] report §3's "raw:" block** — `13 tests` / `six legs` / "four files"
  cannot be the output of the command recorded beside it (`--list` → **14 tests in 6 files**, and
  `signup-zip-fallback` has 7 legs). Re-run and paste the real tail, or fix the command label.

**Non-blocking**
- `e2e/avatar.e2e.ts:182-183`, `src/lib/avatarUrl.test.ts:2-15`, report §2.1 — "proves ProfilePage CALLS the
  predicate" is not a thing a test can prove; a faithful restatement passes it. [FALSE CLAIM / D-025]
- `docs/product/onboarding-first-run.md:225` — `--list` attached to "the whole app still works". [D-025]
- `e2e/auth.setup.ts` docblock — "the ledger records three times for specs that carried their own locator";
  the ledger entry (`.scratch/v28/ledger.md:1345-1348`) records three briefs' scope lines, one of them a
  helper module. [FALSE CLAIM about a record / D-025]
- `report §1 / e2e/fixtures.ts:440` — "17 consumers/specs" is now 18 (`e2e/auth.setup.ts:85`). [WRONG NUMBER]
- `e2e/fixtures.ts:473` — the stub is page-scoped and never unrouted; a later geocode in the same page is
  answered by it. Latent today, undeclared. [UNDER-DECLARED BOUNDARY]
- `src/lib/firstRun.ts:153` — the `progressLabel` JSDoc was joined onto its `export function` line by
  `41df0f4`, an unrelated line the slice had no reason to touch (no formatter in `verify` catches it).
  [cosmetic churn]
- `src/pages/OnboardingPage.tsx:599-602` — `resolveCard` drops the `session !== null` term the old `runOver`
  carried; one-frame divergence on sign-out. [UNDER-DECLARED BOUNDARY, transient]
- `src/lib/firstRun.ts:142` — the defaulted `skippedCards = []` reads an omitted argument as "nothing was
  skipped". [mild D-030]
- `e2e/avatar.e2e.ts:199:50` (report §2.1) — a line that no longer exists; the run predates `3eabe2c`.
  [WRONG NUMBER]
- Report §4 row 1 ("2 hits" for a 3-hit grep), §5.3's `plan.md:514-527`, §2.2 item 8's `:1017`, §0's "third
  drifted shape". [WRONG NUMBER, grouped]
- `V28-BATCH-SUMMARY.md:146-151` quotes both copy defects in the present tense under a "both fixed since"
  header; the packet's §5 row `:226` states a v1 fact in a re-measured table without the date its neighbour
  rows carry. [UNDER-DECLARED BOUNDARY, minor]
- `docs/agents/code-structure.md`-adjacent residual: `scripts/guards/lib-sibling-guard.sh` passes at
  `checked=0`. Not this slice's to fix (8b owns guards); recorded. [D-030, residual]
- Deliberate simplification recorded, not returned: none new (the report adds no `ponytail:`-style ceiling
  note; its §5 "noticed and not fixed" list plays that role and I reviewed it as such).

**Recommended next action (one line):** put a tripwire on the `finishSignup` intercept and single-source
`NOMINATIM_ROUTE` from `e2e/fixtures.ts`, re-run the auth.setup lane to paste a real tail, and correct the
handful of numbers above — the product-code half of this slice I would sign off as-is.
