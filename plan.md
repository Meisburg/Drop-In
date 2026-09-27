# Implementation Plan: V26 — the post-drop-in review prompt

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below must be executable without interpretation. If a slice cannot state its
> acceptance criteria and verification command, it is not ready.
>
> The default slice gate is `npm run verify` (build + test + lint). Anything
> extra is pinned per slice.
>
> **This file replaces the V22 design-quality batch plan, which is preserved
> byte-identically at `plan-v22-backup.md` (verified `diff -q` clean at the time
> of writing).**

## Goal

A drop-in a parent said they were going to ends. Within one 5-minute cron tick
of it ending, that parent gets **one** Web Push — or, if they have no device
registered at all, one email through the existing fallback branch — inviting
them to rate the place. Tapping it lands on `/place/<id>/details`, where the
**existing** `ReviewForm` is already rendered, and the rating they leave is the
**same row** the place page has always written (`reviews`, one row per
(place, parent), migration 0052). No new table, no new form, no new route.

We will know it works when a seeded finished drop-in with a `place_id` produces
exactly one `notification_log` row of kind `review_due` on the first run of
`send-push` and zero on the second, and the row's `url` opens the review form.

## Non-goals

- **No new review model.** `reviews` stays place-level, one row per
  (place, parent). No per-drop-in reviews, no attendance verification, no
  "verified visit" badge. The review prompt and the place page write the same
  record — that is a requirement, not an implementation detail (see Interfaces).
- **No in-app "while you were away" prompt.** Push + email only. An in-app
  banner is a separate ask if the push proves too quiet.
- **No prompting when `place_id is null`.** Most drop-ins are at a typed
  address with no directory place to attach stars to; the feature is silent
  there. Accepted gap.
- **No anti-nag beyond what exists.** The `(profile_id, kind, playdate_id)`
  unique key already makes it once-per-drop-in, and the `/settings` per-kind
  mute already covers "stop telling me". A weekly family at the same park gets
  a weekly prompt; a "don't ask again for this place" rule is out of scope.
- **No change to `notificationUrl(playdateId)`.** It is pinned by
  `src/lib/push.test.ts:283` and five call sites use it. Add a sibling function
  instead.
- **No new route.** `/place/:id` and `/place/:id/details` both exist
  (`src/App.tsx:511` and `:520`), so `routes.json` (the playtest lane) is
  unchanged.
- **No service-worker change.** `src/sw.ts:154` reads `data.url` generically.

## Interfaces

The orchestrator pins these. Builders do not re-decide them.

**Kind name:** `'review_due'`. Deliberately **not** reusing `'ended'`, which
already means *"the host ended it early — don't head out"* (`0041`, pin d) —
different moment, different copy.

**Copy** (the one place it lives, per `0032` pin i):

| Field | Value |
|---|---|
| push title | `How was "<subject>"?` |
| push body | `You said you were going — rate the place.` |
| url | `/place/<place_id>/details` |

`<subject>` is the drop-in title, falling back to `'your drop-in'` — the
existing `TITLE_FALLBACK` in `_shared/emailCopy.ts:55` (reviewer caught this
plan citing `:44`, which is wrong at base `63ef790`).

**The body says "you said you were going", not "you went".** `going_pings`
(`0007`) has **no status column and no check-in exists** — a ping is a stated
intention, not evidence of attendance. Copy that claims attendance would be
false for every no-show. This is a hard rule for the reviewer, not a style note.

**New pure function in `supabase/functions/_shared/pushCopy.ts`:**

```ts
export function reviewPromptUrl(placeId: string): string {
  return `/place/${placeId}/details`
}
```

`NotificationPayloadInput` gains exactly one optional field:

```ts
  /** The place to review. Only `review_due` uses it; null falls back. */
  placeId?: string | null
```

`buildNotificationPayload` returns `reviewPromptUrl(placeId)` for `review_due`,
and **falls back to the existing `notificationUrl(playdateId)` when `placeId` is
null/empty** — never `/place/null/details`.

**"Finished" means `status = 'on' and ends_at < now()`.** Nothing sets `'ended'`
automatically (only a host ending early does, `0041`), so a naturally-expired
drop-in keeps `status = 'on'` forever — that predicate is how "it's over" is
expressed. **A `cancelled` or `ended` drop-in must never prompt for a review.**

