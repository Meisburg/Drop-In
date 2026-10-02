# Playdate ("Drop In") — the first run: a product review packet

**What this is.** Everything a reviewer needs to judge the new-parent onboarding: what it
is for, every word it shows, screenshots of the real flow on a phone, the decisions behind
it, what has been measured, and the questions that are still open. It is self-contained —
no code reading required.

**How to read it.** Sections 1–3 are the product. Section 4 is why it is shaped that way.
Section 6 is where your opinion is worth the most. Section 7 is the honest defect list.

**⚠️ Read this before reviewing.** There are two states in this document and they are NOT
the same thing:

| | State | What that means |
|---|---|---|
| **v1** — screenshots and words in §2 | **Built, tested, walked on a phone — then SUPERSEDED** | It was real: it shipped on this branch and was walked on a phone. §2 is its record, and its screenshots are v1's. The run no longer has v1's photo card or its places-list ending. |
| **v2** — the shape in §3 | **BUILT — V28 r2 (re-measured 2026-10-02 at `8d1170d`)** | Agreed with the product owner after the playtest, then built in the second half of this batch: the photo moves onto the name card, the kids card gains kid photos, the area card gains a map, and the "How Drop In works" card replaces the places list. **§3 is what the app does now; §2 is the history.** |

**Nothing here is live to the public.** The app in production is an earlier version with no
first-run flow at all.

---

## 1. Why this exists

A parent who signs up for Drop In arrives with one question: *is there anything happening
near me, and can I join it?* The app answers that question with two things it must know
first — **who you are** and **roughly where you live**.

Before this work, a parent with no home location **could not use the app at all**. They were
bounced into a setup wall at the door, before ever seeing whether the product had anything
to offer them. That is the worst possible first impression: you are asked to do paperwork
for an app you have not yet seen do anything.

So this work does three things:

1. **Asks for the essentials in a short, honest sequence** — four small screens, each
   labelled `N of 4`, each one question (v1 had five; V28 r2 deleted the photo card).
2. **Stops the location from being a gate.** Your location is now asked for *at the moment
   you actually need it* — when you post a drop-in or RSVP to one — not at the front door.
   You can browse freely first.
3. **Ends by teaching the app.** The run finishes with a "How Drop In works" card that names
   the four tabs and the centre Post action — v1 ended on a list of real places near you, which
   V28 r2 removed because it promised content the app cannot show on an empty day.

**The business hypothesis:** a parent who is personally set up, standing near something
real, and oriented in the app becomes an active parent instead of a signup that never
returned.

---

## 2. The experience as built (v1)

Real phone screenshots, in walking order, in `docs/design-review/onboarding/`.

### Before anything: the brand moment — `00-brand-splash.png`
The logo on a rust-red field. This is the first painted frame; the app replaces it as soon
as it loads.

### 1 of 5 — Create your account — `01-card1-account.png`

> **Create your account**
> Just your email and password — your name and location come right after.
> `1 of 5`
> [ Continue with Google ]  — or —  Email / Password  [ **Create account** ]
> Already have an account? Sign in

Email and password only, because it is the fastest possible door. **One promise is made
here** — "your name and location come right after" — and the run has to keep it.

### 2 of 5 — What should we call you? — `02-card2-name.png`

> **What should we call you?**
> This is how other parents see you. A first name is plenty — you can change it later in
> settings.
> `2 of 5`
> First name [ Sam ]   Last name [ Rivera ]   [ **Continue** ]

### 3 of 5 — Who's coming? — `03-card3-kids.png`

> **Who's coming?**
> Add the kids who will come to drop-ins. A name and an age are all we ask — it helps
> parents and hosts know who is showing up.
> `3 of 5`
> Kids (first name + age only)   [ Add a kid ]
> [ **Continue** ]   [ Skip ]

**Skippable.** A parent with no kids, or who is not ready to type them in, is not stopped.

### 4 of 5 — Add a photo — `04-card4-photo.png`

> **Add a photo**
> A picture helps parents spot you at the drop-in. Add one whenever you are ready.
> `4 of 5`
> [ Add a photo ]   [ **Continue** ]   [ Skip ]

**Skippable.** The parent's own photo — this is how another parent recognises them at the
park.

### 5 of 5 — Where do you live? — `05-card5-area.png`

