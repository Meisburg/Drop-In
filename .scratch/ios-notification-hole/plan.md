# Implementation Plan: the iOS notification hole — an email backstop

> ## ⚠️ AMENDED IN PLACE 2026-09-26 — THE TRANSPORT IS SMTP, NOT RESEND
>
> A **founder-approved plan change** (posted by Cora/Hermes CoS; brief at
> `.scratch/ios-notification-hole/SMTP-SWAP-BRIEF.md`) supersedes every
> Resend-specific statement below. The Resend path needed an account **and a
> sending domain** the founder does not have; the Gmail account already carries
> Drop In's auth email and is proven live, so **Gmail SMTP became the primary
> transport**. Read the Resend text below as the *original* design, not the
> shipped one.
>
> **What actually shipped:**
> - `_shared/smtp.ts` — a **pure** transport with an injected client. No library
>   import at all, because a vitest spec imports it under Node.
> - `_shared/smtpDeno.ts` — the real `npm:nodemailer@6` adapter, Deno-only, the
>   one place a mail library appears. Its pure helpers
>   (`smtpStatusFromResponse`, `smtpConfigFrom`) were moved into `smtp.ts` so
>   they are testable; `supabase/functions/_shared/smtpDeno_test.ts` then proved
>   the remaining wiring against an in-process fake SMTP server.
> - `_shared/emailTransport.ts` — the pure precedence: **SMTP → Resend →
>   disabled**, with a `disabled` reason that NAMES the missing secret.
> - **`resend.ts` is retained and stays selectable** (SMTP wins when both are
>   configured), so nothing in Slice 2 is wasted.
>
> **Slice 2 below is therefore DONE AS WRITTEN but is no longer the primary
> path; Slice 3's "Resend 5xx retryable / 4xx terminal" rule is the HTTP rule
> and is INVERTED for SMTP** (4xx transient → retryable; 5xx permanent →
> terminal; no reply code → retryable). Slice 5's wizard is superseded by
> `scripts/setup-email-api.sh` (Management API, no dashboard — the founder lost
> dashboard access, see `task-state.md`). The **domain blocker is RETIRED**: the
> brief states explicitly that it is no longer the blocker, and the live proof
> now pends only the founder's app password via
> `~/hermes/scripts/set-email-credential.sh`.

> Owned by the orchestrator. Written BEFORE any builder dispatch.
> Supersedes nothing: `plan.md` (V22 design batch) is a different, still-active
> batch. This plan lives in its own directory per `docs/agents/issue-tracker.md`.
>
> Default slice gate is `npm run verify`. Slices touching rendered behavior ALSO
> pin `node scripts/mobile-audit.mjs` (needs `npm run build && npm run preview`).

## Goal

An iPhone parent who has **not** installed the app — and therefore cannot
receive Web Push on iOS, full stop — still learns that someone pinged their
drop-in, that it was cancelled, or that it starts within the hour. Alongside it,
auth email stops being a toy: password reset and confirmation currently die at
**2 emails per hour, project-wide**, on Supabase's built-in test sender.

We know it is done when:
1. `npm run verify` passes;
2. a real password-reset email arrives in a real inbox from a real domain;
3. a ping on a drop-in whose host has **no** push subscription produces a
   delivered email, and `notification_log.error` says `sent:email` rather than
   `no subscription`;
4. the founder has seen both on a physical iPhone.

## Non-goals

- **No native shell.** Capacitor/APNs is a separate thrust with its own plan;
  nothing here forecloses it, and slice 3's `channel` seam is where APNs would
  plug in later.
- **No SMS.** Cost plus A2P 10DLC registration; park until density justifies it.
- **No per-kind preference table.** Migration 0032's header explicitly declares
  this out of scope ("gating the sender per kind needs a third table (profile ×
  kind) and is deliberately out of scope here"). Slice 4 adds a single
  **channel-level** opt-out, not a kind matrix. Do not smuggle the matrix in.
- **No marketing email, no digest, no re-engagement.** Only the four existing
  notification kinds, and only when the parent has no push path.
- **No new outbox table.** `notification_log` is already an outbox with a
  dedupe wall, `sent_at` and `error`. Reuse it.

## Interfaces

Pinned here so builders do not re-decide them.

**The outbox (unchanged, migration 0032).** `notification_log`:
`id, profile_id, kind, playdate_id, title, body, url, created_at, sent_at,
error`, unique `(profile_id, kind, playdate_id)`. **FIVE kinds, not four:**
`ping_received | starting_soon | cancelled | new_comment | ended`.
(The "four kinds" wording in 0032's own header is **stale** — migration
`0041_end_event_early.sql` added `ended` and widened the CHECK at 0041:164 to
five values, with its own copy at 0041:276/286. The authoritative client list is
`NOTIFICATION_KINDS` in `_shared/pushCopy.ts`.) Producers are
`SECURITY DEFINER` triggers plus `send-push`'s own catch-up scan for
`starting_soon`. **The copy is already in `title`/`body`/`url`** — email does
not invent new copy, it wraps what the outbox already holds.

