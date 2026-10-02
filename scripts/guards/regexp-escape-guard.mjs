#!/usr/bin/env node
/**
 * Regexp-escape guard — the repo has exactly ONE copy of the escape one-liner.
 *
 * WHY THIS EXISTS. The regex-escape one-liner — the character class
 * `[.*+?^${}()|` … `]` with the `g` flag, replaced by `\$&`, i.e. "escape a
 * value before interpolating it into a RegExp" — was duplicated FIVE times: a helper in
 * `src/lib/firstRunTour.ts`, a private function in `e2e/weekly-series.e2e.ts`,
 * an inline one in `e2e/place-directory-in-new.e2e.ts`, and inline ones in
 * `scripts/guards/stale-locator-guard.mjs` and
 * `scripts/guards/vacuous-absence-guard.mjs`. Two independent review lanes
 * called that a drift risk: "a missed metacharacter in one silently
 * over-matches the pin". Slice 6c collapsed all five onto ONE module —
 * `src/lib/escapeForRegExp.mjs`, which the app, the e2e suite AND these plain
 * `.mjs` guards can all import because it is vanilla JS.
 *
 * WHAT THIS CAN AND CANNOT DO — stated, not implied.
 *   - It does NOT make a sixth inline copy unconstructable. Retyping the
 *     one-liner is always possible, so this is a DETECTOR, not a prohibition.
 *     (The drift the two lanes named IS gone: with one implementation there is
 *     no second copy to fall out of step.)
 *   - It DOES make the bad state loud, in BOTH directions. The expected state
 *     is exactly one occurrence, in the sanctioned file. So a sixth copy fails
 *     AND a zero fails — a needle that stopped matching (the implementation
 *     renamed, deleted, or the pattern mistyped) is a FINDING, never a silent
 *     pass. An instrument that matches nothing looks exactly like a clean repo;
 *     this one cannot.
 *
 * SCOPE — a written boundary, not a claim of totality. Read this as the
 *   mechanism, because the mechanism IS this list: SKIP_DIRS is matched against
 *   a directory's NAME at any depth. It is not a gitignore query, and the
 *   difference is measured, not waved at.
 *   - Walked: every file whose name ends in a code extension —
 *     .ts/.mts/.cts/.tsx/.js/.jsx/.mjs/.cjs (the declaration-file spellings
 *     included, so a copy in a `.d.mts` is caught).
 *   - Skipped as build output: `node_modules`, `dist`, `dist-ssr`,
 *     `test-results`, `playwright-report`.
 *   - Skipped as generated/harness state: `.git` (the object store), `.qa`,
 *     `.agents`, `.omo`, `.scratch`, and `.vitest` (.gitignore: "Vitest's own
 *     cache directory. Never source, never committed.") — a generated cache
 *     file holding the literal is not a sixth copy, and failing the lane on one
 *     is how a guard gets routed around.
 *   - `.scratch` is skipped WHOLE, and that hole has a number on it: git TRACKS
 *     262 files under `.scratch/` (`git ls-files .scratch | wc -l`, measured at
 *     c484648 — it grows with every committed report, so re-measure it rather
 *     than trust this figure), 23 of them `.mjs` (all `.scratch/v4/*.mjs`,
 *     one-off probe scripts). A copy in one of those 23 is UNCCOUNTED — this
 *     guard will pass it. They are left out because `.scratch` also holds
 *     snapshots frozen by review lanes, and one of them —
 *     `.scratch/guard-a03fc54.mjs:635` — really does contain the one-liner:
 *     walking `.scratch` measurably fails this lane on a clean tree. A probe
 *     script that hand-rolls the escape is not drift in shipped code; a lane
 *     that is red for reasons its owner may not touch is a lane people delete.
 *   - Net: a copy IS caught in shipped code — src/, e2e/, scripts/,
 *     supabase/functions/ — and in any untracked file outside the skipped dirs
 *     that the author has not `git add`ed yet. It is NOT counted anywhere under
 *     `.scratch`, `.qa`, `.agents`, `.omo`, `.vitest`, or build output. Both
 *     directions are pinned by `regexp-escape-guard.check.mjs`.
 *
 * A note on this file's own prose: it does not write the one-liner out with its
 * `g` flag, so that THIS file does not itself contain the literal it searches
 * for. The repo-wide count stays exactly one — the implementation — instead of
 * one-plus-the-guard-that-counts. SELF below is the belt to that braces: if a
 * later edit quotes the literal here, the guard still does not flag itself.
 *
 * NOT this escape, deliberately not counted: the `/[^a-z0-9]/`-class
 * SANITIZERS in `src/components/RsvpConfirmationDialog.tsx`,
 * `src/components/ModalShell.tsx`, `src/lib/photoStorage.ts`,
 * `scripts/backfill-place-hours.mjs` and
 * `scripts/guards/fixture-marker-guard.mjs` (stripQuotes) STRIP characters
 * rather than escape them. A different character class and replacement, so
 * merging them would be a behaviour change.
 *
 * Behavior is proven by `regexp-escape-guard.check.mjs` (seeded sixth copy in
 * e2e/ AND in scripts/, a deleted implementation, a lone copy in the wrong
 * file), which run-all.sh runs in the same gate.
 *
 * Usage:  node scripts/guards/regexp-escape-guard.mjs [root]
 * Exit:   0 = exactly one copy, in the sanctioned file; 1 = otherwise
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()

/** The one file allowed to contain the literal. */
const SANCTIONED = path.join('src', 'lib', 'escapeForRegExp.mjs')

