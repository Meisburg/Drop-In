# 02 — The `/new` form loses its values across the onboarding hop

**Filed:** V28, during Slice 2a. **Status:** known limitation, accepted by default
(the orchestrator recorded it after the question went unanswered; reversible —
say the word and it becomes a fix).

## What happens

1. A parent with no home ZIP opens `/new` and fills in the post form.
2. They tap Post. Slice 2a's guard blocks the write and shows
   `LocationRequiredNotice`, whose action leads to `/onboarding`.
3. They set a location, come back to `/new` — **the form is empty.**

## Why

The form's values are component state seeded from defaults; navigating to
`/onboarding` unmounts `NewPlaydatePage`, so the state is gone. The notice reads
as "go set a location and come back", but "come back" silently means "and type it
all again."

## Why it was accepted rather than fixed in this batch

- It costs the parent one re-entry, and only in the no-zip case — which is a
  brand-new signup, who is about to be walked through the cards anyway
  (Slice 3b): the interview is where the zip gets set, so the ordinary path never
  reaches the blocked state at all. The blocked state is the *recovery* path.
- Fixing it properly means persisting draft form state across a route change —
  a real design decision (sessionStorage draft? a modal instead of a hop?), not a
  one-line patch, and it touches `NewPlaydatePage.tsx` which is already Slice 2a's
  most complex file.
- The honest cheap alternative — replacing the hop with an inline location field
  — is a **product** change, not a defect fix, and would duplicate the area card.

## If it is ever fixed, the shapes are

1. **Draft persistence** — key the form's state into `sessionStorage` on the way
   out, re-seed on the way back, clear on a successful post.
2. **Inline location capture** — the notice grows a ZIP field and the write
   proceeds in place; no hop, nothing to lose.

Option 2 is the smaller change and removes a navigation, but it creates a second
place a home ZIP can be set, which V28 spent Slice 2a consolidating.

## Evidence

`src/components/LocationRequiredNotice.tsx` (the action's `Link to="/onboarding"`);
`src/pages/NewPlaydatePage.tsx`'s form state and the guard at ~line 1131;
flagged by the Slice 2a builder in its own report, not discovered in review.
