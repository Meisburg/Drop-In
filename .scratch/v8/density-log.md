# Density log — the first cohort (V8 ticket 12)

One row per week. The point is not the app; it is whether real families show
up, twice. Fill this in by hand — it takes two minutes.

## The ritual

- **3 anchor parks**, real playgrounds, real parking, in 2–3 different
  neighborhoods (so "nearby" has something to show).
- **5–8 weekly series** created from the founder account **through the app's
  own UI** (never SQL: the seeding pass is also the first real usability test
  of the series feature, and it keeps RLS honest).
- **One share link per series** posted into the relevant group chat — the
  signed-out public detail page is the one growth surface that already works.
- **A nudge on the day**, from the host, in the group chat. Nobody should have
  to open the app to remember (this is what the push notifications replace
  once the human-owned deploy steps in `docs/push-setup.md` are done).
- **Read the numbers weekly** and change the *meetup*, not the app, when a
  series is not landing.

## Stop rule

If a series has had **zero pings twice in a row**, change its place or its
time. Do not add a feature. Three zero-ping weeks for the same series means
that park/time does not work for those parents.

## Target (the V8 success condition)

**≥3 series, each with ≥1 ping, in three consecutive weeks — without the host
re-posting by hand.**

## Log

| Week | Series live | Pings that week | Series with ≥1 ping | Unique families pinging | Signed-out share opens | New accounts from a share link | Pingers who returned next week | Notes (what changed, what to try) |
|---|---|---|---|---|---|---|---|---|
| 2026-09-14 | | | | | | | | seeding week |
| 2026-09-21 | | | | | | | | |
| 2026-09-28 | | | | | | | | |
| 2026-10-05 | | | | | | | | |

## Where the numbers come from

- **Series live / pings**: `/profile` → Your posts (each occurrence shows its
  going count), or the dashboard SQL API:
  `select count(*) from public.playdate_series where active;`
  `select s.id, s.title, count(gp.*) from public.playdate_series s
   left join public.playdates p on p.series_id = s.id
   left join public.going_pings gp on gp.playdate_id = p.id
   where s.active group by s.id, s.title order by 3 desc;`
- **Unique families pinging**:
  `select count(distinct profile_id) from public.going_pings gp
   join public.playdates p on p.id = gp.playdate_id
   where p.series_id is not null and gp.created_at > now() - interval '7 days';`
- **Share opens / new accounts**: the public detail page is anonymous, so
  opens are not tracked anywhere by design (no analytics in this app). Count
  new accounts instead (`select count(*) from auth.users where created_at >
  now() - interval '7 days'`) and ask the hosts which link they sent. If a
  real funnel number is ever wanted, that is a new ticket with its own
  privacy decision — do not bolt tracking on.

## What this is not

No paid acquisition, no growth hacking, no invite tokens, no referral credits.
Ten parents who actually show up beat a thousand installs, and this app cannot
yet tell the difference.
