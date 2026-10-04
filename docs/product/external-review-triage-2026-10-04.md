# Triage — five external model reviews of Drop In (2026-10-04)

**What this file is.** Five LLMs were given the same "target-user simulation →
product change discovery" prompt and asked to use the real app. Their outputs
live outside this repo, in `~/Documents/Obsidian Vault/Drop-In/Adversarial
Review/`. This file is the **decision**: which of their 39 change requests are
real, which are already tracked, which are wrong, and what we do next.

**Method.** Every behavioural claim in all five reviews was verified against
this repo at `580eb82` by four read-only agents, citing `file:line`. Claims were
not accepted because a model asserted them. The one review already in-repo
(`docs/product/user-simulation-product-changes-2026-10-04.md`) is the Deepseek
run; its evidence artifacts are in `.scratch/sim/` (68 screenshots, 15
transcripts).

**Headline.** The corpus is 80% re-discovery and 20% real. It independently
confirms the diagnosis this repo already reached — **first open is the weakest
surface, the data is the bottleneck, not the UI** — and it surfaces **9 verified
defects, nearly all of them unfiled**. It does not justify the new features it
asks for.

---

## 1. The corpus, ranked by evidence quality

| Review | Method | Verdict on its claims | Use it for |
|---|---|---|---|
| **Deepseek** (in repo) | Real headless walkthrough, live Supabase, 68 screenshots + transcripts | 11 PCR / 3 NFR — **10 true, 1 partly** (PCR 003, which credits the feed with a post CTA V24 removed); several citations drifted by a few lines | The primary evidence set. Treat as a real user test. |
| **Perplexity** | Claims a full two-parent walk + code cross-check | 8 PCR / 2 NFR — **8 real, 1 false** (`PCR 008`, no duplicate copy exists: `NotificationsSection.tsx:303-305`) | Confirms Deepseek independently on the 4 items that matter. |
| **Grok** | Strategic read; hard UI claims match the app | 6 PCR / 1 NFR — nothing net-new; one stale detail (it credits the empty state with a post CTA that V24 moved to the nav `+`) | Framing/quotes for the exec summary. |
| **ChatGPT** | Reached sign-in and signup only; stopped before the app | 3 PCR / 1 NFR — 1 stale (`PCR 003`: the address signup form was deleted at `3080c65`), the rest duplicate | Exactly one net-new finding (`D8` below). |
| **Gemini** | **Never used the app** — no app access; partly answering a conversation | **6 of its 8 checked claims misdescribe the app** — invented controls and copy | Nothing. Its value is negative evidence (see §5). |

Gemini's errors are not nitpicks: it invents a "Host" button (the control is `+`
with `aria-label="Post a drop-in"`, `PostActionButton.tsx:22-28`), invents
"Join"/"RSVP" copy (the app says `I'm going` / `✓ Going`), claims an OS location
prompt fires on launch (no auto-prompt exists, and `OnboardingPage.tsx:1891-1893`
explicitly bans it), and states "if the primary view is a map, keep it" when
`FEED_VIEW_DEFAULT = 'list'` (`feedView.ts:33`). **Acting on it would reverse
recorded decisions and fix nothing.** Weight the other four accordingly.

---

## 2. Convergence — what three or more reviewers said unprompted

| # | Theme | Who | Status |
|---|---|---|---|
| C1 | Nothing explains what Drop In / a "drop-in" is before asking for an account | all 5 | **Already the top of the active plan** — `plan.md:655-698` (r3-7 tooltips), copy source `firstRunTour.ts`. Real; do not re-plan. |
| C2 | Empty feed dead-ends; the only offered path is "be the first to post" | 4 of 5 | **Already tracked and deliberately blocked** on the 5-parent first-open test — `.scratch/next-batch-brief.md:56-89`, `RELEASE-CHECKLIST.md:140-145`. |
| C3 | Signed-out visitors get a wall, not a preview | 4 of 5 | Real, **needs an ADR, not a builder** — deferred as a non-goal in `.scratch/first-use-discovery-audit/spec.md` ("a privacy-model change"). `PRODUCT.md:53-54` already allows signed-out *share-link* viewing. |
| C4 | The post flow is too heavy / "event-like" | 4 of 5 | **Reject.** Contradicted by this repo's own live walkthrough ("the create/post flow is the strongest part", `next-batch-brief.md:6-7`) and by the code: title is generated, time and duration are pre-filled (`NewPlaydatePage.tsx:115-127,240-245`). |
| C5 | The notification/install ask lands on a brand-new parent | 2 reviews + the 2026-09-25 audit | **Real and unfiled as stated → `D2`.** |

