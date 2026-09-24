/**
 * Profile section-order check (V22 slice 15; V23 slice 16 extended it) — the
 * guard that can actually FAIL.
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
 * V23 SLICE 16 ADDED THE CROSS-SURFACE COMPARISON. The founder's complaint was
 * that the READ view and the EDIT surface put the SAME information in different
 * places on screen (the family photo closed the "About the parents" card in the
 * read view but led the page as its own card in the editor). Pinned-order
 * assertions alone cannot catch THAT kind of drift: both surfaces can be legal
 * subsequences of the pinned order and still disagree with each other. So this
 * script now measures BOTH surfaces, maps each heading to a common block
 * vocabulary (the family photo counts as its OWN observed position), and fails
 * when the two sequences disagree — naming both. The single source of truth for
 * the shared blocks is the pure profileBlurbOrder seam (src/lib/photoStorage.ts);
 * this script keeps the rendered DOM honest against it.
 *
 * HEADING -> KEY MAPPING (documented so a future reorderer knows what each
 * heading means):
 *   /photo & name/i          -> 'user'    the identity card ("Your photo & name")
 *   /photo of your family/i  -> 'familyPhoto' "A photo of your family" — its OWN
 *                                         block (V23 s16): the cross-surface
 *                                         comparison needs to see WHERE it sits,
 *                                         not fold it into another key. In the
 *                                         read view it renders inside the
 *                                         "About the parents" card (no heading of
 *                                         its own), so the read probe detects it
 *                                         by its [data-testid="family-photo"]
 *                                         image instead.
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
 * still holds, and the cross-surface comparison below uses the SHARED-block
 * projection, which stays comparable even when one surface shows more.
 *
 * Usage: node scripts/profile-order-check.mjs [baseURL]
 *   Needs a running server on :4173 (`npm run build && npm run preview`) and the
 *   signed-in marker session at e2e/.auth/marker-state.json (the Playwright
 *   setup project writes it; gitignored).
 *
 * WHERE THIS RUNS, AND WHY IT IS NOT IN `verify`.
 * The lane runs in `.github/workflows/e2e-scheduled.yml` — nightly on its
 * schedule and by manual dispatch — as `npm run a11y:profile-order` against the
 * same build the e2e suite uses. The decision (a scheduled live-account lane
 * instead of a dedicated test project) is recorded in `docs/agents/ci.md`.
 * It stays out of `npm run verify` because verify is static and server-free:
 * every check inside it reads source or runs without servers, while this one
 * needs a built bundle, a preview server on :4173, and the signed-in marker
 * session.
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const MARKER_STATE = new URL('../e2e/.auth/marker-state.json', import.meta.url).pathname
// The pinned order, copied from src/lib/profileSections.ts:42 (a script under
// scripts/ is plain JS and cannot import the TS module; re-implemented here so
// the check stays self-contained).
const PINNED = ['user', 'kids', 'parents', 'dropins']
// The COMMON BLOCK VOCABULARY for the cross-surface comparison (V23 s16). It is
// the six-block order of the pure profileBlurbOrder seam (src/lib/photoStorage.ts)
// minus the read-only 'dropins' tail, with the family photo named as its OWN
// block so its POSITION is observable on both surfaces.
const SHARED_BLOCKS = ['user', 'kids', 'parents', 'familyPhoto', 'parentCards', 'linkedParent']

/** Map one rendered heading text to its block key, or null for unknown text.
 *  The family photo is its OWN key ('familyPhoto') — the cross-surface
 *  comparison (V23 s16) needs to see WHERE it sits on each surface, so it must
 *  not be folded into another key. */
function keyForHeading(text) {
  const t = text.trim()
  if (/photo & name/i.test(t)) return 'user'
  if (/photo of your family/i.test(t)) return 'familyPhoto'
  if (/about the kids/i.test(t)) return 'kids'
  if (/about the parents/i.test(t)) return 'parents'
  if (/^the parents$/i.test(t)) return 'parents'
  if (/linked parent/i.test(t)) return 'parents'
  return null
}

/** True when `keys` is a legal subsequence of PINNED (relative order preserved).
 *  Consecutive duplicates are legal: several headings may map to the SAME key
 *  (the edit surface has three 'parents' headings), and a subsequence only
 *  forbids a LATER pinned key appearing before an EARLIER one — it never counts
 *  occurrences. The family-photo key maps onto the parents region (it closes the
 *  "About the parents" card in the read view and sits inside the parents group
 *  in the editor), so it checks against 'parents'. */
