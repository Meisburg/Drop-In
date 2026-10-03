# Slice 4 — FIX ROUND 2 (resume the original builder)

**The reviewer PASSED your fix round with no blocking findings, independently re-derived your B2 vacuity proof,
and confirmed the third bug you found yourself was real** (`setGeocoding(false)` at `:1512` closes a permanent
"Checking your address…" disabled button). **It also caught a false claim in my brief**: I wrote that the ZIP
sibling's test already pinned the rejection leg. **It did not** — the implementation had the two-arg `.then`
and the describe block held four tests with no rejection leg at all. **Your note — "it had the fix but no
instrument" — was the correct observation, and you made my instruction true instead of obeying it blindly.**
That is exactly the right instinct.

**But it found one more bug, and it is the same defect one layer down.**

---

## F1 — [REVIEWER, pre-existing but ours now] Finish can save the OLD address's zip

**`OnboardingPage.tsx:943`** — `handleAreaFinish` does `const resolution = await ensureAddressLookup(areaAddress)`
and then consumes `resolution.zip`.

**The bug:** a Finish tap inside the 500 ms debounce window starts a fresh lookup; **if the address is then
edited while that lookup is in flight**, the continuation still saves the **OLD** address's zip. The
suppression you added returns **early with the result value** (`:998` — `if (areaLookupForRef.current !== owned)
return result`), so the *caller* receives a resolution for an address that is no longer in the field. **The
reviewer's words: "a suppressed settle still returns the (unpublished) result value."**

**⚠️ WHY THIS IS OURS AND NOT SOMEBODY ELSE'S PROBLEM: it breaks the invariant this slice documents.**
`handleAreaFinish`'s own comment says *"the card's map … was already showing what this save will write."*
After this round, the **display** path honours that and the **save** path does not — so the card can show
nothing (or a stale pin) while writing a zip for an address the parent has already replaced.

**AND IT GENERALIZES THE INVARIANT, which is how I want you to think about it:**

> **Every claim the card makes — what the map shows AND what Finish writes — corresponds to the CURRENT field
> text, or to nothing.**

The map invariant you just established is one instance. This is the other. **Fix it as the general rule, not
as a second special case.**

**Two shapes are acceptable; pick one and justify it:**
- **Re-check at the point of use:** Finish captures the address it is saving and, after the await, refuses to
  save if the field has moved on (and re-resolves for the new text, or leaves the card usable with an honest
  message).
- **Prevent the interleaving:** make the address un-editable while a Finish-initiated lookup is in flight.

**⚠️ The second shape is a WALL if you are careless** — this batch has found three walls already, and a stuck
disabled button is the failure mode it keeps producing. **If the lookup can hang, an un-editable field with no
escape is worse than the bug.** If you take that shape, the pending state must carry the bounded escape the
project already uses (`ADDRESS_LOOKUP_TIMEOUT_MS`) and the parent must be able to give up. **Say which you
chose and why the other was worse.**

## F2 — [REVIEWER] The reuse-branch comment is true only under a condition it does not state

**`OnboardingPage.tsx:983-985`** still reads *"A settled promise publishes nothing new, so re-reading it here is
the reuse."* **Post-B1 that is TRUE** — but only because of **slot consistency plus the edit clearing the
slot**, and that reasoning lives in a *different* comment at `:1494-1504`. **The reviewer named it exactly: this
is the "premise true in isolation, false in context" class that produced B2 in the first place** — the third
instance in this batch. **Add the condition (or a cross-reference) so the sentence cannot be read as a general
truth.**

*(The reviewer also noted the `geocoding` flag is now correct in all six paths — edit, fresh, suppressed
settle, Finish, rejection, unmount — and that no path leaves it stuck. No action.)*

---

## Acceptance

1. **A new spec leg, NON-VACUOUS, proving F1's fix:** tap Finish, then edit the address **during** the
   in-flight lookup (the held-route instrument you already built makes this controllable — use it), and assert
   the DB holds **no** zip, or the **new** address's zip — never the old one. **Say how you know it fails
   pre-fix, and prove it by reverting if you can.** You have done this twice already and it is the reason I
   trust this round's results.
2. **No wall:** if you chose the prevent-interleaving shape, show the bounded escape and that the parent can
   still finish. If you chose the re-check shape, show the card stays usable.
3. The **other** legs stay green — `signup-zip-fallback` (now 5 legs plus yours), `onboarding-resume`,
   `places-map-view`.
4. `npm run verify` exits 0. **Report the counts AND the lint warning count against the 81 baseline** — the
   reviewer noted the last round's ledger entry named the tests but not the warnings, and a missing field in a
   structured report reads as evidence.
5. F2's comment states its condition.

## Not yours

- The missing trailing newline (8b's sweep, fourth instance, absorbed by the "measure it yourself" rule).
- The rejected-lookup slot poisoning (a re-blur reuses a rejected promise) — **recorded, and being given a
  named owner in the plan**, not fixed here. It is a UX residual, not an invariant break: the reviewer showed a
  republish could not fix it anyway, since republishing `absent` is still null.

## Verify

As above, plus the three required specs. **Three named flake modes — re-run once before reporting any:**
`no-bypass-guard`, `e2e/places.e2e.ts:2759`, vite-4173/trace-artifact-ENOENT (free port 4173 **by port** and
use `--trace=off`). **Kill listeners by port, never `pkill -f`.** And per the plan's process rule: **never
poll for a background job** — foreground, or start it, keep the PID, `wait $PID`.

## Report

**Committed as: `<sha7>`**, the fix you chose and why the other was worse, the pre-fix red for the new leg, and
the counts **including lint warnings**.
