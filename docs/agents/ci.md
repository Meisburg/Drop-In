# CI — the gate on a machine nobody has to remember

**Read this when you change `.github/workflows/`, or when CI is red and you want
to know whether it is real.**

## What runs

The PR gate is one workflow, `.github/workflows/verify.yml`, on every push and
every PR to `master`. Its single substantive step is:

```bash
npm run verify
```

That is deliberate and it is the whole design. `verify` is the contract (build +
test + lint + a11y:focus + steering-lint + guards); the workflow does not
re-list those stages, because a second list would be a second definition of "the
gate" that can drift from the first — the "same fact, two spellings" defect this
repo keeps recording. Change the gate in `package.json` and CI follows.

Alongside it the workflow installs the tracked git hooks, because the
`no-bypass` guard asserts this repository's own config layer (the shared local
scope) still points at `scripts/git-hooks`, and a fresh checkout has no hooks
configured. The guard accepts a differing *effective* `core.hooksPath` only for
an externally owned disposable copy — a linked worktree whose common git dir is
outside the checkout and whose worktree config layer supplies a path inside
that common dir — and it prints every such acceptance. See
`docs/agents/borrowed-guards.md`.

## Turning it on (three repository variables + one repository secret)

The build needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: `src/lib/db.ts`
throws at module load without them, so `npm run build` and `npm test` both fail
(measured by moving `.env` aside, not assumed). The **scheduled live lane** needs
a third variable, `VITE_VAPID_PUBLIC_KEY` — see below; the PR gate does not. It
also needs one **secret**, `SUPABASE_SERVICE_ROLE_KEY`, which neither the PR gate
nor the build ever sees.

Add the three variables at **Settings → Secrets and variables → Actions →
Variables** (the **Variables** tab, not Secrets), and the key on the **Secrets**
tab (`gh secret set SUPABASE_SERVICE_ROLE_KEY`):

| Value | Kind | Where to get it | Needed by |
|---|---|---|---|
| `VITE_SUPABASE_URL` | variable | the same value as `VITE_SUPABASE_URL` in your local `.env` | gate + live lane |
| `VITE_SUPABASE_ANON_KEY` | variable | the same value as `VITE_SUPABASE_ANON_KEY` in your local `.env` | gate + live lane |
| `VITE_VAPID_PUBLIC_KEY` | variable | the same value as `VITE_VAPID_PUBLIC_KEY` in your local `.env` | **live lane only** |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRET** | the same value as `SUPABASE_SERVICE_ROLE_KEY` in your local `.env` (Supabase dashboard → Project Settings → API → `service_role`) | **live lane only** |

**The first three are variables rather than secrets because they are not
confidential.** The anon key is compiled into the shipped bundle
(`dist/assets/index-*.js`) — any browser that loads the site already has it. What
protects the data is RLS, and it does: probed with the anon key, `profiles`,
`messages`, `place_comments` and `parent_cards` each return **zero rows**, while
`places` returns the public directory. Calling it a secret would imply a
confidentiality it does not have, and a future reader would then treat it as
sensitive and be confused when it appears in a bundle. The VAPID **public** key
is the same kind of value by design: it is the browser's own subscription key,
and only its private half is server side.

**The fourth IS a secret, and the distinction is the point** (v31-5): the
service-role key **bypasses RLS entirely**, so a `profiles` read that returns
zero rows with the anon key returns rows with it (v31-5 read the marker's own
row back that way). It is **project-scoped** — it can do anything inside
this one project and nothing outside it — which is exactly why the three
moderator/place-photo specs (`e2e/moderator-door.e2e.ts`,
`e2e/place-photo-admin.e2e.ts`) now write through PostgREST with it. The
alternative they used until v31-5 was the Supabase **Management API**, whose
`SUPABASE_ACCESS_TOKEN` (`sbp_…`) is **ACCOUNT-level** and can run arbitrary SQL
against every project on the account; that token stays **out of CI on purpose**,
and `scripts/db-sql.sh` keeps its own copy in the developer's `.env` for
migrations. Two consequences are wired in rather than left to discipline:

- **It is read from the repo `.env` FILE** the specs already read
  (`e2e/fixtures.ts`), never from the process environment, and the helper fails
  **by name** when it is absent (`SUPABASE_SERVICE_ROLE_KEY missing from
  …/.env`) — never as the opaque `fetch failed` an `undefined` header produces.
- **It must never get a `VITE_` prefix.** `dist/assets/*.js` is public. v31-5
  measured it after `npm run build`: the **full** service-role key, its
  24-character **signature tail** and the literal `service_role` each have
  **zero** hits in the bundle (the same three probes each hit for the public anon
  key, so the instrument works). ⚠️ The key's **first 24 characters do hit once**
  — a legacy Supabase anon JWT and a legacy service-role JWT share them, because
  those characters are the base64url of the JWT header `{"alg":"HS256","typ":"JWT"}`.
  That prefix is shared, not secret; the match is the anon key's own copy in the
  bundle. Judge this key by its payload or its signature, never by its header.

### `VITE_VAPID_PUBLIC_KEY`, and the two days it was missing (2026-10-05)

The live lane's push spec does not merely prefer this key — **it cannot pass
without it.** V28 r3-2 hardened `e2e/push-subscribe.e2e.ts`'s stub to refuse a
keyless `subscribe()` (matching the app, which refuses honestly rather than
calling `subscribe()` with no `applicationServerKey`). So a CI build without the
key fails **exactly one** spec, at "Notifications are on", with a received string
of "Notifications are off…" — a symptom indistinguishable from a flake or from
live-database state, which is how it was read for two days.

