import { describe, expect, it } from 'vitest'
import { THEME_KEY, applyTheme, nextTheme, readTheme, themeColorFor, writeTheme } from './theme'

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