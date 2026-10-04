# Implementation Plan: V29 — the external review's trust defects

> Owned by the orchestrator. Written BEFORE any builder dispatch. V28 r3's plan is
> preserved **byte-identically** at `plan-v28-r3-backup.md`; V29 supersedes it for
> the ten items below, and **carries r3's two open slices forward** (§6) rather
> than dropping them when the file was replaced.
>
> The default slice gate is **`npm run verify`** (build + test + lint + a11y:focus +
> steering-lint + guards). Anything extra is pinned per slice.

**Bottom line:** five external model reviews produced 39 change requests. Verified
against the code at `580eb82`, **17 survive, collapsing into 10 changes** — nine
verified defects and one copy fix. Three of them needed a founder decision and all
three were given on 2026-10-04. Ten slices below, blockers first, acceptance
criteria and a verification command each, **before any builder is dispatched.**

- **Base:** `580eb82` on `master` — ⚠️ **working tree dirty** (six modified tracked
  files, §2). Production is still V27. Nothing in this plan is pushed.
- **Gate measured THIS TURN, not remembered:** `npm run verify` → **exit 0**;
  **73 test files / 2121 tests passed**; **81 lint warnings / 0 errors**;
  `AGENTS.md` **1787 words**; **GUARDS: PASS** (factory-guard checker: **185
  checks passed**). **Baseline that must not regress: 73 / 2121 / 81 / 0.**
- **Source of truth for each item:** `docs/product/external-review-triage-2026-10-04.md`
  (the triage), then `.scratch/trust-defects-2026-10/spec.md` with
  `issues/01`–`issues/10` (the tickets). This plan owns sequencing and the pinned
  interfaces; the tickets own the detail.

---

## 1. What this revision is

| Slice | Item | Ticket | Source | Size | Risk |
|---|---|---|---|---|---|
| **v29-0** | Get the base attributable | — | §2 | minutes | none — **precondition** |
| **v29-1** | Drop the signup arming point on the push ask | 02 | Deepseek PCR 008 | small | 🔴 **gates the 5-parent test** |
| **v29-2** | A card must not assert an absence it never read | 01 | Deepseek PCR 007 + Perplexity PCR 007 | medium | honesty bug — **highest severity** |
| **v29-3** | The "Posted!" banner must not outlive the post | 03 | Deepseek PCR 010 | small | stale-state trust bug |
| **v29-4** | Create-account below the fold at 390×664 | 04 | Deepseek PCR 010 | small | + a new guard assertion |
| **v29-5** | The bare `@`, and no time-of-day rule | 05 | Perplexity PCR 004 + 006 | small | two tiny changes, one form |
| **v29-6** | The empty feed must say what is just outside the radius | 06 | Deepseek PCR 002 | small | copy only — the CTA stays out |
| **v29-7** | Your own drop-in in your own feed | 07 | Perplexity PCR 003 | medium | touches the feed query |
| **v29-8** | The first screen must say what this is | 08 | Grok 002 + ChatGPT 001 + Perplexity 001 | small | ⚠️ shared-fixture coupling |
| **v29-9** | The area card: privacy line + ZIP as a peer | 09 | ChatGPT 002 + Grok 005 | small | ⚠️ supersedes a settled decision |
| **v29-10** | Sign out moves into Settings | 10 | Deepseek PCR 009 | small | header/tab-order change |
| **v29-11** | Batch close: full suite, lanes, sweep, handoff | — | — | — | — |

---

## 2. The measured state of the base (do not trust this prose either — re-run it)

### 2.1 The tree is dirty, and that is a precondition, not a detail

`git status --short` at planning time shows **six modified tracked files** —
`AGENTS.md` (−4 net lines), `PRODUCT.md`, `docs/RELEASE-CHECKLIST.md`,
`docs/agents/e2e-fixture-convention.md`, `index.html`, `scripts/guards/run-all.sh`
— plus untracked `.impeccable/`, `.claude/`, `.github/hooks/`, `.scratch/…`,
`docs/product/user-simulation-product-changes-2026-10-04.md`, `DESIGN.md`.

