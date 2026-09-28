/**
 * V22 slice 14 — appearance as a USER CHOICE. V27 extends it with "Match my
 * phone" while keeping LIGHT as the default for everyone.
 *
 * The original slice deliberately shipped two states and no "follow system"
 * option, because the app had auto-darkened on a prefer-dark desktop and the
 * human wanted an explicit choice. V27 revisits that: parents' phones switch to
 * dark at night on their own, and making them find one switch per app is the
 * friction the audit warned about. The reconciliation is the one that keeps the
 * old decision intact AND removes the friction:
 *
 *   - ABSENT / unparseable / 'light'  -> light. Light stays the default, so a
 *     cold load never silently darkens someone's app (the V22 contract).
 *   - 'dark'                          -> dark, the explicit opt-in.
 *   - 'system'                        -> follow `prefers-color-scheme`.
 *
 * Build law: pure logic lives here, dependencies are injected (storage,
 * document, the OS preference boolean), React never decides. Sibling test:
 * src/lib/theme.test.ts.
 */

export type Theme = 'light' | 'dark'

/**
 * What the parent chose. `'system'` is a stored choice, not a resolved theme —
 * resolving it needs the OS fact, which is why `resolveTheme` takes it as an
 * argument rather than reading `window` here.
 */
export type ThemeChoice = 'light' | 'dark' | 'system'

/** The localStorage key holding the user's choice. */
export const THEME_KEY = 'dropin-theme'

/**
 * Read a stored raw value as a choice. Light-default is the CONTRACT: only the
 * exact strings 'dark' and 'system' are honored; absent, empty, 'light', or
 * garbage all mean light — an unparseable preference must never silently
 * darken someone's app.
 */
export function parseThemeChoice(raw: string | null | undefined): ThemeChoice {
  if (raw === 'dark') return 'dark'
  if (raw === 'system') return 'system'
  return 'light'
}

/** Read the stored choice. */
export function readThemeChoice(storage: Pick<Storage, 'getItem'>): ThemeChoice {
  return parseThemeChoice(storage.getItem(THEME_KEY))
}

/** Persist a choice. Every value is written explicitly, so clearing the key
 *  reverts to the light default rather than to whatever was last stored. */
export function writeThemeChoice(choice: ThemeChoice, storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(THEME_KEY, choice)
}

/**
 * The theme to actually paint for a choice + the current OS preference. Pure,
 * so the 'system' branch is testable without a browser.
 */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  if (choice === 'system') return prefersDark ? 'dark' : 'light'
  return choice
}

/**
 * Legacy two-state read, kept because it is the exact contract the pre-paint
 * script and `theme-contract-check.mjs` pin: 'dark' only when the stored value
 * is exactly 'dark'. A stored 'system' reads as light here — callers that care
 * about "match my phone" use `readThemeChoice` + `resolveTheme`.
 */
export function readTheme(storage: Pick<Storage, 'getItem'>): Theme {
  return storage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

/** Persist a resolved theme under THEME_KEY (the legacy write path). */
export function writeTheme(theme: Theme, storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(THEME_KEY, theme)
}

/**
 * The three choices in the order the segmented control renders them: the
 * explicit ones first, the OS-following one last, so a parent scanning left to
 * right sees Light, Dark, then the "don't make me choose" option.
 */
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system']

/** The label + one-line explanation for each choice (the control's copy). */
export interface ThemeChoiceCopy {
  label: string
  detail: string
}

export const THEME_CHOICE_COPY: Record<ThemeChoice, ThemeChoiceCopy> = {
  light: { label: 'Light', detail: 'Always the warm light look. The default.' },
  dark: { label: 'Dark', detail: 'Always the dark look, day or night.' },
  system: {
    label: 'Match my phone',
    detail: 'Follows your phone’s light or dark setting, and changes with it.',
  },
}

/** The next choice in the cycle (used by tests and any keyboard affordance). */
export function nextThemeChoice(current: ThemeChoice): ThemeChoice {
  const index = THEME_CHOICES.indexOf(current)
  return THEME_CHOICES[(index + 1) % THEME_CHOICES.length] as ThemeChoice
}

/** The other RESOLVED theme (kept for the two-state tests / callers). */
export function nextTheme(current: Theme): Theme {
  return current === 'light' ? 'dark' : 'light'
}

/** Apply a resolved theme to the document (`doc` is a parameter so tests can
 *  inject a fake; production passes `document`). */
export function applyTheme(theme: Theme, doc: Document): void {
  doc.documentElement.dataset.theme = theme
}

/**
 * The browser-chrome colour (the `<meta name="theme-color">` content) for a
 * theme: the brand terracotta in light, the dark page neutral in dark — the
 * same two values index.html ships statically and the toggle updates at
 * runtime.
 */
export function themeColorFor(theme: Theme): string {
  return theme === 'light' ? '#e8552f' : '#181412'
}
