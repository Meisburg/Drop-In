# V8 spec — retention, repetition, and places

Date: 2026-09-12 · Origin: product evaluation requested by the human
(`.scratch/product-review/evaluation.md`), approved in full ("agree with all of
this", 2026-09-12). · State at planning time: V7.1 closed (`ea40ef7`), live at
https://drop-in-mu.vercel.app, all migrations through **0027** applied and
verified live, no open tickets.

## The two loops this version closes

V1–V7 built a careful one-shot directory: post a time + place, see what's
nearby, say "I'm going", show up — with real RLS, real trust tools, modelled
kids, and a working signed-out share surface. What it never built is a reason
to come back:

- **No notification of any kind.** No push, no email, no in-app inbox. Verified
  by grep: `remind|notification|webpush|push` (outside `Array.push`) has zero
  hits in `src/`, `supabase/`, `scripts/`, `package.json`; `dist/sw.js`
  precaches the shell only.
- **No repetition.** `playdates` carries one `starts_at`/`ends_at`
  (`0005:17-18`); no recur/weekly/series concept exists anywhere. The weekly
  park meetup — how parents actually meet — must be re-typed by hand.
- **No memory of people.** The only user-to-user tables are `blocks` (`0006:12`)
  and `going_pings` (`0007:9`). No follow, contact, friend, or group concept.

And the supply side fails cold: 5-mile default radius (`feed.ts:53`), no seeded
or city-wide fallback, so a new parent's first screen is *"Nothing happening
near you today — post the first one"* (`FeedPage.tsx:433-443`).

## Tickets (queue order — one writer, so each blocks the next)

| # | Ticket | Effort | Migration | Loop it closes |
|---|---|---|---|---|
| 01 | Quick post: today-default, recent places, "we're here until 5" | ~1 day | none | activation (supply) |
| 02 | First visit that isn't a dead end + honest/stale states | ~1 day | none | activation |
| 03 | "While you were away" inbox (pings on your posts, cancellations) | ~1 day | none | habit (host) |
| 04 | Real post lists on `/u/:handle` and `/profile` | ~0.5 day | none | habit (social proof) |
| 05 | Post edit + delete (fix a plan instead of cancelling it) | ~1 day | none | trust / habit |
| 06 | Standing playdates (weekly series) | ~3 days | **0028** | habit (the big one) |
| 07 | Places directory + place pages + Browse becomes places | ~3 days + seed | **0029**, **0030** | goal ("fun places") |
| 08 | Web push + install affordance | ~4 days | **0031**, **0032** | habit (return) |
| 09 | Loop-closing ("same time next week") + follow family/place | ~2 days | **0033** | habit (next meetup) |
| 10 | Polish batch (saves, undo, degraded states) | ~1.5 days | none | friction |
| 11 | Email verification (trust gate) | ~1 day + human toggle | **0034** | trust |
| 12 | Density: the first-cohort playbook | human-owned ops | none | everything |

Ticket files: `.scratch/v8/issues/NN-<slug>.md`. Triage state is the `Status:`
line in each file (`docs/agents/triage-labels.md`).

## Migration ledger (reservations, in queue order)

| Number | Ticket | What |
|---|---|---|
| 0028 | 06 | `playdate_series` + `playdates.series_id` + occurrence generator |
| 0029 | 07 | `places` + Seattle seed |
| 0030 | 07 | `playdates.place_id` + `get_public_playdate` 12 → 13 fields |
| 0031 | 08 | `push_subscriptions` |
| 0032 | 08 | `notification_log` (send dedupe + outbox) |
| 0033 | 09 | `follows` |
| 0034 | 11 | `profiles.email_confirmed_at` (+ auth.users trigger mirror) |

**Reservation rule (house lesson from the 0014/0019 churn):** these numbers are
reservations in QUEUE order. If the queue reorders, the next free number wins —
whatever is actually applied is what `task-state.md` records. Every migration
follows the standing rules: **DO-block idempotency** (Postgres has no
`CREATE POLICY IF NOT EXISTS`), no RLS SELECT-policy change that the UPDATE's
new row must satisfy without checking the interaction (the 0014 lesson), a
policy that must reference its own table goes through a stable SECURITY DEFINER
helper (the 0023 42P17 lesson), writes whose SELECT policy excludes the actor
never use `RETURNING` (the 42501 lesson), and a guard trigger passes through
when `auth.uid() is null` (the 0011 lesson).

## Migration check — the shared procedure every ticket names

1. **The dev agent never applies a migration.** It writes
   `supabase/migrations/NNNN_*.sql` (header documents the decision + the pins)
   and the e2e spec that is **red-by-design pre-apply** — it must fail at the
   documented point, never crash.
2. **The coordinator applies it** via the dashboard SQL API path — CDP Chrome
   from `bash scripts/cdp-migration-tooling.sh`, session token from the profile
   copy's Local Storage key `supabase.dashboard.auth.token` (1 h TTL), then
   `POST https://api.supabase.com/v1/projects/<ref>/database/query`. The Monaco
   SQL editor in that Chrome is known-broken; do not use it.
3. **Verify after apply, always three probes:** an `information_schema` /
   `pg_proc` SELECT proving the objects exist; a PostgREST SELECT proving no
   `PGRST205` schema-cache stall; and the e2e spec going green. DML result lines
   report "0 rows" for everything — verify effects with before/after counts.
4. **Live check with a marker account**, then sweep the `e2e-*` markers
   (`node scripts/sweep-e2e-markers.mjs`).

## Baseline gate (every ticket)

`npm run build && npm run test && npm run test:e2e` exit 0, with the existing
suite green — measured baseline at planning time: **340/340 unit tests, 12
files** (`npm run test`), plus 17 Playwright specs.
E2E runs against the live Supabase project and creates `e2e-<epoch>` marker
accounts, so each ticket's spec must be cascade-safe and swept.

## Explicitly out of scope for V8

A social feed, friend feed, likes, DMs, reviews/ratings/vouching, GPS/live
location, and any new card badge type. The group chat already does the social
timeline better; Drop In's job is to hold the plan.

## First measurable goal

After 06 ships: **a host runs a weekly series and sees a non-zero "going" count
in three consecutive weeks without re-posting it by hand.**
