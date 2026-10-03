# Slice 8c — fresh-context VERIFICATION

**Verdict: VERIFY: FAIL.** Every deterministic lane is green and the central claim reproduces exactly
(780/780 same-server-second pairs byte-identical, 0 differing), but **one sentence added by this slice is
stronger than its mechanism and cannot be kept true** (`e2e/onboarding-kid-photo.e2e.ts:292` at `07c683e`),
which is the exact class this slice exists to remove (D-028/D-025). Details in §6. The peer review
(`.scratch/v28/reports/slice-8c-review.md`) already files this as its one blocking finding; I reproduced it
independently before reading that report, and it stands.

**Target:** `07c683e` (parent/dispatch base `33605d9`), branch `Meisburg/onboarding`, not pushed.
**Worktree tip:** `f53ab7e` = `07c683e` + the builder's report file only (`git diff 07c683e f53ab7e` touches
`.scratch/v28/reports/slice-8c.md` alone; the source and spec are byte-identical at both). All counts below
are measured at `07c683e` unless a line says otherwise.
**Diff:** 1 file, +18/−3 — `e2e/onboarding-kid-photo.e2e.ts` (`git diff --numstat 33605d9 07c683e`).
**Tree state:** `factory/work/v28-r2-8b.json` and `factory/work/v28-r2-8c.json` are modified by the
orchestrator (lane state), not by this slice; the reviewer's `slice-8c-review.md` is untracked. No source
file differs from the target after my work (hashes in §5).

---

## 1. The gate — `npm run verify`

**exit 0.** (`/tmp/verify-8c.log`, tail: `GUARDS: PASS — all deterministic rules hold.` / `EXIT=0`)

| measure | measured at `07c683e` | builder claimed |
|---|---|---|
| test files | **71 passed (71)** | 71 |
| tests | **2063 passed (2063)** | 2063 |
| lint warnings (`grep -c ': warning '`) | **81** | 81 |
| lint errors (`grep -c ': error '`) | **0** | 0 |
| `a11y:focus` | PASS | PASS |
| AGENTS.md words | **1789** (ceiling 1800) | 1789 |
| `GUARDS:` | **PASS** (exit 0) | PASS |

Raw:

```
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
   Duration  9.90s (transform 45%, tests 45%, import 9%, worker 1%)
...
  ok — AGENTS.md (1789 words, ceiling 1800)
...
factory-guard check: all 185 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
EXIT=0
```

## 2. The two guard checkers, run independently (not via verify)

- `node scripts/guards/factory-guard.check.mjs` → **exit 0**, `factory-guard check: all 185 checks passed.`
- `node scripts/guards/lib-sibling-guard.check.mjs` → **exit 0**, `PASS — all 17 checks: the guard fires on every seeded defect and only on them.`

Both **185** and **17** at `07c683e`; both match the builder.

## 3. The central claim — reproduced my own way

Builder claim: a live probe measured **825/825 same-server-second mint pairs byte-identical, 0 differing**,
settling the brief's unproven second-granularity question.

**I re-measured with a different probe** (`/tmp/mint-probe2.mjs`, raw HTTP against
`POST /storage/v1/object/sign/<bucket>/<path>`, not the app, not the builder's script): upload one tiny PNG
to the marker's own `kid-photos/<uid>/kids/<kidId>` path, then mint the same path **200 times sequentially**,
decode each returned token's payload, group by the **server's own `iat`**, and count every pair inside a
server second for byte-equality of the full composed URL; delete the object in a `finally`.

```
payload keys: ["url","scope","iat","exp"]
payload: {"iat":1790986814,"exp":1790990414} ttl sec = 3600
total mints: 200
server seconds: 24 (S .. S+23)
mints per second: 1,7,7,8,9,9,8,9,9,9,9,10,9,9,9,10,8,9,10,9,9,9,10,4
TOTAL same-server-second mint pairs: 780
  byte-identical pairs: 780
  differing pairs:      0
  seconds containing BOTH identical and differing pairs: 0
distinct full URLs: 24 across 200 mints
cleanup delete status 200
```

**780/780, 0 differing** — same shape as the builder's 825/825 (the absolute number is a function of mint
rate × wall time; 24 server seconds here vs 22 there). The *claim* reproduces: a re-mint inside one server
second returns byte-identical bytes, so `src` equality cannot see it.

