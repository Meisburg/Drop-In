# 10: Privacy — kid names are readable by every signed-in parent

**Filed:** 2026-09-13 by the coordinator, out of V9 ticket 05's review cycle 1.
**Origin:** ticket 05's AC claimed kid names are shown "only for the host and
people who pinged, **as today**". The builder refused to ship that sentence
because it is false, and the fresh-context reviewer proved it independently.
This ticket is the follow-up both recorded as required, and it is deliberately
**not** part of ticket 05 (that ticket's migration check pins "no policy
changed").

**Status:** `ready-for-human` — the SCOPE decision below is the human's.
Everything else is specified, so one line of confirmation makes this
`ready-for-agent`.

## The finding, with evidence (all verified against the live project)

Kid first names are reachable by **any signed-in parent**, not just the host and
the people who pinged. Three independent facts:

1. **The tables are wide open to `authenticated`.**
   - `supabase/migrations/0011_profiles_v2.sql:86-89` —
     `create policy "kids_select_authenticated" on public.kids for select to
     authenticated using (true)`.
   - `supabase/migrations/0022_kids_v3.sql:84-87` —
     `create policy "playdate_kids_select_authenticated" on
     public.playdate_kids for select to authenticated using (true)`.
   - Live probe: exactly those `qual`s are what the project runs. Nothing later
     drops or narrows either policy. So a signed-in client can read **every
     family's** `kids` rows (first name, age, and the kid-photo `avatar_url`),
     and read which kids are attached to any drop-in.
2. **The app itself surfaces the host's kids' names ungated.**
   `src/pages/PlaydateDetailPage.tsx:698` calls
   `listPlaydateKidNames(id).catch(() => null)` in the mount load, with **no
   host/pinger check** — the comment there says only "Authenticated view only" —
   and `src/lib/db.ts:2696-2697` reads `playdate_kids` joined to `kids`
   (`first_name, age`). The line renders for any signed-in parent.
3. **The gate the AC assumed belongs to a different set.** 0026's
   `get_kids_going` (host / going / moderator) covers the **pingers'** kids
   (`ping_kids`), and `ping_kids_select_own_host_mod` is genuinely gated. The
   HOST's announced kids were never behind it.

**Also true, and why this is not merely cosmetic:** `/u/:handle` renders a
family's kid rows (name + age) to any signed-in visitor, which V2 chose
deliberately — it is the "public-profile-surface class" 0022's own header names.
So this ticket is not fixing an accidental leak in one component; it is deciding
what the app promises about children's names, and making the code and the copy
agree.

## THE SCOPE DECISION (recommended default, one line to confirm)

**Recommended v1:** a kid's first name is visible to
(a) the kid's own family, (b) the HOST of a drop-in that kid is attached to, and
(c) a family who pinged that drop-in (i.e. exactly 0026's existing gate) — plus
moderators. Ages stay broadly visible (that is V9 ticket 05's whole point, and
ages are the signal parents actually want).

**What that costs, stated honestly:** it removes kid names from `/u/:handle`'s
profile section for signed-in strangers and from the detail page's "Kids coming"
line for non-participants, so the name disappears from surfaces V2 shipped
deliberately. If the human prefers to keep `/u/:handle` as-is, say so — then the
surface list narrows to the detail page and the raw table reads.

## Acceptance criteria

- [ ] The SCOPE above is confirmed (or amended) and the ticket records the answer
- [ ] **The detail page's "Kids coming" line stops crossing to strangers.** Its
      names + ages come from a **SECURITY DEFINER** function with 0026's gate
      (host / going / moderator), not from a table read — the 0026 pattern, so
      the rule lives in one place. A stranger sees the ages line (ticket 05's
      derived range) and no names
- [ ] **The bare table reads are closed.** `kids` and `playdate_kids` no longer
      grant `using (true)` to `authenticated`; a signed-in stranger's direct
      `select` of another family's kid returns **no rows** (a live probe, not an
      assertion), while the owner still reads and writes their own kids and the
      `/new` / `/edit` pickers still work
- [ ] **The feed's ages line SURVIVES the tightening — this is the coupling V9
      ticket 05 recorded.** `src/lib/db.ts:1424` currently derives the feed's
      age ranges from a batched `playdate_kids` read (`.select('playdate_id,
      kid:kids!playdate_kids_kid_id_fkey ( age )')`), so closing that policy
      would **silently blank every card's ages line** (the read is
      best-effort-by-contract and settles to `{}`). Give the derivation its own
      **SECURITY DEFINER** batched function returning `(playdate_id, age_min,
      age_max)` — ages only, no name, no kid id — which is the shape ticket 05's
      brief originally asked for; OR prove with a probe that the chosen
      narrowing leaves the derivation working. Either way the e2e must show a
      card's `ages 3–6` still rendering after the change
