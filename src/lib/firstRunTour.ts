/**
 * V28 r2 slice 5 — the ending card's tour copy ("How Drop In works").
 *
 * The run ends by TEACHING the app, not by listing places (r2 replaces r1's
 * "places near you" ending). This is the parent's first meeting with the nav:
 * the nav does not render during the run at all (`navRenders` in App.tsx is
 * signed-in AND not the first run), so this card is the bridge and its CTA is
 * the crossing.
 *
 * The words are data, not JSX — the repo's standing precedent for a small
 * tested module of labels-as-data (`firstRunCopy.ts`, `vibeChips.ts`,
 * `rsvpConfirmationCopy`). They are NOT in `FIRST_RUN_COPY`: that module is
 * `Record<FirstRunCardId, …>` and `firstRunCopy.test.ts` pins its key set to
 * exactly the four cards, and this card is not one of them.
 *
 * ⚠️ THE HONESTY RULE THAT GOVERNS EVERY LINE (this batch's honesty class —
 * four instances already): a line describes what a control DOES, never what
 * is IN it. Measured on the live database (plan.md fact 12): ZERO upcoming
 * drop-ins, and all 20 existing ones hosted from a single ZIP. So a line
 * promising content that exists would be false for every parent alive, and
 * the card makes NO claim about places at all — the Places tab is named
 * because it is one of the four destinations the parent is about to meet, and
 * its line says only what the tab is for. `firstRunTour.test.ts` pins both
 * halves of that rule.
 *
 * ⚠️ The centre control is an ACTION, not a fifth tab. `App.tsx` (the
 * `PostActionButton` block) records that V24 slice 05 deliberately reversed
 * V22 slice 12 and that the founder overruled the Apple-HIG objection on
 * 2026-09-25 — "Do NOT 'fix' the nav back to the V22 shape." So this module
 * names it as posting, never as a tab, and its test enforces that.
 */

/** One line of the tour: a control the parent is about to meet, and its job. */
export interface TourLine {
  /**
   * The control's OWN word, as the parent will read it in the bar — the
   * `NavTab` labels and `PostActionButton`'s aria-label, in the bar's order.
   * Pinned against App.tsx by firstRunTour.test.ts.
   */
  label: string
  /** What the control DOES. A verb phrase; never a claim about content. */
  detail: string
}

/** The chrome's progress line (the run has no "N of 4" — the run is over). */
export const TOUR_PROGRESS_LABEL = 'All done'

/** The card's masthead. */
export const TOUR_TITLE = 'How Drop In works'

/**
 * The body: it says where the five controls are (the parent has not seen the
 * bar yet — the nav is suppressed for the whole run) and promises nothing.
 */
export const TOUR_BODY =
  'Everything below lives in the bar along the bottom of the screen. Here is what each part does.'

/**
 * The five lines, in the order the bar renders them (App.tsx: Drop Ins,
 * Inbox, the Post action, Places, Profile). The action sits BETWEEN Inbox and
 * Places because that is where the bar puts it — the order is the parent's
 * first lesson in where things are.
 *
 * Both of the built-but-invisible capabilities ride the Profile line, because
 * both live there (measured): the parent-name search (`searchProfilesByName`
 * in db.ts, driven from ProfilePage's parent-card link control) and the
 * partner link. The card only NAMES them — the flows themselves are unchanged
 * (r2-D5).
 */
export const TOUR_LINES: readonly TourLine[] = [
  {
    label: 'Drop Ins',
    detail: 'see what parents near you are putting on, and ping one to join',
  },
  {
    label: 'Inbox',
    detail: 'message the parents you’re arranging a drop-in with',
  },
  {
    label: 'Post a drop-in',
    detail: 'the + in the middle — put your own on for the neighborhood',
  },
  {
    label: 'Places',
    detail: 'look up parks and playgrounds, and see their hours and where they are',
  },
  {
    label: 'Profile',
    detail:
      'keep you and your kids up to date, find another parent by name, and link your partner’s account',
  },
]

/**
 * The CTA. ⚠️ LOAD-BEARING: `e2e/auth.setup.ts` (EVERY spec's setup),
 * `e2e/fixtures.ts` (17 consumers of `finishSignup`) and
 * `e2e/signup-zip-fallback.e2e.ts` locate this button by
 * `getByRole('button', { name: 'Go to your feed' })`. Renaming it breaks the
 * shared setup of the whole e2e suite. Pinned below for exactly that reason —
 * the same class as the name card's /^Continue/ pin.
 */
export const TOUR_PRIMARY_LABEL = 'Go to your feed'

/**
 * The verbs a tour line must carry — the mechanical form of "what the control
 * DOES, never what is IN it". A line that cannot be completed with one of
 * these has become a description of contents, which is the defect this batch
 * keeps finding.
 */
export const TOUR_ACTION_VERBS: readonly string[] = [
  'see',
  'ping',
  'message',
  'put',
  'look up',
  'keep',
  'find',
  'link',
]

/**
 * The existential claims the card must never make. Each one asserts that
 * content is already there for THIS parent — measured false today (fact 12),
 * and the reason r1's places list left the run.
 */
export const TOUR_FORBIDDEN_CLAIMS: readonly string[] = [
  'there are',
  'there is',
  'you’ll find',
  'you will find',
  'real places',
  'places near you',
  'nearby places',
  'places nearby',
  'what’s happening near you',
]
