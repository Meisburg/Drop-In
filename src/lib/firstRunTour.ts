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
 * five instances already): every NOUN, every PROMISE and every POSITION this
 * card states is true of the app as it is, MEASURED. This is not a vocabulary
 * rule — r1's ending ("Here are a few real places near you"), a line like
 * "look up parks … and see their hours", "see what parents near you ARE
 * PUTTING ON" and a body that puts the controls "along the bottom" are the
 * SAME defect at different volumes, and a test that bans the word "places"
 * catches none of them. What makes a line true is one of four measurements:
 *
 *   - A POSITION the card states must hold in EVERY layout the app renders.
 *     `App.tsx:482-484` renders the nav TWO ways: `fixed inset-x-0 bottom-0`
 *     below `md`, and `md:sticky md:top-16` + `md:flex-col` + `md:border-r`
 *     above it — the comment at `:612` calls the second one "a left rail". So
 *     the body names BOTH, and a body that says only "the bottom" is wrong on
 *     every tablet and desktop.
 *   - A CATEGORY the card names must be a category the app OFFERS. The test's
 *     proxy is CHIP MEMBERSHIP (`PLACE_KIND_CHIP_KINDS`), not a row count —
 *     `places.ts:157-166` records that a shipped kind can go empty at runtime,
 *     so the counts below are a dated measurement note, not a pinned fact, and
 *     they can rot while the suite stays green. Measured against the live
 *     directory (2026-09-29, 239 rows): playground 155 · splash_pad 30 ·
 *     other 26 · pool 10 · beach 9 · library 6 · indoor_play 2 · museum 1 —
 *     and `park` and `trail` hold ZERO rows, which is why the app withholds
 *     those two chips and renders "No “Park” places in the directory yet."
 *     ⚠️ Those counts are of the WHOLE directory. The Places tab defaults to
 *     the viewer's own radius (`PlaceDirectory.tsx:266` sets `distanceChoice`
 *     to `'profile'`), so they justify that a KIND EXISTS — never what a given
 *     parent will actually see. So the Places line names playgrounds, pools
 *     and beaches (kinds the app offers) and never a park (a kind it withholds).
 *   - A CAPABILITY the card names must have a DRIVER in the code. "where to
 *     host" is true whatever the rows say, because the post form feeds its
 *     place picker from this same directory (`listPlaces` in
 *     NewPlaydatePage.tsx) — hosting is a capability, not an inventory. Same
 *     for Drop Ins: the feed's rule (within your radius, soonest first —
 *     `feed.ts` filters on the radius and orders by `starts_at`) is true on an
 *     empty day; "what parents are putting on" is not.
 *   - An ATTRIBUTE the card promises must be one a row RELIABLY has. Hours are
 *     not: 184 of 239 rows carry them (20 real OpenStreetMap schedules, 164
 *     the LABELLED `city_default` "typical hours") and 55 carry none, which is
 *     why the directory says "…or we don't have their hours yet"
 *     (PlaceDirectory.tsx). So this card promises no hours.
 *
 * `firstRunTour.test.ts` enforces the category rule as a PROPERTY over the
 * app's OWN taxonomy (`PLACE_KINDS` / `PLACE_KIND_CHIP_KINDS` in places.ts),
 * with a vacuity guard so the negative half cannot silently emit zero tests,
 * and the position rule as a pairing rule. The attribute rule is NOT checkable
 * locally — it needs a live count — so the copy makes no such promise instead
 * of testing for one. The repo-wide guard for this class is V28 r2 slice 6's;
 * this module does not try to close the class.
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
   * The control's OWN word, as the parent will read it in the nav — the
   * `NavTab` labels and `PostActionButton`'s aria-label, in the nav's order.
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
 * The body: it says where the controls are (the parent has not seen them —
 * the nav is suppressed for the whole run) and promises nothing.
 *
 * ⚠️ IT NAMES BOTH LAYOUTS BECAUSE THE APP HAS TWO. `App.tsx:482` is
 * `fixed inset-x-0 bottom-0 … md:sticky md:top-16 … md:border-r md:border-t-0`
 * and `:484` switches the inner flex `flex-row md:flex-col`; `:612` calls the
 * md+ arrangement "a left rail". A body that said only "along the bottom" was
 * wrong on every tablet and desktop — the same class as the Places defect,
 * on the one card whose whole job is saying where the controls are. Do not
 * add a third arrangement: there are exactly two.
 */
export const TOUR_BODY =
  'Everything below is how you move around the app: along the bottom of the screen on a phone, down the left side on a tablet or desktop. Here is what each part does.'

/**
 * The five lines, in the order the nav renders them (App.tsx: Drop Ins,
 * Inbox, the Post action, Places, Profile). The action sits BETWEEN Inbox and
 * Places because that is where the nav puts it — the order is the parent's
 * first lesson in where things are, in either arrangement (bottom bar below
 * md, left rail above it).
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
    // The feed's RULE, not its contents: `feed.ts` filters the feed to the
    // viewer's radius and orders it by `starts_at`, and pinging is the join
    // action. All three hold with zero upcoming drop-ins, which is every
    // parent today (fact 12). The shipped "see what parents near you ARE
    // PUTTING ON" asserted current activity — the existential presupposition
    // r1's places list carried, reworded.
    label: 'Drop Ins',
    detail: 'browse drop-ins within your radius, soonest first, and ping one to join',
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
    // Both nouns are kinds the app OFFERS a chip for, and "host" is a
    // capability the post form actually wires — so the line is true on an
    // empty day and a full one. It names no park (a kind the app withholds
    // because it holds zero rows) and promises no hours (55 rows have none).
    // The measured counts are in this module's header, with their limits.
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
  'browse',
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
 * chip for, with a vacuity guard) plus the measurements in this module's
 * header. The repo-wide guard is slice 6's.
 *
 * `what’s happening near you` is NOT here: it was never shipped verbatim, and
 * a pin of an unshipped phrase is the spell-checker failure again. The phrase
 * that DID ship in that shape — "what parents near you are putting on" — IS
 * here, because fix round 2 removed it (two lanes read it as r1's existential
 * presupposition reworded: the present-progressive asserts current activity,
 * and there are zero upcoming drop-ins for every parent today). The lesson
 * from that round is the order of operations: the WORDING changed, and the pin
 * followed the wording — not the other way round.
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
  'parents near you are putting on',
]
