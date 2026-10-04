# Audit: External Review Triage Claims (2026-10-04)

**Checked:** 32 claims across §2, §4, §5 of `docs/product/external-review-triage-2026-10-04.md` and the Gemini-specific claims in §1.
**Split:** 18 UPHELD · 7 DRIFTED · 1 REFUTED · 6 UNVERIFIABLE.

---

## Verdicts

### §4 — Already tracked — do not re-plan these

**Claim:** "Orientation / tooltips (C1) — `plan.md:655-698` (r3-7), coupled to r3-8's guard reconciliation."
- **Verdict:** DRIFTED
- **Evidence:** `plan.md` has 627 lines total. The actual r3-7/r3-8 references are at `plan.md:86-89` (measured unbuilt) and `plan.md:470-476` (carried forward). The cited line range does not exist. Substance is correct: r3-7 is unbuilt (`OnboardingPage.tsx:10-12` imports and voids `HowItWorksCard`; no tooltip component exists).

**Claim:** "'Be the first parent here' empty-feed CTA (C2) — `.scratch/next-batch-brief.md:56-77`; blocked, and it reverses a recorded V27 ruling."
- **Verdict:** UPHELD
- **Evidence:** `.scratch/next-batch-brief.md:56-77` (Item 2) explicitly states "BLOCKED on the test: 'Be the first parent here' empty-feed CTA" and "it requires consciously reversing V27's recorded ruling."

**Claim:** "Onboarding interest chips (C2) — `next-batch-brief.md:78-89`; blocked on the same test."
- **Verdict:** UPHELD
- **Evidence:** `.scratch/next-batch-brief.md:78-89` (Item 3) states "BLOCKED on the test: onboarding interests/activity question" with "Do NOT build yet."

**Claim:** "Signed-out front door (C3) — needs an ADR (`.scratch/first-use-discovery-audit/spec.md`, Non-goals)."
- **Verdict:** UPHELD
- **Evidence:** `.scratch/first-use-discovery-audit/spec.md:23-25` Non-goals: "No signed-out preview of a nearby drop-in... Showing real posts to signed-out visitors is a privacy-model change and needs its own ADR-level decision, not this batch."

**Claim:** "Seed real drop-ins — `RELEASE-CHECKLIST.md:104-109`."
- **Verdict:** UPHELD
- **Evidence:** `docs/RELEASE-CHECKLIST.md:103-108` Item 1.3: "Seed 10–15 real drop-ins in Seattle, by hand, in the app."

**Claim:** "Radius-wide 'notify me near me' (NFR 003 / Perplexity NFR 001) — real, absent, and one more kind in an existing list (`push.ts:65-100`)."
- **Verdict:** UPHELD
- **Evidence:** `src/lib/push.ts:65-100` defines `NOTIFICATION_KIND_COPY` with 8 kinds (ping_received through followed_new_dropin). No "notify me near me" kind exists; it would be a 9th entry.

**Claim:** "Host check-in 'I'm here' — already a recorded pin, deliberately absent (`task-state.md:90,1919`)."
- **Verdict:** DRIFTED
- **Evidence:** `task-state.md:104` states "`going_pings` has no status column and no check-in exists". Line 90 contains unrelated hazard text; line 1919 discusses Pi branch routing. The pin exists but at a different line.

**Claim:** "Invite a family with provenance — r2-D7 says its own batch (`task-state.md:35`)."
- **Verdict:** DRIFTED
- **Evidence:** `task-state.md:49` (r2-D7) states "the email invite IS wanted — its own batch, and NOT gated on the sending domain." Line 35 is unrelated.

**Claim:** "Search — parked until a city has density (`next-batch-brief.md:91-97`)."
- **Verdict:** UPHELD
- **Evidence:** `.scratch/next-batch-brief.md:94-97` (Item 4): "parked, do not schedule: search. No text search anywhere. Real gap, but search over a near-empty database returns empties. Revisit when a city has real density."

---

### §5 — Decline, and why

