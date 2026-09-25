# 02: Make the ZIP fallback legible after an unresolved signup address

**What to build:** Today, when a new parent's signup address does not resolve to
a ZIP, account creation still succeeds, but they are routed to the ZIP step with
no explanation — the screen asks for a location again as if the address had
never been entered. Nothing tells them their address lookup failed, and nothing
connects the address they already typed to the ZIP now being requested.

Keep account creation non-blocking (a third-party lookup failure must never
block an account), and make the fallback legible instead: tell the parent the
account is ready, tell them the address could not be matched to a ZIP, and put
the ZIP field in that context.

This ticket also adds the test seam, because the unresolved branch is otherwise
only reachable by live network luck: `src/lib/geocode.ts` currently has **no
sibling test**, which the build law requires for every `lib/*.ts`, and
`zipFromAddressQuery` is the function whose two outcomes (resolved / unresolved)
this ticket's two acceptance paths depend on. Make its single outbound lookup
injectable so both outcomes are unit-testable without touching the network.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A resolved Seattle address still sends the new parent directly to a nearby
      feed, with nearby results when data exists.
- [ ] An unresolved address still creates the account and lands on the ZIP
      fallback with no dead end.
- [ ] The fallback states why a ZIP is being requested now, in the parent's
      language, and preserves the existing address-privacy promise.
- [ ] An invalid ZIP shows the existing inline, accessible validation error.
- [ ] The parent can complete setup without meeting implementation terms such as
      "geocoding" or "home_zip".
- [ ] No precise home address is stored or exposed beyond the existing privacy
      model.
- [ ] `src/lib/geocode.ts` gains its sibling test, covering both the resolved
      and unresolved outcomes deterministically, and the build-law guard passes.
- [ ] `npm run verify` passes, and the affected onboarding/new-signup browser
      coverage passes against the approved test target.
