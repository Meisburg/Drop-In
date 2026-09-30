# V28 — The First Run (card-by-card onboarding) — summary for product review

**Bottom line:** when a new parent signs up, they now walk a card-by-card setup
(account → name → kids → photo → area), can leave and come back without losing their
place, and land on something real near them. Built, gated, and verified end to end on a
branch. **Not in production.** A human playtest then changed the desired shape — that new
direction is written up below, **decided but not yet built**.

- Base: `e2570c9` (== `origin/master`, the V27 tip)
- Branch: `Meisburg/onboarding` — pushed; **86 commits**
- Size: **96 files changed, +14561 / −2158**
- **Zero migrations** — this batch changes no schema and touches no data model
- Run it: a Vercel **preview** deployment (production is untouched). It is behind Vercel
  Deployment Protection and is reached with a **bypass link** — ask Jon. The secret is
  deliberately not in this repo.

---

## 1. The journey, as built

| | Card | Where | Required? |
|---|---|---|---|
| 1 | **Create your account** — email + password (Google also available) | `/login` | yes |
| 2 | **What should we call you?** — first + last name | `/onboarding` | **yes** |
| 3 | **Who's coming?** — kid first name + age, repeatable | `/onboarding` | skippable |
| 4 | **Add a photo** — the parent's own photo | `/onboarding` | skippable |
| 5 | **Where do you live?** — home address (ZIP as fallback) + radius | `/onboarding` | **yes** |
| ✓ | **You're all set** — a few real places near you | `/onboarding` | the ending |

Each card is labelled `N of 5` so the parent knows how much is left.

**The thing that makes this batch matter:** the parent's location is no longer a gate at
the door. Before V28, a parent with no home ZIP was bounced into setup and could not use
the app at all. Now the **writes** ask, in place, with their own words — you can browse
freely and are only asked for a location at the moment you try to post or RSVP. That
decision is recorded as an ADR (`docs/adr/0001-home-zip-stops-being-a-gate.md`).

**Leaving and coming back is never a restart.** Abandon at card 3, return a day later, and
you resume at card 3 — no re-answering, no duplicate kids. Resume is *derived from the
parent's actual facts*, not from a stored "step" flag, which is why a cleared browser or a
second device behaves the same way. The accepted cost is up to two extra taps.

---

## 2. What shipped (grouped)

1. **The first-run model** — `src/lib/firstRun.ts`: which card comes next for a given
   parent, which cards are skippable, the `N of 5` progress label. Pure functions, sibling
   test, no React.
2. **The cards** — `FirstRunCard` (a shared, presentation-only shell) and the five cards,
   with their words in a module (`firstRunCopy.ts`) rather than hard-coded per screen.
3. **The finish card** — `FinishRunCard` + real nearby places, distance-ranked, up to
   three, with each place's hours.
4. **The gate moved to the writes** — posting and RSVPing now ask for a location in place
   (`LocationRequiredNotice`), including the feed's "nothing nearby" state.
5. **"Has a home ZIP" defined once** — `hasHomeZip()` in `src/lib/homeZip.ts`, used at
   **19 call sites across 7 files**, so the app can never disagree with itself about
   whether a parent has a location.
6. **Two new deterministic guards** — one that catches `expect(...).toHaveCount(0)`
   assertions that cannot actually fail ("vacuous" tests), and one that catches e2e specs
   clicking button names that no longer exist in the source. **Both found real defects on
   their first run** that human review had missed.
7. **The spec/doc cleanup** — stale claims swept, a domain glossary (`CONTEXT.md`), the
   ADR above.

---

## 3. Verification (the evidence)

| Gate | Result |
|---|---|
| `npm run verify` (build + test + lint + a11y + guards) | **pass** |
| Unit/integration | **66 files, 1989 tests** |
| Lint | **0 errors, 81 warnings** (baseline unchanged) |
| End-to-end (Playwright, full suite) | **161 passed, 2 skipped** — 13.2 min |
| Playtest lane (built app in a headless browser) | **9/9 routes, 0 JS errors** |
| CI on the pushed branch | `npm run verify` — **success** |
| Test-data sweep | **1287 marker rows across 13 tables removed; 0 remaining** |

Two known flakes, both confirmed by re-running rather than reasoning: one guard that
occasionally fails on a `/tmp` copy error, and one e2e spec. **A future red on either
should be re-run before it is investigated.**

---

## 4. Decisions made, and which the playtest changed

Settled by a structured Q&A before any code was written (16 decisions). **These still
hold:**

- Purpose is **launch prep**: inviting a first cohort. Not a growth experiment.
- The main job is **"learn about you, then land on something real near you."**
- **Name and location are required; kids and photo are skippable; the account is not.**
- The first run renders **bare** — no navigation, no prompts fighting for attention.
- **Notifications stay owned by the existing push prompt**; the first run does not
  compete with it.
