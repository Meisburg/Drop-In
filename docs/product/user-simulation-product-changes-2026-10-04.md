# Drop In — target-user simulation → product change requests

**Date:** 2026-10-04 · **Method:** a fresh parent account walked the real app
(`vite preview` of the current build at `585eb82`) against the live Supabase
project, on an iPhone-13 viewport, in a headless Chromium. Two parents were
created, the full first run walked, a drop-in posted, another family's drop-in
joined and commented on, and the loop closed. Every observation below is
something that happened on a screen; transcripts and screenshots are in
`.scratch/sim/`. Both simulated accounts (`e2e-…-sim@gmail.com`,
`e2e-…-sim2@gmail.com`) and their three posts were deleted at the end; a
collateral probe confirmed no real parent's row was touched.

---

# Executive Summary

**What the target user understands about Drop In.** It is for parents, it is
local, and it protects kids (first name and age only). "I'm going" is not a
booking — nothing is promised to anyone. That last idea came through clearly and
is the most distinctive thing in the product.

**What they do not understand.** What a "drop-in" actually *is* (the word is used
by card 3 of the first run and never defined). Why an email, a full name, and a
home address are required before they are allowed to look at anything. What the
`+` in the middle of the nav does. That "Places" is a directory of playgrounds
rather than a second feed. Whether anyone will actually turn up.

**What provides the most value.** (1) One tap on "I'm going" with a confirmation
that explains what happens next. (2) The Places directory — a real, dense list of
nearby venues where each row offers "Start a drop-in here" and pre-fills the
place *and* address on the post form. For a data-thin app this is the best
surface in the product. (3) "While you were away — 1 family is going to …" on
return. (4) The signed-out share page, which shows a real drop-in before asking
for anything.

**What creates the most friction.** The first feed is empty, and the reason is
the 5-mile default (`src/lib/feed.ts:72`), not the product. A parent who picked
20 miles during onboarding saw two drop-ins immediately; a parent who took the
default saw "Nothing within 5 miles yet." Nothing on that screen says how much
is just outside the radius, so there is no reason to believe widening will help.
The second-biggest friction is that the first run ends with **no explanation of
the app at all**: the "How Drop In works" card built for exactly this
(`src/lib/firstRunTour.ts`) was deliberately un-rendered in `168183c`, and
`docs/product/onboarding-first-run.md` §3 still describes it as shipping.

**Why they would return.** The content is perishable, "While you were away"
proves the loop closed, and the Inbox tells you plainly how to start a
conversation.

**Why they might abandon.** They did the paperwork (email → name → kids →
address → radius), were dropped into a four-tab app with no explanation, and
found nothing to do — the single item inside 20 miles was 10 miles away and
ending in 19 minutes.

---

# Product Change Requests

### PCR 001: A new parent finishes setup and is never told what the app is

**Type:** Product Improvement

**Priority:** Critical

**Confidence:** High

**Area:** First run / orientation

**User problem:** I gave four screens of personal information and was dropped
into a four-tab interface with a `+` in the middle and no explanation of any of
it. I do not know what "Drop Ins" means, what the `+` does, or that "Places" is a
directory of playgrounds.

**User evidence:** After card 4's Finish, the app navigated straight to the feed.
No tour card, no one-line orientation, no tooltip. The word "drop-ins" appears in
card 3's body ("the kids who will come to drop-ins") two screens before anything
defines it. The four card bodies are: account, name, kids, address — none
explains the product.

**Current experience:** The run ends on the feed. `HowItWorksCard` is imported by
`OnboardingPage.tsx` and immediately discarded (`void HowItWorksCard`,
`OnboardingPage.tsx:10-12`), with a comment recording that `168183c` — "the run
ends on the feed, not on an ending screen" — removed it.

**Desired experience:** By the time the parent's feed paints, they know what a
drop-in is, what the `+` does, and that Places is where they can start one.

**Recommended change:** Decide *where* orientation happens, not whether. Options,
in order of my confidence: (a) one line of orientation on the area card and a
one-line labelled `+` — orientation inline where the parent is already looking;
(b) the orientation content as a dismissible strip above the first feed rather
than a blocking card; (c) reinstate a skippable ending card, accepting one more
tap. Do **not** restore the removed card by default without the owner's call —
`168183c` was a phone-walk decision.

**Why this matters:** Orientation is the difference between a configured account
and an active parent. The parent has paid the full setup cost and is one screen
away from understanding the product.

**Acceptance criteria:** A first-run parent can state, after their first feed
paints, what a drop-in is and what the `+` does; and no orientation surface
delays the feed by more than one dismissible element.

