/**
 * The marker sweep's SELECT-side logic, as pure functions.
 *
 * WHY THIS IS A SEPARATE MODULE. The sweep's whole job is destructive, and the
 * first-use audit (ticket 05) is the reason it now has to PROVE its work: it
 * reports the rows it removed and then re-reads the database, failing if a
 * marker row survived or a total did not move by exactly the amount claimed.
 * That proof is the part that must not be wrong — a verifier that always says
 * "clean" is worse than no verifier, because it converts an unchecked release
 * into an apparently checked one.
 *
 * Proving it cannot mean running the real thing: the real thing needs the live
 * dashboard token and deletes production rows. So the decision is extracted
 * here, takes plain numbers, and is unit-tested against the failure shapes —
 * a survivor, a wrong delta, an unexpected extra. `scripts/sweep-e2e-markers.mjs`
 * keeps only the CDP token dance, the SQL and the console output.
 *
 * Build law: this is a `src/lib`-shaped module in `scripts/lib/` because it
 * belongs to the sweep, not the product; it ships a sibling `.test.mjs` and is
 * exercised by `npm test` via the config's include globs.
 */

/** The two markers, in one place. Mirrors docs/agents/e2e-fixture-convention.md. */
export const ACCOUNT_MARKER = 'e2e-'
export const TITLE_MARKERS = ['e2e ', 'e2e-']

/**
 * The rows the sweep removes: one entry per table, FK-safe order (children
 * before parents), each with the WHERE clause that identifies a marker row.
 * This list IS the sweep's contract.
 */
export const MARKER_ROWS = [
  { table: 'playdate_kids', where: 'kid_id in (select id from kids where profile_id in VICTIMS)' },
  { table: 'comments', where: 'author_profile_id in VICTIMS' },
  { table: 'going_pings', where: 'profile_id in VICTIMS' },
  { table: 'reports', where: 'reporter_profile_id in VICTIMS' },
  { table: 'blocks', where: 'blocker_profile_id in VICTIMS or blocked_profile_id in VICTIMS' },
  { table: 'memberships', where: 'profile_id in VICTIMS' },
  { table: 'follows', where: 'follower_profile_id in VICTIMS or followee_profile_id in VICTIMS' },
  { table: 'push_subscriptions', where: 'profile_id in VICTIMS' },
  { table: 'playdate_series', where: 'host_profile_id in VICTIMS' },
  { table: 'kids', where: 'profile_id in VICTIMS' },
  { table: 'playdates', where: 'host_profile_id in VICTIMS' },
  { table: 'profiles', where: 'id in VICTIMS' },
  { table: 'auth.users', where: `email like '${ACCOUNT_MARKER}%'` },
]

/** The subquery every marker WHERE clause is scoped to. */
export function victimsClause() {
  return `(select id from auth.users where email like '${ACCOUNT_MARKER}%')`
}

/** The WHERE clauses with VICTIMS substituted — what the sweep actually sends. */
export function markerRowsWithVictims() {
  const victims = victimsClause()
  return MARKER_ROWS.map((row) => ({
    table: row.table,
    where: row.where.replaceAll('VICTIMS', victims),
  }))
}

/** The one SELECT that reads every marker count and every table total. */
export function countsQuery() {
  const rows = markerRowsWithVictims()
  const markerCounts = rows.map(
    (row, i) => `(select count(*) from ${row.table} where ${row.where}) as t${i}`,
  )
  const totals = rows.map((row, i) => `(select count(*) from ${row.table}) as a${i}`)
  return `select ${[...markerCounts, ...totals].join(', ')}`
}

/** The delete statements, in FK-safe order, scoped to marker rows only. */
export function deleteStatements() {
  return markerRowsWithVictims().map((row) => `delete from ${row.table} where ${row.where};`)
}

/**
 * Turn one raw counts row into `[{ table, marker, total }]`.
 */
export function parseCounts(rawRow) {
  return MARKER_ROWS.map((row, i) => ({
    table: row.table,
    marker: Number(rawRow[`t${i}`] ?? 0),
    total: Number(rawRow[`a${i}`] ?? 0),
  }))
}

/**
 * THE PROOF. Given the counts taken before and after the delete, return every
 * way the database disagrees with the removal report.
 *
 * Two independent checks, and BOTH matter:
 *   1. no marker row survived (the count is zero); and
 *   2. each table's total dropped by exactly the number of marker rows the
 *      report claimed — which catches the case where the delete removed the
 *      wrong rows, or fewer rows than reported, even while the marker count
 *      reads zero (a delete that hit real parent content, say).
 *
 * An empty array means verified. Anything else is release-blocking.
 */
export function verificationProblems(before, after) {
  const problems = []
  const byTable = new Map(after.map((row) => [row.table, row]))
  for (const row of before) {
    const now = byTable.get(row.table)
    if (now === undefined) {
      problems.push(`${row.table}: missing from the post-delete read — cannot prove the removal`)
      continue
    }
    if (now.marker !== 0) {
      problems.push(`${now.table}: ${now.marker} marker row(s) SURVIVED`)
    }
    const expected = row.total - row.marker
    if (now.total !== expected) {
      problems.push(
        `${now.table}: total went ${row.total} → ${now.total}, expected ${expected} ` +
          `(claimed removal ${row.marker})`,
      )
    }
  }
  return problems
}

/** Total marker rows across the per-table counts. */
export function markerTotal(counts) {
  return counts.reduce((sum, row) => sum + row.marker, 0)
}

/**
 * The safety gate. Refusing to delete when a founder or moderator account falls
 * inside the marker set is the one thing standing between this script and
 * deleting a real person's account, so it is a plain function here rather than
 * an `if` buried in the script.
 *
 * An UNREADABLE gate refuses too. The gate is a query result; if it came back
 * without the field this rule reads, then the rule was not actually evaluated,
 * and "the rule did not run" must never resolve to "go ahead and delete".
 */
export function gateRefusal(gate) {
  if (gate === null || gate === undefined || gate.founder_overlap === undefined) {
    return 'REFUSING: the founder-overlap gate could not be read — nothing was deleted.'
  }
  if (Number(gate.founder_overlap) > 0) {
    return 'REFUSING: a founder/moderator account is inside the e2e- set.'
  }
  return null
}