- The ending is **its own card**, not a hand-off to the places directory.
- **Seeding real drop-ins is done by hand, in the app** — by Jon, not by a script. (This
  is what makes the cold start work: a first parent sees real drop-ins, not an empty feed.)
- **The bio drops out of the first run.** It stays editable on the profile.
- Kids are **first name + age only** — a privacy choice, never a full identity.

**The playtest changed the following** (decided, **not yet built** — see §5):

- The standalone **photo card goes away**; the parent's photo moves onto the **name card**.
- The **finish card's "pick a place" list goes away.**
- The **area card gains a map**, so "5 miles" means something.
- The **kids card gains optional kid photos.**
- A **"How Drop In works" card** replaces the finish card's list.

---

## 5. Decided but not built (the next batch)

**The corrected run:**

```
1 of 5   Create your account       email + password
2 of 5   What should we call you?  first, last, YOUR photo
3 of 5   Who's coming?             kid name + age, kid photo (optional)
4 of 5   Where do you live?        address + radius + MAP
All done How Drop In works         Drop Ins / the + button / Places / Inbox
         → into the app
```

The final card is the **app tour**, because nothing like it exists today: after onboarding
a brand-new parent was dropped into a four-tab app with no explanation of what the tabs
are for. It explains *Drop Ins = what's near you · the + = post your own · Places = where
you could host · Inbox = message other parents · Profile = you.*

**Two copy defects found by reading the screen** (real, small, unfixed):
1. On a taken display name the app advises *"try adding a middle name or initial"* — and
   **no such field exists.**
2. The name card says *"A first name is plenty"* directly above a **Last name** field.

**Two new features requested:**
- **Find a parent by name.** You can already message a parent from their page
  (`/u/<handle>` has a Message button) — but there is **no way to find a handle** unless
  someone sends you the link. This is the gap.
- **Partner linking.** Invite a partner by email, or find a parent already on the app and
  link the two accounts as one family.

---

## 6. Product calls worth your eyes

1. **What does linking a partner actually share?** Kids? Drop-ins? Messages? Visibility of
   each other's posts? And what happens on **unlink** — who keeps the kids? This is the
   single biggest unanswered product question in the queue, and it is bigger than the
   screen that triggers it.
2. **Where should "find a parent" live** — the Inbox, or a general search? And should it be
   **global**, or limited to parents you already share a drop-in with? A global name search
   over every parent is a much bigger privacy surface than "people at this drop-in."
3. **Your name is your public handle.** `display_name` is **unique** and is what a public
   profile URL is built from. So the name is an *identity*, not a label — which is exactly
   the tension in "a first name is plenty." What should happen when two parents want the
   same name?
4. **Notification sequencing.** A parent who resumes setup can see a "finish your setup"
   nudge at the same time as a held push-notification prompt. Both are correct alone; the
   collision is filed (`03-resume-nudge-can-co-render-with-a-held-push-note.md`).
5. **The bio column.** The bio is no longer asked for during onboarding but is still
   editable on the profile. Whether the column should be retired is filed as ticket 01.

---

## 7. Gaps and things not done

- **The resume fix is verified by tests but never by a human.** The case "quit at the area
  card, close the browser, come back" has two dedicated tests and both are non-vacuous —
  but the one person who walked the flow went straight through, so nobody has confirmed it
  on a real phone. **This is the batch's main open verification.**
- **A hygiene slice is outstanding:** three exports that are pinned by a test but read by
  nothing; a stale-claim sweep across comments; a small refactor of the card-selection
  logic; one missing edge case in the profile page's photo handling; and a test-setup
  deduplication.
- **Not deployed.** Production is untouched; the batch lives on the branch and a preview.

---

## 8. How to review

1. This file.
2. `plan.md` — the implementation plan, slice by slice, with acceptance criteria and the
   verification command for each.
3. `CONTEXT.md` — the domain glossary (what we call things, and what we deliberately
   don't).
4. `docs/adr/0001-home-zip-stops-being-a-gate.md` — the one architectural decision.
5. `.scratch/v28/ledger.md` — the event log: every slice, every review finding, every
   adjudication and its reason. **This is the honest record, including the mistakes.**

**A note on how this batch was built:** every slice was written by a separate agent,
reviewed by a second agent with fresh context, and then re-checked by a third that ran the
real commands. **24 defects were found in the plan itself, and 3 blocking defects in the
finished code** — the two most serious were both *copy that described something the app
did not actually do* (a nudge that named cards that don't exist; a finish card that
claimed to show nearby places when the list was empty). That pattern is worth knowing about
if you review UI text: **the highest-risk surface in this codebase is a string that
describes what the app is about to do.**
