# V21 SPEC — the phones-review batch (founder + wife, 2026-09-23)

Source: `vibe-annotations-drop-in-mu.vercel.app (2).json` (11 annotations, exported
2026-09-23T03:51Z, captured at 753×650 on the deployed `drop-in-mu.vercel.app`).

**Every annotation below was re-checked against the code before being spec'd.**
AGENTS.md records three prior batches where the founder's description of a UI
shape did not match the code; where that happened here it is called out inline
as **CODE-VERIFIED**.

---

## Annotation triage

| # | Project area | Founder's words (summary) | Verdict |
|---|---|---|---|
| A1 | home / nav | "Let's call this section Drop Ins" | **TICKET t01** — nav label rename |
| A2 | home / nav | Drop the Places tab; move the map + list into the post form's "where" | **TICKET t02** — the batch's centrepiece |
| A3 | inbox | Wife wants Facebook-style reactions: like, love, laugh, wow, sad, angry | **TICKET t03** — reactions grow from 1 to 6 |
| A4 | new | Text spilling out of the duplicate-picker options | **TICKET t04** — real overflow defect |
| A5 | users | Avatar "supposed to be a circle… shape is getting cut off" | **TICKET t05** — real CSS defect |
| A6 | users | "Hosted 10 drop-ins" should reveal the past events | **TICKET t06** — hosted-history reveal |
| A7 | users | Invite-by-username is unrealistic; autocomplete on real names | **TICKET t07** — name search |
| A8 | users | Edit-profile order must match the read-only profile order | **TICKET t08** — section reorder |
| A9 | home | Default to LIST, soonest-first; toggle to map at the top | **TICKET t09** — feed view toggle |
| A10 | u/:handle | Profile appears twice (header link + tab) — remove one | **TICKET t10** — header link out |
| A11 | new | (same screen as A4 — the annotation was filed twice) | **folded into t04** |

Eleven annotations, ten tickets: A11 duplicates A4's element, and A2 absorbs
A9's placement question (both concern where the map lives).

---

## CODE-VERIFIED findings (the parts the founder could not see)

**(A5 is a real, reproducible defect, and the DOM proves it.)** The annotation's
`element_context` shows an `<img class="h-20 w-20 shrink-0 rounded-full">` whose
PARENT is `<button class="flex h-11 w-11 shrink-0 ...">`, and the measured
`img` box is **80px tall but 43.99px wide**. That is not a rendering
coincidence — `ProfilePage.tsx:979` sizes the button to `h-20 w-20` on one
branch while the image inside carries its own `h-20 w-20`, and the annotator hit
a second render path (`:998`) where the wrapper is `h-11 w-11`. A `rounded-full`
element that is 80×44 is an **ellipse**: the founder is describing exactly what
the code does. Fix is a one-owner sizing rule, not a nudge.

**(A2 is bigger than a nav edit.)** `/browse` is not merely a tab — it is a
route (`App.tsx:271`, `BrowsePage.tsx`) carrying the place directory, the
`PlacesMap`, the radius control, the kind chips and place follow hearts, and
V18's photo/website work. Removing the tab without moving those capabilities
would strand them. The founder's own instruction says MOVE ("we move the map and
the list of places to the where section"), so t02 relocates, and the disposition
of the `/browse` route itself is an explicit t02 decision (kept as a route,
unlinked from the nav) rather than a silent deletion.

**(A3 is a schema change, not a UI change.)** `message_reactions` (0042) stores
one row per (message, profile) with **no reaction-kind column** — `db.ts:4749
toggleReactionWithClient` performs an existence check then INSERT-or-DELETE,
i.e. the table can express "thumbs-up, yes/no" and nothing else. Six kinds
therefore need a migration adding the kind and moving the uniqueness from
(message, profile) to (message, profile, kind), plus a rewrite of the toggle
from a boolean to a set-selection. `applyReactionToggle` (db.ts:4920) is a pure
seam with 8 existing tests; it must be generalised, not replaced.