**Dependencies or considerations:** `docs/product/onboarding-first-run.md` §3
("the run instead ends with a 'How Drop In works' card") is now false and should
be corrected in the same change; the doc is what a reviewer would trust.
`firstRunTour.ts` and `HowItWorksCard.tsx` exist and are guard-coupled — reuse
them rather than writing new copy.

---

### PCR 002: The empty first feed does not say what is just outside the radius

**Type:** Experiment

**Priority:** Critical

**Confidence:** High

**Area:** Feed / empty state

**User problem:** My first screen after setup said "Nothing within 5 miles yet."
I had no way to know whether widening would find anything or just produce a
second empty screen, so the honest action was to close the app.

**User evidence:** Parent A (Seward Park, 98118, default 5 mi) → "Nothing within
5 miles yet. Widen to 20 miles / See everything in Seattle." One tap on "Widen to
20 miles" returned **two** drop-ins and "1 happening now · 2 today". Parent B,
created minutes later from Discovery Park (98199), picked 20 miles during
onboarding and landed on a populated feed with no empty state at all. Same app,
same moment, opposite first impression — the default is the variable.

**Current experience:** The radius default is 5 miles (`src/lib/feed.ts:72`) and
the empty state offers escapes but no evidence (`RadiusEmptyState`, which
deliberately renders honest counts only for the radius in force).

**Desired experience:** The parent can tell, without spending a tap blind,
whether there is anything to see.

**Recommended change:** Test, in this order: (1) put the count beyond the radius
on the empty state — "3 drop-ins within 20 miles" — so widening is an informed
tap; (2) for a parent with **no** drop-ins in the widest radius, lead with
creating one instead of widening; (3) only then consider a wider default radius
for a brand-new parent's first session. (1) is the cheapest and is measurable on
its own.

**Why this matters:** This is the activation moment. Everything before it is
cost; everything after it depends on the parent getting to one real drop-in.

**Acceptance criteria:** On the first feed with an empty 5-mile radius and
non-empty content beyond it, the screen states how many drop-ins exist beyond the
radius and the widen control is the primary action.

**Dependencies or considerations:** The 5-mile default is deliberate and pinned
(`src/lib/feed.test.ts:2464`); do not change it as a side effect. Separately, the
product doc's own precondition is unmet in practice: "Real drop-ins are seeded by
hand before invites go out" (§4) — on 2026-10-04 the entire Seattle radius
contained **one** genuine drop-in. No UI change fixes a one-item world; see NFR
003.

---

### PCR 003: The first empty screen offers no way to create, and never mentions Places

**Type:** Product Improvement

**Priority:** High

**Confidence:** High

**Area:** Feed / empty state / navigation

**User problem:** I want to find *or create* nearby opportunities. When the feed
is empty, the app offers me radius changes — nothing else. I cannot tell that
creating something is possible, or that there is a whole directory of parks where
I could start one.

**User evidence:** The empty state's controls were exactly: "Widen to 20 miles",
"See everything in Seattle". The post action exists only as an unlabelled `+` in
the bottom nav. The Places directory — which offers "✨ Be the first to start a
drop-in here today!" per venue and pre-fills the post form's place + address
(verified: opening `/new` from a place page filled place "12th Ave Square Park"
and address "564 12th Ave") — is one tab away and never referenced from the empty
feed.

**Current experience:** The feed's action row owns its own "Post a drop-in"
button, but the empty state opts out of a second CTA (`showPostCta`) to avoid
duplicate buttons, leaving radius escapes as the only empty-state actions.

**Desired experience:** An empty feed is the strongest possible moment to invite
the parent to start something, and to show them the venues where they could.

**Recommended change:** Give the first-run empty state one primary action that
creates, and one secondary that shows nearby places with no drop-ins — e.g.
"Start one at a park near you" routing to `/browse` filtered to places with no
upcoming drop-in. Rely on the existing place-page → `/new` pre-fill so the parent
never types an address.

**Why this matters:** Converts a dead end into the product's other half. Also
fixes the discoverability of Places, which today is a nav label nobody can decode
before tapping it.

**Acceptance criteria:** From the empty first feed, a parent reaches a pre-filled
`/new` in two taps without typing a place or address.

**Dependencies or considerations:** The duplicate-CTA rule in
`RadiusEmptyState`'s docblock is real — resolve it by making the feed's action
row and the empty state share one primary action, not by stacking two.

---

### PCR 004: "Happening now" includes drop-ins the parent cannot physically reach

**Type:** Product Improvement

**Priority:** High

**Confidence:** Medium