> **Where do you live?**
> We use your neighborhood to show nearby drop-ins. An address works best; a ZIP code works
> too.
> `5 of 5`
> Home address [ 730 North 75th Street ]   Radius [ 5 miles ▾ ]   [ **Finish** ]

**Required.** Address-first with ZIP as the fallback. The radius is what the whole feed is
filtered by, so it is asked here rather than buried in settings.

### The ending — v1's `06-finish-card.png` shows the SUPERSEDED card

> `All done` — **You're all set**
> Here are a few real places near you to host a drop-in. Pick one and start from its page.
> `[ three places, distance-ranked, with hours ]`   [ **Go to your feed** ]

That card — and the places read behind it — is GONE (V28 r2 slice 5). v1 ranked real
places by distance and showed the sentence only when the list was genuinely on screen,
which was honest about the list and still wrong about the day: there are zero upcoming
drop-ins for every parent today, so the list was empty and the card fell back to its
honest state on every real screen. The run now ends by teaching the app instead:

> `All done` — **How Drop In works**
> The parts below are how you use Drop In. On a narrow screen they sit along the bottom of
> the screen; on a wider one, down the left side. Here is what each one does.
> **Drop Ins** — browse drop-ins within your radius, soonest first, and ping one to join
> **Inbox** — message the parents you're arranging a drop-in with
> **Post a drop-in** — the + in the middle — put your own on for the neighborhood
> **Places** — look up a playground, a pool, a beach, and pick where to host
> **Profile** — keep you and your kids up to date, and link your partner's account
> [ **Go to your feed** ]

Every line is a capability or a category the app OFFERS. The words live in
`src/lib/firstRunTour.ts`, whose header records the four measurements a line has to pass
(a position that holds in both layouts, a category the directory offers a chip for, a
capability with a driver in the code, and an attribute rows reliably carry), and
`firstRunTour.test.ts` enforces the category rule against the app's own taxonomy.

### Two behaviours that matter more than the screens

- **Leaving is safe.** A parent who quits at card 3 and returns tomorrow lands back on
  card 3 — not restarted, not re-asked, no duplicate kids. This is derived from the facts
  the app already knows, so it also survives a cleared browser or a different device.
- **A gentle nudge, not a wall.** A parent who stopped mid-setup sees one quiet line —
  *"Finish setting up — you stopped in the middle of setup, a minute or two finishes it."* —
  with a Continue that goes to whatever their next card is. It names no card, so it cannot
  go stale as cards change.

---

## 3. What the playtest changed (v2 — BUILT in V28 r2)

The product owner walked the v1 flow on a phone. The flow worked end to end. The review
then changed the shape. **Five changes, all decided — and all five BUILT in V28 r2
(re-measured 2026-10-02 at `8d1170d`):**

1. **The standalone photo card goes away** — the parent's photo moves onto the *name* card.
   One less screen for something the parent will do anyway while they are already typing.
2. **The kids card gains kid photos, optional** — for the same reason: a kid is being added
   right there, and a photo of your child is what another parent recognises.
3. **The area card gains a map.** "5 miles" is an abstraction; a map showing the entered
   address with its radius drawn makes the number mean something.
4. **The finish card's list of places goes away**, and the run instead ends with a
   **"How Drop In works" card.**
5. **Two copy defects are fixed** (see §7).

**The corrected run:**

```
1 of 4   Create your account        email + password
2 of 4   What should we call you?   first, last, YOUR photo
3 of 4   Who's coming?              kid name + age, kid photo (optional)
4 of 4   Where do you live?         address + radius + MAP
All done How Drop In works          Drop Ins / the + button / Places / Inbox / Profile
         → into the app
```

### Why the ending changed — the argument for the tour card

**Nothing in the app explains the app.** A brand-new parent finishes setup and is dropped
into a four-tab interface — **Drop Ins, Inbox, Places, Profile, plus a `+` button** — with
no explanation of what any of them is for. The product owner's words: *they want users to be
able to just go into the app and use it*, with some explanation.

The tour card covers, one line each:

| | What it is |
|---|---|
| **Drop Ins** | what's happening near you — the main thing |
| **`+`** | post your own drop-in and invite the neighborhood |
| **Places** | parks, playgrounds, beaches — where you *could* host |
| **Inbox** | talk to other parents |
| **Profile** | you, your kids, your settings |