The gate above passed **on that tree**, so the baseline is real. But a slice diff
taken against `580eb82` will attribute someone else's in-flight work to the
builder. **v29-0 exists to fix that.**

### 2.2 ⚠️ `index.html` carries a live-injector script

```
<!-- impeccable-live-start -->
<script src="http://localhost:8400/live.js?token=…"></script>
<!-- impeccable-live-end -->
```

`dist/` is gitignored, so this cannot be committed through `dist/` — **but
`dist/index.html` currently contains it**, and the native-app plan **bundles
`dist/`** into the Capacitor shell. A shell assembled from today's `dist/` would
ship a script tag pointing at `localhost:8400`. Remove it from `index.html`
before any `dist/` is bundled or hand-deployed, and re-check `dist/` after.

### 2.3 Every browser check in this batch writes to the LIVE database

`e2e/.e2e-target.json` declares `testRefs: []` and a **production** waiver with
`expires: 2026-11-15`. So each e2e command below writes marker fixtures to
production and **must be followed by the marker sweep**
(`node scripts/sweep-e2e-markers.mjs select`, then `delete`/`verify` per
`docs/agents/e2e-fixture-convention.md`). This is not a new problem; it is a
standing one that this batch's verification volume makes worse.

### 2.4 r3-7 has NOT shipped (measured, not read)

`src/pages/OnboardingPage.tsx:10` imports `HowItWorksCard`, `:12` is
`void HowItWorksCard`, and no tooltip component exists in `src/components/`.
**The corpus's single strongest finding — nothing tells a new parent what a
drop-in is — maps to the still-unbuilt r3-7.** See §6; do not let the file swap
lose it.

---

## 3. Interfaces pinned before dispatch

1. **The four founder decisions (2026-10-04) are binding:**
   (a) signup alone no longer arms the notification ask — only a created post or a
   saved "I'm going" does; (b) the area card gains the privacy line **and** renders
   ZIP as a peer option; (c) the empty feed gains the beyond-radius count, and
   **suggested places wait** for the 5-parent test; (d) sign out moves into
   Settings and leaves the header.
2. **The absence rule (v29-2).** A card may say "No one's going yet" only when
   ping data is **loaded and empty**. Three states — loading (no line), loaded-empty
   (the sentence), loaded-nonempty (the real line). Never infer "loaded" from an
   empty array. **Silence, not a lie.** Mirror the detail page's existing
   unavailable-state precedent.
3. **The push ladder is otherwise untouched (v29-1).** The post point, the ping
   point, max-one-offer-per-point, and the four suppressed paths all stay.
4. **`LoginPage.tsx` is a serialization point.** v29-4 (layout) and v29-8 (copy)
   both edit it — land 4 **before** 8. ⚠️ `e2e/fixtures.ts:399` locates the toggle
   by its **exact current text** (`'New here? Create an account'`), so v29-8
   updates a shared helper, not just a page.
5. **The area card supersession must be recorded (v29-9).** `task-state.md:56`
   settled "address-first with ZIP fallback" and
   `.scratch/first-use-discovery-audit/spec.md:27-29` scoped the batch to making
   only the *fallback legible*. Decision (b) supersedes both. The builder's report
   must say so, so the reviewer judges against the new decision.
6. **The empty feed changes its sentence, not its controls (v29-6).**
   `showPostCta` stays `false` (recorded V27 ruling, blocked on the test) and
   `DEFAULT_RADIUS_MILES` stays `5` (`src/lib/feed.test.ts:2464`).
7. **The build law applies to every slice.** Domain rules live in `src/lib/` as
   pure functions with injected dependencies, and every `lib/*.ts` ships a
   `lib/*.test.ts` sibling. React renders; it does not decide.
8. **A source grep is not a rendered assertion.** Every slice's regression must
   observe the rendered screen — the 2026-09-25 audit's own rule, adopted after the
   stray developer comment survived a source-only check.

---

## 4. Sequencing, and why it is not the triage's order

