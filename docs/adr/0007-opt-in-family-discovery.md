# ADR 0007 — Opt-in local family discovery: a recommendation, not a build

**Status:** Proposed. **Date:** 2026-10-09.
**Annotation:** `muzka6tz` session, the v37 parent usability review — *"Longer term,
opt-in local family discovery with broad child age ranges could help parents find
compatible playmates without exposing extra child details."*

**This ADR builds nothing.** It is the document the founder decides *from*. No
schema, no route, no field, no copy, and no test is proposed here as a deliverable;
§7 names what would have to be true before a line of code is written, and that
includes a child-safety review this project has never done.

Read with: `docs/adr/0005-groups-are-private-and-own-their-drop-ins.md` (the
private-group standard this must not undercut), `CONTEXT.md` (the glossary — its
terms are used verbatim below), and `docs/specs/groups-v1.md`.

---

## 1 — The problem, as measured

The v37 review put the cold start in the founder's own words:

> *"The biggest gap is the cold start: the drop-in feed was empty at 1, 20, and 35
> miles, so a new parent may find a park but still not find another family to
> meet."*

The measured state behind that sentence: **234 places, 151 of them playgrounds, and
zero drop-ins.** The directory has supply. The families do not appear.

Today there is exactly one path from "a parent is here" to "two parents meet": one
of them **hosts a drop-in**, and the other finds it. Hosting is the whole bridge, and
it has a cost the app cannot pay down — the first host is posting to an audience of
nobody. Slice A of this batch (`docs/adr`-adjacent, the empty-feed launchpad) lowers
the *cost* of being that first host, and that is worth doing. It does not change the
arithmetic: **if hosting is the only bridge, every meeting requires someone to go
first, alone, in public.** That does not scale, and it is not a UI problem.

The founder's proposal is the obvious next bridge: let parents who want to be found
find each other **directly**, without an outing as the excuse.

That is a materially different product. Every surface Drop In ships today is
**content-first**: a parent sees a drop-in, a place, a review — never a family
standing alone. Discovery would be the first surface whose unit is a *family*, and
the first that shows a parent to someone who was not already looking at, or
attached to, something. The privacy posture has to be re-derived, not inherited.

---

## 2 — What "opt-in" means, in one sentence a parent would understand

**Nothing about your family is findable unless you switch discovery on, and if you
do nothing at all, nothing changes.**

The default is **off**, and off is the default for every existing parent and every
new one. A parent becomes findable only by taking an explicit action in Settings —
turning on a switch that says what will be shown — and they can turn it off again at
any time, which removes them from discovery on the next read.

**What a parent must DO to be findable:** open Settings, turn on *Let nearby
families find us*, and confirm the exact card that switch will show (the §3 list,
rendered). Two deliberate frictions, both non-negotiable:

- **The switch is not a checkbox in a signup flow.** Discovery is not a
  first-run question. A parent who is being asked about discovery has not yet seen
  the app, does not know what a drop-in is, and cannot consent meaningfully to being
  shown. It is a Settings decision, made by someone who has used the product.
- **The confirmation shows the card, populated, before it is live.** "Opt in" has to
  mean "I saw what you will show about me", not "I ticked a box".

**What happens if a parent does nothing:** they are invisible to discovery,
permanently, with no nag. They can still host, still RSVP, still browse, still use
groups. Discovery is additive or it is not worth having.

