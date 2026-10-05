import { describe, expect, it } from 'vitest'
import {
  IMAGE_LIGHTBOX_Z_CLASS,
  MODAL_OVER_LEAFLET_Z_CLASS,
  OVERLAY_INSIDE_MODAL_Z_CLASS,
} from './stacking'

/**
 * V16 ticket 07 item 1: the "Set location" dialog opened BEHIND the map's
 * zoom control. The bug was a plain stacking comparison the modal LOST, and
 * nothing in the test suite was watching it.
 *
 * THE NUMBERS ARE READ FROM THE SHIPPED STYLESHEETS, not guessed. The first
 * attempt at this fix stopped at `.leaflet-control { z-index: 800 }` and chose
 * 900 — which is wrong twice over:
 *
 *   1. The zoom buttons are WRAPPED in `.leaflet-top` / `.leaflet-bottom`,
 *      which carry **z-index: 1000**. 800 is not the ceiling; 1000 is.
 *   2. 900 is ABOVE the app's image lightbox (which wore z-60), so the fix
 *      would have lifted the modal over the lightbox and rendered a tapped
 *      photo BEHIND the dialog.
 *
 * The real constraint is a BAND — above Leaflet, below the lightbox:
 *
 *   Leaflet panes/controls  <= 1000
 *   modal over a map           1100
 *   image lightbox             1200
 *
 * These tests pin the ORDER between our own tokens and the Leaflet constants,
 * so a future edit cannot silently re-invert the stack. What they CANNOT do is
 * compute CSS: the rendered proof is the built stylesheet emitting
 * `.z-\[1100\]{z-index:1100}` plus the visual/e2e lane.
 */
describe('the stacking band: Leaflet < modal < lightbox (V16 t07 item 1)', () => {
  /** From node_modules/leaflet/dist/leaflet.css — `.leaflet-control`. */
  const LEAFLET_CONTROL_Z = 800
  /**
   * Also from leaflet.css — `.leaflet-top`/`.leaflet-bottom`, the WRAPPERS that
   * actually hold the zoom control. This is the number a modal must beat, and
   * the one the first attempt missed.
   */
  const LEAFLET_WRAPPER_Z = 1000

  function zOf(token: string): number {
    const match = /^z-\[(\d+)\]$/.exec(token)
    if (match === null) throw new Error(`not an arbitrary z token: ${token}`)
    return Number(match[1])
  }

  it('puts the map modal above Leaflet\'s WRAPPER layer, not merely its control layer', () => {
    const modal = zOf(MODAL_OVER_LEAFLET_Z_CLASS)
    expect(modal).toBeGreaterThan(LEAFLET_CONTROL_Z)
    // The assertion that actually matters — 900 would pass the line above and
    // still lose to the real control wrapper.
    expect(modal).toBeGreaterThan(LEAFLET_WRAPPER_Z)
  })

  it('keeps the image lightbox above the map modal, so a tapped photo is never behind a dialog', () => {
    expect(zOf(IMAGE_LIGHTBOX_Z_CLASS)).toBeGreaterThan(zOf(MODAL_OVER_LEAFLET_Z_CLASS))
  })

  it('keeps the lightbox above Leaflet too (it is the topmost overlay everywhere)', () => {
    expect(zOf(IMAGE_LIGHTBOX_Z_CLASS)).toBeGreaterThan(LEAFLET_WRAPPER_Z)
  })

  it('is not the z-50 that lost the comparison', () => {
    expect(MODAL_OVER_LEAFLET_Z_CLASS).not.toBe('z-50')
  })

  it('are single tokens so a call site can append them to its own layout classes', () => {
    expect(MODAL_OVER_LEAFLET_Z_CLASS.split(' ')).toHaveLength(1)
    expect(IMAGE_LIGHTBOX_Z_CLASS.split(' ')).toHaveLength(1)
  })

  /**
   * place-photo-crop 2026-10-05: the crop step is a second portal opened from
   * inside the place-photo editor's `ModalShell`, so its index is a THIRD row in
   * the same band. At its old `z-50` it painted behind the editor's backdrop —
   * invisible and unclickable, because two overlays are compared by number, not
   * by which mounted last. A tie at 1100 would have left the winner to DOM
   * order, which is why this is its own token rather than the modal's.
   */
  it('puts an overlay opened from inside a modal above that modal', () => {
    expect(zOf(OVERLAY_INSIDE_MODAL_Z_CLASS)).toBeGreaterThan(zOf(MODAL_OVER_LEAFLET_Z_CLASS))
  })

  it('still keeps the image lightbox the topmost overlay, so the crop step cannot cover it', () => {
    expect(zOf(IMAGE_LIGHTBOX_Z_CLASS)).toBeGreaterThan(zOf(OVERLAY_INSIDE_MODAL_Z_CLASS))
    expect(OVERLAY_INSIDE_MODAL_Z_CLASS).not.toBe('z-50')
    expect(OVERLAY_INSIDE_MODAL_Z_CLASS.split(' ')).toHaveLength(1)
  })
})

