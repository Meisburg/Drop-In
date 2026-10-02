#!/usr/bin/env node
/**
 * Copy-taxonomy guard — a copy module that names a PLACE CATEGORY declares it,
 * and every declaration is checked against the taxonomy the app itself uses.
 *
 * WHY THIS EXISTS. V28 slice 5 mechanically pinned one class of dishonesty for
 * ONE card: *copy must not assert content that is not there*. The closing card
 * of the first run named category words the directory cannot serve — the
 * taxonomy withholds the kinds that hold zero rows — and put the app's controls
 * somewhere they are not on a wide screen. What caught both was local: a
 * property in `firstRunTour.test.ts` over `PLACE_KINDS` /
 * `PLACE_KIND_CHIP_KINDS`, plus one browser pin. This guard is the same rule
 * CLIMBED for the one claim kind that can be judged with no network, no
 * database and no clock, and it says below exactly how far the climb goes.
 *
 * THE RULE, LITERALLY. Over the copy consts this guard is given (COPY_MODULES):
 *   1. every category a module's DECLARATION names must EXIST in `PLACE_KINDS`;
 *   2. it must be a kind the app OFFERS (`PLACE_KIND_CHIP_KINDS`) — not one the
 *      app withholds;
 *   3. the declaration must be BACKED by the words: each declared kind's label
 *      appears in the copy text;
 *   4. and the copy must not name a category the declaration omits — a withheld
 *      kind's word in the copy is the defect this guard was written for, and it
 *      fails whether or not a declaration exists.
 *
 * THE DECLARATION MECHANISM — the form the guard reads. A copy module states its
 * claims as an EXPORTED top-level const holding an ARRAY of string LITERALS,
 * naming taxonomy KINDS (`'playground'`), never labels (`'Playgrounds'`) and
 * never a category the app does not have. COPY_MODULES names that const per
 * module, so the module whose words make a category claim carries one and a
 * registered module whose words make none carries none — rule 4 fails on a
 * category in the copy that nobody declared, which is what keeps the
 * declarations from being a formality. KINDS, NOT LABELS: withholding is a fact
 * about the taxonomy (the offered chips are a subset of the kinds) and a label
 * is a lossy projection of a kind, so a label view can silently drop a kind
 * whose word collides with an offered one.
 *
 * WHERE IT STOPS — the boundary, and it is the whole of the claim. Read this as
 * the scope, because the mechanism IS this list:
 *   - It reads the consts COPY_MODULES names, in the modules it names. Copy that
 *     is not one of those consts is NOT scanned: a string built inline inside a
 *     function, a placeholder in a `.tsx`, words written into JSX. The registry
 *     is the coverage, so a module absent from it is not judged at all.
 *   - It knows ONE taxonomy — the place kinds in `src/lib/places.ts` and their
 *     words from `placeKindLabel`. Notification kinds, theme choices,
 *     indoor/outdoor and every other vocabulary are out of scope.
 *   - The match is LEXICAL: the label as a whole word, optionally plural, case
 *     insensitive. It therefore over-reports a label used as an ordinary English
 *     word, and it misses a category named by a synonym or a paraphrase. That is
 *     D-027's limit and not a defect: a lexical detector over a semantic
 *     predicate is what it is, and what the rule really holds is the phrasing it
 *     keys on.
 *   - A kind whose label cannot be told apart from the generic word — the label
 *     function's own default — is UNSCANNABLE. The guard prints a `limit——`
 *     line per such kind rather than pretending to judge it, so the blind spot
 *     is in the run and not only in this sentence.
 *   - COUNT CLAIMS are NOT declared and NOT checked here. "most rows have no
 *     hours" is a live-measurement claim, and asking it needs the database:
 *     `src/lib/db.ts` throws at module load without its environment (measured,
 *     and the reason `verify.yml` says so), so a check that reached it would put
 *     a live dependency inside the gate. The honest split is a guard for what is
 *     offline and a lane for what is not; this guard does not claim the other
 *     half, and there is no dated-report substitute here for a good reason —
 *     a committed count rots while the suite stays green.
 *
 * WHAT IT CANNOT DO. It cannot decide that the copy is TRUE — only that the
 * categories the copy names are ones the app has and offers. The rules are a
 * detector over named phrasings; a restatement in other words escapes them.
 *
 * THE INSTRUMENT POLICES ITSELF. A run that sees no kinds, no words for them, no
 * registered const, no copy text or no declaration at all is a FAIL, never a
 * pass: an instrument that matches nothing looks exactly like a clean repo. Its
 * behavior is proven by `copy-taxonomy-guard.check.mjs`, which seeds a violation
 * for each rule, requires the finding, then MUTATES that rule and requires the
 * seed to stop firing.
 *
 * Deterministic: no model, no network, no database, no clock.
 *
 * Usage:  node scripts/guards/copy-taxonomy-guard.mjs [repo-root]
 * Exit:   0 = clean, 1 = findings
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { escapeForRegExp } from '../../src/lib/escapeForRegExp.mjs'

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()

/** The taxonomy this guard judges against, and the three names it reads out of
 *  it. The constants are the app's OWN, imported by the app's own modules — the
 *  guard never restates a kind or a word, because a second copy of the taxonomy
 *  is a taxonomy that drifts. */
