# Builder brief — V9 ticket 10 (privacy: kid names are readable by every signed-in parent)

Repo: `/home/jmeisburg/Projects/playdate-app` ("Drop In" — Vite + React + TS +
Tailwind PWA on live Supabase, project ref `ayzvjwxbxyrcgyoeaxuk`).
You are the ONLY writer: never run a git command that writes. **Write
`supabase/migrations/0040_kid_names_gate.sql`; do NOT apply it** — the
coordinator applies and probes it after you report, exactly as with 0035/0037.

## Read first
1. `.scratch/v9/issues/10-kid-names-privacy-gate.md` — THE SPEC. Its ACs and its
   MIGRATION CHECK are the contract. **The scope is CONFIRMED (the human said
   "yes" on 2026-09-13)**: a kid's first name is visible to the kid's own
   family, the HOST of a drop-in that kid is attached to, a family who PINGED
   that drop-in (0026's gate), and moderators. Ages stay broadly visible.
2. `.scratch/v8/spec.md` — house discipline (DO-block idempotency, the
   0014 / 0023 / 42501 / 0011 lessons, red-by-design specs that fail at a
   documented point with a quoted error, never a crash).
3. The code: `src/pages/PlaydateDetailPage.tsx` (the mount load ≈676-706, the
   "Kids coming" line ≈1438-1453, the render ≈2206), `src/lib/db.ts`
   (`listPlaydateKidNamesWithClient` ≈2692, `listPlaydateKidIdsWithClient`
   ≈2740, `listKids`, `addKid`, `updateKid`, `linkKidsToPlaydate`, the batched
   ages read ≈1418-1440), `src/pages/ProfilePage.tsx` (the kids editor),
   `src/pages/UserPage.tsx` (the kid section), `src/pages/NewPlaydatePage.tsx` /
   `src/pages/EditPlaydatePage.tsx` (the kid pickers),
   `src/components/KidsComingPicker.tsx`, `src/components/PlaydateFormFields.tsx`.
4. The migrations: `0011_profiles_v2.sql:86-89`, `0022_kids_v3.sql:84-87`,
   `0026_ping_kids.sql` (the gate you are copying), `0027_count_kids_going_for.sql`
   (the batched SECDEF pattern).
5. `e2e/kids-v3.e2e.ts`, `e2e/feed-ages.e2e.ts`, `e2e/polish.e2e.ts` and
   `e2e/fixtures.ts` (`openMoreOptions`, `editTitle`, `readMarkerSession`,
   `readSupabaseEnv`).

## Traps I verified myself — handle these, do not rediscover them
- **T1 — THE COUPLING, and the reason this ticket is subtle.**
  `src/lib/db.ts:1422-1424` derives the feed's age ranges from a batched
  `playdate_kids` read:
  `.from('playdate_kids').select('playdate_id, kid:kids!playdate_kids_kid_id_fkey ( age )')`.
  It runs under the very policy you are narrowing, AND it is best-effort by
  contract — `FeedPage`/`PlacePage`/`UserPage` settle to `{}` on failure — so a
  naive policy change would **silently blank every card's ages line**: no error,
  no warning, just nothing. The ticket therefore requires an
  **ages-only SECURITY DEFINER batched function** (the shape ticket 05's brief
  originally asked for): `(playdate_id, age_min, age_max)` for a `uuid[]`, ages
  only — **no name, no kid id**. The client switches to it. The STATED chips
  keep riding the `playdates` row (no function needed for those).
- **T2 — do NOT inline a cross-table subquery from one narrowed policy into
  another.** A policy expression is evaluated as the current user, so a subquery
  over another RLS-protected table is itself filtered by THAT table's policies.
  The house precedent (`ping_kids_select_own_host_mod`, which inlines an
  `EXISTS` over `playdates`) works only because `playdates`' authenticated SELECT
  is `using (true)`. You are narrowing BOTH `kids` and `playdate_kids`, so a gate
  in one that reads the other must go through a **stable SECURITY DEFINER
  helper** (the 0023 42P17 lesson) — never a bare subquery.
- **T3 — the 0014/42501 lesson, twice over.** A narrowed SELECT policy can break
  a WRITE path that reads its own row back. Check every kid write for
  `.select()`/`returning`: `addKid`, `updateKid`/`updateKidWithClient`,
  `linkKidsToPlaydate` (delete + insert). If any returns the row, the actor's new
  row must satisfy the SELECT policy — so the OWNER clause (`profile_id =
  auth.uid()`) and the HOST clause must be IN the policy, not bolted on after.
  A write that silently 2xx-es with 0 rows is the failure mode to hunt.
- **T4 — the write policies must survive.** `kids_insert_own` /
  `kids_update_own` / `kids_delete_own` (owner) and `playdate_kids_insert_host` /
  `playdate_kids_delete_host` (host) are not yours to tighten. The `/new` and
  `/edit` pickers must keep working: `/new` reads the host's OWN kids (`listKids`,
  owner path), `/edit` reads the post's kid ids for its prefill
  (`listPlaydateKidIdsWithClient`, host path). Prove both.
