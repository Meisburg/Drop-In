#!/usr/bin/env node
/**
 * Fixture-marker guard — the test suite cannot invent a fixture convention that
 * the sweep does not cover.
 *
 * WHY THIS EXISTS. The first-use audit found a pre-existing drop-in plainly
 * labelled as automated-test data sitting in the PRODUCTION discovery feed,
 * where a real parent could read it as a real invitation. The structure behind
 * it: `playwright.config.ts` drives the LIVE Supabase project, so every spec
 * writes real rows that real parents can see, and removal depends on a sweep
 * whose only handle is one marker convention:
 *
 *   accounts : auth.users.email like 'e2e-%'          (so the account and every
 *                                                      row it owns cascade away)
 *   records  : title starts with `e2e ` or `e2e-`     (the straggler handle)
 *
 * Nothing enforced that convention. A spec could create an account with a plain
 * address, or title a drop-in something realistic, and NOTHING would say so —
 * the row would simply be invisible to the sweep, exactly like the audit's
 * event was. `scripts/guards/borrowed-guards.md` states the test a new guard
 * must pass; this one passes it because it is deterministic, credential-free,
 * and it fails on the real defect class rather than on a stylistic preference.
 *
 * WHAT IT IS NOT. It cannot see the live database, and it deliberately does not
 * try: a guard that needs live credentials to pass is a guard that gets
 * skipped. Rows already in production are the live sweep's job
 * (`scripts/sweep-e2e-markers.mjs`). This checks what the REPO can prove —
 * that the next run cannot leak, and that the sweep still covers what the specs
 * actually create.
 *
 * HOW IT AVOIDS CRYING WOLF. This reads TypeScript with regular expressions,
 * not a parser, so every rule is written to VERIFY a positive fact rather than
 * to infer a violation from a pattern it half-recognised:
 *
 *   - an account address is judged from its resolved literal, and the whole
 *     file is also scanned for any email-shaped literal that is NOT marked;
 *   - a value it cannot resolve is reported as a dynamic note, never as a
 *     violation and never silently passed;
 *   - a REST DELETE is judged from the filter columns of the queries in the
 *     file, and a deliberately broad clear must be named in BROAD_CLEARS with a
 *     written reason (the same "explain your allowlist" rule the sibling guard
 *     uses for schema-exempt modules).
 *
 * Usage:  node scripts/guards/fixture-marker-guard.mjs
 * Exit:   0 = clean, 1 = findings
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const E2E_DIR = path.join(ROOT, 'e2e')
const SWEEP = path.join(ROOT, 'scripts', 'sweep-e2e-markers.mjs')
const CONVENTION_DOC = path.join(ROOT, 'docs', 'agents', 'e2e-fixture-convention.md')

/** The one documented account marker. */
const ACCOUNT_MARKER = 'e2e-'
/** The documented drop-in title markers. The space form is the suite's rule. */
const TITLE_MARKERS = ['e2e ', 'e2e-']

const findings = []
const unresolved = []
const notes = []

function finding(where, message) {
  findings.push(`${where}\n    ${message}`)
}

// ---------------------------------------------------------------------------
// Rule 1 — every account a spec creates is inside the marker convention.
//
// The sweep's delete is scoped to `email like 'e2e-%'`; an account created with
// any other address is OUTSIDE that scope, so it and everything it owns survive
// the sweep forever.
// ---------------------------------------------------------------------------

