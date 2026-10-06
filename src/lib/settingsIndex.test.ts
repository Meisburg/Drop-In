/**
 * The /settings index table and its URL rules.
 *
 * WHY THIS TEST EXISTS. Two failure modes are quiet here, and both shipped as
 * real defects elsewhere in this repo:
 *
 *  1. **A row whose glyph name is not a real `NAV_ICONS` key.** The renderer
 *     resolves `NAV_ICONS[row.icon]`; a name that misses draws NOTHING — an
 *     empty box beside a category — and no typecheck catches it once the name
 *     is a string union that drifted from the icon module.
 *  2. **A legacy hash that stops mapping.** `/settings#privacy` is the deep
 *     link the app's own copy advertises, so the hash→path rule is a
 *     compatibility contract: a table edit that quietly drops a category makes
 *     every external bookmark land nowhere.
 *
 * The `NAV_ICONS` import is a test-only read of a data map, the same direction
 * `src/lib/db-messages.test.ts` already takes (no `lib/` module imports from
 * `components/` at runtime — see this module's own header).
 */
import { describe, expect, it } from 'vitest'
import { NAV_ICONS } from '../components/icons'
import {
  SETTINGS_CATEGORY_DESCRIPTIONS,
  SETTINGS_CATEGORY_IDS,
  SETTINGS_INDEX,
  SETTINGS_PANE_MEDIA_QUERY,
  isSettingsCategoryId,
  resolveSettingsView,
  settingsCategoryFromPath,
  settingsCategoryPath,
  settingsRow,
  type SettingsCategoryId,
} from './settingsIndex'

describe('SETTINGS_INDEX (the one table both the phone index and the pane read)', () => {
  it('has exactly the six load-bearing ids, in the shipped order, with none repeated', () => {
    // The ids are hash deep-link targets (`/settings#privacy`) and URL segments;
    // the order is the old scrolling page's, so nothing moved that did not have
    // to. An extra or missing row is a section that vanished — the defect this
    // six-row decision exists to prevent.
    expect(SETTINGS_INDEX.map((row) => row.id)).toEqual([...SETTINGS_CATEGORY_IDS])
    expect(new Set(SETTINGS_INDEX.map((row) => row.id)).size).toBe(SETTINGS_INDEX.length)
    expect(SETTINGS_INDEX).toHaveLength(6)
  })

  it('keeps Privacy & safety as its own row', () => {
    // Named on its own because the handover omitted it: a future "tidy the
    // index" edit that drops it would put the block list behind "Account".
    expect(SETTINGS_INDEX.map((row) => row.id)).toContain('privacy')
  })

  it('gives every row a real label, a real one-line blurb and a real glyph', () => {
    for (const row of SETTINGS_INDEX) {
      expect(row.label.trim(), `${row.id} label`).not.toBe('')
      expect(row.label, `${row.id} label is one line`).not.toContain('\n')
      expect(row.blurb.trim(), `${row.id} blurb`).not.toBe('')
      expect(row.blurb, `${row.id} blurb is one line`).not.toContain('\n')
      // The glyph name must resolve in the app's ONE icon table — a miss draws
      // an empty box rather than failing loudly.
      const path = NAV_ICONS[row.icon as keyof typeof NAV_ICONS]
      expect(typeof path, `${row.id} icon "${row.icon}" must be a NAV_ICONS key`).toBe('string')
      expect((path ?? '').trim(), `${row.id} glyph must draw something`).not.toBe('')
    }
  })

  it('does not reuse one blurb for two categories', () => {
    const blurbs = SETTINGS_INDEX.map((row) => row.blurb)
    expect(new Set(blurbs).size).toBe(blurbs.length)
  })
})

describe('SETTINGS_CATEGORY_DESCRIPTIONS', () => {
  it('carries a non-empty sentence for every category, and no extras', () => {
    expect(Object.keys(SETTINGS_CATEGORY_DESCRIPTIONS).sort()).toEqual(
      [...SETTINGS_CATEGORY_IDS].sort(),
    )
    for (const id of SETTINGS_CATEGORY_IDS) {
      expect(SETTINGS_CATEGORY_DESCRIPTIONS[id].trim(), `${id} description`).not.toBe('')
    }
  })
})

describe('settingsRow', () => {
  it('returns the row for every category (total over the union)', () => {
    for (const id of SETTINGS_CATEGORY_IDS) {
      expect(settingsRow(id).id).toBe(id)
    }
  })
})