C1–C3 are the corpus's whole strategic content, and all three were already known.

---

## 3. The harvest — net-new, verified, not tracked anywhere

Severity is user impact; size is implementation. Nothing here is a redesign.

| ID | Defect | Evidence | Severity | Size |
|---|---|---|---|---|
| **D1** | **Cards assert an absence they never read.** "No one's going yet" renders whenever `goingLine === null`, and the profile/place call sites pass no ping data at all, so a drop-in with 2 families going is labelled as empty. The component's own comment (`DropInCard.tsx:257`) claims the loaded/null rule the code does not honour. | `DropInCard.tsx:556-559`; no `goingPings` at `ProfileView.tsx:997,1013`, `PlacePage.tsx:682`, `PlaceDetailsPage.tsx:695`; `feed.ts:1417` returns null at 0. Same lie already fixed once on the detail page (`task-state.md:819`) | **High** — the card is what a parent uses to decide whether to drive out | Medium (batched ping read + a loaded-gate on the absence copy) |
| **D2** | **Signup alone arms the notification ask.** A parent who has never posted or said "going" meets the push/install card on their first feed paint. | `LoginPage.tsx:149 armPushPromptForAction('signup')`; shell mount `App.tsx:526`; suppression list `push.ts:617-619` | **High** — it is the first thing a new parent sees, on top of an empty feed | Small (drop the `'signup'` trigger point) — but it edits a V25-recorded 3-point ladder, so it needs the founder's yes |
| **D3** | **The empty feed never says what is just outside the radius.** "Nothing within 5 miles yet." with escapes, and no count of what widening will reveal — so the escape is a gamble. | `feed.ts:2301`; escapes `feed.ts:2368-2389`; default pinned `feed.ts:72` | Medium | Small–medium (a pure selector + copy) |
| **D4** | **Your own drop-in can be missing from your own feed.** `listRadiusFeed` has no host exemption, so a 7-mi post vanishes at the 5-mi default, and the "Posted!" banner links nowhere. | `db.ts:599-640`; `feed.ts` `withinRadius` has no exemption; banner `FeedPage.tsx:1115` | Medium | Medium |
| **D5** | **The post form sends you to Settings and loses the draft.** "Add your kids in your settings" is a live `<Link>` out of a form whose state is plain `useState` with no persistence. | `PlaydateFormFields.tsx:661-664`; `NewPlaydatePage.tsx:340,418,440`; autosave exists only for the profile editor | Medium | Medium (inline kid row, or a draft seam). The open issue `.scratch/v28/issues/02-*` covers the *onboarding* hop only; this Settings hop affects any parent with no kids and is untracked |
| **D6** | **"Posted!" survives a reload.** Router state is not cleared on render; only Dismiss clears it, so the banner is still there after a refresh. | `FeedPage.tsx:225-229`; clearer only at `:1075-1078` | Medium — stale state reads as "it posted again" | Small |
| **D7** | **The create-account link is below the fold** on the reference device (390×664: page 692px, button bottom 692, 28px cut). Measured live, not inferred — and `scripts/mobile-audit.mjs` never asserts vertical containment. | `LoginPage.tsx:190,335-347`; audit viewports `mobile-audit.mjs:20-27` exclude 390×664 | Medium — it hides the new-parent path | Small (padding) + a guard |
| **D8** | **The required address field promises nothing about privacy, and ZIP is unreachable until an address fails.** The only "never shown to other parents" line lives inside the failure-only note. | `OnboardingPage.tsx:1809` (no privacy line), `:1978` (ZIP only after `zipFallbackShown`), `:1958-1961` (the note) | Medium | Small (copy + render ZIP as a peer option) — touches a settled decision, `task-state.md:56` |
| **D9** | **Two small copy/logic gaps in the post flow.** The help text names `@` without saying what it does (`PlaydateFormFields.tsx:373-377`), and there is no time-of-day sanity rule, so "Now" at 05:30 creates a 05:30 drop-in (`feed.ts:1948-1953, 911-935`). | as cited | Low | 1 line each |

One further verified finding is deliberately **not** numbered: Deepseek is right
that a "Happening now" card can be 10 mi away with 19 minutes left (`feed.ts:265`
— the badge is time-only and distance is a display label), but there is no
correct answer to "how urgent is too far", so it earns one line of card copy at
most, not a defect ticket.

---

## 4. Already tracked — do not re-plan these