**Area:** Feed / card content

**User problem:** The most urgent-looking card in my feed was labelled "Happening
now", was 10 miles away, and "ends in 19 min". It reads as an invitation I cannot
accept. That is a worse first impression than an empty feed, because it looks
like the app is offering me something and then withdrawing it.

**User evidence:** "Drop-in at Green Lake Park · Happening now · Sun, Oct 4 ·
5:30 AM–6:30 AM · ends in 19 min · Green Lake Park · Playground · Outdoor · 10 mi",
shown to a parent in 98118 whose only in-radius content this was.

**Current experience:** Recency and distance are both computed and shown, but
never combined.

**Desired experience:** An urgent card either is reachable, or says plainly that
it is not.

**Recommended change:** Experiment in this order: (1) label, don't hide — a
reachability hint on near-expiry cards ("10 mi away · ending in 19 min"), so the
card is honest; (2) sort/rank so a reachable "starts soon" outranks an
unreachable "happening now"; (3) only with evidence, filter. Do not silently drop
rows: a parent who has driven 10 miles before will read that as a bug.

**Why this matters:** Every "happening now" that cannot be taken is a small piece
of distrust, and it lands on the most prominent slot in the product.

**Acceptance criteria:** No card presents "Happening now" without either
plausible reachability from the parent's home zip or an explicit distance/time
warning on the card itself.

**Dependencies or considerations:** No travel-time or speed assumption exists in
the codebase today; start with display, not inference, or the rule will be an
invented constant.

---

### PCR 005: Signed-out visitors get a sign-in wall, not a preview

**Type:** Product Improvement

**Priority:** High

**Confidence:** High

**Area:** First launch / acquisition

**User problem:** I followed a link to Drop In. Before I could see a single thing
about it I was asked for an email and a password, with one vague line —
"See what families are up to in your area!" — as the whole pitch.

**User evidence:** Cold launch of `/` renders the login form. The only value
statement is that one line; there is no sample drop-in, no count, no map, no
description of the mechanism. Meanwhile the signed-out public drop-in page
(`/playdate/:id`) renders beautifully: date, place, host, "2 families going —
come say hi", "I'm coming" with "Sign up to join in", and "Comments are for
signed-in parents."

**Current experience:** The public surface exists but is only reachable from a
share link. The root URL — the one a curious parent types or searches — is the
wall.

**Desired experience:** A visitor sees a real, non-identifying slice of what is
happening near them (or a representative sample when nothing is) before being
asked for an account.

**Recommended change:** Build the root's signed-out state out of the already-built
public drop-in surface: a preview list of public drop-ins with times, places and
going-counts, one "I'm coming" that funnels into signup, and a plain one-line
explanation of the mechanism. Reuse the public detail page rather than inventing
a marketing page.

**Why this matters:** This is the acquisition path with no share link, and it is
also where a parent decides whether Drop In is a real product. Solving PCR 002's
cold start is wasted if the door is still shut.

**Acceptance criteria:** A signed-out visitor to `/` can read at least one real
(non-identifying) drop-in — time, place, going count — without authenticating, and
a single tap from it begins signup.

**Dependencies or considerations:** PRODUCT.md already requires "Parents arrive
from a share link, possibly signed out, and must be able to see a public drop-in's
surface before authenticating" — this extends that rule to the front door. RLS is
`to authenticated` for kid ages (see `e2e/feed-ages.e2e.ts` §3), so the preview
must be built from fields the public policy actually exposes.

---

### PCR 006: The post form silently discards the draft, and the app is what sends you away from it

**Type:** Bug

**Priority:** High

**Confidence:** High

**Area:** Create a drop-in

**User problem:** I typed a title and a place, then noticed "Kids you're
bringing" telling me to "Add your kids in your settings". I followed its "Add
kids" link. When I came back, my title and place were gone.

**User evidence:** Reproduced twice — once with a full page reload and once with
in-app navigation only (`Add kids` → `/settings`, then the `+` back to `/new`).
In both cases the only surviving field was the date's default:
`[{ph: null, v: "2026-10-04"}]`. Autosave exists for `/settings` and `/profile`
(`src/lib/autosave.ts`, `ProfilePage`) and not for `/new`.

**Current experience:** `/new` holds everything in component state. Leaving
unmounts it. The app's own instruction (`src/components/PlaydateFormFields.tsx:661-664`,
a `<Link to="/settings">`) is a lossy navigation.

**Desired experience:** Either the kid can be added without leaving the form, or
the form is still there when the parent comes back.