It replaces the "pick a place" list, on the judgement that **knowing what the app does is
worth more at that moment than a list of parks** — the parent is about to land on a feed
that already shows nearby activity.

---

## 4. The decisions behind it, and why

Settled before a line was written, by structured Q&A with the product owner.

| Decision | Why it is that way |
|---|---|
| Purpose is **launch prep** — inviting a first cohort | This is not a growth experiment; it optimises for a first real parent having a good first hour. |
| The job is **"learn about you, then land on something real"** | The two halves are both required: setup alone is friction; a real feed alone leaves you unconfigured. |
| **Name and location required; kids and photo skippable; the account not** | You cannot show a parent anything local without a location, and you cannot be a person without a name. Kids and photos are genuinely optional facts. |
| Location **stops being a gate** and moves to the writes | Asking at the front door loses parents who have not seen the product yet. |
| The first run renders **bare** — no navigation, no competing prompts | Every additional thing on screen is a thing to decide about. A first run should ask one question at a time. |
| **Notifications stay owned by the existing prompt** | The app already asks for push permission at a considered moment. The first run does not fight it for attention. |
| **Kids are first name + age only** | A deliberate privacy line: children are never a full identity in this product. |
| **The bio drops out** of the first run | It was asking for writing before the parent had any reason to write. It stays editable on the profile. |
| **Real drop-ins are seeded by hand before invites go out** | The cold-start problem is real: a first parent must land on genuine activity, not an empty feed. Done by a human, in the app — never fabricated. |
| Resume **never restarts** | Losing a parent's work because they closed a tab is a self-inflicted wound. |

---

## 5. What "working" means — the evidence

| Question | Answer |
|---|---|
| Does it build, test, and lint clean? | Yes — **2,068 automated tests** and zero lint errors, measured 2026-10-02 at `8d1170d` (the count moves with every commit; 1,989 was the v1-era snapshot). |
| Does the whole app still work? | Yes — the full e2e lane ran green at v1 (**161 browser tests**), and the suite is now **175 tests across 60 files**, counted 2026-10-02 by enumeration (`npx playwright test --list` — that lists them and runs NOTHING; the v1 number is the one a run produced, and the r2 subset the hygiene slice ran is listed in its own report, not here). |
| Did a real person walk it? | **Yes — v1's five cards plus its finish card**, on a phone, by the product owner (that is the walk §2's screenshots record; **r2's four-card run has not been walked by a human** — see the open question below). |
| Do any screens throw errors in a real browser? | No — **9/9 routes, zero JavaScript errors**. |
| Is the ending honest? | Yes — and since V28 r2 the question is moot: the places claim and the list behind it both left the run (the ending is the "How Drop In works" card, §3). v1 made the claim conditional on the list, which was a *found and fixed* defect, not an assumption. |
| Did anyone get stuck? | No wall, no dead end — but see the gap below. |

**The one thing nobody has confirmed:** the *quit-halfway-and-come-back* behaviour is
covered by two dedicated automated tests, but **no human has ever exercised it** — the
person who walked the flow went straight through. It is the batch's known open
verification, and it is stated here rather than rounded up to "verified."

---

## 6. Open questions — where your opinion is worth the most

> **Correction, and it is the most useful finding in this document.** An earlier draft of
> this packet assumed two capabilities were missing. **Both already exist and are in the
> shipped app:**
>
> | Capability | Status | Where it lives today |
> |---|---|---|
> | **Find a parent by name** | **Exists** | Inbox → **New message** → a field reading *"Search by name…"*. You can search any parent by name and message them. |
> | **Partner linking** | **Exists, in full** | Profile page: invite a partner by name search or by `@handle`, they accept or decline, and either side can unlink. Includes a rule limiting an account to one active partner. |
>
> Neither is discoverable. A parent who has not been told will not find either one. **That is
> the actual gap** — and it is the same gap as the tour card in §3, not a missing feature.

1. **So the real question about partner linking is a policy one.** The mechanism is built;
   what was never decided is **what linking is *for***. If two accounts are linked, do they
   share kids? Do their drop-ins become one family's? Can they see each other's messages?
   And on unlink — who keeps the kids? Today linking changes the *profile page* (both parents
   appear); it does not obviously merge anything else. **Decide what linking should mean
   before exposing it more widely** — a discoverable feature with undefined semantics is
   worse than a hidden one.