- **Orientation / tooltips (C1)** — `plan.md:655-698` (r3-7), coupled to r3-8's guard reconciliation.
- **"Be the first parent here" empty-feed CTA (C2)** — `.scratch/next-batch-brief.md:56-77`; blocked, and it reverses a recorded V27 ruling. Needs the test, not a builder.
- **Onboarding interest chips (C2)** — `next-batch-brief.md:78-89`; blocked on the same test.
- **Signed-out front door (C3)** — needs an ADR (`.scratch/first-use-discovery-audit/spec.md`, Non-goals).
- **Seed real drop-ins** — `RELEASE-CHECKLIST.md:104-109`. This is the actual cold-start fix.
- **Radius-wide "notify me near me" (NFR 003 / Perplexity NFR 001)** — real, absent, and one more kind in an existing list (`push.ts:65-100`) — but it is a feature with an alert-volume cost in a city with 22 posts. Queue it behind seeding.
- **Host check-in "I'm here"** — already a recorded pin, deliberately absent (`task-state.md:90,1919`).
- **Invite a family with provenance** — r2-D7 says its own batch (`task-state.md:35`).
- **Search** — parked until a city has density (`next-batch-brief.md:91-97`).

## 5. Decline, and why

| Request | Source | Why not |
|---|---|---|
| Replace "event creation" with a status broadcast | Gemini PCR 002 | The premise is a control that does not exist. The form is already three decisions with a generated title. |
| Soft "Might drop by" third RSVP state | Gemini PCR 003 | The product is *already* commitment-free — `PRODUCT.md:31-38`, and the RSVP confirmation says so. Would add a migration to solve a solved problem. |
| Parent "vibe" tags | Gemini NFR 001 | No evidence; a free-text interests line (`ProfileView.tsx:837`) and four shipped vibe chips already cover it. |
| Notification cooldown after "Not now" | Perplexity PCR 005 | The 3-point ladder is deliberate and test-pinned (`push.ts:441-460`, `push.test.ts:1228-1240`). The real problem is `D2`, not the ladder. |
| "Duplicate notification copy" | Perplexity PCR 008 | **False.** The sentence appears once. Only the heading word repeats. |
| Signed-out preview of *real* nearby drop-ins | ChatGPT NFR 001 / Grok 001 | Not declined — **deferred to an ADR**, which the Sept spec already required. |

## 6. Recommended plan

**Step 0 — no code.** Run the 5-parent first-open test (`RELEASE-CHECKLIST.md:140-145`,
kit at `research/first-open-validation/2026-09-29-parent-test-scoring.md`). It
gates C2 and the two blocked items, and it is the only thing in this plan that
can settle the corpus's two biggest themes. ⚠️ **Do `D2` first or suppress the
prompt for testers**: the signup-armed push card appears on the first feed paint
and would contaminate the zero-instruction block the test scores.

**Step 1 — trust-defect batch (no product decisions needed, all verified, all small):**
`D1` (the absence lie — do this one first), `D3`, `D4`, `D6`, `D7`, `D9`.
Acceptance is a rendered regression per defect; `D1` needs the batched ping read
at the three call sites.

**Step 2 — founder decisions (small, each reverses a recorded rule):**
`D2` (drop the signup trigger point), `D8` (address privacy line + ZIP as a peer
option), and the header `Sign out` — a permanent one-tap control with no confirm
(`App.tsx:456-463`) whose only cost is a password reset, so it is a founder call,
not a defect.

**Step 3 — medium, one batch:** `D5` (draft persistence + inline kids), then `D4`'s
banner half if Step 1 took only the query half.

**Step 4 — ADR:** the signed-out front door. Cheapest honest version reuses the
public detail surface that already exists rather than inventing a marketing page;
it must not leak child identities, comments, or attendee lists.

**Do not start Phase 2 (the Android shell) later because of this list.** The store
clock is the critical path; Steps 0–2 are hours, not days, and run in parallel.

## 7. What would change this plan

- If the 5-parent test triggers watch-risk `W` (parents reach for "show me what's around" over create), the empty-state work grows and C2's blocked CTA changes shape — as the kit already predicts.
- If seeding (`RELEASE-CHECKLIST.md:104-109`) happens first, the empty-state items (`D3`, C2) drop in value immediately and `D1`/`D4` rise: with real supply, a lying card costs more.
- If the signed-out ADR chooses a real preview, C1's tooltip slice becomes secondary.

## 8. Hygiene

The corpus lives only in the Obsidian vault. Only the Deepseek run is in this
repo (`docs/product/user-simulation-product-changes-2026-10-04.md`, currently
**untracked**), and `.scratch/sim/` is untracked too. If the corpus is to be
cited by future sessions, commit it — five markdown files under
`docs/product/adversarial-review-2026-10-04/` — or the evidence for this triage
disappears with the working tree.
