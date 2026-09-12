# Drop In — product evaluation

Date: 2026-09-12 · Scope: everything shipped through V7.1 (`ea40ef7`), live at
https://drop-in-mu.vercel.app · Question asked: *what is missing, and what
exists that should be improved, so parents want to use this and keep using it
to meet other parents at fun places around the city.*

Method: read-only review of the shipped code (routes, pages, components,
`src/lib/db.ts`, all 27 migrations) plus the live deployment. Every claim below
carries a file:line or a grep result. No app files were modified.

---

## 1. Verdict

Drop In today is a **well-built one-shot directory**: a parent can post a
time + place, another parent can see it sorted by distance, say "I'm going",
and show up. The engineering is careful — RLS is real, degradation is designed,
the trust tools (block / report / hide / ban) exist, kids are modelled, the
public share surface works signed-out.

What it does not have is a **reason to come back tomorrow**. Concretely, three
whole product organs are absent:

1. **No notification of any kind** — not push, not email, not an in-app inbox.
   (Repo-wide grep for `remind|notification|webpush|push` outside `Array.push`:
   zero hits. `dist/sw.js` precaches the shell only; no push handler.)
2. **No repetition** — every drop-in is a single `starts_at`/`ends_at`
   (`0005:17-18`); no `recur|weekly|series|rrule` column anywhere. The weekly
   park meetup — how parents actually meet — must be re-typed by hand.
3. **No memory of people** — no friend, follow, contact, or group concept.
   The only user-to-user tables are `blocks` (`0006:12`) and `going_pings`
   (`0007:9`). A parent who meets three families on Saturday cannot find them
   again on Sunday except by remembering a handle.

And the supply side fails cold: with a 5-mile default radius
(`feed.ts:53`), two live accounts, and no seeded or city-wide fallback, a new
parent's first screen is *"Nothing happening near you today — post the first
one"* (`FeedPage.tsx:433-443`). That screen is the ceiling on everything else.

The goal sentence — "different fun places around the city" — also has no data
model behind it. `place` is free text (`NewPlaydatePage.tsx:270-283`),
`address` is an optional string (`0021`), and the neighborhood is a display
label. There is no place entity, so there is no "what's on at Green Lake this
weekend", no map, and no way to browse by *place* rather than by *distance*.

---

## 2. Diagnosis: which loop is broken

The product has to close two loops. It closes neither.

**Activation loop (open → find something → show up)**
Works mechanically, but the first visit is empty and the second step is
expensive: posting costs six required decisions — title, place, neighborhood,
date, start time on a 30-minute grid, duration (`feed.ts:385-410`) — with no
"today" default (`NewPlaydatePage.tsx:28`, `startDate: ''`) and a start time
that always opens at 10:00 AM (`:29`). The core spontaneous gesture ("we're at
the park right now") is the most expensive thing in the app.

**Habit loop (show up → met someone → next time is easier → come back)**
Completely absent. Nothing happens after an event ends: no follow-up, no
"same time next week?", no connection to the people met, no notification when
someone pings your post or when a drop-in you joined is cancelled. The one
adjacent feature — the host banner *"N new families pinged your drop-ins"*
(`FeedPage.tsx:418-426`) — only renders while the host is already inside the
app, and it is a dead end: tapping it navigates to `/profile`
(`FeedPage.tsx:370-375`), which does not show *who* pinged *what*.

---

## 3. Missing features, ranked

### 3.1 Standing (recurring) playdates — build this first
**Why it retains:** it is the only feature that gives a parent a standing
reason to open the app. "Green Lake, Saturdays 10am" joined once means one
commitment, one reminder, one roster — instead of hunting for a new post every
week. It also removes the host's biggest chore (re-posting by hand, currently
only softened by Duplicate, which drops the date and time —
`NewPlaydatePage.tsx:221-231`).

**How:** `playdates.series_id` + a `series` table (`weekday`, `start_minutes`,
`duration_minutes`, `place_id`, `until`, `host_id`, `title`). The feed expands
a series into its next occurrences inside `groupByDay` (`feed.ts:221`) rather
than materializing rows; `going_pings` attaches to the series, not to an
occurrence, so attendance survives week to week. Host UI: "Repeat weekly" on
`/new`, plus "End series" beside the existing On/Cancelled control
(`PlaydateDetailPage.tsx:1187-1233`). Migration + feed expansion + host UI.

