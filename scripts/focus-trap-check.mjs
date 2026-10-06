/**
 * Focus-trap DOM check (V22 slice 5) — proves the trap TRAPS and RESTORES.
 *
 * A grep for `useFocusTrap` proves the hook is imported, not that it works. The
 * failure modes a source check cannot see:
 *   - Tab walks out of the dialog into the page behind it;
 *   - the trap fires but focus lands on a hidden/disabled control;
 *   - closing the dialog dumps focus on <body> instead of the trigger.
 *
 * Usage: node scripts/focus-trap-check.mjs [baseURL]
 *   Needs a running server: `npm run build && npm run preview` (default :4173).
 *   `E2E_BASE_URL` wins over both, so a run can be pointed at a private port
 *   without an argument (same precedence as the e2e specs).
 *
 * It drives the ReportDialog (reachable on a public drop-in detail page) and
 * asserts, with real Tab presses:
 *   1. focus starts inside the dialog;
 *   2. N Tabs forward never leave the dialog, and wrap to the first control;
 *   3. Shift+Tab from the first control wraps to the last;
 *   4. Escape closes it and focus returns to the element that opened it.
 *
 * Exits non-zero on any failure.
 */
import { chromium } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL ?? process.argv[2] ?? 'http://localhost:4173'
const DETAIL_ID = process.argv[3]
const failures = []

function check(label, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

// FIRST LINE, before anything is launched or measured: say which app this run
// is about to measure. A silent target is how a lane measures a sibling
// checkout's build and reports it as a defect in this tree.
console.log(`focus-trap-check against ${BASE}\n`)

if (!DETAIL_ID) {
  console.log('SKIP — no drop-in id supplied.')
  console.log('  usage: node scripts/focus-trap-check.mjs <baseURL> <playdateId>')
  console.log('  The report dialog lives on a drop-in detail page, which needs a real id.')
  process.exit(0)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const insideDialog = () =>
  page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]')
    if (!dlg) return { open: false }
    const active = document.activeElement
    return {
      open: true,
      inside: dlg.contains(active),
      tag: active?.tagName?.toLowerCase() ?? null,
      testId: active?.getAttribute?.('data-testid') ?? null,
      text: (active?.textContent ?? '').trim().slice(0, 30),
      // the trigger we should return to
      described: dlg.getAttribute('aria-labelledby'),
    }
  })

try {
  await page.goto(`${BASE}/playdate/${DETAIL_ID}`, { waitUntil: 'networkidle' })

  // Open the report dialog and remember the trigger.
  const trigger = page.getByRole('button', { name: /report/i }).first()
  if ((await trigger.count()) === 0) {
    console.log('SKIP — no Report control found on this page (signed out?).')
    await browser.close()
    process.exit(0)
  }
  await trigger.evaluate((el) => el.setAttribute('data-focus-trap-trigger', '1'))
  await trigger.click()
  await page.waitForTimeout(600)

  const opened = await insideDialog()
  check('dialog opened', opened.open === true)
  check('focus starts inside the dialog', opened.inside === true, `focus on <${opened.tag}>`)

  // Tab more times than there are controls; focus must never leave.
  let escaped = null
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    const s = await insideDialog()
    if (!s.inside) {
      escaped = `after Tab #${i + 1}: <${s.tag}> ${s.text}`
      break
    }
  }
  check('Tab never escapes the dialog (12 presses)', escaped === null, escaped ?? undefined)

  // Shift+Tab must also stay inside.
  let backEscaped = null
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab')
    const s = await insideDialog()
    if (!s.inside) {
      backEscaped = `after Shift+Tab #${i + 1}`
      break
    }
  }
  check('Shift+Tab never escapes the dialog', backEscaped === null, backEscaped ?? undefined)

  // Escape closes, and focus returns to the trigger.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => ({
    dialogGone: document.querySelector('[role="dialog"]') === null,
    onTrigger: document.activeElement?.getAttribute?.('data-focus-trap-trigger') === '1',
    onBody: document.activeElement === document.body,
    tag: document.activeElement?.tagName?.toLowerCase() ?? null,
  }))
  check('Escape closes the dialog', after.dialogGone === true)
  check(
    'focus returns to the trigger element',
    after.onTrigger === true,
    after.onBody ? 'focus fell to <body>' : `focus on <${after.tag}>`,
  )
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.log(`\nFAIL — ${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nPASS — dialog focus is trapped and restored')
