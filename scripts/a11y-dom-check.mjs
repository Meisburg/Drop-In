/**
 * Accessibility DOM check (V22 slice 1) — the RENDERED-DOM half of the a11y
 * floor that `mobile-audit.mjs` does not cover.
 *
 * WHY THIS EXISTS, and why it is not a grep: slice 1 announced every form error
 * with `role="alert"` and wired it to its control via `{...fieldA11y(field, msg)}`.
 * A SPREAD produces `aria-describedby` at RUNTIME, so the literal string
 * `aria-describedby` never appears in the JSX. The slice's original acceptance
 * criterion ("grep for >= 15 literal occurrences") therefore measured the wrong
 * thing and would have failed a correct implementation — the builder flagged it,
 * and the plan was corrected. The criterion that actually matters is what a
 * screen reader sees, so this script drives a real browser, forces a real
 * validation failure, and inspects the live DOM.
 *
 * Usage: node scripts/a11y-dom-check.mjs [baseURL]
 *   Needs a running server: `npm run build && npm run preview` (default :4173).
 *   `E2E_BASE_URL` wins over both, so a run can be pointed at a private port
 *   without an argument (same precedence as the e2e specs).
 *
 * It asserts, on /login:
 *   1. a failed submit produces at least one `role="alert"` node with an id;
 *   2. that id is referenced by at least one control's `aria-describedby`;
 *   3. every `aria-describedby` in the document RESOLVES to an element that
 *      exists (a dangling reference is what a typo'd `errorId()` produces);
 *   4. every such control also carries `aria-invalid="true"`;
 *   5. no duplicated element `id` (an `errorId` collision would make a reference
 *      resolve to the WRONG node — silent, and worse than a dangling one).
 *
 * Exits non-zero on any failure, like the other scripts in this directory.
 */
import { chromium } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL ?? process.argv[2] ?? 'http://localhost:4173'
const failures = []

function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

// FIRST LINE, before anything is launched or measured: say which app this run
// is about to measure. A silent target is how a lane measures a sibling
// checkout's build and reports it as a defect in this tree.
console.log(`a11y-dom-check against ${BASE}\n`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

try {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })

  // Force a REAL error path. An empty submit does not work: the inputs are
  // `required`, so the browser's own validation blocks the handler and React
  // never renders an error. Valid-looking credentials the server rejects is the
  // honest trigger — it exercises the same `error` state a bad password does.
  await page.fill('input[type=email]', 'a11y-probe@example.com')
  await page.fill('input[type=password]', 'definitely-not-the-password')
  await page.getByRole('button', { name: /^Sign in$/ }).click()
  await page.waitForTimeout(3500)

  const dom = await page.evaluate(() => {
    const alerts = [...document.querySelectorAll('[role="alert"]')]
    const described = [...document.querySelectorAll('[aria-describedby]')]
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id)
    const dupes = ids.filter((v, i) => ids.indexOf(v) !== i)
    return {
      alerts: alerts.map((a) => a.id),
      described: described.map((d) => ({
        target: d.getAttribute('aria-describedby'),
        invalid: d.getAttribute('aria-invalid'),
        resolves: !!document.getElementById(d.getAttribute('aria-describedby')),
      })),
      duplicateIds: [...new Set(dupes)],
    }
  })

  console.log(`a11y-dom-check against ${BASE} at 390x844`)
  console.log(`  alerts: ${dom.alerts.length}, described controls: ${dom.described.length}`)

  check(
    'an error renders as role="alert" with an id',
    dom.alerts.length > 0 && dom.alerts.every((id) => id !== ''),
  )

  const referenced = new Set(dom.described.map((d) => d.target))
  const announced = dom.alerts.filter((id) => referenced.has(id))
  check(
    'every alert id is referenced by a control',
    dom.alerts.length > 0 && announced.length === dom.alerts.length,
    `alerts [${dom.alerts.join(', ')}], referenced [${[...referenced].join(', ')}]`,
  )

  const dangling = dom.described.filter((d) => !d.resolves)
  check(
    'every aria-describedby resolves',
    dangling.length === 0,
    dangling.map((d) => d.target).join(', '),
  )

  const notInvalid = dom.described.filter((d) => d.invalid !== 'true')
  check(
    'every described control is aria-invalid="true"',
    notInvalid.length === 0,
    `${notInvalid.length} missing`,
  )

  check('no duplicated element ids', dom.duplicateIds.length === 0, dom.duplicateIds.join(', '))
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.log(`\nFAIL — ${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nPASS — error announcements reach assistive tech')