/** The escape, written as the regex literal a copy would interpolate. */
const NEEDLE = '/[.*+?^${}()|[\\]\\\\]/g'

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-ssr',
  'test-results',
  'playwright-report',
  '.git',
  // Vitest's own cache (.gitignore). Generated, never source — see SCOPE.
  '.vitest',
  '.scratch',
  '.qa',
  '.agents',
  '.omo',
])

const SCAN_EXT = /\.(ts|mts|cts|tsx|js|jsx|mjs|cjs)$/

// This guard necessarily CONTAINS the needle — it searches for it — so it is
// not a copy and does not count itself.
const SELF = path.resolve(import.meta.filename)

const hits = []

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
      continue
    }
    if (!SCAN_EXT.test(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (path.resolve(full) === SELF) continue
    const content = readFileSync(full, 'utf8')
    for (let at = content.indexOf(NEEDLE); at !== -1; at = content.indexOf(NEEDLE, at + NEEDLE.length)) {
      hits.push(`${path.relative(ROOT, full)}:${content.slice(0, at).split('\n').length}`)
    }
  }
}

if (!existsSync(ROOT)) {
  console.error(`regexp-escape guard: root '${ROOT}' does not exist — refusing to pass on a tree it cannot read`)
  process.exit(1)
}
walk(ROOT)

console.log('Regexp-escape guard — one escape implementation')
console.log('===========================================================')

for (const hit of hits) console.log(`  found: ${hit}`)

const onlyCopy = hits.length === 1 && hits[0].startsWith(`${SANCTIONED}:`)

if (onlyCopy) {
  console.log(`  ok — one implementation, at ${hits[0]}`)
  console.log('  ok — every other caller imports it (scope: the tree minus build output and the')
  console.log('       harness dirs named in SCOPE — `.scratch` skipped whole and uncounted)')
  console.log()
  console.log('PASS — the escape has exactly one home.')
  process.exit(0)
}

console.log()
if (hits.length === 0) {
  console.log(`  MISSING: ${SANCTIONED} is gone, or the pattern changed shape — 0 copies found.`)
  console.log('  A guard whose input vanished is not passing, it is blind: the needle matched nothing,')
  console.log('  so this run cannot say the escape is single-sourced. Restore the implementation (or')
  console.log('  correct NEEDLE here if the escape legitimately changed).')
} else {
  console.log(`  FINDING: ${hits.length} copy/copies of the escape, expected exactly 1.`)
  for (const hit of hits) {
    if (!hit.startsWith(`${SANCTIONED}:`)) {
      console.log(`    ${hit} — import { escapeForRegExp } from '<path>/src/lib/escapeForRegExp.mjs'`)
    }
  }
  if (!hits.some((h) => h.startsWith(`${SANCTIONED}:`))) {
    console.log(`  MISSING: none of them is ${SANCTIONED}.`)
  }
}
console.log()
console.log('This is a deterministic finding, not an opinion. Import the one implementation;')
console.log('do not add a second copy.')
process.exit(1)
