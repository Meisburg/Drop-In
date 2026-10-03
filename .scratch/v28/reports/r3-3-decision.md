# r3-D1 — r3-3 REVERSES A14 / V15 ticket 08. Recorded deliberately.

**Decided by the human 2026-10-03, before any edit, after the conflict was measured
and surfaced rather than discovered mid-diff.**

## The conflict, measured

`src/pages/PlaydateDetailPage.tsx:1957-1965` carries the A14 (V15 ticket 08) record:

> "the ping/RSVP block is the page's PRIMARY action — the founder's note is **'they
> should be at the very top of the page'**... It **used to render after** the
> title/status chip, the place line, the date/time card and the host info card; **it now
> renders FIRST** and everything else shifts down."

The phone walk's item 5 says the opposite: **"a user decides whether they are going
AFTER reading about the event."**

**r3-3 as first planned did NOT mention A14** — a plan defect of the batch's own class
(a slice that reverses a recorded decision without naming it). Surfaced to the human;
their ruling:

> **"Proceed — the reversal is intentional, record it."**

## The ruling

**The human's phone walk SUPERSEDES the V15 founder note.** The later, in-context
observation wins: a parent on a real phone reads the event and *then* decides.

**The A14 comment is NOT deleted or rewritten away — it is amended in place**, because
a future reader must be able to see that the order was deliberately reversed twice, not
that someone forgot. The amendment names r3-D1 and both positions.

## Scope, bounded

- **Files:** `src/pages/PlaydateDetailPage.tsx` and any spec that pins the old order.
- **Moved as ONE unit** (the count line must never separate from its control):
  the ping button, the `pingLocationNotice` / `LocationRequiredNotice` conditional, the
  going-count line, the `going-count-unavailable` fallback, `pingError`, and the
  `KidsComingPicker`.
- **NOT moved:** the host's own-post panel (`This is your post`) — A14's `isHost` branch.
  The host cannot ping; that panel's position is a separate question and is out of scope.
- **Not in scope:** r3-4 or later. The e2e environment split is a separate infrastructure
  task and is not pulled in here.