1. **v29-1 first, because it is the only true blocker.** The 5-parent first-open
   test scores a zero-instruction block; the signup-armed push prompt appears on
   the first feed paint and would be scored instead of the empty feed. Nothing
   else in this batch has that property.
2. **Then v29-2**, the highest-severity defect: it is on the surface a parent uses
   to decide whether to drive out.
3. **`LoginPage.tsx` slices serialized: v29-4 → v29-8** (interface 4).
4. **Card/feed slices serialized: v29-2 → v29-7.** Both touch the card and the
   feed's assembly; two builders there would collide, and v29-7's exemption can
   silently drop the pings v29-2 just taught the card to read.
5. **v29-3, v29-5, v29-6, v29-9, v29-10 are independent** and may run in any
   order after their own dependencies.
6. **v29-11 closes the batch** — the full suite runs once here, not per slice,
   except where a slice's ticket demands it.

---

## 5. Slices

Every slice: base = the previous slice's tip (or the batch base for the first
parallel slice); gate `npm run verify` exit 0; review lanes as usual
(`orchestrator-reviewer` on the diff, `ocr` at the end, verifier for the raw
commands). **Never delete a test that pins old copy — update it.**

### v29-0 — Get the base attributable (orchestrator + human; no builder)

**Scope:** the six modified tracked files and the untracked artefacts in §2.1;
remove the `impeccable-live` block from `index.html` (§2.2).

**Acceptance criteria**
1. `git status --short` is either clean or contains **only** files this batch
   deliberately leaves untracked, and that list is written in the batch ledger.
2. The in-flight doc/guard work is committed as its **own** commit (message names
   it as pre-batch WIP) or parked, so no slice diff is blamed for it.
3. `index.html` contains no `impeccable-live` block; `grep -c impeccable-live
   index.html dist/index.html` returns 0.

**Verification**
```bash
git status --short
grep -c impeccable-live index.html dist/index.html || true
npm run verify
```

**Must not:** delete the human's tooling directories (`.impeccable/`, `.claude/`);
squash pre-batch work into a slice commit.

---

### 🔴 v29-1 — Drop the signup arming point on the push ask (ticket 02)

**Scope:** `src/pages/LoginPage.tsx:149`, `src/lib/push.ts`
(`PushPromptTrigger`, `decidePermissionPrompt`), `src/lib/pushClient.ts` if it
enumerates triggers, `src/lib/push.test.ts`.

**Acceptance criteria**
1. Completing signup and landing on the feed shows **no** push card and **no**
   install note.
2. The ask still appears after a created post or a saved "I'm going", with today's
   deferral intact.
3. "Not now" still records the point; one offer per point; `/settings`,
   `/onboarding`, `/new` still suppress.
4. `push.test.ts` pins the new rule ("signup alone earns no ask") — updated, not
   weakened.

**Verification**
```bash
npm run verify
npm run test:e2e -- e2e/push-subscribe.e2e.ts
```

**Must not:** touch the other two trigger points; change the fallback sentence.
**Blocks:** the 5-parent first-open test. Say so in the report.

---

### 🔴 v29-2 — A card must not assert an absence it never read (ticket 01)

**Scope:** `src/components/DropInCard.tsx`, the batched ping read in
`src/lib/db.ts` (+ sibling test), and the three call sites —
`src/components/ProfileView.tsx:997,1013`, `src/pages/PlacePage.tsx:682`,
`src/pages/PlaceDetailsPage.tsx:695`.

**Acceptance criteria**
1. A profile or place card for a post with ≥1 going ping renders the real going
   line — the same line the feed renders for that post.
2. When ping data has not loaded or the read failed, the card renders **no absence
   line at all** (interface 2).
3. The feed's two-variant wording is unchanged.
4. A **rendered** regression: ≥1 going ping → host's profile → count on screen,
   absence string not.

**Verification**
```bash
npm run verify
npm run test:e2e -- e2e/profile-posts.e2e.ts e2e/card-circles.e2e.ts
```

