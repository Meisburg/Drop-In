# 06: Onboarding-gate race fix

**What to build:** A signed-in user with memberships who cold-loads any route (e.g. /profile via hard refresh) is NOT bounced to /onboarding → / while the membership fetch is in flight; the gate renders the loading state until the load settles, and only redirects when the load is complete AND the user has no memberships. Signed-out users still hit /login; memberless users still hit /onboarding.

**Blocked by:** None.

**Status:** ready-for-agent

- [x] Cold-load /profile (fresh page) with a marker who has memberships lands on /profile, no bounce
- [x] Memberless signed-in user still lands on /onboarding (no regression)
- [x] Signed-out user still lands on /login (no regression)
- [x] Pure gate function unit-tested for all states (loading, loaded+memberships, loaded+none, signed-out, suspended)
- [x] e2e spec: fresh full-page /profile load lands on /profile (settleOnRoute not required for this path)
- [x] npm run build && npm run test exit 0; npx playwright test exit 0 (all specs, including the existing 3)

## Comments

- 2026-09-09 — COMPLETE (dev agent). Commit 7907ff4 "fix onboarding-gate race: gate waits for membership load (ticket 06)" (single fix commit: App.tsx gate, db.ts profileLoading signal, onboarding.ts pure resolveOnboardingGate + 7 unit tests, e2e/onboarding-gate.e2e.ts new spec; this ticket file lands one commit later — the hash self-reference forces it, same pattern as ticket 00 / bc78789). Fix: useSession exposes `profileLoading` (derived from a new `profileSettledFor` owner id: a session is present but the settled profile+membership load belongs to a different user or nobody — so a cold restore and a sign-out → re-sign-in both re-fetch before the gate settles; a manual refresh() after a save does not re-enter loading, and onboarding/profile saves still `await refresh()` before navigating so the gate sees fresh state). The shell's gate decision is the pure `resolveOnboardingGate` (lib/onboarding.ts, unit-tested) returning 'suspended' | 'loading' | 'onboard' | 'pass' — the shell renders its loading state while any load is in flight and only redirects to /onboarding once settled AND the user has no memberships. No behavior change for: signed-out → /login, memberless → /onboarding, the suspended screen (still wins, no app access), the /mod guard, or a failed profile/membership fetch (still settles as no-memberships, the documented DB-not-applied behavior). Verification: `npm run build && npm run test` exit 0 (84/84 = 77 baseline + 7 new gate tests); `npx playwright test` exit 0 (4/4: setup + existing 3 specs + new spec, Chromium, vite preview + real Supabase).