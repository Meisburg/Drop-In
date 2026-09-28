import { useEffect, useState } from 'react'
import {
  THEME_CHOICES,
  THEME_CHOICE_COPY,
  applyTheme,
  readThemeChoice,
  resolveTheme,
  themeColorFor,
  writeThemeChoice,
} from '../lib/theme'
import type { Theme, ThemeChoice } from '../lib/theme'

/**
 * Point the single <meta name="theme-color"> at the chosen theme's chrome
 * colour. The app ships ONE static meta (the light value) because it no longer
 * consults `prefers-color-scheme`; this is what makes the browser chrome follow
 * the user's choice instead of the OS.
 */
function syncThemeColorMeta(theme: Theme): void {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeColorFor(theme))
}

/** Read the OS preference right now (the fact `'system'` needs to resolve). */
function osPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const CHOICE_TEST_ID: Record<ThemeChoice, string> = {
  light: 'theme-choice-light',
  dark: 'theme-choice-dark',
  system: 'theme-choice-system',
}

/**
 * The appearance control (V22 slice 14; V27 adds "Match my phone").
 *
 * LIGHT IS STILL THE DEFAULT: an absent or unparseable stored value resolves to
 * light, which is the V22 contract `scripts/theme-contract-check.mjs` pins.
 * V27 adds the third choice a phone-shaped product needs — parents' devices
 * switch to dark at night on their own, and "Match my phone" means they set it
 * once and it keeps following, instead of re-checking a switch in every app.
 *
 * CONTROL CHOICE: three native `<input type="radio">` in a `fieldset` with a
 * `legend`, each label a 44px-tall segment. Native radios keep arrow-key
 * roving, Space to select, and a screen-reader "radio, selected" announcement
 * with no custom key handling. The visible segment is the label; the input is
 * `sr-only` inside it.
 *
 * RULES live in src/lib/theme.ts (pure, sibling-tested); this component only
 * renders and executes. On mount the effect reconciles what the pre-paint
 * script in index.html already set (no flash either way); a live media-query
 * listener keeps "Match my phone" correct when the OS flips while the app is
 * open.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice(window.localStorage))
  const [prefersDark, setPrefersDark] = useState<boolean>(() => osPrefersDark())

  // Keep the OS fact live so a 'system' choice repaints the moment the phone
  // flips, without a reload.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved = resolveTheme(choice, prefersDark)

  // Reconcile on mount AND on every resolved change (HMR re-mounts included):
  // the pre-paint script has already set the attribute before first paint, and
  // this makes React state and the DOM agree. It must ALSO sync the
  // browser-chrome meta — the first version only set the meta inside the
  // toggle, so a returning dark user got the LIGHT terracotta chrome on every
  // load until they touched the switch (found by
  // scripts/theme-contract-check.mjs case 6).
  useEffect(() => {
    applyTheme(resolved, document)
    syncThemeColorMeta(resolved)
  }, [resolved])

  function choose(next: ThemeChoice) {
    setChoice(next)
    writeThemeChoice(next, window.localStorage)
    const theme = resolveTheme(next, osPrefersDark())
    applyTheme(theme, document)
    syncThemeColorMeta(theme)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="theme-toggle"
    >
      <p className="text-xs text-slate-500">
        Light is the default. Choose dark, or let Drop In follow your phone.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {THEME_CHOICES.map((option) => (
          <label
            key={option}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-1 ${
              choice === option
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                : 'border-slate-300 bg-white text-slate-600'
            }`}
          >
            <input
              type="radio"
              name="theme-choice"
              value={option}
              checked={choice === option}
              onChange={() => choose(option)}
              data-testid={CHOICE_TEST_ID[option]}
              className="sr-only"
            />
            {THEME_CHOICE_COPY[option].label}
          </label>
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-500" data-testid="theme-choice-detail">
        {THEME_CHOICE_COPY[choice].detail}
      </p>
    </div>
  )
}