**Must not:** infer loaded-ness from an empty array; change the feed's own
wording; widen the ping read beyond what the call sites need.
**Split rule:** if the diff does not fit one builder context, split at the `lib/`
seam (read + pure selector first, call sites second) and report both bases.

---

### 🟡 v29-3 — The "Posted!" banner must not outlive the post (ticket 03)

**Scope:** `src/pages/FeedPage.tsx:225-229` and the banner at `:1115`.

**Acceptance criteria**
1. The banner shows once after a post; a reload does **not** restore it, nor does
   navigating away and back.
2. Dismiss still clears it immediately.
3. The banner offers a way to open the post it announces, or a comment says why
   not and the report records the decision.
4. Share is unchanged.

**Verification**
```bash
npm run verify
npm run test:e2e -- e2e/share-after-post.e2e.ts
```
No existing spec covers `justPosted` — add the reload assertion (rendered).

**Must not:** clear it by React state alone (that leaves `history.state` dirty and
the banner returns).

---

### 🟡 v29-4 — Create-account below the fold at 390×664 (ticket 04)

**Scope:** `src/pages/LoginPage.tsx` (container `:190`, toggle `:335-347`),
`scripts/mobile-audit.mjs`.

**Acceptance criteria**
1. At 390×664, the create-account control is fully visible without scrolling.
2. `mobile-audit.mjs` gains a **vertical-containment** check that fails when a
   primary control's bottom exceeds `clientHeight`, at every viewport it already
   visits.
3. No horizontal-overflow regression; tap targets ≥44px; the tagline stays.
4. The signed-in "Sign out" variant of the screen still works.

**Verification**
```bash
node scripts/mobile-audit.mjs
npm run verify
```

**Must not:** shrink a control below 44px; remove the tagline to buy space.
**Note:** if the audit script stays outside `npm run verify`, say so — then the e2e
assertion is the only automated pin.

---

### 🟡 v29-5 — The bare `@`, and no time-of-day rule (ticket 05)

**Scope:** `src/components/PlaydateFormFields.tsx:373-377`;
`src/lib/feed.ts` (`nextSlotMinutes` `:1948-1953`, `validatePlaydateForm`
`:911-935`) + `src/lib/feed.test.ts`.

**Acceptance criteria**
1. The help text says what `@` does, or drops the token; a rendered assertion pins
   it.
2. An unreasonable start hour is refused with an explanation or flagged before
   submit; the rule is pure, lives in `lib/`, is commented, and is pinned by a unit
   test.
3. `Now` / `In an hour` / `Tomorrow 10am` / `Sat 10am` still work.

**Verification**
```bash
npm run verify
npm run test:e2e -- e2e/time-presets.e2e.ts e2e/place-directory-in-new.e2e.ts
```

**Must not:** block the ordinary case — a parent at a playground starting one
*now*. The narrow rule is "a small-hours start **today**", not "any early hour".

---

### 🟡 v29-6 — The empty feed must say what is just outside the radius (ticket 06)

**Scope:** a pure selector in `src/lib/feed.ts` + `src/lib/feed.test.ts`,
`src/components/RadiusEmptyState.tsx`, the call site at
`src/pages/FeedPage.tsx:1273-1279`.

**Acceptance criteria**
1. Radius empty **but the fetched set is not** → the state says how many are just
   outside, and widening still works.
2. Fetched set genuinely empty → **no invented count**, no "0 nearby".
3. `Nothing within N miles yet.` survives when true.
4. `DEFAULT_RADIUS_MILES = 5` unchanged.
5. Unit coverage: zero fetched / some outside / some inside.

**Verification**
```bash
npm run verify
npm run test:e2e -- e2e/feed-empty-state.e2e.ts
```

**Must not:** re-enable `showPostCta` (interface 6); require a new query — if the
count needs one, **stop and report**; that changes the ticket's shape.

---

### 🟡 v29-7 — Your own drop-in in your own feed (ticket 07)

**Scope:** `src/lib/db.ts:599-640` (`listRadiusFeed`), and `src/lib/feed.ts`
+ sibling test if the rule is expressed as a pure filter.

