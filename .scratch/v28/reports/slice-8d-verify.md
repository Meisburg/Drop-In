# Slice 8d — VERIFICATION (fresh context, the last slice of the batch)

**VERDICT: VERIFY: PASS**

**Subjects verified at:** code `5f575e0` (`5f575e020fc9ac1c4357e41bd5bd51c857de4f26`) + report `5711c69`.
Every count below is a run at `5f575e0`; the checkout I ran in was `e2fc1f4`
(clean), and `git diff --stat 5f575e0 e2fc1f4 -- src/pages/OnboardingPage.tsx
e2e/signup-zip-fallback.e2e.ts` is **empty** — the two files this slice touched
are byte-identical between the two shas, so the counts belong to `5f575e0`.
Mutation runs were on a throwaway `git clone` in `/tmp/v8d-clone` (clone base
`e2fc1f4`, source reverted to `5f575e0^`). The repo was not modified; no lane
report was edited; nothing pushed.

Builder's claims vs measured (all `5f575e0`): 71 test files / 2063 tests / 81 lint
warnings / 0 lint errors / AGENTS.md 1789 words / GUARDS PASS / guard 185 / guard 17.
Every one reproduced exactly.

---

## 1. `npm run verify` -> exit 0

```
VERIFY_EXIT=0
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
   Duration  10.08s (transform 48%, tests 42%, import 10%, worker 1%)
```
- test files: **71** · tests: **2063** · lint warnings (`grep -c ": warning "`): **81** · lint errors (`grep -cE ": error "`): **0**
- all 81 `: warning ` hits come from the `npm run lint` (oxlint) section (0 elsewhere in the log).
- AGENTS.md ceiling check (steering-lint `[2]`): `ok — AGENTS.md (1789 words, ceiling 1800)`
- guards: `factory-guard check: all 185 checks passed.` -> `GUARDS: PASS — all deterministic rules hold.`
- Full log: `/tmp/verify-8d.log`.

## 2. Guard counts, counted independently

```
$ node scripts/guards/factory-guard.check.mjs
factory-guard check: all 185 checks passed.        (FG_EXIT=0)
$ grep -c '^  ✓' -> 185                             # independent count of the check lines

$ node scripts/guards/lib-sibling-guard.check.mjs
PASS — all 17 checks: the guard fires on every seeded defect and only on them.  (LS_EXIT=0)
$ grep -oE '[0-9]+ checks' -> 17
```
**185 / 17** — matches. (`/tmp/fg.log`, `/tmp/ls.log`.)

## 3. DEFECT 1 — the reachability trace (both halves, run by me)

**Post-fix (checkout `e2fc1f4`, source+spec `5f575e0`).** Leg 7 green, x3 in
a row (§5) and once filtered:

```
  ✓  2 [chromium] › e2e/signup-zip-fallback.e2e.ts:727:1 › an invalid typed zip is VISIBLE once the note is gone: editing the address cannot hide the error Finish raises (V28 slice 8d, defect 1) (3.7s)
  3 passed (16.9s)
```
That leg is the trace in full: reveal the note for the unresolvable A -> fill zip
`1234` -> edit to a RESOLVABLE B (note cannot come back) -> tap Finish -> assert
`#err-zip` **visible** with `note.not.toBeVisible()`, then clear the error, Finish
again, the finish card renders and the feed carries the typed zip. Green = the
alert is visible with the note hidden AND the card finishes once the error is
cleared (acceptance item 2, "no wall").

**Pre-fix (source reverted to `5f575e0^` in `/tmp/v8d-clone`).** Leg 7 goes red:

```
    Error: expect(locator).toBeVisible() failed
    Locator: locator('#err-zip')
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found
    Call log:
      - Expect "toBeVisible" locator('#err-zip') with timeout 15000ms
      - waiting for locator('#err-zip')
    > 788 |       await expect(zipAlert).toBeVisible()
```
and its Playwright page snapshot at the tap is the state the brief describes —
**no note, no zip field, no alert**:

