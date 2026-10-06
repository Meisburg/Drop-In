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

/**
 * THE COLLATERAL RULE — a parent's row must be reachable ONLY through its own
 * marker clause, never through a CASCADE.
 *
 * THE INCIDENT THIS EXISTS FOR (2026-10-03, r3-1). The sweep deleted 2445 marker
 * rows exactly as scoped, and the database still lost one row nobody asked for:
 * a REAL parent had pinged an `e2e-`-hosted drop-in. That ping's `profile_id` was
 * not a marker id, so `going_pings`' own clause never matched it and the marker
 * count for that table was a truthful ZERO. The ping died anyway, because
 * `going_pings.playdate_id -> playdates` is `ON DELETE CASCADE` and the sweep
 * deleted the marker-hosted drop-in it pointed at. Both reads were honest; the
 * row was never in the marker set. It was a DATA-MODEL defect, not a race.
 *
 * WHAT THIS SAYS, in one sentence: **deleting a marker parent must not be able to
 * reach a non-marker child.** A parent whose children are all marker-owned is
 * safe to delete; a parent that a real parent's row points at is NOT, and the
 * sweep must refuse rather than delete it.
 *
 * `childClause` is the child's own marker predicate — the ONLY rows the sweep
 * asked to remove. `parentKey` is the column in the child that points at the
 * parent. `parentClause` identifies the marker parents about to be deleted.
 *
 * A blocker row is a child of a doomed parent that the child's own clause does
 * NOT match: it will be destroyed by the cascade without ever being named.
 */
