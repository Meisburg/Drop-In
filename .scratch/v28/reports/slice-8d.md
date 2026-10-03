# Slice 8d — the typed-zip family: an error nobody could see, and a capture that outlived its field

**Committed as: `5f575e0`** (branch `Meisburg/onboarding`, dispatched from `b7db5b7`; not pushed).

**Files changed (2, +237/−40):**

| file | +/− | what |
|---|---|---|
| `src/pages/OnboardingPage.tsx` | +74 / −40 | the ZIP FIELD's render gate is decoupled from the NOTE's; the zip error renders outside every hiding block; the zip input is `disabled` while `saving` |
| `e2e/signup-zip-fallback.e2e.ts` | +163 / −0 | header item 7 + two legs: the error visible with the note hidden, and the field frozen while the held home-zip PATCH is in flight |

`factory/work/v28-r2-8b.json` and `factory/work/v28-r2-8c.json` were already modified in the working tree
**by someone else**, and `factory/work/v28-r2-8e.json` is someone else's untracked file; none was staged.
**Staged by explicit path only — `git add -A` was not used.** Nothing was pushed.

---

## 0. The invariant, stated once

**Every claim the card makes — what the map shows, what Finish WRITES, what the note says, and any error
it raises — corresponds to the CURRENT field text, or to nothing.**

Both defects below are instances of it on the typed-zip field, and both fixes were chosen to keep the card
usable on every path.

---

## 1. Defect 1 — an error set where nobody can see it

### VERDICT: **REACHABLE.** The parent taps Finish and nothing happens, with no feedback.

The reachability claim, verified by a browser trace rather than argued (acceptance item 1):

> type an **invalid** zip while the note is visible → edit the address so the note hides → tap Finish.

**The trace.** `e2e/signup-zip-fallback.e2e.ts` leg 7 drives exactly this path: reveal the note for an
unresolvable A, fill the zip with `1234`, edit the address to a **resolvable** B (so the note cannot come
back), tap Finish. Run against the PRE-FIX source (the fix reverted out of the way), the leg is red:

```
  ✘  2 [chromium] › e2e/signup-zip-fallback.e2e.ts:714:1 › an invalid typed zip is VISIBLE once the note is gone: editing the address cannot hide the error Finish raises (V28 slice 8d, defect 1) (18.5s)

    Error: expect(locator).toBeVisible() failed

    Locator: locator('#err-zip')
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" locator('#err-zip') with timeout 15000ms
      - waiting for locator('#err-zip')

      773 |       // and the parent gets no feedback at all.
      774 |       await page.getByRole('button', { name: 'Finish' }).click()
    > 775 |       await expect(zipAlert).toBeVisible()
          |                              ^
      776 |       await expect(zipAlert).toHaveText('Use a 5-digit zip code.')
      777 |       await expect(note).not.toBeVisible()
      778 |       await expect(zip).toBeVisible()
        at /home/jmeisburg/orca/workspaces/playdate-app/onboarding/e2e/signup-zip-fallback.e2e.ts:775:30

  1 failed
    [chromium] › e2e/signup-zip-fallback.e2e.ts:714:1 › an invalid typed zip is VISIBLE once the note is gone: ... (V28 slice 8d, defect 1)
  1 passed (27.7s)
```

`#err-zip` is `errorId('zip')` (`src/lib/a11y.ts`) — the alert `handleAreaFinish` sets. Pre-fix it is **not
in the DOM at all**. The failure's page snapshot shows the whole card at the moment after the Finish tap:

```yaml
- main:
  - paragraph: 4 of 4
  - heading "Where do you live?" [level=1]
  - paragraph: We use your neighborhood to show nearby drop-ins. An address works best; a ZIP code works too.
  - text: Home address
  - textbox "Home address":
    - /placeholder: e.g. 1200 1st Ave S, Seattle
    - text: 4139 1st Ave NE, Seattle
  - img
  - button "Zoom in"
  - button "Zoom out"
  - link "Leaflet": ...
  - text: contributors Radius
  - combobox "Radius": ...
  - button "Finish"
```