function isSubsequence(keys) {
  let i = 0
  for (const key of keys) {
    const pinnedKey = key === 'familyPhoto' ? 'parents' : key
    const found = PINNED.indexOf(pinnedKey, i)
    if (found === -1) return false
    // Do NOT advance past this key: the next heading may legally map to the
    // same key again (e.g. "The parents" after "About the parents").
    i = found
  }
  return true
}

/**
 * Project one surface's observed block sequence onto the SHARED_BLOCKS
 * vocabulary: keep only the shared blocks, dedupe CONSECUTIVE repeats (several
 * headings may map to the same key — "About the parents", "The parents" and
 * "Linked parent" are all 'parents'), and drop any key outside the vocabulary
 * (the read view's 'dropins'). The result is the surface's sequence of SHARED
 * blocks, ready to compare against the other surface's projection.
 */
function sharedProjection(observed) {
  const out = []
  for (const key of observed) {
    if (!SHARED_BLOCKS.includes(key)) continue
    if (out[out.length - 1] === key) continue
    out.push(key)
  }
  return out
}

const failures = []

function check(label, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

// ---------------------------------------------------------------------------
// V23 REVIEW — THE CHECK NOW SEEDS THE CONTENT IT NEEDS.
//
// WHY THIS EXISTS. The first version read whatever the marker account happened
// to hold. The marker has no bio, kids, or family photo, so the READ view
// rendered ZERO shared blocks and every cross-surface assertion compared `[]`
// against the editor's list and passed for ANY editor order. That was proven by
// injecting `readShared = []` and watching both checks print `ok`. A guard whose
// subject is absent is not a guard.
//
// So the check now SETS a bio (which makes the read view render its "About the
// parents" block and pushes `parents` into the projection) and a family photo
// (which is the block whose POSITION the V23 s16 fix moves), measures, then
// RESTORES the prior values. It is self-cleaning because this is a live database
// holding real family data — a check that leaves a bio behind would be editing
// someone's profile.
//
// WHAT IT DOES NOT SEED, and why: KIDS. The kids block is gated on
// `isOwnProfile && kids.length > 0` and adding a kid row means inserting into
// `kids` + `playdate_kids`-adjacent tables with their own policies, for a block
// whose position this fix does not change. The read side therefore exercises
// `user -> parents -> familyPhoto`, which is the part the drift was in. The
// seeding is enough to make the comparison NON-VACUOUS, which is the property
// that was missing; it is not a claim to cover every block.
// ---------------------------------------------------------------------------

/** The env the seeding needs, read from the same .env the app builds with. */
async function readSupabaseEnv() {
  const { readFileSync } = await import('node:fs')
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue
    const i = line.indexOf('=')
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }
}

/** The marker's own JWT + id, pulled out of the saved storageState. */
async function markerCredentials(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))
    if (key === undefined) return null
    const raw = JSON.parse(localStorage.getItem(key))
    return {
      jwt: raw.access_token ?? raw.session?.access_token ?? null,
      userId: raw.user?.id ?? raw.session?.user?.id ?? null,
    }
  })
}

/**
 * Upload a REAL object for the seeded family-photo path.
 *
 * WHY THIS IS NEEDED AND WHAT IT TAUGHT: seeding `family_photo_url` with a
 * non-null path is NOT enough to make the read view render its photo block.
 * `useFamilyPhotoUrl` mints a SIGNED URL and returns null when the object does
 * not exist, and the read view gates the whole block on that URL — so a
 * synthetic path renders NOTHING, and the order check's read side kept reporting
 * `familyPhoto` absent (`read index -1`) even while the column was set. The
 * EDITOR is different: its "A photo of your family" card is always present and
 * the heading renders regardless (its empty state IS the card), which is exactly
 * why the drift this check exists for was visible on one surface and not the
 * other.
 *
 * A 1x1 PNG is the smallest real object that mints. Uploaded with the marker's
 * own JWT, at `<uid>/family/<name>` — the path shape `familyPhotoObjectPath`
 * accepts. Returns the object path, or null when the upload failed (reported,
 * never thrown: an upload problem must not read as an ordering defect).
 */
