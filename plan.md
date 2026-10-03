# Implementation Plan: V28 r3 — the phone walk's seven items

> Owned by the orchestrator. Written BEFORE any builder dispatch. r2's plan is preserved
> as `plan-v28-r2-backup.md`; **r3 supersedes it for the seven items below and leaves
> every r2 decision it does not name intact.**
>
> The default slice gate is **`npm run verify`** (build + test + lint + a11y:focus +
> steering-lint + guards). Anything extra is pinned per slice.

**Bottom line:** a phone walk of the Vercel preview produced **seven product items**. Six are
small and two of them **block publication**. This plan slices all seven, blockers first, with
acceptance criteria and a verification command each — **before any builder is dispatched**,
which is the human's explicit instruction.

- **Base:** `fac3c3d` on branch `Meisburg/onboarding` (working tree clean; nothing pushed to
  production; production is still V27)
- **Gate measured this turn, not remembered:** `npm run verify` → **exit 0**,
  **71 test files / 2067 tests passed**, **81 lint warnings / 0 errors**,
  `AGENTS.md` 1788 words against the 1800 ceiling, **GUARDS: PASS** (factory-guard checker:
  **185 checks passed**). Baseline that must not regress: **71 / 2067 / 81 / 0**.
- **Seven items, three coupled:** items 1–3 all touch the first-run flow and are sequenced
  as **one track** (§4), not three independent slices.

---

## Goal

The app a parent meets on a phone stops showing test data, stops claiming a notification
capability it does not have, puts "I'm going" where a decision is actually made, gives
set-location two buttons that do what they say, and replaces the first-run quiz-and-lecture
ending with navigation arrows, no "You're all set" screen, and lightboxed tooltips.

---

## 1. What this revision is

Seven items, **all from the human**, all on the Vercel preview of this branch, all with
screenshots. None is started. The outgoing coordinator recorded them in
`task-state.md` and in the batch ledger rather than planning them; this plan is that step.

| # | Item | Size | Blocks publication? |
|---|---|---|---|
| 4 | Remove the three fake e2e drop-ins | data cleanup | 🔴 **YES** |
| 6 | Notifications are genuinely broken | code + possibly a secret | 🔴 **YES** |
| 5 | "I'm going" belongs below the event info | small UI move | no |
| 7 | Set-location needs two buttons, not three | small, **two entry points** | no |
| 1 | First-run navigation arrows | **riskiest** — touches `saving` semantics | no |
| 2 | Delete the "You're all set" screen | coupled with 1 and 3 | no |
| 3 | "How Drop In works" → lightboxed tooltips | guarded copy surface | no |

---

## 2. Re-measurement of the handover (do not trust either document)

Every number below was measured **this turn** against `fac3c3d`. Where a handover figure
disagrees, the measured one wins and the disagreement is named.

| Handover said | Measured | Note |
|---|---|---|
| gate green at `f80835c` | gate green at **`fac3c3d`** | the handover's own commit is one *behind* HEAD — `fac3c3d` is the handover doc itself |
| 71 files / 2067 tests | **71 / 2067** | confirmed |
| 81 warnings / 0 errors | **81 / 0** | confirmed |
| `AGENTS.md` 1788 / 1800 | **1788 / 1800** | confirmed — **12 words of room** |
| working tree clean | **clean** | confirmed |
| `src/sw.ts:74-80` | **`src/sw.ts:80`** is the const; the false comment is **`:73-78`** | the handover's range is off by a few lines; the *claim* is exact |
| `PlaydateDetailPage.tsx:2147` | **`:2136-2151`** is the button block — the JSX opens above and the label renders at `:2146` | line drift, same site |
| `LocationModal.tsx:260,271` | **`:252`** = `See places`, **`:262`** = `Apply radius` | the handover's numbers drifted; the *two buttons* are as described |
| `FeedPage.tsx:992-1013` | **`:994-1030`**; the comment explaining the bug is **`:1013-1023`** | confirmed in substance |
| `PlaceDirectory.tsx:1348` | **`:1352`** is the `LocationModal` mount; `onApplyRadius` at **`:1364`** | confirmed in substance |
| `firstRunTour.ts:19` | **`:19`** carries r1's-ending comment | confirmed |
| `HowItWorksCard.tsx` + `firstRunTour.ts` guard-coupled | **confirmed, and worse than stated** | see §3, fact 9 |

### ⚠️ Fact: the gate is NOT the current tip's gate

The handover measured at `f80835c`. HEAD is `fac3c3d`, a docs-only commit adding the
handover. I re-ran the gate at `fac3c3d` rather than assuming the docs commit was inert —
**that assumption is the class of claim this batch keeps finding**. Result: identical on
all four numbers.

---

## 3. The measured facts this plan rests on

Every one came from a read of the tree this turn. Cited so a builder can check rather than
trust.

1. **The three fake drop-ins are sweep-scoped, and the sweeper already exists and already
   verifies itself.** `scripts/sweep-e2e-markers.mjs` removes rows scoped to `e2e-%`
   accounts, is FK-safe, has a **founder-overlap refusal gate**, and re-reads the database
   after deleting, failing loudly if a marker survived or a total did not move by exactly
   the amount claimed. Its modes: `list` (who would be deleted), `select` (counts + gate),
   `delete` (**refuses unless the gate passes**), `verify` (**exit 1 if any marker
   remains**). It takes its credential from `SUPABASE_ACCESS_TOKEN` in `.env` first
   (present, measured) and only falls back to a CDP browser session.
   Its decision logic is pure and lives in `scripts/lib/sweep-e2e.mjs` with
   `sweep-e2e.test.mjs` beside it.
   ⚠️ **It deliberately never widens to "looks like test data"** — it is `e2e-%` or
   nothing. `e2e/weekly-series.e2e.ts:27` is the source of `'E2E weekly lot'` and `:32` of
   `` `e2e weekly-absent ${epoch}` ``.
2. **There is also a repo-side half**, `scripts/guards/fixture-marker-guard.mjs`, which
   fails the normal gate when a spec invents a fixture outside the sweep's scope. The two
   halves are documented together in `docs/agents/e2e-fixture-convention.md`. **So item 4
   may need no new code at all** — that is the first thing the slice measures.
3. **The notification defect is a claim the mechanism does not have (D-025), in two places
   at once.** `src/sw.ts:80` reads
   `const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''`, and the
   docblock at `:73-78` asserts that with an empty key `subscribe()` is *"still attempted
   without `applicationServerKey`, which the Web Push protocol allows, so a parent's opt-in
   is recorded and starts working the moment a sender exists."*
   `docs/push-setup.md:124` repeats the identical claim.
   **The code already refuses the empty key**: `:223` builds `keyBytes` as `null` when the
   key is empty, and `:228` spreads `applicationServerKey` **only when non-null**. So the
   subscribe call is made **without a key**, the browser rejects it, and the opt-in is not
   recorded. **The docblocks are the defect; the runtime branch is the honest one.**
