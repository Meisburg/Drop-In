# V3 Parking Lot — ideas from founder/CoS design review

Status: needs-triage
Date: 2026-09-09
Source: founder + Hermes CoS design analysis session, post-V2-spec. Read-only
review of shipped V1 screens; none of this touches V2's plan.

> Context gate: nothing here is scheduled until V2 lands and the two-user
> beta runs (spec.md Further Notes). Beta feedback may reshuffle this list.

## 1. Feed day-blindness fix — "Today" is a lie

**Problem.** FeedPage is titled "Today" but `listTodayFeed` returns
today-or-later (src/pages/FeedPage.tsx docstring, lines 9–12), and
DropInCard's `formatTimeWindow` renders time-only
(src/components/DropInCard.tsx lines 48–58). So a Saturday post shows
"3–5 PM" with no date, and this-morning's ended drop-in still sits at the
top of "Today" at 3 PM.

**Fix.** Day section headers (Today / Tomorrow / weekday) on the feed; date
on non-today cards; gray-out or demote ended events; "Starts soon" badge on
soonest. All client-side; feed.ts already has the `nowIso` seam.

**Effort:** small (1 slice, no migrations). **Priority: 1** — every user
hits it daily.

## 2. Host status + weather badge ("it's on" / "rained out")

**Problem.** Seattle outdoor drop-ins live or die by rain. Parents currently
have no way to know a 3 PM park meetup is still on, and hosts can't say so.

**Fix.** Host-set event status (ON / RAINED OUT / CANCELLED) on their own
post; gray "rained out" state on card + detail. Optional ☔ badge pulled
from Open-Meteo (free, no key, no user location — the post's place+time is
enough; the app never senses location per spec Out-of-Scope).

**Effort:** medium (1 migration for status column + card/detail UI).
**Priority: 2** — differentiation; fits the zero-pressure soul.

## 3. Add-to-calendar (ICS) on the detail page

**Problem.** Parents live in calendars; nothing on the detail page
reminds them an event exists. Push is V3-scale work; this isn't.

**Fix.** "Add to calendar" on the detail page generating an ICS download
from `starts_at`/`ends_at`/title/place. Works on any phone, today.

**Effort:** small (pure client-side generator, unit-testable like the other
lib seams). **Priority: 3.**

## 4. Host retention loop

**Problem.** Hosts are the supply side; without them the app is empty. V1
gives a host zero pull to come back (their own post's ping count only
appears if they visit it).

**Fix.** (a) When a host opens the app: banner "2 new families pinged your
Saturday post" — pre-push stopgap, needs a last-seen cursor or a simple
unread-pings query. (b) "Hosted 12 drop-ins" credibility line on UserPage —
one count query; fights the #1 logged risk (trust at scale) without
reviews.

**Effort:** medium (one small migration at most). **Priority: 4.**

## 5. Web push notifications (the V3 headliner)

**Problem.** No re-engagement surface. "A new drop-in within 5 miles today"
and "3 families coming to your post" are the two killer pushes.

**Fix.** Web Push + service worker (vite-plugin-pwa already installed).
Caveat: iOS requires installed-to-homescreen first, so this composes with
the still-deferred DECISION 3 (deploy) — push needs a real origin anyway.

**Effort:** large. **Priority: 5** — after deploy + beta.

## Parked / needs founder decision

- **Edit-before-start:** spec.md line 91 pins "no edit, duplicate only" as
  V1-inherited. A host who picked the wrong park can only comment "moved!"
  (once comments ship in V2). Worth reopening as a time-boxed edit window
  (e.g. editable until first non-host ping). Founder call.
- **Age-range filter in Browse:** `age_hint` is free text, so filtering
  needs a structured min/max age on posts — schema + form change. Natural
  once kids' structured ages land in V2 slice 2.
- **Smart paste (AI):** paste the group-chat message → /new form prefilled.
  Needs a server-side LLM call (the app is currently pure Supabase client)
  plus a privacy story for a parents' app. Park until the trust posture has
  a beta under its belt.
- **Reputation — design verdict (2026-09-09 session):** NO two-sided
  reviews (gameable, and mutual star ratings between parents who must
  co-exist socially is toxic). Build **computed history instead**:
  (a) "Hosted N drop-ins" on profiles; (b) repeat-attendance surface —
  "You've crossed paths with Sarah at 4 drop-ins" — the group chat's real
  trust mechanic (repeated exposure) made visible, and ungameable because
  it is behavioral, not declared; (c) explicit vouching is rejected —
  it gatekeeps and has a cold-start paradox (who vouches for the first
  person?). Expansion model: trust transfers person-to-person, wave by
  wave (origin group → friend-of-friend), not via badges.