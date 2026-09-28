/**
 * The /new quick-start presets (founder pick, 2026-09-27): one tap writes the
 * WHEN — the day and the 30-minute slot — instead of three steppers.
 *
 * The VALUES are unit-tested at the pure seam (`feed.test.ts`, `timePresets`).
 * This spec proves the WIRING the unit test cannot: the row renders, "Now" is
 * the pressed default, and tapping a preset actually rewrites the date input
 * and the start label.
 *
 * The day is bracketed around the mount (before `goto` … after `settleOnRoute`)
 * because /new reads its mount-time now once — the same race-proof pattern the
 * quick-post and duplicate specs use, so neither a 30-minute boundary nor
 * midnight can flake it. The 10:00 preset's slot is time-of-day only, so it
 * needs no bracket.
 */
import { expect, test } from '@playwright/test'
import { defaultStartDateIso, localDayKey, nextSlotMinutes } from '../src/lib/feed'
import { parseTimeLabel, settleOnRoute } from './fixtures'

/** The local "tomorrow" day key of an ISO instant (mirrors timePresets). */
function tomorrowKey(iso: string): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + 1)
  return localDayKey(d.toISOString())
}

test('the /new quick-start presets write the day and slot in one tap', async ({ page }) => {
  const before = new Date().toISOString()
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  const after = new Date().toISOString()

  await expect(page.getByTestId('time-presets')).toBeVisible()
  const chips = page.getByTestId('time-preset')
  // "Sat 10am" is de-duplicated away when it equals tomorrow (Fridays), so the
  // row is 3 or 4 chips — never fewer.
  expect(await chips.count()).toBeGreaterThanOrEqual(3)

  const now = chips.filter({ hasText: 'Now' })
  const tomorrow = chips.filter({ hasText: 'Tomorrow 10am' })
  const dateInput = page.locator('input[type="date"]')

  // Now IS the form's mount default, so it opens pressed.
  await expect(now).toHaveAttribute('aria-pressed', 'true')

  await tomorrow.click()
  await expect(tomorrow).toHaveAttribute('aria-pressed', 'true')
  await expect(now).toHaveAttribute('aria-pressed', 'false')
  expect([tomorrowKey(before), tomorrowKey(after)]).toContain(await dateInput.inputValue())
  expect(parseTimeLabel(await page.getByTestId('start-time-label').innerText())).toBe(10 * 60)

  // Back to Now — the same mount-time bracket proves the round trip.
  await now.click()
  await expect(now).toHaveAttribute('aria-pressed', 'true')
  expect([defaultStartDateIso(before), defaultStartDateIso(after)]).toContain(
    await dateInput.inputValue(),
  )
  const slot = parseTimeLabel(await page.getByTestId('start-time-label').innerText())
  expect([nextSlotMinutes(before), nextSlotMinutes(after)]).toContain(slot)
})
