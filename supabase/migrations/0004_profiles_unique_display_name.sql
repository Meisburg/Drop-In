-- Slice 2: display_name is the persistent public handle, so it must be
-- unique project-wide — /u/:handle stays unambiguous, and the UI surfaces
-- a duplicate as "that handle is taken" (signup + profile edit).
--
-- RLS check (per plan.md Interfaces): slice 1's profiles policies
-- (authenticated select, owner insert, owner update) already cover slice 2's
-- needs — handle lookups run under authenticated select, handle edits under
-- owner update. No new policies are added here.
--
-- Idempotent + re-paste-safe: the constraint is added only if absent.
-- NOTE: if live data contains duplicate display_names, this statement will
-- fail on those rows — clean them up first (there should be at most a few
-- test rows from slice 1 live checks).

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_display_name_key'
  ) then
    alter table public.profiles
      add constraint profiles_display_name_key unique (display_name);
  end if;
end
$$;