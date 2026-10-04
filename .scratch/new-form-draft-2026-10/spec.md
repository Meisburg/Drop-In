# Spec: the post form must not eat what a parent typed

**Status:** needs one decision before tickets (see Open question)
**Source:** Deepseek PCR 006 + PCR 011 → `D5` in
`docs/product/external-review-triage-2026-10-04.md`
**Related, already filed:** `.scratch/v28/issues/02-new-form-loses-values-across-the-onboarding-hop.md`
(status: known limitation, accepted by default, reversible on the word)

## The user problem

A parent fills in the post form. A link *inside that form* takes them away. When
they come back, everything is gone.

Two live instances, both verified:

1. **The kids row.** `src/components/PlaydateFormFields.tsx:661-664` renders
   "Add your kids in your settings, then pick the ones coming along." with a live
   `<Link to="/settings">Add kids</Link>`. The form's state is plain `useState`
   with no persistence (`src/pages/NewPlaydatePage.tsx:340,418,440`), so leaving
   loses the place, the time, the duration and the title. Autosave exists, but
   only for the profile editor (`src/pages/ProfilePage.tsx:61-62`).
2. **The no-ZIP hop.** The `LocationRequiredNotice` sends a parent with no home
   ZIP to `/onboarding` mid-post; issue 02 already documents this one and it was
   accepted because the ordinary path sets the ZIP earlier.

The app already holds the opposite principle for the first run — resume picks up
where the parent left off (`docs/product/onboarding-first-run.md` §4). The post
form is the one write surface that punishes an interruption.

## Why this needs a decision, not a ticket

The fix has real design branches, and one of them is a new write path. Building
the wrong one costs more than the bug does.

## Open question (founder)

**How does a parent with no kids add one without leaving the form?**

- **(A) Inline — recommended.** "Add kids" opens the existing kid editor in a
  sheet/modal over `/new` and writes through the same path the profile uses. The
  form never unmounts. Cost: a write surface reachable from `/new`; must reuse
  the profile editor rather than fork it.
- **(B) Round trip with a draft.** Keep the link, persist the draft in
  `sessionStorage`, restore on return, and tell the parent you kept it. Cheaper
  and it also fixes the no-ZIP hop; but it still interrupts, and the parent must
  trust that the draft survives.
- **(C) Both.** Inline for kids (the common case), draft persistence for the
  no-ZIP hop (the rare one).

## Recommended shape (if (A) or (C) is chosen)

- The kid write goes through the existing profile editor's path — one
  implementation, two entry points.
- Draft persistence, if built, is **`sessionStorage`**, keyed to the user, cleared
  on successful post: it covers the same-tab hop the bug is about and leaves no
  residue after the tab closes. Not `localStorage` (a shared device should not
  keep a half-written post).
- Restoring a draft is **disclosed**, one dismissible line ("We kept what you
  typed") — silent restoration is its own confusion.
- No server-side draft, no cross-device draft, and no draft for the **edit** flow
  (only `/new`).

## Acceptance criteria (draft, to be confirmed with the decision)

1. A parent with no kids can add one from `/new` and continue posting **without
   re-entering any field**.
2. A parent sent to `/onboarding` from `/new` returns to a form holding every
   value they had entered.
3. The draft is cleared after a successful post, and after an explicit discard.
4. No draft survives the tab closing; no draft is readable by another account on
   the same device.
5. `npm run verify` green; the resume behaviour of the first run is unchanged.

## Verification

```bash
npm run verify
npm run test:e2e -- e2e/post-fast.e2e.ts e2e/no-zip-notice.e2e.ts e2e/quick-post.e2e.ts
```

Plus a rendered assertion per acceptance criterion above — the existing issue 02
has none, which is why it could sit unfixed without failing a lane.

## Likely files

- `src/pages/NewPlaydatePage.tsx`
- `src/components/PlaydateFormFields.tsx:653-670`
- a draft seam beside `src/lib/autosave.ts` (its "/settings" naming is legacy;
  read it before reusing it)
- `src/lib/firstRun.ts` / `OnboardingPage.tsx` — only if the return target needs
  the draft to hand values back

## Not established

Whether parents actually abandon at the kids row in the wild. The two external
reviews hit it, and the app's own outbound link makes it reachable by
construction — that is enough to fix it, not enough to claim a frequency.
