/**
 * Profile section-order check (V22 slice 15) — the guard that can actually FAIL.
 *
 * WHY THIS EXISTS: V21 t08's unit test (src/lib/profileSections.test.ts) asserts
 * against PROFILE_EDIT_SECTIONS, a HAND-MAINTAINED literal at
 * src/pages/ProfilePage.tsx:70. The JSX emits its own order, and the two drifted:
 * the constant said ['user','kids','parents'] while the edit-mode DOM rendered
 * parents BEFORE kids. A comment is not a check; neither is a constant that
 * mirrors nothing. This script reads the RENDERED DOM — it enters edit mode on
 * /profile, walks the visible section headings in DOM order, maps them to pinned
 * keys, and asserts the sequence is a legal subsequence of the pinned order
 * (['user','kids','parents','dropins'], the array at src/lib/profileSections.ts:42).
 * It exits non-zero when the order drifts, naming the offending sequence.
 *
 * HEADING -> KEY MAPPING (documented so a future reorderer knows what each
 * heading means):
 *   /photo & name/i          -> 'user'    the identity card ("Your photo & name")
 *   /photo of your family/i  -> 'user'    "A photo of your family" — grouped with
 *                                         'user' because the READ view folds the
 *                                         family photo into its 'parents' card but
 *                                         the EDIT surface renders it as part of
 *                                         the identity block (it sits between the
 *                                         identity card and the first content card,
 *                                         before any kids/parents content). Both
 *                                         headings therefore map to the same key;
 *                                         consecutive duplicates are legal (a
 *                                         subsequence only forbids a LATER key
 *                                         appearing before an EARLIER one).
 *   /about the kids/i        -> 'kids'
 *   /about the parents/i     -> 'parents' the bio card
 *   /^the parents$/i         -> 'parents' the parent-cards group
 *   /linked parent/i         -> 'parents' the account-link control
 * The read view has NO "Hosted drop-ins" heading issue here (that heading exists
 * only in the read view); the edit surface omits 'dropins' entirely (V16 t04), so
 * a legal edit-surface sequence is a subsequence of [user, kids, parents].
 * NOTE: on a marker account with no bio, interests, or family photo set, the read
 * view's optional cards (kids / about-the-parents) are ABSENT by design (a family
 * with none of them gets no placeholder), so the read-view probe may legitimately
 * measure fewer headings than the pinned sequence — the subsequence assertion
 * still holds, and the edit-mode measurement below is the binding direction.
 *
 * Usage: node scripts/profile-order-check.mjs [baseURL]
 *   Needs a running server on :4173 (`npm run build && npm run preview`) and the
 *   signed-in marker session at e2e/.auth/marker-state.json (the Playwright
 *   setup project writes it; gitignored).
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const MARKER_STATE = new URL('../e2e/.auth/marker-state.json', import.meta.url).pathname
// The pinned order, copied from src/lib/profileSections.ts:42 (a script under
// scripts/ is plain JS and cannot import the TS module; re-implemented here so
// the check stays self-contained).
const PINNED = ['user', 'kids', 'parents', 'dropins']

/** Map one rendered heading text to its pinned key, or null for unknown text. */
function keyForHeading(text) {
  const t = text.trim()
  if (/photo & name/i.test(t)) return 'user'
  if (/photo of your family/i.test(t)) return 'user'
  if (/about the kids/i.test(t)) return 'kids'
  if (/about the parents/i.test(t)) return 'parents'
  if (/^the parents$/i.test(t)) return 'parents'
  if (/linked parent/i.test(t)) return 'parents'
  return null
}

/** True when `keys` is a legal subsequence of PINNED (relative order preserved).
 *  Consecutive duplicates are legal: several headings may map to the SAME key
 *  (the edit surface has three 'parents' headings and two 'user' headings), and
 *  a subsequence only forbids a LATER pinned key appearing before an EARLIER
 *  one — it never counts occurrences. */
function isSubsequence(keys) {
  let i = 0
  for (const key of keys) {
    const found = PINNED.indexOf(key, i)
    if (found === -1) return false
    // Do NOT advance past this key: the next heading may legally map to the
    // same key again (e.g. "The parents" after "About the parents").
    i = found
  }
  return true
}

const failures = []

function check(label, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const browser = await chromium.launch()
const context = await browser.newContext({
  storageState: MARKER_STATE,
  viewport: { width: 390, height: 844 },
})
const page = await context.newPage()

console.log(`profile-order-check against ${BASE}\n`)

await page.goto(BASE + '/profile', { waitUntil: 'networkidle' })
// The boot splash is a fixed inset-0 overlay that unmounts a beat after mount;
// reading before it leaves would measure the splash, not the page.
await page
  .waitForFunction(() => document.getElementById('boot-splash') === null, { timeout: 5000 })
  .catch(() => {})

// --- Read view (must be UNCHANGED by this slice — reported, not asserted). ---
const readHeadings = await page.evaluate(() =>
  [...document.querySelectorAll('main h2')].map((h) => h.textContent?.trim() ?? ''),
)
console.log(`read view headings (DOM order): ${JSON.stringify(readHeadings)}`)
const readKeys = readHeadings.map(keyForHeading).filter((k) => k !== null)
console.log(`read view keys:                ${JSON.stringify(readKeys)}`)
check(
  'read view order is a legal subsequence of the pinned order',
  isSubsequence(readKeys),
  JSON.stringify(readKeys),
)

// --- Edit mode: click "Edit profile", then measure the section order. ---
await page.getByTestId('edit-profile').click()
await page.waitForTimeout(400) // let the editor's data loads settle

const editHeadings = await page.evaluate(() =>
  [...document.querySelectorAll('main h2')].map((h) => h.textContent?.trim() ?? ''),
)
console.log(`\nedit mode headings (DOM order): ${JSON.stringify(editHeadings)}`)

const unknown = editHeadings.filter((t) => keyForHeading(t) === null)
check(
  'every edit-mode heading maps to a known pinned key',
  unknown.length === 0,
  unknown.length > 0 ? `unmapped: ${JSON.stringify(unknown)}` : 'all mapped',
)

const editKeys = editHeadings.map(keyForHeading).filter((k) => k !== null)
console.log(`edit mode keys:               ${JSON.stringify(editKeys)}`)
check(
  'edit mode order is a legal subsequence of the pinned order',
  isSubsequence(editKeys),
  JSON.stringify(editKeys),
)
check(
  'edit mode puts kids BEFORE the parents group (the pre-fix drift)',
  editKeys.indexOf('kids') < editKeys.indexOf('parents'),
  `kids@${editKeys.indexOf('kids')} parents@${editKeys.indexOf('parents')}`,
)

await browser.close()

if (failures.length > 0) {
  console.log(`\nFAIL — ${failures.length} check(s) failed`)
  console.log(`offending edit-mode order: ${JSON.stringify(editHeadings)} -> ${JSON.stringify(editKeys)}`)
  process.exit(1)
}
console.log('\nPASS — edit mode renders in the pinned read order (user → kids → parents)')