- **T5 — `/u/:handle`: the accepted cost.** `UserPage.tsx` renders a family's kid
  rows to any signed-in visitor. Under the confirmed scope a stranger may NOT see
  those names, so that section must stop showing them. V2 shipped it
  deliberately — say so in your report, and replace it with the honest existing
  AGES signal where one exists. **Do not invent a partial substitute** (no
  initials, no count-only "2 kids" in its place, no blur).
- **T6 — the SECDEF functions already there are unaffected, and must stay
  working.** `get_kids_going` (0026) and `count_kids_going_for` (0027) run as
  definer, so narrowing the base tables does not touch them. Probe both shapes
  after the change anyway — a regression there is a real finding.
- **T7 — kid photos ride the same row.** `kids.avatar_url` is on the same table
  as `first_name`, so your narrowing covers it — assert that no kid photo URL
  crosses to a viewer who may not see the name (this is also the pre-work for V9
  ticket 08).
- **T8 — update the COPY to the new, stronger promise.** V9 ticket 05 shipped
  TRUTHFUL copy for the OLD reality ("A name appears only on your profile and on
  a drop-in's page, and only to signed-in families"). After your change the
  promise is stronger, so the copy must say what is now true. Diff against ticket
  05's AMENDED note in `.scratch/v9/issues/05-feed-ages-first.md`.
- **T9 — the e2e must use a STRANGER, not the marker.** A fresh `e2e-v-*` viewer
  account (the `while-away` / ticket-04 pattern) is the only honest way to assert
  absence. Assert: the stranger sees the ages line and **no kid name**; a direct
  REST read of another family's `kids` and `playdate_kids` returns **nothing**;
  the HOST and a PINGER still see the names; and a live card still reads
  `ages 3–6`.
- **T10 — policy DDL idempotency.** Postgres has no `CREATE POLICY IF NOT
  EXISTS`: `drop policy if exists` + a DO-block-guarded `create policy`, the
  0022/0033 pattern. Re-pasting the file must be a no-op.
- **T11 — the number is 0040**, not 0036/0038/0039: those three stay reserved for
  tickets 02/08/09.
- **T12 — the method lesson from ticket 05, and it is load-bearing here.** A kid
  name inside a template literal is INVISIBLE to the type system: under
  `--strict`, `` `${x}` `` with `x: string | null` compiles clean. That is how
  the `/profile` Remove dialog shipped reading "Remove null?". **Grep by hand for
  every template interpolation of a kid's name** across `src/` (`first_name`,
  `firstName`, `name`) before you claim you have covered the consumers.

## Required checks you run yourself
- `npm run build` — exit 0.
- `npm run test` — the unit suite. The baseline on the committed tree is **build
  0 · 752/752 unit (21 files) · e2e 65/65 · lint 0 errors (39 warnings)**.
  Anything worse is your regression.
- Your new spec pre-0040: the **red-by-design** assertion is the stranger's
  access (before the migration a stranger CAN read the names), which must fail at
  the documented point with the **exact quoted** evidence — never a crash, never
  a bare timeout. The owner/host/pinger halves and the ages line must be GREEN
  before and after. **Say in the spec which assertion is the pivot.**
- The FULL suite: `npm run test:e2e` — **redirect it to a file, NEVER pipe it**
  (a pipeline's exit code is `tail`'s, which once reported 0 during a genuinely
  failing 32-spec run). Two known live-API flakes: `guest-list`,
  `post-edit-delete` — re-run in isolation before reporting a failure as real.
  Expect the new spec's stranger assertion to be the ONE red until the
  coordinator applies 0040.
- `npm run lint` (report warnings only on lines you changed).
- **Never weaken, delete or skip an existing assertion.** If an existing spec
  must change (the `/u/:handle` kid section is the likely one), quote the exact
  lines and justify them.

## Marker hygiene
E2E mints `e2e-<epoch>` markers in the LIVE project. Every spec you add must be
cascade-safe and must delete its own rows best-effort with the marker's own JWT.
Do NOT run `scripts/sweep-e2e-markers.mjs` — the coordinator owns the sweep.

## Report back, terse and structured
1. Files changed, with line counts, plus the diff guard
   (`git status --short supabase/migrations` shows ONLY your new 0040).
2. AC-by-AC: met / not met / deviated, each with its evidence (command + output).
3. The pivot: the exact quoted pre-0040 failure and the assertion line.
4. Gate numbers: build exit, unit passed/total, e2e passed/total (and which one
   is the documented red), lint.
5. Deviations and findings — the T1-T12 outcomes, every consumer of a kid's name
   you walked (with the hand-grep result), what you removed from `/u/:handle` and
   why, and anything the ticket did not anticipate. **Report findings; do not
   paper over them.**
6. The exact command the coordinator should run to reproduce your gate.
