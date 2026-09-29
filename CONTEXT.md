# Playdate (Drop In)

A webapp for arranging drop-ins: parents post a time and a place, nearby parents
see it and say they're going. Privacy-first — kids appear by first name and age
only, and nothing is visible without an account.

## Naming

Three names are in play for the same thing. That is deliberate but confusing, so
pin it once:

- **Drop In** — the product's user-facing name. Use it in all copy.
- **playdate** — the legacy name, surviving in the repo (`playdate-app`) and in
  the database (`playdates`). Avoid it in new copy and new identifiers; do not
  rename the table.
- **drop-in** — the domain object. The word to reach for in prose, identifiers,
  and types.

## Language

**Drop-in**:
A posted invitation to meet at a specific time and place.
_Avoid_: playdate, event, meetup

**Parent**:
The adult using the app — the only kind of account that exists.
_Avoid_: user, account, member

**Kid**:
A child listed on a parent's profile. First name and age only, never a surname.
_Avoid_: child, dependent

**Going ping**:
A parent's stated intention to attend a drop-in. An intention, not a check-in —
nothing in the system observes arrival.
_Avoid_: RSVP, attendance, check-in

**Place**:
A real-world venue (a park, a café) with an address and, where known, opening
hours. A drop-in either names a place or carries a free-text address; one with no
place cannot collect reviews.
_Avoid_: location, venue, spot

**Home zip**:
The parent's private location, and the origin discovery is measured from. Never
shown to another parent.
_Avoid_: address, location

**Radius**:
The number of miles around the home zip within which the feed looks for drop-ins.
_Avoid_: distance, range

**Display name**:
The first and last name other parents see, and how a parent is found in the
inbox. Not the email.
_Avoid_: handle, username, account name

**Feed**:
The drop-ins a parent can act on now — nearest first, past and ended ones
excluded.
_Avoid_: home, listings, results

**First run**:
Everything from a brand-new visitor landing on the site to seeing drop-ins near
them. It covers signing up as well as the interview.
_Avoid_: onboarding — they are not synonyms

**Onboarding**:
The interview that collects who the parent is. A series of cards, one question
each — not a single form.
_Avoid_: signup, setup wizard, registration
