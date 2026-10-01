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
 * SCOPE — a written boundary, not a claim of totality.
 *   It walks the whole tree except the directories below, and only files with a
 *   code extension (.ts/.tsx/.js/.jsx/.mjs/.cjs). Skipped: `node_modules`,
 *   `dist`, `dist-ssr`, `test-results`, `playwright-report` (build output) and
 *   `.git`, `.scratch`, `.qa`, `.agents`, `.omo` (gitignored harness state —
 *   `.scratch/**\/*.mjs` is ignored precisely because a probe script is not
 *   source; see .gitignore). A copy is caught anywhere in shipped code,
 *   including in supabase/functions/ and any untracked file the author has not
 *   `git add`ed yet.
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
  '.scratch',
  '.qa',
  '.agents',
  '.omo',
])

const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/

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
  console.log(`  ok — every other caller imports it (scope: the whole tree minus generated/harness dirs)`)
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
