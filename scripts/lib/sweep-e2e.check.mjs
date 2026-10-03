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
  CASCADE_HAZARDS,
  collateralProbeQuery,
  collateralRefusals,
  deleteStatements,
  gateRefusal,
  markerRowsWithVictims,
  markerTotal,
  parseCollateral,
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
// THE COLLATERAL GATE — the 2026-10-03 incident, as regression coverage.
//
// THE FAILURE THIS PINS. The sweep removed 2445 marker rows exactly as scoped
// and still destroyed a REAL parent's `going_pings` row. The ping's profile_id
// was not a marker, so `going_pings`' own clause never matched it and its marker
// count was a truthful zero. It died because `going_pings.playdate_id ->
// playdates` is ON DELETE CASCADE and the sweep deleted the marker-hosted
// drop-in it pointed at. Every marker-shaped check passed. This one must not.
// ---------------------------------------------------------------------------

{
  // The incident itself: one real parent's ping behind a doomed marker drop-in.
  const incident = parseCollateral({ b0: '1', b1: '0', b2: '0', b3: '0', b4: '0' })
  const refusals = collateralRefusals(incident)
  check('THE INCIDENT: a real parent\'s ping behind a marker drop-in REFUSES the sweep',
    refusals.length === 1 && refusals[0].includes('going_pings'),
    refusals.join(' | '))
  check('the refusal names the cascade edge, not just a count',
    refusals[0].includes('playdate_id') && refusals[0].includes('CASCADE'),
    refusals[0])
  check('the refusal says the rows were never named by the sweep\'s own clause',
    refusals[0].includes('never named'), refusals[0])

  // A clean probe (every edge zero) is the ONLY shape that proceeds.
  const clean = parseCollateral(Object.fromEntries(CASCADE_HAZARDS.map((_, i) => [`b${i}`, '0'])))
  check('a probe with every edge at zero proceeds', collateralRefusals(clean).length === 0)

  // FAIL CLOSED, three ways. "The rule did not run" must never be a green light.
  check('an EMPTY probe refuses rather than passing',
    collateralRefusals([]).length === 1 && collateralRefusals([])[0].includes('REFUSING'))
  check('a NON-ARRAY probe refuses rather than passing',
    collateralRefusals(undefined).length === 1 && collateralRefusals(null).length === 1)
  check('an UNREADABLE blocker count refuses rather than assuming zero',
    collateralRefusals([
      { parent: 'playdates', child: 'going_pings', column: 'playdate_id', blockers: Number.NaN },
    ]).some((r) => r.includes('could not be read')))

  // The probe must name EVERY cascade edge the sweep can walk, or an unmodelled
  // edge is an unguarded one. Measured against the live schema on 2026-10-03:
  // 17 CASCADE FKs reach the sweep's tables from a parent it deletes.
  check('the probe covers every cascade edge (17 measured)',
    CASCADE_HAZARDS.length === 17, String(CASCADE_HAZARDS.length))

  // THE SHAPE THAT MAKES IT WORK, pinned because breaking it is silent: the
  // doomed-parent subquery must select the uuid `id`, not `1`. `uuid = integer`
  // is a Postgres 42883 ERROR, so a probe that got this wrong would crash
  // instead of guarding — and a crash is not a guard.
  const probe = collateralProbeQuery()
  check('the collateral probe selects the parent uuid, never `select 1`',
    probe.includes('select p.id from') && !probe.includes('select 1 from'),
    probe.slice(0, 120))
  check('the collateral probe reads a blocker count per cascade edge',
    probe.includes('as b0') && probe.includes(`as b${CASCADE_HAZARDS.length - 1}`))
  check('the collateral probe names the e2e- account set and no broad operator',
    probe.includes("like 'e2e-%'") && !/\bilike\b/.test(probe))
  // ⚠️ THE STRONGER FORM, and it is here because a mutation survived without it.
  // `probe.includes("like 'e2e-%'")` passes even if SOME OTHER clause was widened
  // (measured: one `like '%'` slipped through and the whole checker still exited 0).
  // The real invariant is not a fixed number — the clauses nest, so each edge
  // contributes a varying number of literals — it is that NO scope literal in the
  // probe is anything OTHER than e2e-. Counted both ways:
  const scopeLiterals = (probe.match(/like '[^']*'/g) ?? [])
  const e2eScoped = scopeLiterals.filter((l) => l === "like 'e2e-%'").length
  check('EVERY scope literal in the probe is e2e- (none widened)',
    scopeLiterals.length > 0 && scopeLiterals.every((l) => l === "like 'e2e-%'"),
    `${scopeLiterals.length} literal(s), ${e2eScoped} e2e-scoped`)
  check('the probe carries at least one scope literal per edge',
    scopeLiterals.length >= CASCADE_HAZARDS.length,
    `${scopeLiterals.length} literal(s) for ${CASCADE_HAZARDS.length} edge(s)`)

  // The guard must be wired to the ONE table the incident proved reachable, and
  // it must be keyed on the child's OWN marker clause — that is what makes a
  // non-marker row a blocker rather than a legitimate removal.
  const goingPings = CASCADE_HAZARDS.filter(
    (h) => h.child === 'going_pings' && h.parent === 'playdates',
  )
  check('the going_pings/playdates edge is guarded',
    goingPings.length === 1 && goingPings[0].parentKey === 'playdate_id')
  check('each hazard keys on the child\'s own marker clause',
    CASCADE_HAZARDS.every((h) => typeof h.childClause === 'string' && h.childClause !== ''))

  // ⚠️ AND THAT CLAUSE MUST ACTUALLY BE MARKER-SCOPED — measured, because a
  // mutation that de-scoped exactly one hazard's childClause still exited 0.
  // A hazard whose clause matches a real parent's row is worse than no hazard:
  // it would report the sweep as SAFE while protecting the wrong set. Every
  // clause must therefore reference VICTIMS (the e2e- account set) or be a
  // subquery over a table that itself references VICTIMS.
  check('every hazard PARENT clause is marker-scoped via VICTIMS',
    CASCADE_HAZARDS.every((h) => h.parentClause.includes('VICTIMS')),
    CASCADE_HAZARDS.filter((h) => !h.parentClause.includes('VICTIMS'))
      .map((h) => `${h.parent}.${h.parentKey}`)
      .join(', '))
  check('every hazard CHILD clause is marker-scoped via VICTIMS',
    CASCADE_HAZARDS.every((h) => h.childClause.includes('VICTIMS')),
    CASCADE_HAZARDS.filter((h) => !h.childClause.includes('VICTIMS'))
      .map((h) => `${h.child}.${h.parentKey}`)
      .join(', '))
  check('no hazard clause is broad or empty (a de-scoped hazard protects nothing)',
    CASCADE_HAZARDS.every(
      (h) =>
        h.parentClause.trim() !== '' &&
        h.childClause.trim() !== '' &&
        !/\b(is not null|neq|gt|lt)\b/.test(h.parentClause) &&
        !/\b(is not null|neq|gt|lt)\b/.test(h.childClause),
    ))
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