4. **The VAPID key is configured where it is used, and NOT where the build reads it.**
   `docs/push-setup.md`'s checklist records steps 1–4 DONE: the keypair exists in
   `.env.push.local` (gitignored), `VITE_VAPID_PUBLIC_KEY` is set **in Vercel's env** and
   the live bundle is verified to contain the public key, `send-push` is ACTIVE with all
   three secrets, and the cron fires every 5 minutes. **Measured this turn: the local
   `.env` does NOT contain `VITE_VAPID_PUBLIC_KEY`** — its keys are
   `VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_ACCESS_TOKEN /
   VITE_PUBLIC_BASE_URL / VITE_OAUTH_PROVIDERS`. So **a local `npm run build` or a local
   dev server produces a bundle with an EMPTY key**, which is the only state in which the
   browser ever reaches the unbound-subscribe branch. **This is the crux of item 6 and it
   is why the slice must establish the failing environment before it edits anything.**
5. **The human walks the Vercel preview, where the key IS present** — so the reported error
   needs one more measured step before a fix is designed: whether the failing run was a
   local/LAN build (`192.168.1.61:5173`, which the handover says may still be running) or
   the preview. **That measurement decides whether item 6 is a code fix, an env fix, or
   both — and it is a STOP-and-report if it turns out to be env-only.**
6. **"I'm going" is a self-contained block.** `PlaydateDetailPage.tsx:2136-2151` renders the
   ping button (`data-*`/testid asserted by specs), with `pingLocationNotice` / the
   `going-count-unavailable` fallback and the count line immediately after it at `:2152+`.
   The move must carry **the whole block, not just the button**, or the notice and the count
   separate from the control they belong to.
7. **Set-location has exactly two callers, and they behave differently — that IS the bug.**
   - `FeedPage.tsx` passes `onApplyRadius={handleLocationApplyRadius}` (`:994`) — a real
     DB write through `updateHomeZipRadius`, with an equal-value no-op guard, a `radiusBusy`
     latch, and a **re-throw** so the modal owns the error surface.
   - `PlaceDirectory.tsx:1352-1365` passes **`onApplyRadius={(miles) => setRadiusMiles(miles)}`**
     — a local `setState`. It is a write in name only.
   The modal renders **three** buttons: Cancel, `See places` (`:252`), `Apply radius`
   (`:262`). `onRadiusChange` is the **per-tick preview** the Places caller supplies and the
   feed deliberately omits. **So "Apply closes the menu and updates the page" is a
   per-caller contract, not one button rename** — collapsing to two buttons must preserve
   the live-preview behaviour Places depends on while giving the feed one action that
   writes *and* closes.
8. **Item 1's risk is real and specific.** The cards are chosen by `view` (a `resolveCard`
   result), **not** by an index: `OnboardingPage.tsx:1313` renders the ending when
   `view === 'finish'`, and the load-error branch at `:1316` sits **after** it. `saving`
   (`:302`) gates the area card's primary (`:1497-1498`) and disables the zip field
   (`:1656`). **The radius select at `:1683-1700` is NOT disabled while saving** — this is
   r2's recorded 8d open, and **a back-arrow makes it strictly more reachable**, because a
   parent can now leave a card mid-write and return. There is a comment at `:1647`
   acknowledging an edit-during-write. **A back arrow must therefore be a decision about
   in-flight writes, not a `<` character in the chrome.**
