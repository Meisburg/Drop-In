# First-open parent test — scoring kit (pre-registered 2026-09-29)

## Question
When a brand-new parent opens Drop In with no nearby Drop Ins, what do they naturally want to do next?

## What we already know (do NOT re-test)
- Production feed is genuinely empty (team swept test fixtures out of prod). That's the state every tester hits. Not a bug.
- Signup→ZIP break ("asked location twice") was found and fixed in the last audit batch.
- App is privacy-first: nothing visible pre-signup. First open starts at "create account," so this test doubles as the onboarding test.
- Current first screen (verified in code): empty radius state — "No Drop Ins yet in 25 miles" with radius expander (50/75/100) + secondary "See what's around" → browse tab. Plus a create (+) affordance.

## Pass bars (pre-registered, do not fudge)
| Bar | Definition | Threshold |
|---|---|---|
| B1: first-open problem confirmed | Tester stalls at empty feed with no next action (no tap, no radius expand, no browse) | 3+ of 5 |
| B2: onboarding validated | Tester would tap "start one" AND can name what they'd post | 3+ of 5 |
| W: watch-risk | Tester naturally wants "show me good activities near me" (browse) over create | any of 5 → first screen changes, spec waits |

## Observation coding (5-min zero-instruction block)
Record the tester's **first 3 actions in order**, each coded:
- `C` = taps create (+) / start-a-drop-in
- `R` = expands radius
- `B` = opens "See what's around" / browse
- `S` = stalls (watches, scrolls, silent)
- `L` = leaves / "this is empty"
- `T` = asks a question (note the wording verbatim)

Also record: time-to-understand (when did they say what a Drop In is, in their words; 30s bar = Q1).

## Script (tightened)
1. **Warm-up (2 min):** "Tell me about your kids and where you usually take them on a weekday."
2. **Hand over, zero instructions (5 min):** "This is an app I'm working on — poke around, think out loud." Silence. Code first-3-actions per table above. Watch: 30s comprehension; reaction to empty feed; does the radius expander or browse tab grab them before create does?
3. **Real-behavior probe:** "When did you last actually try to find a playdate or activity? What did you do?" (past behavior only — never "would you use this")
4. **Empty-feed probe:** "Say you come back tomorrow and it still looks like this. What do you do?" Listen for: start something / wait / close it.
5. **Stimulus (2 min):** "After signup it says you're the first parent in your area and hands you a pre-filled start-one flow." Tap it? Helpful or homework? (Exact wording matters — "first parent here" vs "start a Drop In" can be A/B'd across the 5 testers: use each framing with 2–3 different testers so we know which reads better.)
6. **Close:** "What would make you come back a second time?" + "Who else should I ask?"

## Changes from Product's original script
1. Added `R` and `B` to observation coding — the current UI already offers radius expand + browse, so those are real observed behaviors, not hypotheticals. If `B` shows up unprompted, watch-risk W is triggered by evidence, not by a question.
2. A/B the stimulus wording across testers (2–3 per variant) — 30 seconds of extra setup, tells us which of "first parent here" / "start a Drop In" reads as less homework.
3. Q1 (30s comprehension) is read from the handover block, not a separate question.

## Desk research baseline (2026-09-29, Exa + web)
Confidence labels: H = 3+ independent sources, M = 2, L = 1.

- **[M] The job is "get the first move made, with low awkwardness."** Parents currently text the mom of a daycare friend; it's described as "more stressful than dating," with ghosting as the norm. One parent in a wide thread explicitly asked for a "playdate Tinder… Kinder. I interact with people online far easier than in person." (mother.ly recap of Reddit thread)
- **[M] Fallbacks are low-tech:** age-cohort WhatsApp groups ("Fall/Winter 2025 Babies"), library story-time, daycare meet-ups described as "flawed crapshoots." Proximity dominates: a 25-min drive is "a schlep," a walkable block is the unit. (Bustle)
- **[M] Closest category: Pogo (37K reviews) is matching/scheduling, not creation.** BeeKyn (small, 4.9) also matching + scheduling. Nobody in the top results leads with "host an open playdate." Interpretation: "start a Drop In" is a create/host frame the category hasn't claimed yet — could be the differentiator, or the homework trigger. The test decides.
- **[L] One parent article (ShunChild) is generic content-farm material. Discarded.**

## Interpretation (to be confirmed or killed by the test)
- The "homework" risk is real if the host frame doesn't map to how parents already think (they *request* playdates, they don't *host* them). If 3+ of 5 stall (B1) and fewer than 3 tap create (B2), the first screen should lead with **zero-dependency value** — curated local activities ("See what's around" made the hero) — with start-a-drop-in as a secondary CTA.
- If B2 passes and W doesn't trigger, spec the empty state as: "You're the first parent here" + pre-filled start flow, exactly as in the stimulus.

## Who does what
- Jon: recruit 5 parents (kids ~0–6, not in beta), $25 gift card. Run the calls (~20 min each, tester's own phone) or hand to me.
- Research (me): scoring. Send me the recordings/notes → I score against the pre-registered bars, write the synthesis + what it means for the first screen, and update this file.