No note, **no zip field, no alert** — the state `zipError` was set and there was nowhere on screen for it
to land. That is the wall: Finish silently no-ops, forever, because the typed zip is still authoritative
(`handleAreaFinish` prefers `homeZip` over the address's resolution REGARDLESS of note visibility — slice
4's deliberate decision, correctly kept) and the invalid value cannot be seen or corrected.

### The fix

The error's render site was nested under `zipFallbackShown`, a flag an address edit clears. **The field is
not a claim about the address; the note is.** So:

- the **NOTE** stays gated on `zipFallbackShown` alone (slice 4 fix 3 unchanged — the note is still
  invalidated by an address edit);
- the **FIELD** renders when `zipFallbackShown || homeZip.trim() !== ''`: the fallback is asking for it, OR
  the parent has a typed zip that Finish will write;
- the **ERROR** renders on the single gate `zipError !== null`, **outside every conditional**. That flag's
  only setter is the typed-zip branch of `handleAreaFinish`, behind `homeZip.trim() !== ''`, and the
  `onChange` clears it in the same update that would empty the field — so the alert and its field always
  co-render, and the message cannot hide behind a condition that later goes false. (This is stated in the
  code comment above the alert so the next reader can check it.)

**It is not merely moved into a block that can hide again** (acceptance item 2): the alert is in no block.
The field's block cannot hide the alert either, because the alert is not inside it.

**Shown visible with the note hidden** — post-fix, the same leg, and the assertion order is deliberate
(`zipAlert` before `zip`, so the trace above is about the message's existence, not the field's):

```
  ✓  9 [chromium] › e2e/signup-zip-fallback.e2e.ts:714:1 › an invalid typed zip is VISIBLE once the note is gone: editing the address cannot hide the error Finish raises (V28 slice 8d, defect 1) (3.7s)
```

and the leg asserts `toHaveText('Use a 5-digit zip code.')`, `note.not.toBeVisible()`, `zip.toBeVisible()`,
then clears the error, finishes the card and asserts the feed carries the typed zip (no wall).

### Non-vacuity, both halves (acceptance item 4)

**Half 1 — mutate the fix, watch it fail.** The source fix was reverted (`git stash push --
src/pages/OnboardingPage.tsx`) and the leg re-run; the red output is pasted above.

**Half 2 — restore, watch it pass.** After `git stash pop`, leg 7 passes (the `✓ ... (3.7s)` line above),
and the leg also passes in all three full-spec runs in §4.

---

## 2. Defect 2 — the capture outlives the field

### CHOSEN SHAPE: **prevent-interleaving, for the typed-zip field only — the input is `disabled` while `saving`.**

`typedZip` is read from `homeZip` and `saveLocation(typedZip)` is awaited **in the same synchronous turn**
(`handleAreaFinish`'s typed-zip branch has no `await` before the write). So the only way the write can show
one value while the field shows another is **an edit DURING the write**, and the field is frozen for exactly
that window. `saving` is already true for the whole window — it is what disables the primary and renders
"Saving…" — and `saveLocation`'s existing `finally { setSaving(false) }` re-enables it on every path.

### Why not slice 4's shape (re-check at the point of use) — it degenerates here

Slice 4's re-check is meaningful because it spans an **await**: `const addressAtTap = areaAddress` →
`await ensureAddressLookup(addressAtTap)` → `if (addressAtTap !== areaAddressRef.current) return` → save.
The re-check compares a tap-time capture against the live field across the lookup.

The typed-zip path has **no pre-write await to re-check across**. A second read inserted just before the
write would compare a value against itself — `A === A` — which is precisely the defect slice 4's own first
draft had and which its fix-2 comment records ("the first draft of this fix had exactly that defect, and
the spec leg stayed red for it"). A re-check here would be theatre, and this batch has already paid for one
theatre fix. **The divergence window is the write, and the write is the use.**

### The alternatives rejected, and why

| alternative | verdict |
|---|---|
| **Re-check at the point of use** (slice 4's chosen shape) | **Rejected — inapplicable.** There is no pre-write await on this path; the capture and the use are the same tick, so the re-check is `A === A` (the very defect slice 4 fixed in its own draft). |
| **Lock the field** — slice 4's rejected shape | **Chosen**, on a distinction slice 4 itself drew: it refused to lock the **ADDRESS** field during a Finish-initiated **LOOKUP** — a long, timeout-bounded Nominatim request on the very field the parent may need to correct, "a new stuck-state surface". Here the await is a **one-round-trip DB write of the value just submitted**; there is nothing to correct mid-submit (a correction requires a re-submit, which the handler's own `saving` guard already refuses), the address and radius fields stay editable, and the re-enable is the existing `finally`. **No new state, no new escape to audit.** |
| **Clear `homeZip` on address edit** | **Rejected.** `homeZip` is the parent's typed input; slice 4's own audit kept it ("clearing would destroy it"), and it is what Finish writes REGARDLESS of note visibility. |
| **Detect the divergence after the write and re-save / correct** | **Rejected.** The invariant is "corresponds to the current field text, **or to nothing**"; a post-hoc re-save is neither, risks a loop, and the card has already swapped. |
| **Ignore the input's `onChange` while `saving`** | **Rejected.** Same effect, no visible state — a hidden freeze is worse than a visible one. |

### Does the lock create a fourth wall?

Walked every path: save succeeds → card swaps (input unmounted); `updateHomeZipRadius` throws → `catch`
sets the error and `finally` re-enables; `refresh()` throws → same; unmount mid-save → `finally` runs; save
hangs → the input stays disabled, **but the primary CTA was already disabled by the same `saving` flag**, so
no terminal state is created that did not exist. The address and radius stay editable throughout. The
e2e leg also finishes the card and asserts the feed after the held write is released.

### Non-vacuity, both halves (acceptance item 4)

**Half 1 — mutate the fix, watch it fail.** With the source fix reverted, leg 8 is red. The received element
shows the field **enabled** while the home-zip PATCH is in flight — the divergence window, open:

```
    Error: expect(locator).toBeDisabled() failed

    Locator:  getByPlaceholder('e.g. 98107')
    Expected: disabled
    Received: enabled
    Timeout:  15000ms

    Call log:
      - Expect "toBeDisabled" getByPlaceholder('e.g. 98107') with timeout 15000ms
      - waiting for getByPlaceholder('e.g. 98107')
        34 × locator resolved to <input maxlength="5" value="98107" inputmode="numeric" aria-invalid="false" placeholder="e.g. 98107" class="w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 border-slate-300"/>
           - unexpected value "enabled"

      846 |       await page.getByRole('button', { name: 'Finish' }).click()
      847 |       await patchArrived
    > 848 |       await expect(zip).toBeDisabled()
          |                         ^
      849 |       await expect(zip).toHaveValue(marker.homeZip)

  1 failed
    [chromium] › e2e/signup-zip-fallback.e2e.ts:797:1 › the typed zip cannot move while its own save is in flight: the field is frozen for the write it started (V28 slice 8d, defect 2)
  1 passed (27.4s)
```

**Half 2 — restore, watch it pass.** After `git stash pop`, leg 8 passes:

```
  ✓ 10 [chromium] › e2e/signup-zip-fallback.e2e.ts:797:1 › the typed zip cannot move while its own save is in flight: the field is frozen for the write it started (V28 slice 8d, defect 2) (3.6s)
```

The leg holds the real `PATCH /rest/v1/profiles` (routed and paused) so the window is deterministic, taps
Finish, asserts the field is `disabled` and still holds the value being written, then releases the write,
waits for the finish card, and asserts the feed carries that same zip.

**One honest limit on this leg, stated rather than implied:** because the fix's shape *is* the freeze, the
discriminating assertion is `toBeDisabled()`. It pins the mechanism, not a post-hoc observable of the
divergence (the card swaps away, so the discarded edit leaves no trace to assert on). A reader who wants
behaviour rather than mechanism should read the pair together: pre-fix `enabled` (the window is open) vs
post-fix `disabled` (the window is closed).

---

## 3. `npm run verify` — exit code, counts

Run at the committed state `5f575e0` (fresh run; the counts below are from that run):

```
VERIFY_EXIT=0
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
   Duration  9.95s (transform 47%, tests 44%, import 9%, worker 1%)
```

- **exit code: 0**
- **test-file count: 71 at `5f575e0`**
- **test count: 2063 at `5f575e0`**
- **lint: 81 warnings, 0 errors at `5f575e0`** (oxlint run via `npm run lint`; `grep -cE ": error "` → 0)
- `factory-guard check: all 185 checks passed.` → **`GUARDS: PASS — all deterministic rules hold.`**

The two extra checkers the brief named, run explicitly:

```
$ node scripts/guards/factory-guard.check.mjs
factory-guard check: all 185 checks passed.
CHECK_EXIT=0

$ node scripts/guards/lib-sibling-guard.check.mjs
PASS — all 17 checks: the guard fires on every seeded defect and only on them.
CHECK_EXIT=0
```

---

## 4. The e2e lane (both halves: raw tails)

`e2e/signup-zip-fallback.e2e.ts` **×3** — the spec that owns this path (all 8 of its legs, plus the two new
ones, plus the setup):

```
##### RUN 1 #####
  ✓   9 [chromium] › e2e/signup-zip-fallback.e2e.ts:714:1 › an invalid typed zip is VISIBLE once the note is gone: ... (V28 slice 8d, defect 1) (3.7s)
  ✓  10 [chromium] › e2e/signup-zip-fallback.e2e.ts:797:1 › the typed zip cannot move while its own save is in flight: ... (V28 slice 8d, defect 2) (3.6s)
  10 passed (50.0s)
RUN1_EXIT=0
##### RUN 2 #####
  ✓   9 [chromium] › ... (V28 slice 8d, defect 1) (4.3s)
  ✓  10 [chromium] › ... (V28 slice 8d, defect 2) (3.6s)
  10 passed (43.3s)
RUN2_EXIT=0
##### RUN 3 #####
  ✓   9 [chromium] › ... (V28 slice 8d, defect 1) (3.7s)
  ✓  10 [chromium] › ... (V28 slice 8d, defect 2) (3.6s)
  10 passed (42.7s)
RUN3_EXIT=0
```

All four prior fix-round pins in that spec (legs 4–8: the pin/radius map, the stale-settle suppression, the
save-path re-check, the note invalidation) ran green in all three passes; **none was loosened or touched.**

`e2e/zip-radius.e2e.ts` **once**:

```
  ✓  2 [chromium] › e2e/zip-radius.e2e.ts:34:1 › the marker's /settings edits distance but not the home ZIP (V27) (1.2s)
  ✓  3 [chromium] › e2e/zip-radius.e2e.ts:52:1 › a host marker's drop-in reaches a viewer's radius feed with an "N mi" label (5.8s)
  3 passed (16.0s)
ZIPRADIUS_EXIT=0
```

No flake re-run was needed; none of the four named flake modes appeared. Listeners were never killed by
`pkill -f` (no kill was needed).

---

## 5. What the brief did not anticipate — said rather than quietly fixed

1. **The brief's framing of Defect 2 assumes a pre-write await that is not there.** It says slice 4
   "applied the re-check at the point of use ... and not to the typed-zip path", implying a re-check is
   transplantable. It is not: the typed-zip path has no await between the capture and the write, so the
   re-check collapses to `A === A`. I chose the freeze and said so (§2). **If a reviewer disagrees, the
   disagreement is about the shape, not about a missed re-check.**

2. **`factory/work/v28-r2-8b.json`, `factory/work/v28-r2-8c.json` (modified) and `factory/work/v28-r2-8e.json`
   (untracked) are in the working tree and are not mine.** They were left unstaged; staged by explicit path.

3. **A residual asymmetry, reported and NOT fixed (same class, different field — the brief scoped Defect 2
   to `typedZip` and said to stop at a second subject):** the ADDRESS field is still editable while
   `saving`, so the *same* mid-save divergence window exists for a Finish-initiated save of the ADDRESS
   path's resolved zip. Slice 4's fix-2 re-check closes the **lookup** window, not this one. It is smaller
   than Defect 2's was (the address's save is reached only when no zip is typed) and fixing it would mean
   either freezing the address field (slice 4's expressly rejected shape) or a second mechanism — outside
   this slice. Recorded here for the batch boundary.

## 6. Risks

`ladder: none.` No rule, guard, or structural constraint had to be added to keep myself out of a mistake I
had already made once.

---

## 7. Unresolved questions

None for this slice. The one deferral (§5.3) is a named second subject, not a question.