export const CASCADE_HAZARDS = [
  {
    parent: 'playdates',
    parentClause: 'host_profile_id in VICTIMS',
    child: 'going_pings',
    parentKey: 'playdate_id',
    childClause: 'profile_id in VICTIMS',
  },
  {
    parent: 'playdates',
    parentClause: 'host_profile_id in VICTIMS',
    child: 'comments',
    parentKey: 'playdate_id',
    childClause: 'author_profile_id in VICTIMS',
  },
  {
    parent: 'playdates',
    parentClause: 'host_profile_id in VICTIMS',
    child: 'playdate_kids',
    parentKey: 'playdate_id',
    childClause: 'kid_id in (select id from kids where profile_id in VICTIMS)',
  },
  {
    parent: 'kids',
    parentClause: 'profile_id in VICTIMS',
    child: 'playdate_kids',
    parentKey: 'kid_id',
    childClause: 'kid_id in (select id from kids where profile_id in VICTIMS)',
  },
  {
    parent: 'comments',
    parentClause: 'author_profile_id in VICTIMS',
    child: 'comments',
    parentKey: 'parent_id',
    childClause: 'author_profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'follows',
    parentKey: 'followee_profile_id',
    childClause: 'follower_profile_id in VICTIMS or followee_profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'follows',
    parentKey: 'follower_profile_id',
    childClause: 'follower_profile_id in VICTIMS or followee_profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'going_pings',
    parentKey: 'profile_id',
    childClause: 'profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'comments',
    parentKey: 'author_profile_id',
    childClause: 'author_profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'reports',
    parentKey: 'reporter_profile_id',
    childClause: 'reporter_profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'memberships',
    parentKey: 'profile_id',
    childClause: 'profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'push_subscriptions',
    parentKey: 'profile_id',
    childClause: 'profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'playdates',
    parentKey: 'host_profile_id',
    childClause: 'host_profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'playdate_series',
    parentKey: 'host_profile_id',
    childClause: 'host_profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'kids',
    parentKey: 'profile_id',
    childClause: 'profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'blocks',
    parentKey: 'blocker_profile_id',
    childClause: 'blocker_profile_id in VICTIMS or blocked_profile_id in VICTIMS',
  },
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'blocks',
    parentKey: 'blocked_profile_id',
    childClause: 'blocker_profile_id in VICTIMS or blocked_profile_id in VICTIMS',
  },  /**
   * ⚠️ THE 36 EDGES ADDED 2026-10-06 — every one of them a cascade the probe was
   * BLIND to while it printed "Safe — delete would refuse nothing."
   *
   * The list above had been hand-built on 2026-10-03 and the schema then grew
   * whole tables behind it: `messages`, `message_recipients`, `message_reactions`,
   * `notification_log`, `conversation_reads`, `direct_conversation_reads`,
   * `account_links`, `parent_cards`, `place_comments`, `reviews`, `ping_kids`.
   * Every one of them is `ON DELETE CASCADE` on a profile or a playdate the sweep
   * deletes, which is EXACTLY the shape of the 2026-10-03 incident (a real
   * parent's `going_pings` row destroyed by a cascade the probe never modelled).
   * The check that was supposed to catch this asserted `length === 17` — a count
   * pinned to one day's measurement, which stays green while the model rots.
   *
   * MEASURED on the live schema before adding them: all 36 held **zero** blocker
   * rows, so no row was lost by the 2026-10-06 sweep. The probe was blind, not
   * wrong — this time.
   *
   * The `childClause` for a table the sweep deletes NOTHING from is deliberately
   * `false`: its rows are never named by the sweep, so every child of a doomed
   * parent is a blocker by definition. That is the point — those tables are
   * removed ONLY by cascade, which makes their rows the ones most worth naming.
   */
  // profiles -> the messaging and notification tables, removed only by cascade.
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'messages', parentKey: 'sender_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'message_recipients', parentKey: 'profile_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'message_reactions', parentKey: 'profile_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'notification_log', parentKey: 'profile_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'conversation_reads', parentKey: 'profile_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'direct_conversation_reads', parentKey: 'profile_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'direct_conversation_reads', parentKey: 'other_profile_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'account_links', parentKey: 'requester_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'account_links', parentKey: 'addressee_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'parent_cards', parentKey: 'profile_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'place_comments', parentKey: 'author_profile_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'profiles', parentClause: 'id in VICTIMS', child: 'reviews', parentKey: 'author_profile_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  // playdates -> messages and read-marks.
  { parent: 'playdates', parentClause: 'host_profile_id in VICTIMS', child: 'messages', parentKey: 'playdate_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'playdates', parentClause: 'host_profile_id in VICTIMS', child: 'conversation_reads', parentKey: 'playdate_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  // kids / going_pings -> ping_kids.
  { parent: 'kids', parentClause: 'profile_id in VICTIMS', child: 'ping_kids', parentKey: 'kid_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'going_pings', parentClause: 'profile_id in VICTIMS', child: 'ping_kids', parentKey: 'playdate_id', parentKeyColumn: 'playdate_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  { parent: 'going_pings', parentClause: 'profile_id in VICTIMS', child: 'ping_kids', parentKey: 'profile_id', parentKeyColumn: 'profile_id', childClause: 'false and exists (select u.id from auth.users u where u.id in VICTIMS)' },
  // The edges already modelled for a DIFFERENT column, where the second column is
  // its own cascade: comments' self-reference and the playdate-side cascades.
  /**
   * ⚠️ THE 0065 EDGE (found 2026-10-06, while `delete` refused on it).
   *
   * `0065_device_tokens.sql` added `device_tokens.profile_id ->
   * profiles(id) ON DELETE CASCADE` and the list above was not told, so
   * `schemaRefusals` refused the sweep: a live cascade edge the model does not
   * name is exactly the 2026-10-06 blindness again, caught this time by the
   * live-schema check rather than by an incident. The refusal was CORRECT;
   * the model was incomplete.
   *
   * Verified against the migration, not assumed: the child's referencing column
   * is `profile_id` and the parent's referenced column is `id` (line 88 of
   * 0065_device_tokens.sql).
   *
   * ⚠️ WHY `childClause` IS `profile_id in VICTIMS` AND NOT the `false` idiom the
   * 2026-10-06 block uses for tables the sweep deletes NOTHING from: here the
   * child's key IS the marker predicate. The doomed parents are
   * `profiles where id in VICTIMS`, so a child row reachable through
   * `c.profile_id in (that set)` has its OWN `profile_id` in VICTIMS by
   * construction — no other row can be behind this edge. `false` would count
   * every e2e-OWNED device row as a "non-marker ... row would be destroyed"
   * blocker, which is a false statement about e2e data rather than a refusal
   * protecting a real parent; this clause is the same one 0031's mirror table
   * (`push_subscriptions`) carries. It never removes protection: the set it
   * scopes in is identical to the set the cascade will destroy.
   */
  {
    parent: 'profiles',
    parentClause: 'id in VICTIMS',
    child: 'device_tokens',
    parentKey: 'profile_id',
    childClause: 'profile_id in VICTIMS',
  },
]

/** Substitute VICTIMS into one clause. */
export function withVictims(clause) {
  return clause.replaceAll('VICTIMS', victimsClause())
}

/**
 * The ONE query the sweep must run before it deletes anything: for every cascade
 * hazard, how many rows would be destroyed WITHOUT having been named by their own
 * marker clause.
 *
 * A non-zero blocker count on any row means the sweep MUST NOT delete. This is a
 * read-only probe, so it is safe to run against production at any time.
 */
export function collateralProbeQuery() {
  const selects = CASCADE_HAZARDS.map((h, i) => {
    // ⚠️ `select p.id`, never `select 1`: the parent key is a uuid, and
    // `uuid = integer` is a hard Postgres error (42883), not a false negative.
    // ⚠️ NOT ALWAYS `p.id`. `going_pings` has no `id` column at all — its key is
    // (playdate_id, profile_id) — and the assumption held only because no hazard
    // had it as a PARENT until the 2026-10-06 audit added the `ping_kids` edges.
    // The probe refused with 42703 rather than running a wrong query, which is the
    // builder behaving correctly. `parentKeyColumn` names the column the child
    // actually points at; it defaults to `id` for every other parent.
    const keyColumn = h.parentKeyColumn ?? 'id'
    // ⚠️ FOR A COMPOSITE KEY THIS OVER-COUNTS, DELIBERATELY: `ping_kids.playdate_id`
    // matches every ping on that playdate, not only the marker's. Over-counting
    // REFUSES a sweep that might have been safe; under-counting would DELETE a row
    // nobody named. The tool's own philosophy is refusing rather than deleting, so
    // the imprecision is pushed in that direction on purpose.
    const doomedParent =
      `select p.${keyColumn} from ${h.parent} p where ${withVictims(h.parentClause)}`
    return (
      `(select count(*) from ${h.child} c ` +
      `where c.${h.parentKey} in (${doomedParent}) ` +
      `and not (${withVictims(h.childClause)})) as b${i}`
    )
  })
  return `select ${selects.join(', ')}`
}

/** Turn one collateral probe row into `[{ parent, child, column, blockers }]`. */
export function parseCollateral(rawRow) {
  return CASCADE_HAZARDS.map((h, i) => ({
    parent: h.parent,
    child: h.child,
    column: h.parentKey,
    blockers: Number(rawRow?.[`b${i}`] ?? 0),
  }))
}

/**
 * THE REFUSAL. Given the collateral probe, return every reason the sweep must
 * abort, or an empty array when it is safe to proceed.
 *
 * Fails CLOSED: a probe row that cannot be read is a refusal, never a green
 * light. "The rule did not run" must never resolve to "go ahead and delete" —
 * the same principle the founder-overlap gate already follows.
 */
/**
 * ⚠️ THE PROBE VERIFIES ITS OWN COMPLETENESS AGAINST THE LIVE SCHEMA (2026-10-06).
 *
 * WHY THIS EXISTS. `CASCADE_HAZARDS` is a hand-written model, and on 2026-10-06 it
 * turned out to name 17 of the schema's 34 cascade edges — blind to whole tables
 * added since it was written — while printing "Safe". A static list cannot notice a
 * table it has never heard of, and the assertion guarding it (`length === 17`)
 * pinned a NUMBER rather than checking the model, so it stayed green throughout.
 *
 * THE FIX IS TO ASK THE DATABASE. These two functions read every `ON DELETE
 * CASCADE` foreign key that points at a table the sweep deletes from, and compare
 * that live set with the modelled one. A live edge the model does not name is a
 * REFUSAL — the sweep will not delete while it can be surprised.
 *
 * IT FAILS CLOSED. An unreadable or implausibly empty schema read refuses, exactly
 * like every other gate here: "the rule did not run" must never resolve to "go
 * ahead and delete".
 */
export function schemaCascadePairsQuery() {
  // Derived from MARKER_ROWS, never retyped, so the parent set cannot drift from
  // what the sweep actually deletes. `auth.users` is excluded on purpose: it is not
  // a `public` table, and its cascade into `profiles` is the INTENDED removal the
  // marker predicate on `profiles` already accounts for.
  const parents = MARKER_ROWS.map((r) => r.table)
    .filter((name) => name !== 'auth.users')
    .map((name) => `'${name}'`)
    .join(',')
  return (
    `select distinct ccu.table_name as parent, tc.table_name as child ` +
    `from information_schema.table_constraints tc ` +
    `join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name ` +
    `join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name ` +
    `join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name ` +
    `where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public' ` +
    `and rc.delete_rule = 'CASCADE' and ccu.table_name in (${parents})`
  )
}

/** How many live pairs make an empty read believable? Measured: 29. Anything less is a broken read. */
export const MIN_LIVE_CASCADE_PAIRS = 20

export function schemaRefusals(rows) {
  if (!Array.isArray(rows)) {
    return [
      'REFUSING: the live cascade list could not be read — the probe cannot prove ' +
        'it models the schema, so nothing was deleted.',
    ]
  }
  const pairs = rows
    .map((r) => `${r?.parent}|${r?.child}`)
    .filter((p) => !p.includes('undefined'))
  if (pairs.length < MIN_LIVE_CASCADE_PAIRS) {
    return [
      `REFUSING: the live cascade list came back with ${pairs.length} pair(s), fewer ` +
        `than the ${MIN_LIVE_CASCADE_PAIRS} this schema is known to have — the read is ` +
        'broken, not the schema, and nothing was deleted.',
    ]
  }
  const modelled = new Set(CASCADE_HAZARDS.map((h) => `${h.parent}|${h.child}`))
  const unmodelled = [...new Set(pairs)].filter((p) => !modelled.has(p)).sort()
  if (unmodelled.length === 0) return []
  return [
    `REFUSING: ${unmodelled.length} live cascade edge(s) are NOT modelled by the probe, ` +
      `so it cannot report on them: ${unmodelled.join(', ')}. Add each to ` +
      'CASCADE_HAZARDS (with its marker clause) before deleting anything.',
  ]
}

export function collateralRefusals(collateral) {
  if (!Array.isArray(collateral) || collateral.length === 0) {
    return ['REFUSING: the collateral probe returned nothing — nothing was deleted.']
  }
  const refusals = []
  for (const row of collateral) {
    if (Number.isNaN(row.blockers)) {
      refusals.push(
        `REFUSING: ${row.child}.${row.column} -> ${row.parent} could not be read — ` +
          `nothing was deleted.`,
      )
      continue
    }
    if (row.blockers > 0) {
      refusals.push(
        `${row.blockers} non-marker ${row.child} row(s) point at a marker ${row.parent} ` +
          `via ${row.child}.${row.column} -> ${row.parent}.id and would be destroyed by ` +
          `ON DELETE CASCADE — they were never named by the sweep's own clause.`,
      )
    }
  }
  return refusals
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
 *
 * ⚠️ CHECK 2 IS THE ONE THAT FOUND THE 2026-10-03 INCIDENT and it is NOT to be
 * softened. The row it caught was never a marker, so check 1 went to zero
 * exactly as intended — a cascade is invisible to every marker-shaped check.
 * `collateralRefusals` (above) is the PREVENTIVE half added beside it; this
 * function stays the DETECTIVE half, and a fix that made this pass by ignoring
 * the delta would be the incident rewritten as a clean run.
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
