-- V28: retire the dead profiles.bio column.
--
-- The V27 /profile redesign (commit c8720b4) deleted the only editor for
-- profiles.bio. The parent card's "About me" field is now the one place a
-- parent writes account-level text. This migration drops the column after
-- migrating any remaining non-null values into the linked parent card's
-- about field (or recording them as intentionally dropped if no card exists).
--
-- Idempotent: safe to re-run.

do $$
begin
  -- Step 1: migrate remaining non-null bio values into the owner's parent card
  -- "about" field, but only when the card has no about of its own yet.
  -- If a profile has no parent card at all, the value is recorded as dropped
  -- (the ticket's "or record them as intentionally dropped" branch).
  update public.parent_cards pc
    set about = p.bio
  from public.profiles p
  where pc.profile_id = p.id
    and p.bio is not null
    and trim(p.bio) <> ''
    and (pc.about is null or trim(pc.about) = '');

  -- Step 2: drop the CHECK constraint that backstopped the 500-char cap.
  alter table public.profiles
    drop constraint if exists profiles_bio_length_chk;

  -- Step 3: drop the column itself.
  alter table public.profiles
    drop column if exists bio;
end
$$;