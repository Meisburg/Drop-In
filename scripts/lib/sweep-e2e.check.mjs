#!/usr/bin/env node
/**
 * Tests for the marker sweep's decision logic.
 *
 * WHY THESE EXIST. The sweep deletes production rows, and since the first-use
 * audit it also has to PROVE it worked. A proof that always returns "clean" is
 * worse than no proof: it turns an unchecked release into an apparently checked
 * one. The live path cannot be unit-tested (it needs the dashboard token and it
 * destroys data), so the decision is pure and these are its failure shapes.
 *
 * Usage:  node scripts/lib/sweep-e2e.check.mjs
 * Exit:   0 = the proof behaves, 1 = it does not
 *
 * `.check.mjs`, not `.test.mjs`: this is a standalone checker, not a vitest
 * suite (see the same note in the fixture-marker guard's checker).
 */
import {
  deleteStatements,
  gateRefusal,
  markerRowsWithVictims,
  markerTotal,
  parseCounts,
  countsQuery,
  verificationProblems,
} from './sweep-e2e.mjs'

const failures = []

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok — ${label}`)
  } else {
    console.log(`  FAIL — ${label}`)
    if (detail !== undefined) console.log(`    ${detail}`)
    failures.push(label)
  }
}

console.log('Marker sweep — decision logic')
console.log('===========================================================')

// ---------------------------------------------------------------------------
// The marker rows are scoped, and only to the documented marker.
// ---------------------------------------------------------------------------

{
  const rows = markerRowsWithVictims()
  check('every marker row clause is scoped by the e2e- account set', rows.length > 0 &&
    rows.every((r) => r.table === 'auth.users' || r.where.includes("like 'e2e-%'")),
    JSON.stringify(rows.map((r) => r.table)))
  check('no clause contains `VICTIMS` after substitution', rows.every((r) => !r.where.includes('VICTIMS')))
  check('no clause uses a broad operator', rows.every((r) => !/\b(ilike|neq|gt|lt)\b/.test(r.where)))
  check('no clause is empty (an empty WHERE would clear the table)', rows.every((r) => r.where.trim() !== ''))
  check('profiles are deleted before auth.users (FK order)',
    deleteStatements().findIndex((s) => s.startsWith('delete from profiles')) <
      deleteStatements().findIndex((s) => s.startsWith('delete from auth.users')))
  check('kids are deleted before profiles (FK order)',
    deleteStatements().findIndex((s) => s.startsWith('delete from kids')) <
      deleteStatements().findIndex((s) => s.startsWith('delete from profiles')))
}

// ---------------------------------------------------------------------------
// The counts query reads every table's marker count AND its total.
// ---------------------------------------------------------------------------

{
  const query = countsQuery()
  check('the counts query is one statement', (query.match(/;/g) ?? []).length === 0, query.slice(0, 80))
  check('the counts query reads a marker count per table', query.includes('as t0') && query.includes('as t12'))
  check('the counts query reads a total per table', query.includes('as a0') && query.includes('as a12'))

  const parsed = parseCounts({ t0: '2', a0: '10', t1: '0', a1: '7' })
  check('parseCounts maps tN/aN back onto the right tables', parsed[0].table === 'playdate_kids' && parsed[0].marker === 2 && parsed[0].total === 10)
  check('parseCounts treats a missing key as zero rather than NaN', Number.isNaN(parseCounts({})[0].marker) === false)
}

// ---------------------------------------------------------------------------
// THE PROOF: every way the database can disagree with the removal report.
// ---------------------------------------------------------------------------

{
  const before = [
    { table: 'playdates', marker: 3, total: 10 },
    { table: 'profiles', marker: 2, total: 40 },
  ]

  // The clean case: all markers gone, each total moved by exactly its marker count.
  check('a perfect sweep verifies',
    verificationProblems(before, [
      { table: 'playdates', marker: 0, total: 7 },
      { table: 'profiles', marker: 0, total: 38 },
    ]).length === 0)

  // A survivor: the audit's exact failure mode, and the one that leaks.
  const survived = verificationProblems(before, [
    { table: 'playdates', marker: 1, total: 7 },
    { table: 'profiles', marker: 0, total: 38 },
  ])
  check('a surviving marker row is a problem', survived.length === 1 && survived[0].includes('SURVIVED'), survived.join(' | '))

  // The subtle one: markers are all gone, but the total did not move as claimed
  // — e.g. the delete removed fewer rows than reported, or removed the wrong
  // rows. A "markers are zero" check alone would pass this.
  const wrongDelta = verificationProblems(before, [
    { table: 'playdates', marker: 0, total: 9 },
    { table: 'profiles', marker: 0, total: 38 },
  ])
  check('a total that did not move as claimed is a problem',
    wrongDelta.length === 1 && wrongDelta[0].includes('expected 7'), wrongDelta.join(' | '))
  check('the zero-marker check alone would have passed that case',
    before.length === 2 && wrongDelta[0].includes('playdates'))

  // An extra deletion: the total fell by MORE than the marker count. That is a
  // sweep that reached real parent content.
  const overDeleted = verificationProblems(before, [
    { table: 'playdates', marker: 0, total: 5 },
    { table: 'profiles', marker: 0, total: 38 },
  ])
  check('deleting more than claimed is a problem', overDeleted.length === 1 && overDeleted[0].includes('expected 7'), overDeleted.join(' | '))

  // A table missing from the post-read: cannot prove anything, so must not pass.
  const missing = verificationProblems(before, [{ table: 'profiles', marker: 0, total: 38 }])
  check('a table missing from the post-delete read is a problem', missing.length === 1 && missing[0].includes('missing'), missing.join(' | '))
}

// ---------------------------------------------------------------------------
// The safety gate.
// ---------------------------------------------------------------------------

{
  check('a clean gate does not refuse', gateRefusal({ founder_overlap: 0 }) === null)
  check('a founder inside the marker set refuses', typeof gateRefusal({ founder_overlap: 1 }) === 'string')
  check('an UNREADABLE gate refuses rather than assuming clean',
    typeof gateRefusal(undefined) === 'string' && typeof gateRefusal({}) === 'string')
}

// ---------------------------------------------------------------------------
// Totals.
// ---------------------------------------------------------------------------

{
  check('markerTotal sums the per-table counts',
    markerTotal([{ marker: 2 }, { marker: 0 }, { marker: 5 }]) === 7)
  check('markerTotal of an empty sweep is zero', markerTotal([]) === 0)
}

console.log()
if (failures.length === 0) {
  console.log('PASS — the sweep reports, proves, and refuses correctly.')
  process.exit(0)
}
console.log(`FAIL — ${failures.length} check(s) did not behave:`)
for (const f of failures) console.log(`  - ${f}`)
process.exit(1)