**A term the glossary does not hold.** This ADR needs a word for "a parent who has
turned discovery on and is therefore findable". The glossary's nearest terms are
wrong: **Parent** is "the adult using the app" (too broad — most parents are not
findable), and **Member** is already taken by groups ("a parent who belongs to a
group"). I am therefore **not inventing a synonym here**; throughout this document I
write the plain phrase *"a discoverable parent"*. If this is ever built, the term
belongs in `CONTEXT.md` first, as its own ADR-or-glossary edit, not smuggled in by a
feature slice.

---

## 3 — What is exposed, exhaustively

⚠️ **This list is the consent card and the privacy policy's new paragraph.** If a
field is not on this list, discovery does not show it. The list is closed: adding a
field is a new privacy decision, not a UI change.

| # | Field | Why it is necessary | Why it is not more |
|---|---|---|---|
| 1 | **Display name** | The parent must be addressable. It is already what the inbox and every drop-in show. | No first/last split, no email, no handle. |
| 2 | **Broad child age band** (see below) | The entire point of the feature — "do our kids overlap?" — answerable without saying who the kids are. | **Never a date of birth. Never a child's name. Never a child's photo. Never a count of children.** |
| 3 | **Approximate area** | Compatibility is local by definition; a family 40 miles away is noise. The unit is the **home zip's neighborhood name, or the zip itself** — never coordinates, never a street, never a radius. | The home zip is already private (glossary: *"Never shown to another parent"*). This shows an **area**, and the parent sees this exact granularity on the consent card before switching on. |
| 4 | **A one-line "what we're into"** | The thing that turns a match into a message: "toddler + a 6yo, we're at the wading pool most mornings." Free text, parent-written, optional. | Optional means optional: empty renders nothing, never a placeholder. |
| 5 | **A contact affordance** | A match with no way to reach out is not a feature. v1 offers **"ask to connect"**, which sends a message request the other parent may ignore. | ⚠️ **No direct contact details, ever.** Not in v1, not behind a flag. The inbox is the only channel, which is what makes "ignore" a real act. |

### The banding scheme, and why this one

**Bands, not ages. Four bands, fixed, wide, and overlapping:**

| Band | Label shown |
|---|---|
| 0–2 | *Babies & toddlers (0–2)* |
| 3–5 | *Preschool (3–5)* |
| 6–9 | *School age (6–9)* |
| 10+ | *Older kids (10+)* |

A family with several children shows **the band that covers all of them** — a
2-year-old and a 7-year-old shows `0–9` as *"Babies & toddlers through school age"*,
a single wide span rather than two facts. The band is **derived, never typed**: a
parent states their kids' ages once, on their own profile, as they do today, and the
band is computed.

**Why wide and overlapping rather than exact:**

- **A band is not an identifier.** An exact age plus an area plus a school-age child
  is close to a description of a specific child. "6" in Ballard with a first name is
  re-identifying; "school age (6–9)" is not. The band is the smallest unit that
  answers the compatibility question without narrowing to a person.
- **Wide bands are stable, so they leak less over time.** A child's exact age is a
  fact that changes every year and pins a birth year to within twelve months. A
  0–2 band covers three years and stops being informative the moment a child leaves
  it.
- **Overlap is the feature.** Parents do not need a match, they need an *intersection*
  — "is there a kid in the same rough place as mine?" Overlapping bands answer that,
  and the overlap is exactly the information a narrower scheme would over-deliver.
- **Four is a vocabulary, ten is a database.** Ten single-year bands is an exact age
  wearing a costume; four is a thing a parent can hold in their head and compare at
  a glance.

**The band is the only child fact. Nothing else about a child crosses — not a name,
not a photo, not an exact age, not a count, not a school, not a birthday.** That is
the line the current privacy policy already draws (*"Your children are identified by
first name and age only. There are no public kid profiles."*) and discovery must
draw it **tighter**, because today a name and age appear only in the context of a
drop-in a parent chose to open. Discovery shows a family to a parent who was looking
for nothing in particular.

---

## 4 — What is deliberately NOT built in v1

⚠️ **This is the point of the document.** Every item here is an attraction the next
version will want, and each is declined for a stated reason.

- **Free-text search of families.** A text box over family descriptions is a
  search engine over children's data. It invites scraping, it makes the corpus
  queryable in ways the consent card did not describe, and it turns "what we're into"
  into a field parents learn to keyword-stuff. Declined: it converts a
  consent-governed surface into a queryable one.
- **A browsable directory of discoverable families.** Scrolling a list of families
  is the exact "public kid profile" the privacy policy promises does not exist. v1
  shows *matches against a stated compatibility question*, not a catalogue. Declined:
  a directory has no natural stopping point and no consent boundary.
- **Exact ages, birthdays, or ages on the child's card.** See §3. Declined: an exact
  age plus an area is a partial identifier.
- **Direct messaging from discovery.** v1 offers "ask to connect"; the conversation
  happens in the existing inbox, which already has the repo's blocking and reporting
  surface. Declined: a second message channel is a second place to moderate, and the
  first one already exists and works.
- **Contact details of any kind — email, phone, social handles.** Declined without
  qualification. Handing a stranger a parent's contact details is the harm this
  whole design is arranged to prevent.
- **Photos of children.** Already true app-wide (kids appear by first name and age
  only) and it stays true here. Declined: no consent UI makes a child's face safe to
  serve to a searching stranger.
- **Any "compatibility score", match percentage, or ranking by family.** A score
  implies the app has judged fitness, which it has not; it also creates a pressure to
  optimize a listing. Declined: the app does not know whether two families will get
  along, and pretending otherwise is a lie with a number on it.
- **Discovery inside groups, or discovering a group.** Groups are private,
  invite-grown and not discoverable (ADR 0005, and the glossary's **Group** entry).
  Discovery must not become the back door that makes a private group searchable.
  Declined for v1, and the §5 note says why it is a one-way door.
- **Bringing discovery into the first run.** Declined in §2: consent to be shown
  cannot be given by someone who has not seen the product.
- **A "nearby families" count or heat map.** A count per area over a small
  population is close to naming the families in it. Declined: the aggregate leaks
  what the rows would have.
- **A weekly digest, "families like yours", or any push.** Declined: a notification
  is the app reaching out on a child's behalf, and it is the fastest way to make
  discovery feel like a dating product.
- **Discovery for signed-out visitors, or for anyone without a profile.** Nothing in
  Drop In is visible without an account; discovery is not the exception.

---

## 5 — Safety and privacy failure modes

**Who could be harmed, and which field does the harm.** "Less likely" is not "safe";
this section exists so the mitigations are named rather than assumed.

| Harm | How it happens | Which field makes it possible | What makes it less likely |
|---|---|---|---|
| **A child is identified.** | A band + an area + a distinctive one-line description narrows to one family, especially in a small neighborhood. | The band **only in combination** with the free-text line and the area. | Bands are wide and overlapping; the free-text line is parent-written and optional; the area is a neighborhood, not a pin. ⚠️ **The combination is the risk, not any one field** — this is why §3 caps the list and why the free-text line needs a review of its own before it ships. |
| **Grooming: an adult reaches a child by reaching a parent.** | An adult presents as a parent, matches on a child's band, and routes to the inbox. | The contact affordance (#5) plus the band. | No child ever has an account or a channel; contact is adult-to-adult; the request is ignorable and the existing block/report surface applies. ⚠️ **This is the single most serious risk in the document** and the reason §7 requires a child-safety review by someone qualified to run one — not by this codebase's reviewers. |
| **A parent is stalked or harassed via discovery.** | An ex-partner, or a stranger, matches repeatedly and locates a family through successive area+band combinations. | Area (#3), and the ability to re-query. | The area is coarse and fixed (it does not get finer on repeat), the connection is parent-initiated, blocking exists. ⚠️ **Mitigations are partial**: a determined actor with several accounts is not fully answerable in v1. |
| **A family is found who did not mean to be.** | A parent forgets they switched discovery on, or switched it on while exploring. | The switch itself. | The default is off; the switch is in Settings (not signup); the confirmation shows the live card first; turning it off removes them on the next read. ⚠️ **The residual risk is memory** — a parent who opts in once and forgets. Nothing in v1 solves that, and it is an argument for the switch being easy to find again. |
| **A child's data is scraped in bulk.** | Discovery is automated against, and the families become a dataset. | Any field, in aggregate. | Signed-in-only; no directory to enumerate; no free-text search; coarse fields. ⚠️ **Not solved**, only made expensive. Rate limiting and anomaly detection are the real answer and are not designed here. |
| **A private group becomes discoverable.** | Discovery is pointed at group membership, or a group's drop-ins leak into a discovery read. | Groups, if discovery ever reads them. | v1 does not touch groups. ⚠️ **This is a one-way door**: a group that has ever been discoverable can never be made private again in the memory of its members. Treat any future proposal to connect discovery to groups as a new ADR. |
| **A "compatibility" claim is read as a safety claim.** | Parents infer that matching means the app has vetted the families. | The product's framing. | No score, no badge, no verification claim anywhere in the feature. The app knows nothing about any family but what that family typed. |

**One thing this feature cannot fix, stated plainly:** every mitigation above
reduces the *rate* of a harm. None of them removes the underlying exposure that a
surface whose unit is a family shows families to people who were not looking for
them. That is a product-level exposure the founder is choosing knowingly, or is not.

---

## 6 — Options, ranked

### Recommended — **Option 1: Band-and-area matching behind an explicit Settings opt-in, with no browse surface and no direct contact.**

The parent flips one switch (default off), confirms the exact card, and thereafter
appears in *match results* for other discoverable parents whose stated interest
overlaps their child band — one match at a time, not a list. Contact is "ask to
connect", which lands in the existing inbox.

- **The tradeoff, named:** this is the **most conservative** option and it will feel
  slow. Its discovery surface is deliberately not a place to linger, so it will not
  produce the "oh, there are families here" moment a directory would. It buys
  safety with usefulness, and it may be too little to move the cold start at all.
- **Why it is first anyway:** it is the only option where a parent who does nothing
  is unaffected, a child's identity is not derivable from the exposed set, and a
  private group cannot be reached. The cold start is a real problem; it is not a
  reason to open the wrong door first.

### Option 2 — **The same, plus a browsable directory of discoverable families, area-filtered and paginated.**

Everything in Option 1, and additionally a screen listing discoverable families near
you, with the §3 fields and no search box.

- **The tradeoff, named:** a directory is what makes discovery *feel* like a feature,
  and it is also a public kid profile with a different name — the thing the privacy
  policy currently promises does not exist. It would require rewriting that promise,
  and the rewrite is the decision, not the screen.

### Option 3 — **Invite-only discovery: a parent can only be found by someone they already know, one hop out.**

A parent opts in and becomes findable **only to parents they already have a group
or a drop-in in common with**. That is an invitation graph rather than a discovery
surface.

- **The tradeoff, named:** this is barely discovery, and it does not answer the cold
  start — a new parent knows nobody, so an invite graph gives them nothing on day one.
  It may be worth building anyway, because it is cheap and safe, but it is not what
  the founder asked for.

**What I would not do at all:** ship Option 2 first. The directory is the version
that will be asked for, and it is the one that changes the privacy promise.

---

## 7 — What would have to be true before this is built

Preconditions, in order. **None of these is a ticket, and the first one is not
optional.**

1. **A child-safety review, by someone qualified to run one, before a line of code.**
   Not a code review by this repo's reviewer lane, and not a security checklist by an
   agent. Discovery of families with children is the highest-consequence surface this
   product could ship; a person with child-safety expertise must read §3, §4 and §5
   and either bless the design or change it. **If this cannot be arranged, the feature
   does not ship** — including the conservative Option 1.
2. **The privacy policy is edited first, not last.** The current promise — *"Your
   children are identified by first name and age only. There are no public kid
   profiles."* — is compatible with Option 1 and incompatible with Option 2. The
   document that states the promise is the document the decision is about.
3. **The founder decides this is the product.** Discovery changes what Drop In *is*
   from "a place to find outings" to "a place to find families". That is a bigger call
   than any ADR, and this document is an input to it, not a substitute for it.
4. **The term enters `CONTEXT.md`.** "Discoverable parent" (or whatever the founder
   prefers) becomes a glossary entry, with its own `_Avoid_` line, before the first
   identifier using it is written.
5. **A measured answer to "does this actually help the cold start?"** Option 1's
   match surface should be prototyped and shown to real parents *without a database
   behind it* — the question is whether a match is enough to start a conversation, and
   that is a question screenshots can answer for free.

   ✅ **ANSWERED 2026-10-09.** The prototype shipped (V38-A): a DEV-only mock at
   `src/dev/DiscoveryMock.tsx`, hardcoded fixtures, absent from the production bundle
   (verified by a dist grep for the fixture name and the module identifier — both clean).
   It was shown to parents, and **the answer was yes: most said they would send a
   message from that screen.** The match surface is legible and a parent would act on
   it. ⚠️ **What this does NOT establish:** it is self-report on a mock, not observed
   behaviour on a live surface. It answers "is a match enough to start a conversation?"
   — it does not answer "does discovery actually warm the cold start?" That remains
   unproven until the feature is real, which precondition 1 still gates.

6. **A moderation answer for the inbox that results.** "Ask to connect" is a message
   path; the block and report surfaces exist, but discovery will produce a different
   volume and character of first contact than a drop-in reply does. That needs its own
   look before it is live.

---

### Status at 2026-10-09

**Precondition 5 is answered. Precondition 1 is NOT, and it alone still gates the
build.** In the ADR's own order, a child-safety review comes *before* a line of code —
so a positive prototype result does not move the gate, it only makes the gate worth
paying for. The next real action is to arrange that review, not to write a spec.

---

## 8 — The decision this ADR asks for

**Is opt-in local family discovery the product, and if so, is Option 1 the version to
prototype?**

Nothing in this ADR is implemented. No code was written, no schema proposed, no route
added, and no field committed to. It exists so the founder decides *from* a document
rather than in a conversation.
