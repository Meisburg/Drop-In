# Review brief — V28 Slice 7a at `1631939` (two deterministic guards)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are a fresh-context reviewer. Judge **only** `1631939` against `plan.md`'s
**Slice 7a** and the guard doctrine. Read `plan.md` Slice 7a,
`scripts/guards/run-all.sh`, **the existing `fixture-marker-guard.mjs` +
`.check.mjs`** (the standard the new ones must meet), and
`docs/agents/borrowed-guards.md`.

**Scope:** 8 files, +1061/−12 — `scripts/guards/vacuous-absence-guard.mjs` (+`.check.mjs`),
`stale-locator-guard.mjs` (+`.check.mjs`), `scripts/guards/run-all.sh`,
`e2e/signup-zip-fallback.e2e.ts`, `e2e/zip-radius.e2e.ts`. Anything else is a finding.

**The slice builds guards for two defect classes that both RECURRED.**
**Guard 1** flags a `toHaveCount(0)` whose locator target can only render on a
*different route*. **Guard 2** flags a plain-string locator literal that no longer
exists in `src/`. Both report green, and both found real defects on their first run —
confirm that is true and not a coincidence of a weak rule.

## Answer these, each with file:line evidence

1. **⚠️ GUARD 1's RULE — is it right, and can the real class escape it?** Read the route
   table and the per-route reachable-file derivation (it says it reads `App.tsx`).
   Verify it actually identifies that `/onboarding`'s cards cannot render on `/` or
   `/settings` — the two sites it found. **Then attack the escapes:** navigations via
   template literals become **UNKNOWN** and click-invalidated routes become
   **UNCERTAIN**, and both are **notes, never findings**. **Could a genuinely vacuous
   assertion hide behind UNKNOWN or UNCERTAIN and stay unreported forever?** If yes, say
   how common that would be — a guard whose escape hatch swallows its own class is a
   guard that passes while the bug ships.

2. **⚠️ GUARD 2's ONE-DIRECTIONAL ASYMMETRY.** As reported: *missing + positive use =
   finding; missing + `toHaveCount(0)`/`toBeHidden` = legal pin-of-removal.* Is that
   asymmetry **sound**, or does it let a stale locator through? Think specifically about
   the overlap with Guard 1: a locator that is missing **and** asserted absent is
   arguably Guard 1's class — say whether the division of labour between the two guards
   is clean or leaves a gap between them.

3. **Guard 2's template handling.** It matches a literal against `src/` "verbatim, or as
   the output shape of a src template literal (statics in order)", with a two-part
   decomposition for plain JSX text spliced to a template. Judge the **false-negative**
   risk: what shape of legitimate locator would it silently not check, and does the
   guard say so in its own "what it is not"? (A locator built from a **variable** is the
   obvious one — confirm it is documented, not merely unhandled.)

4. **The `.check.mjs` files — the point of the whole doctrine.** The documented failure
   mode is *"it passed"*, so each check must **seed the defect and require a non-zero
   exit**. Read both check files: **do they seed the REAL defect shapes** — i.e. the
   `signup-zip-fallback`/`zip-radius` shape for Guard 1 and a renamed-testid shape for
   Guard 2 — and **would they FAIL if the guard's rule were weakened** (e.g. if Guard 1's
   route comparison were removed)? A check that passes against a gutted guard is
   decoration.

5. **THE FOUR CUTS — is any spec meaningfully weaker?** `signup-zip-fallback.e2e.ts`
   lost two pins (the old `:148-149`) and `zip-radius.e2e.ts` lost one (the placeholder
   pin while on `/settings`). The builder says the intent is preserved in comments and
   nothing else was weakened. Verify per cut: **what still asserts the thing the pin
   claimed**, and is that sufficient? If any cut leaves a claim with no assertion at all,
   that is a finding.

6. **The two real defects it found — confirm they were real.** (a) `zip-radius.e2e.ts`
   pinned a placeholder while on `/settings`; (b) `places-map-view.e2e.ts` clicked
   `places-see-map`. Verify both from the source (`places-view-toggle` is the live
   testid at `PlaceDirectory.tsx:1234`). **Were these genuinely defects, or did the guard
   produce two false positives that got "fixed" by weakening tests?** This is the single
   most important question: a guard that "found" a false positive and caused a test edit
   is worse than no guard.

7. **Wiring and cost.** `run-all.sh:61` adds both to the loop and `:101-102` runs their
   checks; `:22-24` documents each rule. Confirm the guards are actually reached by
   `npm run verify` (which runs `guards` **last**). **And: does scanning ~1237 locator
   sites make `verify` noticeably slower?** Report any timing evidence.

8. **THE DISABLEMENT RISK.** A guard that produces false positives gets turned off. Does
   each guard document its false-positive story ("what it is not") the way
   `fixture-marker-guard.mjs` does? **Name any rule here that would fire on a
   legitimate future spec** — e.g. a spec that *deliberately* asserts a cross-route
   absence (a redirect test!) — and say whether the guard tolerates it or would block it.

9. **Scope and leftovers.** Exactly the 8 files? Any stray `console.log`, TODO, dead
   code, or an uncited claim in a comment this diff writes?

## Verdict

`PASS` | `NEEDS_CHANGES` | `BLOCKED`, plus every finding as
`file:line — what is wrong — why it matters — how you would fix it`, marked
**blocking** or **non-blocking**. Write accepted residuals down with their ruling.
If you cannot prove something from the diff, say so.
