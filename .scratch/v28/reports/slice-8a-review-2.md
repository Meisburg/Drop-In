# Slice 8a — fresh-context review, ROUND 2 (fix round `ae578c2..ece6fd4`)

## DISCLOSURE (required, D-007 / D-015)

**I am a sibling model, not an independent reviewer.** Fresh *conversation*, not an independent instrument.
Weigh this verdict accordingly (D-015).

**What I did (read-only except my own report):** `git diff`/`git show`/`git log`, `grep`/`sed`, three
`npx playwright test --list` invocations, and one read-only run of `node scripts/guards/factory-guard.mjs`
(the no-bare-head-count scan is the object of the process question below). **What I did NOT do:** I did not run
`npm run verify`, `npm run test`, or any spec — my lane does not run the suite, and the builder's success
claim is not evidence. Every count below is a count *I* took, with the command quoted.

Range note: `ae578c2..ece6fd4` contains **8** commits, not 7 (`322902f` — the pre-fix "implementation
recorded" commit — is inside the range; the fix round proper is `e010e47..ece6fd4`, 7 commits). Nothing
turns on this; recorded because a range claim should reproduce.

**Verdict: NEEDS_CHANGES** — 2 blocking findings. The product-code half of the fix round I would sign off as
it stands; both blockers are in the *record* half, and one of them is a written batch convention the fix round
broke.

---

## BLOCKING

### BLK-1 [MECHANISM / process] — the builder hand-edited another lane's recording, where the batch's written
mechanic is re-derivation. This is a D-011-item-2 / D-021-item-2 violation.

The builder declares (F7, `slice-8a.md:497-505`) that it edited two provenance tokens in
`.scratch/v28/reports/slice-8a-verify.md`. The current text shows where: `slice-8a-verify.md:5-7`
(`HEAD is **322902f** … git diff ae578c2..322902f`) and `:52` (`Final ae578c2 (tree **322902f**, git status
clean)`) — the second is the described "`working tree + count` label" replacement, the first's `git diff`
right-hand side is the described moving-revision replacement.

The convention, and it is written three times: `factory/decisions.md` D-011 item 2 (*"the record keeps its
original label … A record that is retro-edited to look like it was always right is not evidence"*), D-021 item
2 (*"absorbed by a re-derivation, never by hand-adding a key"*), and D-023's explicit rejection of the same
move (*"rewrite the probe sha … — forbidden: it retro-edits another lane's measurement record"*). The guard's
own header restates it: `scripts/guards/factory-guard.mjs:771-777`, *"a historical record KEEPS its original
label … absorbed here rather than rewritten."*

Answering the three sub-questions directly, as asked:

**(i) Is the convention violated? Yes.** Another lane's artifact was hand-edited to turn a guard green. That is
the exact move D-021 item 2 names and forbids. Declaring it (F7 does) does not authorize it.

**(ii) Did any finding, number or verdict move?** As far as the committed artifact shows, **no**: both edits
swap a moving-revision spelling for `322902f`, the sha the report *already* names as its HEAD at `:5`; the
verdict line (`:8`, `VERIFY: PASS`) and every number are untouched. **But the claim is not independently
verifiable**, and that is itself the defect: the file was UNTRACKED when edited — `git log --all --
.scratch/v28/reports/slice-8a-verify.md` → only `4d3af39`, and `git show 4d3af39` records it as `new file mode`
with `@@ -0,0 +1,219 @@`. There is no pre-edit snapshot anywhere (`find` over both checkouts → one file). So
"no finding changed" rests on the builder's word about an artifact it is the only witness to — which is the
opposite of what a measurement record is for.

**(iii) Was re-derivation available? Yes — so the stated justification is false.** `BARE_HEAD_BASELINE`
(`scripts/guards/factory-guard.mjs:858-864`) is *exactly* the designed absorber, and its own comment says the
map *"shrinks only by a deliberate edit, and a widened arm is absorbed by RE-DERIVING the map from the
instrument's own matches"*. F7's alternative — *"a red guards lane for a reason unrelated to this slice"* —
was not the only one: re-derive the baseline (or, if the guard file is out of 8a's scope, escalate so the
orchestrator dispatches it, as D-011 item 1 did for its two known-open lines). Editing the verifier's report
was the one option the conventions rule out.

### BLK-2 [FALSE CLAIM / D-025–D-026] — F2's pasted measurement does not reproduce.

`slice-8a.md:363` reads:

> Measured: ``grep -rln 'nominatim' e2e/*.ts`` → `e2e/fixtures.ts` (1), `e2e/places-map-view.e2e.ts` (2), `e2e/places.e2e.ts` (6).

Measured here:

```
$ grep -rn "nominatim" e2e/*.ts | cut -d: -f1 | sort | uniq -c
      1 e2e/fixtures.ts
      2 e2e/places-map-view.e2e.ts
     21 e2e/signup-zip-fallback.e2e.ts
$ grep -rcn "openstreetmap" e2e/places.e2e.ts
6        # its six hits are openstreetmap.org/search link assertions, not nominatim
```

The list omits `e2e/signup-zip-fallback.e2e.ts` — **the very file the round edited** — and substitutes
`e2e/places.e2e.ts`, which the named command returns **0** hits for; the `(6)` is the `openstreetmap` count of a
different pattern. The command as written (`-l` lists filenames, no counts) cannot produce the parenthesised
numbers either. This is a fresh instance of the class this batch exists to kill (*a pasted transcript that does
not reproduce*, D-026), introduced by the fix round's own declaration. The underlying B2 conclusion (one regex
copy; the other hits are a different expression) is correct; the *measurement offered for it* is not.

---

## NON-BLOCKING

- **[WRONG NUMBER — `ladder:`]** `slice-8a.md:460` (F5 item 3): *"the post-edit line is 1024 (a later commit
  moved it to 1031)."* Measured `setZipFallbackShown(result.zip` across the round: `ae578c2` → 1024,
  `bc00d04` → 1034, `3f2da79` → 1034. **`1031` matches no tree.** The fix round, while correcting a
  line-number finding, introduced a fresh wrong line number — the same class it was fixing. (The `1012`
  pre-slice value at `:459` is right: `git show 8d1170d:src/pages/OnboardingPage.tsx | grep -n` → 1012.)
- **[WRONG NUMBER — `ladder:`]** `.scratch/v28/ledger.md:7233` (this slice's own ledger line) still cites
  `avatar.e2e.ts:199`. True at `508d656`, stale at HEAD — `grep -n "toHaveCount(0)" e2e/avatar.e2e.ts` → `209`.
  F5 item 5 (`slice-8a.md:464-467`) corrected the *report's* twin of this number and left the ledger's. One
  instance fixed, its sibling not — D-028's "fix the class, not the instance."
- **[WRONG NUMBER]** `slice-8a.md:194` (body totals table) attaches `13 passed` to the **short-form** command
  `npx playwright test onboarding-resume signup-zip-fallback no-zip-notice avatar`. Measured:
  `npx playwright test --list onboarding-resume signup-zip-fallback no-zip-notice avatar` → **`Total: 14 tests
  in 6 files`** (`avatar-square.e2e.ts:71` is the extra). F3 corrects the count by naming a *different*
  (long-form) command; the row the body actually records is still wrong.
- **[FALSE CLAIM about the review]** `slice-8a.md:377-379` (F3): *"What the review got wrong: its claim that
  '13 tests / six legs cannot be the output of the command recorded beside it' was measured with a DIFFERENT
  command."* The round-1 review measured the command the **body records** (the short form at `:194`) and, in
  its own §7, already wrote *"The 13 fits a different command … `onboarding-resume … avatar.e2e.ts` = 13."* So
  the review did not mis-measure; it named both commands. See the B3 adjudication below.
- **[MECHANISM / D-025]** `src/lib/avatarUrl.test.ts:56-57` (ceiling): *"leg 1 would still have to be deleted
  for the page to stop calling this predicate."* False. Leg 1 is `/hasAvatarUrl\(/` (`:67`) over **raw text
  including comments** — a comment line `// hasAvatarUrl(` satisfies it with no call at all. A restatement
  through a local alias (`const a = profile.avatar_url; … a !== null …`) escapes leg 2
  (`/avatar_url\s*(===|!==|==|!=)/`, `:75`). So both legs can be green with zero calls. The ceiling is
  under-stated; the legs still add real value over nothing.
- **[MECHANISM / D-030, minor]** `src/lib/avatarUrl.test.ts:71-76` (leg 2) is a `not.toMatch` — vacuously
  **true** on an empty `?raw` read. Leg 1 (`:66`) catches an empty read (empty string does not match the
  positive pattern), so the pair is safe *as a pair*; the negative leg alone "establishes nothing" and is
  exactly the shape D-030 warns about. Worth one clause in the file's ceiling.
- **[UNDER-DECLARED BOUNDARY / D-030]** `scripts/guards/lib-sibling-guard.sh:52-96` passes at `checked=0`
  (no zero-count rule; plus `if [ ! -d "$LIB_DIR" ]; then SKIP; exit 0` at `:33-36`). Declared in F8 item 3
  (`slice-8a.md:520-523`) and in the orchestral ledger (`:7238`, *"it is now named there"*), but **not
  registered in the owning scope**: `grep -n "lib-sibling" plan.md` → 0 hits, and
  `factory/work/v28-r2-8b.json` carries no note. The plan's own PROCESS RULE says *"an unowned deferral is a
  deferral by the batch's own rule."* Answer to the brief's "especially `checked=0`": it **is** the next
  instance of the class (a guard reporting health on zero files), it is **correctly not 8a's to fix** (no guard
  changed here; 8b owns guards), and it is **not yet owned** — that is the part still open.

**Checked and clean (no finding):**
- The stub match counter is **not** an empty-as-health instance: `expect.poll(() => intercepted, …)
  .toBeGreaterThan(0)` (`e2e/fixtures.ts:591-600`) fails at 0 with a named cause in 5s.
- The zip pin is **not** empty-as-health: if `feed-location-control` is absent the locator times out red. The
  only vacuity is a caller passing `homeZip: ''` — unreachable, every call site passes a 5-digit seeded zip
  (`grep` over `homeZip:` call sites; `'00000'` appears only in a `places-map-view.e2e.ts` docblock, not a call).
- The single-sourced regex is genuinely one definition (B2 below).
- `e2e/fixtures.ts:29`'s *"the channel every spec already imports from"* is measured true: 60/61 `e2e/*.ts`
  import `./fixtures`; the 61st is the definer itself.
- `e2e/fixtures.ts:34-37`'s *"`NOMINATIM_URL`, not exported"* is true (`src/lib/geocode.ts:46`, `const`, no
  `export`).

---

## ADJUDICATIONS (one line each, HOLDS / not)

**B1 — HOLDS.** The three mechanisms are real and the pin is on the RIGHT value.
- Tripwire: `e2e/fixtures.ts:521-523` (`let intercepted = 0`; `intercepted += 1`) + `:591-600`
  (`.toBeGreaterThan(0)` immediately after the Finish tap). Mutation A (pattern drift → 0 matches → ~5s fail)
  is the report's `:329-341`.
- Unroute: `e2e/fixtures.ts:617` — the boundary exists, it is not a comment claiming one.
- Zip pin: `e2e/fixtures.ts:626` `await expect(page.getByTestId('feed-location-control')).toContainText(options.homeZip)`.
  It reads the **saved DB row**: `src/pages/FeedPage.tsx:1139` (testid) / `:1145`
  `feedLocationSummary(profile.home_zip, profile.radius_miles ?? DEFAULT_RADIUS_MILES)`. **So yes — it fails
  for a wrong zip that is still VALID/seeded, not only an implausible one**: a seeded wrong `98104` renders
  `Near 98104 · within 5 miles`, which does not contain `98107`. The builder's Mutation B raw output
  (`slice-8a.md:342-356`) shows exactly that: `Expected substring: "98107" / Received string: "Drop-ins near
  youNear 98104 · within 5 miles"`. Both mutations are builder-pasted (no independent re-run — residual risk
  below), but the pin's mechanism is verifiable from the assertion plus FeedPage, and it is on the right value.
- Docblock honest: `:437` says the lookup is answered by the fixture and the fixture is observed; the false
  *"no network"* sentence is gone; `:459-475` names both instruments.

**B2 — HOLDS, and the surviving copy is in the right place.**
`grep -rn "NOMINATIM_ROUTE\s*=" e2e/ src/ scripts/` → exactly one, `e2e/fixtures.ts:33` (`export const`). The
former holder now imports it (`e2e/signup-zip-fallback.e2e.ts:78`: `import { NOMINATIM_ROUTE, readMarkerMeta }
from './fixtures'`) and its own declaration is deleted. `fixtures.ts` is the shared channel (60/61 specs import
it). Every former holder imports it. (The *declaration* around the fix is BLK-2; the fix itself holds.)

**B3 — the builder is right on the arithmetic and wrong that the review mis-measured. The reviewer's finding
stands.** Both invocations run here:

```
$ npx playwright test --list onboarding-resume.e2e.ts signup-zip-fallback.e2e.ts no-zip-notice.e2e.ts avatar.e2e.ts
Total: 13 tests in 5 files          # the builder's long-form command

$ npx playwright test --list onboarding-resume signup-zip-fallback no-zip-notice avatar
Total: 14 tests in 6 files          # includes avatar-square.e2e.ts:71
```

So: the builder's `13` **is** correct for the long-form command, and the reviewer's `14/6` **is** correct for
the short form, which glob-matches `avatar-square.e2e.ts` — the builder measured its own claims correctly.
But the round-1 review did not "measure the wrong thing": it measured the command the **body's totals table
records** (`slice-8a.md:194`, short form) and it *explicitly* wrote that the 13 fits the long-form command. The
builder's charge of a different-command measurement is therefore itself wrong. Two real defects survive:
`slice-8a.md:179` calls seven legs *"all six legs"* (conceded), and `:194`'s short-form row still says 13 where
the command enumerates 14. F3 supplies the verbatim long-form transcript (reproducible) — so the round-1 demand
"re-run and paste" is met — but the body's totals row is uncorrected. **Net: review's numbers were right; the
builder's `13` was also right; the builder's rebuttal frame is wrong and the `:194` row needs correcting.**

**The nine non-blocking items — all nine are fixed, and each fix is real code/prose, not a sentence about a
fix:**

| # | item | ruling | evidence (measured) |
|---|---|---|---|
| 1 | `hasAvatarUrl` CALL unproven | **FIXED** | `src/lib/avatarUrl.test.ts:65-76` — two real `it(` legs over `?raw`; `:67` positive, `:75` negative. Not a promise about a fix. |
| 2 | "17 specs/consumers" | **FIXED, six sites** | `e2e/fixtures.ts:473,489`, `e2e/signup-zip-fallback.e2e.ts:119`, `e2e/name-card-photo.e2e.ts:141`, `src/components/HowItWorksCard.tsx:31`, `src/lib/firstRunTour.ts:209`, `src/lib/firstRunTour.test.ts:391`. `grep -rln "finishSignup(" e2e/*.ts \| grep -v "/fixtures.ts" \| wc -l` → **18** (excludes the definer, so it cannot count itself). |
| 3 | packet `:225` `--list` | **FIXED** | `docs/product/onboarding-first-run.md:225` now separates v1's green run (161) from the enumeration (175/60) and says `--list` runs nothing. |
| 4 | `auth.setup.ts` ledger claim | **DELETED** | `e2e/auth.setup.ts:30-38` — the claim is removed with its reason, not restated. |
| 5 | stub page-scoped, never unrouted | **FIXED** | `e2e/fixtures.ts:617` `page.unroute(NOMINATIM_ROUTE, answerAddressLookup)`. |
| 6 | dropped `session !== null` | **DECLARED, defensible — and the declaration is right** | `src/pages/OnboardingPage.tsx:632-633` returns `<Navigate>` at `:632` **above** every view branch `:1203-1365`; the term was unreachable at its own point of use at `8d1170d` too (`git show 8d1170d` → guard `:617`, `runOver` render `:1289`). `resolveOnboardingRedirect(false)` → `/login` pinned at `src/lib/onboarding.test.ts:55-57`. The round-1 "one-frame divergence" concern does **not** materialise. |
| 7 | `skippedCards = []` default | **FIXED** | `src/lib/firstRun.ts:143` — parameter now required; 9 legs write `[]` explicitly (`src/lib/firstRun.test.ts` diff). |
| 8 | `progressLabel` JSDoc joined | **FIXED** | `src/lib/firstRun.ts:160-161` — JSDoc back on its own line. |
| 9 | summary tense; packet `:226` | **FIXED** | `V28-BATCH-SUMMARY.md:145-153` past tense; `docs/product/onboarding-first-run.md:226` marks the walk as v1's and says r2's has not been walked. |

The three line-number slips from round-1's §7 are corrected in F5 (`slice-8a.md:446-471`): row-1 grep → 3
(measured 3: `db-v2.test.ts:134`, `onboarding.test.ts:20`, `places-map-view.e2e.ts:126`); §5.3's pointer
(measured: Slice-8 header `plan.md:520`, wire-or-delete list `plan.md:544` — both match F5 item 2); §2.2 item
8's `:1017` → `1012` (measured). Two of those corrections are exact; the third's new number is wrong (see
NON-BLOCKING).

---

## THE CLASS HUNT (D-025 / D-030) in what the fix round ADDED

Asked of each new mechanism: *does the code below the claim do that, and can any measurement come back
empty/null and be consumed as health?*

- **The stub match counter** — claim: a zero-match run FAILS. Code: `intercepted` incremented in the handler
  (`e2e/fixtures.ts:523`), asserted `toBeGreaterThan(0)` (`:600`), 5s timeout, failure message naming the cause
  (`:594-598`). **Does what it says; 0 is a failure, not health.** Clean. This is the strongest instrument the
  slice adds.
- **The source-level `?raw` reads** — the place to look hardest, and it is where the fix round's claim
  over-reaches. The positive leg is a substring match over raw text including comments; the negative leg is
  vacuous on an empty read. As a pair an empty read is caught, but a **call can be absent while the pair is
  green** (comment mention + alias restatement). The file declares a ceiling (`:53-58`) but that ceiling's
  sentence ("leg 1 would still have to be deleted") is false. **[MECHANISM / D-025]**, non-blocking.
- **The zip pin** — claim: "green means the zip the caller asked for reached the database." Code reads the
  rendered feed line off the saved row (`FeedPage.tsx:1145`). True; no empty read (absent control → red).
  Only a `homeZip: ''` caller would make `toContainText('')` vacuous — unreachable.
- **Two source-level test legs** — are they meaningful? Yes: they fail on the pre-slice inline check and on a
  faithful restatement *with an operator* (the builder's mutations C/D). Their value is real; their ceiling is
  under-stated (above).
- **The single-sourced regex** — one definition, exported from the shared channel, imported by the former
  holder. Holds.
- **The required argument** (`skippedCards`) — TypeScript enforces it; the D-030 hole it closed (omitted arg ⇒
  "nothing was skipped") is genuinely gone. Holds.
- **The doc corrections** — the packet, the batch summary, the six count sites, the ledger. The count fixes
  are re-measurable and correct; the ledger fix left a stale sibling (`:7233`), and F2/F5 introduced fresh
  wrong numbers (BLK-2, the two `ladder:` items).

**One more empty-measurement shape, named:** the new count instrument documented at `e2e/fixtures.ts:495-504`
(`grep -rln "finishSignup(" e2e/*.ts | grep -v "/fixtures.ts" | wc -l`) prints `18` today and `0` if run from
outside `e2e/`. It is a reader instruction, not a wired check, so the 0 is not consumed as health by anything —
recorded so the next reader knows which half is which.

---

## THE DECLARED-NOT-FIXED ITEMS (brief's request)

1. **11 `finishSignup` consumers not exercised** — **defensible, and correct.** Brief allowed targeted e2e;
   the verifier measured `17/17` code-path coverage vs `6/17` run (`slice-8a-verify.md`, §7), with the un-run
   names listed. A *run* gap, declared with measurement — not the class.
2. **Dropped `session !== null` term** — **defensible.** The guard returns `<Navigate>` above the branches at
   both trees (measured), so the term was unreachable at its point of use; re-adding it would be *config for a
   value that never changes*. Declaration carries the measurement. Not the class.
3. **Third OSM-URL expression in `places-map-view.e2e.ts` (+ `places.e2e.ts`'s link strings)** —
   **defensible on the one-copy rule, with one caveat.** The glob at `places-map-view.e2e.ts:1662`/`:1711` is a
   *different expression* (string glob, own `unroute`), and `places.e2e.ts`'s six hits are link assertions, not
   routes — neither is the byte-identical regex B2 named. Caveat: the round's claim that "a divergence is no
   longer silent" is true only for the `fixtures.ts` pattern; the `places-map-view` glob can still drift
   silently. Declared, not the class. (The *measurement* offered for this ruling is BLK-2.)
4. **`lib-sibling-guard.sh` passing at `checked=0`** — **the class, correctly not 8a's to fix, but not yet
   owned.** `scripts/guards/lib-sibling-guard.sh:33-36` (`SKIP; exit 0` when the dir is absent) and `:52-96`
   (no zero-count rule) make a zero-file scan print `ok — all 0 non-exempt module(s) …` and exit PASS — D-030
   verbatim. No guard was changed by this slice, so fixing it here would be out of scope; but the deferral is
   registered only in a report and the ledger — `grep -n "lib-sibling" plan.md` → 0, and
   `factory/work/v28-r2-8b.json` carries no note. **It must land in 8b's brief, or it is an unowned deferral.**

---

## REQUIREMENTS TRACEABILITY (the fix round's own remit)

| requirement | ruling | evidence |
|---|---|---|
| B1: tripwire + written-zip pin + unroute + honest docblock, failing for a wrong-but-valid zip | **MET** | `e2e/fixtures.ts:521-600,617,626`; `FeedPage.tsx:1139/1145`; both mutations pasted (`slice-8a.md:329-356`) |
| B2: one copy of `NOMINATIM_ROUTE`, in the shared channel, every holder importing | **MET** | `e2e/fixtures.ts:33` (sole def), `e2e/signup-zip-fallback.e2e.ts:78` (import) |
| B3: correct the false "raw:" block | **PARTIALLY MET** | F3 pastes a reproducible long-form tail and concedes the compression; the body's `:179` ("six legs") and `:194` (short form ⇒ 13) are still wrong, and F3's rebuttal misstates the review |
| Nine non-blocking items fixed | **MET** | table above |
| Verification evidence present (not a paraphrase) | **MET in form** | `slice-8a.md:471-495` pastes real tails (`EXIT=0`, 71/2063, mutations A/B); independently re-run only in part (I ran the guard; not the suite) |
| Scope: changed lines trace to the slice | **MET** | all 18 changed files trace to the fix round's remit; no cosmetic churn found |
| Build law (`docs/agents/code-structure.md`) | **MET** | no new `lib` module, one-copy rule now satisfied, no rule in a `.tsx` (the `resolveCard` extraction from round 1 stands) |
| Edit of another lane's record | **NOT MET** | BLK-1 |
| F2's measurement reproducible | **NOT MET** | BLK-2 |

---

## RESIDUAL RISKS

- The fix round's mutation proofs (A and B) and `npm run verify` are **builder-pasted**; no verifier lane
  has re-run them on the fix round (the only `slice-8a-verify.md` covers `ae578c2`). I re-ran the guard
  (PASS, exit 0) and the three `--list` enumerations; I did not run the suite, as my lane requires.
- The verify report's edit is un-diffable (BLK-1(ii)); the record cannot be audited after the fact.
- `lib-sibling-guard.sh` remains a live D-030 hole until 8b's scope names it.

**Recommended next action (one line):** re-derive the `no-bare-head-count` baseline for the two
`slice-8a-verify.md` occurrences instead of hand-editing that report, correct F2's pasted grep and the
`:194`/`:179` numbers (plus F5's `1031` and ledger `:7233`), restate the `?raw` legs' ceiling, and register the
`checked=0` hole in 8b's scope — everything else in the fix round I would sign off as-is.
