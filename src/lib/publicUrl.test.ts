import { describe, expect, it } from 'vitest'
import {
  NATIVE_PUBLIC_FALLBACK,
  NATIVE_SHELL_ORIGIN,
  currentPublicOrigin,
  isNativeShellOrigin,
  normalizeBaseUrl,
  resolvePublicOrigin,
} from './publicUrl'

/**
 * The native plan's slice 1 hazard, pinned. Every one of these cases was a real
 * broken link in the shell: an OAuth return, a password-reset email, a share URL
 * and the email transport's base.
 */
describe('resolvePublicOrigin', () => {
  it('prefers the configured public base URL over anything local', () => {
    expect(
      resolvePublicOrigin({ configured: 'https://drop-in-mu.vercel.app', origin: NATIVE_SHELL_ORIGIN }),
    ).toBe('https://drop-in-mu.vercel.app')
  })

  it('a browser tab answers with its own origin — the correct, unchanged behaviour', () => {
    expect(resolvePublicOrigin({ configured: '', origin: 'http://localhost:4173' })).toBe(
      'http://localhost:4173',
    )
    expect(resolvePublicOrigin({ configured: undefined, origin: 'https://drop-in-mu.vercel.app' })).toBe(
      'https://drop-in-mu.vercel.app',
    )
  })

  it('NEVER lets a native build emit a localhost link', () => {
    // The whole point: nothing configured, and the shell's own origin. Before
    // this module, every one of the four call sites returned https://localhost.
    expect(resolvePublicOrigin({ configured: '', origin: NATIVE_SHELL_ORIGIN })).toBe(
      NATIVE_PUBLIC_FALLBACK,
    )
    expect(resolvePublicOrigin({ configured: '   ', origin: `${NATIVE_SHELL_ORIGIN}:8080` })).toBe(
      NATIVE_PUBLIC_FALLBACK,
    )
  })

  it('treats a whitespace-only configured value as absent', () => {
    expect(resolvePublicOrigin({ configured: '  ', origin: 'https://example.test' })).toBe(
      'https://example.test',
    )
  })

  it('strips trailing slashes so a path never doubles up', () => {
    expect(resolvePublicOrigin({ configured: 'https://example.test///', origin: 'x' })).toBe(
      'https://example.test',
    )
  })
})

describe('isNativeShellOrigin', () => {
  it('recognises the shell, with or without an explicit port', () => {
    expect(isNativeShellOrigin(NATIVE_SHELL_ORIGIN)).toBe(true)
    expect(isNativeShellOrigin(`${NATIVE_SHELL_ORIGIN}:8080`)).toBe(true)
  })

  it('does not mistake the ordinary web origins for it', () => {
    for (const origin of [
      'http://localhost:4173',
      'http://localhost:4180',
      'https://drop-in-mu.vercel.app',
      '',
      'nonsense',
    ]) {
      expect(isNativeShellOrigin(origin), origin).toBe(false)
    }
  })
})

describe('normalizeBaseUrl', () => {
  it('trimmed, slash-free, null-safe', () => {
    expect(normalizeBaseUrl(' https://a.test/ ')).toBe('https://a.test')
    expect(normalizeBaseUrl(null)).toBe('')
    expect(normalizeBaseUrl(undefined)).toBe('')
  })
})

describe('currentPublicOrigin', () => {
  it('is callable in a DOM-less test run and never throws', () => {
    // vitest has no `window`; the point is that the runtime edge degrades
    // instead of exploding at import time.
    expect(() => currentPublicOrigin()).not.toThrow()
  })
})

describe('currentPublicOrigin at the runtime edge', () => {
  it('uses the shell fallback AND says so out loud when nothing is configured', async () => {
    const { vi } = await import('vitest')
    vi.stubGlobal('window', { location: { origin: 'https://localhost' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const configured = import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined

    const resolved = currentPublicOrigin()
    if (configured === undefined || configured.trim() === '') {
      // The measured slice-1 hazard: the shell's own origin must never come back.
      expect(resolved).toBe(NATIVE_PUBLIC_FALLBACK)
      expect(resolved).not.toContain('localhost')
      // …and the build defect is LOUD rather than silent.
      expect(warn).toHaveBeenCalled()
      expect(String(warn.mock.calls[0]?.[0])).toContain('VITE_PUBLIC_BASE_URL')
    } else {
      expect(resolved).toBe(configured.trim().replace(/\/+$/, ''))
    }
    warn.mockRestore()
    vi.unstubAllGlobals()
  })

  it('says nothing when a browser tab answers for itself', async () => {
    const { vi } = await import('vitest')
    vi.stubGlobal('window', { location: { origin: 'https://drop-in-mu.vercel.app' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(currentPublicOrigin()).toBe('https://drop-in-mu.vercel.app')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
    vi.unstubAllGlobals()
  })
})
