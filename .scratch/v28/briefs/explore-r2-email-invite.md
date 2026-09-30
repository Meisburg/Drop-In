# Explorer brief — EMAIL partner invite (read-only, cited findings)

You are `orchestrator-explorer`. **Edit nothing. Create no files. Commit nothing.**
Every claim carries `path:line`. An explicit zero is a finding. **Never pass `-r` to `rg`**
(it parses as `-r n` and fabricates output). Never grep a phrase that can wrap — use the
shortest stable fragment.

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## Why

"Partner linking" is **already fully built** — `0047_parent_cards_account_links.sql` with
`requestAccountLink` (`src/lib/db.ts:5561`), `respondToAccountLink` (`:5584`),
`unlinkAccounts` (`:5602`), a surfaced invite form on the profile page, and 5 passing e2e
tests in `e2e/account-links.e2e.ts`. **The invite is by `@handle` or by name search — and
inviting by EMAIL has ZERO existing seam.**

The product owner has now decided to **build the email path**: let a parent invite a partner
who is *not yet on Drop In*, by email — so the invitee's eventual signup completes the link.

**I will not write that slice until I have measured what exists**, because a brief that
specifies a mechanism I have not measured is a defect that reaches a builder. That is what
you are for.

## What to find and report

1. **Can this app send a transactional email to an arbitrary address TODAY?** This is the
   headline question. Grep for and report the state of each: `resend`, `sendgrid`,
   `postmark`, `nodemailer`, `smtp`, `send_email`, `send-email`, `mailgun`, `ses`.
   Read `docs/email-fallback-ops.md` and `docs/email-verification-setup.md` in full and
   summarize what they say the email situation IS. Also list any edge functions:
   `ls supabase/functions/` and report each one's job. **Report an explicit zero for each
   provider that is absent** — if nothing sends email, say so plainly, because that decides
   whether this feature is a slice or a project.
2. **What email DOES the system send already?** Supabase auth emails (confirm signup, magic
   link, password reset)? Find `email_confirmed_at` (added `0034_email_confirmed_at.sql:41`)
   and how confirmation actually happens. Is there a `supabase/config.toml` with SMTP/auth
   email settings? Report what the app can already rely on.
3. **Is there ANY existing invite / token / claim / redeem pattern** to copy or extend?
   Grep: `invite`, `invitation`, `token`, `nonce`, `claim`, `redeem`, `pending_email`,
   `accept_url`, `magic`. **Report 0 hits explicitly if there is none** — a negative decides
   whether this starts from zero.
4. **The `0047` schema in detail — can an un-joined invitee even be represented?**
   Quote the exact columns and constraints of `account_links` and `parent_cards`
   (`supabase/migrations/0047_parent_cards_account_links.sql`). Specifically: are
   `requester_id` / `addressee_id` **NOT NULL foreign keys to `profiles`**? If so, an invitee
   who has no profile cannot be a row — and the slice must extend the table (an email column
   + a claim step) or add a new one. **Report the constraint names and lines.** Also report
   the one-pending-per-pair index and the one-active-partner trigger, since an email invite
   must respect both.
5. **The accept-on-signup seam.** Where would "this signup completes an invite" hook in?
   Report: the signup path (`src/pages/LoginPage.tsx`, and `createProfile` at
   `src/lib/db.ts:341`), how a URL query param survives signup today (any example of a param
   read after auth), and `resolveOnboardingRedirect` (`src/lib/onboarding.ts:73`) plus its
   callers (`src/App.tsx:402`, `src/pages/OnboardingPage.tsx:357`). **I need to know whether
   a `?invite=<token>` can survive the signup + first-run detour, or whether it is lost.**
6. **Email preferences and opt-out.** Report `0053_email_optout.sql` and any unsubscribe or
   "don't email me" plumbing, with the read/write path. An invite email must respect it —
   tell me what the field is and where it is checked.
7. **Does any flow already email a user-chosen address?** e.g. a launch/beta invite, the
   onboarding reminder, `docs/beta-checklist.md`. Report what exists or an explicit zero.

## Finish with

- **"Facts I could not establish"** — name what you checked for each.
- **A one-paragraph recommendation of the SMALLEST shape this could take**, given what
  exists: does it extend `account_links`, or is it a new table plus a token? Do not design
  it — just state the smallest seam the evidence supports.
