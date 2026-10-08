/**
 * v35-B (`muzjx0we`) — THE PROFILE'S INTERESTS AS EMOJI + TEXT BUBBLES.
 *
 * The founder, verbatim (agentation annotation `muzjx0we-wnkwjy`, anchored on
 * `/profile`):
 *
 *   *"Okay, under interests, I would like a bubble with a lot of different
 *   different categories that are represented by text plus a corresponding
 *   emoji. this is what the user likes...for example, if they're a book lover,
 *   it should say 'Book Lover 📕' in a pill ui. These categories will just let
 *   you know what the person likes, what their interests are. And I think this
 *   would make you understand what the other parents that are coming to a
 *   drop-in are into and then if you see them at a drop-in you have like
 *   something to connect on like if you're both into the same TV show or
 *   whatever. I think it makes them more relatable and less scary if you want to
 *   meet up with them and talk to them."*
 *
 * WHAT THIS MODULE OWNS (all pure — the component renders, it does not decide):
 *
 *   - the SPLIT: one free-text string (`profiles.interests`, migration 0022)
 *     into the categories it names. The founder's data is a sentence a parent
 *     typed, not an array, so "a bubble per category" starts with deciding what
 *     a category IS. See `splitInterestEntries`.
 *   - the EMOJI MAPPING: a category's word/phrase to an emoji. See
 *     `INTEREST_EMOJI`.
 *   - the UNKNOWN rule: a category this module does not recognise keeps its
 *     TEXT and gets NO emoji — never a blank bubble, never a fallback glyph.
 *
 * ⚠️ THE DEFECT THIS MODULE EXISTS TO PREVENT. The tempting shape is a chain
 * like `INTEREST_EMOJI[word] ?? '✨'` — a default that makes every unknown
 * category look recognised. That is WRONG twice over: it invents a claim the
 * data does not support (the founder asked for "a corresponding emoji", not
 * any emoji), and it makes the mapping un-falsifiable — a typo'd key would be
 * indistinguishable from a deliberate one, so the map could rot silently. The
 * sibling test names this defect and mutation-proves it: give the resolver a
 * default glyph and the unknown-category leg goes red.
 *
 * NO NEW READ OR FETCH: this module takes the string the profile row already
 * carries (`ProfileView`'s `profile.interests`) and returns a decoration of it.
 */

/**
 * ONE CATEGORY, as the page renders it.
 *
 * `emoji` is `null` — not `''`, not a placeholder — when the category is not in
 * the vocabulary, because `null` is what the render branches on to omit the
 * glyph entirely. An empty string would leave a stray space in the bubble.
 */
export interface InterestBubble {
  /** The category's own words, trimmed, exactly as the parent typed them. */
  text: string
  /** The mapped emoji, or `null` when the category is unknown. */
  emoji: string | null
}

/**
 * The category separators. A parent types interests as prose, so the split has
 * to follow what they actually type:
 *
 *   - `,` and `;` — the obvious list punctuation;
 *   - `/` — "hiking / camping";
 *   - `&` and ` and ` — "books & coffee", "books and coffee";
 *   - a newline — a parent who pressed Enter between items.
 *
 * ⚠️ ORDER IS THE POINT. The array order is the parent's own order, and
 * acceptance (e) pins it: the bubbles must never reshuffle between renders. A
 * Set would dedupe but a `Set`'s iteration order is insertion order, which is
 * still stable — the real risk is a `sort()` "for tidiness", which would move a
 * parent's first interest out of first place. There is deliberately NO sort here.
 */
const INTEREST_SEPARATORS = /[,;/\n]|\s&\s|\s+and\s+/i

/**
 * THE VOCABULARY — a category's word to its emoji.
 *
 * Keys are matched case-insensitively against the WHOLE category first
 * (`"book lover"` → its exact emoji), then by keyword (see `emojiForInterest`),
 * so both the founder's own example ("Book Lover 📕") and a looser phrase
 * ("reading", "sci-fi novels") land on the same glyph.
 *
 * ⚠️ WHY WHOLE-PHRASE KEYS AND KEYWORDS ARE BOTH HERE, rather than one list of
 * words: the founder's example is a TWO-WORD category. A keyword-only scan
 * would map "Book Lover" through "book" anyway, but "TV show" would need "tv",
 * and "Play dates" must not match "dates". Whole-phrase keys are the precise
 * lane; keywords are the tolerant one. A category matching NEITHER gets no
 * emoji — the unknown rule, which is a feature and not a gap.
 *
 * Emoji choices are deliberately concrete and widely-supported (no ZWJ
 * sequences or skin-tone modifiers) so a render cannot show a tofu box.
 */