2. **Should name search stay as open as it is?** It currently searches **every parent on the
   app** by name prefix. Options range from leaving that as-is, to narrowing it to **"people
   at this drop-in"** (much smaller privacy surface, still solves the real use case), to
   making people opt in to being findable. This is a real trade-off for a product whose
   promise is that children are private — and it is the parent's name that makes them
   findable, which is exactly why "a first name is plenty" (§7) is the wrong instinct.

3. **A parent's name is their public identity.**
   The name is unique and is what their public profile link is built from. So it is an
   *identity*, not just a label — which is exactly the contradiction in the v1 line "a first
   name is plenty" sitting above a **Last name** field. What should happen when two parents
   want the same name? Is a last name required, optional, or hidden from other parents?

4. **Sequencing of asks.** A parent resuming setup can see the "finish setting up" nudge at
   the same moment as the push-notification prompt. Each is right alone; together they
   compete. Filed, not fixed.

---

## 7. Known defects and gaps

**Defects in the words — the highest-risk surface in this product.** Every serious bug
found in this batch was *copy that described something the app did not actually do.* **All
six are fixed, the last four of them in V28 r2** (re-measured 2026-10-02 at `8d1170d`):

| # | The app says | The truth | Status |
|---|---|---|---|
| 1 | *"try adding a middle name or initial"* (when a name is taken) | **There is no middle-name field.** It advised a slot that does not exist. | **Fixed** — the message now says *"is already taken — try a different first or last name"* (`OnboardingPage.tsx`) |
| 2 | *"A first name is plenty"* | Sat directly above a **Last name** field, contradicting the form under it. | **Fixed** — v2 rewrote the name card's body to say what the name is FOR (`firstRunCopy.ts`) |
| 3 | The copy module said the skip button reads *"Skip for now"* | **The app rendered "Skip".** The module was supposed to be the one place the words live, so it was lying about a word the parent sees. | **Fixed** — V28 r2 slice 6a made the field a prop the chrome renders verbatim, and its value is the rendered word (`firstRunCopy.ts` + `FirstRunCard.tsx`) |
| 4 | A nudge named cards that did not exist | Fixed. | Fixed |
| 5 | A finish card claimed "real places near you" above an empty list | The claim went conditional, and then the claim AND the list both left the run in V28 r2 slice 5 — the ending is the "How Drop In works" card. | Fixed |
| 6 | Some automated tests asserted things that could not fail | Fixed — plus a guard so that class of test cannot recur. | Fixed |

**Gaps:**
- **Two built features are effectively invisible.** Finding a parent by name and linking a
  partner both work today and are not discoverable (§6). Nothing new needs building for
  either one to be *usable* — it needs surfacing and explaining.
- **The resume behaviour is unconfirmed by a human** (§5).
- **Nothing is live.** Production runs an earlier version with no first-run flow.
- **The app tour is built but NOT live** — the "How Drop In works" card ships in the first run
  (V28 r2 slice 5, `src/lib/firstRunTour.ts`); production still runs the earlier version with no
  first-run flow at all, so the orientation gap the product owner identified is still open for
  every parent using the live app.

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **Drop In** | The product. Also: a single playdate invitation — a time, a place, and who is coming. |
| **Host / Parent** | The two roles. A host posts a drop-in; a parent sees it and RSVPs. Anyone can be both. |
| **The first run** | This onboarding sequence. |
| **The finish card** | The last screen of the run. |
| **Radius** | How far a parent is willing to travel; filters the whole feed. |
| **Place** | A real venue (park, playground, beach) from a curated directory — where a drop-in can be hosted. Not a drop-in itself. |
| **Seeding** | Planting genuine drop-ins by hand before inviting parents, so nobody's first visit is empty. |

---

## 9. What kind of feedback helps most

Useful: **the words** (anything misleading, unclear, or too long), **the order** (is
`account → name → kids → area → tour` right?), **what is required vs skippable**, **the
privacy posture** (names, kids, photos, search), and **answers to §6** — especially partner
linking.

Less useful: implementation detail. The engineering record (plan, decisions, evidence) is
`plan.md`, `V28-BATCH-SUMMARY.md` and `.scratch/v28/ledger.md` in the same repository.
