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
 *   3. the declaration must be BACKED by the words: for every declared kind whose
 *      word the guard can ATTRIBUTE a match to, that word appears in the copy
 *      text. A kind whose word cannot be attributed is skipped by this rule, and
 *      the run says so — see the unscannable case in WHERE IT STOPS below;
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
 *   - A kind is UNSCANNABLE when its word cannot be attributed to it, and there
 *     are three ways that happens: the word is the label function's own default;
 *     two kinds resolve to the SAME word; or the label function names no word for
 *     it at all (no `case` and no `default`). Rules 3 and 4 skip such a kind
 *     entirely — a match on it is neither required of the copy nor caught in it —
 *     and the guard prints a `limit——` line per such kind, NAMING WHICH of the
 *     three applies, because a printed reason that is not the real one is the
 *     same defect as a claim the mechanism does not support.
 *   - A DECLARED kind that is unscannable makes rule 3 unable to check that
 *     claim, and the run then cannot call the declaration backed. That is a
 *     FINDING, not a `limit——` line: the line says why, and the exit code says
 *     whether the guard established anything. See THE INSTRUMENT POLICES ITSELF.
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
 * word it can attribute to a kind, no registered const, no copy text, no
 * declaration at all, or a DECLARED claim rule 3 could not CHECK is a FAIL, never
 * a pass: an instrument that matches nothing looks exactly like a clean repo, and
 * one that scanned nothing has established that it did not look rather than that
 * the tree is healthy. The last of those was the repair's own blind spot (D-030):
 * the set of claims actually tested can be empty while the scan itself is not.
 * Its behavior is proven by `copy-taxonomy-guard.check.mjs`, which seeds a violation
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

/** A kind's word, or null when the label function names none for it. */
const wordOf = (kind) => labels.get(kind) ?? fallback

/** The words the guard may scan for — one kind per word — and the kinds it must
 *  NOT scan for, each with the REASON it cannot be attributed, because the run
 *  prints that reason and a printed reason that is not the real one is a claim
 *  the mechanism does not support. Three cases:
 *    - the label function names no word at all (no `case` and no `default`);
 *    - the word is the label function's generic fallback, which every kind
 *      without its own case shares;
 *    - two or more kinds resolve to ONE word, so a match on it cannot be
 *      attributed to any of them. Those kinds are kept OUT of the scan, because
 *      a printed sentence saying they are unattributable is false if the scan
 *      still attributes them. */
const kindsByLabel = new Map() // word -> the ONE kind it names
const unattributableKinds = [] // { kind, why }
{
  const kindsByWord = new Map()
  for (const kind of allKindSet) {
    const word = wordOf(kind)
    if (word === null) {
      unattributableKinds.push({ kind, why: `the label function names no word for it at all (no case and no default)` })
      continue
    }
    if (word === fallback) {
      unattributableKinds.push({ kind, why: `its word is the label function default, which every kind without its own case shares` })
      continue
    }
    if (!kindsByWord.has(word)) kindsByWord.set(word, [])
    kindsByWord.get(word).push(kind)
  }
  for (const [word, kinds] of kindsByWord) {
    if (kinds.length > 1) {
      for (const kind of kinds) {
        unattributableKinds.push({ kind, why: `its word "${word}" is the label of ${kinds.length} kinds (${kinds.join(', ')})` })
      }
      continue
    }
    kindsByLabel.set(word, kinds[0])
  }
}
const whyUnattributable = new Map(unattributableKinds.map(({ kind, why }) => [kind, why]))

/** Whole word, optionally plural, case insensitive — the same shape
 *  `firstRunTour.ts` builds for its own pin, over the one escaped-by-module
 *  helper the repo keeps in a single place. */
const matchesCopy = (word, text) => new RegExp(`\\b${escapeForRegExp(word)}s?\\b`, 'i').test(text)

console.log(`  taxonomy: ${TAXONOMY_MODULE}`)
console.log(`  kinds read: ${allKindSet.size}; offered: ${offeredKindSet.size}; words: ${labels.size}`)
console.log(`  scanned words: ${kindsByLabel.size} (${[...kindsByLabel.keys()].join(', ') || 'none'})`)
for (const { kind, why } of unattributableKinds) {
  console.log(`  limit—— kind "${kind}" is not scannable: ${why}, so a match could not be attributed to it (see WHERE IT STOPS in the header)`)
}

let constsRead = 0
let stringsRead = 0
let claimsRead = 0
/** How many declared claims the guard ACCEPTED as kinds, how many of those rule 3
 *  actually CHECKED, and the ones it could not — the measurement the round-1
 *  repair stopped watching (D-030, instance 4). `claimsChecked` is the invariant's
 *  subject: the tripwire below asks whether any accepted claim went unchecked, and
 *  `claimsUnchecked` names which, so nothing here is computed and thrown away
 *  (round-3 review F3). */