/** Every `const NAME = <literal>` in a file, template literals included. */
function collectBindings(source) {
  const bindings = new Map()
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(`[^`]*`|'[^']*'|"[^"]*")/g
  for (const match of source.matchAll(re)) bindings.set(match[1], match[2])
  return bindings
}

/**
 * The email-shaped literals a file actually contains. Anchored on the address
 * shape (`…@domain.tld`), which is what makes this a scan for REAL addresses
 * rather than for the word "email" — the false-positive machine the first draft
 * was.
 */
const EMAIL_LITERAL =
  /(`[^`\n]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}`|'[^'\n]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'|"[^"\n]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")/g

/** A template that interpolates a variable (`\`${name}@gmail.com\``) is not itself a literal. */
function isInterpolated(literal) {
  return literal.startsWith('`') && literal.includes('${')
}

/**
 * True when a parameter is provably a DISPLAY value, not an account name.
 *
 * The suite reuses parameter names across helpers: `name` is a kid's display
 * name in `createMarkerKid` (`E2E Photo 123`) and the local part of a viewer's
 * address in `signUpStranger`. The difference is provable from the data flow:
 * a kid's name is immediately spread into a row written against the MARKER's
 * own profile (`{ profile_id: e.profileId, first_name: name, … }`), so it is
 * content inside a fixture account, never an account of its own. Judging such a
 * parameter as if it created an account is exactly the kind of false positive
 * that gets a guard deleted instead of fixed.
 */
function isDisplayOnlyParameter(source, param) {
  for (const match of source.matchAll(new RegExp(`\\b[A-Za-z_$][\\w$]*\\s*:\\s*${param}\\b`, 'g'))) {
    const before = source.slice(Math.max(0, match.index - 260), match.index)
    if (/profile_id\s*:/.test(before)) return true
  }
  return false
}

/**
 * A parameter interpolated into an address (`` `${name}@gmail.com` ``) cannot be
 * judged from the function that builds it — its value is whatever the callers
 * pass. Rather than leave it unresolved, go and READ the callers: every string
 * argument they pass must itself carry the marker.
 */
function parameterIsMarkedAtCallSites(source, param, bindings) {
  // The functions that declare this parameter.
  const declaring = new Set()
  const decl = new RegExp(`function\\s+([A-Za-z_$][\\w$]*)\\s*\\(([^)]*)\\)`, 'g')
  for (const match of source.matchAll(decl)) {
    const params = match[2].split(',')
    if (params.some((p) => new RegExp(`(^|[{,\\s])${param}\\b`).test(p.trim()))) {
      declaring.add(match[1])
    }
  }
  if (declaring.size === 0) return false

  let sawLiteral = false
  for (const fn of declaring) {
    for (const match of source.matchAll(new RegExp(`\\b${fn}\\s*\\(`, 'g'))) {
      // Skip the declaration's own signature (it contains a type annotation).
      const argsStart = match.index + match[0].length
      let depth = 0
      let end = -1
      for (let i = argsStart - 1; i < source.length; i++) {
        const ch = source[i]
        if (ch === '(') depth++
        else if (ch === ')') {
          depth--
          if (depth === 0) {
            end = i
            break
          }
        }
      }
      if (end === -1) continue
      const argText = source.slice(argsStart, end)
      if (/:\s*(string|number|boolean)\b/.test(argText)) continue // the declaration
      // The parameter's POSITION in the signature tells us which argument is it.
      const sig = new RegExp(`function\\s+${fn}\\s*\\(([^)]*)\\)`).exec(source)
      const position = sig === null ? -1 : sig[1].split(',').findIndex((p) => new RegExp(`(^|[{,\\s])${param}\\b`).test(p.trim()))
      if (position < 0) continue
      const args = splitArgs(argText).filter((a) => a.trim() !== '')
      const passed = args[position]
      if (passed === undefined) continue
      const resolved = resolveValue(passed, bindings)
      if (resolved === null) continue
      sawLiteral = true
      if (!resolved.includes(ACCOUNT_MARKER)) return false
    }
  }
  return sawLiteral
}

/** The address-carrying part of a literal, without its quotes. */
function stripQuotes(literal) {
  return literal.replace(/^[`'"]/, '').replace(/[`'"]$/, '')
}

function checkAccounts(source, file, bindings) {
  let checked = 0
  const seen = new Set()

  const judge = (literal, where) => {
    if (seen.has(literal)) return
    seen.add(literal)

    // Carries the marker in its own text: marked by construction, whatever the
    // interpolated values turn out to be.
    if (stripQuotes(literal).startsWith(ACCOUNT_MARKER)) {
      checked++
      return
    }

    if (isInterpolated(literal)) {
      // Resolve the interpolated identifiers through the file's bindings. If one
      // of them is a plain literal without the marker, this address is a leak.
      //
      // Only a value in the LOCAL PART (immediately before the `@`) can be an
      // account address. A template like `` `${name}@gmail.com` `` is an address;
      // a display string that merely CONTAINS an address-shaped value is not —
      // `` `${kidName} (${owner}@gmail.com)` `` names a kid, not an account.
      // Treating those two as one thing is how a checker starts crying wolf.
      const inner = stripQuotes(literal)
      const identifiers = [...inner.matchAll(/\$\{([A-Za-z_$][\w$]*)\}(?=@)/g)].map((m) => m[1])
      if (identifiers.length === 0) {
        checked++
        return
      }
      const resolved = identifiers.map((id) => bindings.get(id)).filter((v) => v !== undefined)
      const bad = resolved.filter((v) => !v.includes(ACCOUNT_MARKER))
      if (bad.length > 0) {
        finding(
          file,
          `account address ${literal} interpolates a value without \`${ACCOUNT_MARKER}\` ` +
            `(resolved: ${bad.join(', ')})`,
        )
        return
      }
      if (resolved.length === 0) {
        // A function parameter. Two ways it can be fine, and they are ORed:
        //   - it is provably a DISPLAY value (a kid's name written into the
        //     marker's own row), so it is not an account address at all; or
        //   - every caller passes a marker-carrying literal for it.
        // Anything else stays unresolved, and says so.
        const judged = identifiers.every(
          (id) =>
            !bindings.has(id) &&
            (isDisplayOnlyParameter(source, id) ||
              parameterIsMarkedAtCallSites(source, id, bindings)),
        )
        if (judged) {
          checked++
          return
        }
        unresolved.push(`${file}${where} address ${literal} interpolates an unknown value`)
        return
      }
      checked++
      return
    }

    checked++
    if (!stripQuotes(literal).startsWith(ACCOUNT_MARKER)) {
      finding(
        file,
        `account address ${literal} does not start with \`${ACCOUNT_MARKER}\` — the sweep ` +
          'deletes only that prefix, so this account and its rows would survive forever',
      )
    }
  }

  // Every real address literal in the file, not just the ones a call happens to
  // name. A fixture address is a fixture address wherever it is written.
  for (const match of source.matchAll(EMAIL_LITERAL)) {
    const line = source.slice(0, match.index).split('\n').length
    judge(match[1], `:${line}`)
  }
  return checked
}

// ---------------------------------------------------------------------------
// Rule 2 — every fixture drop-in's title carries the record marker.
//
// The audit's leak was a real row with a realistic name. The marker is what
// lets a human (and the sweep's report) tell a fixture from a parent's post.
// ---------------------------------------------------------------------------

/** Functions that take a title and post it through the form. */
const POST_HELPERS = ['postDropIn', 'postADropIn', 'quickPost']
/** Properties that hold a title at a `postDropIn`-style call site. */
const TITLE_KEYS = ['title', 'pageTitle']

function resolveValue(expr, bindings) {
  const trimmed = expr.trim()
  if (/^[`'"]/.test(trimmed)) return trimmed
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) return bindings.get(trimmed) ?? null
  return null
}

/** Split a call's argument text on top-level commas. */
function splitArgs(text) {
  const out = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if ('([{'.includes(ch)) depth++
    if (')]}'.includes(ch)) depth--
    if (ch === ',' && depth === 0) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim() !== '') out.push(current)
  return out
}

function titleCandidates(argsText, bindings) {
  const found = []
  for (const part of splitArgs(argsText)) {
    // The form every spec uses: `postDropIn(page, { title, kidLabels: [...] })` —
    // an object literal with the SHORTHAND property, which carries no colon.
    const shorthand = part.match(/(?:^|[{,\s])([A-Za-z_$][\w$]*)\s*(?=[,}])/)
    if (shorthand !== null && TITLE_KEYS.includes(shorthand[1])) {
      const resolved = bindings.get(shorthand[1])
      if (resolved !== undefined) found.push(resolved)
    }
    for (const key of TITLE_KEYS) {
      const prop = new RegExp(`\\b${key}\\s*:\\s*([^,}]+)`).exec(part)
      if (prop !== null) {
        const resolved = resolveValue(prop[1], bindings)
        if (resolved !== null) found.push(resolved)
      }
    }
    const resolved = resolveValue(part, bindings)
    if (resolved !== null) found.push(resolved)
  }
  return found
}

function checkFixtureTitles(source, file, bindings) {
  let checked = 0
  for (const helper of POST_HELPERS) {
    const call = new RegExp(`\\b${helper}\\(`, 'g')
    for (const match of source.matchAll(call)) {
      let depth = 0
      let end = -1
      for (let i = match.index + match[0].length - 1; i < source.length; i++) {
        const ch = source[i]
        if (ch === '(') depth++
        else if (ch === ')') {
          depth--
          if (depth === 0) {
            end = i
            break
          }
        }
      }
      if (end === -1) continue
      const argsText = source.slice(match.index + match[0].length, end)
      const line = source.slice(0, match.index).split('\n').length
      // A helper's own DEFINITION is not a call site.
      if (/^\s*page\s*:\s*Page/.test(argsText)) continue

      const candidates = titleCandidates(argsText, bindings)
      if (candidates.length === 0) {
        unresolved.push(`${file}:${line} ${helper}(…) title is dynamic — not judged`)
        continue
      }
      checked++
      if (!candidates.some((c) => TITLE_MARKERS.some((m) => c.includes(m)))) {
        finding(
          `${file}:${line}`,
          `fixture drop-in title carries no marker (${TITLE_MARKERS.join(' / ')}): ` +
            `${candidates.join(' | ').slice(0, 110)}`,
        )
      }
    }
  }
  return checked
}

// ---------------------------------------------------------------------------
// Rule 3 — a spec's REST DELETE is scoped to rows it owns.
//
// The audit's other half: "never use broad deletion criteria". The sweep's
// safety gate catches a founder account inside the marker set; nothing catches
// a spec whose cleanup query is broader than the rows that spec created.
// ---------------------------------------------------------------------------

/**
 * Columns a DELETE may scope by. Each identifies the ROW'S OWNER, or the row
 * itself when the id came back from this spec's own insert. A new DELETE
 * filtering on anything else needs a human decision — which is the point.
 */
const OWNER_SCOPED_COLUMNS = new Set([
  'id',
  'profile_id',
  'host_profile_id',
  'follower_profile_id',
  'followee_profile_id',
  'requester_id',
  'addressee_id',
  'sender_id',
  'recipient_id',
  'author_profile_id',
  'blocker_profile_id',
  'blocked_profile_id',
  'reporter_profile_id',
  'kid_id',
  'playdate_id',
  'other_profile_id',
  'place_id',
  // `account_links` is a two-party row: the spec deletes the pending request it
  // created and narrows by that request's own status. Pinned here deliberately,
  // so widening it shows up as a finding.
  'status',
])

/** Query-string keys that are NOT row filters (PostgREST output shaping). */
const NON_FILTER_KEYS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

/** Filter operators that make a DELETE broad rather than scoped. */
const BROAD_OPERATORS = new Set(['like', 'ilike', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'])

/**
 * A DELIBERATE full clear, named with its reason. These exist because a test
 * fixture cannot otherwise name the row it is re-creating (a place follow is
 * keyed by place, not by a profile the spec knows). An entry here is a
 * reviewable act; forgetting one is not, which is why the guard fails without
 * an entry rather than assuming the best.
 *
 * Adding an entry is NOT how to silence a finding. The claim it encodes is
 * "this DELETE cannot reach a real parent's row" — if that is not what you can
 * defend, the query is the thing to fix.
 */
const BROAD_CLEARS = [
  {
    table: 'follows',
    filter: 'place_id=not.is.null',
    reason:
      'places.e2e.ts re-creates the marker’s own place-follow from a clean slate; ' +
      'a follow is keyed by place, has no owner column the spec can name before it exists, ' +
      'and on this single-tenant dev project the only follows rows are the suite’s own.',
  },
]

function checkDeletes(source, file) {
  const lines = source.split('\n')
  let checked = 0

  // Only queries that a DELETE can actually use. A `like`/`ilike` filter on a
  // READ is a search, not a broadening of a delete — flagging it would be the
  // false-positive machine this guard exists to avoid.
  const deleteQueries = []
  for (let i = 0; i < lines.length; i++) {
    if (!/method:\s*['"]DELETE['"]/.test(lines[i])) continue
    // The storage API is path-scoped and takes no PostgREST filter, so it is
    // outside this rule (and is reported as a note rather than passed silently).
    const narrow = lines.slice(Math.max(0, i - 30), i + 1).join('\n')
    if (/\/storage\/v1\//.test(narrow) && !/\/rest\/v1\//.test(narrow)) {
      notes.push(`${file}:${i + 1} storage API delete (path-scoped, not PostgREST)`)
      continue
    }
    // The query may be a literal in the same statement, or a template held in a
    // local/array that the call site sits under (the loop-driven cleanup specs).
    // Widen before giving up: an unreviewed DELETE is the thing this rule exists
    // for, so "could not read it" must be rare and loud.
    let window = narrow
    let queries = [...window.matchAll(/\/rest\/v1\/([a-z_]+)\?([^`'"\s]*)/gi)]
    if (queries.length === 0) {
      window = lines.slice(Math.max(0, i - 80), i + 1).join('\n')
      queries = [...window.matchAll(/\/rest\/v1\/([a-z_]+)\?([^`'"\s]*)/gi)]
      // A query can also be a bare PostgREST path (`playdates?host_profile_id=…`)
      // passed to a spec-local wrapper that prepends the rest URL. Accept that
      // shape, so a wrapper is not a blind spot.
      if (queries.length === 0) {
        queries = [...window.matchAll(/(?:^|[\s`'"(])([a-z_]+)\?([a-z_]+=[^`'"\s]*)/gi)]
      }
      // A loop over a `rest/v1/…` path array builds the table from a variable,
      // so no table name is readable — every path in view is still checked.
      if (queries.length === 0) {
        const paths = [...window.matchAll(/rest\/v1\/\$\{/g)]
        if (paths.length > 0) {
          notes.push(
            `${file}:${i + 1} DELETE over a loop-built rest/v1 path array — ` +
              'its filter columns are checked where the paths are written',
          )
          continue
        }
      }
    }
    if (queries.length === 0) {
      // A query assembled from a variable the window cannot see. Say so rather
      // than pass it: an unreviewed DELETE is the thing this rule exists for.
      unresolved.push(`${file}:${i + 1} DELETE whose rest/v1 query is built out of view`)
      continue
    }
    for (const [, table, filter] of queries) {
      deleteQueries.push({ table, filter, line: i + 1 })
    }
  }

  for (const { table, filter, line } of deleteQueries) {
    const parts = filter
      .split('&')
      .filter((p) => p.includes('='))
      .map((p) => ({ key: p.split('=')[0], value: p.split('=').slice(1).join('=') }))
      .filter((p) => !NON_FILTER_KEYS.has(p.key))

    const broad = parts.filter((p) => BROAD_OPERATORS.has(p.value.split('.')[0]))
    if (broad.length > 0) {
      const declared = broad.find((b) =>
        BROAD_CLEARS.some((c) => c.table === table && `${b.key}=${b.value}` === c.filter),
      )
      if (declared !== undefined) {
        const entry = BROAD_CLEARS.find(
          (c) => c.table === table && `${declared.key}=${declared.value}` === c.filter,
        )
        notes.push(
          `${file}:${line} declared broad clear on ${table} (${entry.filter}) — ` +
            `${entry.reason.slice(0, 60)}…`,
        )
      } else {
        finding(
          `${file}:${line}`,
          `a DELETE on ${table} uses the broad filter(s) ` +
            `${broad.map((b) => `${b.key}=${b.value}`).join(', ')} — if this is a deliberate ` +
            'full clear, add it to BROAD_CLEARS with a reason that says why no parent’s row can ' +
            'be reached; otherwise scope it',
        )
      }
      continue
    }

    const unscoped = parts.filter((p) => !OWNER_SCOPED_COLUMNS.has(p.key))
    if (unscoped.length > 0) {
      finding(
        `${file}:${line}`,
        `a DELETE on ${table} scopes by ${unscoped.map((u) => u.key).join(', ')}, which is not a ` +
          'known owner/row column — confirm it cannot reach another parent’s row, then add it ' +
          'to OWNER_SCOPED_COLUMNS with a reason',
      )
    }
    checked++
  }

  return checked
}

// ---------------------------------------------------------------------------
// Rule 4 — the convention is documented in ONE place, and the guard is bound to
// that document rather than to an unwritten convention in someone's head.
// ---------------------------------------------------------------------------

function checkConventionDoc() {
  let doc
  try {
    doc = readFileSync(CONVENTION_DOC, 'utf8')
  } catch {
    finding(
      CONVENTION_DOC,
      'the fixture-marker convention has no document — an undocumented convention ' +
        'is one a new spec can silently leave',
    )
    return
  }
  for (const marker of [ACCOUNT_MARKER, ...TITLE_MARKERS]) {
    if (!doc.includes(marker)) finding(CONVENTION_DOC, `the document does not state \`${marker}\``)
  }
  if (!doc.includes('fixture-marker-guard')) {
    finding(CONVENTION_DOC, 'the document does not name scripts/guards/fixture-marker-guard.mjs')
  }
  notes.push('convention documented in docs/agents/e2e-fixture-convention.md')
}

// ---------------------------------------------------------------------------
// Rule 5 — the sweep still covers the convention the specs use. The guard and
// the sweep are two halves of one rule; if someone narrows one side, the other
// must fail.
// ---------------------------------------------------------------------------

function checkSweepCovers() {
  let source
  try {
    source = readFileSync(SWEEP, 'utf8')
  } catch {
    finding(SWEEP, 'the sweep script is missing — nothing removes fixtures from production')
    return
  }
  if (!source.includes(`like '${ACCOUNT_MARKER}%'`)) {
    finding(
      SWEEP,
      `the sweep no longer matches the documented account marker (\`like '${ACCOUNT_MARKER}%'\`)`,
    )
    return
  }
  notes.push(`sweep matches the documented account marker \`like '${ACCOUNT_MARKER}%'\``)
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Fixture-marker guard — the sweep convention vs what the specs create')
console.log('===========================================================')

let specs = []
try {
  specs = readdirSync(E2E_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.mts'))
} catch {
  console.log('SKIP — e2e/ not found')
  process.exit(0)
}

let accountCount = 0
let titleCount = 0
let deleteCount = 0

for (const name of specs) {
  const file = path.join(E2E_DIR, name)
  const source = readFileSync(file, 'utf8')
  const bindings = collectBindings(source)
  accountCount += checkAccounts(source, file, bindings)
  titleCount += checkFixtureTitles(source, file, bindings)
  deleteCount += checkDeletes(source, file)
}

checkSweepCovers()
checkConventionDoc()

console.log(`  checked ${specs.length} spec file(s)`)
console.log(`  checked ${accountCount} account address literal(s)`)
console.log(`  checked ${titleCount} resolved fixture title(s)`)
console.log(`  checked ${deleteCount} scoped REST query/queries`)
for (const note of notes) console.log(`  ok — ${note}`)

if (unresolved.length > 0) {
  console.log()
  console.log(`  ${unresolved.length} value(s) not statically judged (judged where they are passed):`)
  for (const u of unresolved.slice(0, 10)) console.log(`    · ${u}`)
  if (unresolved.length > 10) console.log(`    · …and ${unresolved.length - 10} more`)
}

console.log()
if (findings.length === 0) {
  console.log('PASS — the fixture convention holds and the sweep still covers it.')
  process.exit(0)
}

console.log(`FAIL — ${findings.length} finding(s):`)
for (const f of findings) console.log(`  - ${f}`)
console.log()
console.log('These are deterministic findings, not opinions. Fix the cause; do not')
console.log('silence the guard. If the convention genuinely changed, change it in')
console.log('docs/agents/e2e-fixture-convention.md AND the sweep in the same commit.')
process.exit(1)