**Migration number: `0055`** (highest applied is `0054`; `0055` is next free).
Live-database migration on real family data: every statement guarded, additive,
re-paste-safe — follow `0052`'s structure, not its content.

**The SEVEN hand-maintained lists that describe ONE database constraint.** All
must agree. The explicit drift guard is `src/lib/email.test.ts:87`
(`EMAIL_KINDS` must equal `NOTIFICATION_KINDS`); the `isNotificationKind` block
in `src/lib/push.test.ts` (cited by symbol, not line — the file grew during this
slice and a stale number is how this plan already produced two false citations)
pins the same list from the app side (`isNotificationKind` accepts exactly
these and rejects anything else):

| # | Location | What |
|---|---|---|
| 1 | `supabase/migrations/0041_end_event_early.sql:165` (widened by `0055`) | the `notification_log.kind` CHECK |
| 2 | `supabase/functions/_shared/pushCopy.ts:27` | `NOTIFICATION_KINDS` |
| 3 | `supabase/functions/_shared/pushCopy.ts` (`buildNotificationPayload`) | the copy branch |
| 4 | `supabase/functions/_shared/emailCopy.ts:39` | `EMAIL_KINDS` — **same order** |
| 5 | `src/lib/push.ts` | the `NotificationKind` union + `NOTIFICATION_KIND_COPY` (a `Record`, so TypeScript forces the entry) |
| 6 | `supabase/migrations/0041_end_event_early.sql:246` (replaced by `0055`) | `public.notification_payload`'s `CASE` branches (the `ended` branch is at `:276`) |
| 7 | `e2e/push-subscribe.e2e.ts:939-946` (the `const kinds` array; `'review_due'` at `:945`) | a hand-written five-name array + a docstring asserting "every NOTIFICATION_KIND renders a checkbox" / "all five start CHECKED" |

**Row 7 was added by review, not by the author of this plan — and that is the
point.** This inventory claimed "six" while the slice's own disease (a
hand-maintained kind list that no longer matches the code) was sitting in an
e2e spec the plan never named: `NotificationsSection` maps `NOTIFICATION_KINDS`,
so a **sixth toggle renders with no assertion covering it** and its docstring
became false the moment the kind list grew. `npm run verify` cannot see it —
nothing under `scripts/` names the kinds, and e2e is a separate lane. **Any
future kind change must sweep all seven rows.**

**The SQL payload branch is deliberately unreachable in production** and is
added anyway for twin parity: `review_due` is clock-produced by the scan, which
builds its payload in TypeScript exactly as `catchUpStartingSoon` does
(`send-push/index.ts:269`), so no trigger ever calls `notification_payload`
with this kind. Recording the reason beats a reviewer re-litigating it.

**The email fallback needs almost nothing.** `EmailRow.url` is the relative path
already stored on the `notification_log` row (`emailCopy.ts:77`) and
`emailUrl(url, base)` only prefixes the base (`:124`), so a correct `url` on the
row is all the email needs. Only `EMAIL_KINDS` gains the entry.

**New constant in `send-push/index.ts`, beside `STARTING_SOON_WINDOW_MINUTES`
(`:133`):**

```ts
/** Only drop-ins that ended within this many hours are considered. */
const REVIEW_PROMPT_WINDOW_HOURS = 24
```

The window keeps the scan bounded. Without it, the every-5-minutes query walks
all history forever. Reuse the existing `MAX_SCAN_POSTS = 500` cap (`:142`).

**Idempotence is the existing unique key, not new logic:**
`upsert(rows, { onConflict: 'profile_id,kind,playdate_id', ignoreDuplicates: true })`.

## Slices

### Slice 1: the `review_due` kind exists, end to end, with no producer

- **Objective:** migration `0055` widens the `notification_log.kind` CHECK and
  completes the SQL twin; all six lists carry `'review_due'`; the pure copy and
  URL rules exist and are unit-tested.