**Recommended change:** Prefer adding a kid inline on `/new` (the kid row markup
already exists on the profile editor and the write path is the same). If that is
too large, persist the `/new` draft (title, place, address, time, details) the way
`/settings` and `/profile` already persist theirs, and restore it on mount.

**Why this matters:** This is the app destroying a parent's work at the exact
moment they were trying to complete a step the app asked for. It is the kind of
failure that stops a second attempt.

**Acceptance criteria:** Typing a title and place on `/new`, following the "Add
kids" link, and returning by any route lands with the title and place intact —
or the link no longer leaves the form.

**Dependencies or considerations:** The resume principle already exists for the
first run ("Resume never restarts", `docs/product/onboarding-first-run.md` §4);
this is the same principle on the post form. `playdate_series` / duplicate-
previous-post paths also mount `/new` and must not be broken by a restored draft.

---

### PCR 007: A profile card states "No one's going yet" about a drop-in with two families going

**Type:** Bug

**Priority:** High

**Confidence:** High

**Area:** Profile / card data

**User problem:** Deciding whether to show up with my kids depends on whether
anyone else is going. The app told me two different things about the same
drop-in, and the one I saw on the host's profile said nobody was coming.

**User evidence:** `/u/Jamie Parent` card for "Drop-in at Green Lake Park":
"No one's going yet". The same drop-in's detail page: "✓ Going · 2 families going
— come say hi · You, Taylor Neighbor". The feed card for the same drop-in read
"2 going".

**Current experience:** `DropInCard.tsx:558` renders
`pingToggle?.enabled ? 'No one's said they're going yet' : 'No one's going yet'`.
The going line only exists when ping data is supplied, so a surface that does not
pass ping data asserts an absence it has not checked.

**Desired experience:** If the card does not know, it says nothing about it; if it
knows, it says the true count.

**Recommended change:** Make the no-going claim conditional on having actually
read the ping set (pass the count or a "loaded" flag wherever `DropInCard` is
rendered, including the profile page). Where pings genuinely are not loaded,
render no going line at all.

**Why this matters:** False absence is the single most damaging thing this app can
say — it is the exact reason a parent drives to an empty park, or decides not to
go at all. It also undermines the honesty the empty states elsewhere work hard
for.

**Acceptance criteria:** For a drop-in with one or more going pings, no surface
in the app renders "No one's going yet" / "No one's said they're going yet".

**Dependencies or considerations:** The two copy variants for the same state
("No one's going yet" vs "No one's said they're going yet") are a secondary
inconsistency worth collapsing in the same change — they appeared on the same
feed screen for two different posts.

---

### PCR 008: The notification/install ask is the first thing a brand-new parent sees

**Type:** Product Improvement

**Priority:** High

**Confidence:** High

**Area:** Notifications / first-run sequencing

**User problem:** I finished setup and the first thing on my screen was an
instruction to install the app and turn on notifications. I had not seen a single
drop-in yet, so I had no reason to want to be notified about anything.

**User evidence:** Immediately after card 4's Finish, the feed rendered "On
iPhone and iPad, notifications only arrive in the installed app: tap Share, then
'Add to Home Screen', and turn them on there. [Got it]" above the empty state.
The same instruction repeats in Settings, above "Notifications are off."

**Current experience:** `PushOptInPrompt` is mounted for the whole authed shell
and owns the slot until dismissed. On iOS the only path to push is installing the
PWA, so the ask is a multi-step browser-chrome instruction rather than a single
permission dialog.

**Desired experience:** The install/notification ask arrives when the parent has
something to be notified about — after they host their first drop-in or say
they're going to one — not before they know what the app contains.

**Recommended change:** Gate the prompt on a first meaningful action (a post, or
a going ping) rather than on the first authed render; and make the ask
action-shaped ("Get told when someone joins your drop-in") rather than
permission-shaped. Keep the iOS honesty about needing the installed app.

**Why this matters:** The prompt competes with the only thing that matters at that
moment — the parent's first look at the feed — and it teaches the parent that the
app's first move is to ask for something.

**Acceptance criteria:** A parent who has neither posted nor pinged never sees a
notification or install prompt on the feed.

**Dependencies or considerations:** The sequencing conflict is already filed as an
open question (`docs/product/onboarding-first-run.md` §6.4). My evidence promotes
it from "a resuming parent may see both" to "every new parent sees it first".

---

### PCR 009: "Sign out" is a permanent, one-tap control in the header of every screen

**Type:** Product Improvement

**Priority:** Medium

**Confidence:** High

**Area:** Navigation / core chrome