**Acceptance criteria**
1. A viewer's own **active** drop-in appears in their radius feed regardless of
   distance.
2. No other viewer's results change — self-exemption only.
3. Ended/cancelled posts stay excluded; "See past drop-ins" keeps working.
4. Unit coverage: own post outside radius → included; another parent's at the same
   distance → excluded.

**Verification**
```bash
npm run verify
npm run test:e2e -- e2e/zip-radius.e2e.ts e2e/feed-empty-state.e2e.ts
```

**Must not:** solve it by warning at post time instead; drop the pings from the
assembled rows (cover it in the e2e); touch `e2e/card-circles.e2e.ts`'s
degradation expectations.

---

### 🟡 v29-8 — The first screen must say what this is (ticket 08)

**Scope:** `src/pages/LoginPage.tsx`; `e2e/fixtures.ts:399` if the toggle's text
changes.

**Acceptance criteria**
1. A first-time visitor can say what Drop In is and what they would do with it
   after reading the sign-in screen, without tapping.
2. The copy describes the low-commitment promise in a parent's words — an open
   invitation to a time and place, no RSVP needed to show up.
3. Sign-in stays the default for returning parents; create-account stays at least
   as visible.
4. No claim about current local activity.
5. A rendered assertion pins the copy.

**Verification**
```bash
npm run verify
npm run test:e2e -- e2e/privacy-preview.e2e.ts e2e/signup-zip-fallback.e2e.ts
```

**Must not:** add a signed-out preview of real drop-ins (needs its own ADR); leave
`e2e/fixtures.ts` stale — a locator that no longer matches fails the whole suite.

---

### 🟡 v29-9 — The area card: privacy line + ZIP as a peer (ticket 09)

**Scope:** `src/pages/OnboardingPage.tsx` area card (`~:1773-2050`),
`src/lib/firstRunCopy.ts:102-106`, `src/lib/firstRun.ts` + test if the card's shape
changes.

**Acceptance criteria**
1. The privacy promise (never shown to other parents) appears **at the field**,
   before submission, on both paths.
2. A parent can choose ZIP **without** submitting an address first, visible without
   scrolling past the address field.
3. Address still geocodes into `home_zip`; the failure path still explains itself;
   account creation is never blocked.
4. Nothing more precise than the existing model is stored or exposed.
5. Rendered assertions for both paths.

**Verification**
```bash
npm run verify
npm run test:e2e -- e2e/signup-zip-fallback.e2e.ts e2e/onboarding-gate.e2e.ts
```

**Must not:** make the address field optional as a side effect; break
`docs/adr/0001-home-zip-stops-being-a-gate.md` (a ZIP must stay sufficient).
**Report requirement:** record the supersession of `task-state.md:56` (interface 5).

---

### 🟡 v29-10 — Sign out moves into Settings (ticket 10)

**Scope:** `src/App.tsx:456-463` (remove), `src/components/AccountSection.tsx`
(add; `signOutUser` is already imported and used after deletion only).

**Acceptance criteria**
1. A parent can sign out from Settings' Account section, beside Download and
   Delete.
2. No sign-out control remains in the header on any signed-in screen; the gear
   stays.
3. `/login`'s own "Sign out" for a signed-in visitor is **kept**.
4. Signing out lands on `/login` exactly as before.
5. Gate green, including `a11y:focus` (header tab order changes).

**Verification**
```bash
npm run verify
```
No e2e covers sign-out today — add one (sign in → Settings → sign out → `/login`).

**Must not:** add a confirm dialog silently (say so in the report instead); touch
the `/onboarding` header suppression.

---

### v29-11 — Batch close (orchestrator; no builder)

**Acceptance criteria**
1. Full suite run once: `npm run test:e2e` — result recorded with its flake names,
   or the flakes re-confirmed as named in `docs/RELEASE-CHECKLIST.md:276-279`.
2. `ocr` review run over the batch range, output to `.scratch/ocr-v29.json`, its
   findings adjudicated (accepted / refuted with evidence).