- **Files in scope:**
  - `supabase/migrations/0055_review_prompt.sql` (new)
  - `supabase/functions/_shared/pushCopy.ts`
  - `supabase/functions/_shared/emailCopy.ts`
  - `src/lib/push.ts`
  - `supabase/functions/send-push/index.ts` — **only** the `NotificationKind`
    import/`isNotificationKind` surface if it does not compile; **no scan, no
    wiring**
  - `src/lib/push.test.ts`, `src/lib/email.test.ts`
  - `e2e/push-subscribe.e2e.ts` — **added to scope by review ruling** (see
    Interfaces row 7 and the Status log). Its :931-937 array and its :909/:916/
    :920 docstring are place 7 of the same list; leaving them uncured would ship
    a rendered-but-unasserted sixth toggle and a false docstring.
  - `src/lib/db.ts` — **added to scope by review ruling**: the comment at :3640
    reads "not one of the five" and the diff makes it stale. Comment-only fix.
  - `supabase/migrations/0055_review_prompt.sql` must be mode **644**, matching
    all 50 sibling migrations (it was created `600`; `find
    supabase/migrations -name '*.sql' ! -perm 644` must return nothing).
- **Approach:** mirror `0041`'s amendment structure exactly — `drop constraint
  if exists` + re-`add` the widened CHECK inside the guarded `DO` block; `drop
  function if exists public.notification_payload(text, uuid, text, text, int)`
  then `create` with the `review_due` branch added and **every other branch
  carried over char-for-char**. Re-grant exactly as `0032:268-271` does
  (`service_role` only; `public`/`anon`/`authenticated` revoked). Append
  `'review_due'` to `NOTIFICATION_KINDS` and `EMAIL_KINDS` in the **same
  position in both**; add the `NOTIFICATION_KIND_COPY` entry; add the
  `buildNotificationPayload` branch and `reviewPromptUrl`.
- **Acceptance criteria:** criteria **1–3 are coordinator-applied** (after the
  builder's gate, per `docs/agents/coordinator.md` step 3 — the live apply needs
  the human's CDP browser and credentials, so no builder touches production);
  criteria **4–7 are builder-owned** and must be green before the builder
  returns.
  1. *(coordinator)* `0055` applies clean to the live database and **applies a
     second time with exit 0** (re-paste-safe).
  2. *(coordinator)* Read-back proves `notification_log`'s kind CHECK
     **accepts** `'review_due'` and **still rejects** a bogus kind — both
     probed, not assumed.
  3. *(coordinator)* Read-back proves `public.notification_payload` exists with
     the same signature and `prosecdef`/`stable` as before, and that
     `notification_payload('review_due', …)` returns non-empty
     title/body/url.
  4. `EMAIL_KINDS` and `NOTIFICATION_KINDS` are both **six** entries, in the
     same order; both drift guards green.
  5. `buildNotificationPayload({ kind: 'review_due', playdateId, postTitle: 'Green Lake', placeId })`
     → `url === '/place/<placeId>/details'`, `title === 'How was "Green Lake"?'`.
  6. `buildNotificationPayload({ kind: 'review_due', playdateId, placeId: null })`
     → `url === '/playdate/<playdateId>'`, **never** `/place/null/details`; same
     for `placeId: ''`.
  7. Every test that pinned "the five kinds" becomes "the six kinds" —
     **updated, never deleted**. This includes **all seven places in the
     Interfaces inventory**, and specifically
     `e2e/push-subscribe.e2e.ts:931-937` (append `'review_due'` to the array and
     correct "five"/"all five" in its docstring) — which this plan originally
     omitted from the file list. Post-diff positions the reviewer confirmed:
     drift guard `src/lib/email.test.ts:85`, `notificationUrl` pin
     `src/lib/push.test.ts:345`, `isNotificationKind` `:386` (round 2 inserted
     the `reviewPromptUrl` block at `:349-384`, which moved it from `:360` —
     a number this plan briefly asserted wrongly). The
     `notificationUrl(POST_ID) === '/playdate/<id>'` assertion stays green and
     unmodified.
  8. *(builder)* The introduced-false comment is fixed: `notificationUrl` has
     **one** call site, not five — "used by five call sites" at
     `_shared/pushCopy.ts:53` and `src/lib/push.test.ts:351` is wrong; five
     *kinds* flow through it. Also `src/lib/db.ts:3640` "one of the five" → six.
  9. *(builder)* `0055`'s read-back **asserts** `prosecdef` rather than only
     printing it (it already selects it into `v_prosecdef` and only checks
     `provolatile` at `:298-300`). A value that is printed is a claim; a value
     that is asserted is a proof — the repo's own "assert its own effect" rule
     (`0052`). Expected value: **false**.
  10. *(builder)* `0055_review_prompt.sql` is mode `644`, matching all 50
      siblings; `find supabase/migrations -name '*.sql' ! -perm 644` returns
      nothing.
- **Verification command:** the **builder** runs, from the repo root:
  ```bash
  npm run verify
  ```
  and records its full output to `.scratch/v26/s1-verify.txt` (accepted:
  `npm run verify` is build + vitest + oxlint + `a11y:focus` + steering-lint +
  guards; **none of it opens a browser**, so a builder can run it without
  touching the human's Chrome). The **coordinator** then applies `0055` live
  **twice** via `bash scripts/db-sql.sh --file supabase/migrations/0055_review_prompt.sql`
  — the **browserless** path, which needs no browser at all
  (`docs/agents/browser-lanes.md` §7). **Do not use
  `scripts/cdp-migration-tooling.sh` + `scripts/apply-migration.mjs` for this:**
  the tooling script `pkill -9`s every `google/chrome` process, and the human
  has a live Chrome session on this box, while `apply-migration.mjs` visibly
  navigates a window they are working in. `db-sql.sh` uses the
  `SUPABASE_ACCESS_TOKEN` already present in `.env` against `api.supabase.com`.
  Record to `.scratch/v26/` the two `information_schema` / `pg_proc` read-backs
  and both kind-CHECK probes.
- **Budget:** one local builder context (~98k tokens, `qwen3.8-27b`).
- **Depends on:** nothing.

### Slice 2: the pure scan decision — who gets asked, and what the row says

- **Objective:** the selection rule and the row mapping live in a pure module
  with a sibling test, so the vitest lane can reach them.
- **Files in scope:**
  - `supabase/functions/_shared/reviewScan.ts` (new)
  - `src/lib/reviewScan.ts` (new — the re-export)
  - `src/lib/reviewScan.test.ts` (new — the sibling test `npm run guards`
    requires for every `lib/*.ts`)
- **Approach:** the proven seam in this repo, stated verbatim in
  `send-push/index.ts:36-39`: *"The pure decisions live in
  `../_shared/emailFallback.ts` (which the app's `src/lib/emailFallback.ts`
  re-exports and `src/lib/emailFallback.test.ts` unit-tests), so this file is
  wiring only."* Do exactly that. The module exports a pure
  `isReviewPromptCandidate`-style predicate plus a `reviewPromptRow` mapper
  taking already-fetched values (`{ profileId, playdateId, placeId, title }`)
  and returning the `notification_log` insert shape. **No `Date.now()`, no
  client, no I/O inside the pure functions** — `now` is an argument, the same
  discipline the scan constants encode.
- **Acceptance criteria:**
  1. A drop-in that ended 2 hours ago with `status = 'on'` and a non-null
     `place_id` is a candidate.
  2. `status` of `'cancelled'` or `'ended'` is **not** a candidate, at any
     `ends_at`.
  3. `ends_at` in the future is **not** a candidate.
  4. `ends_at` older than `REVIEW_PROMPT_WINDOW_HOURS` is **not** a candidate.
  5. `place_id` null or empty is **not** a candidate.
  6. The mapper produces `kind: 'review_due'`, the pinned title/body, and
     `url === '/place/<placeId>/details'`.
  7. The candidate predicate is **mutation-checked**: flipping any one of the
     five conditions to always-true makes at least one test fail — the builder
     records which test dies for each flip. (The repo requires a spec that can
     actually fail for the defect it names.)
- **Verification command:**
  ```bash
  npm run verify
  ```
  Evidence file in `.scratch/v26/` recording the five mutation flips and the
  test that died for each.
- **Budget:** one local builder context.
- **Depends on:** Slice 1 (the `review_due` kind and `reviewPromptUrl`).

### Slice 3: wire the scan in, and prove it on the live database

- **Objective:** `send-push` gains `catchUpReviewDue`, runs it on every
  invocation beside the `starting_soon` scan, and a real finished drop-in
  produces exactly one row.
- **Files in scope:**
  - `supabase/functions/send-push/index.ts`
  - `docs/push-setup.md` — only if the deploy note needs the new scan
    documented; **no `pg_cron` change** (the job URL is unchanged, which is the
    whole reason the function keeps its misleading name — `:37-42`)
- **Approach:** `catchUpReviewDue(admin)` mirrors `catchUpStartingSoon`
  (`:206-295`) step for step: one `going_pings` select with the `!inner` embed
  on `playdates` (the `!inner` is what makes the filters restrict the join
  rather than blank the embed — `:212`), the `.in()` exclusion on
  `(kind = 'review_due', playdate_id)` over the **non-empty** id list, the
  `told` set, then the `ignoreDuplicates` upsert. Call it in the handler next to
  the existing scan and report its count in the same JSON summary. Keep the
  whole thing **wiring only** — every decision is already in `reviewScan.ts`.
- **Acceptance criteria:**
  1. One invocation against a seeded finished, place-backed drop-in inserts
     exactly **one** `notification_log` row: `kind = 'review_due'`,
     `sent_at is null`, `url = '/place/<place_id>/details'`, `profile_id` = the
     pinging parent.
  2. **A second invocation inserts zero** — the reported count is `0`, and
     `select count(*)` on that `(profile_id, kind, playdate_id)` is still `1`.
  3. A seeded **cancelled** finished drop-in produces **zero** rows.
  4. A seeded finished drop-in with `place_id is null` produces **zero** rows.
  5. The existing `starting_soon` scan still reports its own count unchanged —
     the new scan does not disturb it (both counts appear in the response).
  6. The row drains: one real push (or one email, for a profile with no
     subscription) is sent and `sent_at` is stamped — or, if no live device is
     available, the drain's dry path is recorded and the gap named explicitly
     rather than claimed as passing.
  7. Every seeded fixture is cleaned up, and the cleanup is verified by a
     post-run `count(*) = 0` — the repo's e2e-fixture convention.
- **Verification command:**
  ```bash
  npm run verify
  ```
  plus the live by-hand invocation (`send-push` is documented as runnable by
  hand — `:5`), with every request/response captured to
  `.scratch/v26/live-*.json` and the seeded rows' before/after state recorded.
- **Budget:** one local builder context.
- **Depends on:** Slice 2.

## Risks / open questions

1. **`REVIEW_PROMPT_WINDOW_HOURS = 24` is the orchestrator's choice, not the
   human's.** Every other decision in this plan traces to a human answer; this
   one does not. The failure it bounds: a parent who ignores the prompt for a
   week still gets nothing new, because the row was inserted on the first tick
   after the drop-in ended and is never withdrawn — the window governs which
   drop-ins are *considered*, not how long a parent has to act. Flagged so the
   human can reduce it to 6h or raise it; it blocks neither slice.
2. **The copy wording is the orchestrator's draft** (pinned in Interfaces).
   It is honest about attendance, which is the constraint that matters; the
   exact phrasing is a founder read.
3. **A parent who already reviewed that place is still prompted once.** The
   `ReviewForm` loads their existing review and the button reads "Update
   review" (`src/components/ReviewForm.tsx:214`), so this is coherent rather
   than broken — but it is a prompt to edit, not to write. Accepted.
4. **No-shows get asked.** `going_pings` records intent only. The copy says so.
   Accepted as the cost of having no check-in.
5. **`0055` touches a live database holding real family data.** Guarded,
   additive, re-paste-safe, applied twice with read-back — the `0052`/`0053`
   standard. This is the only genuinely risky step in the batch.
6. **The push is the only surface.** No in-app fallback for a parent who has
   muted notifications or declined the browser permission — the `starting_soon`
   scan has the same property, so this is consistent, but it means a muted
   parent never learns the prompt exists.
7. **RETIRED — "the `ADD CONSTRAINT` could abort on a pre-existing row outside
   the CHECK."** Raised by the reviewer as uncheckable without SQL; retired by a
   coordinator read-only probe of the live table: the only kinds ever stored are
   `cancelled` (290), `ping_received` (273), `new_comment` (16) and
   `starting_soon` (1) — a strict subset of the five-value CHECK. Nothing
   outside it can fail validation. (Read via `bash scripts/db-sql.sh --read`,
   the browserless path.)
8. **RETIRED — "dropping then re-adding the CHECK leaves a window with no
   constraint if `db-sql.sh` autocommits per statement."** The live constraint
   definition read during the same probe **is** `0041`'s widen —
   `CHECK (kind = ANY (ARRAY['ping_received','starting_soon','cancelled',
   'new_comment','ended']))` — so this exact drop-then-add pattern has already
   been applied through this exact path and is visible in production. No
   `004x`/`005x` migration uses an explicit `begin;`/`commit;`: `db-sql.sh` POSTs
   the entire file as **one** query string, which the Supabase SQL API evaluates
   as a single request.
9. **THIS PLAN'S OWN INVENTORY WAS WRONG, AND REVIEW FOUND IT.** The Interfaces
   section listed "six" hand-maintained kind lists while the slice's own disease
   sat uncured in a seventh (`e2e/push-subscribe.e2e.ts`), and Slice 1's file
   list omitted it while criterion 7 demanded it — the builder could not satisfy
   the criterion without leaving scope. Resolved by **widening both**, not by
   narrowing the criterion (see the Status log for the ruling and its reasoning).
   Recorded rather than tidied away: a plan that miscounts its own inventory is
   the failure mode this batch exists to cure.

## Status log (orchestrator appends after every phase transition)

- 2026-09-26 — **Plan written, batch opened as V26, no slice dispatched yet.**
  Derived from a founder idea ("after somebody attends a drop-in they should be
  given the opportunity to give feedback on that place… five stars one through
  five and also write a comment"), which the orchestrator grounded in the
  existing system before planning: the stars-and-comment half **already ships**
  (`reviews`, migration `0052`; `ReviewForm`; the aggregate line on place
  pages, browse cards and map pins), so the whole batch is the *prompt*.
  Two decisions taken by the human, both recorded in the Non-goals:
  (a) the prompt writes **the same `reviews` row** the place page writes — no
  new table; (b) **`place_id is null` prompts nothing**. Supersedes the V22
  plan (preserved at `plan-v22-backup.md`, `diff -q` clean). Next action:
  dispatch Slice 1 to one local builder.

- 2026-09-26 — **Slice 1 built, independently verified green, reviewed
  NEEDS_CHANGES. Fix round 1 dispatched. `0055` NOT yet applied.** Verifier
  reproduced the gate exactly (`npm run verify` EXIT=0 · 55 files / 1754 tests ·
  78 warnings / 0 errors · GUARDS PASS · Deno lane EXIT=0 · no test deleted) and
  **corrected this file's lint baseline**: the real base at `63ef790` is **78**
  warnings, not the 68 repeated here since V21 — so this diff's lint delta is
  **0**. Reviewer verdict NEEDS_CHANGES on one blocking finding (the e2e
  five-kind array and its now-false docstring) plus four comment-level findings
  and **three defects in this plan**, all accepted. Coordinator rulings:
  **(A) widen, don't narrow** — criterion 7 is widened and
  `e2e/push-subscribe.e2e.ts` + `src/lib/db.ts` join Slice 1's file list,
  because narrowing would enshrine a rendered-but-unasserted sixth toggle and a
  declared-false docstring, which is precisely the drift this batch exists to
  cure; **(B)** the diff introduced a falsehood — `notificationUrl` has **one**
  call site, not five ("used by five call sites") — and a false comment is a
  defect, not a nit; **(C)** `docs/push-setup.md:212` parked to Slice 3, which
  already owns that file; **(D)** `0055`'s read-back must **assert** `prosecdef`
  (expected `false`), not merely print it; **(E)** `0055` moves to mode `644`,
  matching all 50 siblings. Two reviewer risks **retired with live data**, not
  argument: the `ADD CONSTRAINT` cannot abort (only 4 kinds ever stored, all
  inside the CHECK) and the drop-then-add window is a non-issue (the live
  constraint *is* `0041`'s widen, applied through this same browserless path).
  The brief's "keep `security definer`" was **my error** and the builder was
  right to refuse it. Next action: fix round 1 returns, then re-review, then the
  coordinator's live apply.