9. **⚠️ Item 2 and item 3 are guard-coupled in a way the handover understates.**
   `src/lib/firstRunTour.ts:205` is
   `export const TOUR_TAXONOMY_CLAIMS: readonly PlaceKind[] = ['playground', 'pool', 'beach']`,
   read by `scripts/guards/copy-taxonomy-guard.mjs:124` (`claims: 'TOUR_TAXONOMY_CLAIMS'`).
   The guard requires the declared kinds to be **backed by the words** — so **deleting the
   Places line, or deleting this whole card, changes or invalidates the declaration, and
   the guard is the thing that will say so.** The guard's own `.check.mjs` uses the exact
   declaration string as a fixture (`:94`), with four mutations. **A copy change that
   silently empties the declaration is a finding, not a pass** — and the declaration's
   *consumer* (`copy-taxonomy-guard.check.mjs') is a second file that may need to move with
   it. This is why items 2 and 3 are sliced *after* the guard question is answered, not
   inside a UI slice.
10. **`firstRunTour.ts` and its test are large and dense**: 19 357 bytes / 21 309 bytes. The
    header at `:1-60` is itself the honesty argument. **Item 3 does not delete this module**
    — the tour copy is a candidate source for the tooltips' words. What changes is *when and
    how the parent meets it*.
11. **The ending's testid does not move with the component.** `HowItWorksCard` renders with
    `testId = 'first-run-finish-card'` (`:37`) — asserted by `e2e/auth.setup.ts` (every
    spec's setup), `e2e/fixtures.ts` (`finishSignup`) and
    `e2e/signup-zip-fallback.e2e.ts`. **Its own docblock says so at `:29-33`.**
    ⚠️ **Measured rather than counted from memory: 11 hits across 5 files** —
    `e2e/fixtures.ts:480,605`, **seven in `e2e/signup-zip-fallback.e2e.ts`**
    (`:223,295,380,568,578,798,868`), `src/components/HowItWorksCard.tsx:29,37`.
    **`auth.setup.ts` carries NO hit** — it walks the ending by another means, which the
    slice must re-measure before assuming. **The sharpest one is
    `signup-zip-fallback.e2e.ts:568`'s `.not.toBeVisible()`**: an assertion about the
    ending's *absence*, which a locator rename cannot satisfy. Any item 2/3 change that
    removes the card must keep the shared setup walking.
12. **The onboarding e2e surface is five specs**: `onboarding-resume`, `signup-zip-fallback`,
    `name-card-photo`, `onboarding-kid-photo`, plus `auth.setup.ts` and `fixtures.ts`.
    `npm run verify` does **not** run them — **any item 1/2/3 slice must pin the browser lane
    explicitly**, which the r2 plan already learned the hard way.
13. **Item 4's acceptance cannot be a page eyeball** (the handover says so, and the sweeper
    agrees): `verify` exists precisely because *"a sweep that silently removes nothing looks
    exactly like a sweep that worked."*

---

## 4. Sequencing, and why it is not the handover's order

The handover says "two block publication — do those first." **Agreed, and both go first.**
But the honest dependency graph is not item order:

```
Track A (blockers, serialized — both touch production-adjacent state)
  r3-1  item 4: sweep the fake drop-ins        [DATA — human confirms rows]
  r3-2  item 6: notifications                  [code and/or env — may BLOCK]

Track B (independent, small, file-disjoint from Track A and from each other)
  r3-3  item 5: "I'm going" below the event info
  r3-4  item 7: set-location two buttons

Track C (coupled — items 1, 2, 3 share the first-run flow and MUST be one sequence)
  r3-5  item 1: navigation arrows        ← riskiest; FIRST, because it changes the model
  r3-6  item 2: delete the ending screen  ← depends on r3-5's card model
  r3-7  item 3: lightboxed tooltips       ← depends on r3-6 (it replaces what 6 removes)
  r3-8  the guard/declaration reconciliation items 2+3 force
```

**Why r3-5 before r3-6/r3-7, not after.** Items 2 and 3 both *delete or replace the ending*.
An arrow that moves **backward** through cards needs a model of "which card am I on" that
survives a non-linear walk; if the ending is deleted first, the arrow is then built against
a sequence that is about to change again — the exact merge-conflict-inside-one-flow the
handover warns about. **Arrows first makes the model explicit; the deletions then remove
cards from a model that already handles arbitrary position.**

**Why r3-8 is its own slice rather than folded into r3-7.** It is the only slice whose
failure mode is a *guard* failure rather than a product failure, its acceptance is a
mutation test rather than a browser observation, and per the build law
(`code-structure.md`: *"Write the rule here first, then the guard"*) a declaration change is
a rule change. **Folding it into the tooltip slice would put a rule change and a UI change
in one diff** — this batch has ruled against that four times.

**Serialization:** Track A, then Track B, then Track C. **One builder at a time** (§2 rule
3). Within Track B the two slices are file-disjoint, but that does **not** license
parallel builders — rule 3 is unconditional, and the one-writer rule is what keeps a bisect
honest.

---

## 5. Interfaces (pinned before dispatch)

### Item 1 — the first-run position model

`src/lib/firstRun.ts` gains an explicit, **pure** notion of position, because the page
currently renders off a single `resolveCard` answer and an arrow needs the neighbours:

```ts
/** The card before `card` in FIRST_RUN_CARDS order, or null at the start. */
export function previousCard(card: FirstRunCardId): FirstRunCardId | null
/** The card after `card`, or null at the end (the ending is not a card). */
export function nextCard(card: FirstRunCardId): FirstRunCardId | null
```

**The invariant to pin:** these read `FIRST_RUN_CARDS` and never a literal index, the same
rule `progressLabel` already obeys. **They are pure and get table tests** — no component
decision (the build law).

**What the page owns, and what it must NOT do:** the page holds the *position*; whether a
card's data is already written is **not** the page's to invent, because `nextUnfinishedCard`
is the authority on "unanswered" (r2 slice 6a's ruling: the decision is named once). **A
back arrow re-offers a card that already exists; it must never re-run a write.**

### Item 1 — the in-flight rule (the decision this slice is really about)

**Ruled, and the builder may not re-decide it silently:** navigation is **disabled while
`saving` is true**, and **only while**. Rationale, measured:
- the area card's `saving` already disables its own primary (`:1497-1498`) and its zip field
  (`:1656`), so a disabled arrow is **consistent** with the surface rather than a new rule;
- the radius select is **not** disabled while saving (fact 8), so the divergence family 8d
  recorded stays exactly as wide as it is — **this slice does not widen it and does not fix
  it.** Fixing it is a **recorded open**, not scope;
- the alternative (allow the move and hope the write settles) is the **silent-orphan shape**
  slice 2's scope ruling exists to prevent, in a different costume.

**If a measurement shows the disabled arrow can strand a parent** (a hung write with no
escape), the builder **STOPS and reports** — the pending-state rule's bounded escape is not
optional, and r2 slice 2 already established what its absence costs.

### Item 2/3 — the ending

Item 2 deletes the "You're all set" screen and item 3 replaces "How Drop In works" with
tooltips **on app load**. Both therefore change **what the parent sees after the last card**.
The pinned contract:

- **The last first-run card's primary leads INTO the app** (the feed), not into a card.
- **The tooltips are the app's first-run surface, not the run's ending** — they render over
  the feed on load, once, and are dismissible.
- **`first-run-finish-card` must keep existing for any spec that still asserts it, or every
  consumer must be updated in the same slice.** Measured consumers are listed in fact 11.
  **This is the single highest-risk mechanical item in Track C** and the slice that removes
  the card owns all of them.
- **`TOUR_TAXONOMY_CLAIMS` is reconciled by r3-8, in the same batch, before Track C closes.**

---

## 6. Slices

Each slice: objective → files → approach → acceptance → verify → depends → budget.
**`e2e/fixtures.ts` is a per-slice obligation wherever the card sequence moves** — the
slices below name it or explicitly declare it untouched.

---

### 🔴 r3-1 — remove the three fake e2e drop-ins (item 4) — **EXECUTED; INCIDENT; FIX IN FLIGHT**

> **STATUS 2026-10-03: the sweep RAN and is a PUBLICATION BLOCKER.** It removed all 2445
> marker rows as scoped, and **destroyed one real parent's `going_pings` row**. Its own
> verification caught it (`exit 4`, "total went 5 → 4"). Full write-up:
> **`.scratch/v28/reports/r3-1-incident.md`**; evidence preserved in
> `r3-1-delete.txt`, `r3-1-verify.txt`, `r3-1-confirmation.md`.
>
> **ROOT CAUSE — a CASCADE, not a race.** `going_pings.playdate_id -> playdates` is
> `ON DELETE CASCADE`. A real parent pinged a marker-hosted drop-in. Their `profile_id` is
> not a marker, so `going_pings`' own clause never matched it and its marker count was a
> truthful **zero** at both reads. Deleting the marker drop-in destroyed the ping anyway.
> **Both reads were honest; the deletion model was wrong.**
>
> **THE FIX (built, gate-green):** `CASCADE_HAZARDS` — the 17 measured cascade edges — plus
> a read-only **collateral probe** that runs before any delete and **refuses (exit 5)** when
> a non-marker row sits behind a doomed marker parent. Fail-closed on empty/unreadable
> probes. It cannot be bypassed. `verificationProblems` is **unchanged and unweakened**.
>
> **PROVEN END-TO-END:** the incident was reproduced in a rolled-back transaction against
> the real production probe → **`b0 = 1`**, every other edge 0 → the gate refuses,
> specifically. Nothing persisted (verified: 52/52/21/4 unchanged).
>
> **REMAINING FOR THIS SLICE:**
> - **data recovery is a HUMAN question** — whether Supabase PITR can restore the deleted
>   row; this repo has no backup tooling.
> - **durability is a PRODUCT decision** — the e2e suite drives the **live production**
>   project, so a sweep is a snapshot of a stream (~40 markers reappeared within 90 minutes).
>   Recommendation: **a separate Supabase project/branch for e2e**, with automated
>   pre-release cleanup as the bridge.

- **Objective.** Production shows no `e2e`-prefixed venue, host, or drop-in, **and the
  mechanism that removes them cannot delete real user data.**
- **Files (as executed).** `scripts/lib/sweep-e2e.mjs`,
  `scripts/lib/sweep-e2e.check.mjs`, `scripts/sweep-e2e-markers.mjs`,
  `docs/agents/e2e-fixture-convention.md`.
- **Approach.** ⚠️ **This touches PRODUCTION DATA.** The order is fixed:
  1. **`list`** — enumerate the exact marker accounts;
  2. **`select`** — the counts **and the founder-overlap gate**;
  3. **`collateral`** — the read-only cascade probe (NEW);
  4. **present those exact rows to the HUMAN and get explicit confirmation**;
  5. **`delete`** — **refuses (exit 5) unless BOTH gates pass**;
  6. **`verify`** — exits non-zero if any marker remains.
  **A builder that deletes before the confirmation has broken rule 8.** The sweeper has no
  flag that bypasses the collateral gate.
- **Acceptance.**
  - the collateral gate **refuses** the 2026-10-03 incident shape, proven by mutation and by
    a rolled-back reproduction against the live probe;
  - every marker row is removable: `verify` exits 0 with zero marker rows after a sweep;
  - `verificationProblems` still fails on a wrong total delta — **not weakened**;
  - **no non-marker row is ever deleted**, asserted by the gate plus the regression check.
- **Verify.** `node scripts/lib/sweep-e2e.check.mjs` **and** `npm run verify` **and**
  `node scripts/sweep-e2e-markers.mjs collateral` **and** `node scripts/sweep-e2e-markers.mjs verify`.
- **Depends on.** Nothing — but its destructive step depends on a **HUMAN confirmation**,
  and publication depends on the recovery + durability answers above.
  **Budget.** medium.

---

### 🔴 r3-2 — notifications: the claim vs the mechanism (item 6) — **DONE 2026-10-03**

> **OUTCOME: a DOCUMENTATION defect, fixed without touching runtime behaviour.**
> Full write-up: `.scratch/v28/reports/r3-2-notifications.md`.
>
> **The failing environment was identified BEFORE any edit** (the plan's own rule): no LAN
> server running, and `VITE_VAPID_PUBLIC_KEY` **absent** from the local `.env` while Vercel
> has it. That fully explains the human's report.
>
> ⚠️ **The handover was WRONG about the location.** The opt-in path is
> **`src/lib/pushClient.ts:508`** (`enablePush`), NOT `src/sw.ts:74-80` — that is
> `rehandshake()`, which fires on `pushsubscriptionchange`. The false claim appeared in
> **three** places: `pushClient.ts:510-513`, `sw.ts:73-78`, `docs/push-setup.md:123-127`.
>
> **Runtime was already correct** (`...(key === '' ? {} : { applicationServerKey: … })`)
> and was **not changed**. Only the claims were.
>
> **THE REAL FINDING — why 2067 green tests shipped a broken opt-in:**
> `e2e/push-subscribe.e2e.ts`'s stub had `async subscribe()` with **no parameters**, so it
> **ignored the options entirely** and returned a fake subscription. The suite asserted the
> bug's behaviour was correct, and the e2e build had no key of its own. Fixed in two halves:
> the **stub now refuses a keyless subscribe** with Chromium's own message, and the e2e
> build now carries a **locally generated test-only P-256 key** (gitignored `.env`).
>
> **Mutation-proven:** the spec **fails when the key is absent** and passes when present.
> Before this slice it passed in both states.
>
> **Verified:** `npm run verify` exit 0 (71 / 2067 / 81 / 0 / GUARDS PASS) and
> `npx playwright test e2e/push-subscribe.e2e.ts` → **9 passed**.
>
> **STILL NEEDS THE HUMAN:** a walk on the **Vercel preview** (which has the production key)
> confirming the opt-in completes there. A real push **delivery** was never in scope and is
> not claimed.

#### (original slice text, kept for the record)

- **Objective.** On a real browser, enabling notifications completes registration and the
  subscription is persisted — **or the slice reports BLOCKED with the exact missing
  artifact named.**
- **Files.** `src/sw.ts` (the docblock `:73-78` **and** the branch at `:223-228`),
  `docs/push-setup.md` (`:124`'s identical claim, and its checklist),
  and — **only if a measurement says the client code is at fault** —
  `src/lib/push.ts` or whichever module surfaces the registration error.
- **Approach.** ⚠️ **MEASURE THE FAILING ENVIRONMENT FIRST — do not open the editor.** The
  browser's error message and fact 4 together mean there are **at least two distinct
  failures wearing one message**, and they have different fixes:
  1. **If the failing build had an empty key** (a local/LAN build — the handover says a LAN
     dev server may still be running on `192.168.1.61:5173`), then **the code is behaving
     correctly and the docblock and `docs/push-setup.md:124` are simply false.** The fix is
     **the two documents**, plus whatever makes a local build carry the key. **Report the
     measured state before editing anything.**
  2. **If the failing build had the key** (the Vercel preview), the defect is in the client
     path and the branch at `:223-228` is the place to look.
  **Do NOT "fix" this by passing a key that does not exist, and do NOT weaken the branch to
  make a subscribe succeed.** A subscription bound to nothing is worse than a refused one —
  it is the same "stated capability the mechanism does not have", one level down.
  ⚠️ **The honest outcome may be "code + a secret the human must provision."** Per the
  handover that is a **BLOCKED to surface**, not a guess — and given fact 4 the likely
  honest outcome is narrower than the handover feared: the secrets **already exist**; what is
  missing is the key **in the build the human was using**.
- **Acceptance.**
  - **The failing environment is identified and stated with evidence** (which URL, which
    bundle, whether the bundle contains the public key) **before** any edit;
  - the docblock at `src/sw.ts:73-78` and `docs/push-setup.md:124` **no longer assert that
    an unbound `subscribe()` records the opt-in** — because it demonstrably does not;
  - the surviving comment describes **what the code does** (subscribes without a key, and the
    browser refuses), not what the protocol would allow;
  - **on a real browser** (preview or local with the key present), enabling notifications
    completes registration and the subscription row is persisted — **verified in the browser,
    not by unit test alone**;
  - if the key cannot be made present in the environment under test, the slice **stops and
    reports BLOCKED**, naming the exact artifact and who owns it.
  - The false claim is written **twice in two different wordings** (measured: `docs/push-setup.md:124`
    says *"the Web Push protocol allows it"*; `src/sw.ts:76` says *"the Web Push protocol
    allows, so a parent's opt-in is recorded"*). **So the pre-fix state is recorded, and
    the target is 0 on each:**
  - **The claim is removed from both wordings** — measured pre-fix at exactly one site
    each: `docs/push-setup.md:124` and `src/sw.ts:76`. The surviving text at each site says
    what the code does (subscribes **without** a key, and the browser refuses), not what the
    protocol would allow.
- **Verify.** `npm run verify` **and** a **recorded browser check** on the environment the
  human reported, with the bundle's key-presence measured.
- **Depends on.** Nothing. **Budget.** small if it is the two documents; **STOP if it is
  not.**

---

### 🟡 r3-3 — "I'm going" below the event info (item 5) — **DONE 2026-10-03**

> **OUTCOME: the move is made, and it REVERSES a recorded founder decision.**
> Decision record: `.scratch/v28/reports/r3-3-decision.md`. Commit `6ab2cc0`.
>
> ⚠️ **PLAN DEFECT FOUND BEFORE THE EDIT.** `src/pages/PlaydateDetailPage.tsx:1957-1965`
> records **A14 (V15 ticket 08)**, whose founder note was *"they should be at the very top
> of the page"* — it had deliberately moved this block FIRST, having previously rendered
> after the title, place, date/time and host card. **This slice's original text did not
> mention A14 at all**, so a builder would have silently reversed a named decision. The
> conflict was surfaced to the human, who ruled: **the later phone observation supersedes
> the V15 note.** Recorded as **r3-D1**; the A14 comment is **amended in place, not deleted**.
>
> **Measured order after:** title → date/time → description → host → **RSVP**. The block
> moved as **one unit** (button, location notice, count line, count-unavailable fallback +
> Retry, `pingError`, `KidsComingPicker`). The host's own-post panel did **not** move.
>
> **NEW PIN:** a DOM-order test (`compareDocumentPosition`) in `e2e/rsvp-confirmation.e2e.ts`
> — the acceptance requires the a11y reading order to match the visual order, which no
> screenshot can show. **Mutation-proven:** moving the block back to the top makes it FAIL.
>
> **Verified:** `npm run verify` exit 0 (71 / 2067 / 81 / 0 / GUARDS PASS);
> `rsvp-confirmation` 5 passed; `feed-empty-state` + rsvp 9 passed; `inbox` 6 passed.

#### (original slice text, kept for the record)

- **Objective.** The ping control sits *after* the event's information.
- **Files.** `src/pages/PlaydateDetailPage.tsx` (**the block at `:2136-2151` and whatever
  it must move past**) — and the specs that assert its position or testid.
- **Approach.** **Move the whole block, not the button** (fact 6): the button, the
  `pingLocationNotice` / `LocationRequiredNotice` conditional, and the going-count line are
  one unit, because a count separated from its control is a new layout defect. **Preserve
  DOM order in a way that does not re-order the a11y tree relative to reading order** — if
  the block is moved with CSS the visual and the announced order diverge, which this repo
  has a lane for (`a11y:focus`). **Prefer moving the JSX.** The human's reason is the
  acceptance: a parent decides *after* reading, so the control must follow the description.
- **Acceptance.**
  - in the rendered page the ping control appears **after** the event title, time, place and
    description, and **before** nothing that used to precede it is now orphaned;
  - **no other element shifts** — the diff is a move, not a restyle;
  - the existing detail-page specs pass **unchanged**; if one asserts the old order, that
    spec's assertion is **updated in this slice** (the slice that moves it owns the pin);
  - the a11y reading order matches the visual order.
- **Verify.** `npm run verify` **and** the detail-page e2e spec(s) named by measurement —
  `npx playwright test <the spec that covers PlaydateDetailPage>`.
- **Depends on.** Nothing. **Budget.** small.

---

### 🟡 r3-4 — set-location: two buttons, both entry points (item 7) — **DONE 2026-10-03**

> **OUTCOME: three buttons → two, Apply geocodes + writes + closes, both entry points.**
> Commit `5e987a9`.
>
> **⚠️ A REAL PRODUCT DEFECT FOUND BY THE BROWSER LANE, not a test-only change.**
> `PlaceDirectory.closeLocationModal` **cleared `geocodeCenter`**. That was correct while
> "See places" was a *preview* a parent confirmed separately — but with one Apply button,
> clearing on close **threw away the centre Apply had just resolved**, so the circle snapped
> back to the home pin and the parent saw it do nothing. **That is the reported symptom
> itself**, reproduced by the change. Fixed at the source: the centre is now the committed
> frame and survives the close.
>
> **Order is load-bearing:** geocode → write → close **last**, because closing first wipes
> the centre. One handler, not two buttons calling two functions.
> **A failed write does not close** (the feed re-throws so the modal owns the error — now
> load-bearing, since a swallowed error would close over a write that never landed);
> **a failed geocode does not close** either.
> **`handleGeocode` now RETURNS** whether a centre landed: reading `geocodeError` state
> after the `await` would read the previous render's value and close over a failed lookup.
>
> **Specs:** 6 replaced testid uses. Two were behaviour changes, not renames —
> `places-map-view` asserted the dialog *stays open* after geocoding (now: Apply closes,
> then reopen to prove the per-tick preview survives), and `feed-empty-state`'s write
> round-trip needed a reopen between its two writes.
>
> **Verified:** `npm run verify` exit 0 (71 / 2067 / 81 / 0 / GUARDS PASS);
> **`places-map-view` + `feed-empty-state` + `places.e2e.ts` → 39 passed, 1 skipped, 0 failed
> — BOTH entry points**, the path the plan flags as the one a single-page test misses.

#### (original slice text, kept for the record)

- **Objective.** The modal offers **Cancel** and **Apply**; Apply closes the menu **and**
  updates the page — **from the Places entry point as well as the feed's.**
- **Files.** `src/components/LocationModal.tsx` (the three buttons at `:246-272`),
  `src/pages/FeedPage.tsx` (`handleLocationApplyRadius`, `:994-1030`),
  `src/components/PlaceDirectory.tsx` (`:1352-1365`), and the specs that drive the modal.
- **Approach.** **The measured crux (fact 7): the two callers pass different contracts, so a
  button rename alone cannot satisfy this.** Pinned shape:
  - `See places` is removed. `Apply` becomes **the one explicit action**: it calls
    `onApplyRadius` **and then `onClose`**;
  - the **per-tick preview stays** (`onRadiusChange`) for the Places caller — removing it
    would silently regress the live map circle, which the extraction comment at
    `PlaceDirectory.tsx:1360-1363` records as a *previous* regression fix;
  - **Apply must be a no-op-safe close**: if the write rejects, the modal shows its existing
    `location-radius-error` surface **and stays open** (the re-throw at `FeedPage.tsx:1029`
    exists precisely so the modal can own that error — closing on failure would discard it);
  - `homeZip={null}` on the Places caller is **deliberate and must survive**: the Places
    modal has no profile zip in scope, and inventing one is new behaviour, not this item;
  - **`onGeocode` keeps its current role** for both callers: it resolves the typed address
    for the map/list. Removing `See places` must not remove the **geocode-on-apply** path —
    if Apply is what triggers the geocode, that ordering must be explicit and measured, not
    assumed from the button that disappeared.
- **Acceptance.**
  - **two** buttons: `Cancel` and `Apply`. `See places` and `Apply radius` are gone;
  - from **the Places entry point**: typing an address and pressing Apply **updates the
    page** (map/list reflect the new center and radius) **and closes the modal**;
  - from **the feed entry point**: Apply **writes** the radius through
    `updateHomeZipRadius`, refreshes, **and closes**; the equal-value no-op guard still
    holds; a rejected write **keeps the modal open with its error visible**;
  - the Places live preview (slider → map circle) still works;
  - ⚠️ **the Places path is the one a single-page test misses** — its acceptance is
    asserted from `/browse`, not only from the feed.
  - **Both old testids are gone from three measured files**, and the report names each:
    `src/components/LocationModal.tsx` (`:253`, `:264`),
    `e2e/places-map-view.e2e.ts:1681`, and `e2e/feed-empty-state.e2e.ts`
    (`:204,440,518,523,542,545`). ⚠️ **The specs are the real work, not the component**:
    `e2e/feed-empty-state.e2e.ts:545` asserts the button's **TEXT**
    (`/See places|Finding…/`), which a locator rename does not satisfy — and
    **`npm run verify` would not catch it**, because the gate runs no browser.
- **Verify.** `npm run verify` **and** `npx playwright test e2e/places.e2e.ts <the feed
  location spec>` — **both entry points named explicitly.**
- **Depends on.** Nothing. **Budget.** medium — two callers, two contracts, one modal.

---

### 🟡 r3-5 — first-run navigation arrows (item 1) — **TRACK C, FIRST**

- **Objective.** A parent can move backward and forward through the first-run cards and fix
  an answer.
- **Files.** `src/lib/firstRun.ts` + `src/lib/firstRun.test.ts` (the pure position model),
  `src/pages/OnboardingPage.tsx`, `src/components/FirstRunCard.tsx` (the chrome),
  and the five onboarding specs **if and only if** the browser lane proves them affected.
- **Approach.** ⚠️ **Read this file's history first — the mid-save/freeze semantics here are
  load-bearing and were audited at length in slices 8a and 8d.** Then:
  1. add the pure `previousCard` / `nextCard` (§5) **with table tests**, reading
     `FIRST_RUN_CARDS` and never a literal;
  2. the page holds the position; **an arrow re-offers a card, it never re-runs a write**
     — the writes stay where they are, and `nextUnfinishedCard` stays the single authority
     on what is unanswered;
  3. **navigation is disabled while `saving` is true, and only while** (§5's ruling). The
     builder records the reasoning in the code, because it is a decision, not a detail;
  4. the ending is **not** a card and has **no forward arrow** — its own primary is the
     crossing;
  5. **the radius select's edit-while-saving divergence is NOT this slice's to fix.**
     Recorded open, named in the report, left exactly as wide as it is.
- **Acceptance.**
  - a back arrow on every card except the first, a forward arrow on every card except the
    last, and the ending has neither surplus control;
  - **going back and forward does not re-write anything**: with a persisted profile, walking
    back to the name card and forward does not call `createProfile` again; walking back to
    the area card does not re-geocode;
  - **a typed-but-unfinished answer survives the round trip** (this is the human's stated
    reason — "go back and fix an answer" — and a back arrow that loses the edit is the item
    failing while looking finished);
  - **navigation is disabled while `saving`** and re-enables after it settles — **including
    on the failure path** (the pending-state rule: a hung or failed write must not trap the
    parent);
  - the position model is pure and table-tested; **the page decides nothing the lib can
    decide** (the build law).
- **Verify.** `npm run verify` **and** `npx playwright test e2e/onboarding-resume.e2e.ts
  e2e/signup-zip-fallback.e2e.ts` — **the gate does not run e2e (fact 12).**
- **Depends on.** Nothing. **Budget.** **medium-large — this is the riskiest of the seven.**

---

### 🟡 r3-6 — delete the "You're all set" screen (item 2)

- **Objective.** The run ends **in the app**, where a parent can start by exploring other
  people's drop-ins.
- **Files.** `src/pages/OnboardingPage.tsx` (the `view === 'finish'` branch at `:1313`),
  `src/components/HowItWorksCard.tsx`, `e2e/auth.setup.ts`, `e2e/fixtures.ts`,
  `e2e/signup-zip-fallback.e2e.ts`, and **every other consumer of
  `first-run-finish-card`** (fact 11 names them).
- **Approach.** The last card's primary navigates into the feed. **The testid question is
  the slice's real work**: `first-run-finish-card` is asserted by **every spec's setup**,
  so the slice either keeps an element carrying that testid or updates all consumers **in
  this diff**. **A half-migrated locator is a red suite, not a smaller diff.**
  `HowItWorksCard`'s fate is decided here: if its content survives into item 3's tooltips,
  **move it there; if not, delete it with its exports by name** (r2 slice 5's standing rule:
  wire-or-delete, never leave a test pinning a function nobody calls).
  ⚠️ **Do not delete `firstRunTour.ts` in this slice** — item 3 may be its consumer, and
  deleting it here would make item 3 rebuild it.
- **Acceptance.**
  - finishing the last card lands the parent **in the app**, on the feed, with the nav
    visible — no interstitial screen;
  - **every spec that walked the old ending passes**, or is updated **in this diff**;
  - `e2e/fixtures.ts`'s `finishSignup` and its consumers are **walked successfully**
    (measured: the ending's testid is read in `e2e/fixtures.ts` and asserted 7 times in
    `e2e/signup-zip-fallback.e2e.ts` — `auth.setup.ts` walks the ending *through*
    `finishSignup` at `:95` and carries no testid of its own);
  - any export this slice orphans is **wired or deleted by name**, with its test.
  - The ending's testid is read in **four named files** (measured, 11 hits):
    `e2e/fixtures.ts`, `e2e/signup-zip-fallback.e2e.ts`, `e2e/auth.setup.ts` (through
    `finishSignup` only) and `src/components/HowItWorksCard.tsx`. **Target state, one
    claim per path:**
  - **The ending's testid is gone from its three measured source/spec readers** —
    `src/components/HowItWorksCard.tsx` (`:29,37`), `e2e/fixtures.ts` (`:480,605`) and
    `e2e/signup-zip-fallback.e2e.ts` (**7 assertions**: `:223,295,380,568,578,798,868`) —
    **each updated in this diff**, and the report names what each now asserts.
    ⚠️ The sharpest site is `e2e/signup-zip-fallback.e2e.ts:568` — a
    **`.not.toBeVisible()`**, an assertion about the ending's **ABSENCE**, which a locator
    rename **cannot** satisfy.
- **Verify.** `npm run verify` **and** `npx playwright test e2e/auth.setup.ts
  e2e/signup-zip-fallback.e2e.ts e2e/onboarding-resume.e2e.ts` (setup included explicitly).
- **Depends on.** **r3-5.** **Budget.** medium.

---

### 🟡 r3-7 — lightboxed tooltips on app load (item 3)

- **Objective.** A parent learns the app by **using** it, not by reading a card about it.
- **Files.** a **new** tooltip component under `src/components/`, a **new** pure module
  under `src/lib/` **with its sibling `*.test.ts`** (the build law — a `lib/` module
  without one is an incomplete slice), the first-run trigger in `src/pages/FeedPage.tsx` or
  `src/App.tsx`, and `src/lib/firstRunTour.ts` (+ test) **as the copy source, not as a
  casualty**.
- **Approach.** The human's words are the requirement: *"lightboxed tooltips on app load
  that quickly highlight how to use it."* So:
  - the tooltips render **over the app on load**, once, and are **dismissible**;
  - **the words come from `firstRunTour.ts` where they are already measured and guarded**
    (fact 9) — do not write a second copy of the four tabs' descriptions, because the
    one-copy rule in the build law makes that a defect by construction;
  - **the honesty rule travels with the copy**: `firstRunTour.test.ts` pins *"every line says
    what a control DOES, never what is IN it"*, and that property must still hold for
    anything the tooltips say;
  - **a returning parent is not shown the tooltips again** — the "once" must be a persisted
    fact, and **which fact** is decided in this slice and named in the report;
  - the tooltips must not block the app: **Escape dismisses, focus is handled, and a parent
    who ignores them can still interact.** This repo has `useFocusTrap` and
    `MODAL_OVER_LEAFLET_Z_CLASS` for exactly this, and a tooltip that traps focus on load is
    a wall.
- **Acceptance.**
  - on a first arrival at the app the tooltips appear, highlight the real controls, and can
    be dismissed; **after dismissal the app is fully usable**;
  - a second load does **not** re-show them;
  - **each tooltip's words describe what its control DOES** — the same property
    `firstRunTour.test.ts` already pins, asserted for the new surface;
  - the new `lib/` module ships its sibling test, and the position/dismissal rules are
    **pure and tested**, not inline in the component;
  - no second copy of the tab descriptions exists anywhere:
    **the tooltip module imports `TOUR_LINES` rather than restating it**, and the report
    quotes that import line. Measured: the copy phrase
    `browse drop-ins within your radius` exists exactly once today
    (`src/lib/firstRunTour.ts:155`); **the one-copy rule makes a second occurrence the
    defect**, so the check is that the new module adds none.
- **Verify.** `npm run verify` **and** the browser lane proving the tooltips render on load,
  dismiss, and stay gone — named explicitly, because **the gate runs no browser** (fact 12).
- **Depends on.** **r3-6** (it replaces what r3-6 removes). **Budget.** medium.

---

### 🟡 r3-8 — the guard and declaration reconciliation items 2+3 force (fact 9)

- **Objective.** `TOUR_TAXONOMY_CLAIMS` and `copy-taxonomy-guard` describe the copy that
  actually ships, and the guard still has a reachable failure mode.
- **Files.** `src/lib/firstRunTour.ts` (the declaration at `:205` and the copy it declares),
  `scripts/guards/copy-taxonomy-guard.mjs`, `scripts/guards/copy-taxonomy-guard.check.mjs`,
  and `docs/agents/code-structure.md` (the rule, **written first**).
- **Approach.** ⚠️ **Run `npm run guards` EARLY AND OFTEN on items 2 and 3 — a copy change
  that silently empties the declaration is a FINDING, not a pass.** Then:
  - if the tooltips still name a place category, the declaration **moves with the words** to
    wherever the words live, and `COPY_MODULES` in the guard is updated **in the same
    change**;
  - if they name **no** place category, the declaration is **removed from `COPY_MODULES`** —
    and the guard must still fail on a category in the copy that nobody declared (its rule
    4), which is what keeps the removal from being a way to switch the rule off;
  - `copy-taxonomy-guard.check.mjs:94`'s `DECLARES` fixture string and its four mutations
    are updated with the declaration **or** the mutations stop matching the tree — either
    way the checker must still prove it can fire.
- **Acceptance.**
  - `npm run guards` passes on the shipped tree;
  - **the guard still fires** when a withheld category word appears in the copy — proven by
    its own `.check.mjs`, not by argument;
  - **the guard fails on a zero-claim state** (D-030: an empty measurement must not read as
    a clean result) — if the declaration is removed, the run says what it checked and the
    checker proves the removal is not a bypass;
  - `docs/agents/code-structure.md` states the rule **before** the guard enforces it;
  - ⚠️ **`AGENTS.md` has 12 words of room** — if a steering doc is added or edited, prune
    while you add, or `steering-lint` fails the gate.
- **Verify.** `npm run guards` **and**
  `node scripts/guards/copy-taxonomy-guard.check.mjs` **and** `npm run verify`.
- **Depends on.** **r3-7.** **Budget.** medium — the acceptance is a mutation, not an
  observation.

---

## 7. Non-goals

- **Not fixing the radius select's edit-while-saving divergence** (r2's 8d open). r3-5
  **must not widen it**, and does not fix it. Recorded, with its owner.
- **Not touching r2's closed slices.** All eight (6a–6d, 8a–8d) are closed and verified;
  this plan neither reopens nor re-litigates them.
- **Not the merge to master.** It is blocked on 5 divergent commits on `origin/master` and
  needs the human's decision (handover §3). **Do not attempt it.**
- **Not reverting `ocr`'s routing waiver** (`ec47f15`) — one line, needs the human's word
  (handover §6.2).
- **Not `v28-r2-8e`** (the `count-provenance` `at`/`iat` guard defect) — registered,
  unfixed, and not this batch's.
- **Not the factory / compute change.** `strata-max` is the intended primary and `ninfer`
  the working fallback; **the RAM is the binding constraint and this is working as
  designed. Do not "fix" it** (handover §4).
- **Not a second copy of anything.** The one-copy rule makes restating `TOUR_LINES` a defect
  by construction, which is why r3-7 and r3-8 exist as separate slices.

---

## 7b. THE PUBLICATION GATE (updated 2026-10-03 after the r3-1 incident)

**Publication is blocked until ALL of these hold. This list replaces "run the sweep
before publishing" as the gate.**

| # | Gate | State |
|---|---|---|
| P1 | The r3-1 collateral fix passes its regression check and mutation tests | ✅ **DONE** |
| P2 | `npm run verify` green on the final tree, baseline **71 / 2067 / 81 / 0** | ✅ **DONE** |
| P3 | The incident shape is **refused** by the real probe, proven non-destructively | ✅ **DONE** (rolled-back reproduction, `b0 = 1`) |
| P4 | **Data recovery decided** — recorded **NOT RECOVERABLE FROM THE REPOSITORY**; PITR not determinable from a project-scoped token (probed once, cheaply) | ✅ **DECIDED 2026-10-03** |
| P5 | **Durability decided** — **split the e2e environment from production** (long term); collateral gate + automated pre-release cleanup as the temporary bridge | ✅ **DECIDED 2026-10-03** |
| P6 | `node scripts/sweep-e2e-markers.mjs collateral` exits 0 on the publication tree | ✅ **DONE** (all 17 edges 0) |
| P7 | A fresh preview renders no `e2e`-prefixed venue or host | ⛔ **OPEN — needs a Vercel preview** |
| P8 | r3-2…r3-8 complete, or explicitly deferred by the human | ⛔ **OPEN** |

**P4 and P5 are now DECIDED** (`.scratch/v28/reports/r3-1-p4-p5-decisions.md`). P7 needs a
preview deployment, P8 needs the rest of the batch. **Nothing destructive runs again until
P1–P3 hold, and they do.**

⚠️ **STANDING INSTRUCTION: do not run another destructive production sweep.** No `delete`
mode runs again without a fresh explicit confirmation from the human.

### `infra-e2e-env-split` — a SEPARATE infrastructure task, deliberately NOT in r3

The durable fix P5 chose: **a second Supabase project (or branch) for e2e, so the live
production database is never used by the e2e suite.** Until it lands, the collateral gate
plus automated pre-release cleanup are the bridge — **and the gate is kept even after the
split**, because the marker convention still governs whatever database the specs write to.

Scope is named in `.scratch/v28/reports/r3-1-p4-p5-decisions.md` so it is not rediscovered.
**It is not scheduled and it is not a feature slice — do not expand r3-2…r3-8 with it.**

⚠️ **Do not re-run `delete` before publishing without re-reading P4/P5.** The gate is now
safe to run — that is what P1–P3 establish — but the *durability* problem (markers
reappearing between sweeps) means a single sweep at release time leaves fixtures visible in
the feed beforehand.

## 8. Risks / open questions

1. **⚠️ r3-1 deletes production rows.** The sweeper's gate, its re-read verification, and
   the human's confirmation of the **exact rows** are all mandatory. **A `delete` run before
   the confirmation is a rule-8 violation**, and unlike a bad diff it is not revertible
   from git.
2. **⚠️ r3-2 may be an ENVIRONMENT defect wearing a code defect's message.** Fact 4
   measured the local `.env` **without** `VITE_VAPID_PUBLIC_KEY` while Vercel has it. **If
   the human was on the LAN dev server, the app behaved correctly and two documents lied.**
   The slice must establish which before editing — and the honest outcome may be BLOCKED.
3. **⚠️ r3-5 is the riskiest of the seven.** A back arrow interacts with `saving`, the zip
   field, and the radius select, and those semantics were audited across two r2 slices.
   **The ruled answer is in §5; a builder that re-decides it silently has broken the rule
   about plan defects.**
4. **⚠️ r3-6 deletes a testid every spec's setup walks.** `first-run-finish-card` has ~18
   consumers. A half-migrated locator reddens the whole browser lane, and **the gate does
   not run e2e**, so the gate would stay green while the suite was broken. **The browser
   lane is the only thing that catches this.**
5. **⚠️ Items 2 and 3 change guarded copy.** `TOUR_TAXONOMY_CLAIMS` is a declaration
   `copy-taxonomy-guard` reads, and the guard is the thing that will fail. **r3-8 exists so
   that a rule change and a UI change are not one diff.**
6. **The three coupled items may still not fit three builder contexts.** r3-5 is medium-large
   on its own. If r3-6 measures larger than expected, **split it and say so** — the r2
   lesson (1a/1b) is that a token-budget split of *coupled* work is not a split.
7. **`AGENTS.md` has 12 words of room.** Any new steering doc must come with a prune, and
   `steering-lint` is in the gate.

---

## 9. Status log (orchestrator appends after every phase transition)

- **r3 opened 2026-10-02** by the taking-over DSH coordinator, on the outgoing
  coordinator's handover (`onboarding/HANDOVER-DSH.md`, section 8).
- **Section 8 executed in order:** the four documents read (`AGENTS.md`, `plan.md`,
  `task-state.md`, `docs/agents/code-structure.md`); **the tree and the gate re-measured
  rather than trusted** — clean tree at `fac3c3d`, `npm run verify` **exit 0**, **71 files /
  2067 tests / 81 warnings / 0 errors**, `AGENTS.md` **1788/1800**, **GUARDS PASS**
  (185 checker assertions);
- **the seven items measured against the live tree before slicing** — every file:line in
  the handover re-resolved, four of them found drifted, and **two facts the handover did
  not have** came out of it: the local `.env` lacks `VITE_VAPID_PUBLIC_KEY` (which reframes
  blocker 2 entirely), and the sweep for blocker 1 **already exists, already verifies
  itself, and already has a founder-overlap refusal gate** (which makes blocker 1 a
  confirmation problem rather than a code problem).
- **r2's plan preserved as `plan-v28-r2-backup.md`** — r3 supersedes it for the seven items
  and leaves every r2 decision it does not name intact.
- **No builder has been dispatched.**
