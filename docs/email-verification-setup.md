# Email verification — the human steps, and why the chip waits for them

Ticket: `.scratch/v8/issues/11-email-verification.md` · Migration **0034**
(`profiles.email_confirmed_at`) is **applied and verified live** — the schema
half is done, so turning verification on is now a pure dashboard action.

## Why the "Verified email" chip is NOT shipped yet

Supabase **auto-confirms** every signup while "Confirm email" is off. In this
deployment `auth.users.email_confirmed_at` is therefore set for *every*
account within seconds of signup — the live mirror shows **155 of 155**
(measured 2026-09-13, right after 0034 landed).

A chip shipped on top of that would mark **every** parent "Verified email",
including parents who never opened an inbox. On a live deployment whose whole
point is meeting strangers at a park, a trust badge that is always on is worse
than no badge: it is a claim the app cannot make. So the chip ships **with**
the toggle, not before it.

## The human steps (in order)

1. **Decide it is wanted.** Turning confirmation on changes sign-up for every
   new parent: they cannot get into the app until they click a link in an
   email. That is the point (verified accounts), but it is a product call and
   it is yours.
2. **Supabase Dashboard → Authentication → Email → enable "Confirm email".**
   Also confirm the sender: the built-in SMTP is rate-limited to a handful of
   messages per hour for the whole project, which will not carry a cohort.
   `docs/beta-checklist.md` already covers the custom-SMTP (Resend) steps.
3. **Tell the coordinator.** The follow-up slice is small and already specified
   (below); it changes the e2e harness, so it should land in one run.
4. **Verify a real signup end to end on a phone:** sign up with a fresh
   address → the "Check your inbox" screen appears (not a logged-in feed) →
   the link opens the app logged in → `/u/<handle>` shows the chip.

## The follow-up slice (when the toggle is on)

- A **"Verified email"** chip on `/u/:handle` (beside "Here since") and on the
  detail page's host line; the existing "Finish your profile" nudge gains
  "Confirm your email" while `email_confirmed_at` is null.
- The sign-up **"Check your inbox"** screen (resend link, "wrong address?"
  path), and the onboarding-gate branch that keeps a session-less visitor from
  bouncing in a loop — `resolveOnboardingGate` gets the branch and a unit test.
- **Public surface unchanged:** `get_public_playdate` does not gain the field;
  the chip renders only in signed-in views.
- **The e2e harness must be updated in the same change:** `e2e/auth.setup.ts`
  and every marker-based spec currently sign up and expect an immediate
  session. With confirmation on, they need pre-confirmed markers created
  through the dashboard SQL API (extend `e2e/fixtures.ts`, which already has
  `runLiveSql()`), otherwise **every** spec goes red at once — the suite must
  be green *before* the toggle is flipped, not after.
- New spec: signup → "Check your inbox" → (marker confirmed via SQL) → sign in
  → the chip renders.

## What is already true in the database

| Object | State |
|---|---|
| `profiles.email_confirmed_at timestamptz` | exists, nullable |
| `mirror_email_confirmed_at` + `..._on_insert` | SECURITY DEFINER, `search_path` pinned, EXECUTE revoked from public/anon/authenticated (the auth path is the only caller) |
| Backfill | ran; the mirror matches `auth.users` exactly (155 = 155) |
| RLS | **unchanged** — the column rides the existing `profiles` posture |
| `auth.users.email_confirmed_at` | the source of truth; `profiles` is a read mirror |
