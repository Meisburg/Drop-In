# 11: Email verification — the trust gate (migration 0034 + a human-owned toggle)

**What to build:** Email confirmation is **intentionally OFF** (decision log,
2026-09-04: "no email infrastructure until V2"). For an app whose entire point
is meeting strangers at a park with your kids, unverified accounts are the trust
story a cautious parent notices first — and every other feature here assumes
parents will show up to meet people they've never met. Turn confirmation on and
make verification **visible** on the surfaces where it matters.

**Blocked by:** Ticket 10 (one-writer). **Do not start before the human has
confirmed the Supabase toggle is wanted** — enabling it changes sign-up for
every user and breaks the current e2e signup path (see the migration check
block; the spec harness change is part of this ticket, not a follow-up).

**Status:** ready-for-human — the Supabase toggle is the first step; the code
slice inside this ticket flips to `ready-for-agent` once the human reports the
toggle is enabled.

- [ ] **Human-owned first step:** Supabase Dashboard → Authentication → Email → enable **Confirm email**; confirm the sender (the built-in SMTP is heavily rate-limited — a custom SMTP provider is strongly recommended before any real recruiting push). Report back, then the code slice starts
- [ ] **Migration 0034** — `profiles.email_confirmed_at timestamptz null` + a trigger on `auth.users` (AFTER INSERT OR UPDATE OF `email_confirmed_at`) mirroring the value onto the matching `profiles` row, plus a one-time backfill from `auth.users`. DO-block idempotent; the trigger **passes through when `auth.uid() is null`** (the 0011 lesson — a JWT-less server role must never be blocked by an app guard)
- [ ] Sign-up UX: the confirmation-pending state renders a designed **"Check your inbox"** screen (resend link, "wrong address?" path) instead of the current implicit auto-login; the onboarding gate (`resolveOnboardingGate`) must **not** bounce or loop a session-less visitor — add the branch and unit-test it
- [ ] A **Verified email** chip renders on `/u/:handle` (next to "Here since") and on the detail page's host line; the existing "Finish your profile" nudge banner gains "Confirm your email" when the value is null, with the same tap-through discipline
- [ ] **Public-surface pin holds:** `get_public_playdate` does **not** gain a verified field (it stays at the ticket-07 field count); the chip renders only in signed-in views. Anon keeps its count-only posture
- [ ] New e2e `email-verification.e2e.ts`: signup → "Check your inbox" → (marker confirmed through the coordinator's SQL API path) → signing in shows the chip on the profile. Cascade-safe cleanup
- [ ] **Full-suite hazard, handled in this ticket:** `e2e/auth.setup.ts` and every marker-based spec currently sign up and expect an immediate session. With confirmation on, they must create **pre-confirmed** markers through the SQL-API path (extend the sweep/tooling rather than weakening the product). The suite must be green **before** the human flips the toggle
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0034_email_confirmed_at.sql`**
(reserved number; next free wins if the queue reorders).

- *Idempotency:* `add column if not exists`; the trigger created in a DO-block
  guard (`drop trigger if exists` + `create trigger`); the backfill is a single
  `update ... from auth.users` that is naturally re-runnable.
- *Header must document:* that Supabase's own sign-up flow writes
  `auth.users.email_confirmed_at` (the profile column is a read mirror, never
  the source of truth), the `auth.uid() is null` pass-through, the backfill, and
  that no RLS policy changed (the column rides the existing `profiles` posture —
  the 0014/0016 column-add lesson).
- *Apply path (coordinator only):* CDP Chrome via
  `bash scripts/cdp-migration-tooling.sh` → Local Storage token
  `supabase.dashboard.auth.token` → `POST
  https://api.supabase.com/v1/projects/<ref>/database/query`.
- *Post-apply probes:* (1) `information_schema` proving the column + `pg_trigger`
  proving the trigger; (2) PostgREST `profiles?select=email_confirmed_at&limit=1`
  → 200 (no `PGRST205`); (3) the backfill's row count matches the count of
  confirmed `auth.users`; (4) a marker's signup leaves the column null until
  confirmation, then flips it — the ordering proof.
- *Human-owned:* the Authentication toggle (and SMTP, if used). Also note the
  **order**: enable the toggle only after the ticket's code + spec harness are
  green, or every e2e run in the repo goes red at once.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/email-verification.e2e.ts` plus the **full** suite (the setup change touches
all of it); live marker pass on a phone — sign up, see "Check your inbox",
confirm, see the chip. Sweep markers (including the pre-confirmed ones this
ticket adds to the tooling).

## Comments
