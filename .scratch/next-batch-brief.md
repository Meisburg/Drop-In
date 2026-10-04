# Next-batch brief — queue for when V28 r2 closes

> **Added 2026-10-04:** five external model reviews were triaged into
> `docs/product/external-review-triage-2026-10-04.md`. Net result: a
> **trust-defect batch (D1, D3, D4, D6, D7, D9)** that needs no product
> decisions, plus three founder calls (D2, D8, the header Sign out) — and
> confirmation that Items 2 and 3 below are still the right blocked items.
> **D2 must be settled before the 5-parent test runs**, or the signup-armed
> push prompt contaminates the zero-instruction block the test scores.
>
> **Tickets now exist:** `.scratch/trust-defects-2026-10/spec.md` with
> `issues/01`–`issues/10` (all `ready-for-agent`; the four founder decisions are
> recorded inside them). The one item that needs a design decision first is the
> form draft: `.scratch/new-form-draft-2026-10/spec.md`.

**Status:** awaiting r2 close + the 5-parent test. Paste this to the Drop In
Orchestrator only when r2 is closed out (gate green, review lanes done).

**Product context (one paragraph):** Design's live walkthrough of production
(2026-09-30) found the create/post flow is the strongest part of the app, and
first-open is the weakest: production is provably empty (every fixture swept,
~14 real drop-ins statewide), so a new parent lands on a dead-ending empty
feed. A 5-parent first-open test is scheduled; its answers gate this batch's
open decisions. A separate reference study of Meetup's signup funnel confirms
the r2 card model (one question per screen, skippable personal asks, justified
with privacy copy) matches proven patterns; no r2 rework is needed.

---

## Item 1 — DEFINITE, do in this batch: terminology pass ("ping" → "going")

**Problem:** the product vocabulary for presence is inconsistent: the feed
card says "No one's going yet," the detail page says "No one has pinged yet"
(`src/pages/PlaydateDetailPage.tsx:2746`), notifications say "a family you
know pinged your area" — the interaction noun/verb differs per surface.
Design flagged it; it compounds because the vocabulary *is* the interaction.

**Decision (product):** the user-facing word everywhere is **"going"** — "I'm
going," "No one's going yet," "3 families are going." "Drop-in" stays for the
post itself.

**Scope rule:** user-facing strings only. Internal identifiers stay as-is:
the `going_pings` table, `togglePing`, `ping_received` notification kind,
`ping_saved` push trigger, and every DB column. Renaming those is a migration
plus an edge-function redeploy for zero parent-visible change — out of scope.
Comments that say "pinged" may stay, but any comment rewritten in this pass
should use the new word.

**Files known to contain user-facing "ping":** `PlaydateDetailPage.tsx`
(count copy at :2746), `WhileAwayCard.tsx` (accessible name / banner copy),
`FeedPage.tsx` (empty-state copy), `ProfileView.tsx` (permission-gated kid
copy), push copy (`src/lib/push.ts` NOTIFICATION_KIND_COPY `ping_received`,
EMAIL copy), and their mirrors in `supabase/functions/_shared/` (payload SQL
twins + emailCopy). Sweep with `grep -rn "pinged\|has pinged\|Ping" src
supabase/functions/_shared --include=*.ts*` and classify each hit
(user-facing vs identifier) before touching anything.

**Acceptance:**
1. No user-visible string on any screen, push, or email says "ping(ed)"; the
   detail page, cards, and notifications all say the same word ("going").
2. `npm run verify` green; any test pinning old copy updated, not deleted.
3. Terminology map recorded in the batch summary: "ping" = internal column/
   kind name only, "going" = the word parents see. Future slices must not
   re-introduce "ping" in user-facing copy (worth adding to the steering
   doc if one exists for copy).

---

## Item 2 — BLOCKED on the test: "Be the first parent here" empty-feed CTA

**Problem:** a new parent in a dark area dead-ends ("Nothing within X miles"
→ wider radius → still nothing). Design's recommendation + the reference
study both say an empty discovery feed should convert emptiness into action
with a pre-filled "start one here" prompt.

**Why blocked:** (a) the 5-parent test asks exactly "what do you do when the
feed is empty" — its answer decides whether this exists and what it says;
(b) it requires consciously reversing V27's recorded ruling ("no post CTA
inside the feed's empty state; the raised + is the persistent post action").
A recorded reversal needs evidence plus the founder's yes, not a rider on
another slice.

**Do NOT build yet.** When unblocked, the shape is: empty-radius state gains
a host-agnostic "You'd be the first family here — start a drop-in at
<nearest place>" card with the post flow pre-filled (place from the gazetteer,
time default "Now"), deep-linking into the existing post flow, not a new one.
Design detail and copy come from the test results.

---

## Item 3 — BLOCKED on the test: onboarding interests/activity question

**Problem/opportunity:** r2 collects kids but nothing about what the family
likes to do; personalization via activity chips ("playgrounds, libraries,
splash pads") is the pattern the reference study rated highest — but only
where the answers change what the app shows next. In a dark city they change
nothing.

**Do NOT build yet.** Decision after the test: if parents reach for activity
talk unprompted, r3 adds one optional chip card; if not, it's dead.

---

## Item 4 — parked, do not schedule: search

No text search anywhere. Real gap, but search over a near-empty database
returns empties. Revisit when a city has real density (the trigger is
content, not a date).

---

## Order of operations

1. r2 closes → Item 1 only.
2. 5-parent test runs (independent thread; don't block the batch on it).
3. Test results land → founder decides Item 2 (and the V27 reversal) and
   Item 3 → possibly the following batch.