# 03: End an event early — the `ended` status (honest history, option A)

**What to build:** A third host status, `ended` — founder decision, option A
(honest history): when a host ends an event early (it wrapped, it rained,
it just stopped), the post is not "cancelled"; it *ended*. Consequences:
1. The host status panel on /playdate/:id gains the option (today:
   on / cancelled only).
2. The feed drops `ended` posts immediately (alongside the existing
   `ends_at > cutoffIso` filter).
3. History keeps them: the owner's "Your posts → Past" (and the archive)
   shows them labelled "ended", distinct from "cancelled".

**Why:** Founder decision (V12), option A (honest history) — a host who ends
an event early today can only cancel it, which mislabels an early end as a
cancellation; an "ended" status keeps it in history as "ended", not
"cancelled".

**Status:** ready-for-agent

## Mechanics (pinned)

- **The migration (0041, reserved — the batch's only migration).**
  `supabase/migrations/0016_playdate_status.sql`: the status column `:35`,
  the original 3-value CHECK guard `:41-48` (`playdates_status_chk`), the
  RLS notes `:13-18` (host writes ride `playdates_update_host` from 0005).
  `supabase/migrations/0019_status_trim.sql`: the 'rained_out' row
  conversion `:32`, the live 2-value CHECK `:46-56`
  (`check (status in ('on', 'cancelled'))` at `:53-54`). 0041 replaces
  that constraint with `check (status in ('on', 'cancelled', 'ended'))` in
  the 0019 idempotent, pg_constraint-guarded structure; no row conversion —
  existing rows are on/cancelled. **Probe before writing:** (a)
  `playdates_update_host` (0005/0016:13-18) — confirm the host UPDATE
  policy admits the new value (a generic host-write, expected yes); (b)
  `supabase/migrations/0032_notification_log.sql` (478 lines):
  `notify_playdate_cancelled()` `:416` — its guard `new.status <>
  'cancelled'` (`:429`) means on→ended fires the trigger (the WHEN clause
  at `:454-459`, `old.status is distinct from new.status`) but writes
  nothing; the DELETE trigger `:463-467` and the revokes `:473-478` are
  unaffected. Decide in 0041 whether an `ended` transition writes a
  notification (a new `kind` 'ended', or fold into 'cancelled') and record
  the decision in the migration header — default: notify, kind 'ended'.
- `src/pages/PlaydateDetailPage.tsx` (2565 lines): the host panel `:1897`,
  "This is your post" `:1904`, the status block `:1975-2001`
  (`HOST_STATUS_OPTIONS.map` at `:1978`), `HOST_STATUS_OPTIONS`
  `:2479-2482` (today: `on` / `cancelled` — add `ended`, label "End this
  post now").
- `src/lib/feed.ts`: `isStillAhead` `:259` (treat `ended` as not-ahead);
  the feed query's `.gt('ends_at', cutoffIso)` `:600` (add the status
  exclusion for `ended`).
- The app's status type union (`'on' | 'cancelled'`) gains `'ended'` —
  grep the union + the muted-card rendering (the "Cancelled" muted state,
  V3 t06) and add the "ended" rendering path (muted, labelled "Ended").
- E2E: the `feed-ended-out.e2e.ts` family gains the `ended` case (a post
  marked `ended` leaves the feed, stays in the owner's Past list).

## Acceptance criteria

1. `supabase/migrations/0041_*.sql`: CHECK widened to
   `('on','cancelled','ended')`, idempotent + re-paste-safe in the 0016 /
   0019 structure; the header records the `playdates_update_host` probe
   result and the 0032 notification decision.
2. The host status panel offers the third option; choosing it writes
   `status = 'ended'` through the existing host-update path.
3. The feed excludes `ended` posts (status check alongside
   `ends_at > cutoffIso`); `isStillAhead` treats `ended` as past.
4. "Your posts → Past" + the archive render `ended` posts with an "ended"
   label, visually distinct from "cancelled".
5. 0041 applied via the coordinator CDP tooling + live probe (a host ends
   a post → row `ended`, feed excludes it, notification row if the decision
   says so); `npm run build && npm run test` exit 0; full e2e green; lint
   0 errors.

**Migration check:** 0041 (reserved — the batch's only migration; last
applied is 0040).

**Depends on:** none — but the migration is the batch's only DB change, so
the coordinator applies it the moment the ticket's code is green.