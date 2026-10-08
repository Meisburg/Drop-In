# The 5-parent first-open test — parked

**Parked 2026-10-07** by the founder: *"not ready to do this now."* The kit is
written and pre-registered; nothing needs building. This file exists so the test
is not rediscovered from scratch, and so the two items it blocks stay visibly
blocked rather than quietly forgotten.

## What it is

Five 20-minute calls (~2 hours total) where a parent opens Drop In cold, with no
instructions, while someone codes their first three actions. It answers one
question no spec can: **does Drop In work for the people it is for?**

## Everything it needs already exists

- **The kit:** `research/first-open-validation/2026-09-29-parent-test-scoring.md`
  — script, observation coding, and pass bars, pre-registered 2026-09-29.
- **The checklist entry:** `docs/RELEASE-CHECKLIST.md` item **1.8** (and 1.7,
  "invite 5–10 parents").
- **A baseline:** `research/first-open-validation/2026-10-05-simulated-panel.md`.

## Why it is parked

Not a technical blocker and not a quality concern — the code is green and pushed.
It needs **five humans**, and the founder is not recruiting right now. The test
costs real social effort; it does not cost engineering time.

## The one thing to check before it unparks

**Can a parent who is NOT on the tailnet open the app?**

Today the only known route is `http://omarchy-2.tail0c686b.ts.net:5173`, which
requires tailnet membership. `vite.config.ts` binds `host: true` and allowlists
`.tail0c686b.ts.net` for exactly that. There is a `vercel.json` (SPA rewrite) but
no deploy confirmed and no tags.

If there is no public URL, **stand up a preview deploy first** — otherwise the
calls cannot happen remotely and every tester must be physically present.

## Blocked on its results — do NOT build these yet

1. **The empty-feed CTA.** Its shape depends on which action testers reach for
   unprompted (create vs radius vs browse).
2. **Interest chips.** Same dependency — the coding table decides what belongs.

Building either before the test runs risks building the wrong thing well.

## The pass bars, copied here so they survive (pre-registered — do not fudge)

| Bar | Definition | Threshold |
|---|---|---|
| B1: first-open problem confirmed | Tester stalls at the empty feed with no next action | 3+ of 5 |
| B2: onboarding validated | Would tap "start one" AND can name what they'd post | 3+ of 5 |
| W: watch-risk | Naturally wants browse over create | any of 5 → first screen changes |

**Observation coding** (5-min zero-instruction block, first 3 actions in order):
`C` create · `R` radius · `B` browse · `S` stall · `L` leave · `T` asks
(record verbatim).

## To unpark

Say "run the 5-parent test." Then: confirm a public URL, recruit 5, run the
calls, score against the bars above, and unblock the CTA + chips with the result.