**Address resolution.** `profiles` has **no** email column and gains none —
migration 0034 only mirrors `email_confirmed_at`. The single source of truth is
`auth.users.email`, read by the sender via the service-role admin API
(`supabase.auth.admin.getUserById(profile_id)`). Do not add a `profiles.email`
column; it would clone PII into a table with a wider read policy.

**The sender (`supabase/functions/send-push/index.ts`).** One function, one
drain, two transports. It is tempting to add a second Edge Function for email,
and it is wrong: two functions draining the same `where sent_at is null` queue
would race the same rows. Keep one drain. The function name becomes slightly
inaccurate; that is recorded naming debt, not a reason to fork the queue.

**New pure modules** (the build law: domain logic pure, dependencies injected,
sibling test):
- `supabase/functions/_shared/emailCopy.ts` — `buildEmailPayload(row, baseUrl) →
  { subject, html, text, listUnsubscribe }`. Twin of `_shared/pushCopy.ts`,
  unit-tested by `src/lib/email.test.ts` the same way `pushCopy.ts` is pinned by
  `src/lib/push.test.ts`. **The base URL is an INJECTED PARAMETER, never read
  from env inside the module** — this module runs in Deno *and* in the browser,
  and `window` does not exist in Deno. The established shape is
  `buildShareUrl(playdateId, baseUrl, origin)` at `src/lib/trust.ts:252`.
  `notification_log.url` is a RELATIVE path (`0032:237`, `'/playdate/' || id`),
  so the absolute form is `baseUrl + row.url`.
  Callers supply the base: the client twin uses
  `import.meta.env.VITE_PUBLIC_BASE_URL ?? window.location.origin`
  (`VITE_PUBLIC_BASE_URL` is **unset in `.env`** — only in `.env.example` — so
  the origin fallback is the live dev path, per `src/lib/db.ts:1333`); the Deno
  caller uses `Deno.env.get('PUBLIC_BASE_URL') ?? 'https://drop-in-mu.vercel.app'`.
  `listUnsubscribe` derives from the same injected base.
- `supabase/functions/_shared/resend.ts` — `sendEmail({fetch}, msg, apiKey, from)
  → { ok, status, error }`. `fetch` is injected so the unit test never hits the
  network.

**New env (baked at build) and function secrets.** `RESEND_API_KEY` (function
secret, never in the bundle), `EMAIL_FROM` (function secret), `EMAIL_REPLY_TO`
(function secret). The sender reads these from `Deno.env`.

**New column (slice 4), migration `0053`.** `profiles.email_optout boolean not
null default false` — plus the `/profile` toggle. Channel-level, not per-kind.

## Slices

### Slice 1: `emailCopy` — the pure payload builder

- **Objective:** one pure function turns an outbox row into an email payload,
  pinned by unit tests, with no I/O.
- **Files in scope:** `supabase/functions/_shared/emailCopy.ts`,
  `src/lib/email.ts` (client twin re-export), `src/lib/email.test.ts`.
- **Approach:** mirror the `pushCopy.ts` ↔ `src/lib/push.ts` twin pattern
  exactly. `subject` reuses the row's `title` with a `Drop In:` prefix; `text`
  is the row's `body` plus the absolute URL; `html` is a minimal table-free
  template with the same three strings escaped. **HTML-escape title/body/url** —
  a post title is user input and an unescaped one is HTML injection into an
  inbox. Include a `List-Unsubscribe` header value in the payload so slice 3
  does not have to re-derive it.
- **Acceptance criteria:**
  - `buildEmailPayload` returns `{subject, html, text}` for all **five** kinds
    (including `ended` — see the Interfaces correction above).
  - A title of `<script>alert(1)</script>` appears escaped in `html` and
    verbatim in `text`.
  - A title that is empty/NULL renders `your drop-in`, matching
    `notification_payload`'s fallback in migration 0032.
  - `url` is absolute against `VITE_PUBLIC_BASE_URL`.
- **Verification command:** `npm run test -- src/lib/email.test.ts`
- **Budget:** one local builder context. Small.
- **Depends on:** nothing.

### Slice 2: the Resend transport

- **Objective:** one module that POSTs a payload to Resend and reports the
  outcome without throwing.
- **Files in scope:** `supabase/functions/_shared/resend.ts`,
  `src/lib/resend.test.ts`.
