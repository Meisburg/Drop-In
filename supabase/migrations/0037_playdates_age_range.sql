-- V9 ticket 05: AGES FIRST on a card — one STATED range, and a kid name that
-- is allowed to be absent.
--
-- Her words (the ticket): "I think age of the kid should be the most important
-- cuz the kids people want to know what age they're playing with … if it's
-- toddlers you're going to bring your kid to a toddler thing … names are
-- optional and when people start to put names like some people get weird about
-- that. But ages, if you just say kid age, I feel like that's not weird."
--
-- ---------------------------------------------------------------------------
-- 1) WHAT A DROP-IN'S AGE RANGE IS: TWO SOURCES, AND THE STATED ONE WINS
-- ---------------------------------------------------------------------------
-- A drop-in's age range has TWO sources. They are not equal, and this
-- migration is what makes the second one possible at all:
--
--   * DERIVED — the ages of the kids the HOST said they are bringing
--     (`playdate_kids` → `kids.age`, live since 0022). The host does nothing
--     new: pick your kids and the crowd's age is stated. NO COLUMN IS NEEDED
--     for this half and none is added; the client derives it from a batched
--     read of the existing tables (db.kidAgesByPostForPosts).
--   * STATED — the "Ages (optional)" chip row on /new (`0–2`, `2–5`, `5–8`,
--     `8–12`, `All ages`), stored in the two columns this migration adds. A
--     host with NO kids listed — or one who does not want their kids on the
--     post at all — can still say what age crowd this is for.
--
-- THE PRECEDENCE, pinned here because the data model is where it becomes true:
-- when BOTH exist, the STATED pair WINS ("the parent said so out loud"). The
-- rule itself is a pure client seam with its own unit test
-- (feed.playdateAgeRangeLine — the ticket's T5: precedence is never inline in a
-- component), and NOT NULL/NULL is what carries it: a NULL pair means "nothing
-- stated", which is precisely when the derived range answers. The "All ages"
-- chip stores the FULL kid domain (0 and 17 — the range `kids.age` and
-- validateKidAge use) rather than NULL/NULL, so pressing a chip is an answer
-- that survives a reload instead of dissolving into "unanswered".
--
-- THE CHECK is `age_min is null or age_max is null or age_min <= age_max` — it
-- fires only when BOTH are present, because a single end is legal (the columns
-- are independently nullable; the client reads one end as that one age) and a
-- backwards range is not a range at all. It is the DB backstop; the chips can
-- only produce a valid pair.
--
-- ---------------------------------------------------------------------------
-- 2) WHAT THIS MIGRATION DOES **NOT** DO (the pins, so nothing is assumed)
-- ---------------------------------------------------------------------------
-- * NO POLICY CHANGED, anywhere. Not `playdates`, not `playdate_kids`, not
--   `kids`. No RLS is enabled, disabled, dropped or created here.
-- * NO READ GATE IS WIDENED. Specifically, 0026's `get_kids_going` gate (the
--   host / a caller who pinged / moderators — over `ping_kids`, the PINGER's
--   kids) is untouched, and `count_kids_going` / `count_kids_going_for` are
--   untouched. This ticket's derivation asks a DIFFERENT question — the HOST's
--   announced kids, `playdate_kids` — through a batched read that projects
--   `kids.age` ONLY: never a name, never a kid id. That projection is strictly
--   NARROWER than the standing posture rather than a widening of it, because
--   0022's `playdate_kids_select_authenticated` policy is `USING (true)` to
--   `authenticated` — any signed-in user could already read those rows (kid
--   ids included), and `anon` gets nothing (RLS is `to authenticated`; the
--   e2e proves the empty-answer live).
-- * `playdates.age_hint` — the old V3 free-text "best for ages" column — IS
--   LEFT ALONE. It is NOT repurposed, NOT written, NOT read, NOT dropped, and
--   NOT backfilled. It is dormant and stays dormant (the /new field went away
--   in V3 ticket 09; the duplicate prefill still carries its value). The
--   structured pair below is the new answer; the two never touch.
-- * NO FUNCTION is created. The derivation reads existing tables (0022) rather
--   than a new SECURITY DEFINER RPC, and the stated pair rides the feed row's
--   own `*` select. Reason, in one line: a function would have to be created
--   HERE, so the derived half of e2e/feed-ages could not be green before this
--   file is applied — and the ticket pins that the DERIVED half is green
--   immediately, with only the chips half red. See the ticket-05 report for the
--   full deviation note.
-- * NO INDEX. The two columns are read per row off a row the client already
--   has (the feed / detail `*` select); nothing filters or joins on them.
--
-- ---------------------------------------------------------------------------
-- 3) THE DELIBERATE EXTENSION: `kids.first_name` BECOMES NULLABLE
-- ---------------------------------------------------------------------------
-- The ticket's AC — "the kids editor on /profile makes clear that first names
-- are optional: the field is not required to save a kid" — needs BOTH halves:
-- the UI rule relaxed (db.validateKidName no longer rejects a blank name) AND
-- this column made nullable (live evidence: `information_schema.columns` says
-- `kids.first_name` is `is_nullable = NO`, NOT NULL since 0011). Without the
-- column change, a blank name would have to be stored as `''` — a fake name
-- that every reader then has to special-case, and a value that says "no name"
-- only by convention. `null` is what "no name" actually is, so the app writes
-- NULL for a blank name (db.addKid / db.updateKidWithClient) and this line
-- makes that write legal.
--
-- This is a DELIBERATE EXTENSION of the ticket's "two columns + a CHECK"
-- migration line, and it is recorded as a deviation in the ticket-05 report.
-- It is also idempotent by nature: `ALTER COLUMN ... DROP NOT NULL` on a
-- column that is already nullable is a no-op, not an error.
--
-- Every consumer of a kid's name was walked for the NULL. HOW, exactly, because
-- the honest version matters: the type change to `string | null` made the
-- compiler walk every METHOD CALL and ASSIGNMENT on a kid's name (`.charAt(0)`,
-- `alt={...}`, a `Kid` spread) — but a TEMPLATE LITERAL accepts `string | null`
-- and compiles clean, so the compiler does NOT enumerate a
-- "${kid.first_name}" interpolation.
-- One such use was live and reachable (ProfilePage's Remove dialog said "Remove
-- null?"), found by grepping `src/` for first_name interpolations, not by the
-- compiler. Fixed there, with a noun fallback ("This kid") and an e2e assertion.
-- The consumers that were walked: the /profile kid rows
-- (photo alt, initial circle), the /new kid chips, /u/:handle's kid list, the
-- "Who's coming with you?" picker, `feed.kidsComingLine` (an age-only kid now
-- renders through the RANGE instead of being filtered out — the T3 trap),
-- `db.listPlaydateKidNames` / `db.listKidsGoing` (normalise NULL → '') and
-- 0026's `order by k.age asc nulls last, k.first_name asc`. That last one needs
-- NO change and gets none: in Postgres, `ASC` means `NULLS LAST`, so a
-- nameless kid already sorts after the named kids of the same age. (0026 is
-- APPLIED live; editing an applied migration would change nothing anywhere.)
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): `add column if not
-- exists`, the CHECK inside a DO-block existence guard (Postgres has no
-- `ADD CONSTRAINT IF NOT EXISTS`), and `drop not null` is a no-op when it is
-- already dropped. The guard reads `pg_constraint` by name + `conrelid`, the
-- 0011 pattern: a table CHECK is a `pg_constraint` row, so the composite-type
-- join (`t.typrelid = a.attrelid`) is not needed here — it is the pattern for
-- guarding a COLUMN or a domain/composite attribute, not a table constraint.

-- 1) The STATED range (smallint: ages are 0–17 — the 0011 kid domain).
alter table public.playdates
  add column if not exists age_min smallint;
alter table public.playdates
  add column if not exists age_max smallint;

-- The pair's integrity: a backwards range is not a range. Only when BOTH ends
-- are present (a single end is a legal state — see the header).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'playdates_age_range_chk'
      and conrelid = 'public.playdates'::regclass
  ) then
    alter table public.playdates
      add constraint "playdates_age_range_chk"
      check (age_min is null or age_max is null or age_min <= age_max);
  end if;
end
$$;

-- 2) A first name is optional (the header's section 3): NULL, not ''.
alter table public.kids
  alter column first_name drop not null;
