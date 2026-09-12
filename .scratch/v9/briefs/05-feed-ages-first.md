# Builder brief — V9 ticket 05 (Nearby: ages first, names optional)

Repo: `/home/jmeisburg/Projects/playdate-app` ("Drop In" — Vite + React + TS +
Tailwind PWA on live Supabase, project ref `ayzvjwxbxyrcgyoeaxuk`).
You are the ONLY writer: never run a git command that writes (no
commit/checkout/stash/branch/reset). NEVER apply the migration — the
coordinator applies 0037 after you report.

This ticket lands AFTER V9 tickets 01, 03 and 04, and it BUILDS ON THEIR
RESULTS — read the working tree as it is, not as the older tickets describe it.
In particular ticket 01 removed the neighbourhood select from `/new`, and
ticket 03 restructured `/new` as a summary with a "More options" disclosure:
the "Ages (optional)" chip row this ticket adds goes inside that disclosure.

## Read first, in this order
1. `.scratch/v9/issues/05-feed-ages-first.md` — THE SPEC (ACs + its migration
   check). Note its pivot: the DERIVED half is green immediately, the explicit
   age-chip half is RED until 0037 is applied, and the spec must say so.
2. `.scratch/v8/spec.md` — the house discipline (DO-block idempotency,
   red-by-design, no test weakened, findings reported).
3. The code: `src/components/DropInCard.tsx` (the meta line ≈203-212, the
   going line ≈150-158 and ≈223-250), `src/pages/FeedPage.tsx` (the batched
   reads effect ≈346-396, `buildCardKidsCount` ≈660, the render ≈705-752),
   `src/lib/db.ts` (`countKidsGoingForPosts` and `get_kids_going` ≈1257,
   `listPlaydateKidNamesWithClient` ≈2518), `src/lib/feed.ts`
   (`kidsComingLine` ≈888, `ageRangeLine` does not exist yet),
   `src/pages/PlaydateDetailPage.tsx` (the "Kids coming" line ≈2166-2185),
   `src/pages/ProfilePage.tsx` (the kids editor + `validateKid*` in `src/lib/db.ts`).
4. `supabase/migrations/0026_ping_kids.sql` (the `get_kids_going` privacy gate
   and `count_kids_going`), `0027_count_kids_going_for.sql` (the BATCHED
   pattern you are extending), `0022_kids_v3.sql`, `0011_profiles_v2.sql:56`.

## What to build
Exactly ticket 05. A drop-in's AGE RANGE becomes the first line of the card's
meta (`ages 3–6`), derived from the ages of the kids the host said they are
bringing (`playdate_kids` → `kids.age`) so the host does nothing new; one kid →
`age 4`; a wide spread → `ages 2–9`. Nothing is shown when the host picked no
kids and stated nothing (never a guess). The same range shows on the detail
page beside the existing "Kids coming" line, which is demoted from names-first
to AGES-first ("Ages 3–6 · Bernie, Lily" — names last, and only for the host
and people who pinged, exactly as today). `/new` gains an "Ages (optional)"
chip row (`0–2`, `2–5`, `5–8`, `8–12`, `All ages`) inside ticket 03's "More
options" disclosure, stored in the `playdates.age_min` / `age_max` columns that
0037 adds, with the explicit chips WINNING over the derived range. The `/profile`
kids editor makes clear that a first name is optional, with copy saying the name
is only shown to families who are going. Names never reach the feed. Plus the
pure seam `ageRangeLine(ages)`, its unit tests, one BATCHED read for the whole
feed, `supabase/migrations/0037_playdates_age_range.sql`, and
`e2e/feed-ages.e2e.ts`.

## Traps I verified myself — handle these, do not rediscover them
- **T1 — the privacy line.** `get_kids_going` (`0026`) gates names AND ages to
  the host / pingers / moderators, and it reads `ping_kids` (the PINGER's kids).
  This ticket's derivation reads `playdate_kids` (the HOST's announced kids) and
  must expose an AGE RANGE ONLY, to every authenticated viewer, with no name
  and no kid id crossing. Write a new SECURITY DEFINER, batched function for
  this (mirroring `0027`'s shape: `drop function if exists` + `create function`
  + grant to `authenticated` only, revoke from `public` and `anon`). Do not
  widen `0026`'s gate and do not reuse `count_kids_going_for` for it — one
  function, one question. Prove the anon call fails closed.
- **T2 — one batched read per feed.** `FeedPage` already calls
  `countKidsGoingForPosts(postIds)` ONCE for every visible post (`≈354`). Extend
  that pattern: a card must never issue its own query. The new read must be
  best-effort like every other card decoration — a failure or the pre-0037 state
  leaves every card without an ages line, never an error state, never a crash.
