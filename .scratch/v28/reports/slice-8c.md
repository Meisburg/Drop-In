# Slice 8c — the kid-photo spec's mint/`src` assertions, honest under second-granular tokens

**Committed as: `07c683e`** (branch `Meisburg/onboarding`, dispatched from `33605d9`; not pushed).

**Files changed (1, +18/−3):**

| file | +/− | what |
|---|---|---|
| `e2e/onboarding-kid-photo.e2e.ts` | +18 / −3 | test 1's `src` equality relabelled as corroboration of the mint count and its granularity limit stated; test 5's `src` swap made deterministically observable (1100 ms past the token's second boundary) and relabelled as corroboration of the fresh-mint count |

No other file was touched. `factory/work/v28-r2-8b.json` is modified in the working tree **by someone else** and was left out of the commit (staged by explicit path only; `git add -A` was not used).

---

## 1. The enumeration (acceptance item 1)

Command:

```
grep -nE "signRequests|getAttribute\('src'\)|srcAfterAdd|srcBefore|srcAfter|mintsBefore|token=" e2e/onboarding-kid-photo.e2e.ts
```

Output:

```
233:  const imgSrc = (await img.getAttribute('src')) ?? ''
238:  expect(imgSrc, 'and it must be a SIGNED url').toContain('token=')
257:  const signRequests: string[] = []
259:    if (req.url().includes('/object/sign/')) signRequests.push(req.url())
267:  const srcAfterAdd = (await img.getAttribute('src')) ?? ''
271:  const mintsBeforeKeystrokes = signRequests.length
280:    signRequests.length - mintsBeforeKeystrokes,
288:    (await img.getAttribute('src')) ?? '',
290:  ).toBe(srcAfterAdd)
629:    const srcBefore = (await img.getAttribute('src')) ?? ''
630:    expect(srcBefore, 'the photo must render from a signed URL').toContain('token=')
653:    const signRequests: string[] = []
655:      if (req.url().includes('/object/sign/')) signRequests.push(req.url())
663:    const mintsBeforeConfirm = signRequests.length
678:          signRequests.length,
680:        ).toBeGreaterThan(mintsBeforeConfirm)
687:          (await img.getAttribute('src')) ?? '',
689:        ).not.toBe(srcBefore)
693:    const srcAfter = (await img.getAttribute('src')) ?? ''
694:    expect(srcAfter, 'the swapped src must be a fresh signed URL').toContain('token=')
```

Classified:

**Mint-count assertions (they count `/object/sign/` requests):**
- **M1** `:278-282` (test 1, F3) — `expect(signRequests.length - mintsBeforeKeystrokes).toBe(0)`, **negative**. This is the **strong** assertion; it catches a re-mint independently of whether the URL changed.
- **M2** `:675-682` (test 5, R1) — `expect(signRequests.length).toBeGreaterThan(mintsBeforeConfirm)`, **positive**. The strong assertion for R1: the regressed keying fires no mint at all.

**`src`-comparison assertions (two `src` values compared):**
- **S1** `:287-290` (test 1, F3) — `expect(src).toBe(srcAfterAdd)`, **equality**. The brief's subject. **Weak by construction**: a re-mint inside one second is byte-identical, so this equality cannot see one; M1 is the evidence.
- **S2** `:684-692` (test 5, R1) — `expect(src).not.toBe(srcBefore)`, **inequality**. Weak in the opposite direction: a same-second fresh mint is byte-identical, so the swap it names as "the card shows the NEW image" is **unobservable**, and the assertion false-fails. M2 is the evidence a fresh mint fired.

**`src`-shape assertions (single value, not a comparison) — enumerated for completeness, not comparisons:**
- `:234` `toContain('kid-photos')`; `:235-237` `not.toContain('/object/public/')`; `:238` `toContain('token=')`.
- `:630` `toContain('token=')`; `:694` `toContain('token=')`.

**Not assertions** (captures / listeners / reads): `:233, :257-259, :267, :271, :629, :653-655, :663, :693`. The four `toBeVisible()`/`toBeHidden()` calls near the images are visibility, not `src`.

---

## 2. The token-granularity finding — **SETTLED** (a re-mint inside one second IS byte-identical)

Settled **by measurement against the live project**, not by reading storage-api's source. Probe: sign a fresh viewer up with the anon key, upload a tiny object to that viewer's own `kid-photos/<uid>/kids/<kidId>` (so the sign path is real), then mint the path repeatedly and compare.

**(a) The token's shape.** Decoding one mint:

```
JWT header:  {"kid":"5ac44fd8-6390-41f7-9a30-08774bd7fbc8","alg":"HS512"}
JWT payload: {"url":"kid-photos/<uid>/kids/<kidId>","scope":"download","iat":1790985632,"exp":1790989232}
JWT sig len: 86
```

The only time fields are `iat`/`exp`, both **whole seconds**; the `kid` header is constant across mints; nothing else varies. The URL the client composes is `<supabaseUrl>/storage/v1<relative signedURL>` with no per-mint query suffix (`createSignedUrls` adds `download`/`cacheNonce` only when asked, and the app asks for neither).

**(b) The measurement.** 200 sequential mints, grouped by the **server's own `iat`** (not the client clock — a client-clock grouping straddles the boundary and misleadingly shows 2 unique URLs per client-second). Raw output below, with the consecutive server-second column collapsed from its 10-digit epoch to `S`, `S+1`, … **because `factory-guard` reads a 10-digit epoch after the substring `at` as a commit sha in provenance position** (the guard's own `count-provenance-unresolvable`); the numbers are server-clock seconds, not commits:

```
epoch S     7 mints, 1 unique
epoch S+1   7 mints, 1 unique
... (22 consecutive server seconds, every one 1 unique) ...
epoch S+21  6 mints, 1 unique
TOTAL same-server-second mint pairs: 825
  byte-identical pairs: 825
  differing pairs:      0
  server seconds containing BOTH an identical and a differing pair: 0
```

**825 of 825 same-second pairs are byte-identical; 0 differ.** Conclusion: a re-mint within one second yields a byte-identical URL, so any assertion whose only signal is `src` equality/inequality can be masked by (or false-fail on) token granularity. The probe script is not committed (adding one would be a new file outside this slice); the mechanism is independently checkable by base64-decoding any `?token=` from DevTools. Two probe accounts (`e2e-okp-gran-*`) were created and left for the `e2e-` sweep; the probe objects were deleted.

---

## 3. What changed, assertion by assertion (acceptance item 2)

**S1 (`:287-290`) — labelled.** The message no longer reads *"no re-mint => no swap"* (which inferred the cause from the wrong signal). It now attributes the evidence to **M1 above** and names the limit; a 6-line comment above it states the mechanism (the `{url, scope, iat, exp}` payload). It was **not** strengthened, because it cannot be: with no re-mint the resolved URL is the *same string*, so there is nothing stronger for it to assert — M1 is the assertion that fails for the named reason.

**M1 / M2 — already strong, left as-is.** M1 carries the F3 claim, M2 carries the R1 claim. M1's message says the memo is keyed on "the id set"; post-R1 the key is `${id}:${photo marker}:${photoGen}`. I left it (the keystroke-path claim is still true, and the R1 comment already explains the generation), but flag it under *did not anticipate* #2.

**S2 (`:684-692`) — strengthened *and* labelled.** Two things:
1. **The false-fail had to be removed.** Measured: the two mints landed **1057 ms apart** (server `iat` `1790986035` → `1790986036`; client timestamps `1790986035405` → `1790986036462`) — **57 ms of margin** above the one-second boundary. A slightly faster run mints the *same bytes* and the swap assertion false-fails for a reason it does not name. A `await page.waitForTimeout(1100)` now sits just before the re-pick, so the re-pick's mint is guaranteed to be in a later server second (re-measured after the wait: `iat` `1790986116` → `1790986119`, gap 2463 ms). The assertion now fails only for its named reason — no fresh mint.
2. The message now says the swap is **corroboration of M2, not its proof**, and names the granularity limit.

**Not touched:** the pre-fix observation comment (`:249-256`, *"measured: it never BLANKED … the <img> reloaded on every keystroke"*) is byte-identical — it still describes what was measured. The spec header is untouched.