- [ ] **No kid photo URL crosses** to any viewer who may not see the name: the
      `avatar_url` column rides the same table as `first_name`, so the policy
      narrowing must cover it (and this is the pre-work for V9 ticket 08,
      "no kid photos")
- [ ] **The copy is re-checked against the new reality.** Ticket 05 shipped
      truthful copy for the OLD reality ("A name appears only on your profile
      and on a drop-in's page, and only to signed-in families"); after this
      ticket the promise is stronger, so the copy must be updated to say what is
      now true — and V9 ticket 05's AMENDED note is what to diff against
- [ ] New e2e `kid-names-privacy.e2e.ts`: host posts with two kids named; a
      **stranger** account (a fresh `e2e-v-*` viewer, the ticket-04 pattern)
      opens the detail page and sees the ages line with **no kid name**, and a
      direct REST read of that family's `kids` rows returns nothing; the HOST
      and a PINGER still see the names; a live card still shows `ages 3–6`
- [ ] No kid name appears in any push payload, ICS export or signed-out surface
      (asserted, not assumed)
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0040_kid_names_gate.sql`**
(0040 because 0036/0038/0039 stay reserved for tickets 02/08/09; next free
wins). The standing rule applies with extra force here: **no SELECT-policy
change that an UPDATE's new row must satisfy without checking the interaction
(the 0014 lesson)**, and a self-referencing policy goes through a stable
SECURITY DEFINER helper (the 0023 42P17 lesson). DO-block guarded policy DDL —
Postgres has no `CREATE POLICY IF NOT EXISTS` — plus `drop policy if exists` for
the two widened policies. Header must document: the promise before and after,
the surface list, the gate, and the derivation function's ages-only payload.

- *Post-apply probes:* (1) a stranger's direct read of another family's `kids`
  and `playdate_kids` is empty; (2) the owner's own read still works; (3) the
  derivation returns ranges (never empty) for a post with kids; (4) the detail
  page's function still returns names for the host and a pinger and nothing for
  a stranger; (5) anon fails closed everywhere.
- *Human-owned:* the SCOPE confirmation above.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/kid-names-privacy.e2e.ts`; full suite; then a two-account live pass — host
posts with kids, a stranger signs in on another device and must not be able to
name a single child.

## Comments

**2026-09-13 — why this exists, and what it is not.** V9 ticket 05's
fresh-context reviewer found that the AC's privacy sentence ("only for the host
and people who pinged, as today") was false; the builder verified it against the
live project, refused to write copy that promised it, shipped truthful copy
instead, and recorded the amendment in
`.scratch/v9/issues/05-feed-ages-first.md`. Both the builder and the reviewer
recorded that the gate itself must NOT be tightened inside ticket 05 — its
migration check pins "no policy changed" — and that doing so needs its own
ticket with its own ACs, migration and review. **This is that ticket**, filed by
the coordinator on the human's explicit instruction.

Two things this ticket must not lose, both from ticket 05's record:

1. **The coupling.** The feed's ages line reads `playdate_kids` under the very
   policy this ticket narrows, and the read is best-effort by contract (`{}` on
   failure), so a narrowed policy would blank it **silently** — no error, no
   console warning, just every card missing its ages. That is why the derivation
   needs its own SECURITY DEFINER function rather than inheriting the new gate.
2. **The method lesson.** Ticket 05's migration header originally claimed the
   `string | null` type change "made the compiler enumerate" every consumer of a
   kid's name. It did not: under `--strict`, `` `${x}` `` with
   `x: string | null` compiles clean, so a template literal is invisible to the
   type change — which is how the `/profile` Remove dialog shipped reading
   "Remove null?". When narrowing these columns, **grep for every template
   interpolation of a kid's name by hand**; do not trust the compiler to have
   found them.

**2026-09-13 — the finding was surfaced, not buried.** The human was told the
same day in the session report and asked to decide; this ticket is the record of
that decision point, and the scope line above is the only thing blocking it.