- **T3 — `kidsComingLine` drops nameless kids.** `src/lib/feed.ts:892` filters
  `kid.name.trim() !== ''`, so once a name is optional a nameless kid is
  INVISIBLE on the detail page. Fix it so an age-only kid still renders
  (ages-first), and unit-test that case. `listPlaydateKidNamesWithClient`
  (`db.ts:2527-2538`) types `first_name` as `string` and maps it straight
  through — a NULL name must normalize rather than leak `null` into a `string`.
- **T4 — the kids editor's name rule.** `validateKidName`
  (`db.ts:2119`) currently fails an empty name ("Give your kid a first name.")
  and `kids.first_name` is `not null` (`0011_profiles_v2.sql:56`). The AC "the
  field is not required to save a kid" therefore needs BOTH the rule relaxed and
  the column made nullable. Confirm the constraint from the live DB first (a
  read-only probe: `node scripts/apply-migration.mjs --sql "select column_name,
  is_nullable from information_schema.columns where table_name='kids'"`; the
  dashboard token needs the CDP Chrome on :9222 — `bash
  scripts/cdp-migration-tooling.sh` if it is down). If confirmed, include
  `alter table public.kids alter column first_name drop not null` in 0037,
  document it in the header as a deliberate extension of the ticket's
  "two columns + a CHECK" line, and report it as a deviation with its evidence.
  Then handle EVERY consumer of a kid's name: the `/profile` kid rows, the
  `/new` kid chips (`PlaydateFormFields.tsx` renders `{kid.first_name} · {kid.age}`
  — a nameless kid must read sensibly, e.g. an age-only label, never `" · 4"`),
  `kidsComingLine`, `listPlaydateKidNames`, and `0026`'s
  `order by k.age asc nulls last, k.first_name asc`.
- **T5 — precedence, pinned.** The explicit chips win over the derived range
  when both exist (the parent said so out loud). Put that precedence in a PURE
  seam with its own unit test — not inline in a component — and pin the
  "explicit wins" case.
- **T6 — the card's meta line.** The card's meta is currently
  `place` (its own `<p>` at `DropInCard.tsx:203`) then
  `neighborhood · timeWindow · weekly · distance` (`:204-212`). The AC says the
  age range is the FIRST line of the card's META. Add it through a prop
  (`ageRangeLabel?: string | null`) computed by the page — `DropInCard` owns no
  fetching — and keep it absent (no empty line, no stray separator) when there
  is nothing to say. Remember ticket 01 made `neighborhood` nullable: build on
  the tree as it is, and keep that tolerance.
- **T7 — `age_hint` is NOT reused.** `playdates.age_hint` (the old V3 free-text
  column) is dormant; the ticket pins that 0037 leaves it ALONE rather than
  repurposing it. Do not write it, do not read it, do not drop it.
- **T8 — 0037's own shape.** `add column if not exists` for `age_min` /
  `age_max` (smallint, nullable) plus a DO-block guarded CHECK
  (`age_min is null or age_max is null or age_min <= age_max`) — a bare
  `add constraint` is not re-runnable. The new batched function is
  `drop function if exists` + `create function`. The header documents: ages may
  be DERIVED (`playdate_kids`) or STATED (these columns) and the explicit value
  wins; kid names never cross to the feed; no RLS policy changed; `age_hint` is
  left alone; and (if T4 holds) the `kids.first_name` change. Use the corrected
  composite-type guard join `t.typrelid = a.attrelid` if you guard on one at all.

## Required checks you run yourself
- `npm run build` — exit 0.
- `npm run test` — the unit suite; report passed/total and the new/changed files.
- `npx playwright test e2e/feed-ages.e2e.ts` — the derived half must be GREEN
  pre-0037; the chips half must be RED pre-0037 at the documented point, with
  the EXACT quoted error (the insert 42703s on the missing column) and the
  assertion line — a clean documented failure, never a crash or a timeout.
  Prove the pivot in the spec's own comments.
- The FULL suite: `npm run test:e2e` (≈5-8 min, LIVE Supabase). Two known
  live-API flakes — `e2e/guest-list.e2e.ts` and `e2e/post-edit-delete.e2e.ts`
  — re-run each in isolation before reporting a failure as real.
- `npm run lint` (report warnings only on lines you changed).
- **Never weaken, delete or skip an existing assertion.** If an existing spec
  must change, quote the exact lines and justify them.

## Marker hygiene
E2E mints `e2e-<epoch>` markers in the LIVE project. Make the new spec
cascade-safe and have it clean up its own rows best-effort with the marker's own
JWT. Do NOT run the sweep tool — the coordinator owns it.

## Report back, terse and structured
1. Files changed, with line counts.
2. AC-by-AC: met / not met / deviated, each with its evidence (command + output).
3. The pivot: the quoted pre-0037 failure for the chips half, and proof the
   derived half is green.
4. Gate numbers: build exit, unit passed/total, e2e passed/total, lint.
5. Deviations and findings — the T1-T8 outcomes, anything you did not do, and
   anything the ticket did not anticipate. Report findings; do not paper over a
   failure.
6. The exact command the coordinator should run to reproduce your gate.