**User problem:** I reached for the gear at the top right and my thumb was on
"Sign out". One tap and I was logged out, with no confirmation and no way back
except remembering my password.

**User evidence:** Tapping "Sign out" on the feed navigated to `/login`
immediately — no dialog, no undo. The control renders in the sticky header of
every authenticated screen (`src/App.tsx:456-463`), 44px tall, beside the gear,
and it is one of the first things in the accessibility tree on every page.

**Current experience:** Sign-out is treated as navigation, not as a session
action.

**Desired experience:** Signing out is deliberate and lives with the rest of the
account controls.

**Recommended change:** Move sign-out into Settings → Account (where "Download my
data" and "Delete my account" already live) and, if it stays in the header,
require confirmation. Note that the app already confirms destructive actions
elsewhere — `DeletePlaydateDialog`, `ConfirmDialog` — so this is a consistency
fix, not a new pattern.

**Why this matters:** A parent locked out by a stray tap needs a password reset
to get back in. For a product whose whole promise is low friction, an accidental
logout is a disproportionate cost.

**Acceptance criteria:** No single unconfirmed tap on any authenticated screen
ends the session.

**Dependencies or considerations:** `LoginPage` renders its own "Sign out" for a
signed-in visitor; keep the two consistent.

---

### PCR 010: The "Posted!" banner and the create-account link are both mis-placed on the first screen

**Type:** Bug

**Priority:** Medium

**Confidence:** High

**Area:** Feed post-publish state · login layout

**User problem (a):** After posting, "Posted! <title> · Share · Dismiss" sits on
the feed and comes back on a full page reload, so the app tells me I just posted
something I posted earlier.

**User problem (b):** On an iPhone-13 viewport, "New here? Create an account" —
the only path for a new parent — is clipped by the bottom of the screen below a
sign-in form built for returning parents.

**User evidence (a):** Posting set the banner; a full `page.reload()` restored it
("banner after a full reload: true"); it cleared only after tapping Dismiss
("after Dismiss + reload: false"). The banner is driven by router
`location.state.justPosted` (`FeedPage.tsx:225-229`), which survives a reload.
**User evidence (b):** The control's bottom edge measured y=692 against a 664px
viewport; `documentElement.scrollHeight` 692 vs `clientHeight` 664 — the page
overflows by 28px and the link renders half-cut.

**Current experience:** The posted banner is transient in intent and persistent in
fact; the sign-up link is below the fold on the reference device.

**Desired experience:** The banner is one navigation-lifetime event; the new-parent
path is visible without scrolling.

**Recommended change:** (a) Clear `justPosted` from history state once it has been
rendered once (or move it to `sessionStorage` with an explicit dismiss and an
expiry). (b) Give the login screen enough bottom padding — or promote "Create an
account" to a first-class control — so it is fully visible at 390×664.

**Why this matters:** (a) An app that reports stale state is an app you stop
trusting. (b) The single most important action for a brand-new visitor is the one
that is cut off.

**Acceptance criteria:** (a) With the banner visible, reloading the page does not
restore it. (b) At 390×664 the "New here? Create an account" control is fully
within the viewport, with no page overflow.

**Dependencies or considerations:** `scripts/mobile-audit.mjs` walks signed-out
routes; extend the assertion to include the control being inside the viewport,
not just its size.

---

### PCR 011: The kids step in the post form is a dead end into Settings

**Type:** Usability Improvement

**Priority:** Medium

**Confidence:** High

**Area:** Create a drop-in

**User problem:** The form asked which kids I'm bringing, then told me to go to
my settings to add them. I was one field away from posting and the app sent me
somewhere else.

**User evidence:** "Kids you're bringing (optional) — Add your kids in your
settings, then pick the ones coming along. Add kids". The link routes to
`/settings`, whose first row is "Your family profile — Name, kids & photos ›",
which is a further tap to the editor. A parent who skipped the kids card during
onboarding (the card explicitly offers Skip) hits this on their first post.

**Current experience:** The kid picker cannot create a kid; it points at a
page that points at another page.

**Desired experience:** If the form needs kids, the form can take them.

**Recommended change:** Add the inline kid row to `/new` (first name + age), or at
minimum link straight to the profile editor's kid section and return the parent to
their draft (which needs PCR 006 first).

**Why this matters:** Hosting is the half of the product that creates supply. Any
friction on the post path is friction on the thing that fixes the empty feed.

**Acceptance criteria:** A parent with no kids on their profile can add one and
select it without leaving `/new`, or without losing their draft.

**Dependencies or considerations:** Overlaps PCR 006; do them together.

---

# New Feature Requests

### NFR 001: Host check-in ("I'm here")

**User need:** Before I load two children into a car to meet strangers, I need to
know the host is actually at the park. Today nothing in the system observes
arrival, and "I'm going" is documented as an intention only — so a parent's
realistic worst case is an empty playground and an awkward drive home.

**User scenario:** I said I'm going to a 3pm drop-in. At 2:55 I am deciding
whether to leave. I open the drop-in and there is nothing that tells me whether
anyone has arrived.

**Current workaround:** Message the host and hope they answer in time. If they do
not, I either risk it or stay home.

**Proposed capability:** A one-tap "I'm here" for the host (and optionally for
anyone who arrives), visible on the drop-in to everyone going, with the existing
push/email alert channel carrying it to pingers.

**Why it matters:** It converts the product's central promise — "showing up must
stay easy" — from a hope into something checkable, and it is the specific missing
piece that makes a first meeting with strangers feel safe.

**Priority:** High

**Confidence:** Medium

**Potential MVP:** A boolean check-in on the drop-in, visible to pingers and to
the host, plus the existing "Starting soon" alert reused to fire an "I'm here"
alert. No location tracking, no attendance claim for anyone but the person who
taps it.

---

### NFR 002: Invite a family you already know, with provenance

**User need:** My realistic alternative to Drop In is texting the two families I
already know. If Drop In cannot include them, it starts me from zero every single
time.

**User scenario:** I want to post a playground afternoon and have the parents I
already trust see it first, rather than hoping a stranger within five miles
happens to be free.

**Current workaround:** Share the public link into a group text (the "Posted!"
banner's Share control already produces a working public link). The app never
learns that the families who arrive came because I invited them, and I get no
evidence that anyone I know is on the app.

**Proposed capability:** An invite that names the inviter — "Dana invited you" —
carries through signup, and a light "families you've met" list that already
partly exists (`metBeforeLabel` on `DropInCard`, plus follows).

**Why it matters:** It is the cheapest known cure for cold start, it makes the
first drop-in warmer than a stranger meet-up, and it gives the inviter a reason
to return (did they come?). It also makes the existing Share control do work it
currently cannot.

**Priority:** High

**Confidence:** Medium

**Potential MVP:** A share link that carries an inviter token; the landing page
shows "Dana invited you to Drop In"; on signup the two accounts are linked as
"met". No contact-book access, no address-book upload.

---

### NFR 003: "Tell me when anything is posted near me"

**User need:** I live where almost nothing happens yet. My options today are to
check the app hopefully or to follow specific places — but I do not know which
places are worth following, and if the feed is empty there is nothing to follow
from.

**User scenario:** I opened Drop In on Saturday, found nothing, and closed it. I
would happily come back if the app told me when the first family posts something
within ten miles.

**Current workaround:** Re-open the app and hope. The nearest existing capability
is "New drop-ins at places you follow" in Settings → Notifications, which requires
knowing a place worth following first.

**Proposed capability:** A standing per-parent alert: notify me about any new
drop-in within my radius. Reuses the existing push/email channel and the existing
per-kind notification preference machinery.

**Why it matters:** It is the only mechanism that lets a parent participate in a
thin market without spending attention on checking. It also means the seeded
content that launch depends on actually reaches people who had already given up.

**Priority:** High

**Confidence:** High

**Potential MVP:** One more toggle in the existing notification kinds list,
carried by the existing "new drop-in" alert path.

---

# Things That Should NOT Be Changed

1. **The one-tap "I'm going" on the feed card, and the confirmation lightbox that
   follows it.** The card check stayed on the feed (it did not swallow the tap
   into the card's link) and the lightbox explains exactly what happens next
   ("You can message the host and the other families going from the drop-in, and
   those conversations are in your Inbox"). This is the best-designed moment in
   the product.
2. **"While you were away".** It correctly reported "1 family is going to …" on
   the host's next visit, with no push permission at all. The loop closes in-app.
   Leave it alone.
3. **The all-optional post form with pre-filled time defaults.** Title + place is
   genuinely enough to post; date, start and end were already sensible, and the
   "Where? — pick a place" control filled the address for me. Do not add required
   fields to the post path.
4. **The Places directory and the place page → `/new` pre-fill.** "Start a
   drop-in here — Fills this place in on the post form — you pick the time"
   worked exactly as advertised. This is the strongest under-discovered asset in
   the app; surface it, do not rebuild it.
5. **The signed-out public drop-in page.** It is a model of the whole
   "let them look first" principle: real content, honest "Sign up to join in",
   and "Comments are for signed-in parents."
6. **The empty Inbox.** "Message a parent from a drop-in page once you're both
   going, or start a new conversation above." — explains the rule and offers a
   way out. Copy this pattern elsewhere; do not replace it with a bare
   "No conversations yet."
7. **The privacy posture.** First name and age only, distance instead of zip,
   photos only to signed-in parents, and the explicit "Other parents see distance,
   not the ZIP" line. It reads as a deliberate stance, not an oversight — keep it.
8. **The `+` in the centre of the bottom nav.** It is a deliberate, recorded
   override of the HIG (see `src/App.tsx:494`). Whatever PCR 001 decides about
   orientation, do not "fix" the nav shape.

---

# Product Principles Discovered

1. **A parent must be able to see something real before being asked for
   anything.** The public drop-in page proves the rule; the root URL and the
   four-card first run break it.
2. **An empty screen must show what is just out of sight.** "Nothing within 5
   miles" is only honest if it also says what is within 20. Otherwise honesty
   reads as a dead end.
3. **Never state an absence you have not checked.** "No one's going yet" on an
   unloaded card is worse than silence — this app's whole value depends on being
   believed about who is coming.
4. **The app must not destroy a parent's work, especially when the app is the one
   that sent them away.** Resume-never-restarts is already a first-run principle;
   it belongs to every form.
5. **Ask at the moment the answer is useful.** Location, notifications and kids
   all have a moment where they help the parent; a first-run card or a shell
   banner is usually not it.
6. **Orientation is part of the product, not a screen.** A parent who has paid
   the setup cost needs to know what a drop-in is whether they learn it from a
   card, a tooltip, or a labelled button.
7. **The second half of the product is hosting, and the empty feed is its best
   advert.** Every empty state is a chance to create supply; treat "nothing here
   yet" as an invitation, not an apology.

---

## CHANGE_SET

**ID:** PCR 001
**Action:** Modify
**Priority:** Critical
**Area:** First run / orientation
**User problem:** A parent finishes four setup cards and is dropped into a four-tab app with no explanation of what a drop-in, the `+`, or Places is.
**Desired outcome:** By the time the first feed paints, the parent knows what a drop-in is and what the `+` does.
**Implementation direction:** Reuse `firstRunTour.ts` / `HowItWorksCard.tsx` (currently imported and discarded in `OnboardingPage.tsx:10-12`). Choose the placement deliberately — inline on the area card + a labelled `+`, or a dismissible strip above the first feed — rather than reinstating the removed ending card unilaterally. Correct `docs/product/onboarding-first-run.md` §3 in the same change.
**Acceptance criteria:** A first-run parent can describe what a drop-in is after their first feed paints; no orientation surface delays the feed by more than one dismissible element.

**ID:** PCR 002
**Action:** Experiment
**Priority:** Critical
**Area:** Feed / empty state
**User problem:** The first feed is empty at the 5-mile default and gives no evidence that widening will find anything.
**Desired outcome:** The parent can tell, before spending a tap, that content exists just outside the radius.
**Implementation direction:** Add the beyond-radius count to the empty state ("3 drop-ins within 20 miles") as the first experiment. Keep the 5-mile default unchanged (`feed.ts:72` is pinned by tests).
**Acceptance criteria:** With an empty 5-mile radius and non-empty content beyond it, the empty state states the count and makes widening the primary action.

**ID:** PCR 003
**Action:** Modify
**Priority:** High
**Area:** Feed empty state / navigation
**User problem:** An empty feed offers only radius escapes; the create path and the Places directory are invisible.
**Desired outcome:** An empty feed converts into a created drop-in in two taps.
**Implementation direction:** One primary create action and one secondary "places near you with nothing on" action, routing into the existing place-page → `/new` pre-fill. Resolve the duplicate-CTA rule in `RadiusEmptyState` by sharing one primary action with the feed's action row.
**Acceptance criteria:** From the empty first feed, a pre-filled `/new` is reachable in two taps with no typing of place or address.

**ID:** PCR 004
**Action:** Experiment
**Priority:** High
**Area:** Feed card content
**User problem:** A 10-mile-away drop-in is labelled "Happening now" and "ends in 19 min".
**Desired outcome:** An urgent card is either reachable or explicitly labelled as not.
**Implementation direction:** Label first ("10 mi away · ending in 19 min"), then re-rank, then consider filtering — display before inference, because no travel model exists.
**Acceptance criteria:** No card claims "Happening now" without reachability or an explicit distance/time warning.

**ID:** PCR 005
**Action:** Add
**Priority:** High
**Area:** Signed-out home
**User problem:** Cold visitors to `/` get a sign-in wall and one vague line instead of a preview.
**Desired outcome:** A visitor sees real, non-identifying drop-ins near them before authenticating.
**Implementation direction:** Build the signed-out root from the existing public drop-in surface and the public RLS-visible fields; one tap to begin signup.
**Acceptance criteria:** A signed-out visitor to `/` can read at least one real drop-in (time, place, going count) and start signup in one tap from it.

**ID:** PCR 006
**Action:** Fix
**Priority:** High
**Area:** Create a drop-in
**User problem:** `/new` loses the draft when the app's own "Add kids" link sends the parent to `/settings`.
**Desired outcome:** The parent's typing survives, or the detour is removed.
**Implementation direction:** Prefer an inline kid row on `/new`; otherwise persist the draft the way `/settings` and `/profile` do (`src/lib/autosave.ts`).
**Acceptance criteria:** Title and place survive an "Add kids" detour and a return by any route, or the link no longer leaves the form.

**ID:** PCR 007
**Action:** Fix
**Priority:** High
**Area:** Profile card data
**User problem:** A profile card says "No one's going yet" for a drop-in with two families going.
**Desired outcome:** A card never asserts an absence it has not loaded.
**Implementation direction:** Gate the no-going copy on ping data having been read (`DropInCard.tsx:558`); render no going line where pings are not loaded. Collapse the two copy variants ("No one's going yet" / "No one's said they're going yet").
**Acceptance criteria:** No surface renders "No one's going yet" for a drop-in with one or more going pings.

**ID:** PCR 008
**Action:** Modify
**Priority:** High
**Area:** Notifications sequencing
**User problem:** The install/notification instruction is the first thing on a brand-new parent's feed, before any content.
**Desired outcome:** The ask arrives after the parent has a reason to want it.
**Implementation direction:** Gate `PushOptInPrompt` on a first meaningful action (post or going ping); phrase it around the benefit and keep the iOS install honesty.
**Acceptance criteria:** A parent who has neither posted nor pinged sees no notification or install prompt on the feed.

**ID:** PCR 009
**Action:** Modify
**Priority:** Medium
**Area:** Navigation chrome
**User problem:** A one-tap, unconfirmed "Sign out" sits in the sticky header of every screen next to the gear.
**Desired outcome:** Ending a session is deliberate.
**Implementation direction:** Move sign-out to Settings → Account and/or add confirmation using the existing `ConfirmDialog` pattern.
**Acceptance criteria:** No single unconfirmed tap on any authenticated screen ends the session.

**ID:** PCR 010
**Action:** Fix
**Priority:** Medium
**Area:** Feed post-publish banner · login layout
**User problem:** The "Posted!" banner returns after a full page reload; "New here? Create an account" is clipped at the bottom of a 390×664 viewport.
**Desired outcome:** The banner is one navigation-lifetime event; the signup control is fully visible.
**Implementation direction:** Clear `location.state.justPosted` after first render (or move it to session storage with an expiry); add bottom padding or promote the create-account control on `/login`.
**Acceptance criteria:** Reloading with the banner visible does not restore it; at 390×664 "New here? Create an account" is fully inside the viewport with no page overflow.

**ID:** NFR 001
**Action:** Add
**Priority:** High
**Area:** Drop-in detail
**User problem:** Nothing tells a parent whether the host has actually arrived.
**Desired outcome:** A parent can check before driving out with kids.
**Implementation direction:** A one-tap "I'm here" on the drop-in, visible to pingers, carried by the existing alert channel. No location tracking.
**Acceptance criteria:** A pinger sees the host's check-in on the drop-in while it is live.

**ID:** NFR 002
**Action:** Add
**Priority:** High
**Area:** Invites / growth
**User problem:** Drop In cannot include the families a parent already knows and texts.
**Desired outcome:** Invited families arrive with provenance, and the inviter sees they came.
**Implementation direction:** Inviter token on the existing share link; "Dana invited you" on the landing page; link the accounts as "met" on signup.
**Acceptance criteria:** A visitor arriving from an invite link sees who invited them, and both accounts are linked after signup.

**ID:** NFR 003
**Action:** Add
**Priority:** High
**Area:** Notifications
**User problem:** In a thin market a parent has no way to be told when the first drop-in near them is posted.
**Desired outcome:** A standing "notify me about anything near me" preference.
**Implementation direction:** One more kind in the existing notification-kinds list, carried by the existing new-drop-in alert path.
**Acceptance criteria:** With the preference on, a new drop-in inside the parent's radius produces an alert without the parent having to follow a specific place.
