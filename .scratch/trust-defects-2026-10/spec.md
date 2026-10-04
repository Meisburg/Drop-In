# Spec: trust defects from the 2026-10-04 external review triage

**Source brief:** `docs/product/external-review-triage-2026-10-04.md` — the
verified triage of five external model reviews. That file carries the evidence;
this one carries the work.

**What this effort fixes:** nine verified defects and one decision-driven change
harvested from **17 of the 39** external change requests. Every claim below was
re-verified against `580eb82` with `file:line` before it became a ticket, and the
one review written without app access (Gemini) contributed nothing.

**The through-line:** each defect is a surface that **asserts something it never
read**, or **hides something the parent needs at the moment they need it**. None
of them is a redesign, and none touches the store critical path.

## Decisions taken (founder, 2026-10-04) — binding for builders

1. **Notification ask:** a completed signup alone no longer arms it. The ask
   happens only after a *real* action (a created post, or "I'm going").
2. **Area card:** add the privacy line, and render ZIP as a **peer option**
   rather than a fallback reachable only after an address fails.
3. **Empty feed:** add the beyond-radius count now. **Suggested places wait** for
   the 5-parent test — they edge into the empty-feed CTA that is deliberately
   blocked (`.scratch/next-batch-brief.md:56-77`).
4. **Sign out:** moves out of the app header into Settings.

## Scope

| # | Ticket | Defect |
|---|---|---|
| 01 | `01-card-asserts-unread-absence.md` | Profile/place cards say "No one's going yet" about drop-ins with families going |
| 02 | `02-drop-signup-push-arm.md` | Signup alone earns a notification ask on the first feed paint |
| 03 | `03-posted-banner-outlives-the-post.md` | "Posted!" survives a reload; the banner does not link to the post |
| 04 | `04-create-account-below-the-fold.md` | Create-account control 28px below the fold at 390×664 |
| 05 | `05-post-form-copy-and-time-guard.md` | The bare `@`; no time-of-day sanity rule |
| 06 | `06-empty-feed-beyond-radius-count.md` | "Nothing within N miles yet." never says what widening would reveal |
| 07 | `07-own-post-in-own-feed.md` | Your own active drop-in can be missing from your own feed |
| 08 | `08-login-screen-says-what-this-is.md` | The first screen explains nothing |
| 09 | `09-area-card-privacy-and-zip.md` | Required address states no privacy promise; ZIP unreachable |
| 10 | `10-sign-out-moves-to-settings.md` | Permanent one-tap sign-out in the header, no confirm |

Frontier at publication: **01, 03, 04, 05, 06, 08** are independent and
unblocked. 02 is independent but gates the 5-parent test's validity. 07 and 10
are independent. 09 touches the area card, which 07's seeding path may also
touch — sequence 09 before any area-card work.

## Non-goals (with the reason, so they are not re-raised)

- **No suggested places in the empty feed.** Decision 3. Blocked on the test.
- **No create/post CTA inside the empty feed.** Reverses V27's recorded ruling
  and is blocked on the same test (`.scratch/next-batch-brief.md:63-68`).
- **No signed-out preview of real nearby drop-ins.** Needs its own ADR
  (`.scratch/first-use-discovery-audit/spec.md`, Non-goals).
- **No notification cooldown after "Not now".** The three-point ladder is
  deliberate and test-pinned (`src/lib/push.ts:441-460`,
  `src/lib/push.test.ts:1228-1240`). Only the signup point changes.
- **No change to the post flow's shape.** Title is generated, time and duration
  are pre-filled (`NewPlaydatePage.tsx:115-127,240-245`); four reviewers wanted a
  "lighter" flow and the evidence does not support it.
- **No new notification kinds, no host check-in, no invite-with-provenance, no
  search, no vibe tags.** Queued or declined in the triage doc §4-5.
- **No fix to the draft-loss issue** — that is its own spec
  (`.scratch/new-form-draft-2026-10/spec.md`).
- **No refactor of the components a ticket touches** beyond the change itself.

## Preserve these behaviors

- One-tap "I'm going" with its explicit undo, and the lightbox.
- The honest empty-state language and its escapes (`Widen to 20 miles`,
  `See everything in Seattle`).
- The public `/playdate/:id` signed-out surface, and the rule that a public
  visitor must still explicitly confirm "I'm going" after signing in.
- The `+` in the nav's centre — a recorded HIG override (`src/App.tsx:493-503`).
- The max-one-offer-per-trigger push rule and its suppressed paths.
- The radius default of 5 miles (`src/lib/feed.ts:72`, pinned by
  `src/lib/feed.test.ts:2464`) — the count changes the copy, not the default.

## Verification plan

Every ticket: **`npm run verify`** (build + test + lint + a11y:focus +
steering-lint + guards) must be exit 0, and any test pinning old copy is updated,
never deleted.

Targeted browser checks (against the project's approved e2e target, never a
human's logged-in browser):

```bash
npm run test:e2e -- e2e/profile-posts.e2e.ts e2e/card-circles.e2e.ts   # 01, 07
npm run test:e2e -- e2e/push-subscribe.e2e.ts                          # 02
npm run test:e2e -- e2e/share-after-post.e2e.ts                        # 03
npm run test:e2e -- e2e/time-presets.e2e.ts e2e/place-directory-in-new.e2e.ts  # 05
npm run test:e2e -- e2e/feed-empty-state.e2e.ts e2e/zip-radius.e2e.ts  # 06, 07
npm run test:e2e -- e2e/signup-zip-fallback.e2e.ts e2e/onboarding-gate.e2e.ts  # 08, 09
node scripts/mobile-audit.mjs                                          # 04
```

Each ticket names its own rendered regression. **A source-level grep is not a
rendered assertion** — the 2026-09-25 audit's own rule, restated after the stray
developer comment survived a source-only check.

## Not established

Keyboard-only navigation, screen-reader output, 200% zoom, and slow/offline
network recovery are not covered by this batch and must not be claimed complete
from it.

## How this becomes work

These are tickets, not slices. Before any builder is dispatched, each ticket's
acceptance criteria and verification command move into `plan.md` as a slice (one
builder context each; 01, 06 and 07 may need splitting if the diff crosses
`lib/` + a page + tests). `ocr` reviews the diff at the end of each slice, and
the reviewer lane judges it against the plan.
