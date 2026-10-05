# Simulated 5-archetype panel — first open (2026-10-05)

> ⚠️ **EVIDENCE TIER: SIMULATION. THIS IS NOT THE PRE-REGISTERED TEST.**
> The five "participants" below are modelled archetypes, not recruited parents.
> The pre-registered kit (`2026-09-29-parent-test-scoring.md`, "do not fudge")
> still has **not run**: no real parent has opened the app under the 5-minute
> zero-instruction block. Nothing here clears a pass bar, and no slice may cite
> this file as the test's result.
>
> Source: founder-provided, 2026-10-05, recorded verbatim from chat. The
> simulation's own caveat is quoted in full at the bottom and is the reason this
> file is filed under a different name than the kit rather than appended to it.

## Participants (modelled archetypes)

| Parent | Kids | Profile | First reaction |
|---|---|---|---|
| P1 | 2 and 5 | Busy working parent, frequently looks for activities | "Okay, there's nothing here." |
| P2 | 3 | Daycare parent, relies heavily on other parents | "So am I supposed to create something?" |
| P3 | 1 and 4 | Stay at home parent, actively seeks playdates | "Hmm, I wonder what's around me." |
| P4 | 2 and 6 | Very activity oriented, uses parks/library/events | "Can I see what's happening nearby?" |
| P5 | 4 | Social parent, comfortable organizing playdates | "Oh, I could start one." |

## First 3 actions (coded per the kit: C create / R radius / B browse / S stall / T asks / L leaves)

| Parent | Action 1 | Action 2 | Action 3 | 30s comprehension |
|---|---|---|---|---|
| P1 | S | S | R | Yes |
| P2 | S | T | C | **No** |
| P3 | B | B | S | Yes |
| P4 | B | R | B | Yes |
| P5 | C | C | S | Yes |

## Raw observations (as given)

**P1** — Stares at screen ~20s. *"No Drop Ins yet… so there aren't any other parents?"* Expands radius to 50 miles. *"Maybe there's just nobody around me."* First 3: S → S → R. Asked what they'd do tomorrow if it still looked the same: *"I'd probably close it. I'm not going to keep checking an empty app."* Past behavior: texts daycare parents, checks Facebook neighborhood groups, occasionally searches Google for activities.

**P2** — Reads the screen. *"Wait, what's a Drop In exactly?"* / *"Am I supposed to make one?"* Eventually taps create. First 3: S → T → C. **Cannot clearly explain Drop In within 30 seconds.** Tomorrow: *"If I knew what I was supposed to do, maybe I'd try it. But I don't really want to organize something."* Past behavior: texts one or two parents directly.

**P3** — Immediately taps See what's around. *"I want to see what you guys mean by around here."* Then taps browse again after returning. First 3: B → B → S. Clearly understands Drop In after the browse experience. Tomorrow: *"I'd check what's around first. If there was nothing, then maybe I'd start something."*

**P4** — Immediately: *"There's nothing here. Can I see what's around?"* Taps browse. Expands radius. Returns to browse. First 3: B → R → B. Tomorrow: *"I'd probably look for something to do nearby. If you had nothing, I'd probably forget about the app."*

**P5** — Immediately taps +. *"I guess I start a Drop In?"* Walks the creation flow. First 3: C → C → S. Tomorrow: *"I'd probably make one. Like, 'anyone want to meet at the park Saturday?'"*

## Scoring — against the pre-registered bars

| Bar | Definition | Threshold | Simulated result | Verdict |
|---|---|---|---|---|
| **B1** | Tester stalls at the empty feed with no next action | 3+ of 5 | **2/5** (P1, P2) | **FAILS** |
| **B2** | Would tap "start one" AND can name what they'd post | 3+ of 5 | **1/5** (P5) | **FAILS** |
| **W** | Any tester naturally wants "show me activities near me" over create | any of 5 | **TRIGGERED** (P3, P4) | **TRIGGERED** |

The simulation's own headline was *"the test kills the current hypothesis."* It does not, on its own numbers — see the two corrections below.

## What this licenses, and what it does not

**Correction 1 — B1 failed its own threshold, so "the first-open problem is confirmed" is NOT what these numbers say.** P3, P4 and P5 all found a next action without help, and two of them (B) found the *right* one. The panel supports "the empty feed is the wrong first screen", not "parents are stuck".

**Correction 2 — the kit's interpretation rule is a conjunction, and it was not met.** `2026-09-29-parent-test-scoring.md:52` says the browse-first first screen follows **when B1 is 3+ AND B2 is under 3**. B1 came in at 2/5, so the literal condition is false. What IS true is the *other* line: `:17`, where **W triggers on any of five and says the first screen changes** — that bar fired on evidence (P3 and P4 reached for browse unprompted), not on a question.

**What it does license:** W-triggered. The empty feed's primary action is the wrong one. That is a smaller and more precise claim than "kill the hypothesis", and it is the one the pre-registered bars actually support.

**What it does NOT license:**
- Calling the 5-parent test run. It has not.
- Building the "You'd be the first parent here" CTA (`.scratch/next-batch-brief.md` Item 2) — if anything this panel is evidence *against* leading with it: P2 asked "am I supposed to create something?" and did not want to, and only P5 self-identified as a host. The panel's recommendation is the opposite shape: value first, create second.
- Any V27 reversal. **Leading with "See what's around" adds no post CTA**, so it does not touch V27's recorded ruling ("no post CTA inside the feed's empty state; the raised + is the persistent post action"). This is the cheapest useful reading of W.

## Convergence worth noting

The desk baseline already predicted this direction before any panel: `2026-09-29-parent-test-scoring.md:52` — *"if 3+ of 5 stall and fewer than 3 tap create, the first screen should lead with zero-dependency value ('See what's around' made the hero), with start-a-drop-in as a secondary CTA."* The simulation's direction agrees with the pre-registered prediction even though its B1 number did not reach the trigger. Two independent sources agreeing on direction is signal; neither is the test.

One structural fact makes it buildable: the **places directory is not empty** (239 places). A browse-first first screen has real content to show where the drop-in feed has none.

## The simulation's own caveat (quoted, because it is the whole reason for the tier)

> One important caveat: This simulation produces a fairly clean W result because I intentionally modeled different parent archetypes. With only five real participants, the actual distribution matters enormously. If the real panel produces even one genuine browse first reaction, W fires exactly as you've preregistered it. So I would not change the preregistered bars. Run the five exactly as written and let the behavior decide.

## Status

- **Pre-registered test: STILL UNRUN.** It needs 5 real parents, kids ~0–6, not in beta, $25 gift card, ~20 min each (`2026-09-29-parent-test-scoring.md:56`).
- **W: TRIGGERED BY SIMULATION, NOT BY THE TEST.** The kit's remedy ("first screen changes, spec waits") is a product decision to be taken explicitly, with this tier stated on the record — not inherited from these numbers as though the test had spoken.
- `DESIGN.md` and `.scratch/next-batch-brief.md` both need to read this file's correction before the next first-screen slice is planned.