```yaml
- main:
  - heading "Where do you live?" [level=1]
  - text: Home address
  - textbox "Home address": ... text: 4139 1st Ave NE, Seattle
  - button "Finish"
```
**Defect 1's verdict is REACHABLE**, by the builder's trace, reproduced here both
halves. (Leg 7's `-g` run also included leg 8, so the same invocation shows the
Defect 2 red; see §6.)

## 4. DEFECT 2 — is the chosen shape safe? (freeze while `saving`)

Code read (`src/pages/OnboardingPage.tsx` at `5f575e0`):
- `setSaving` has exactly two sites: `:1086 setSaving(true)` and
  `:1113 setSaving(false)` — **the latter is inside `saveLocation`'s `finally`**.
  Nothing else touches `saving`.
- `saveLocation` (`:1084`): `if (session === null) return` *before* `setSaving(true)`;
  then `try { await updateHomeZipRadius(...); await refresh() } catch { setError(...) }
  finally { setSaving(false) }`. `updateHomeZipRadius` (`src/lib/db.ts:859`) throws
  on validator failure and on `if (error) throw error` — all inside the `try`.
- The zip input is `disabled={saving}` (`:1656`); the card primary is
  `primaryDisabled={saving || geocoding || knownZips === null}` with
  `primaryLabel ... saving ? 'Saving…'` (`:1497-1498`). **The freeze uses the same
  flag that already froze the primary.**

**Bounded on every terminating path — tested, not argued.** Probe (throwaway spec
in the clone, reject the PATCH with a 500 while it is held):

```
PROBE-REJECT: zip re-enabled after 500; card error visible
✓ PROBE: a REJECTED save re-enables the frozen zip field (the freeze is bounded by finally)
PROBE-REJECT: retry after the failure FINISHED the card (no wall)
```
After the reject the field is `toBeEnabled()`, `#err-submit` is visible, the field
still holds the zip, and removing the rejecting route + Finish finishes the card.
So success / validator-throw / DB-throw / `refresh()`-throw all re-enable.

**Can the input get stuck disabled (the forbidden fourth wall)? I could not
construct it.** The only unbounded path is a write whose promise never settles
(network hang): then `saving` stays true, the zip input stays disabled — *and so
does the primary, already reading "Saving…"*, exactly as it did **pre-fix**.
Pre-fix the parent could edit the zip field during a hung save but could not
re-submit (`handleAreaFinish` guards `saving`), so the edit bought no escape; the
address and radius remain editable post-fix. The freeze therefore adds no new
terminal state; the one stuck state it shares is the pre-existing hung-write wall
of the same `saving` flag. **No fourth wall created.**

