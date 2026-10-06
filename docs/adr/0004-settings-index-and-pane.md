# 0004 — /settings is an index on the phone and a navigation pane on the desktop

**Status:** accepted (2026-10-05, the settings-restructure slice)

## Context

`/settings` was one long scroll of six `SettingsSection` blocks — Notifications
alone carries the push status, the opt-in, the iOS install card, the email
opt-out, eight per-kind toggles, quiet hours and the collapsed "Recent alerts"
list. On a phone a parent scrolled the whole of it to reach *Appearance*.

The founder reported it, twice, in his own words:

> *"I think this settings page is really overwhelming and like it just feels
> like we've crammed a bunch of stuff in here at once."*

> *"maybe it should be like a left hand pain that has the different settings
> options. And you pick one and then it populates like what's there."*

**The second quote is the thing this ADR exists for.** `DESIGN.md`'s One-Column
Rule says, verbatim (`DESIGN.md:365-368`):

> **The One-Column Rule.** The layout is a phone column. Widening the viewport
> gives the column air and moves the navigation to the side; it never lengthens a
> line of body copy. **A desktop layout with a second content column has to be a
> product decision, not a breakpoint.**

A left pane beside the body is exactly a second content column. Without a
recorded decision, the next reader finds
`md:grid-cols-[14rem_minmax(0,1fr)]` in `SettingsPage.tsx` and can only conclude
the rule was broken by accident.

## Decision

**The pane is permitted, because the founder asked for it — and it is bounded.**

- `/settings` below `md` is the **index**: six rows, one per category, each a
  44px tap target naming the category and one honest line of what it holds.
  Tapping a row navigates to `/settings/<id>`, which renders ONLY that category's
  body plus a `settings-back` control.
- At `md` and up the SAME list renders as a **left pane inside `<main>`**, in a
  second grid (`md:grid-cols-[14rem_minmax(0,1fr)]`) beside the shell's existing
  `4.5rem` nav rail, with the selected category in the right column. `/settings`
  itself selects the first category on the pane, so the right column is never
  blank. No shell change; the rail's geometry does not move.
- The six rows are ONE table of data, `src/lib/settingsIndex.ts`, read by both
  arrangements, so the phone screen and the pane cannot drift — and every routing
  and legacy-hash decision is a pure function there with a sibling test.

## The constraint that survives

The One-Column Rule is exceptioned for **this page only**, and only as far as:

1. **The second column is NAVIGATION, not content.** Its 14rem holds a list of
   destinations, the same job the nav rail already does. It is not body copy, and
   it is not a second article.
2. **The body keeps the phone measure.** The right column is `max-w-md`, so
   widening the viewport gives the category's controls air rather than lengthening
   a line of text — the part of the rule that is about reading.
3. **No other page gains a column from this precedent.** A future page wanting a
   second content column owes its own decision and its own ADR; this one is not a
   general licence, and the shell is untouched.

## Considered options

- **Accordion / collapse the sections in place.** Rejected: the founder's
  complaint is hierarchy, and a six-item accordion on a phone is the same long
  scroll with more taps.
- **One very long page with a jump list.** Rejected: it keeps every category
  mounted at once (the cost that makes the page feel like a hodgepodge) and gives
  the phone no way to be finite.
- **Five index rows, folding Privacy & safety into Account.** Rejected: the
  section has a real body (the block list) and its own deep-link prose, and
  "who you have blocked" behind a row labelled *Account* is a worse lie than a
  longer index. The index is six.
- **A brand-new `/settings/<id>` full-screen route with no index at `md`.**
  Rejected: the founder asked for the left pane specifically.

## Consequences

- **Two things must keep working for old links.** The six ids are DATA
  (`SETTINGS_CATEGORY_IDS`) and are never renamed; a legacy hash
  (`/settings#privacy`) `<Navigate replace>`s to `/settings/privacy` — replace,
  not push, so Back returns to the previous screen rather than bouncing forward.
  The V27 scroll-into-view effect is deleted with it.
- **One category renders at a time, in one place.** The page renders the pane and
  the selected body only; there is no second copy of a category in the DOM at
  either width, which is what makes the drift risk the old six-block page had
  (duplicated markup) impossible to reintroduce by accident.
- **A category's reads now cost only its own screen.** The `Following & saved`
  body moved from `SettingsPage` into
  `src/components/FollowingSection.tsx` so its `listMyFollowing` read fires on the
  `saved` screen rather than on every `/settings` mount.
- **`src/lib/settingsIndex.ts` is the index's home**, so a seventh category is a
  table row plus a body — and `SETTINGS_CATEGORY_DESCRIPTIONS` being a `Record`
  over the id union makes a missing sentence a type error.
- **The e2e suite's bare `/settings` navigations were updated** to the screen each
  spec actually needs (nine call sites across six specs). No assertion was
  weakened to accommodate the restructure.