3. Marker sweep: `node scripts/sweep-e2e-markers.mjs select` → confirm no fixture
   residue from this batch's runs.
4. `task-state.md` + the batch ledger updated with: each slice's base/head, the
   gate result, observed token spend, and every recorded deviation.
5. The 5-parent first-open test handed over as **clean** — v29-1 landed, so the
   scored block sees the empty feed, not the push prompt.

**Verification**
```bash
npm run verify
npm run test:e2e
node scripts/sweep-e2e-markers.mjs select
```

---

## 6. Carried forward from r3 — NOT dropped by the file swap

`plan-v28-r3-backup.md` holds both in full. Neither is in this batch's slices;
both are still open and must not be silently lost:

- **r3-7 — lightboxed tooltips on app load.** Measured still unbuilt (§2.4). It is
  the *in-app* half of the corpus's strongest finding; **v29-8 is the pre-auth
  half**. `HowItWorksCard.tsx` and `src/lib/firstRunTour.ts` exist and are
  guard-coupled and are that slice's copy source.
- **r3-8 — the guard/declaration reconciliation** that r3-7 forces
  (`TOUR_TAXONOMY_CLAIMS` in `src/lib/firstRunTour.ts:205` ↔
  `scripts/guards/copy-taxonomy-guard.mjs:124`). Sequence after r3-7.

If the human wants the corpus's C1 closed properly rather than half-closed, fold
r3-7 + r3-8 into this batch as v29-12/v29-13 — they are already specified.

---

## 7. Non-goals (with the reason)

- **Suggested places in the empty feed** — founder decision (c); blocked on the test.
- **A post CTA inside the empty feed** — reverses a recorded V27 ruling.
- **A signed-out preview of real nearby drop-ins** — needs an ADR
  (`.scratch/first-use-discovery-audit/spec.md`, Non-goals).
- **A push cooldown after "Not now"** — the three-point ladder is deliberate and
  test-pinned; only the signup point changes.
- **Any change to the post flow's shape** — four reviewers asked; the code already
  generates the title and pre-fills time and duration.
- **New notification kinds, host check-in, invite-with-provenance, search, vibe
  tags** — queued or declined in the triage doc (§4-5).
- **The form-draft fix** — its own spec
  (`.scratch/new-form-draft-2026-10/spec.md`), one decision outstanding.
- **The Android shell** — unaffected by this batch and still the critical path.
  Every day it slips adds a day to launch (12 testers × 14 continuous days).

---

## 8. Risks / open questions

1. **The e2e suite writes to production** (§2.3) under a waiver expiring
   **2026-11-15**. This batch adds browser checks on nine slices; the marker sweep
   at v29-11 is not optional.
2. **`e2e/fixtures.ts:399`** couples the whole suite to the create-account text.
   v29-8 is the slice most likely to turn a copy fix into a suite-wide red — and
   the fix is the shared helper, not the spec.
3. **v29-9 knowingly reverses a settled decision** (`task-state.md:56`). The guard
   against drift is the report requirement, not a comment in the code.
4. **v29-2 may not fit one builder context** (lib + component + three pages). The
   split rule is pinned in the slice; a builder that runs out of window must stop
   and report, not compress.
5. **Open decision, does not block anything:** the form draft
   (`.scratch/new-form-draft-2026-10/spec.md`) — inline kids editor (A), round trip
   with a draft (B), or both (C).
6. **Open, not this batch:** the `task-state.md` V28-incident entry quotes the
   deploy command with project ref `ayzvjwxyrcgyoeaxuk`; the live ref is
   `ayzvjwxbxyrcgyoeaxuk` (`.env`, `e2e/.e2e-target.json`). A future copy-paste of
   that line fails; correct the record when convenient.

---

