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
 * four instances already): every NOUN and every PROMISE on this card is true
 * of the app as it is, MEASURED. This is not a vocabulary rule — r1's ending
 * ("Here are a few real places near you") and a line like "look up parks …
 * and see their hours" are the SAME defect at different volumes, and a test
 * that bans the word "places" catches neither while the second one ships.
 * What makes a line true is one of three measurements:
 *
 *   - A CATEGORY the card names must be a category the app can put ROWS
 *     behind. Measured against the live directory (2026-09-29, 239 rows):
 *     playground 155 · splash_pad 30 · other 26 · pool 10 · beach 9 ·
 *     library 6 · indoor_play 2 · museum 1 — and `park` and `trail` hold ZERO
 *     rows, which is exactly why the app withholds those two chips
 *     (`PLACE_KIND_CHIP_KINDS`) and renders "No “Park” places in the
 *     directory yet." So the Places line names playgrounds, pools and beaches
 *     (155, 10 and 9 rows) and never a park.
 *   - A CAPABILITY the card names must have a DRIVER in the code. "where to
 *     host" is true whatever the rows say, because the post form feeds its
 *     place picker from this same directory (`listPlaces` in
 *     NewPlaydatePage.tsx) — hosting is a capability, not an inventory.
 *   - An ATTRIBUTE the card promises must be one a row RELIABLY has. Hours are
 *     not: 184 of 239 rows carry them (20 real OpenStreetMap schedules, 164
 *     the LABELLED `city_default` "typical hours") and 55 carry none, which is
 *     why the directory says "…or we don't have their hours yet"
 *     (PlaceDirectory.tsx). So this card promises no hours.
 *
 * `firstRunTour.test.ts` enforces the first two as PROPERTIES over the app's
 * OWN taxonomy (`PLACE_KINDS` / `PLACE_KIND_CHIP_KINDS` in places.ts), not
 * over a word list written next to the copy it polices. The third is not
 * checkable locally — it needs a live count — so the copy makes no such
 * promise instead of testing for one. The repo-wide guard for this class is
 * V28 r2 slice 6's; this module does not try to close the class.
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
 * The Profile line carries the built-but-invisible capability, because it
 * lives there (measured): linking a partner's account, whose form is the ONLY
 * production driver of `searchProfilesByName` (`ProfilePage.tsx:362` — the
 * name field and the @handle field sit in the same section). So the name
 * search is stated as a STEP INSIDE that flow, never as a standalone "find
 * another parent" feature, which does not exist. The card only NAMES the
 * flow — the flow itself is unchanged (r2-D5).
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
    // Every noun here has rows behind it (playground 155 · pool 10 · beach 9)
    // and "host" is a capability the post form actually wires, so the line is
    // true on an empty day and a full one. No park (0 rows), no hours (55 rows
    // have none).
    label: 'Places',
    detail: 'look up a playground, a pool, a beach, and pick where to host',
  },
  {
    label: 'Profile',
    detail:
      'keep you and your kids up to date, and link your partner’s account — search their name to find them',
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
  'pick',
  'keep',
  'find',
  'link',
]

/**
 * A REGRESSION PIN, not the guard. These are wordings this batch actually
 * shipped and removed (r1's ending is the one that cost a review round), kept
 * so they cannot come back by copy-paste.
 *
 * ⚠️ WHY IT IS NOT THE GUARD: a blocklist written next to the copy it polices
 * is a spell-checker — it can be satisfied by rewording, which is exactly how
 * the shipped "look up parks … and see their hours" passed a ban on the word
 * "places" while making the same claim. The guard is the property test in
 * `firstRunTour.test.ts` (a named category must be a kind the app offers a
 * chip for) plus the measurements in this module's header. The repo-wide guard
 * is slice 6's.
 *
 * `what’s happening near you` is deliberately NOT here: it was never shipped,
 * and banning it would forbid the plan's own blessed intent for the Drop Ins
 * line ("what's happening near you", plan.md's tour table) while the shipped
 * "see what parents near you are putting on" sailed past it. A list that
 * contradicts the copy it governs is worse than no list.
 */
export const TOUR_BANNED_COPY: readonly string[] = [
  'there are',
  'there is',
  'you’ll find',
  'you will find',
  'real places',
  'places near you',
  'nearby places',
  'places nearby',
]
