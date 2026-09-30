# Slice 4 — FIX ROUND 1 (resume the original builder)

**Both the reviewer and the verifier PASSED this slice. `ocr` then traced the edit lifecycles and found two
medium bugs in the crux** — the same class of miss as slice 3, where a lane that *executed* or *traced* found
what a lane that *read for design* could not.

**⚠️ THESE TWO ARE ONE BUG WEARING TWO FACES, AND I WANT THE INVARIANT ESTABLISHED, NOT TWO PATCHES.**

> **The card's map shows the CURRENT address's resolution, or nothing. Never a previous address's result, and
> never nothing for an address that IS resolved.**

Bug 1 breaks the first half; Bug 2 breaks the second. **Fix them as that invariant, and say in your report
whether the two suggested fixes are both load-bearing or whether one makes the other redundant** — I would
rather have one fix and a reason than two fixes and a shrug.

---

## B1 — [`ocr`, MEDIUM] A stale settle republishes a previous address's pin over the current text

**`OnboardingPage.tsx:1485`** — the address `onChange` does `setAreaAddress(...)`, `setAreaAddressError(null)`
and `setAreaCoordinates(null)` — **but it never invalidates the lookup slot** (`areaLookupForRef` /
`areaLookupPromiseRef`).

So: blur **A**, its lookup is in flight (`areaLookupForRef === 'A'`); the parent re-focuses and types **B**
(this handler runs, the map hides); **A settles before B has been blurred.** The ownership guard is
`if (areaLookupForRef.current !== owned) return result` — and at that instant `'A' !== 'A'` is **false**, so
it **republishes A's coordinates and the ZIP-fallback state over B's text.** The card shows A's pin and radius
circle while the field reads B.

**`ocr`'s fix, which I verified against the code:** invalidate the slot here —
`areaLookupForRef.current = null` and `areaLookupPromiseRef.current = null` — so a settling stale promise
fails the ownership check and can never republish. **Note the consequence and accept it:** a re-typed address
then gets its own single request, which is consistent with the "an edited address is a distinct address" rule,
and the blur+Finish single-request invariant is unaffected because Finish still reuses the promise for the
current address.

**⚠️ AND THE COMMENT AT `:1487-1489` IS ALREADY LYING.** It says the pin *"hides until the edited address
resolves."* It does not — which is this bug. **Make the comment true, or make the code match it.** This is the
batch's most-repeated defect class: a sentence describing behaviour the code does not have.

## B2 — [`ocr`, MEDIUM] A resolved address can leave the map permanently hidden

**`OnboardingPage.tsx:982`** — the reuse branch is
`if (existing !== null && areaLookupForRef.current === trimmed) return existing`, with the comment
*"A settled promise publishes nothing new, so re-reading it here is the reuse, not a second fetch."*

**That premise is false once an edit has nulled the state.** Trace: (1) type A, blur, A settles,
`areaCoordinates` published, map shown; (2) edit to B — `onChange` nulls `areaCoordinates` and the map hides,
**but the slot still holds A's settled promise**; (3) edit back to **A** and blur — `ensureAddressLookup('A')`
takes this reuse branch, **returns `existing` without republishing**, so `areaCoordinates` stays `null` and
**the map never reappears for a fully resolved address.** Finish can then save A's zip while the pin and
circle are absent — **which violates the invariant this slice itself documents** in `handleAreaFinish`
("the card's map … was already showing what this save will write").

**`ocr`'s fix:** republish the settled coordinates on reuse. It is idempotent (the same object reference
makes React's setter bail out when the map is already showing) and fires **no** second request.

**⚠️ But check this honestly:** if B1's invalidation lands, is the reuse branch still reachable with stale
state? **Work it out and tell me.** If B1 alone restores the invariant, say so and **do not add B2's change** —
a fix that cannot fire is the vacuity class this batch has ruled on three times.

## B3 — [`ocr`, LOW] The new bounded seam leaks its deadline timer on the rejection leg

**`src/lib/geocode.ts:273`** — the doc says *"same race discipline as `zipFromAddressQueryBounded` above,"*
and that sibling's discipline includes the **rejection** leg: its `.then` has a second handler that clears the
deadline timer and rethrows (commented there as "the rejection leg cleans up too"). **This new function only
handles fulfilment**, so if the injected lookup rejects, `clearTimeout(timer)` never runs and the timer stays
armed until `timeoutMs` — inert, but a dangling timer and a deviation from the pattern the comment claims.

**Mirror the two-arg `.then`.** **The sibling's test already pins this via `vi.getTimerCount()` — use the
same instrument here**, because "the timer was cleared" is otherwise an invisible claim.

---

## Not yours

- **The file's missing trailing newline** (`e2e/signup-zip-fallback.e2e.ts:312`) — ruled to 8b's sweep, which
  now instructs the builder to **measure the set** rather than trust a count. **Do not fix it here.**

## Acceptance

1. **Two new spec legs, and BOTH must be non-vacuous — each must FAIL against this commit:**
   - **(a) the stale settle:** type A, blur, edit to B, and assert the map stays **hidden** while A's late
     result arrives. Today it shows A's pin over B's text.
   - **(b) the re-resolved address:** A → blur → edit to B → edit **back** to A → blur → assert the map
     **reappears**. Today it never does.
   **Say how you know each fails pre-fix** — and if you can, prove it by reverting the fix and watching it go
   red, as the slice-3 builder did. **A claim that a test can fail is not the same as a test you watched
   fail.**
2. **The `:1487` comment and the code agree** when you are done, whichever direction you resolved it.
3. B3's timer is pinned with the sibling's `vi.getTimerCount()` pattern.
4. `npm run verify` exits 0 — report the counts. **Last closed baseline: 68 files / 2012 tests / 0 errors /
   81 warnings.** Your new tests will move the count; **name the new numbers.**
5. The specs that ride this card stay green: `signup-zip-fallback`, `onboarding-resume`, `places-map-view`.

## Verify

As above. **Three named flake modes now — re-run once before reporting any of them:** `no-bypass-guard`,
`e2e/places.e2e.ts:2759`, and the vite-4173 / trace-artifact-ENOENT setup mode (if you hit the third, free
port 4173 by port and run with `--trace=off`). **Kill listeners by port, never `pkill -f`.** And per the plan's
process rule: **never poll for a background job** — foreground, or start it, keep the PID, and `wait $PID`.

## Report

**Committed as: `<sha7>`**, then per finding: what changed, and the evidence. **For B2, answer whether it was
still needed once B1 landed** — that judgement matters more than the patch.