## 9. Status log (orchestrator appends after every phase transition)

    V29 planned (base 580eb82, tree dirty): 11 slices + 1 precondition, gate exit 0,
      73 files / 2121 tests / 81 warnings / 0 errors / guards 185 PASS
    V29 v29-0: not started — pre-batch WIP deliberately left unstaged
    V29 v29-1: DONE (commit dbb02cb) — signup is no longer a push trigger point;
      gate EXIT=0 (73 files / 2122 tests / 81 warnings / 0 errors / GUARDS PASS);
      e2e push-subscribe 9 passed. Dispatched inline (DSH session; the opencode
      orchestrator-* lane is unavailable — the deviation V27/V28 recorded)
    V29 v29-2: DONE (commit 21fb9c4) — a card may only claim what it read;
      goingPingsLoaded defaults false, all four call sites pass it, the failure
      paths keep null instead of {}; goingPingsByPost is the one grouping rule.
      Gate EXIT=0 (73 files / 2125 tests / 81 warnings / 0 errors / GUARDS PASS);
      e2e card-circles + profile-posts 3 passed (new host-PROFILE assertion)
    V29 v29-3: DONE (commit 85a9e59) — the "Posted!" banner is consumed on mount,
      so a reload cannot re-announce the post; its title now links to the drop-in.
      Gate EXIT=0 (73 / 2125 / 81 / 0 / GUARDS PASS); e2e share-after-post 3 passed,
      including a NEW test for reload-without-dismissing (the case the old spec
      could not see)
    V29 v29-6: DONE (commit 5b74862) — the empty state says what is further out.
      listRadiusFeed returns { posts, beyondRadiusCount } (no new query — the
      widest-radius filter over the same rows); the copy quotes the escape's own
      35-mile ceiling and renders nothing at 0. Gate EXIT=0 (73 / 2132 / 81 / 0 /
      GUARDS PASS); e2e feed-empty-state 7 passed, the new test posting from a
      SECOND account so v29-7 could not break it
    V29 v29-7: DONE (commit 19ac6e4) — the viewer's own drop-in is exempt from
      their own radius (filterFeed gains ownProfileId; distance only — blocked,
      hidden, ended and unplaceable still excluded). Gate EXIT=0 (73 / 2135 /
      81 / 0 / GUARDS PASS); e2e zip-radius 4 passed: post at the furthest
      seeded place (~12.5 mi), narrow the radius to 1 mile, card still there and
      the empty state not — and feed-empty-state 7 passed on the same code
    V29 v29-4: DONE (commit 9a2c3c4) — the create-account control fits 390x664.
      mobile-audit gains the viewport, a PORTRAIT "fits one screen" claim for
      /login, and an ALL-viewport "reachable by scrolling" claim; it was proven
      able to fire BEFORE the fix (640-692 vs 664, and nothing else). Fix:
      container gap-6 -> gap-4, the "or" divider my-5 -> my-3, every tap target
      still 44px. Audit EXIT=0; gate EXIT=0 (73 / 2135 / 81 / 0 / GUARDS PASS);
      e2e privacy-preview + signup-zip-fallback 12 passed
    V29 v29-8: DONE (commit eb3840b) — the first screen says what Drop In is.
      "Casual drop-ins near you — no RSVP, no planning." replaces the vague
      activity claim, and "Welcome back." leaves the sign-in subhead. Both lines
      held to ONE line at 390px, and the audit re-ran to prove the copy did not
      spend the v29-4 height budget. New spec e2e/login-first-screen.e2e.ts pins
      the copy AND the fold (the fold also lives in a lane that runs). Gate
      EXIT=0 (73 / 2135 / 81 / 0); e2e login-first-screen + signup-zip-fallback
      12 passed
    V29 v29-0: HALF DONE (commit c6935a3) — the impeccable-live injector is GONE
      from index.html and from dist. The removal was FORCED, not cosmetic: with
      the impeccable server up, its toolbar rendered on every audited page
      (26px buttons, 11.5px inputs, sub-14px labels), so mobile-audit's results
      were unreadable and the new v29-4 guard could not be trusted. The other
      half — committing the pre-batch WIP — is still the human's call
    V29 v29-5: DONE (commit 0708fee) — the bare "@" leaves the /new help text, and
      a small-hours start says so. THE RULE IS A NOTE, NOT A REFUSAL (a validator
      that refuses a legal post is a dead end, and the note keeps the rule
      wall-clock-safe for every existing spec). Gate EXIT=0 (73 / 2139 / 81 / 0);
      e2e time-presets + place-directory-in-new 7 passed, including a NEW test on a
      faked 02:00 clock pinning both halves (note appears, post still enabled)
    V29 v29-10: DONE (commit 9ca30d0) — sign out moves from the header into
      Settings → Account; the header keeps the gear, /login keeps its own escape.
      New spec e2e/sign-out.e2e.ts. Gate EXIT=0 (73 / 2139 / 81 / 0); e2e sign-out
      + loop-closing 3 passed. The trailing-newline guard caught the new spec
      before it landed; the FILE was fixed, not the guard
    V29 v29-9: DONE (commit 8877ffb) — the area card's privacy promise moves to the
      field, and ZIP becomes a PEER (always rendered, under the address) instead of
      a fallback unlocked by an address failing. SUPERSESSION RECORDED in the
      commit: task-state.md:56 and the 2026-09-25 spec's scope are superseded by
      the founder's 2026-10-04 decision; the geocode path, the address default and
      ZIP-sufficiency are NOT. Gate EXIT=0 (73 / 2139 / 81 / 0); e2e
      signup-zip-fallback + onboarding-resume 14 passed
    V29 v29-11: DONE (commit 241c5c3) — BATCH CLOSED. All ten implementation
      slices landed. Full suite round 1: 167 passed / 17 FAILED; round 2 (after
      the two fixes below): **181 passed / 3 failed / 2 skipped**, 20.1m. The
      three: `places.e2e.ts:917` (the KNOWN marker-bubble flake) and
      `places.e2e.ts:1674` BOTH FAIL AT THE BASE COMMIT 580eb82 (proven in a
      throwaway worktree, now removed), and `places.e2e.ts:2792` passes in
      isolation at HEAD and at base — an intermittent Leaflet flake. NOTHING in
      the three is this batch's.
    V29 v29-11: ROUND 1'S 17 FAILURES WERE MINE, and finding that out was the
      point of the lane. (a) v29-3 linked the "Posted!" banner's TITLE, so the
      suite's `a:has-text(title)` idiom matched the banner instead of the card in
      ~11 specs; fixed by a distinct "View" link. (b) the sign-out spec signed the
      MARKER out, and `supabase.auth.signOut()` revokes the refresh token
      GLOBALLY, so ~15 later specs met a /login screen; fixed with a throwaway
      account in its own context. The previously failing specs re-run: 28 passed.
      A base-commit worktree was the instrument that separated "my regression"
      from "inherited flake" — both verdicts are recorded with their evidence.
    V29 v29-11: ⚠️ `ocr` LANE UNAVAILABLE — not installed on this box (not on
      PATH, not in node_modules/.bin). Recorded as a deviation, never as a pass.
      The lanes that DID run: `npm run verify` (EXIT=0), the full e2e suite, and
      the adjudication above. `node scripts/mobile-audit.mjs` → EXIT=0.
    V29 v29-11: MARKER RESIDUE, RECORDED NOT DELETED — `sweep-e2e-markers.mjs
      select` reports 264 marker profiles / auth.users and 5 kids (533 rows), with
      EVERY content table at ZERO (playdates, going_pings, comments, memberships,
      follows, push_subscriptions). The accounts accumulate by design (each run
      creates a marker; each signup spec creates viewers); deletion is the sweep's
      job and needs fresh human confirmation (plan.md:769-771)
    V29: BATCH COMPLETE — 10/10 tickets, every slice with a gate + a browser check
      behind it. NOT DONE, and deliberately not mine to do: v29-0's second half
      (committing the pre-batch WIP), the destructive marker sweep, deleting
      `.vercel-env-tmp.json` and rotating its OIDC token, the form-draft design
      decision (`.scratch/new-form-draft-2026-10/spec.md`), and the 5-parent
      first-open test that v29-1 unblocked
