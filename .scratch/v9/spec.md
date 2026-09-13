# V9 spec — the wife's feedback batch

Date: 2026-09-13 · Origin: the human relaying his wife's feedback on the live app
(voice→text, verbatim themes below). State at planning time: **V8 complete and
deployed** (`31c04bd`), migrations through **0034** applied and probed, gate
655/655 unit · e2e 48/48.

Her words, grouped as she gave them:

- **Post:** drop the neighborhood ("people aren't going to know that"); a vague
  time instead of an exact hour ("we'll be here from time to time"); make
  posting as fast and simple as possible; "@ the location so you don't have to
  enter an address" (which needs the places to be populated).
- **General:** a way to message people in the app.
- **Nearby:** attended events should drop off the feed, with a past/archive
  place; **ages** are the most important signal (names feel weird to some
  parents, ages don't); **map-first** with a list toggle and tappable pins;
  **search + filters** by day/time, kid age, neighborhood.
- **Profile:** no kid photos next to a kid's profile; instead an optional
  **family photo** on the parent's profile plus an optional
  **about-our-family** description.

## Two of her asks already ship (say so, don't re-build)

1. **"@ the location"** is ticket 07 (live): `/new`'s place field autocompletes
   over **239 real City-of-Seattle places**, and one tap fills place + address +
   neighbourhood, with "Somewhere else" for anything not in the directory. The
   gap is *discoverability*, not capability — it reads as a text field. Ticket
   01 makes the picker the primary, obvious path.
2. **"A past events place"** half exists: ticket 04 gave `/profile` and
   `/u/:handle` real **Upcoming / Past** lists. What is missing is that ended
   drop-ins still sit in Nearby (demoted + greyed). That's ticket 04 below.

## Queue (one writer, so each blocked by the previous)

| # | Ticket | Effort | Migration | Answers |
|---|---|---|---|---|
| 01 | Post: location first — pick a place, drop the neighbourhood | ~1.5 days | **0035** | Post #1, #4 |
| 02 | Post: a time WINDOW, not an hour ("this afternoon") | ~2 days | **0036** | Post #2 |
| 03 | Post: the twenty-second post (3 decisions, rest behind "more") | ~1 day | none | Post #3 |
| 04 | Nearby: ended drop-ins leave the feed, into the archive | ~1 day | none | Nearby #1 |
| 05 | Nearby: ages first, names optional | ~1.5 days | **0037** | Nearby #2 |
| 06 | Nearby: map-first with a list toggle | ~3 days | none | Nearby #3 |
| 07 | Nearby: search + filters (day, age, neighbourhood, text) | ~1.5 days | none | Nearby #4 |
| 08 | Profile: no kid photos; an optional family photo + about-us | ~1.5 days | **0038** | Profile — **FOLDED INTO 11** |
| 09 | Messages: parent-to-parent, tied to a shared drop-in | ~4 days | **0039** | General |
| 10 | Privacy: kid names are readable by every signed-in parent | ~1 day | **0040** | Found by ticket 05's review |
| 11 | Kid photos: the public storage exposure; family photo instead | ~2 days | **0038** | Found by ticket 10's review; **folds in ticket 08** |

**Ticket 11 was NOT in the original batch** and **ticket 08 is folded into it**
(human's instruction, 2026-09-13). Filed out of ticket 10's review cycle 1: a
fresh-context reviewer verified — with only the anon key that ships in the client
bundle — that kid photos in the `avatars` bucket are **anonymously listable and
fetchable** (`avatars` is `public = true`, `avatars_public_read` is granted to
role `public`, kid photos live at `<uid>/kids/<kidId>`, and the stored URLs are
permanent). Ticket 10 gated the *column*; this closes the *file*. It carries
ticket 08's reversal AND its family-photo feature, because both run through the
same bucket — and the `avatars` bucket is shared with **parent** avatars, so a
private bucket means separating the two paths rather than flipping a flag. One
human decision remains inside it: what happens to the already-uploaded files
(recommended: move them to a private bucket and serve signed URLs — the images
survive, their old public URLs die by design).

**Ticket 10 was NOT in the original batch.** It was filed 2026-09-13 by the
coordinator on the human's instruction, out of ticket 05's review cycle: ticket
05's AC asserted kid names are visible "only for the host and people who
pinged", the builder proved that false against the live project (both `kids` and
`playdate_kids` grant `using (true)` to `authenticated`), shipped truthful copy
instead of the false promise, and both the builder and the reviewer recorded
that tightening the gate needs its own ticket because ticket 05's migration
check pins "no policy changed". It carries one human decision (the scope), and
it must give the feed's ages derivation its own SECURITY DEFINER function — that
derivation reads `playdate_kids` under the very policy the ticket narrows, so
without it every card's ages line would blank **silently**.

Migration numbers are RESERVATIONS in queue order (next free wins if the queue
reorders; whatever is applied is what `task-state.md` records). Every migration
follows the standing rules: DO-block idempotency, no SELECT-policy change that an
UPDATE's new row must satisfy without checking the interaction (the 0014 lesson),
a self-referencing policy goes through a stable SECURITY DEFINER helper (the 0023
42P17 lesson), no `RETURNING` on writes whose SELECT policy excludes the actor
(the 42501 lesson), guard triggers pass through when `auth.uid() is null`.

## Four judgment calls for the human (each ticket carries a recommended default)

1. **Ticket 02 — what "approximate" costs.** A start time that is a window
   cannot power "Happening now" / "Starts soon" honestly, and the feed sorts by
   `starts_at`. Recommended: keep `starts_at` (the window's start) for ordering
   and the ICS export, render the *hint* on the card, and **suppress the
   time badges for approximate posts**. Confirm or override.
2. **Ticket 06 — the map provider.** Recommended: **Leaflet + OpenStreetMap
   tiles** (no API key, no billing account, no per-load cost, and no Google
   ToS on storing derived data). Google Maps would need a key + billing and
   ships more code. **No GPS**: the map centres on the parent's home zip, never
   the device — that posture is what makes a stranger-meeting app safe.
3. **Ticket 08 — a privacy reversal.** The 2026-09-09 decision ("kid photos =
   YES", which overrode the first-name-only pin) is now reversed by the person
   who has to live with it. Recommended: **stop rendering kid photos and remove
   the upload control, but do not delete the stored files** (no destructive
   migration; the columns stay so a reversal is a UI change, not a data loss).
4. **Ticket 09 — messaging is the highest-risk feature in this backlog.**
   Adults contacting strangers about their children is exactly what a
   privacy-first app has to be careful about. Recommended v1: threads exist
   **only** with a shared drop-in (host ↔ someone who pinged, or two families
   going to the same event), text only, no kid names/photos, no attachments,
   report/block inline, and the other parent can leave. That is a product and
   safety decision, not an implementation detail — **do not dispatch 09 until
   the human confirms the scope.**

## Baseline gate (every ticket)

`npm run build && npm run test && npm run test:e2e` exit 0, baseline at planning
time **655/655 unit (20 files)** and **48 e2e specs** (two known live-API flakes:
`guest-list`, `post-edit-delete` — re-run in isolation before reporting a
failure). E2E runs against the live Supabase project and mints `e2e-*` markers:
every new spec is cascade-safe and the markers get swept
(`node scripts/sweep-e2e-markers.mjs select|delete|verify`).

## Not in this batch

Kid photos coming back, GPS/live location, a friend feed, ratings/reviews, and
any paid map or analytics provider.