**On the re-check shape (slice 4's precedent):** the builder's degeneration argument
holds against the code. The typed-zip branch (`:898-906`) reads `typedZip` and
calls `await saveLocation(typedZip)` with no `await` between capture and use, so a
point-of-use re-read would compare a binding to itself (`A === A`) — the defect
slice 4's own draft had. Re-check is inapplicable here; freeze is defensible.

## 5. e2e lane

`e2e/signup-zip-fallback.e2e.ts` **x3** (killed nothing; no port kill needed):

```
##### RUN 1 #####   10 passed (45.2s)   RUN1_EXIT=0   (legs 9/10: 4.5s / 3.9s)
##### RUN 2 #####   10 passed (43.8s)   RUN2_EXIT=0   (legs 9/10: 3.6s / 3.9s)
##### RUN 3 #####   10 passed (42.4s)   RUN3_EXIT=0   (legs 9/10: 3.6s / 3.6s)
```
`e2e/zip-radius.e2e.ts` **once**:

```
  ✓  2 ... › the marker's /settings edits distance but not the home ZIP (V27) (1.2s)
  ✓  3 ... › a host marker's drop-in reaches a viewer's radius feed with an "N mi" label (5.6s)
  3 passed (16.4s)   ZIPRADIUS_EXIT=0
```
**No pin was loosened.** The commit's diff of the spec is **purely additive** —
`git diff 5f575e0^ 5f575e0 --numstat -- e2e/signup-zip-fallback.e2e.ts` -> `163  0`,
two hunks only: a +13-line header item at line 57 and the two new legs appended at
723+. All 7 pre-existing spec legs (the four fix-round pins among them) ran green in
all three passes. None of the four named flake modes appeared, so no re-run was needed.

## 6. Mutation — both halves of each defect, all four runs

Reverted `src/pages/OnboardingPage.tsx` to `5f575e0^` in the clone (`git diff --stat
5f575e0^` -> empty == clean revert), ran `-g "V28 slice 8d"`:

```
PREFIX_EXIT=1
  ✘ 2 ... defect 1 ... (18.7s)   #err-zip element(s) not found
  ✘ 3 ... defect 2 ... (18.3s)
  Error: expect(locator).toBeDisabled() failed
    Locator: getByPlaceholder('e.g. 98107')
    Expected: disabled
    Received: enabled          # the divergence window, open mid-PATCH
  2 failed / 1 passed (setup)
```
Restored (`git checkout e2fc1f4 -- src/pages/OnboardingPage.tsx`, tree clean):

```
POSTFIX_EXIT=0
  ✓ 2 ... defect 1 ... (3.7s)
  ✓ 3 ... defect 2 ... (3.6s)
  3 passed (16.9s)
```
All four halves reproduced: **leg 7 red pre-fix / leg 8 red pre-fix / both green
restored**. Pre-fix leg 7 shows exactly `#err-zip` 0 elements; pre-fix leg 8 shows
`Received: enabled` mid-write.

## 7. The builder's UNFIXED second subject — confirmed against the code

**TRUE.** The address input (`:1505`) has no `disabled`; `grep -n "disabled=" src/pages/OnboardingPage.tsx`
in the area card finds only `:1656 disabled={saving}` (the zip input). The radius
`<select>` is also un-frozen. So on the address path's resolved-zip save, the
address field stays editable through `saveLocation`'s await, and an edit then is
the same mid-save divergence class — slice 4's fix-2 re-check closes the *lookup*
window, not the *write* window. Probe 2 confirmed it live:

```
PROBE-ADDRESS: address field EDITABLE mid-save (divergence window open)
✓ PROBE: the ADDRESS field is editable while saving ... (3.4s)
```
This is a real asymmetry and belongs in the ledger as the builder filed it — **not
this slice's defect** (the brief scoped Defect 2 to `typedZip` and said to stop at a
second subject).

## 8. Findings

**Zero product findings.** The two fixes do what the brief asked, both mutation
halves are real, and the guard/verify gates are green at `5f575e0`.

Observations (non-blocking, nothing here changes the verdict):
1. Report §4 prose says "all 8 of its legs, plus the two new ones, plus the setup".
   The spec has 7 pre-existing legs + 2 new = 9 tests; + the setup project = the
   10 passed. An off-by-one in the sentence only; the run counts are right.
2. The mutation transcripts pasted in the builder's report (`...:775:30`,
   `...:848:30`) sit **13 lines lower in the committed spec** (the assertions are at
   `:788` and `:861`). 13 is exactly the +13-line header hunk added at line 57 — the
   capture predates that header. Behaviour reproduced exactly; only the pasted line
   numbers do not map to the committed artifact. Provenance nit, not a defect.
3. `factory/work/v28-r2-8b.json` / `-8c.json` (modified) and `-8e.json` (untracked)
   are present in the clone/tree as the builder said; not this slice's.

## Files / evidence
- `/tmp/verify-8d.log` (verify), `/tmp/fg.log`, `/tmp/ls.log`
- `/tmp/zipfb-run{1,2,3}.log`, `/tmp/zipradius.log`
- `/tmp/prefix-8d.log` (pre-fix red x2), `/tmp/postfix-8d.log` (restored green), `/tmp/probe.log`
- `/tmp/v8d-clone` (throwaway clone; reverted + restored)
