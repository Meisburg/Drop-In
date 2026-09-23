import { useEffect, useState } from 'react'
import { applyTheme, nextTheme, readTheme, themeColorFor, writeTheme } from '../lib/theme'
import type { Theme } from '../lib/theme'

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

/**
 * The appearance switch (V22 slice 14) — light is the default for everyone;
 * dark is opt-in and persisted under 'dropin-theme'. Mounted on /settings.
 *
 * CONTROL CHOICE: a real <input type="checkbox"> with role="switch" and
 * aria-checked, wrapped in a <label>. A labelled checkbox was picked over a
 * bare button+aria-label because it keeps native keyboard semantics (Space
 * toggles, focus ring, screen-reader "switch, checked/unchecked") with zero
 * custom key handling — the label supplies the accessible name.
 *
 * RULES live in src/lib/theme.ts (read/write/next/apply/themeColorFor — pure,
 * sibling-tested); this component only renders and executes. On mount it
 * reconciles the attribute the pre-paint script in index.html already set
 * (no flash either way); on change it applies + persists + updates the single
 * runtime-updated <meta name="theme-color"> tag.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean>(() => readTheme(window.localStorage) === 'dark')

  // Reconcile on mount: the pre-paint script in index.html has already applied
  // the stored choice before first paint; this makes React state match DOM
  // state even if that script ever changes (and covers HMR re-mounts).
  //
  // V22 slice 14 FIX: this must ALSO sync the browser-chrome meta, not just the
  // attribute. The first version only set the meta inside `toggle()`, so a
  // returning dark user got the LIGHT terracotta chrome (#e8552f) on every load
  // until they touched the switch — the attribute said dark, the chrome said
  // light, and nothing reconciled them. Found by
  // scripts/theme-contract-check.mjs case 6.
  useEffect(() => {
    applyTheme(dark ? 'dark' : 'light', document)
    syncThemeColorMeta(dark ? 'dark' : 'light')
  }, [dark])

  function toggle() {
    const next = nextTheme(dark ? 'dark' : 'light')
    setDark(next === 'dark')
    applyTheme(next, document)
    writeTheme(next, window.localStorage)
    syncThemeColorMeta(next)
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label htmlFor="theme-toggle" className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="font-medium text-slate-800">Dark mode</span>
        <span className="text-xs text-slate-500">
          Light is the default. Turn on to use the dark appearance.
        </span>
      </label>
      {/* 44px tap target: the track's hit area is a 44x44 label (min-h-11);
          the visible track is 26px tall inside it. */}
      <label
        htmlFor="theme-toggle"
        className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
      >
        <input
          id="theme-toggle"
          data-testid="theme-toggle"
          type="checkbox"
          role="switch"
          aria-checked={dark}
          checked={dark}
          onChange={toggle}
          className="peer sr-only"
        />
        {/* Track + thumb drawn as siblings of the input (sr-only keeps the
            native control fully keyboard-operable while the visuals are ours). */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-1/2 top-1/2 h-[26px] w-[46px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
            dark ? 'bg-indigo-600' : 'bg-slate-300'
          }`}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            dark ? '-translate-x-[11px] -translate-y-1/2' : '-translate-x-[21px] -translate-y-1/2'
          }`}
        />
      </label>
    </div>
  )
}