const TAXONOMY_MODULE = 'src/lib/places.ts'
const ALL_KINDS_CONST = 'PLACE_KINDS'
const OFFERED_KINDS_CONST = 'PLACE_KIND_CHIP_KINDS'
const LABEL_FUNCTION = 'placeKindLabel'

/** The copy this guard judges. `consts` are the exported copy consts whose
 *  words the guard reads; `claims` names the module's declaration, when it has
 *  one. Adding a module here is the act that puts it in scope — a visible act,
 *  unlike a word quietly going unchecked. */
const COPY_MODULES = [
  {
    module: 'src/lib/firstRunCopy.ts',
    consts: ['FIRST_RUN_COPY', 'FIRST_RUN_NUDGE_COPY'],
  },
  {
    module: 'src/lib/firstRunTour.ts',
    consts: ['TOUR_TITLE', 'TOUR_BODY', 'TOUR_PROGRESS_LABEL', 'TOUR_LINES'],
    claims: 'TOUR_TAXONOMY_CLAIMS',
  },
  {
    module: 'src/lib/push.ts',
    consts: ['NOTIFICATION_KIND_COPY'],
  },
  {
    module: 'src/lib/theme.ts',
    consts: ['THEME_CHOICE_COPY'],
  },
  {
    module: 'src/lib/feed.ts',
    consts: ['RADIUS_SAVE_REJECTED_COPY', 'RADIUS_SAVE_FAILED_COPY'],
  },
]

// ---------------------------------------------------------------------------
// Reading one module's source. An AST, not a scanner: "is this a string" and
// "is this an exported const" are the two questions a character scan gets wrong
// (see the lexer post-mortem in copy-field-consumption-guard.mjs, this repo's
// own record of paying for that).
// ---------------------------------------------------------------------------

function parseModule(file) {
  const text = readFileSync(file, 'utf8')
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (child) => {
    walk(child, visit)
  })
}

/** `as const`, `satisfies T`, a parenthesised value and an angle-bracket
 *  assertion are all wrappers around the value a declaration really is. */
function unwrap(node) {
  let n = node
  while (
    n !== undefined &&
    (ts.isAsExpression(n) ||
      ts.isSatisfiesExpression(n) ||
      ts.isParenthesizedExpression(n) ||
      ts.isTypeAssertionExpression(n))
  ) {
    n = n.expression
  }
  return n
}

/** The initializer of a top-level EXPORTED const, or null when the module has
 *  no such const. A non-exported one is not a declaration the guard can rely
 *  on: it is module-local data, and its name is nobody else's contract. */
function exportedConstInitializer(source, name) {
  for (const stmt of source.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    if (!(ts.getModifiers(stmt) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name) return decl.initializer ?? null
    }
  }
  return null
}

/** Every string literal under a node — keys and values alike, and the spans of
 *  a template literal, because a word in a template hole's text is a word the
 *  parent reads. */
function stringLiteralsIn(node) {
  const out = []
  walk(node, (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text)
    else if (ts.isTemplateExpression(n)) {
      out.push(n.head.text)
      for (const span of n.templateSpans) out.push(span.literal.text)
    }
  })
  return out
}

/** The string elements of an exported const's array literal, or NULL when the
 *  const is absent or is not an array of string literals. Null is never a
 *  silent empty list: every caller reports it. */
function stringArrayConst(source, name) {
  const init = exportedConstInitializer(source, name)
  if (init === null) return null
  const node = unwrap(init)
  if (!ts.isArrayLiteralExpression(node)) return null
  const out = []
  for (const element of node.elements) {
    const value = unwrap(element)
    if (!ts.isStringLiteral(value)) return null
    out.push(value.text)
  }
  return out
}

/** `placeKindLabel`'s word for every kind it names, plus its `default` word —
 *  the same function the app renders labels through, read here as source. */