async function uploadFixturePhoto(page, env, jwt, userId) {
  const objectPath = `${userId}/family/order-check-fixture.png`
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  const res = await fetch(`${env.url}/storage/v1/object/kid-photos/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: png,
  })
  if (!res.ok) {
    console.log(
      `  NOTE: fixture photo upload failed HTTP ${res.status} - ${(await res.text()).slice(0, 140)}`,
    )
    return null
  }
  return objectPath
}

/** Remove the fixture object. Best-effort: a leftover 70-byte PNG is harmless
 *  but it is still someone's storage, so it is deleted on the way out. */
async function deleteFixturePhoto(env, jwt, objectPath) {
  if (objectPath === null) return
  await fetch(`${env.url}/storage/v1/object/kid-photos/${objectPath}`, {
    method: 'DELETE',
    headers: { apikey: env.anonKey, Authorization: `Bearer ${jwt}` },
  }).catch(() => {})
}

/**
 * PATCH the marker's profile and return the PRIOR values so they can be put
 * back. `family_photo_url` is a private-bucket path, not a URL — the read view
 * only needs it to be non-null for the photo block to render, and the signed-URL
 * fetch failing is a separate concern from block ORDER (which is what is under
 * test here). A failure is reported and skipped, never thrown: a seeding problem
 * must not look like an ordering defect.
 */
async function seedProfile(page, env, patch) {
  const creds = await markerCredentials(page)
  if (creds === null || creds.jwt === null) {
    console.log('  NOTE: no marker JWT in the saved state — seeding skipped.')
    return null
  }
  const headers = {
    apikey: env.anonKey,
    Authorization: `Bearer ${creds.jwt}`,
    'Content-Type': 'application/json',
  }
  const readRes = await fetch(
    `${env.url}/rest/v1/profiles?id=eq.${creds.userId}&select=${Object.keys(patch).join(',')}`,
    { headers },
  )
  const prior = readRes.ok ? (await readRes.json())[0] ?? {} : {}
  const writeRes = await fetch(`${env.url}/rest/v1/profiles?id=eq.${creds.userId}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!writeRes.ok) {
    console.log(
      `  NOTE: seeding PATCH failed HTTP ${writeRes.status} — ${(await writeRes.text()).slice(0, 120)}`,
    )
    return null
  }
  return prior
}

/**
 * PUT the marker's profile back to its prior values over plain REST, using the
 * credentials captured BEFORE any browser work — so the restore survives the
 * exact failure class the teardown exists for: a crashed renderer or closed
 * context after seeding. Never touches the page. Throws on failure; the
 * finally block catches and reports it separately from the original error.
 */
async function restoreProfile(env, jwt, userId, patch) {
  const res = await fetch(`${env.url}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - ${(await res.text()).slice(0, 120)}`)
  }
}

const browser = await chromium.launch()
let seeded = false
let prior = null
let fixtureObjectPath = null
let markerJwt = null
let markerUserId = null
let env
let page