const INTEREST_EMOJI: ReadonlyArray<readonly [phrase: string, emoji: string]> = [
  ['book lover', '📕'],
  ['books', '📕'],
  ['reading', '📕'],
  ['coffee', '☕'],
  ['tea', '🍵'],
  ['cooking', '🍳'],
  ['baking', '🧁'],
  ['food', '🍽️'],
  ['restaurants', '🍽️'],
  ['wine', '🍷'],
  ['beer', '🍺'],
  ['hiking', '🥾'],
  ['walking', '🚶'],
  ['running', '🏃'],
  ['cycling', '🚲'],
  ['biking', '🚲'],
  ['swimming', '🏊'],
  ['yoga', '🧘'],
  ['gym', '🏋️'],
  ['climbing', '🧗'],
  ['skiing', '⛷️'],
  ['snowboarding', '🏂'],
  ['surfing', '🏄'],
  ['kayaking', '🛶'],
  ['camping', '🏕️'],
  ['fishing', '🎣'],
  ['gardening', '🌱'],
  ['music', '🎵'],
  ['concerts', '🎤'],
  ['guitar', '🎸'],
  ['piano', '🎹'],
  ['singing', '🎤'],
  ['dancing', '💃'],
  ['art', '🎨'],
  ['painting', '🎨'],
  ['drawing', '✏️'],
  ['photography', '📷'],
  ['crafts', '🧶'],
  ['knitting', '🧶'],
  ['sewing', '🧵'],
  ['movies', '🎬'],
  ['film', '🎬'],
  ['tv show', '📺'],
  ['tv shows', '📺'],
  ['television', '📺'],
  ['gaming', '🎮'],
  ['video games', '🎮'],
  ['board games', '🎲'],
  ['puzzles', '🧩'],
  ['travel', '✈️'],
  ['road trips', '🚗'],
  ['theater', '🎭'],
  ['theatre', '🎭'],
  ['museums', '🏛️'],
  ['history', '🏛️'],
  ['science', '🔬'],
  ['space', '🚀'],
  ['astronomy', '🔭'],
  ['technology', '💻'],
  ['coding', '💻'],
  ['math', '➗'],
  ['languages', '🗣️'],
  ['writing', '✍️'],
  ['poetry', '✍️'],
  ['dogs', '🐕'],
  ['cats', '🐈'],
  ['animals', '🐾'],
  ['birds', '🐦'],
  ['nature', '🌲'],
  ['beach', '🏖️'],
  ['volunteering', '🤝'],
  ['community', '🤝'],
  ['faith', '🕊️'],
  ['meditation', '🧘'],
  ['fitness', '💪'],
  ['sports', '⚽'],
  ['soccer', '⚽'],
  ['basketball', '🏀'],
  ['baseball', '⚾'],
  ['tennis', '🎾'],
  ['golf', '⛳'],
  ['skateboarding', '🛹'],
  ['diy', '🔨'],
  ['woodworking', '🪚'],
  ['cars', '🚗'],
  ['sailing', '⛵'],
  ['podcasts', '🎧'],
  ['trivia', '🧠'],
]

/** Normalise a category for matching: lower-case, collapsed whitespace, and
 *    the punctuation a parent might trail ("Hiking!" / "cooking."). */
function normalizeInterest(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The emoji for ONE category, or `null` when this module does not know it.
 *
 * ⚠️ THERE IS NO DEFAULT. This is the module's whole contract: an unknown
 * category returns `null` so the caller renders the text alone. Adding a
 * `?? '✨'` here (or anywhere downstream) is the defect the sibling test pins.
 *
 * Matching is two-lane, in this order:
 *   1. the WHOLE normalised phrase against a key — the precise lane, so
 *      "book lover" is exact;
 *   2. a WHOLE-WORD keyword scan — the tolerant lane, so "sci-fi books" and
 *      "reading novels" both find 📕. The word boundary matters: a substring
 *      scan would let "art" match "earth" and "car" match "cartwheels", which
 *      is exactly the "silently getting a wrong emoji" failure the test names.
 */
export function emojiForInterest(text: string): string | null {
  const normalized = normalizeInterest(text)
  if (normalized === '') return null

  const exact = INTEREST_EMOJI.find(([phrase]) => phrase === normalized)
  if (exact !== undefined) return exact[1]

  const words = new Set(normalized.split(' '))
  const keyword = INTEREST_EMOJI.find(([phrase]) => words.has(phrase))
  return keyword === undefined ? null : keyword[1]
}

/**
 * Split the profile's one interests string into the categories it names, each
 * with its emoji (or `null`).
 *
 * The empty cases are deliberate: `null`, `undefined` and a whitespace-only
 * string all return `[]`, so the caller's "show the block at all" decision
 * stays exactly where it is today (`ProfileView`'s `showsInterests`) and this
 * function never has to be asked twice.
 *
 * Duplicates are KEPT, including consecutive ones: if a parent typed
 * "coffee, coffee", that is what they wrote. Dropping it would be this module
 * editing the parent's words, which is not its job — and it would make the
 * bubble count disagree with the text, which acceptance (a) pins.
 */
export function interestBubbles(interests: string | null | undefined): InterestBubble[] {
  if (interests === null || interests === undefined) return []
  return interests
    .split(INTEREST_SEPARATORS)
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((text) => ({ text, emoji: emojiForInterest(text) }))
}