The diff is +18/−3, one file.

---

## 4. Non-vacuity proof — both halves (acceptance item 4)

**The mutation** (`src/pages/OnboardingPage.tsx`, the memo keying the assertions name; **restored after** — `git diff` for that file is empty):

```
-    [persistedKidKey],
+    [kidRows, persistedKidKey], // MUTATION (slice 8c non-vacuity): the pre-fix F3 keying
```

(`persistedKidKey` had to stay in the dep list or `tsc -b` fails with TS6133 *'persistedKidKey is declared but never read'* — the first mutation attempt only changed the array to `[kidRows]` and the webServer refused to start, exit 2. Recorded because it is the kind of first-try failure worth not repeating.)

**Half 1 — the count assertion FAILS** (`npx playwright test e2e/onboarding-kid-photo.e2e.ts -g "Continue never double-writes" --no-deps`, exit 1):

```
  ✘  1 [chromium] › e2e/onboarding-kid-photo.e2e.ts:198:1 › a kid added with a photo lands in kid-photos and Continue never double-writes it (5.9s)


  1) [chromium] › e2e/onboarding-kid-photo.e2e.ts:198:1 › a kid added with a photo lands in kid-photos and Continue never double-writes it

    Error: keystrokes must not re-mint the other rows’ signed URLs (F3: the memo is keyed on the id set, not the row array)

    expect(received).toBe(expected) // Object.is equality

    Expected: 0
    Received: 6

      280 |     signRequests.length - mintsBeforeKeystrokes,
      281 |     'keystrokes must not re-mint the other rows’ signed URLs (F3: the memo is keyed on the id set, not the row array)',
    > 282 |   ).toBe(0)
          |     ^

  1 failed
    [chromium] › e2e/onboarding-kid-photo.e2e.ts:198:1 › a kid added with a photo lands in kid-photos and Continue never double-writes it
```

