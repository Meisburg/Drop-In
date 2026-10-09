/**
 * The /settings index — the six categories as DATA, and the URL/hash rules that
 * choose which one is on screen (settings-restructure slice).
 *
 * WHY THIS MODULE EXISTS. `/settings` used to be one long scroll of six
 * `SettingsSection` blocks, which the founder called *"really overwhelming …
 * a hodgepodge of features"*. It is now an index: on the phone a list of six
 * rows, one screen per category; at `md` and up the same list in a left pane
 * beside the category's body. The list is a table here, not five copies of JSX,
 * so the phone screen and the desktop pane cannot drift — and the RULES below
 * (which URL means which screen, and what a legacy hash does) are pure
 * functions with a sibling test, so the page renders instead of deciding
 * (`docs/agents/code-structure.md`).
 *
 * ⚠️ THE SIX `id`s ARE LOAD-BEARING AND MUST NOT BE RENAMED. They are the
 * section ids that shipped as hash deep-link targets (`/settings#privacy`), so
 * copy elsewhere and any saved bookmark point at these exact strings. A rename
 * is a silent break of every one of them; the hash is translated to the new
 * path instead (see `resolveSettingsView`).
 *
 * ⚠️ SIX ROWS, NOT FIVE. The handover listed five categories and omitted
 * Privacy & safety. That section has a real body (`PrivacySection`, the block
 * list) and cannot vanish; folding it into Account would put "who you have
 * blocked" behind a row labelled "Account", which is a worse lie than a longer
 * index. The brief's default (six, keeping today's order) is what this table
 * is written against.
 */
/**
 * The glyph a row names, as a NAME rather than a path. The paths stay in ONE
 * table — `NAV_ICONS` (`src/components/icons.ts`), the app's glyph vocabulary —
 * and the renderer resolves `NAV_ICONS[row.icon]`. A `lib/` module must not
 * import from `components/` (the build law, and `icons.test.ts` says so in its
 * own header), so the direction stays one-way: this union names, the component
 * resolves. The sibling test pins every name to a real `NAV_ICONS` key, so a
 * renamed glyph fails the gate instead of rendering nothing.
 */
export type SettingsIconName = 'inbox' | 'nearby' | 'bookmark' | 'shield' | 'contrast' | 'profile'

/**
 * The categories, in the order a parent is most likely to want them — and the
 * order the old scrolling page used, so nothing moves that did not have to.
 */
export const SETTINGS_CATEGORY_IDS = [
  'notifications',
  'near-you',
  'saved',
  'privacy',
  'appearance',
  'account',
] as const

export type SettingsCategoryId = (typeof SETTINGS_CATEGORY_IDS)[number]

export interface SettingsIndexRow {
  /** The URL segment AND the legacy hash: `/settings/<id>`, `/settings#<id>`. */
  readonly id: SettingsCategoryId
  /** The category's name — the one copy the index row and the screen heading share. */
  readonly label: string
  /** One honest line of what the category holds, for the index row. */
  readonly blurb: string
  /** A glyph NAME, resolved against `NAV_ICONS` by the renderer (see the type). */
  readonly icon: SettingsIconName
}

export const SETTINGS_INDEX: readonly SettingsIndexRow[] = [
  {
    id: 'notifications',
    label: 'Notifications',
    blurb: 'Push, email, and quiet hours.',
    icon: 'inbox',
  },
  {
    id: 'near-you',
    label: 'Near you',
    blurb: 'The radius the drop-ins you see come from.',
    icon: 'nearby',
  },
  {
    id: 'saved',
    label: 'Following & saved',
    // v33-8 (muydzvu9): the blurb says what the category IS FOR — a place you
    // change things, not a mirror of things.
    blurb: 'Unfollow families, remove saved places.',
    icon: 'bookmark',
  },
  {
    id: 'privacy',
    label: 'Privacy & safety',
    blurb: 'Your block list and what other parents can see.',
    icon: 'shield',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    blurb: 'Switch between light and dark.',
    icon: 'contrast',
  },
  {
    id: 'account',
    label: 'Account',
    blurb: 'Your data and closing your account.',
    icon: 'profile',
  },
]

/**
 * The longer sentence under each category screen's heading. These are the
 * sentences the old scrolling page carried (verbatim where it had one), moved
 * unchanged — this slice REGROUPS settings, it does not rewrite them.
 *
 * `Record<SettingsCategoryId, string>` is deliberate: a seventh category that
 * forgets its sentence is a type error, not a blank line.
 */
