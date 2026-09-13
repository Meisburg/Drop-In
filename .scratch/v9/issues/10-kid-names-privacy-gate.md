# 10: Privacy — kid names are readable by every signed-in parent

**Filed:** 2026-09-13 by the coordinator, out of V9 ticket 05's review cycle 1.
**Origin:** ticket 05's AC claimed kid names are shown "only for the host and
people who pinged, **as today**". The builder refused to ship that sentence
because it is false, and the fresh-context reviewer proved it independently.
This ticket is the follow-up both recorded as required, and it is deliberately
**not** part of ticket 05 (that ticket's migration check pins "no policy
changed").

**Status:** `ready-for-agent` — the SCOPE was CONFIRMED by the human on
2026-09-13 (recorded below, with the accepted cost). Nothing else blocks it.

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

## THE SCOPE — CONFIRMED 2026-09-13

**The human confirmed the recommended default, verbatim: "yes".** So a kid's
first name is visible to **(a)** the kid's own family, **(b)** the HOST of a
drop-in that kid is attached to, **(c)** a family who PINGED that drop-in (i.e.
exactly 0026's existing gate) — **plus moderators**. Ages stay broadly visible
(that is V9 ticket 05's whole point, and ages are the signal parents actually
want). The `/u/:handle` cost below was put to the human explicitly and is
**accepted**: kid names come off that profile section for signed-in strangers.

**The accepted cost, restated so it is not discovered as a surprise:** kid names
disappear from `/u/:handle`'s kid section for signed-in strangers and from the
detail page's "Kids coming" line for non-participants — surfaces V2 shipped
deliberately. Where a name can no longer be shown, the honest replacement is the
AGES signal that already exists (a range, never a guess) — do not invent a
partial-name, initial, or count-only substitute.

## Acceptance criteria

- [x] The SCOPE is CONFIRMED (2026-09-13, the human: "yes") and recorded above, including the accepted `/u/:handle` cost
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

**2026-09-13 — review cycle 1 (0040 applied, probed by the coordinator; two HIGH
findings), and the record of the gate's DEPTH.** The gate itself was verified
live: a signed-in stranger with no relationship to any family read `[]` from
both tables post-0040 (7 kid rows, two of them with photo URLs, pre-0040), anon
`[]`, the owner's `INSERT … RETURNING` still returns its row, `kid_ages_for`
returns `{age_min, age_max}` for a two-kid post, and all four functions are
SECDEF + STABLE with `search_path` pinned. Two things then had to be fixed, and
one of them is now part of the record of what this gate does NOT cover.

1. **THE GATE WAS BYPASSABLE BY FORGING A JOIN ROW (F2).** The gate reads the
   two attachment tables as its INPUT, and neither INSERT policy asked whose kid
   was being attached — `playdate_kids_insert_host` (0022:95-104) checked only
   that the caller hosts the post, `ping_kids_insert_own` (0026:90-93) only that
   the row is the caller's own. Reproduced live, executing the exploit against
   this ticket's own e2e data (a pinger's kid, and the marker's kid): attaching
   that child to a post the caller hosts returned **HTTP 201**, after which the
   forging host read the child's whole row (`first_name`, `age`, `avatar_url`,
   `likes`) through the very policy 0040 adds; attaching the host's child to the
   caller's own ping returned **HTTP 201**, after which `get_kids_going` — 0026's
   SECDEF function, which never consults any policy — returned that child's name
   and age to the pinger (and would have to that post's host and every pinger).
   0040 was **amended in place** (the 0028/0032 precedent, and the coordinator
   re-applies it): both INSERT policies now additionally require
   `public.kid_owned_by_caller(kid_id)`. Enumerating a kid uuid was never the
   hard part — pre-0040 any signed-in account read every kid row in the project
   in one request. **Residual, recorded in 0040's header: the fix closes the
   forge going forward, not retroactively** — a forged attachment row created
   before the amendment is still a valid input to the gate, so the coordinator
   probes for pre-existing forged rows and decides what to do with them; the
   migration does not delete anybody's rows.
2. **KID PHOTOS WERE NEVER COVERED BY THIS TICKET, AND MUST NOT BE PROMISED
   (F1).** An earlier draft of the `/profile` copy this ticket shipped said "A
   name **and a kid photo** are visible only to …". That was false and was
   removed; the copy now claims the NAME gate and nothing else. The truth it
   stopped short of: the `avatars` bucket is `public = true` with
   `avatars_public_read` for `{public}` (0011), kid photos live in it at
   `<uid>/kids/<kidId>`, and `kids.avatar_url` stores the public URL
   permanently — deleting the kid row does not delete the object, so every URL
   ever handed out (including every one handed out pre-0040) stays fetchable
   signed out. The reviewer enumerated and fetched those objects live with the
   anon key that ships in the client bundle. Fixing it is a real design change
   (a private bucket + signed URLs, and note the SAME bucket holds parent
   avatars at `<uid>/avatar`, which are public by design — so a bucket-level fix
   has to separate the two paths), and it is exactly the ground V9 ticket 08
   ("no kid photos") stands on. **Escalated to the human; deliberately NOT
   promised in the UI copy and NOT attempted here.**

**The gate's DEPTH, stated plainly so nobody over-reads it** (all three are
properties of the confirmed scope, not defects):

- "the families who said they're going" is **one self-service tap deep**: the
  `going_pings` INSERT is `profile_id = auth.uid()`, so any signed-in parent can
  make themselves a "going" family on any public drop-in and then read the names
  of the kids attached to it. That is 0026's own pinned gate ("names and ages
  only for the host and people going"), inherited deliberately — but it is a
  lower wall than "the families I have met".
- "your family" is **one profile**, not one household: a second parent with
  their own account in the same home sees the kids only if they host or ping —
  there is no household/membership model in the schema to key on.
- the RLS policy is the **boundary**; `/u/:handle`'s self-view-only kids
  section is UX. A host/pinger viewer still RECEIVES the rows they may see in
  `getProfileByHandle`'s embed and they sit unrendered in React state (recorded
  in `UserPage.tsx`, review cycle 1 F5). What the client gate buys is that a
  PARTIAL list is never shown as if it were the whole family.
- `playdate_kid_row_visible(pid, kid)` is a membership oracle for anyone
  holding a kid uuid, and `kid_ages_for` is an unchecked-by-id reader (ages are
  broadly visible by design). Both accepted and documented in 0040's header
  (F6).