**Measured, A/B, only the key differing** (V31 v31-2, 2026-10-05):

    VITE_VAPID_PUBLIC_KEY='' npx playwright test e2e/push-subscribe.e2e.ts --reporter=list
      → 1 failed / 8 passed, EXIT=1   (received: "Notifications are off…")
    npx playwright test e2e/push-subscribe.e2e.ts --reporter=list
      → 9 passed, EXIT=0

Both the workflow and this doc now carry the third variable, and the lane
**skips with a notice** rather than failing red when any of the three is absent —
the same rule as the other two, for the same reason. Since v31-5 the same gate
also covers `SUPABASE_SERVICE_ROLE_KEY`, and its notice names the missing value
(and which tab it lives on) — an unconfigured secret is a setup step too, and the
alternative is three specs failing with a fetch error that says nothing.

**If the variables are missing, the workflow SKIPS the gate with a notice instead
of failing.** A red X for "you have not configured this yet" teaches people to
ignore red Xs; an unconfigured variable is a setup step, not a broken commit.

## What CI deliberately does NOT run on a pull request

`test:e2e` (Playwright) and `npm run a11y:profile-order` both sign up a REAL
marker account against the LIVE Supabase project, so they write throwaway rows
into a production database. They must never run on a PR: a red X caused by a
live-database hiccup is a red X people learn to ignore, and a fork PR cannot see
the repository variables anyway.

| Lane | On a PR | Where it runs instead |
|---|---|---|
| `test:e2e` (Playwright) | never | `.github/workflows/e2e-scheduled.yml`, nightly at 09:17 UTC — see "The scheduled live-account lane" below |
| `npm run a11y:profile-order` | never | the same scheduled workflow, after the suite, against the same preview build |

The `verify` gate itself needs neither, and no scheduled lane blocks a merge.

## The scheduled live-account lane

**The choice was a dedicated test Supabase project or a scheduled run against
the live one; the schedule was chosen, and the reasoning is recorded here so it
is not re-litigated every time someone notices e2e is absent from a PR.**

- **Why the schedule.** The suite ALREADY runs against the live project locally
  and in ad-hoc sweeps — the most recent full sweep went 110 / 115 — so a
  schedule reuses a lane that exists. A second Supabase project would add a
  database to migrate, seed and keep in sync, its own credentials, and its own
  drift, for a lane whose only job is to catch test-versus-product drift. The
  live project is the one the product actually ships against, so it is the
  honest target for that drift.
- **Why not on a PR.** See the table above. The scheduled lane is a separate
  workflow (`on.schedule` + `workflow_dispatch`), so nothing it does can block a
  merge, and `npm run verify` still does not include e2e.
- **What it runs.** `npm run test:e2e` builds and serves the app through
  Playwright's own configured `webServer` (`npm run build && npm run preview` on
  :4173) and signs up the marker; `npm run a11y:profile-order` then runs against
  that same build. The a11y lane IS included because it genuinely runs there:
  the setup spec writes the signed-in marker session to the gitignored marker
  storage-state file under `e2e/.auth/`, the check seeds and restores the bio +
  family photo it needs, and it needs only a browser and a server.
- **Variables, one secret, and the skip.** It uses the same repository variables
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`) **plus
  the `SUPABASE_SERVICE_ROLE_KEY` secret** (project-scoped, bypasses RLS — see
  "Turning it on" above; the account-level management token stays out of CI), and
  the same skip-with-notice behaviour as `verify.yml`. It also writes them all
  into the gitignored `.env`, because the e2e specs read that file directly
  rather than the process environment.
- **Clean-up.** The suite's OWN marker cleanup (`afterEach` / `afterAll` REST
  deletes) removes the rows each spec creates, on the failure path too. The
  marker AUTH USERS persist by design and are removed by the manual
  `scripts/sweep-e2e-markers.mjs` sweep, which needs a Supabase
  dashboard/management token and is deliberately not wired into CI.
- **Failures.** A failed night is a red job plus whatever evidence exists in
  the Actions artifact: failure screenshots from `test-results/`, plus
  `preview.log` only if the a11y step ran and created its server log (a failed
  e2e run skips the a11y step, so it has no `preview.log` to upload), at 1-day
  retention. Evidence from this lane is deliberately limited to screenshots
  and the preview log — never the Playwright trace, whose DOM snapshots,
  network request/response bodies and storage record carry live family data
  and the marker session's access token, none of which belong in repository
  artifact storage.

## When CI is red

1. **Reproduce it locally first:** `npm run verify`. CI runs the same command, so
   a local green usually means an environment difference, not a real finding.
2. **If it is `steering-lint` and you are on a fresh clone**, check
   `ALLOW_ABSENT` in `scripts/steering-lint.sh`. A pointer to gitignored
   machine-local state (e.g. `supabase/.temp/linked-project.json`) resolves on a
   developer machine and nowhere else — that was the first CI failure this repo
   ever had.
3. **If it is `config-guard`**, it is telling you a check-config file changed.
   That is a finding, not noise. Re-run with the reason attached:
   ```bash
   ALLOW_CONFIG_CHANGE="<why>" bash scripts/guards/config-guard.sh <base-sha>
   ```
   and put the same reason in the commit body. Do not silence the guard.
4. **The test count should be identical to your local run.** If CI reports fewer
   files, something is present locally that git does not track — `.scratch/` is
   the usual culprit, and it is gitignored while `vitest` discovers tests by
   walking the tree.

## Why this exists at all

Until V23 this repo had **no CI whatsoever** — no `.github/workflows`, no other
pipeline. Every gate was real but lived on one machine: the pre-push hook, the
three deterministic guards, `verify` itself. A fresh clone, a second checkout, or
another contributor had no enforcement at all, and nothing noticed a red build on
a branch. This workflow is the same command the pre-push hook runs, on a machine
nobody has to remember to run it.
