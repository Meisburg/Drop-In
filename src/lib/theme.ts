/**
 * V22 slice 14 — appearance as a USER CHOICE, not a system follow.
 *
 * The app is LIGHT by default for everyone. Dark is opt-in via the switch on
 * /settings, persisted under THEME_KEY in localStorage, and applied as a
 * `data-theme` attribute on <html> (src/index.css keys its dark tokens off
 * `:root[data-theme='dark']`, NOT off prefers-color-scheme).
 *
 * This knowingly overrides Apple's dark-mode guidance ("avoid an
 * app-specific appearance setting"): the human decided light-default + an
 * explicit opt-in after the app auto-darkened on their own prefer-dark
 * desktop (plan.md, Slice 14). Two states only — there is deliberately no
 * "follow system" option.
 *
 * Build law: pure logic lives here, dependencies are injected (storage,
 * document), React never decides. Sibling test: src/lib/theme.test.ts.
 */

export type Theme = 'light' | 'dark'

/** The localStorage key holding the user's choice. */
export const THEME_KEY = 'dropin-theme'

/**
 * Read the stored theme. Light-default is the CONTRACT: 'dark' is returned
 * ONLY when the stored value is exactly 'dark'. Absent (null), empty,
 * 'light', or garbage all mean light — an unparseable preference must never
 * silently darken someone's app.
 */
export function readTheme(storage: Pick<Storage, 'getItem'>): Theme {
  return storage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

/** Persist a theme choice ('light' or 'dark' — both written, so a later
 *  clear of the key reverts to the light default rather than to whatever
 *  was last stored). */
export function writeTheme(theme: Theme, storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(THEME_KEY, theme)
}

/** The other theme: the toggle flips between the two states. */
export function nextTheme(current: Theme): Theme {
  return current === 'light' ? 'dark' : 'light'
}

/** Apply a theme to the document (`doc` is a parameter so tests can inject a
 *  fake; production passes `document`). */
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