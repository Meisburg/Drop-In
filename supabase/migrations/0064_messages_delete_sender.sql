-- 0064_messages_delete_sender.sql
--
-- THE DEFECT THIS CLOSES, measured 2026-10-05: `messages` had only INSERT and
-- SELECT policies (0042, widened by 0043). With RLS enabled and no DELETE
-- policy, a DELETE is not an error — PostgREST reports success and removes ZERO
-- rows, because the policy set filters every candidate row away. The repo paid
-- for this quietly: `e2e/dm.e2e.ts:335-347` has a "best-effort cleanup" that
-- deletes the marker's own free-form DM messages over REST, and it has been
-- removing nothing since the table shipped. A cleanup that reports success and
-- removes nothing is worse than one that fails loudly, because the next run
-- reads the leftovers as a product defect.
--
-- THE RULE IS NARROW ON PURPOSE: a sender may delete their own message, and
-- nobody else may. That matches the one caller that exists today (the marker
-- cleanup filters on `sender_id=eq.<me>`), and it is the same shape as the
-- INSERT policy directly above it (`sender_id = auth.uid()`), so the two halves
-- of "you may write yours and unwrite yours" cannot drift apart.
--
-- WHAT IS DELIBERATELY NOT GRANTED: a moderator DELETE on other people's
-- messages, and a recipient DELETE on a message sent to them. Neither has a
-- caller, and a policy is a capability — adding one because it might be useful
-- is how a table ends up writable by accident. If moderation needs it, that is
-- its own migration with its own reason.
--
-- IDEMPOTENT, like every migration here: `drop policy if exists` then create.
-- Applying it twice is a no-op rather than an error.

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_delete_sender'
  ) then
    drop policy "messages_delete_sender" on public.messages;
  end if;

  create policy "messages_delete_sender"
    on public.messages for delete
    to authenticated
    using (
      sender_id = auth.uid()
    );
end
$$;

-- Read back what was just written, so the migration proves itself in the same
-- statement batch rather than trusting the DO block above.
do $$
declare
  has_delete boolean;
begin
  select exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_delete_sender'
      and cmd = 'DELETE'
  ) into has_delete;

  if not has_delete then
    raise exception 'messages_delete_sender was not created — the policy set is unchanged';
  end if;
end
$$;