**Half 2 — restored, it PASSES** (`npx playwright test e2e/onboarding-kid-photo.e2e.ts`, exit 0 — this is also acceptance run #1):

```
[e2e cleanup] ok — deleted f6c9f32f-0afe-4267-a95b-6e887d773767's kid rows + kid-photo object
  ✓  2 [chromium] › e2e/onboarding-kid-photo.e2e.ts:198:1 › a kid added with a photo lands in kid-photos and Continue never double-writes it (6.2s)
...
  6 passed (35.0s)
```

**The extra measurement, and it is the strongest evidence in this slice.** Under the **same** app mutation, I temporarily neutralised M1 alone (the count) to expose S1, and **S1 PASSED** — 6 re-mints fired and the `src` equality did not notice any of them, because all six minted byte-identical bytes inside the second:

```
TEMP MUTATION (slice 8c non-vacuity): count assertion neutralised to expose the src equality below
  ✓  1 [chromium] › e2e/onboarding-kid-photo.e2e.ts:198:1 › a kid added with a photo lands in kid-photos and Continue never double-writes it (6.6s)

  1 passed (11.9s)
```

That is the masking the slice is about, reproduced live: **S1 is a false-pass assertion**; the count is the evidence. Both temporary edits (app + test) were restored; the final diff is +18/−3 against `07c683e`'s parent, with no `MUTATION`/`TEMP` marker left in either file (`grep -c` → 0/0).

---

## 5. Acceptance runs — raw tails (acceptance item 5)

**`npx playwright test e2e/onboarding-kid-photo.e2e.ts` — run #1, exit 0:**

```
  ✓  1 [setup] › e2e/auth.setup.ts:66:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (3.6s)
[e2e cleanup]: ok — deleted f6c9f32f-… kid rows + kid-photo object
  ✓  2 [chromium] › e2e/onboarding-kid-photo.e2e.ts:198:1 › a kid added with a photo lands in kid-photos and Continue never double-writes it (6.2s)
  ✓  3 [chromium] › e2e/onboarding-kid-photo.e2e.ts:354:1 › removing a photo-confirmed row removes the REAL row (not just the local state) (4.7s)
  ✓  4 [chromium] › e2e/onboarding-kid-photo.e2e.ts:425:1 › fix round 1 (F1): a blank row’s photo is skipped and a name-only row’s is refused — neither writes anything (3.1s)
  ✓  5 [chromium] › e2e/onboarding-kid-photo.e2e.ts:498:1 › fix round 1 (F2/F5): a persisted row removed from a non-empty list leaves the survivor intact and Continue un-stranded (4.7s)
  ✓  6 [chromium] › e2e/onboarding-kid-photo.e2e.ts:605:1 › fix round 2 (R1): a re-picked photo on a persisted row re-mints and the card shows the NEW image (7.1s)

  6 passed (35.0s)
```

**`npx playwright test e2e/onboarding-kid-photo.e2e.ts` — run #2, exit 0:**

```
  ✓  1 [setup] › e2e/auth.setup.ts:66:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (3.7s)
[e2e cleanup]: ok — deleted a75b99f1-… kid rows + kid-photo object
  ✓  2 [chromium] › e2e/onboarding-kid-photo.e2e.ts:198:1 › a kid added with a photo lands in kid-photos and Continue never double-writes it (7.2s)
  ✓  3 [chromium] › e2e/onboarding-kid-photo.e2e.ts:354:1 › removing a photo-confirmed row removes the REAL row (not just the local state) (4.2s)
  ✓  4 [chromium] › e2e/onboarding-kid-photo.e2e.ts:425:1 › fix round 1 (F1): a blank row’s photo is skipped and a name-only row’s is refused — neither writes anything (3.1s)
  ✓  5 [chromium] › e2e/onboarding-kid-photo.e2e.ts:498:1 › fix round 1 (F2/F5): a persisted row removed from a non-empty list leaves the survivor intact and Continue un-stranded (4.7s)
  ✓  6 [chromium] › e2e/onboarding-kid-photo.e2e.ts:605:1 › fix round 2 (R1): a re-picked photo on a persisted row re-mints and the card shows the NEW image (6.8s)

  6 passed (35.2s)
```

**`npx playwright test e2e/name-card-photo.e2e.ts` — run #1, exit 0:**

```
  ✓  1 [setup] › e2e/auth.setup.ts:66:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (4.0s)
[e2e cleanup]: ok — deleted cf8060d3-… avatar object + nulled avatar_url
  ✓  2 [chromium] › e2e/name-card-photo.e2e.ts:127:1 › the name card photo lands on the profiles row (object in the bucket + avatar_url set) (4.7s)

  2 passed (14.3s)
```

**`npx playwright test e2e/name-card-photo.e2e.ts` — run #2, exit 0:**

```
[e2e cleanup]: ok — deleted 7fc9af35-… avatar object + nulled avatar_url
  ✓  2 [chromium] › e2e/name-card-photo.e2e.ts:127:1 › the name card photo lands on the profiles row (object in the bucket + avatar_url set) (4.6s)

  2 passed (13.6s)
```

No red run was observed; none of the five named flake modes fired.

---

## 6. The gate (acceptance item 5)

`npm run verify` → **exit 0**, measured at `07c683e`:

- test files: **71 passed (71)**
- tests: **2063 passed (2063)**
- lint: **0 errors, 81 warnings** (`oxlint`, unchanged from the batch baseline)
- `a11y:focus` PASS; `steering-lint` ok (AGENTS.md 1789/1800); **GUARDS: PASS**
- the two checkers verify does not name, run separately: `node scripts/guards/factory-guard.check.mjs` → **exit 0, all 185 checks passed**; `node scripts/guards/lib-sibling-guard.check.mjs` → **exit 0, all 17 checks passed**.

---

## 7. What the brief did not anticipate (acceptance item 3 & the "say it" rule)

1. **S2 was a false-FAIL, not just a weak assertion — and the margin is 57 ms.** The brief's rule is about a *masked* failure (a false pass). S2 has the mirror-image defect: a same-second fresh mint is byte-identical, so the swap is unobservable and the assertion fails for a reason it does not name. I measured the two mints at 1057 ms apart (57 ms of margin) and fixed it with a boundary-crossing wait rather than labelling a flake. **This is an added line the brief did not ask for; if the orchestrator prefers a comment-only change, this is the line to revert.**
2. **The count assertion's message is imprecise post-R1.** M1 (`:281`) and the header both say the memo is keyed on "the id set"; the R1 fix made the key `${id}:${photo marker}:${photoGen}`. The keystroke claim still holds (a keystroke changes none of them), so I left the wording alone rather than expand — but a reviewer should read "id set" as shorthand.
3. **A product consequence, reported not fixed (a second subject).** The R1 fix re-mints, but a **same-second re-pick mints a byte-identical URL, so the `<img>` does not re-fetch and the fresh photo stays invisible for the rest of the mount** — the exact R1 bug, surviving inside a sub-second window. A human re-pick (select file → crop → confirm) is normally ≥ 1 s, so this is a latent window, not a live regression; the structural fix is `createSignedUrls(paths, ttl, { cacheNonce })`, which the app does not pass. Out of this slice's scope; flagged for the orchestrator.
4. **The F3 settle-window flake is untouched.** The fixed 800 ms before `srcAfterAdd` (the ledger calls it "the F3 test's flake window", assigned to 8b) can still let the "Add another kid" mint land inside the keystroke window and fail M1. Not this slice's subject; not touched.
5. **Scope note.** The ledger's earlier, broader intent for 8c was "EVERYTHING in `e2e/onboarding-kid-photo.e2e.ts`" (timing flakes, the status-check class, `mr.json()`, the cast, the header overstatement). The dispatched brief is narrow and says do not expand, so I did not.
6. **`e2e/name-card-photo.e2e.ts` carries no mint or `src` assertion at all** (grep for `signRequests|getAttribute('src')|token=` → no output). Its two runs were a regression check of the shared mint path, not a second subject.

## 8. Unresolved questions

- Should the same-second re-pick product window (#3) be closed with `cacheNonce`, or left latent? Owner: orchestrator.
- Should S1 be deleted rather than labelled? The brief says "say so in the message", so I kept it; the label is the honest form. **Correction (see the closing note):** the earlier phrasing "it can only false-pass" was a false universal — S1 is masked only on a *same-second* re-mint, and it correct-fails on a cross-second one (a different `iat`/`exp` yields a different token, so `.toBe(srcAfterAdd)` fails), so its DOM leg is real coverage, not a dead assertion.

---

## Closing note — the one-word scope fix (round 2)

Both lanes independently converged on the same sentence and the same repair. `slice-8c-verify.md` (§6) and `slice-8c-review.md` (blocking finding) each measured that `e2e/onboarding-kid-photo.e2e.ts:292`'s *"This assertion therefore cannot see a re-mint the count catches"* dropped the same-second qualifier its own premise at `:291` carries, and read absolutely claimed a limit the mechanism does not have — the exact D-025/D-028 class this slice exists to remove.

**Both lanes' evidence that the absolute claim is false:**

- **Review** (`slice-8c-review.md`): a re-mint crossing the second boundary yields a different `iat`/`exp`, hence a different token, hence a different URL — and this assertion's own `.toBe(srcAfterAdd)` at `:294-296` fails on it. That capability is not theoretical: it is the pre-fix measured symptom the file's untouched observation comment records at `:248-256`.
- **Verifier** (`slice-8c-verify.md` §5): with a 1500 ms render wait added under the app mutation, S1 **FAILS with two different tokens** (the two tokens carry `iat` values two seconds apart). So the assertion is not blind — it is blind only to a re-mint that lands in the SAME second.

**Fix applied:** `:292` now reads "…cannot see a **same-second** re-mint the count catches." One word; zero behavioural change; `:294-296` and test 5 untouched. The cross-second arm is real coverage — the reason S1 is KEPT rather than deleted — and its DOM leg (watching the visible `src` while M1 watches the network) is independent of the count.

**Corrected §8 sentence.** The old bullet asked *"Should S1 be deleted (it can only false-pass)?"* — that universal was the same error in another place. Corrected: *"Should S1 be deleted rather than labelled? Kept — S1 is masked only on a same-second re-mint and correct-fails on a cross-second one, so its DOM leg is real coverage; the brief says 'say so in the message', and the label is the honest form."*

Nothing else in this report changes; the mechanism findings in §2–§7 stand.