describe('settingsCategoryPath / settingsCategoryFromPath', () => {
  it('round-trips every category through its URL', () => {
    for (const id of SETTINGS_CATEGORY_IDS) {
      expect(settingsCategoryPath(id)).toBe(`/settings/${id}`)
      expect(settingsCategoryFromPath(settingsCategoryPath(id))).toBe(id)
      expect(settingsCategoryFromPath(`${settingsCategoryPath(id)}/`)).toBe(id)
    }
  })

  it('names no category for the index, an unknown segment, or a nested path', () => {
    expect(settingsCategoryFromPath('/settings')).toBeNull()
    expect(settingsCategoryFromPath('/settings/')).toBeNull()
    expect(settingsCategoryFromPath('/settings/bogus')).toBeNull()
    expect(settingsCategoryFromPath('/settings/saved/extra')).toBeNull()
    expect(settingsCategoryFromPath('/profile')).toBeNull()
  })
})

describe('isSettingsCategoryId', () => {
  it('accepts the six ids and refuses anything else', () => {
    for (const id of SETTINGS_CATEGORY_IDS) expect(isSettingsCategoryId(id)).toBe(true)
    for (const value of ['', 'saved ', 'Saved', 'notes', 'privacy-safety']) {
      expect(isSettingsCategoryId(value), `${JSON.stringify(value)} is not a category`).toBe(false)
    }
  })
})

describe('resolveSettingsView', () => {
  const wide = true
  const phone = false

  it('shows the phone index and no body for a bare /settings below md', () => {
    expect(resolveSettingsView({ pathname: '/settings', hash: '', wide: phone })).toEqual({
      kind: 'index',
    })
  })

  it('selects the first category on a bare /settings at md and up, so the pane is never blank', () => {
    expect(resolveSettingsView({ pathname: '/settings', hash: '', wide })).toEqual({
      kind: 'category',
      id: 'notifications',
    })
  })

  it('renders the named category at either width', () => {
    for (const id of SETTINGS_CATEGORY_IDS) {
      expect(resolveSettingsView({ pathname: `/settings/${id}`, hash: '', wide: phone })).toEqual({
        kind: 'category',
        id,
      })
      expect(resolveSettingsView({ pathname: `/settings/${id}`, hash: '', wide })).toEqual({
        kind: 'category',
        id,
      })
    }
  })

  it('tolerates a trailing slash on the index and on a category', () => {
    expect(resolveSettingsView({ pathname: '/settings/', hash: '', wide: phone })).toEqual({
      kind: 'index',
    })
    expect(resolveSettingsView({ pathname: '/settings/saved/', hash: '', wide: phone })).toEqual({
      kind: 'category',
      id: 'saved',
    })
  })

  it('maps the legacy hash to that category, replace-not-push, at either width', () => {
    for (const id of SETTINGS_CATEGORY_IDS) {
      const expected = { kind: 'redirect', to: `/settings/${id}` }
      expect(resolveSettingsView({ pathname: '/settings', hash: `#${id}`, wide: phone })).toEqual(
        expected,
      )
      expect(resolveSettingsView({ pathname: '/settings', hash: `#${id}`, wide })).toEqual(expected)
    }
  })

  it('lets the hash win over the path it was appended to', () => {
    expect(
      resolveSettingsView({ pathname: '/settings/appearance', hash: '#saved', wide: phone }),
    ).toEqual({ kind: 'redirect', to: '/settings/saved' })
  })

  it('ignores a hash that names no category', () => {
    expect(resolveSettingsView({ pathname: '/settings', hash: '#notes', wide: phone })).toEqual({
      kind: 'index',
    })
    expect(resolveSettingsView({ pathname: '/settings', hash: '#', wide: phone })).toEqual({
      kind: 'index',
    })
  })

  it('sends a /settings/<unknown> URL back to the index instead of rendering nothing', () => {
    expect(resolveSettingsView({ pathname: '/settings/bogus', hash: '', wide: phone })).toEqual({
      kind: 'redirect',
      to: '/settings',
    })
  })

  it('pins the pane breakpoint to the width Tailwind md: compiles to', () => {
    // 48rem = 768px = Tailwind's `md`. The page's `md:grid-cols-[...]` is the CSS
    // half of this same value; if one moves, the pane's layout and its selection
    // disagree (an empty left column beside a hidden body, or the reverse).
    expect(SETTINGS_PANE_MEDIA_QUERY).toBe('(min-width: 48rem)')
  })

  it('never names a category that is not in the table', () => {
    const seen: SettingsCategoryId[] = []
    for (const pathname of ['/settings', '/settings/', '/settings/saved', '/settings/bogus']) {
      const view = resolveSettingsView({ pathname, hash: '', wide })
      if (view.kind === 'category') seen.push(view.id)
    }
    for (const id of seen) expect(SETTINGS_CATEGORY_IDS).toContain(id)
  })
})