function kindLabels(source) {
  const labels = new Map()
  let fallback = null
  walk(source, (node) => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== LABEL_FUNCTION || node.body === undefined) return
    walk(node.body, (inner) => {
      if (!ts.isSwitchStatement(inner)) return
      for (const clause of inner.caseBlock.clauses) {
        const ret = clause.statements.find((s) => ts.isReturnStatement(s))
        const word = ret !== undefined && ts.isStringLiteral(ret.expression) ? ret.expression.text : null
        if (word === null) continue
        if (ts.isCaseClause(clause) && ts.isStringLiteral(clause.expression)) labels.set(clause.expression.text, word)
        else if (ts.isDefaultClause(clause)) fallback = word
      }
    })
  })
  return { labels, fallback }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Copy-taxonomy guard — a category this copy names must be one the app has and offers')
console.log('====================================================================================')

const findings = []
const fail = (message) => findings.push(message)

// The taxonomy, read first: with no kinds and no words the guard cannot judge
// anything, and "cannot judge" is a finding rather than a pass.
const taxonomyPath = path.join(ROOT, TAXONOMY_MODULE)
let allKinds = null
let offeredKinds = null
let labels = new Map()
let fallback = null
if (!existsSync(taxonomyPath)) {
  fail(
    `${TAXONOMY_MODULE}: the taxonomy this guard judges against is GONE — a guard whose input vanished is ` +
      'not passing, it is blind',
  )
} else {
  const source = parseModule(taxonomyPath)
  allKinds = stringArrayConst(source, ALL_KINDS_CONST)
  offeredKinds = stringArrayConst(source, OFFERED_KINDS_CONST)
  const read = kindLabels(source)
  labels = read.labels
  fallback = read.fallback
  if (allKinds === null || allKinds.length === 0) {
    fail(
      `${TAXONOMY_MODULE}: no ${ALL_KINDS_CONST} array of string literals — the taxonomy walk found nothing, ` +
        'so every rule below would be vacuous',
    )
    allKinds = []
  }
  if (offeredKinds === null || offeredKinds.length === 0) {
    fail(
      `${TAXONOMY_MODULE}: no ${OFFERED_KINDS_CONST} array of string literals — without the offered set rule 2 ` +
        'cannot be asked at all',
    )
    offeredKinds = []
  }
  if (labels.size === 0) {
    fail(
      `${TAXONOMY_MODULE}: ${LABEL_FUNCTION} yielded no kind word — rule 3 and rule 4 key on the word for a kind, ` +
        'and with none the scan would match nothing in either direction',
    )
  }
}

const allKindSet = new Set(allKinds ?? [])
const offeredKindSet = new Set(offeredKinds ?? [])

/** A kind's word, or null when the guard must not scan for it. Two cases, both
 *  printed: the word is the label function's generic fallback, or two kinds
 *  share one word (so a match cannot be attributed to a kind). */
const wordOf = (kind) => labels.get(kind) ?? fallback
const kindsByLabel = new Map()
for (const kind of allKindSet) {
  const word = wordOf(kind)
  if (word === null || word === fallback) continue
  if (!kindsByLabel.has(word)) kindsByLabel.set(word, [])
  kindsByLabel.get(word).push(kind)
}
const unscannable = [...allKindSet].filter((kind) => !kindsByLabel.get(wordOf(kind))?.includes(kind))
const ambiguousWords = [...kindsByLabel.entries()].filter(([, kinds]) => kinds.length > 1)

/** Whole word, optionally plural, case insensitive — the same shape
 *  `firstRunTour.ts` builds for its own pin, over the one escaped-by-module
 *  helper the repo keeps in a single place. */
const matchesCopy = (word, text) => new RegExp(`\\b${escapeForRegExp(word)}s?\\b`, 'i').test(text)

console.log(`  taxonomy: ${TAXONOMY_MODULE}`)
console.log(`  kinds read: ${allKindSet.size}; offered: ${offeredKindSet.size}; words: ${labels.size}`)
console.log(`  scanned words: ${kindsByLabel.size} (${[...kindsByLabel.keys()].join(', ') || 'none'})`)
for (const kind of unscannable) {
  console.log(
    `  limit—— kind "${kind}" is not scannable: its word resolves to the label function's own default or is ` +
      'shared with another kind, so a match could not be attributed to it (see WHERE IT STOPS in the header)',
  )
}
for (const [word, kinds] of ambiguousWords) {
  console.log(
    `  limit—— the word "${word}" is the label of ${kinds.length} kinds (${kinds.join(', ')}), so a copy match ` +
      'is not attributed to either of them',
  )
}

let constsRead = 0
let stringsRead = 0
let claimsRead = 0

