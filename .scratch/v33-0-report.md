# v33-0 report — the carried V32 debts

Sentinel: `V33-0-390PX-ASSERTION-M2Q8` · Status: **DONE** · Commit: `2af490e` (base `25dc518`)

## FIX ROUND 3 (ocr round 3) — Sentinel `V33-0D-OCR-ROUND3-T3W9`, commit `6bfde0f`

All four ocr round-3 findings addressed in `e2e/place-filters.e2e.ts`. Two are real
and fixed; two are limitations and documented, not changed. This is the LAST round
on this slice.

### Finding 1 (LOW, real) — the kind-chip selector was spelled twice

`page.locator('[data-testid^="place-kind-chip-"]…')` appeared once Node-side (the
chip count guard) and again inside the browser `evaluate`. Two copies of one
selector is the drift rule this repo enforces: change the row testid or the chip
prefix and the `:not(...)` exclusion silently stops excluding the scroll container.

**Fix:** one module-level `KIND_CHIP_SELECTOR` const, passed into `page.evaluate` as
an argument alongside `CLIP_TOLERANCE` (wrapped in an object, since Playwright's
`evaluate` accepts at most one positional argument). The `:not([data-testid="place-kind-chip-row"])`
exclusion survives the refactor.

### Finding 2 (LOW, real) — the comment said "module-level", the constant was not

The comment claimed *"One module-level tolerance"* while `CLIP_TOLERANCE` was
declared inside the test body.

**Fix:** moved to module scope. Sibling specs that hardcode their own
`scrollWidth <= clientWidth + 1` can now adopt this constant instead of spelling
the number a second time.

### PARKED 3 (ruled by the operator, documented not fixed) — the poll is a data-dependent proxy

The poll passes only if the live directory contains at least one place that is
upcoming (`upcomingCount > 0`) or an honest zero (no proof). There is no DOM signal
for the quiet third state (a hosted place with zero upcoming renders nothing), so a
data-independent text assertion does not exist.

**Documented in the comment:** *"the poll requires ≥1 upcoming-or-honest-zero row in
the live directory; a directory where every place has hosted and has nothing upcoming
would false-red here, which is the price of a text-only signal."*

### PARKED 4 (ruled by the operator, documented not fixed) — no natural red state

With today's `shrink-0 whitespace-nowrap` styling, every control the gate checks is
unclippable, so the gate has no natural red against the current DOM. It is a
regression guard for a future style change, and its red state is mutation-proven.

**Documented in the comment:** *"no control here can clip today by construction
(`shrink-0 whitespace-nowrap` inside an `overflow-x-auto` row); this gate pins that
property, and its red is mutation-proven (round 1: `w-24 overflow-hidden` → red,
naming every chip)."*

### Mutation proofs (acceptance 3)

**W-24 chip mutation still turns the clip gate red.** Scratch mutation in
`src/components/PlaceDirectory.tsx`: added `w-24 overflow-hidden` to the kind chip
className. Rebuilt, restarted preview on 4215, ran the spec:

```
1) [chromium] › e2e/place-filters.e2e.ts:104:3 › … › every trigger names its purpose and clips neither line

    Error: the 390px filter row must clip no text

    - Array []
    + Array [
    +   "place-kind-chip-playground (scrollWidth 144 > clientWidth 94)",
    +   "place-kind-chip-indoor_play (scrollWidth 142 > clientWidth 94)",
    +   "place-kind-chip-museum (scrollWidth 123 > clientWidth 94)",
    +   "place-kind-chip-splash_pad (scrollWidth 143 > clientWidth 94)",
    +   "place-kind-chip-library (scrollWidth 110 > clientWidth 94)",
    +   "place-kind-chip-beach (scrollWidth 106 > clientWidth 94)",
    +   "place-kind-chip-other (scrollWidth 101 > clientWidth 94)",
    + ]
```

Reverted with `git checkout -- src/components/PlaceDirectory.tsx`.

**Chip-row removal still turns the vacuous-pass guard red.** Scratch mutation wrapped
the entire chip row in `{false && (…)}`, removing it from the render tree. Rebuilt,
ran the spec:

```
1) [chromium] › e2e/place-filters.e2e.ts:104:3 › … › every trigger names its purpose and clips neither line

    Error: expect(locator).toBeVisible() failed

    Locator: getByTestId('place-kind-chip-row')
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found
```

Reverted with `git checkout -- src/components/PlaceDirectory.tsx`; `git diff --stat
b28773b..HEAD` shows only `e2e/place-filters.e2e.ts` (the three other-lane dirty files
— `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md` — were never staged or
touched).

