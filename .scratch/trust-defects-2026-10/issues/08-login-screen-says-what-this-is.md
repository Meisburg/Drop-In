# 08 — The first screen must say what this is

**Status:** ready-for-agent
**Type:** Usability Improvement
**Source:** Grok PCR 002 + ChatGPT PCR 001 + Perplexity PCR 001 (first-screen half)

## What happens

The root URL is a hard wall: `src/App.tsx:405` redirects a signed-out visitor to
`/login`, and the page's whole promise is one line —
`See what families are up to in your area!` (`src/pages/LoginPage.tsx:204`) —
above a form that defaults to **sign-in** mode for a brand-new visitor
(`:51`, `Welcome back. Sign in to see drop-ins near you.` at `:220`). The word
"drop-in" is used throughout and never defined. The signup path is behind a
toggle (`:344`, `New here? Create an account`).

All five external reviewers raised this; they are right that nothing on the first
screen tells a parent what the product does.

**This is not the same as `plan.md` r3-7** (in-app tooltips after the first run).
That slice is separate and stays as planned; this one is the pre-auth sentence.

## Acceptance criteria

1. A first-time visitor can say what Drop In is and what they would do with it
   after reading the sign-in screen — without tapping anything.
2. The copy describes the low-commitment promise in a parent's words (an open
   invitation to a time and place; no RSVP needed to show up), not a feature
   list.
3. The sign-in default for returning parents is preserved, and the
   create-account path stays at least as visible as it is today.
4. No claim about current local activity appears anywhere on the screen.
5. A **rendered** assertion pins the new copy.

## Verification

```bash
npm run verify
npm run test:e2e -- e2e/privacy-preview.e2e.ts e2e/signup-zip-fallback.e2e.ts
```

## Likely files

- `src/pages/LoginPage.tsx`

## Considerations

- ⚠️ **`e2e/fixtures.ts:399` locates the toggle by its exact current text** —
  `getByRole('button', { name: 'New here? Create an account' })`. Changing or
  moving that control breaks shared fixtures across the suite. Update the helper
  deliberately, and run the full suite once before claiming done.
- If the string belongs to a copy module, the `copy-field` and `copy-taxonomy`
  guards must still pass — an unused or undeclared const fails the gate.
- **Do not** add a signed-out preview of real drop-ins here. That is a
  privacy-model change and needs its own ADR.
- Keep the tagline's job: it is currently the only thing standing between a
  parent and a bare login form.
