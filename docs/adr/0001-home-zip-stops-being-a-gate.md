# 0001 — The home ZIP stops being a gate

**Status:** accepted

## Context

Since V2 slice 3, a signed-in parent with no home zip has been redirected away
from _every_ protected route to `/onboarding` (`resolveProtectedRedirect` in
`src/lib/onboarding.ts`). The reasoning was local relevance: a feed with no
location is a feed of strangers' drop-ins.

The cost only became visible once we designed the first run. A card-by-card
interview a parent may abandon at card 3 leaves them signed in, holding an
account, and able to see **nothing at all** — the worst possible shape for the
abandonment case, and the opposite of welcoming.

## Decision

Onboarding stops being a wall and becomes a **write gate**. A parent without a
home zip can browse the feed, open a drop-in, and look at places. Only the
actions that must know where they are — saying they're going, hosting a drop-in —
require a location, and they ask for it in place.

A parent with no zip does not get an empty feed: they get the widest radius, with
an honest "we don't know where you are yet" state.

## Considered options

- **Keep the hard gate.** Rejected: it converts an abandoned first run into a
  blind app.
- **Never gate, silently default the location.** Rejected: a made-up origin is a
  lie about what the parent is being shown, and it silently writes a location
  they never gave.
- **Gate only the writes.** Chosen.

## Consequences

- `resolveProtectedRedirect`'s onboarding bounce comes out; the gate moves onto
  the going-ping and host actions.
- A "we don't know where you are yet" feed state has to exist, and must be honest
  rather than empty.
- A parent may hold an account with no location indefinitely, so discovery
  surfaces must treat a missing home zip as a normal state, never an error state.