**Effort:** L (2–3 days with tests). **Dependency:** none — can ship before
notifications.

### 3.2 Notifications — the missing organ
**Why it retains:** "someone pinged your drop-in", "the drop-in you joined
starts in an hour", "the drop-in you were going to was cancelled" are the three
messages that convert an idle install into a return visit. Right now a
cancellation reaches nobody, so a parent drives to an empty park.

**How:** `push_subscriptions` table (endpoint, keys, profile_id) + VAPID keys +
`injectManifest` with a `push`/`notificationclick` handler (today the worker is
generated and shell-only, `vite.config.ts:13-50`) + a sender (Supabase Edge
Function or `pg_cron` + `web-push`; note there is no cron/edge code in the repo
yet). Pair with an install affordance — there is no `beforeinstallprompt`
handling at all, and **iOS delivers web push only to an installed PWA**, so the
install step is part of this feature, not a nice-to-have. Revisit `plan-v4` D2
(Capacitor) if App Store presence is wanted; push alone does not require it.

**Effort:** L (3–5 days across app, worker, and one server-side sender).
**Note:** push *amplifies* existing reasons to return; it cannot create them.
Ship 3.1 first, then push notifies series occurrences.

### 3.3 A place entity + browse places, not distance (the stated goal)
**Why it retains:** the product promise is "different fun places around the
city". A parent currently cannot answer "what's fun near me for a 4-year-old on
a rainy Tuesday?" Free text `place` + neighborhood label cannot answer it.

**How:** a seeded `places` table for Seattle — parks, playgrounds, indoor play
cafés, museums, pools, splash pads — with name, address, coords (reuse the
`zip_codes` seed + RLS pattern from `0012`), indoor/outdoor, age fit, restroom
and parking notes, photo. Then: (a) `/new` place becomes autocomplete against
`places` with "somewhere else" free text — which also eliminates address
typing and typo'd venues; (b) `/place/:id` lists upcoming drop-ins there plus
"start one here"; (c) the redundant Browse tab becomes the place/map surface.

**Effort:** L for the seed and place pages, M for the autocomplete (2–3 days +
seed curation).

### 3.4 Quick post — make supply effortless
**Why it retains:** supply is the whole game; every hard field is a parent who
didn't post. Target: post in under 15 seconds from standing at the park.

**How:** default `startDate` to today and `startMinutes` to the next 30-minute
slot (both currently hard defaults, `NewPlaydatePage.tsx:28-29`); remember the
last place / neighborhood / kids; "Recent places" chips; a one-tap preset
("We're here until 5") that fills title + duration; place autocomplete from
3.3. Keep the required validation as-is underneath — this is defaults and
memory, not a schema change.

**Effort:** S–M (1 day, client-only, no migration).

### 3.5 Close the loop after the meetup + a light connection
**Why it retains:** the moment a playdate ends is exactly when the next one
should be suggested, and exactly when a parent is willing to connect with the
family their kid just played with. Today the app forgets the event instantly
(ended posts gray out and drift down, `DropInCard.tsx:107-115`).

**How:** on a past post, a one-tap "Same time next week" (feeds 3.1) for host
and attendees; a follow of a *family* or a *place* (`follows` table,
profile↔profile / profile↔place) surfacing "2 families you've met before are
going" on cards. Keep it consistent with the settled 2026-09-09 verdict: **no
reviews, no vouching, no ratings** — a follow is just a bookmark, not a score.

**Effort:** M (1–2 days).

---

## 4. Existing features to improve, ranked

1. **Browse is a duplicate of Nearby.** Both call `listRadiusFeed`
   (`FeedPage.tsx:145`, `BrowsePage.tsx:39`) and Browse adds no filter, so one
   of four nav tabs (`App.tsx:201-204`) shows the same list. Either make it the
   place/filter/map surface (3.3) or cut it to three tabs.