let claimsAccepted = 0
let claimsChecked = 0
const claimsUnchecked = []

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
  let constsHere = 0
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
    constsHere += 1
    stringsRead += strings.length
    words.push(...strings)
  }
  const text = words.join('\n')

  let declared = []
  if (entry.claims !== undefined) {
    const list = stringArrayConst(source, entry.claims)
    if (list === null) {
      fail(
        `${entry.module}: "${entry.claims}" is not an exported top-level const holding an array of string ` +
          'literals — either it is not there at all, or what it holds is not a list of category names, and a ' +
          'declaration the guard cannot read is a declaration that checks nothing',
      )
    } else {
      declared = list
    }
  }
  claimsRead += declared.length

  console.log(`  module: ${entry.module}`)
  // The count printed is the number of consts whose text was actually READ, not
  // the number the registry names: a label that reports the configuration while
  // claiming to report the walk is the defect class this batch spent eleven
  // rounds on, and a const that drops out must show up as a smaller number here.
  console.log(
    `  copy consts read: ${constsHere} of ${entry.consts.length} named; declared claims: ${declared.length} (${declared.join(', ') || 'none'})`,
  )

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

  // 3. The declaration must be backed by the words it is a declaration about. A
  //    declared kind whose word cannot be attributed leaves that claim UNCHECKED
  //    — the line below says why, and the counter makes it a finding, because
  //    printing a reason is not establishing anything (D-030, instance 4).
  for (const kind of declared) {
    const word = wordOf(kind)
    if (!allKindSet.has(kind)) {
      // A kind the walk did not read is not this counter's to enforce: counting
      // it here would make one defect fire two rules and would leave each of their
      // mutations unable to clear its seed alone. It is printed with its OWN
      // reason, not the generic one (round-3 review F6).
      console.log(
        `  limit—— ${entry.module}: the declared kind "${kind}" is not scannable: the taxonomy walk found no kind ` +
          `"${kind}", so rule 3 has nothing to check`,
      )
      continue
    }
    claimsAccepted += 1
    if (word === null || kindsByLabel.get(word) !== kind) {
      claimsUnchecked.push({ module: entry.module, kind })
      console.log(
        `  limit—— ${entry.module}: the declared kind "${kind}" is not scannable, so rule 3 does not check its ` +
          `claim (${whyUnattributable.get(kind) ?? 'the guard cannot attribute its word'} — see WHERE IT STOPS)`,
      )
      continue
    }
    claimsChecked += 1
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
  const undeclared = namedInCopy.filter((word) => !declared.includes(kindsByLabel.get(word)))
  for (const word of undeclared) {
    const kind = kindsByLabel.get(word)
    const standing = offeredKindSet.has(kind)
      ? 'an offered kind, and still undeclared'
      : `a kind the app WITHHOLDS (it is absent from ${OFFERED_KINDS_CONST})`
    fail(
      `${entry.module}: the copy names "${word}" — the taxonomy kind "${kind}", ${standing} — and no declaration ` +
        `in this module claims it. Declare the kind (if the copy may name it at all) or take the word out of the copy.`,
    )
  }
}

// The positive half of the same measurement, printed where the run says what it
// derived: of the declared claims this guard accepted as kinds, how many rule 3
// actually checked. An accepted claim it could not check is a finding below.
console.log(`  declared claims CHECKED by rule 3: ${claimsChecked} of ${claimsAccepted} the taxonomy accepts`)

// The instrument's own tripwires. Every measurement this guard consumes as
// evidence must come back with something in it, and one that came back empty is a
// FAIL rather than a quiet pass (D-030) — including the set the first repair
// stopped watching: the declared claims rule 3 could actually CHECK.
if (kindsByLabel.size === 0) {
  fail(
    `${TAXONOMY_MODULE}: the scan found NO word it can attribute to a kind — every kind word resolves to the ` +
      'label function default, is shared with another kind, or is not named at all, so rules 3 and 4 would ' +
      'test NOTHING and a report of health would mean the guard did not look (see limit—— lines above)',
  )
}
if (claimsChecked < claimsAccepted) {
  fail(
    `${claimsAccepted - claimsChecked} declared claim(s) this guard accepted as kinds could not be CHECKED by ` +
      `rule 3 — ${claimsUnchecked.map(({ module, kind }) => `${module} claims "${kind}"`).join(', ')}. An ` +
      'unscannable declared kind leaves the run unable to call that declaration backed, so a PASS would claim ' +
      'backup the mechanism did not test (D-030): the limit—— line above says why, and THIS is the finding',
  )
}
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