- **Approach:** inject `fetch`. Never throw on a non-2xx — return
  `{ok: false, status, error}` so the drain can stamp `notification_log.error`
  instead of crashing the whole run (the 0032 "an unsent row is simply still
  unsent" posture). Treat 429 and 5xx as retryable, 4xx as terminal.
- **Acceptance criteria:**
  - A 200 resolves `{ok: true}`.
  - A 422 resolves `{ok: false, status: 422}` and does **not** throw.
  - A network rejection resolves `{ok: false, error: '…'}` and does not throw.
  - A missing API key short-circuits before any fetch call.
- **Verification command:** `npm run test -- src/lib/resend.test.ts`
- **Budget:** one local builder context. Small.
- **Depends on:** nothing.

### Slice 3: the drain falls back to email

- **Objective:** a recipient with no push subscription gets an email instead of
  being silently stamped and skipped.
- **Files in scope:** `supabase/functions/send-push/index.ts`,
  `supabase/functions/_shared/resend.ts`, `supabase/functions/_shared/emailCopy.ts`,
  `e2e/push-subscribe.e2e.ts`.
- **Approach — the insertion point is PINNED** (verified 2026-09-26 against the
  live file; `send-push/index.ts` is 394 lines):
  - `drain()` is at `index.ts:219`.
  - The drain's select is `index.ts:232-237` and already fetches
    `id, profile_id, kind, playdate_id, title, body, url` — **every field
    `buildEmailPayload` needs, so the select does not change.**
  - The branch to replace is the `subscriptions.length === 0` block at
    `index.ts:259-266`, which today stamps `error: 'no subscription'` and does
    `skipped += 1`.
  - New behaviour for that block: resolve the address → if `email_optout` is
    false, send via the slice-2 transport → stamp `sent_at` +
    `error = 'sent:email'` and `sent += 1`; if opt-out or no address, keep the
    existing `no subscription` stamp and `skipped += 1`.
  - `MAX_SENDS_PER_RUN` (line 58, currently 400) must count an email exactly as
    it counts a push — increment `sends`. Otherwise the per-invocation cap stops
    meaning anything and a backlog blows the function timeout.
  - **The retry rule is the subtle part, and it is pinned:** a Resend **5xx**
    leaves the row **UNSENT** (`sent_at` still null) so the next 5-minute tick
    retries it. A Resend **4xx** is terminal — stamp it, or the row retries
    forever. Do not collapse those two cases into one.
  - Idempotence is unchanged: the unique key plus `sent_at is null` is still the
    wall, and there is still no in-memory dedupe anywhere in the file.
- **Acceptance criteria:**
  - A row whose profile has no push subscription and `email_optout = false`
    results in exactly one Resend POST and `error = 'sent:email'`.
  - The same row re-run sends **nothing** (it is no longer `sent_at is null`) —
    the anti-double-send wall holds for the new transport too.
  - A row whose profile has `email_optout = true` is stamped and sends nothing.
  - A Resend 5xx leaves the row **unsent** so the next 5-minute tick retries.
- **Verification command:** `npx playwright test e2e/push-subscribe.e2e.ts`
- **Budget:** one local builder context. **This is the slice most likely to
  overrun** — if the drain's structure resists a clean two-transport shape,
  stop and split rather than growing the function past the window.
- **Depends on:** slices 1, 2, and 4 (the opt-out column must exist to read).

### Slice 4: channel-level opt-out

- **Objective:** a parent can turn email off, and the sender honours it.
- **Files in scope:** `supabase/migrations/0053_email_optout.sql`,
  `src/components/NotificationsSection.tsx`, `src/lib/db.ts`,
  `src/components/NotificationsSection.test.tsx`.
- **Approach — pinned (verified 2026-09-26):**
  - Migration `0053_email_optout.sql`: `add column if not exists email_optout
    boolean not null default false` (idempotent, re-paste-safe — the 0032
    discipline).
  - **No new RLS policy is needed.** `profiles_update_own`
    (`0001_create_profiles.sql:25`) already grants owner updates on **every**
    column — stated explicitly at `0012_zip_radius.sql:682` — and the existing
    owner-only SELECT covers the read. Adding a policy here would be noise.
  - Types: add `email_optout?: boolean` to the `Profile` interface at
    `src/lib/types.ts:7`. It must be **optional**, with a doc comment naming
    migration 0053 — that file's established convention for a column that may be
    absent on a not-yet-migrated project (see `moderators?` and `banned_at?`).
  - UI: a **sibling block** to the push-status div, rendered after it inside
    `NotificationsSection`. **CORRECTION (verified 2026-09-26): this section
    lives at `/settings`, NOT `/profile`.** `src/App.tsx:527` declares
    `<Route path="/settings" element={<SettingsPage />} />` and
    `src/pages/SettingsPage.tsx:128` renders `<NotificationsSection />`. The
    `/profile` phrasing in migration 0032's comments is stale. The section
    itself starts at `NotificationsSection.tsx:213`; the push status closes at
    line 319, so the email toggle goes after that. Follow the local idiom
    exactly: `min-h-11` (44px — the repo's tap-target floor, which `ocr` also
    enforces), an explicit `data-testid` (`email-optout-toggle`), and
    `disabled={busy}` while the write is in flight. Existing testids to sit
    beside: `push-turn-on`, `push-turn-off`, `push-install-button`,
    `push-fallback-note`. No new route is added, so `.scratch/playtest/routes.json`
    already covers `/settings`.
  - Copy must NOT promise email when `RESEND_API_KEY` is unset — reuse the
    0032 "isn't switched on for this deployment yet" honest-state pattern.
- **Acceptance criteria:**
  - Re-running the migration twice is a no-op.
  - Toggling off writes `email_optout = true` and the toggle renders off after
    a reload.
  - With the key unset, the section says email is not configured rather than
    offering a control that does nothing.
- **Verification command:** `npm run verify`
- **Budget:** one local builder context.
- **Depends on:** nothing (slices 3 depends on it).

### Slice 5: the Resend + Supabase setup wizard (human-only)

- **Objective:** the founder can perform every dashboard step once, guided,
  with values captured into `.env` and Supabase function secrets.
- **Files in scope:** `scripts/setup-email.sh`.
- **Approach:** wizard per `~/.agents/skills/wizard/template.sh`. Stages: Resend
  account/API key → verify sending domain (DNS) → Supabase Auth SMTP →
  Supabase rate limits → `send-push` function secrets → a real password-reset
  delivery test → write `.env`. **No GitHub secrets** — CI references only
  `vars.VITE_SUPABASE_URL` and `vars.VITE_SUPABASE_ANON_KEY`, and neither
  changes here.
- **Acceptance criteria:**
  - `bash -n scripts/setup-email.sh` passes; `shellcheck` clean if available.
  - A stranger following only the on-screen text can complete it.
  - `RESEND_API_KEY` is entered via `ask_secret` (never echoed).
- **Verification command:** `bash -n scripts/setup-email.sh`
- **Budget:** n/a — authoring, not a builder slice.
- **Depends on:** nothing. **Can run today.**

## Risks / open questions

- **THE BLOCKER: there is no domain.** Resend's shared `onboarding@resend.dev`
  sender only delivers to the Resend account owner's own address, so it cannot
  carry a cohort. A real sender needs a domain with SPF + DKIM (and ideally
  DMARC) records. `drop-in-mu.vercel.app` is a Vercel subdomain and cannot be
  verified for sending. **Slice 3 cannot be proven in production until this is
  decided.** Options, cheapest first: (a) buy a domain (~$12/yr) and use it for
  both the app and email; (b) use a domain already owned; (c) defer slice 3 and
  ship slices 1, 2, 4 and the auth-email fix — which still fixes password reset.
- **Deliverability is not a config checkbox.** A brand-new domain sending
  notification mail to Gmail/Outlook lands in spam until it has sending history.
  Expect a warm-up period and monitor Resend's bounce/complaint rates. This is
  a real risk to "iOS parents actually get told", not a footnote.
- **Consent.** `ping_received` and `new_comment` are arguably transactional;
  `starting_soon` is closer to a reminder. CAN-SPAM requires a working
  unsubscribe and a physical address on commercial mail. Slice 1 produces
  `List-Unsubscribe`; slice 4 supplies the toggle. **Confirm the classification
  with counsel if this ever becomes non-trivial volume** — do not have me
  decide it.
- **`send-push` is now misnamed.** It drains two transports. Renaming means a
  redeploy plus a `pg_cron` change, so it is deliberately deferred; record it in
  `task-state.md` so it is not rediscovered as a bug.
- **iOS eviction.** An installed iOS web app is exempt from Safari's 7-day
  script-writable-storage cap, but a lapsed push subscription on iOS is still a
  silent failure mode. Email is the backstop for exactly that case, which is a
  second reason slice 3 matters beyond "never installed".

---

## Status log (orchestrator appends after every phase transition)

- 2026-09-26 — Plan written. Investigation of `notification_log` (0032),
  `send-push/index.ts`, and `src/lib/push.ts` corrected the initial brief in two
  ways: the iOS install guidance is **already built and unit-tested**
  (`installSurface` / `pushOptInGate` / `IOS_INSTALL_REASON`, with the install
  card at `NotificationsSection.tsx:230`), and **no email transport exists
  anywhere in the repo**. So "email first" is two distinct workstreams, not one:
  a ~30-minute dashboard fix for auth email, and a genuine new delivery channel
  for playdate notifications. Slice 5 is unblocked and runnable today; slice 3
  is blocked on the domain decision above. Next: dispatch slice 5 authoring
  (done) and ask the founder for the domain decision.

- 2026-09-26 (goal round 1) — **Objective (1) measured live, not assumed.** Read
  through the Supabase Management API (`GET /v1/projects/<ref>/config/auth`,
  read-only) against project `ayzvjwxbxyrcgyoeaxuk`:
  `smtp_host: null`, `smtp_port: null`, `smtp_user: null`,
  `rate_limit_email_sent: 2`, `mailer_autoconfirm: true`,
  `external_google_enabled: true`. So the app is **still** on Supabase's built-in
  sender with a **2-per-hour project-wide** cap — `beta-checklist.md`'s
  2026-09-11 measurement still holds today. Slice 5 is therefore still the whole
  of the fix, and it is still human-only (a Resend account cannot be created by
  an agent).
- 2026-09-26 (goal round 1) — **Slice 3 de-risked by pinning its insertion
  point** before dispatch (see the Slice 3 section). Also verified for slice 4:
  migration `0053` is a free slot (highest applied is `0052_reviews.sql`), and
  `profiles_update_own` (`0001_create_profiles.sql:25`) already grants owner
  updates on **every** column — per `0012_zip_radius.sql:682` — so
  `email_optout` needs **no new RLS policy**, only the column and the UI.
  Slice 1 dispatched to a local builder. Next: review slice 1's evidence, then
  build slices 2 and 4.
- 2026-09-26 (goal round 3) — **The first Slice 1 dispatch WEDGED and was
  killed.** Three rounds, zero files written, no writes under `src/` or
  `supabase/`, GPU at ~5% with the model still resident: a hung dispatch, not a
  slow one. Diagnosed cause: the brief told the builder to read **six** files
  including `0032_notification_log.sql` (478 lines, largely comment prose), which
  very likely exhausted its 98k window before it produced any output.
  **Lesson worth keeping: "briefs point at files, never pasted chat history"
  does NOT mean pointing at a 478-line migration — a builder brief should INLINE
  the rules it needs and reference one file for the pattern to mirror.**
  Re-dispatched with a single reference file (`_shared/pushCopy.ts`) and every
  copy rule inlined.
  This is a **dispatch** failure, not a slice failure, so the plan's 5-round fix
  loop does not apply. If the tight brief also fails, the escalation is **by
  model** — cloud via `tool-workflow`, which accepts a per-agent `provider`/
  `model` override that `tool-subagent` does not expose. Recorded so the next
  session does not re-diagnose it.
- 2026-09-26 (goal round 4) — Slice 1's retry is producing files
  (`_shared/emailCopy.ts` 76 lines, `src/lib/email.test.ts` 190 lines;
  `src/lib/email.ts` still pending). Two rulings, both cases where the builder
  was more right than the orchestrator:
  - **(a) The builder's test design beat my pinned contract, so I adopted it.**
    The spec injects ONE `EmailEnv { baseUrl, replyTo }` instead of my positional
    `baseUrl` string; it names `FALLBACK_BASE_URL` as a constant; and it builds
    `listUnsubscribe` as a `mailto:` with a `${base}/settings` fallback,
    explicitly refusing to invent an `unsubscribe@` mailbox ("a dead mailbox is
    worse than no mailto at all") — sharper than my `<${base}/profile>` pin. The
    MODULE is what changes; the tests are not downgraded to match it.
  - **(b) I had the route WRONG and the builder had it right.** The Notifications
    UI is at **`/settings`**, not `/profile`: `src/App.tsx:527` declares the
    route and `src/pages/SettingsPage.tsx:128` renders `<NotificationsSection />`.
    Migration 0032's comments referring to a "/profile Notifications section" are
    **stale**. The Slice 4 pin above is corrected.
  - **The recurring lesson across rounds 2 and 4: both were MY pins being wrong,
    not the builder's execution.** Pinning interfaces before dispatch is still
    right, but a builder that contradicts a pin is *evidence*, not noise — verify
    it against the repo before overriding it. Corrected the brief by message
    rather than restarting the dispatch.
  - A real defect the spec caught that my brief never specified: `emailCopy.ts:64`
    does `row.body + '\n\n' + absolute`, which renders the literal string `null`
    for a NULL body. Fix required and sent.
  Next: verify Slice 1's raw test output (`npm run test -- src/lib/email.test.ts`,
  run by me, not taken from the report), then dispatch Slice 2.
- 2026-09-26 (goal round 5) — **Slices 1 and 2 are DONE and independently
  verified. The escalation-by-model rule paid for itself.**
  - **Slice 1 failed twice on the local builder and succeeded first time on the
    cloud model.** Attempt 2 is the instructive failure: it produced a module
    whose *own rewritten tests passed 10/10 while hiding a real bug* — it trimmed
    `email.test.ts` from 190 to 143 lines to match its smaller implementation,
    dropping the NULL-body case, and left `row.body + '\n\n' + absolute` in
    place, which renders the literal string `null` into an email. **Green tests
    over a downgraded contract is the worst failure mode there is: false
    confidence.** A cost optimisation that manufactures that is a bad trade.
  - **Routing decision for the rest of this batch: slices 2 and 4 (and 3 when
    unblocked) go to the cloud model via `tool-workflow`.** Note that
    `tool-workflow` carries no `agentOptions`, so per `docs/agents/model-routing.md`
    its workers fall back to the cloud default — which is exactly the intended
    escalation, with no risk of guessing a model id. **Cost implication: these
    slices spend cloud tokens, unlike the local-builder default.** Recorded
    rather than hidden, because it deviates from the plan's per-slice budget note.
  - Slice 1 evidence (all re-run by me, not taken from a report): `vitest run
    src/lib/email.test.ts` → **22 passed**; `npm run typecheck` → **exit 0**;
    `npm run build` → **exit 0** (confirms the cross-directory
    `../../supabase/functions/_shared/*.ts` import bundles); `grep` confirms
    `emailCopy.ts` reads no `import.meta`/`Deno.env`/`window`.
  - Slice 2 evidence (re-run by me): `vitest run src/lib/resend.test.ts` →
    **19 passed**; both new specs together → **41 passed**; `npm run typecheck` →
    **exit 0**. The load-bearing rule is implemented exactly as pinned:
    `const retryable = status === 429 || (status !== null && status >= 500)`
    (`resend.ts:199`), with `sendEmail` never throwing.
  - Slice 2's file list in the plan was incomplete — it now also ships
    `src/lib/resend.ts`, the app twin that re-exports the shared module.
  Next: dispatch Slice 4 (the opt-out column + toggle), which Slice 3 depends on.
- 2026-09-26 (goal round 5, cont.) — **ALL FOUR CODE SLICES ARE DONE. `npm run
  verify` exits 0** (build + full unit suite + lint + a11y focus + steering-lint
  + every deterministic guard). Cumulative new coverage, all re-run by the
  orchestrator rather than taken from a report: `email.test.ts` 23,
  `resend.test.ts` 19, `emailOptout.test.ts` 9, `db-email-optout.test.ts` 9,
  `emailFallback.test.ts` 14 — **65 passing across the five new specs**,
  `npm run typecheck` exit 0, `npm run build` exit 0.
  - **A SECOND ORCHESTRATOR PIN WAS WRONG, AND A BUILDER CAUGHT IT.** The plan
    said the outbox has "four kinds". It has **FIVE** — `0041_end_event_early.sql`
    added `ended` (CHECK widened at 0041:164, its own copy at 0041:276/286), and
    the authoritative list is `NOTIFICATION_KINDS` in `_shared/pushCopy.ts`.
    Migration 0032's own header saying "four" is **stale**, and I had trusted it.
    Slice 1 therefore shipped `EMAIL_KINDS` with four values. Fixed, and a
    **drift guard** now asserts `EMAIL_KINDS` deep-equals `NOTIFICATION_KINDS` so
    two hand-maintained lists of the same thing can never silently diverge again.
    That guard is the real fix; the one-word addition is only the symptom.
  - Slice 3's design was improved before dispatch: the fallback DECISION was
    extracted to a pure `_shared/emailFallback.ts` (+ `src/lib/emailFallback.ts`
    twin + spec) instead of being inlined in the Deno function, so the
    retry/terminal split is unit-tested rather than only reachable through an
    8-minute e2e run. Verified by reading the drain: `retry` does **not** stamp
    `sent_at` (a stamp would drop the notification forever), `terminal` does
    (never stamping would retry a bad address forever and starve the
    oldest-first queue), `sends += 1` precedes the email so `MAX_SENDS_PER_RUN`
    counts it, and error strings are truncated to 500 chars.
  - **STILL NOT DONE, and none of it is code:** (1) the migration `0053` is
    authored but **NOT APPLIED** to the live database; (2) `send-push` is **NOT
    DEPLOYED** — note the new branch is gated on `RESEND_API_KEY` + `EMAIL_FROM`,
    so deploying with no secrets is **behaviour-preserving and safe**; (3) no
    Resend account, so no domain and no secrets; (4) no real-device verification.
  Next: apply `0053`, then deploy `send-push`, then the founder's Resend setup
  (wizard), then real-hardware verification.
- 2026-09-26 (goal round 6) — **Migration `0053` IS APPLIED LIVE and verified.
  A new verification lane for Edge Functions now exists. `send-push` is
  deliberately NOT deployed.**
  - **`0053` applied** to project `ayzvjwxbxyrcgyoeaxuk` with the browserless
    path (`bash scripts/db-sql.sh --file …`), not `apply-migration.mjs` — the
    latter drives the human's own Chrome (browser-lanes.md §7). Evidence:
    pre-check returned `[]` (column absent) with 438 profiles; after apply the
    column is `boolean`, `NOT NULL`, `default false`; the actual opted-out count
    is **0 of 438**; re-applying the identical file exits 0 with **no error, no
    change and no data disturbed** — the idempotence acceptance criterion, proven
    against the live database rather than argued from the SQL text.
  - **THE EDGE FUNCTIONS HAD NO TYPE-CHECK LANE, AND NOW THEY DO.** `npm run
    typecheck` is `tsc -b` and does **not** cover `supabase/functions/` — those
    files use Deno globals and `npm:` specifiers tsc cannot resolve. So slice 3's
    drain rewrite was verified by "typecheck plus inspection", which sounded fine
    and meant **tsc had never seen the file**. `deno` 2.9.6 is installed on this
    box, so `scripts/deno-check-functions.sh` now type-checks every entrypoint in
    the runtime that will actually execute it: `send-push` and `prefill-playdate`
    both **PASS** (`deno check` exit 0). It stages a temp copy rather than adding
    `supabase/functions/deno.json`, because that file would change how the
    Supabase CLI **bundles** on deploy — a deployment-affecting change a check
    script has no business making. It leaves the repo's `node_modules` and
    lockfile untouched, and exits 0 when deno is absent so it can never be a
    hard CI dependency.
  - **`package.json` IS `config-guard`-protected** (`scripts/guards/config-guard.sh:62`),
    so wiring this new lane into the `verify` chain is a protected change needing
    `ALLOW_CONFIG_CHANGE="<why>"` and a human decision. **Not done unilaterally.**
    It is left standalone, which is an established pattern here (`mobile-audit.mjs`,
    `verify-pwa.mjs`, `verify-splash.mjs`, `design-detect.mjs` are all standalone).
    **Per invariant 9 this needs adopting or it will rot — flagging rather than
    silently wiring.**
  - **`send-push` was deliberately NOT deployed, and the reasoning is the point.**
    With no `RESEND_API_KEY`/`EMAIL_FROM` the new branch is unreachable, so a
    deploy delivers **zero** user value today while putting a first-time CLI
    fetch and a live function serving 438 profiles at risk. Production is
    currently *consistent*: the DB has the inert column, the app and the function
    are unchanged. Better to deploy atomically with the secrets, when it can be
    verified end to end.
  - **The blast radius was proven, not assumed**, in case that decision is
    revisited: `git diff` on the function is 154 insertions and **5 deletions**,
    and all five are accounted for — three are header-comment rewording, and the
    other two (`.update({…'no subscription'})` and `skipped += 1`) are reproduced
    **verbatim** inside the new `if (!EMAIL_ENABLED)` branch. `grep` over the diff
    confirms **no change** to the push-send/prune path. So with no secrets
    configured the drain executes byte-identical logic.
  - Targeted e2e `e2e/push-subscribe.e2e.ts`: **8 passed / 0 failed, 33.7s**,
    exit 0 (the plan's pinned verification for slice 3, and cheap enough to be a
    during-slice lane per browser-lanes.md §3).
  Next: the founder's Resend account (wizard), then secrets + deploy together,
  then real-hardware verification.
- 2026-09-26 (goal round 7) — **The last real coverage gap is closed, and a
  repo-wide false-green hazard was found in the e2e harness.**
  - `e2e/email-optout.e2e.ts` added and **verified by the orchestrator** (not
    taken from a report): **3 passed / 0 failed, exit 0, 12.1s**, run with :4173
    confirmed free. It is a genuinely strong spec: it asserts the **wire body** of
    each write (`email_optout: true` on uncheck, `false` on re-check) — so a
    client that consistently inverted *both* the read and the write, passing a
    UI-only round trip while unsubscribing everybody, still fails — then does a
    **full `page.reload()`** and reads `profiles.email_optout` back over REST in
    both directions. It also guards a subtle false-green: because a *failed* read
    renders the same default-on checked state (rule c of
    `decideEmailOptoutControl`), `expectReadSucceeded` asserts the note and error
    line are absent, so "the default is on" cannot pass over a broken read.
    It is idempotent (normalises the marker's column before asserting) and
    restores state in-test and again in `afterAll` — the cleanup line
    `[e2e cleanup] ok — marker profile reset to email_optout=false` is in the
    output. This matters because the repo has **zero vitest component tests**, so
    e2e was the *only* lane that could prove the rendered control works at all.
  - **THE HAZARD, and it invalidates results rather than code:**
    `playwright.config.ts:54-69` sets `reuseExistingServer: true` and justifies
    it with "Building first makes reuse safe: the server restarts on the fresh
    output". **That is wrong.** When :4173 is already answering, Playwright never
    runs the `command` at all, so `npm run build` does not execute and the suite
    is served whatever that process was started from. A **different worktree's**
    `vite preview` (there are at least two on this box: `v25`,
    `cpilot-free-usage-query`) therefore makes the suite test a *different
    revision of the app*. It was caught on this spec's very first run, which was
    served by `v25`'s older build — one with **no email opt-out block at all**.
  - **Prior result re-validated rather than left standing on luck:** the earlier
    `e2e/push-subscribe.e2e.ts` **8 passed** had been taken without checking the
    port. Re-run with :4173 confirmed free: **8 passed / 0 failed, exit 0,
    33.0s** — it stands, but it stood by luck the first time, not by method.
  - **Not fixed, and the reason is the guard working correctly:**
    `playwright.config.ts` is `config-guard`-protected
    (`scripts/guards/config-guard.sh:62`), so editing it needs
    `ALLOW_CONFIG_CHANGE="<why>"` plus a human decision. Candidate fixes in the
    hazard record in `task-state.md`; best is deriving the preview port from the
    worktree so two worktrees cannot collide. Per invariant 9, deliberately **not**
    papered over with another standalone preflight script that nothing invokes.
  Next: the founder's Resend account (wizard), then secrets + deploy together,
  then real-hardware verification.
- 2026-09-26 (goal round 8) — **`send-push` IS DEPLOYED AND PROVEN RUNNING. The
  engineering side of this plan is complete; everything left is human-gated.**
  - Deployed with the Supabase CLI (`npx --yes supabase@2.118.0 functions deploy
    send-push --project-ref …`, authenticated by `SUPABASE_ACCESS_TOKEN` — no
    interactive `supabase login`, and no repo pollution: `package.json` and
    `node_modules` untouched). Exit 0, 905 kB bundle.
  - **Verified by three independent probes, not by the CLI's own success
    message:** (1) Management API metadata — `version` **2 → 3** and
    `ezbr_sha256` **`54e36b98…` → `737a68d9…`**, so the deploy actually took, with
    `verify_jwt: true` preserved and status `ACTIVE`; (2) the anon probe — a
    request with the anon key still answers **401 `{"error":"send-push is
    service-role only"}`**, byte-identical to the pre-deploy response, proving
    the function serves and its auth wall is intact without draining one queue
    row; (3) execution — the 15:05:00 cron tick returned
    **`status_code: 200, timed_out: false`** in `net._http_response`.
  - **A timing trap nearly produced false evidence, and it is now written down.**
    The deploy completed at **15:00:26 UTC**; the cron tick at **15:00:00** had
    already run 26 seconds *earlier*, on the OLD bundle, and the row it stamped
    looked exactly like post-deploy proof. `cron.job_run_details` said
    `succeeded` for that tick too. **A `succeeded` tick is not evidence your
    deploy ran** — the tick's `start_time` must be compared against the deploy's
    `updated_at`. Recorded in `docs/email-fallback-ops.md` so the next session
    does not re-derive it.
  - **New ops doc: `docs/email-fallback-ops.md`.** What is deployed vs not, the
    three probes with copy-pasteable commands, the cron timing trap, and the
    operational reading of the `error` column (`sent:email` on success; a
    retryable failure deliberately leaves `sent_at` NULL and **is not a stuck
    queue** — stamping it by hand would drop the notification forever). It also
    records that `push-setup.md`'s pg_net 5-second-timeout note is now stale for
    this function, since real runs return 200.
  - **Deliberately NOT done, and the reason is a documented sequence, not
    timidity:** the objective's "raise the 2/hour rate limit" was **not** applied
    in isolation. `docs/beta-checklist.md` §2 sequences it **after** connecting
    real SMTP ("Fix before inviting testers: connect a real sender … *Then* raise
    the rate limit"). Raising the ceiling on Supabase's test-only built-in sender
    would make the failure mode noisier while looking like progress. It stays a
    one-line Management API call once Resend exists.
  **STATE: all engineering is done, deployed and verified.** Remaining, entirely
  human-only: create the Resend account (`scripts/setup-email.sh`), decide/buy a
  sending domain, set the `send-push` secrets, raise the rate limit, and verify
  on a physical iPhone.