2. **Cancelling notifies nobody and posts can't be edited.** `handleSetStatus`
   writes a status only (`PlaydateDetailPage.tsx:508-525`); there is no edit or
   delete for your own post, so fixing a wrong time means cancel + repost,
   which loses the pingers silently. Add edit-in-place (time, place, address,
   details), delete, and a cancel notice to attendees (ties into 3.2).
3. **Every profile looks broken.** `/u/:handle` hardcodes *"No posts yet."*
   (`UserPage.tsx:295-297`) regardless of history. That is also where the best
   social proof is buried: list that host's upcoming and past drop-ins.
4. **The host banner is a dead-end tease.** It says "N new families pinged your
   drop-ins" and lands on `/profile`, which shows none of them
   (`FeedPage.tsx:370-375`). Turn it into a real inbox: who pinged which post,
   avatars + names, tap → detail. This is the cheapest retention win in the
   app and needs no new infrastructure.
5. **States that lie, and stale data.** The empty state says "today" over a
   today-and-later list with no widen-radius or city-wide escape hatch
   (`FeedPage.tsx:433-443`); a failed count read disables the "I'm going"
   button with no explanation (`PlaydateDetailPage.tsx:1240`); a failed comment
   load is indistinguishable from "no comments" (`:1337`); ping counts never
   refresh without a remount (no refresh-on-focus, no pull-to-refresh).

Secondary polish (real but low leverage): six separate profile Save buttons
(`ProfilePage.tsx`) and per-kid likes saves; kid rows can't be edited (remove +
re-add); the kids picker writes one chip-tap at a time (`KidsComingPicker.tsx:46-65`);
comment delete has no confirm or undo; a moderator cannot unhide a comment
(`PlaydateDetailPage.tsx:1051`); sharing can fail silently if the sheet is
dismissed and the clipboard write fails (`:557-569`).

---

## 5. Do not build

- **A social network.** No friend feed, likes, DMs, or a "wall". The group chat
  already does that better; Drop In should be the place where the *plan* lives,
  not another timeline.
- **Reviews, ratings, or vouching.** Settled 2026-09-09 and correct: hosted
  counts are enough credibility, and ratings make parents perform for strangers.
- **GPS / live location.** Zip + radius is enough and is the privacy posture
  that makes this safe for a stranger-meeting app.
- **More badge types on cards.** The badge slot already holds
  status / ended / happening-now / starts-soon / rain (`DropInCard.tsx:150-172`).

---

## 6. Suggested sequencing

| Order | Work | Effort | Why here |
|---|---|---|---|
| 1 | Quick post (3.4) + empty-state escape hatch + host ping inbox (4.4/4.5) | 2 days | Cheapest moves; lifts both first-visit and host return, no migration |
| 2 | Standing playdates (3.1) | 2–3 days | Creates the weekly habit and cuts host effort; the thing push later amplifies |
| 3 | Places seed + `/place/:id` + Browse becomes places (3.3, 4.1) | 3 days + seed | Delivers the stated "fun places around the city" goal and kills the duplicate tab |
| 4 | Notifications + install affordance (3.2) | 3–5 days | Converts idle installs into returns; needs an installed PWA on iOS |
| 5 | Post edit/delete + cancel notice (4.2), loop-closing + follow (3.5) | 2–3 days | Makes plans fixable and turns one meetup into the next |

First measurable goal after 1+2: a host who posts a weekly series sees a
non-zero "going" count for three consecutive weeks without re-posting.

---

## 7. Two non-feature blockers worth naming

- **Email confirmation is intentionally off** (decision log, 2026-09-04). For an
  app whose whole point is meeting strangers in a park, unverified accounts are
  the trust story a cautious parent will notice first. Restore confirmation, or
  add a lighter verified-email badge, before any real recruiting push.
- **Density, not features, is the actual constraint.** Every item above is a
  multiplier on a base that is currently ~2 accounts. The first real cohort
  should be seeded deliberately — a handful of standing series at known
  playgrounds, from parents who already share a group chat — otherwise the
  best-designed feed in the world shows an empty screen.
