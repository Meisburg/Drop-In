import { describe, expect, it } from 'vitest'
import {
  THEME_CHOICES,
  THEME_KEY,
  applyTheme,
  nextTheme,
  nextThemeChoice,
  parseThemeChoice,
  readTheme,
  readThemeChoice,
  resolveTheme,
  themeColorFor,
  writeTheme,
  writeThemeChoice,
} from './theme'

/** A minimal in-memory Storage stand-in for the injected `Pick<Storage,...>` seams. */
function fakeStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

describe('readTheme', () => {
  it('returns light when the key is absent (light-default contract)', () => {
    expect(readTheme(fakeStorage())).toBe('light')
  })

  it('returns dark only when the stored value is exactly "dark"', () => {
    expect(readTheme(fakeStorage({ [THEME_KEY]: 'dark' }))).toBe('dark')
  })

  it('treats an explicit "light" as light', () => {
    expect(readTheme(fakeStorage({ [THEME_KEY]: 'light' }))).toBe('light')
  })

  it('treats an empty string as light', () => {
    expect(readTheme(fakeStorage({ [THEME_KEY]: '' }))).toBe('light')
  })

  it('treats garbage as light (never silently darken on unparseable input)', () => {
    expect(readTheme(fakeStorage({ [THEME_KEY]: 'DARK' }))).toBe('light')
    expect(readTheme(fakeStorage({ [THEME_KEY]: 'dark-mode' }))).toBe('light')
    expect(readTheme(fakeStorage({ [THEME_KEY]: '1' }))).toBe('light')
  })
})

describe('writeTheme', () => {
  it('persists both states under THEME_KEY', () => {
    const storage = fakeStorage()
    writeTheme('dark', storage)
    expect(storage.getItem(THEME_KEY)).toBe('dark')
    writeTheme('light', storage)
    expect(storage.getItem(THEME_KEY)).toBe('light')
  })
})

describe('nextTheme', () => {
  it('round-trips between the two states', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme(nextTheme('light'))).toBe('light')
    expect(nextTheme(nextTheme('dark'))).toBe('dark')
  })
})

describe('applyTheme', () => {
  function fakeDocument(): { doc: Document; dataset: Record<string, string> } {
    const dataset: Record<string, string> = {}
    const doc = { documentElement: { dataset } } as unknown as Document
    return { doc, dataset }
  }

  it('sets data-theme on the document element', () => {
    const { doc, dataset } = fakeDocument()
    applyTheme('dark', doc)
    expect(dataset.theme).toBe('dark')
    applyTheme('light', doc)
    expect(dataset.theme).toBe('light')
  })
})

describe('themeColorFor', () => {
  it('maps each theme to its browser-chrome colour', () => {
    expect(themeColorFor('light')).toBe('#e8552f')
    expect(themeColorFor('dark')).toBe('#181412')
  })
})

describe('parseThemeChoice', () => {
  it('honors exactly dark and system', () => {
    expect(parseThemeChoice('dark')).toBe('dark')
    expect(parseThemeChoice('system')).toBe('system')
  })

  it('treats absent, empty, light and garbage as light', () => {
    expect(parseThemeChoice(null)).toBe('light')
    expect(parseThemeChoice(undefined)).toBe('light')
    expect(parseThemeChoice('')).toBe('light')
    expect(parseThemeChoice('light')).toBe('light')
    expect(parseThemeChoice('SYSTEM')).toBe('light')
    expect(parseThemeChoice('banana')).toBe('light')
  })
})

describe('readThemeChoice / writeThemeChoice', () => {
  it('round-trips all three choices', () => {
    for (const choice of THEME_CHOICES) {
      const storage = fakeStorage()
      writeThemeChoice(choice, storage)
      expect(storage.getItem(THEME_KEY)).toBe(choice)
      expect(readThemeChoice(storage)).toBe(choice)
    }
  })

  it('defaults an absent key to light', () => {
    expect(readThemeChoice(fakeStorage())).toBe('light')
  })
})

describe('resolveTheme', () => {
  it('resolves an explicit choice regardless of the OS', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the OS only for the system choice', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('nextThemeChoice', () => {
  it('cycles light -> dark -> system -> light', () => {
    expect(nextThemeChoice('light')).toBe('dark')
    expect(nextThemeChoice('dark')).toBe('system')
    expect(nextThemeChoice('system')).toBe('light')
  })
})