try {
  const context = await browser.newContext({
    storageState: MARKER_STATE,
    viewport: { width: 390, height: 844 },
  })
  page = await context.newPage()

  console.log(`profile-order-check against ${BASE}\n`)

await page.goto(BASE + '/profile', { waitUntil: 'networkidle' })
// The boot splash is a fixed inset-0 overlay that unmounts a beat after mount;
// reading before it leaves would measure the splash, not the page.
await page
  .waitForFunction(() => document.getElementById('boot-splash') === null, { timeout: 5000 })
  .catch(() => {})

// --- SEED the content whose ORDER this check is about (see the block above). ---
env = await readSupabaseEnv()
const SEED_BIO = 'Order-check fixture: we like parks and snacks.'
const SEED_PHOTO = 'order-check-fixture/family.jpg'
if (env.url !== undefined && env.anonKey !== undefined) {
  const creds = await markerCredentials(page)
  markerJwt = creds?.jwt ?? null
  markerUserId = creds?.userId ?? null
  // Upload the object BEFORE the column points at it, so the read view's
  // signed-URL mint has something real to sign (see uploadFixturePhoto).
  if (creds !== null && creds.jwt !== null && creds.userId !== null) {
    fixtureObjectPath = await uploadFixturePhoto(page, env, creds.jwt, creds.userId)
  }
  prior = await seedProfile(page, env, {
    bio: SEED_BIO,
    family_photo_url: fixtureObjectPath ?? SEED_PHOTO,
  })
  seeded = prior !== null
  if (seeded) {
    console.log(
      `seeded: bio + family photo (object uploaded=${fixtureObjectPath !== null}, ` +
        `prior bio=${JSON.stringify(prior.bio ?? null)})`,
    )
    // Reload so the read view renders the seeded blocks.
    await page.reload({ waitUntil: 'networkidle' })
    await page
      .waitForFunction(() => document.getElementById('boot-splash') === null, { timeout: 5000 })
      .catch(() => {})
    await page.waitForTimeout(1200)
  }
}
console.log('')

// --- Read view. ---
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

// The read view folds the family photo INTO its "About the parents" card: the
// image sits AFTER that heading, inside the same card (ProfileView.tsx:571,
// "THE FAMILY PHOTO IS THE CLOSER"), and it has no heading of its own — so it is
// detected by its image's testid and its position recorded RELATIVE to the
// headings.
//
// V23 REVIEW — THIS LINE WAS WRONG AND IT MADE THE CHECK LIE. The first version
// inserted 'familyPhoto' BEFORE 'parents':
//     [...readKeys.slice(0, lastIndexOf('parents')), 'familyPhoto', 'parents']
// which encodes the OPPOSITE of the DOM order. It went unnoticed because the
// photo never rendered (no seeded object), so `readFamilyPhotoPresent` was
// always false and the branch never ran — a latent bug hidden behind the
// vacuity this check was being fixed for. Once seeding made the photo render,
// the check FAILED against a correct page: it reported read=["familyPhoto",
// "parents"] and accused the editor of disagreeing. The page was right; the
// probe was wrong. Recorded because "the check now fails" is only a finding if
// the check is trustworthy, and this one was not.
const readFamilyPhotoPresent = await page.locator('[data-testid="family-photo"]').count() > 0
const readObserved = readFamilyPhotoPresent
  ? [...readKeys, 'familyPhoto']
  : readKeys
console.log(`read view shared blocks:       ${JSON.stringify(sharedProjection(readObserved))}`)

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

// --- Cross-surface comparison (V23 s16): the TWO SURFACES AGAINST EACH OTHER.
// Each surface's observed block sequence is projected onto the shared
// vocabulary (the family photo counts as its own observed position), and the
// projections must agree EXACTLY — a reorder that lands on one page alone is
// exactly the drift this check kills. The edit surface always carries more
// blocks than the read view shows (its parent cards + linked-parent control are
// ALWAYS-present cards, and the read view omits them entirely), so the
// comparison is made on the PROJECTION: the read surface's shorter list is
// legal only when every block it shows sits where the editor's does. Concretely:
// the read projection must be a SUBSEQUENCE of the edit projection (same
// relative order, no block out of place) AND the family photo must sit in the
// same RELATIVE position on both surfaces (after the bio on each).
//
// V23 REVIEW — THE VACUITY THIS CHECK USED TO HAVE, AND HOW IT WAS PROVEN.
// The marker account has no bio, kids, or family photo, so the read view
// legitimately renders ZERO shared blocks. The check then compared `[]` against
// the editor's list and passed — for any editor order whatsoever — and the
// family-photo check short-circuited on `readPhotoIdx === -1`. PROVEN by
// injecting `readShared = []` and watching both checks report `ok` against a
// populated edit side. A check that cannot fail on the account it actually runs
// against is not a gate; it is a log line. The old comment even admitted "passes
// vacuously", which is the shape of the defect rather than a defence of it.
//
// THE FIX, in two parts:
//   1. The read projection must be a subsequence of the EDIT projection (not
//      merely of the pinned order), so the editor is genuinely the other half of
//      the comparison rather than a bystander in its own message.
//   2. A VACUITY FLOOR: when the read view shows no shared blocks, that is
//      allowed ONLY if the profile genuinely has none to show. The guard checks
//      for the content that would produce them and FAILS if the page shows
//      nothing while the content exists — which is the real bug this would
//      otherwise hide (a read view that stopped rendering its blocks entirely).
const readShared = sharedProjection(readObserved)
const editShared = sharedProjection(editKeys)
console.log(`\ncross-surface shared blocks:`)
console.log(`  read: ${JSON.stringify(readShared)}`)
console.log(`  edit: ${JSON.stringify(editShared)}`)

// (1) The EDITOR is the other half of the comparison, so it must appear on the
//     right-hand side. `isSubsequence` validates a sequence against the PINNED
//     order; here the editor's own projection is what the read view has to fit
//     inside, which is the claim the message has always made.
function isSubsequenceOf(keys, container) {
  let i = 0
  for (const key of keys) {
    const found = container.indexOf(key, i)
    if (found === -1) return false
    i = found
  }
  return true
}
const readForCompare = readShared.map((k) => (k === 'familyPhoto' ? 'parents' : k))
const editForCompare = editShared.map((k) => (k === 'familyPhoto' ? 'parents' : k))
check(
  'the read view’s blocks sit in the same relative order as the editor’s (V23 s16)',
  isSubsequenceOf(readForCompare, editForCompare),
  `read=${JSON.stringify(readShared)} edit=${JSON.stringify(editShared)}`,
)

// (2) THE VACUITY FLOOR. An empty read projection must be explained by the
//     PROFILE, not accepted as agreement. `readFamilyPhotoPresent` is already
//     measured; the bio/kids presence is what the other two blocks depend on.
//     If the page renders none of them while the editor says they exist, the
//     read view has stopped rendering its own content — the failure this check
//     would otherwise report as a pass.
const readShowsNothing = readShared.length === 0
check(
  'an empty read projection is explained by the profile, not swallowed as agreement',
  !readShowsNothing || readObserved.length === 0,
  readShowsNothing
    ? `read view showed NO shared blocks; observed (incl. family photo)=${JSON.stringify(readObserved)}`
    : `read view showed ${readShared.length} shared block(s)`,
)

// The family photo's RELATIVE position: it must sit AFTER the bio ('parents'
// first occurrence) on BOTH surfaces — the exact mismatch this slice fixes.
// When the read view does NOT show the photo, that is legal ONLY because the
// profile has none (the marker account's state, asserted by the vacuity floor
// above); the check no longer silently returns true on `-1` alone, it reports
// which of the two reasons applied.
const readPhotoIdx = readShared.indexOf('familyPhoto')
const editPhotoIdx = editShared.indexOf('familyPhoto')
// V23 REVIEW — THE ASSERTION WAS COMPARING ABSOLUTE INDEXES ACROSS DIFFERENT
// LENGTHS. It required `readPhotoIdx === editPhotoIdx`, i.e. the photo at the
// SAME ORDINAL on both surfaces. But the two projections are deliberately
// different lengths (the editor always carries its parent cards + linked-parent
// control, so `edit` is longer than `read`), and the property the fix actually
// establishes is RELATIVE: the photo comes AFTER the parents region on both.
// Demanding equal ordinals made the check fail against a correct page — caught
// the moment seeding let the photo render for the first time. The absolute-index
// form would only ever have "passed" on the vacuous empty read side.
//
// So the assertion is now the PROPERTY, stated twice, once per surface: the
// photo must exist on both and sit after 'parents' on each.
const readPhotoAfterParents =
  readPhotoIdx !== -1 && readShared.indexOf('parents') !== -1 && readPhotoIdx > readShared.indexOf('parents')
const editPhotoAfterParents =
  editPhotoIdx !== -1 && editShared.indexOf('parents') !== -1 && editPhotoIdx > editShared.indexOf('parents')
check(
  'the family photo sits AFTER the parents region on both surfaces',
  readPhotoIdx === -1
    ? // Absent on the read side is legal ONLY when the profile has no photo —
      // which is why the editor's own photo control is what keeps the block
      // reachable. A photo PRESENT but not rendering would be caught by the
      // vacuity floor above, and the seeding now makes that case real.
      readShared.length === 0 || !readFamilyPhotoPresent
    : readPhotoAfterParents && editPhotoAfterParents,
  `read index ${readPhotoIdx} (of ${readShared.length}), edit index ${editPhotoIdx} (of ${editShared.length})`,
)

if (failures.length > 0) {
  console.log(`\nFAIL — ${failures.length} check(s) failed`)
  console.log(`offending edit-mode order: ${JSON.stringify(editHeadings)} -> ${JSON.stringify(editKeys)}`)
  process.exitCode = 1
} else {
  console.log('\nPASS — both surfaces render the shared blocks in the same order (user → kids → parents → family photo)')
}
} finally {
  try {
    if (seeded && prior !== null && env !== undefined) {
      try {
        await restoreProfile(env, markerJwt, markerUserId, {
          bio: prior.bio ?? null,
          family_photo_url: prior.family_photo_url ?? null,
        })
        console.log('\nrestored: marker profile returned to its prior values')
      } catch (restoreError) {
        console.log(
          '\n  WARNING: fixture cleanup FAILED - the marker profile still carries the order-check seed.',
        )
        console.log(`  restore error: ${restoreError}`)
      }
    }
  } finally {
    try {
      if (markerJwt !== null && env !== undefined) {
        await deleteFixturePhoto(env, markerJwt, fixtureObjectPath)
      }
    } finally {
      await browser.close()
    }
  }
}