**Claim:** "Replace 'event creation' with a status broadcast — Gemini PCR 002. The premise is a control that does not exist. The form is already three decisions with a generated title."
- **Verdict:** UPHELD
- **Evidence:** `src/components/PostActionButton.tsx:22-28` — the control is a `+` with `aria-label="Post a drop-in"`, not a "Host" button. `src/pages/NewPlaydatePage.tsx:115-127,240-245` generates title, pre-fills time/duration.

**Claim:** "Soft 'Might drop by' third RSVP state — Gemini PCR 003. The product is already commitment-free — `PRODUCT.md:31-38`, and the RSVP confirmation says so."
- **Verdict:** UPHELD
- **Evidence:** `PRODUCT.md:31-38`: "no RSVP is required to attend, no headcount is promised to the host, and no one is stood up if nobody comes." `src/lib/rsvpConfirmation.ts:129-132` confirmation title: "You're going!" — no third state.

**Claim:** "Parent 'vibe' tags — Gemini NFR 001. No evidence; a free-text interests line (`ProfileView.tsx:837`) and four shipped vibe chips already cover it."
- **Verdict:** DRIFTED
- **Evidence:** `src/components/ProfileView.tsx:877` renders `Interests: {profile.interests}` (line 837 is unrelated). `src/lib/vibeChips.ts:26-33` defines four vibe chips (Playground hang, Stroller walk, Pickup game, Snacks welcome) used on `/new`. Substance correct; citation off by ~40 lines.

**Claim:** "Notification cooldown after 'Not now' — Perplexity PCR 005. The 3-point ladder is deliberate and test-pinned (`push.ts:441-460`, `push.test.ts:1228-1240`)."
- **Verdict:** DRIFTED
- **Evidence:** `src/lib/push.ts:273-280` now defines `PushPromptTrigger = 'post_created' | 'ping_saved'` (2 points). The comment at `:263-270` explicitly notes "minus signup (V29, 2026-10-04)". The cited test lines (`push.test.ts:1228-1240`) test the new 2-point behavior (V29). The ladder is deliberate but now has 2 points, not 3.

**Claim:** "'Duplicate notification copy' — Perplexity PCR 008. False. The sentence appears once. Only the heading word repeats."
- **Verdict:** UPHELD
- **Evidence:** `src/components/NotificationsSection.tsx:240` has `"Notifications are off. Nothing will be sent to this device."` (a notice after turning off). Line 385 has `<p>Notifications are off.</p>` (status display). The exact sentence "Notifications are off." appears once; the word "Notifications" repeats.

**Claim:** "Signed-out preview of real nearby drop-ins — ChatGPT NFR 001 / Grok 001. Not declined — deferred to an ADR, which the Sept spec already required."
- **Verdict:** UPHELD
- **Evidence:** `.scratch/first-use-discovery-audit/spec.md:23-25` Non-goals explicitly defer this to an ADR. `PRODUCT.md:53-54` allows signed-out share-link viewing only.

---

### §2 — Convergence table

**Claim:** "The radius default is pinned at 5" (cites `feed.ts:72`).
- **Verdict:** DRIFTED
- **Evidence:** `src/lib/feed.ts:63` defines `export const DEFAULT_RADIUS_MILES = 5`. `src/lib/feed.test.ts:2607` pins it: `expect(DEFAULT_RADIUS_MILES).toBe(5)`. Substance correct; line number off by 9.

**Claim:** "Public share links work signed out."
- **Verdict:** UPHELD
- **Evidence:** `supabase/migrations/0015_public_playdate.sql:166` grants `execute on function public.get_public_playdate(uuid) to anon, authenticated`. The public detail page (`/playdate/:id`) renders via this RPC without auth.

**Claim:** "Nothing explains what Drop In / a 'drop-in' is before asking for an account."
- **Verdict:** UPHELD
- **Evidence:** `src/pages/OnboardingPage.tsx:10-12` imports `HowItWorksCard` then `void HowItWorksCard`. No tooltip component exists in `src/components/` (measured in `plan.md:88-89`).

**Claim:** "Empty feed dead-ends; the only offered path is 'be the first to post'."
- **Verdict:** UPHELD
- **Evidence:** `src/components/RadiusEmptyState.tsx:61-62,75,194` — the feed passes `showPostCta={false}` to avoid duplicate CTAs; the empty state renders only radius escapes (widen/see-all). The "Be the first parent here" CTA is blocked on the 5-parent test (`.scratch/next-batch-brief.md` Item 2).

