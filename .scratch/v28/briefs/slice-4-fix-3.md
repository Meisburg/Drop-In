# Slice 4 — FIX ROUND 3 (resume the original builder)

**`ocr` found ZERO findings in your fix round 2** — the save-path work is clean. **And two independent lanes
found the same remaining defect**, which is why this round exists.

**⚠️ THE THIRD INSTANCE OF THE SAME CLASS, and the remedy is not another one-off fix.** B1 was the pin, F1 was
the save. **This is the third claim the card makes that survives an edit it should not survive** — so the
round is the clear **plus a pin that makes a fourth instance unbuildable.**

---

## C1 — [REVIEWER **and** `ocr`, independently] The ZIP-fallback note survives an edit

**`OnboardingPage.tsx:1543-1558`** — the edit block now clears `areaCoordinates`, **both** slot refs, and
`geocoding` — **but not `zipFallbackShown`.**

The note it renders (`:1618-1624`) is a **direct claim about the field**: *"We couldn't match the address you
entered to a ZIP code."* So: reveal for an unresolvable **A** → the parent edits to **B** → **the note lingers
over B's text, asserting A's answer about an address that has not even been looked up yet** — and it stays
until B's own lookup settles, **or indefinitely if B is never blurred**, which is the rejected-lookup path.

**`ocr` sharpened it in a way the reviewer did not: during the new lookup's pending window the stale note
CO-RENDERS with the "Checking your address…" busy label** — the card simultaneously says *we couldn't match
this* and *we are checking this*. **It also contradicts the edit block's own comment**, which says an edited
address invalidates *"the card's **whole** resolution."*

**The fix is the reset you already wrote three times in that block: clear it alongside the others.**

**⚠️ AND HERE IS WHY THAT IS SAFE — from `ocr`, and worth keeping in the comment:** the edited address's own
settle **re-derives** the flag (hidden on a resolved zip, re-revealed on failure or rejection), and **a TYPED
ZIP IS UNAFFECTED**, because it lives in `homeZip`, which `handleAreaFinish` prefers **regardless of note
visibility**. Clearing the note cannot lose anyone's typed zip.

**⚠️ AND THE PIN IS THE POINT OF THIS ROUND.** The reviewer's words: the third instance *"belongs one rung
down — **a pin in the spec that makes the fourth instance unbuildable**."* Add a leg: **reveal the note (an
unresolvable address), edit the field, and assert the note is HIDDEN.** It must fail against the current commit
— **prove that by reverting, as you did twice already.**

**Consider what a fourth instance would look like and say whether the pin closes it.** The general invariant is
*every claim the card makes corresponds to the current field text, or nothing*; the claims are now the pin, the
saved zip, the pending flag, the error messages, and this note. **If you can name a sixth, say so** — that is
more valuable than the fix.

## C2 — [`ocr`, LOW but it weakens a proof] Raise the fixed beat in leg (a) from 300 ms to 1000 ms

**`e2e/signup-zip-fallback.e2e.ts:382`.** `ocr`'s analysis is precise: a *suppressed* settle is **unobservable
by design**, so there is no state to poll instead — **the beat is what proves "the late settle was processed and
changed nothing."** Its risk: **on a slow runner the assertions could pass BEFORE the settle runs, so the leg
could false-pass against pre-fix code** — weakening its documented "fails pre-fix" claim, which is the whole
reason it exists.

**Its recommendation, which I am taking: raise the beat rather than remove it**, and keep the comment stating
why a deterministic poll is impossible here. **Post-fix this cannot flake** (a late settle simply leaves the map
absent), so the beat trades a negligible runtime cost for a stronger discriminator.

---

## Acceptance

1. **The note is cleared on edit**, with the `ocr` reasoning in the comment (the settle re-derives it; a typed
   zip lives in `homeZip` and is unaffected).
2. **The pin exists and is proven red against `512e673`** — revert the clear, watch it fail at the note
   assertion, restore it, watch it pass. **Paste the red.** (The reviewer correctly noted that your fix-2
   pre-fix red was asserted rather than pasted; this round, paste it.)
3. **Say whether you can name a sixth claim**, and whether the pin closes the class.
4. The leg (a) beat is 1000 ms with its rationale intact.
5. `npm run verify` exits 0. **Report the counts AND the lint warning count against the 81 baseline — in your
   REPORT and in the COMMIT MESSAGE BOTH.** The reviewer filed the commit message's omission as blocking; **I
   am overruling that** (your report carried both counts and the verifier confirmed them exactly), **but the
   habit is worth having**: the commit message is what a reader finds without your chat report.

## Not yours

- The **typed-zip mid-save race** (`:935` captures `homeZip` at tap, and the zip field is not disabled during
  `await saveLocation`) — **a real one, recorded with a named owner in the plan**, not this round.
- The **rejected-slot poisoning** — already owned by 8a.

## Verify

As above plus the three required specs. **Three named flake modes — re-run once before reporting any:**
`no-bypass-guard`, `e2e/places.e2e.ts:2759`, vite-4173/trace-artifact-ENOENT (free 4173 **by port**,
`--trace=off`). **Kill listeners by port, never `pkill -f`.** **Never poll for a background job** — foreground,
or start it, keep the PID, `wait $PID`.

## Report

**Committed as: `<sha7>`**, the pasted pre-fix red, your answer on a sixth claim, and the counts **including
lint warnings** — in the report and in the commit message.
