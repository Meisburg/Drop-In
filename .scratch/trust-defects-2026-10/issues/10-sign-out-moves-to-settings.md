# 10 — Sign out moves out of the header into Settings

**Status:** ready-for-agent
**Type:** Usability Improvement
**Source:** Deepseek PCR 009 → decision 4 (founder, 2026-10-04)

## What happens

`src/App.tsx:456-463` renders a bare `Sign out` button in the sticky header of
**every** signed-in screen, one 44px tap from the settings gear, with no
confirmation. `signOutUser` is a bare `supabase.auth.signOut()`
(`src/lib/db.ts:304-306`) and the shell bounces to `/login`. The cost of a
mis-tap is a password reset.

Settings' Account section (`src/components/AccountSection.tsx`, rendered by
`src/pages/SettingsPage.tsx:352`) currently offers **Download your data** and
**Delete my account** — but **no plain sign-out**. `signOutUser` is called there
only *after* an account deletion (`AccountSection.tsx:60`), not as a control.

## Acceptance criteria

1. A parent can sign out from Settings, in the Account section, next to Download
   and Delete.
2. The header no longer carries a sign-out control on any signed-in screen, and
   the settings gear remains.
3. The `/login` screen's own "Sign out" (`src/pages/LoginPage.tsx:354-359`,
   shown to a signed-in visitor) is **kept** — it is the only escape there.
4. After signing out from Settings, the parent lands on `/login` exactly as
   before; no intermediate blank state.
5. All `npm run verify` gates pass, including `a11y:focus` (the header's tab
   order changes).

## Verification

```bash
npm run verify
```

There is **no e2e coverage of sign-out today** (grep `Sign out` across `e2e/`
returns nothing). Add a focused assertion — sign in, open Settings, sign out,
expect `/login` — in the closest existing settings/profile spec, or a new
focused spec.

## Likely files

- `src/App.tsx:456-463` — remove the header control
- `src/components/AccountSection.tsx` — add the control (`signOutUser` is already
  imported there)

## Considerations

- No confirmation dialog is needed for the Settings control — the risk being
  removed is the *header mis-tap*, and a confirm on a deliberate Settings tap is
  friction. If the builder disagrees, say so in the report rather than adding
  one silently.
- Check `e2e/fixtures.ts` and any spec that reaches sign-out through the header;
  a locator that no longer exists fails the suite, and the stale-locator guard
  will notice a literal that vanished from `src`.
- Do not touch the `/onboarding` header suppression — that path never rendered
  the control anyway (`src/App.tsx:433-434`).
