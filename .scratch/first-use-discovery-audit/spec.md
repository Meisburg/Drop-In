# Spec: first-use discovery audit

**Source brief:** `docs/handoff-first-use-discovery-audit-2026-09-25.md`
(implementation handoff; the highest authority for scope in this effort).

**What this effort fixes:** a first-time parent's path from signed-out entry to
"I'm going" — specifically the four defects the audit found on the way: internal
developer prose rendered on the post form, an unexplained ZIP fallback, a
notification prompt competing with the RSVP confirmation, and automated-test
fixtures visible in the production discovery feed.

## Scope

In scope (the brief's prioritized work, in its own order):

1. Remove the literal developer comment rendered on `/new`.
2. Make the address-to-ZIP fallback explicit during signup.
3. Protect the immediate RSVP success moment.
4. Keep test fixtures out of the production discovery feed.

## Non-goals (explicitly rejected or deferred)

- **No signed-out preview of a nearby drop-in.** The ChatGPT transcript proposed
  it; the handoff brief does not. Showing real posts to signed-out visitors is a
  privacy-model change and needs its own ADR-level decision, not this batch. The
  public `/playdate/:id` share link remains the acquisition path.
- **No ZIP prefill from the signup address.** The transcript called the
  address-then-ZIP sequence duplicate work; the brief instead asks only that the
  fallback be *legible*. Prefilling is a separate change.
- **No change to the `WhileAwayCard`.** The card lives at the top of the feed by
  design. The audit's "notification explainer interrupts RSVP" finding is about
  the shell's push opt-in prompt, not the feed card.
- **No test-first rewrite of existing suites**, and no new dependencies.

## Preserve these behaviors

- The signup screen keeps the first action and the address-privacy purpose clear.
- The nearby feed gives a new parent a visible local result quickly.
- The detail page gives **I'm going** visual priority, then confirms with a count
  and a direct host-message path.
- A public shared link gives enough context to motivate signup while keeping
  comments and attendee identities private, and a public visitor must still
  explicitly confirm "I'm going" after signing in — never auto-RSVP.
- Removing the stray comment must not resurrect a second bottom-of-form
  directory control.

## Not established by the audit

Keyboard-only navigation, screen-reader output, 200% zoom/reflow, and real
slow/offline network recovery were **not** tested. They are separate validation
work and must not be claimed as complete from this mobile visual run.

## Tickets

| # | Ticket | Blocked by |
|---|---|---|
| 01 | Remove the developer comment rendered on `/new` | — |
| 02 | Make the ZIP fallback legible after an unresolved signup address | 01 |
| 03 | Give the RSVP confirmation the screen, and defer the notification prompt | — |
| 04 | Make the test-fixture marker convention enforceable | — |
| 05 | Sweep production of automated-test records and wire it into the release runbook | 04 |

Frontier at publication: **01, 03, 04** are all unblocked.

## Reference video

The audit provided no video. Its evidence is the table in the source brief, and
the brief's own live-run fixture data was removed after the run.