for (const entry of COPY_MODULES) {
  const file = path.join(ROOT, entry.module)
  if (!existsSync(file)) {
    fail(
      `${entry.module}: the copy module this guard is configured to judge is GONE — a guard whose input ` +
        'vanished is not passing, it is blind',
    )
    continue
  }
  const source = parseModule(file)
  const words = []
  for (const name of entry.consts) {
    const init = exportedConstInitializer(source, name)
    if (init === null) {
      fail(
        `${entry.module}: the copy const "${name}" is not an exported top-level const here — the registry names ` +
          'it, so its absence (renamed, deleted, no longer exported) is the instrument going blind',
      )
      continue
    }
    const strings = stringLiteralsIn(init)
    if (strings.length === 0) {
      fail(
        `${entry.module}: "${name}" carries no string literal at all — the walk found nothing in it, which ` +
          'looks exactly like a const with nothing to say',
      )
      continue
    }
    constsRead += 1
    stringsRead += strings.length
    words.push(...strings)
  }
  const text = words.join('\n')

  let declared = []
  if (entry.claims !== undefined) {
    const list = stringArrayConst(source, entry.claims)
    if (list === null) {
      fail(
        `${entry.module}: "${entry.claims}" is not an exported array of string literals — a declaration the ` +
          'guard cannot read is a declaration that checks nothing',
      )
    } else {
      declared = list
    }
  }
  claimsRead += declared.length

  console.log(`  module: ${entry.module}`)
  console.log(`  copy consts read: ${entry.consts.length}; declared claims: ${declared.length} (${declared.join(', ') || 'none'})`)

  // 1. A claimed category must EXIST in the taxonomy.
  const missing = allKindSet.size > 0 ? declared.filter((kind) => !allKindSet.has(kind)) : []
  for (const kind of missing) {
    fail(
      `${entry.module}: the declaration names the category "${kind}", which ${ALL_KINDS_CONST} does not have — ` +
        'a category this copy names must be one of the kinds the app has',
    )
  }

  // 2. A claimed category must be one the app OFFERS, not one it withholds.
  const withheld = declared.filter((kind) => !offeredKindSet.has(kind) && allKindSet.has(kind))
  for (const kind of withheld) {
    fail(
      `${entry.module}: the declaration names "${kind}", a kind the app WITHHOLDS (it is absent from ` +
        `${OFFERED_KINDS_CONST}) — copy may not claim a category the app keeps out of a parent's way`,
    )
  }

  // 3. The declaration must be backed by the words it is a declaration about.
  for (const kind of declared) {
    const word = wordOf(kind)
    if (word === null || !kindsByLabel.get(word)?.includes(kind)) continue
    if (!matchesCopy(word, text)) {
      fail(
        `${entry.module}: the declaration names "${kind}", whose word "${word}" appears nowhere in the copy ` +
          'consts this module is judged on — the declaration has drifted off the words it is about',
      )
    }
  }

  // 4. And the copy must not name a category the declaration omits — the
  //    direction that catches a withheld kind in the words, declared or not.
  const namedInCopy = [...kindsByLabel.keys()].filter((word) => matchesCopy(word, text))
  const undeclared = namedInCopy.filter((word) => !declared.includes(kindsByLabel.get(word)[0]))
  for (const word of undeclared) {
    const kind = kindsByLabel.get(word)[0]
    const standing = offeredKindSet.has(kind)
      ? 'an offered kind, and still undeclared'
      : `a kind the app WITHHOLDS (it is absent from ${OFFERED_KINDS_CONST})`
    fail(
      `${entry.module}: the copy names "${word}" — the taxonomy kind "${kind}", ${standing} — and no declaration ` +
        `in this module claims it. Declare the kind (if the copy may name it at all) or take the word out of the copy.`,
    )
  }
}

// The instrument's own tripwires: zero is a finding, in every direction.
if (constsRead === 0) {
  fail('no registered copy const yielded any text — the registry and the modules disagree, and nothing was judged')
}
if (stringsRead === 0) {
  fail('no string literal was read anywhere — an instrument with no input is not passing, it is blind')
}
if (claimsRead === 0) {
  fail(
    'no declaration was read from any registered module — with no claims the whole mechanism is a formality, ' +
      'and a declaration that went missing is exactly the state this notice exists to catch',
  )
}

console.log()
if (findings.length === 0) {
  console.log('PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.')
  process.exit(0)
}

console.log(`FAIL — ${findings.length} finding(s):`)
for (const finding of findings) console.log(`  - ${finding}`)
console.log()
console.log('These are deterministic findings, not opinions. Either the copy stops naming the')
console.log('category, or the declaration says what the copy claims and the taxonomy backs it.')
process.exit(1)
