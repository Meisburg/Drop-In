# 03: Give the RSVP confirmation the screen, and defer the notification prompt

**What to build:** After a parent taps **I'm going** on a drop-in's detail page,
the page correctly becomes **✓ Going**, updates the family count, lists **You**,
and offers **Message the host**. In the same instant, the shell's notification
opt-in prompt also appears in that route's viewport and competes for the moment
the parent just earned.

The RSVP confirmation has priority. A browser permission request, opt-in card,
or fallback note must not appear in the same immediate detail-page state as a
successful RSVP. Defer the prompt until a later, non-critical moment — the next
feed visit — and leave Settings as the durable place to manage notifications.

This cannot be a blanket delay, and that is the trap in this ticket. A ping saved
from a **feed card** does not navigate (`PushOptInPrompt` exists partly to handle
exactly that), and `e2e/push-subscribe.e2e.ts` asserts the prompt appears
immediately in that case. The deferral must therefore be *origin-aware*: the
armed trigger record carries where the action happened, the pure decision seam
decides on that fact, and a trigger whose origin is unknown or missing behaves as
it does today rather than silently suppressing a legitimate prompt.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Immediately after a successful RSVP on a drop-in's detail page, the
      primary visible response is the changed RSVP state and attendance result.
- [ ] No notification permission request, opt-in card, or fallback note appears
      over or beside that immediate RSVP confirmation.
- [ ] The deferred prompt surfaces on the next feed visit.
- [ ] A ping saved from a feed card keeps its current immediate prompt, and the
      existing assertion for it stays green.
- [ ] Notification controls remain reachable in Settings.
- [ ] A denied, unsupported, or dismissed notification state does not make the
      RSVP look failed or incomplete.
- [ ] The existing one-tap RSVP behavior and its explicit undo semantics are
      preserved.
- [ ] The trigger record's new origin field is covered by unit tests for both
      the known and missing-origin cases.
- [ ] `npm run verify` passes, and `e2e/push-subscribe.e2e.ts` passes with the
      detail-page RSVP case extended to assert the deferral.
