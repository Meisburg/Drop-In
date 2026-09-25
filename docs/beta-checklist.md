# Beta checklist — before you invite anyone outside the house

Written after wiring password reset (2026-09-11). Everything here is a
**hosting or dashboard** setting, not code.

## 1. Deploy, then teach Supabase the new address

The app is a pure client. It only needs to be served over HTTPS somewhere.

1. Vercel → **Add New → Project → Import** the GitHub repo. It detects Vite
   automatically (build `npm run build`, output `dist`).
2. Environment variables (Production **and** Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_OAUTH_PROVIDERS=google`
3. `vercel.json` already rewrites unknown paths to `index.html`. Without it a
   shared link straight to `/playdate/<id>` returns 404 — **check that first
   after deploying.**
4. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: currently `http://localhost:3000`, which is wrong (nothing
     runs there). Set it to the deployed URL.
   - **Redirect URLs**: add `https://<your-app>.vercel.app/**`. Keep the
     localhost and `192.168.1.61` entries so local testing keeps working.
   - Without this, Google sign-in and password-reset links silently land on the
     Site URL instead of your app.

## 2. Password reset does NOT work yet for other people — fix email first

Measured from the live project config (2026-09-11):

| Setting | Value | Why it matters |
|---|---|---|
| `smtp_host` | `null` | Auth mail goes out on Supabase's **built-in sender**, which is for testing only |
| `rate_limit_email_sent` | **2** | **Two auth emails per hour, for the whole project** |
| `mailer_autoconfirm` | `true` | Email confirmation is off (deliberate — no email infra yet) |

So: if three moms forget their passwords in the same hour, the third one gets
"Too many reset emails in the last hour". The app says that clearly (it does not
crash or lie), but it is still a dead end for them.

**Fix before inviting testers:** connect a real sender — Authentication → Emails
→ SMTP Settings. [Resend](https://resend.com) is the usual pick (free tier:
3,000/month), and Resend → SendGrid → Postmark do not require a domain you own
to get started. Then raise the rate limit under Authentication → Rate Limits.

**The cheap alternative: tell everyone to use "Continue with Google."** A
Google account can't forget its password, and it also skips email entirely. For
a first beta this is genuinely the better instruction — password reset is the
backstop for people who insist on email.

## 3. What to check the moment it is live

1. A direct load of `https://<app>/playdate/<a-real-id>` while signed out →
   the public page, not a 404.
2. **Continue with Google** → consent screen → back to the app.
3. Forgot password → does the email actually arrive? (This is the one thing no
   amount of local testing can prove — it needs a real inbox.)
4. Install it: iPhone Safari → Share → **Add to Home Screen**; Android Chrome →
   **Install app**. It should open full-screen with the splash and its own icon.

## 4. The release gate: sweep the test markers, and prove it worked

**Required before any production validation or invitation.** The e2e suite
drives the LIVE Supabase project, so a run leaves `e2e-` accounts and their rows
in the same database real parents read. The first-use audit of 2026-09-25 found
exactly that leaking into the discovery feed.

```bash
bash scripts/cdp-migration-tooling.sh          # launches the CDP Chrome the sweep reads its token from
node scripts/sweep-e2e-markers.mjs select      # read the counts AND the safety gate
node scripts/sweep-e2e-markers.mjs delete      # refuses if a founder account is inside the marker set
node scripts/sweep-e2e-markers.mjs verify      # exits non-zero if ANY marker row remains
```

`delete` is not fire-and-forget. It prints the exact rows it removed per table,
then **re-reads the database** and fails with exit code 4 if a marker row
survived or a table's total did not drop by exactly the amount the report
claimed. Treat a non-zero exit from either `delete` or `verify` as
release-blocking: it means production still contains test content a parent can
see.

The repo-side half is automatic: `npm run verify` runs
`scripts/guards/fixture-marker-guard.mjs`, which fails if a spec invents a
fixture the sweep's scope does not cover. The convention both halves enforce is
written down in `docs/agents/e2e-fixture-convention.md`.

## 5. Known and deliberate

- **No email confirmation** — anyone can sign up with any address. Fine for a
  friends beta; turn it on (and add a real sender) before any public launch.
- **Kids' first names are in the database.** That was a product decision, but
  it is the reason to keep the beta to people you actually know.
- **The e2e suite writes test accounts to the live database.** See section 4 —
  sweep them, and do not skip the verification step.
