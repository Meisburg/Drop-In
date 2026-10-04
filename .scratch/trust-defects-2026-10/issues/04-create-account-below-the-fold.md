# 04 — The create-account control is below the fold at 390×664

**Status:** ready-for-agent
**Type:** Bug
**Source:** Deepseek PCR 010, second half → `D7`

## What happens

Measured live against the current build (headless Chromium, `isMobile`, 3× DPR,
390×664 — a phone viewport with browser chrome): the login page is
`scrollHeight 692 / clientHeight 664`, and the **"New here? Create an account"**
control sits at `top 640, bottom 692` — **28px past the viewport**. A brand-new
parent's only route out of the sign-in wall is partly cut off.

The containers are `src/pages/LoginPage.tsx:190` (`min-h-dvh … justify-center`)
and the toggle at `:335-347`.

`scripts/mobile-audit.mjs` walks `/login` (`:36`) and asserts tap-target size and
**horizontal** overflow (`:160`), but never vertical containment, and its
viewports (`:20-27`) do not include 390×664.

## Acceptance criteria

1. At 390×664 with default text size, the create-account control is **fully
   visible without scrolling**.
2. `scripts/mobile-audit.mjs` gains a vertical-containment check and **fails**
   when a primary control's bottom exceeds `clientHeight` — not just at 390×664,
   at every viewport it already visits.
3. No horizontal-overflow regression, tap targets stay ≥44px, and the tagline
   ("See what families are up to in your area!") is not removed to buy space.
4. The signed-in "Sign out" variant of this screen keeps working
   (`src/pages/LoginPage.tsx:354-359`).

## Verification

```bash
node scripts/mobile-audit.mjs
npm run verify
```

## Likely files

- `src/pages/LoginPage.tsx`
- `scripts/mobile-audit.mjs` — the new assertion (a guard that can fire)

## Considerations

- Prefer spacing/padding over shrinking a control; the audit's 44px floor is a
  standing rule.
- Do **not** fix this by removing `justify-center` blindly — the same container
  serves the sign-in, signup and reset states.
- The audit script is not in `npm run verify` today. If it stays out, say so in
  the report; the rendered assertion above is then the only automated pin.