**(A7 needs a new read path, and it is a privacy decision.)** Signup now stores
first + last name and composes the handle (V20, `e2e/auth.setup.ts`), so the
names the founder wants to type exist. But `profiles` is not name-searchable by
default under RLS, and "type a name, see matching users" is user enumeration —
mild, since profiles are already visible to signed-in parents by design, but it
must be a deliberate, bounded decision: **signed-in only, prefix match, capped
result count, name+handle returned and nothing else.** t07 pins it.

**(A6/A8 are additive/ordinal work with no schema change.)** "Hosted N drop-ins"
already renders (`UserPage` V3 ticket 04); the founder wants it to reveal the
list. The profile read/edit order divergence is a real drift worth pinning with
a test rather than a comment.

**(A9 partially exists.)** The feed already has day sections and a map band
(V19 t02), and the radius control lives on `/browse`. A list/map toggle at the
top of the feed is new; "soonest first" is already the day-section order.

---

## Tickets

### t01 — the nav says "Drop Ins" (A1)
`/`'s bottom-nav label is `Nearby`. Rename the LABEL only: the route stays `/`,
the `NavIcon` stays. Check every spec asserting the literal "Nearby" and the
feed's own heading — the heading is a separate string and the founder pointed at
the NAV element (`a[data-text-content="Nearby"]`), so the heading is NOT renamed
unless it shares the literal.

### t02 — the map + list move into the post form's "where" (A2)
The centrepiece. `/new`'s place picker gains a browse surface: the place LIST
and the MAP, inside the "Where?" block, so picking a place is where you look for
one. The Places tab leaves the bottom nav. `/browse` remains a reachable route
(deep links, `routes.json`, existing specs survive) but is no longer a nav
destination. **Hard constraint:** the app does not lose a single place-finding
capability — radius, kind filter, follow hearts, website link, map popup, and
the marker "Start a drop-in" path must all still be reachable from the new
surface or remain on `/browse`.

### t03 — six reactions (A3)
Migration 0049: `message_reactions.kind` + uniqueness on (message, profile,
kind). The picker offers 👍 ❤️ 😂 😮 😢 😡. One reaction per person per message
(changing kind replaces — the Facebook model the wife asked for), so the unique
index is on (message, profile) STILL, with `kind` as a mutable attribute.
**This is a ruling, not a guess:** Facebook's model is one reaction per person,
and the founder said "similar emojis that Facebook offers". Uniqueness stays
(message, profile); `kind` changes in place.

### t04 — the duplicate picker stops spilling (A4/A11)
`NewPlaydatePage.tsx:979` — a `max-h-64 overflow-y-auto` flex column whose rows
do not constrain their text, so long place names push out of the box. Wrap and
truncate.

### t05 — the avatar is a circle (A5)
One owner for the size. The 80×44 ellipse is a two-owner defect.

### t06 — hosted count reveals the history (A6)
Tap/expand "Hosted N drop-ins" to show the past events.

### t07 — invite a parent by NAME (A7)
Replace/augment the @handle invite field with a name-prefix autocomplete over
profiles: signed-in only, capped, name + handle only.

### t08 — edit-profile order matches the profile order (A8)
Founder's pinned order: **user, kid, parents, drop-ins.**

### t09 — feed defaults to list, with a map toggle (A9)
List is the default, soonest-first; a top toggle switches to the map view. The
day-section order already IS soonest-first, so t09 is a view switch, not a
re-sort.

### t10 — the header's @handle link goes (A10)
The profile is reachable from the tab; the header link is the duplicate.
`App.tsx:203-208`. Keep the gear and sign-out.

---

## Non-goals
- No redesign of `/browse`'s internals (t02 relocates a surface, it does not
  restyle the directory).
- No free-text reactions, no reaction notifications.
- No change to kid privacy posture; t07 returns parent names only.

## Risks / open questions
- **t02 is the riskiest slice** — it touches the nav, the picker, and possibly
  `routes.json`/playtest. It gets its own plan entry and its own review.
- **t03 requires a migration.** Per house rule, `0049` must be idempotent and
  applied twice; the apply is a live-DB action.
- The founder's wife drives t03, t05 and t09 — the "wife said" items are treated
  as first-class product direction, not anecdotes.
