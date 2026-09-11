-- V3 slice 9 (ticket 04): profiles.last_seen_at — the feed retention
-- banner's cursor ("N new families pinged your drop-ins" counts
-- going_pings on the host's OWN posts created after this instant).
--
-- Pinned (plan-v3 slice 9, ticket 04):
-- (a) THE APP RESTAMPS THE COLUMN: FeedPage mount, when the cursor is
--     null or >= 1h stale, fire-and-forget (db.restampLastSeen). NO
--     trigger (the pin — the cursor is app-side; the e2e's documented
--     red point is this restamp 42703ing pre-apply, swallowed).
-- (b) NO RLS CHANGE (the 0014/0016/0021/0022 column-add lesson): the
--     column rides the EXISTING profiles SELECT posture, and the
--     restamp rides the EXISTING owner UPDATE policy — no new 42501
--     surface.
-- (c) 0009's any-column moderator UPDATE policy CAN write this column —
--     a harmless cursor (a wrong value only shifts the banner window;
--     the next due mount restamps it). NO tightening in V3.
--
-- Idempotent + re-paste-safe (house rule: DO-blocked ADD COLUMN IF NOT
-- EXISTS, the 0007/0011/0020/0021/0022 structure).

do $$
begin
  alter table public.profiles add column if not exists last_seen_at timestamptz;
end
$$;