A second, targeted probe (same path, controlled gaps) settles the boundary the slice's new wait relies on.
Values withheld from the fenced block because pasting an epoch after `at` reddens the guard — which is
finding §7; the four rows are two mints per gap:

| gap (ms) | client Δ (ms) | server-second Δ | byte-identical |
|---|---|---|---|
| 0 | 258 | 0 | yes |
| 1100 | 1272 | 2 | no |
| 0 | 122 | 0 | yes |
| 2500 | 2625 | 3 | no |

The mechanism (payload `{url, scope, iat, exp}`, whole-second `iat`/`exp`, TTL 3600 s = `FAMILY_PHOTO_URL_TTL_SECONDS`,
`src/lib/photoStorage.ts:84`) is independently checkable; my decode of a live token confirms the shape and
that nothing else varies per mint.

## 4. The four e2e runs

All four green; no red observed; none of the five named flake modes fired. No listener was killed (port 4173
was free at start and released by each run's own teardown; verified free again after).

- `e2e/onboarding-kid-photo.e2e.ts` **run #1** — exit 0, **6 passed (36.1s)**.
- `e2e/onboarding-kid-photo.e2e.ts` **run #2** — exit 0, **6 passed (35.1s)**.
- `e2e/name-card-photo.e2e.ts` **run #1** — exit 0, **2 passed (13.8s)**.
- `e2e/name-card-photo.e2e.ts` **run #2** — exit 0, **2 passed (14.2s)**.

Builder's "6 passed"/"2 passed" confirmed. Tails:

```
  ✓  1 [setup] › e2e/auth.setup.ts:66:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (3.6s)
  ✓  2 [chromium] › e2e/onboarding-kid-photo.e2e.ts:198:1 › a kid added with a photo lands in kid-photos and Continue never double-writes it (6.4s)
  ✓  3 ... removing a photo-confirmed row removes the REAL row (not just the local state) (4.2s)
  ✓  4 ... fix round 1 (F1): a blank row's photo is skipped and a name-only row's is refused ... (3.0s)
  ✓  5 ... fix round 1 (F2/F5): a persisted row removed from a non-empty list leaves the survivor intact ... (4.9s)
  ✓  6 ... fix round 2 (R1): a re-picked photo on a persisted row re-mints and the card shows the NEW image (7.4s)

  6 passed (35.1s)
```

```
  ✓  1 [setup] › e2e/auth.setup.ts:66:1 › sign up the marker, onboard it ... (3.6s)
  ✓  2 [chromium] › e2e/name-card-photo.e2e.ts:127:1 › the name card photo lands on the profiles row ... (5.2s)

  2 passed (14.2s)
```

## 5. The mutation — both halves, reproduced

App mutation: `src/pages/OnboardingPage.tsx:481`, the F3 memo key `[persistedKidKey]` →
`[kidRows, persistedKidKey]` (the pre-fix keying; `persistedKidKey` had to stay in the list or `tsc -b`
fails TS6133, as the builder recorded). Restored byte-exactly afterwards.

**Half 1 — the count assertion FAILS** (`npx playwright test e2e/onboarding-kid-photo.e2e.ts -g "Continue never double-writes" --no-deps`, **exit 1**):

```
    Error: keystrokes must not re-mint the other rows' signed URLs (F3: the memo is keyed on the id set, not the row array)
    expect(received).toBe(expected) // Object.is equality

    Expected: 0
    Received: 6

      280 |     signRequests.length - mintsBeforeKeystrokes,
      281 |     'keystrokes must not re-mint the other rows' signed URLs (F3: ...)',
    > 282 |   ).toBe(0)
    [chromium] › e2e/onboarding-kid-photo.e2e.ts:198:1 › a kid added with a photo lands in kid-photos and Continue never double-writes it
  1 failed
```

**Half 2 — restored, it PASSES** (same command, exit 0): `✓ 1 ... Continue never double-writes it (6.1s)` /
`1 passed (11.4s)`. (The two full green spec runs in §4 are the same half-2 evidence at full-file scope.)

**Restoration proof:** after restore, `sha256sum` = `0db5d4da11b40561d0bc0864145a6df60e7db1d8e59fd0815a63db581d9bbf0d`
(`src/pages/OnboardingPage.tsx`) and `67bb935a069eeee10b6f85d311325b7fe835eb66195db95ee92eb198033e8b8d`
(`e2e/onboarding-kid-photo.e2e.ts`), `git diff` shows neither file, and `grep -c "MUTATION\|TEMP\|DEBUG"` = 0/0.

**The builder's extra measurement does NOT establish what it claims.** The builder's strongest evidence is
"under the same mutation, the count neutralised, S1 PASSED — 6 re-mints fired and the src equality did not
notice, because all six minted byte-identical bytes inside the second." I reproduced the *observation*
(count = 6, `src` equal, S1 passes) but instrumented it per keystroke and it does **not** support the stated
*reason*:

- With no per-keystroke pause, the last keystroke's sign request fires and its URL has **not yet rendered**
  when the assertion reads `src` (per-keystroke logging shows the render lags the mint by ~250 ms+). The
  pass is equally explained by read-before-render as by same-second bytes.
- Keeping the app mutation, neutralising M1, and adding a **1500 ms wait after the last keystroke** (so the
  last re-mint's URL has rendered) makes S1 **FAIL** — two different tokens, `iat` 1790987274 vs 1790987276:

```
    Expected: "https://.../kids/...?token=...ImV4cCI6MTc5MDk5MDg3NH0...
    Received: "https://.../kids/...?token=...WUsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3OTA5ODcyNzYs...
    > 298 |   ).toBe(srcAfterAdd)
  1 failed
```

So the same-second *masking mechanism* is real (proved by the 780/780 probe), but the test-based
demonstration is non-diagnostic: it cannot tell masking from a read that outran the DOM update. **S1 is not
blind — it fails on a cross-second re-mint.** This is the evidence behind §6's finding.

## 6. The diff against the rule — "strong enough to fail for the reason it names"

**S1 — `e2e/onboarding-kid-photo.e2e.ts:293-296` (message) at `07c683e`: PASSES the rule.**
The message now says the equality is "corroboration of the mint-count assertion above, which is the evidence
… a same-second re-mint is byte-identical", i.e. it names what it proves (the src stayed put), where the
evidence is (the count), and the exact limit (same-second re-mints). It is correctly scoped.

**S1's own comment — `:292` (added by this slice): FAILS the rule.** The sentence
*"This assertion therefore cannot see a re-mint the count catches."* drops the "inside one second" qualifier
its own premise carries (`:291`) and states a limit the mechanism does not have. A cross-second re-mint
yields a different `iat`/`exp`, a different token, and `.toBe(srcAfterAdd)` **fails** — I measured exactly
that (§5, the 1500 ms run: `Expected …274 / Received …276`, test red). The expect message three lines later
already scopes it correctly; the comment's absolute summary cannot be kept true. Per D-028 it should be
deleted or qualified (e.g. "…cannot see a *same-second* re-mint the count catches"), not restated as an
absolute — as written it is an argument for deleting the one assertion that watches the DOM.

**S2 — `e2e/onboarding-kid-photo.e2e.ts:703` (message) + the wait at `:667`: PASSES the rule.** The message
says the swap is "corroboration of the fresh-mint count above, not its proof", names the granularity limit,
and points at the count. With the 1100 ms wait the geometry is phase-independent — any two mints > 1000 ms
apart in server time necessarily land in different seconds — which my boundary probe confirms (1100 ms and
2500 ms gaps both produced different bytes; 0 ms produced identical). So S2 now fails only for its named
reason (no fresh mint).

**No other claim in the test file is stronger than its mechanism**, with one honest caveat:
- the pre-fix observation comment at `:248-256` (`"…the settled photo's src swapped to the fresh URL each
  time / the <img> reloaded on every keystroke"`) is preserved and *may* be true of the original slow
  measurement, but it is not reproducible from a fast run: under the pre-fix mutation I measured 6 re-mints
  with the src **unchanged** at read time (§5). The two explanations (same-second bytes vs read-before-render)
  are not distinguished by that comment. It is attested past measurement, so I do not call it false — but it
  is now load-bearing as the only evidence that S1 is "armed", and it does not carry that on this tree.
- M1's message (`:281`) says the memo is "keyed on the id set", while the R1 key is
  `${id}:${photo marker}:${photoGen}` (`src/pages/OnboardingPage.tsx:470-474`). That under-describes, it does
  not over-claim; the builder declared it (report §7 #2). Not a rule violation.

## 7. The guard question — is `count-provenance` over-triggering on a 10-digit epoch? **YES. Real guard defect, not this slice.**

`scripts/guards/factory-guard.mjs` `COUNT_AT_SHA` = `(?:COUNT_TOKEN … at <sha> | at <sha> … COUNT_TOKEN)`
with `SHA_TOKEN = [0-9a-f]{7,40}`. Two properties compound:

1. **The `at` arm has no left boundary.** The alternative is a bare `at\s+…`, so it matches the `at` inside
   `iat`, `format`, `xxxat`, etc.
2. **A decimal integer is `[0-9a-f]`.** A 10-digit server epoch is a valid `SHA_TOKEN` (7–40 hex chars).

The trigger is the epoch immediately followed (within `COUNT_GAP`, ≤5 tokens) by a count label, which is
exactly the shape of a per-second mint summary. Measured, end to end: three such lines seeded into a temp
root produce **three** `count-provenance-unresolvable` findings and the run reports `3 unresolvable`:

Input (ONE line each; shown here split so this report does not itself redden the guard — that is the finding):

```
        iat 1790985632
        7 mints, 1 unique
        iat 1790985633
        7 mints, 1 unique
        iat 1790985634
        6 mints, 1 unique
```

Guard output (`node scripts/guards/factory-guard.mjs --root /tmp/fg-root --repo <repo>`):

```
  note — count-provenance: 3 provenance token(s) in the scan, 3 distinct sha(s) resolved ... — 3 unresolvable
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/probe.md:4: a count's provenance names 1790985632, which is not a commit in this repository (`git cat-file -e 1790985632^{commit}` fails) — name a commit a reader can resolve
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/probe.md:5: a count's provenance names 1790985633, which is not a commit in this repository (`git cat-file -e 1790985633^{commit}` fails) — name a commit a reader can resolve
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/probe.md:6: a count's provenance names 1790985634, which is not a commit in this repository (`git cat-file -e 1790985634^{commit}` fails) — name a commit a reader can resolve
```

Notes on the fix shape:
- Adding `\b` before the `at` arm kills the `iat` case but **not** the plain-word one: the same input written with the word `at` in prose (a word, a space, the epoch digits, a space, then the count label) still matches — measured, 1 match with `\b`, 1 without.
- Excluding pure-decimal runs would make a genuine all-digit commit prefix (a real, ~3% chance per 7-char prefix: (10/16)^7 = 3.2%) unresolvable-by-omission, so it is not a clean fix either.
- This is a **false positive on a correct report**; the builder's mitigation (collapse the epoch column to `S`, `S+1`) works but is a workaround the writer must know to apply. It belongs in the guard's ceiling/known-shape list, or the arm wants a left boundary plus a decimal exclusion rule. **It is a finding about the guard; it is not a defect of `e2e/onboarding-kid-photo.e2e.ts`.**

## 8. Residual risks / notes

1. **Counts at `07c683e`.** The worktree tip `f53ab7e` differs only by the builder's report; no count above
   would move if re-read there.
2. **The verdict turns on §6.** Deterministically the slice is clean; the FAIL is the one added sentence at
   `:292`, which is a one-clause fix. I did not edit it (read-only lane).
3. **The builder's §4 "strongest evidence" is non-diagnostic** (§5). The slice's premise survives on the
   probe alone; the report's evidence sentence should not be relied on as stated.
4. **I did not re-measure the builder's exact 1057 ms / 57 ms** (a prior run's timings); my own re-pick
   geometry supports the mechanism and the wait's phase-independence.
5. **Probe side effects:** one marker-owned object written and deleted (delete status 200); no accounts
   created; no inference server touched; probes and temp roots live only in `/tmp`.
6. `factory/work/v28-r2-8b.json` / `v28-r2-8c.json` are orchestrator-modified in the tree (not this slice);
   `slice-8c-review.md` is untracked. I touched none of them.
7. **This report itself is guard-clean.** With `slice-8c-verify.md` on disk, `node scripts/guards/factory-guard.mjs` exits **0** (the only note is the untracked-file disclosure). The raw `iat <epoch>` lines were kept out of scan range exactly as §7 describes.

---

## Acceptance report

_See the JSON block in the final response._