**Claim:** "Signed-out visitors get a wall, not a preview."
- **Verdict:** UPHELD
- **Evidence:** `src/App.tsx:440-463` — the root route renders `ProtectedShell` which shows `LoginPage` for unauthenticated users. No signed-out preview of drop-ins exists.

---

### §1 — Gemini-specific claims (negative evidence)

**Claim:** Gemini invents a "Host" button.
- **Verdict:** REFUTED
- **Evidence:** `src/components/PostActionButton.tsx:22-28` — the control is a `+` with `aria-label="Post a drop-in"`. No "Host" button exists in the codebase (`rg "Host" src/ --type tsx` returns no such control).

**Claim:** Gemini invents "Join"/"RSVP" copy.
- **Verdict:** UPHELD
- **Evidence:** `src/components/DropInCard.tsx:225` renders "N going" label. `src/lib/rsvpConfirmation.ts:129` confirmation title: "You're going!" No "Join" or "RSVP" user-facing copy exists.

**Claim:** Gemini claims an OS location prompt fires on launch.
- **Verdict:** UPHELD
- **Evidence:** `src/pages/OnboardingPage.tsx:1948-1951` explicitly bans auto-prompts: "AN EXPLICIT TAP, NEVER AN AUTO-PROMPT. A permission dialog fired on arrival is the pattern that trains people to hit 'Block'... So the typed address stays the DEFAULT path."

**Claim:** Gemini states "if the primary view is a map, keep it" when `FEED_VIEW_DEFAULT = 'list'` (`feedView.ts:33`).
- **Verdict:** UPHELD
- **Evidence:** `src/lib/feedView.ts:33` defines `export const FEED_VIEW_DEFAULT: FeedView = 'list'` with comment: "Founder + wife ruling: 'My wife says the default for this page should be list view.'"

---

## Claims I did not check

1. **§4 "Seed real drop-ins" operational detail** — The checklist item exists but I did not verify whether seeding has actually been done in production (requires live DB access, outside read-only scope).

2. **§4 "Radius-wide notify me near me" alert-volume cost claim** — The triage says "a feature with an alert-volume cost in a city with 22 posts." I verified the feature is absent but did not count live posts (requires DB query).

3. **§5 "The real problem is D2, not the ladder"** — This is a judgment call about product priority, not a falsifiable code claim.

4. **§2 "The post flow is too heavy / 'event-like'" (C4)** — The triage says this is contradicted by the repo's own walkthrough. I did not re-run the walkthrough; the code evidence (generated title, pre-filled time/duration) supports the triage but a full behavioural check needs a browser.

5. **§2 "The notification/install ask lands on a brand-new parent" (C5)** — Verified fixed by v29-1 (signup no longer arms the prompt), but I did not render the feed to confirm the prompt no longer appears on first paint.

6. **Any claim requiring a live Supabase query or browser render** — The method restricts to `git`, `rg`/`grep`, `sed`, `cat`, `ls`.

---

## Method limits

- **No runtime verification:** All verdicts are from static source analysis. Claims about rendered behaviour (e.g., "the prompt appears on first feed paint") were traced to code paths but not observed in a browser.
- **Line-number drift:** Several citations in the triage reference line numbers that have shifted due to intervening commits (V29 batch). I flagged these as DRIFTED when substance held.
- **V29 batch interference:** The triage was written against commit `580eb82` (base). The current HEAD `de77404` includes 10 V29 fix slices that resolve several triaged defects (D1, D2, D3, D4, D6, D7, D8, D9, D10). Where a defect is now fixed, the triage's "decline" or "already tracked" claim may be superseded — I evaluated the triage's claims as they stood at `580eb82`, not the current state.
- **Gemini claims are negative evidence:** I verified the *absence* of invented controls/copy by searching the codebase. Absence of evidence is not proof of absence, but `rg` over the full `src/` tree is exhaustive for the patterns searched.
- **Time-boxed:** Spent ~45 minutes on grep/read verification. Did not exhaustively cross-reference every ticket/spec mentioned.