### Verification (acceptances 4–5)

**Spec twice in a row on port 4216** (marker minted on 4216 via `auth.setup.ts`
before run 1; clean build before both runs):

```
--- RUN 1 ---
✓ 2 Open now keeps only places that are actually open… (3.9s)
✓ 3 Top rated toggles the review-based sort… (1.2s)
✓ 4 every trigger names its purpose and clips neither line (1.1s)
[V32-10a] coffee OFF rows=117 ON rows=11
✓ 5 the coffee toggle filters the directory… (1.4s)
✓ 6 the coffee empty state does not claim… (1.0s)
6 passed (17.9s)

--- RUN 2 ---
✓ 2 … (3.7s)   ✓ 3 … (1.2s)   ✓ 4 … (1.1s)   ✓ 5 … (1.5s)   ✓ 6 … (1.1s)
6 passed (17.7s)
```

**`npm run verify`** (with the brief's `ALLOW_CONFIG_CHANGE` waiver for the phone
lane's unstaged `vite.config.ts` change):

```
Test Files  91 passed (91)
     Tests  2689 passed (2689)
Found 88 warnings and 0 errors.
```

Note: `steering-lint` reports a pre-existing finding (`docs/agents/parallel-development.md
is not pointed to from AGENTS.md — unreachable steering`) that also exists on clean
HEAD `b28773b` (verified via `git stash`). This is not introduced by this slice.

Preview server on 4216 killed by port (`fuser -k 4216/tcp`). No push performed;
`origin/master` untouched.

### OPEN FINDINGS (none)

No further ocr-style concerns occurred to me during this round.

---

## FIX ROUND 2 (ocr round 2) — Sentinel `V33-0C-OCR-ROUND2-P8N6`, commit `b28773b`

All five ocr round-2 findings corrected in `e2e/place-filters.e2e.ts` (+56/−39 vs `ad738cc`).
Two of these are my brief's fault, not the builder's — noted below.

### Finding 1 (MEDIUM) — the clip gate passed vacuously when the chips were gone

`querySelectorAll('[data-testid^="place-kind-chip-"]…')` matching zero elements left
`offenders === []`, the poll resolved immediately, and the gate was green even though
"the filter row still renders at 390px" is exactly what it exists to pin. A regression
that deletes the chip row would pass.

**Fix:** assert `place-kind-chip-row` visible and a non-empty chip set BEFORE the clip
check. A regression that deletes the row now fails at the visibility assertion.

### Finding 2 (MEDIUM) — the "snapshot covers every row" assertion was tautological (my brief's fault)

`locator.evaluateAll` returns exactly one value per matched element by contract, so
`allCountTexts.length === countRows.count()` can never be partial. Its only possible
failure is a race between the two calls — a spurious flake, not a coverage failure. I
asked for it; it does not do what I said.

**Fix:** deleted it. The poll above it is the real assertion. Not replaced with another
shape of the same tautology.

### Finding 3 (MEDIUM) — the descendant walk false-positived on inline boxes

For `display: inline` boxes `clientWidth` is 0 while `scrollWidth` is engine-dependent,
so a non-clipping inline `<span>` could be flagged.

**Fix:** only test descendants with `clientWidth > 0` (a real layout box); inline boxes
are skipped. The button itself stays in the check regardless.

### Finding 4 (LOW) — the tolerance drifted: named `TOLERANCE` in one gate, a bare `+ 1` in the other

**Fix:** hoisted one module-level `CLIP_TOLERANCE` constant and passed it into both
`page.evaluate` callbacks (`page.evaluate((tol) => { … }, CLIP_TOLERANCE)`). Two
spellings of one number is the drift this repo hunts.

### Finding 5 (MEDIUM) — the gate silently excluded the rest of the same row

The 390px scroll row also renders, with identical `whitespace-nowrap shrink-0` pill
styling and therefore identical clip risk: `place-kind-placeholder-*` (Food/Cafe and
Zoo/Animals pills), `place-coffee-filter`, and `place-coffee-nearby` (the door). Its
failure message says "the 390px filter row", so the claim was wider than the check.

**Fix:** cover the whole row's pill controls via an explicit enumerated selector list
(kind chips, placeholder pills, coffee filter, coffee door); the scroll container itself
stays exempt (its overflow is the "still side-scrolls" feature).

### Mutation proofs (acceptances 1 + 2)

**Vacuous-pass guard:** scratch mutation in `src/components/PlaceDirectory.tsx` wrapped
the entire chip row in `{false && (… )}`, removing it from the render tree. Rebuilt,
restarted preview on 4213, ran the spec:

```
1) [chromium] › e2e/place-filters.e2e.ts:93:3 › … › every trigger names its purpose and clips neither line

    Error: expect(locator).toBeVisible() failed

    Locator: getByTestId('place-kind-chip-row')
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found
```

Reverted with `git checkout -- src/components/PlaceDirectory.tsx`.

**Widened selector survives the round-1 chip mutation:** re-applied the `w-24
overflow-hidden` kind-chip mutation from round 1. Rebuilt, ran the spec:

```
1) [chromium] › e2e/place-filters.e2e.ts:93:3 › … › every trigger names its purpose and clips neither line

    Error: the 390px filter row must clip no text

    - Array []
    + Array [
    +   "place-kind-chip-playground (scrollWidth 144 > clientWidth 94)",
    +   "place-kind-chip-indoor_play (scrollWidth 142 > clientWidth 94)",
    +   "place-kind-chip-museum (scrollWidth 123 > clientWidth 94)",
    +   "place-kind-chip-splash_pad (scrollWidth 143 > clientWidth 94)",
    +   "place-kind-chip-library (scrollWidth 110 > clientWidth 94)",
    +   "place-kind-chip-beach (scrollWidth 106 > clientWidth 94)",
    +   "place-kind-chip-other (scrollWidth 101 > clientWidth 94)",
    + ]
```

Reverted with `git checkout -- src/components/PlaceDirectory.tsx`; `git diff --stat
ad738cc..HEAD` shows only `e2e/place-filters.e2e.ts` (the three other-lane dirty files
— `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md` — were never staged or
touched).

### Verification (acceptances 3–5)

**Spec twice in a row on port 4213** (marker minted on 4213 via `auth.setup.ts` before
run 1; clean build before both runs):

```
--- RUN 1 ---
✓ 2 Open now keeps only places that are actually open… (3.9s)
✓ 3 Top rated toggles the review-based sort… (1.2s)
✓ 4 every trigger names its purpose and clips neither line (1.1s)
[V32-10a] coffee OFF rows=117 ON rows=11
✓ 5 the coffee toggle filters the directory… (1.4s)
✓ 6 the coffee empty state does not claim… (1.0s)
6 passed (12.9s)

--- RUN 2 ---
✓ 2 … (4.0s)   ✓ 3 … (1.2s)   ✓ 4 … (1.2s)   ✓ 5 … (1.5s)   ✓ 6 … (1.1s)
6 passed (18.6s)
```

**`npm run verify`** (with the brief's `ALLOW_CONFIG_CHANGE` waiver for the phone
lane's unstaged `vite.config.ts` change):

```
Test Files  91 passed (91)
     Tests  2689 passed (2689)
Found 88 warnings and 0 errors.
factory-guard check: all 185 checks passed.
===========================================================
GUARDS: PASS — all deterministic rules hold.
```

Matches the required baseline exactly: 91 / 2689 / 88 / 0 · GUARDS exit 0.

Preview server on 4213 killed by port (`fuser -k 4213/tcp`). No push performed;
`origin/master` untouched.

---

## FIX ROUND 1 (ocr findings) — Sentinel `V33-0B-OCR-ROUND1-J5R4`, commit `ad738cc`

All four ocr findings corrected in `e2e/place-filters.e2e.ts` (+85/−57 vs `2af490e`).

### Finding HIGH — the polled assertion was unreachable

The row's own rule (`plannedCopy`/`inviteLine`, from `planDirectoryList.upcomingCount`)
produces **four** states, not three:

| state | renders |
|---|---|
| `upcomingCount > 0` | "N drop-ins planned here" |
| `upcomingCount === 0` and no proof | "Be the first to start a drop-in here today!" |
| `upcomingCount === 0` and `dropInProofLine(proof) !== null` | **NEITHER** — documented behaviour: a place that has hosted keeps quiet (the historical proof line was removed from the row in the distill pass, `PlaceDirectory.tsx:1905-1918`) |
| `upcomingCount === null` (read not landed) | neither |

So "every row states its count" was never true — the third state is a legitimate
render, and asserting it would time out on a healthy app as hosting accumulates.
The invariant worth protecting is instead: the `upcomingStartTimes` READ still drives
the rows. It is one batched read for the whole directory, so when it lands, states 1
and 2 appear; when it is lost, `upcomingCount` is `null` for every row and the
directory goes entirely quiet. Now polls until at least one row states a positive
count OR the invite line — fails loudly exactly when the read is lost — and
separately asserts the snapshot covers every row. The four-state table is in the
comment, naming the quiet third state and its source line.

### Finding MEDIUM — `.toBe(await countRows.count())` re-introduced the stale snapshot

JS evaluates the `.toBe()` argument before the poll starts, freezing the expected
count at one instant while the actual count is re-read every poll. Moved the
comparison inside the callback: the poll now returns a boolean
(`countTexts.length > 0 && countTexts.filter(statesItsCount).length > 0`), asserted
`.toBe(true)` with no pre-evaluated argument.

### Finding LOW — the descendant walk was a no-op

`el.querySelectorAll('*')` with `desc.children.length === 0` matched nothing today:
the toggle and chips carry their label as a bare text node of the button, and their
only element children are `svg > path` (no text). Dropped the leaf-only restriction;
any descendant with non-whitespace text is now a clip candidate, which also catches
a future wrapping `<span class="overflow-hidden">` that clips its children while the
leaf text node measures fine. The comment matches what the code does.

### Finding LOW — the two geometry gates were one-shot

Both the clip gate and the page-widening gate now poll (`expect.poll(() =>
page.evaluate(...)).toEqual([])` and `.toBe(0)`) so a transient reflow (late webfont
swap, scrollbar appearing) is retried instead of failing the run.

### Mutation proof (acceptance 1 + 3)

Scratch mutation in `src/lib/places.ts` (`browsePlaces`): set `upcomingCount: null`
for every row (one-line change, parameter renamed `_upcomingStartTimes` to silence
the unused-variable error). Rebuilt, restarted preview on 4213, ran the spec:

```
1) [chromium] › e2e/place-filters.e2e.ts:93:3 › … › every trigger names its purpose and clips neither line

    Error: the upcoming-start-times read must drive at least one directory row (positive count or honest zero)

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate

      161 |       .toBe(true)
            ^
```

Reverted with `git checkout -- src/lib/places.ts`; `git diff --stat 2af490e..HEAD`
shows only `e2e/place-filters.e2e.ts` (the three other-lane dirty files —
`vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md` — were never staged or
touched).

### Verification (acceptances 5 + 6)

**Spec twice in a row on port 4213** (marker minted on 4213 via `auth.setup.ts`
before run 1; clean build before both runs):

```
--- RUN 1 ---
✓ 2 Open now keeps only places that are actually open… (3.8s)
✓ 3 Top rated toggles the review-based sort… (1.2s)
✓ 4 every trigger names its purpose and clips neither line (1.1s)
[V32-10a] coffee OFF rows=117 ON rows=11
✓ 5 the coffee toggle filters the directory… (2.4s)
✓ 6 the coffee empty state does not claim… (1.1s)
6 passed (13.9s)

--- RUN 2 ---
✓ 2 … (3.9s)   ✓ 3 … (1.2s)   ✓ 4 … (1.2s)   ✓ 5 … (1.4s)   ✓ 6 … (1.1s)
6 passed (17.9s)
```

**`npm run verify`** (with the brief's `ALLOW_CONFIG_CHANGE` waiver for the phone
lane's unstaged `vite.config.ts` change):

```
Test Files  91 passed (91)
     Tests  2689 passed (2689)
Found 88 warnings and 0 errors.
factory-guard check: all 185 checks passed.
===========================================================
GUARDS: PASS — all deterministic rules hold.
```

Matches the required baseline exactly: 91 / 2689 / 88 / 0 · GUARDS exit 0.

Preview server on 4213 killed by port (`fuser -k 4213/tcp`). No push performed;
`origin/master` untouched.

---

## What changed (one file: `e2e/place-filters.e2e.ts`, +73/−8)

**(a) Restored the lost 390px no-ellipsis assertion.** The comment at old `:100-108`
claimed *"the indoor toggle and the kind chips carry that assertion now"* — false:
v32-5 deleted the loop that did the `scrollWidth > clientWidth` check, leaving only
the toggle's visibility/name/`aria-pressed`. Now, after the count assertion settles:

- the **indoor toggle** (`places-indoor-filter`) and **every kind chip**
  (`place-kind-chip-*`, excluding the `place-kind-chip-row` container) are checked,
  element plus text-bearing leaf descendants, for `scrollWidth <= clientWidth + 1`;
  a failure names the culprit chip with its measured widths.
- the **page must not widen**: `document.documentElement.scrollWidth <=
  clientWidth + 1` at 390px.
- The scroll container itself is deliberately exempt — side-scrolling inside it is
  the "still side-scrolls" feature, not a defect (proven by the first green run:
  the container alone reported `scrollWidth 1640 > clientWidth 332`).
- All pre-existing assertions in the test kept (when-filter/sheet absence pins,
  toggle checks, distance-pill absence, location control). Test count unchanged: 6.

**(b) Fixed the one-shot snapshot race.** `countRows.evaluateAll(...)` was taken
once; `settleOnRoute` settles the route, not the data, so an unresolved
`upcomingStartTimesByPlace` left every row's `upcomingCount` null and the
disjunction failed with no retry. It now polls: `expect.poll` over the same
`evaluateAll`, same disjunction (`/\d+ drop-ins? planned here/` OR
`/Be the first to start a drop-in here/`), same testid, 20 s timeout, still
asserted for EVERY row. Only the timing changed.

The stale comment was rewritten to state what the code now does (both the top-of-test
comment and the inline gate comment).

## Mutation proof (acceptance 1 + 3)

Mutation in `src/components/PlaceDirectory.tsx` (kind chip class): added
`w-24 overflow-hidden` → rebuilt, restarted preview on 4213, ran the spec:

```
1) [chromium] › e2e/place-filters.e2e.ts:93:3 › … › every trigger names its purpose and clips neither line

    Error: the 390px filter row must clip no text (and the page must not widen)

    - Array []
    + Array [
    +   "kind chip [place-kind-chip-playground] (scrollWidth 144 > clientWidth 94)",
    +   "kind chip [place-kind-chip-indoor_play] (scrollWidth 142 > clientWidth 94)",
    +   "kind chip [place-kind-chip-museum] (scrollWidth 123 > clientWidth 94)",
    +   "kind chip [place-kind-chip-splash_pad] (scrollWidth 143 > clientWidth 94)",
    +   "kind chip [place-kind-chip-library] (scrollWidth 110 > clientWidth 94)",
    +   "kind chip [place-kind-chip-beach] (scrollWidth 106 > clientWidth 94)",
    +   "kind chip [place-kind-chip-other] (scrollWidth 101 > clientWidth 94)",
    + ]
```

(Note: a first mutation attempt of `overflow-hidden` alone passed — `whitespace-nowrap`
keeps the content width, so the button still measures unclipped. The `w-24` cap is
what makes the text actually clip. This confirms the check walks to the real geometry.)

Reverted with `git checkout -- src/components/PlaceDirectory.tsx`;
`git diff --stat 25dc518..HEAD` shows **only** `e2e/place-filters.e2e.ts` (the three
other-lane dirty files — `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`
— were never staged or touched).

## Verification (acceptance 2 + raw output)

**Spec twice in a row on port 4213** (marker minted on 4213 via `auth.setup.ts` each
run; clean build before both runs):

```
--- RUN 1 ---
✓ 2 Open now keeps only places that are actually open… (3.8s)
✓ 3 Top rated toggles the review-based sort… (1.2s)
✓ 4 every trigger names its purpose and clips neither line (1.1s)
[V32-10a] coffee OFF rows=117 ON rows=11
✓ 5 the coffee toggle filters the directory… (1.4s)
✓ 6 the coffee empty state does not claim… (1.1s)
6 passed (13.0s)

--- RUN 2 ---
✓ 2 … (4.0s)   ✓ 3 … (1.2s)   ✓ 4 … (1.2s)   ✓ 5 … (1.5s)   ✓ 6 … (1.1s)
6 passed (18.0s)
```

**`npm run verify`** (with the brief's `ALLOW_CONFIG_CHANGE` waiver for the phone
lane's unstaged `vite.config.ts` change):

```
Test Files  91 passed (91)
     Tests  2689 passed (2689)
Found 88 warnings and 0 errors.
factory-guard check: all 185 checks passed.
===========================================================
GUARDS: PASS — all deterministic rules hold.
```

Matches the required baseline exactly: 91 / 2689 / 88 / 0 · GUARDS exit 0.

## Acceptance criteria

1. ✅ 390px assertion exists and is mutation-proved (red run quoted above; reverted).
2. ✅ Count assertion polls; passed twice in a row on the same tree (runs 1–2 above).
3. ✅ `git diff 25dc518..HEAD` touches only `e2e/place-filters.e2e.ts`; `src/` clean.
4. ✅ No comment in the file states something the code does not do — the two stale
   blocks were rewritten; re-read the whole touched block.
5. ✅ Test count unchanged (6 tests in the file; suite total 2689).

## Side notes (not acted on)

- The first green run caught the container exemption bug (chip row reports
  `scrollWidth 1640 > clientWidth 332`); fixed by excluding `place-kind-chip-row`
  from the per-control check while keeping the document-widening check.
- Preview server on 4213 killed by port (`fuser -k 4213/tcp`). No push performed;
  `origin/master` untouched.