export const SETTINGS_CATEGORY_DESCRIPTIONS: Readonly<Record<SettingsCategoryId, string>> = {
  notifications: 'What Drop In tells you about, and when it is allowed to.',
  'near-you': 'How far away the drop-ins you see can be.',
  saved:
    'This is where you change them: unfollow a family, or remove a saved place — both take effect right away.',
  privacy: 'What other parents can see, and who you have blocked.',
  appearance: 'Light, dark, or match my phone.',
  account: 'Take your data with you, or close your account.',
}

/** The bare index path — the phone's index screen and the desktop pane's home. */
export const SETTINGS_INDEX_PATH = '/settings'

/**
 * The desktop pane's breakpoint, written as the SAME width Tailwind's `md:`
 * compiles to (`md:grid-cols-[14rem_minmax(0,1fr)]` on the page). It lives here
 * so the JS decision and the CSS class are one value apart, and in `rem` so a
 * reader who zooms their browser font scales both together instead of seeing the
 * pane's layout and its selection disagree.
 *
 * It answers ONE question — does `/settings` show a category body by default
 * (yes on the pane, no on the phone index) — which is a product decision the
 * founder made, not a styling tweak.
 */
export const SETTINGS_PANE_MEDIA_QUERY = '(min-width: 48rem)'

/** The one builder for a category's URL, so no call site formats it by hand. */
export function settingsCategoryPath(id: SettingsCategoryId): string {
  return `${SETTINGS_INDEX_PATH}/${id}`
}

/** True when `value` is one of the six category ids — the boundary check. */
export function isSettingsCategoryId(value: string): value is SettingsCategoryId {
  return (SETTINGS_CATEGORY_IDS as readonly string[]).includes(value)
}

/** The row for a category. Total by construction: the table covers the union. */
export function settingsRow(id: SettingsCategoryId): SettingsIndexRow {
  const row = SETTINGS_INDEX.find((candidate) => candidate.id === id)
  if (row === undefined) {
    // Unreachable while `SETTINGS_INDEX` covers `SettingsCategoryId`; the sibling
    // test pins that. Thrown rather than asserted away so a future gap is loud.
    throw new Error(`settings: no index row for "${id}"`)
  }
  return row
}

/** The category a `/settings/<id>` path names, or null when it names none. */
export function settingsCategoryFromPath(pathname: string): SettingsCategoryId | null {
  const match = /^\/settings\/([^/]+)\/?$/.exec(pathname)
  if (match === null) return null
  const segment = match[1]
  return isSettingsCategoryId(segment) ? segment : null
}

/**
 * What `/settings…` should render for one URL. Three outcomes, and they are the
 * whole of the routing rule:
 *
 *  - `category` — one category's body (plus the index at `md` and up).
 *  - `index`    — the list alone. The phone's `/settings`.
 *  - `redirect` — the URL is not a screen: a legacy hash
 *    (`/settings#privacy`, the V27 deep link that copy elsewhere advertises) or
 *    a category segment nothing matches. The caller renders it with
 *    `<Navigate replace>`, so the old hash is REPLACED in history rather than
 *    pushed — a parent who taps Back returns to where they came from, not to a
 *    URL that immediately bounces them forward again.
 *
 * `wide` is injected (the caller reads it from `SETTINGS_PANE_MEDIA_QUERY`)
 * because on the pane the first category is selected by default so the right
 * column is never blank, while the phone index must show NO category body at
 * `/settings`.
 */
export type SettingsView =
  | { readonly kind: 'index' }
  | { readonly kind: 'category'; readonly id: SettingsCategoryId }
  | { readonly kind: 'redirect'; readonly to: string }

export function resolveSettingsView(input: {
  readonly pathname: string
  readonly hash: string
  readonly wide: boolean
}): SettingsView {
  // The legacy hash first: it is the strongest statement of intent on the URL,
  // and it must win over the path it was appended to.
  const hash = input.hash.startsWith('#') ? input.hash.slice(1) : input.hash
  if (isSettingsCategoryId(hash)) {
    return { kind: 'redirect', to: settingsCategoryPath(hash) }
  }

  const path = input.pathname.length > 1 ? input.pathname.replace(/\/+$/, '') : input.pathname
  if (path === SETTINGS_INDEX_PATH) {
    return input.wide
      ? { kind: 'category', id: SETTINGS_CATEGORY_IDS[0] }
      : { kind: 'index' }
  }

  const id = settingsCategoryFromPath(path)
  if (id !== null) return { kind: 'category', id }

  // A `/settings/…` URL that names nothing (a stale link, a typo) lands on the
  // index rather than rendering an empty screen.
  if (path.startsWith(`${SETTINGS_INDEX_PATH}/`)) {
    return { kind: 'redirect', to: SETTINGS_INDEX_PATH }
  }

  return { kind: 'index' }
}
