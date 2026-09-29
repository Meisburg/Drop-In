# Review brief — V28 Slice 5 at `3f42c8f` (build `45fe1a9` + fix round 1)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are a fresh-context reviewer. Judge **`45fe1a9` + `3f42c8f`** against
`plan.md`'s **Slice 5** and the contract below. Read `plan.md` Slice 5 and
`docs/agents/code-structure.md`. Do not edit, fix, commit, or run the gate.

**Scope:** `45fe1a9` (8 files, +560/−367) then `3f42c8f` (2 files, +23/−14, the fix
round). Anything beyond those is a finding.

The slice turns the interview's last step into **the area card (5 of 5)** —
**address first, ZIP as the revealed fallback** (decision 9) — and deletes the dead
signup ZIP-fallback machinery.

## Answer these, each with file:line evidence

1. **The card's behaviour.** Trace each: a **resolvable** address writes `home_zip`
   **without** the parent typing a ZIP; an **unresolvable** address **reveals the ZIP
   field and the notice** and **never blocks** and **never loses the typed address**;
   **typed-ZIP-wins** is real (what happens if the parent types a ZIP *and* the lookup
   later resolves?); the radius picker offers exactly `RADIUS_MILES_OPTIONS` and
   defaults to `DEFAULT_RADIUS_MILES`; `validateHomeZip` gates the ZIP **inline**; the
   card reads `5 of 5` and its copy from `FIRST_RUN_COPY.area` with nothing
   hard-coded.

2. **`addressFieldError` is REUSED, not deleted** (`src/lib/account.ts:76`). Confirm it
   is wired to the address input, and that it was **not** deleted or left orphaned.

3. **⚠️ THE BOUNDED ESCAPE — the whole reason the pending-state rule exists.** The
   builder reports its **first** implementation armed the deadline and then **cancelled
   the timer immediately**, silently disabling the timeout so a never-settling lookup
   would stall forever. Read the landed version and say **whether the timer now lives
   until the lookup settles in BOTH legs** (resolve *and* reject). Then read the four
   tests: **would they actually FAIL if the timer were cancelled up front again?** If a
   test is not decisive against that exact regression, say so — the builder says a
   never-settling test caught it, which is only credible if the test still pins it.

4. **The removals, and one stale comment.** Confirm `SIGNUP_ZIP_FALLBACK_KEY` /
   `markSignupZipUnresolved` / `consumeSignupZipUnresolved` / `FlagStorage` are gone
   (only retirement notes may remain) and that nothing references
   `dropin.signup.zip-unresolved`. **Then check `src/lib/geocode.ts:11`**: the brief
   required the stale "the **signup form's** use of the same service" comment to be
   fixed, since this slice now owns that file. **Was it?**

5. **⚠️ `e2e/signup-zip-fallback.e2e.ts` WAS REWRITTEN — is it decisive now, or has
   the vacuity come back?** This spec is where the batch found its **first vacuous
   assertion** (the old `:106`, which asserted a count on a page where the element
   could never render). The rewrite now has `toHaveCount(0)` at **`:148`** (the ZIP
   placeholder) and **`:149`** (the fallback note). For **each**, say whether the
   assertion could ever fail — i.e. is the element reachable on that path, so a count
   of 0 is evidence, or is it structurally impossible so the assertion is decoration?
   **This is the exact class the batch has already been burned by; do not wave it
   through.**

6. **`finishSignup` now walks the area card's unresolvable leg for all 17 consumers.**
   Is that the right default for a shared helper, given most of those specs do not care
   about location? Does it cost them time or make them brittle (e.g. does any spec now
   depend on the fallback note's copy)? Would an option (a pre-resolved zip) be better?
   Judge it — do not just describe it.

7. **`e2e/auth.setup.ts`** — the setup walk now does a fake unresolvable address →
   Finish → revealed fallback → marker zip + radius → Finish. Is it **deterministic**
   (it drives the project every chromium spec depends on), and does it still prove what
   it claims (marker location via REST)?

8. **Two comments to check.** (a) The fix round added a comment above the load-error
   `h1` (verified good). (b) **`OnboardingPage.tsx:262`** still reads *"…are bounced —
   the shell applies the same gate one level up"* — but **2b removed the shell's
   bounce**, so is that claim now false? If so, name it for Slice 7 rather than
   treating it as a 5 defect, and say which slice made it false.

9. **Scope and leftovers.** Exactly 8 files in `45fe1a9` and exactly 2 in `3f42c8f`?
   Any stray `console.log`, TODO, dead code, unused import, or an **uncited claim in a
   comment this diff writes**? Does anything still reference the deleted machinery in
   docs, specs or config?

## Verdict

`PASS` | `NEEDS_CHANGES` | `BLOCKED`, plus every finding as
`file:line — what is wrong — why it matters — how you would fix it`, marking each
**blocking** or **non-blocking**. Write accepted residuals down with their ruling
rather than dropping them. If you cannot prove something, say so.
