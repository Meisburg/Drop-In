/**
 * The service-worker decision, pinned (slice 2e).
 *
 * WHAT THIS FILE IS FOR: the shell must never register a worker again. A
 * registration is what keeps the previous version's bundle alive past an app
 * update, and the two ways it can come back are pinned here — the runtime
 * decision, and the build no longer injecting the tag that caused it. If either
 * flips, this file goes red.
 *
 * COUNTING FAKES, no browser and no Capacitor: `unregister` is fire-and-forget
 * by design, so the fakes assert calls rather than awaiting them.
 */
import { describe, expect, it, vi } from 'vitest'
import viteConfig from '../../vite.config.ts?raw'
import { applyServiceWorkerPolicy, serviceWorkerAction } from './serviceWorkerPolicy'

describe('serviceWorkerAction', () => {
  it('registers in a browser and unregisters in EITHER shell', () => {
    expect(serviceWorkerAction(null)).toBe('register')
    expect(serviceWorkerAction('android')).toBe('unregister')
    expect(serviceWorkerAction('ios')).toBe('unregister')
  })
})

describe('applyServiceWorkerPolicy', () => {
  it('never registers in the shell, and clears what the old worker left', () => {
    const register = vi.fn()
    const unregister = vi.fn(async () => undefined)

    const action = applyServiceWorkerPolicy({ shell: 'android', register, unregister })

    expect(action).toBe('unregister')
    expect(register).not.toHaveBeenCalled()
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it('never unregisters in a browser — web push rides on that registration', () => {
    const register = vi.fn()
    const unregister = vi.fn(async () => undefined)

    const action = applyServiceWorkerPolicy({ shell: null, register, unregister })

    expect(action).toBe('register')
    expect(register).toHaveBeenCalledTimes(1)
    expect(unregister).not.toHaveBeenCalled()
  })
})

describe('the build', () => {
  /**
   * The decision above is only half the pin: the shell would register again if
   * the build started injecting `/registerSW.js`, which runs BEFORE any app code
   * and asks no questions about the platform. `injectRegister: false` is what
   * stops that, so it is asserted here rather than trusted to attention.
   */
  it('injects no registration script for the shell to obey', () => {
    expect(viteConfig).toMatch(/injectRegister:\s*false/)
  })
})
