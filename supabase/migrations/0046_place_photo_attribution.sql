-- ===========================================================================
-- V18 t01 (migration 0046): the photo attribution record for `places`.
-- ===========================================================================
--
-- What this does: adds FOUR nullable text columns to `public.places` —
-- `photo_source_url`, `photo_license`, `photo_author`, `photo_attribution`. It
-- adds no constraint, changes no policy, and touches no existing row. Strictly
-- additive and re-paste-safe: this is a LIVE-DATABASE migration (the project it
-- applies to holds real family data).
--
-- Why: `places.photo_url` has existed since the original seed but is NULL for
-- every one of the 239 rows — verified against the live DB (239 total, 0 with a
-- photo). V17 t01 built the card's photo-capable slot and left the real branch
-- unreachable; V18 (that batch's deferred t05) fills it from Wikimedia Commons.
--
-- Commons images are NOT all public domain. The measured distribution
-- (`.scratch/v17/spec.md` §4.1.2) is CC BY / CC BY-SA / CC0 / public domain,
-- and **CC BY and CC BY-SA require attribution**. A license you cannot name is
-- a license you cannot honour, so the license, its author, and the canonical
-- source page are stored BESIDE the URL rather than reconstructed later. The
-- ready-to-render `photo_attribution` line is stored too, because the correct
-- composition rule (skip an empty part; join what remains) is a decision that
-- belongs in one tested place, not re-derived at every render site.
--
-- WHY `photo_author` HOLDS PLAIN TEXT, NOT THE RAW FIELD: Commons'
-- `extmetadata.Artist` and `.Credit` return **HTML** — verified this session,
-- e.g. `<a href="…/user:Shakespeare" …>en:user:Shakespeare</a>`. Storing that
-- raw and rendering it is an injection vector, and storing it raw while
-- stripping at render time puts the work in the layer that has no test. The
-- backfill script strips to plain text BEFORE the write, so what the column
-- holds is what a human reads.
--
-- NO `NOT NULL` AND NO CHECK (the 0021 lesson, V3 ticket 08): these are
-- free-text values with no DB-level shape worth pinning. A partial attribution
-- record is a defect for the candidate sheet to catch — the founder reviews
-- every row before it is written (V18 D2) — not a constraint that would block a
-- legitimate later hand-correction. `photo_url` itself stays nullable for the
-- same reason it always was: most places will keep the per-kind illustration
-- fallback, which is a supported end state, not a gap to be closed.
--
-- NO RLS CHANGE. `places` is world-readable already (the seed data is public
-- and the anon read path depends on it), and these columns ride the existing
-- whole-row SELECT posture — the 0014 / 0016 / 0021 column-add lesson: adding a
-- column does not, and must not, quietly re-scope a table's policies.
--
-- Idempotent + re-paste-safe (house pattern, 2026-09-04 lesson; 0041 / 0045
-- precedents): `add column if not exists` is supported for columns (unlike
-- `create policy`, which has no IF NOT EXISTS and must be DO-block guarded —
-- the 2026-09-04 rule). Each add is its own statement inside one DO block so a
-- partial prior application converges rather than erroring. Run once or a
-- hundred times, the table ends in the same state: 239 rows, four empty new
-- columns, every pre-existing column byte-identical.
--
-- Apply order: independent. It assumes only that `public.places` exists (it has
-- since the original seed) and that `photo_url` is present — it is not, and must
-- not be, re-added here. The last applied migration is 0045.

-- ---------------------------------------------------------------------------
-- 1. The four attribution columns.
--
--    All nullable text, all empty on arrival. `photo_url` is deliberately
--    ABSENT from this list: it already exists, and re-adding it would be either
--    a no-op (with `if not exists`) or a destructive rewrite (without it).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name = 'photo_source_url'
  ) then
    alter table public.places add column photo_source_url text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name = 'photo_license'
  ) then
    alter table public.places add column photo_license text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name = 'photo_author'
  ) then
    alter table public.places add column photo_author text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name = 'photo_attribution'
  ) then
    alter table public.places add column photo_attribution text;
  end if;
end
$$;
