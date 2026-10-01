#!/usr/bin/env node
/**
 * Copy-field consumption guard — a field of a copy module must be READ by the
 * app, or be allowlisted with a written reason.
 *
 * WHY THIS EXISTS. A copy module (`src/lib/firstRunCopy.ts`) exists for one
 * reason: it holds the words the UI shows. A field in it that nothing reads is
 * a sentence about the product that the product does not say — and it is
 * believed, because it sits in the module everyone trusts for the words.
 *
 * THE INSTANCE THIS WAS WRITTEN FOR (V28 r2 slice 6a, measured on the tree at
 * the time): `skipLabel?: string` was declared, `FIRST_RUN_COPY.kids` set it to
 * `'Skip for now'`, and `firstRunCopy.test.ts` asserted it was non-empty — while
 * `FirstRunCard.tsx` rendered a hard-coded `Skip` and NO file in src read the
 * field at all. `rg -n "skipLabel" src/ --glob '!*.test.*'` returned the
 * declaration and the value and nothing else. The test made it look covered; the
 * test was one of the things that made it a lie possible.
 *
 * This is the fourth instance of the class in this batch (a claim that looks
 * evidenced and is not), which is the batch's rule for when a guard is owed
 * rather than another one-off fix.
 *
 * THE RULE:
 *   Every field declared by a copy module's copy shape must be CONSUMED
 *   somewhere in src/ **by a reader of that shape**, or appear in ALLOWLIST
 *   below with a non-empty reason.
 *
 * A FIELD IS (SHAPE, NAME), NOT A NAME. A copy module may declare several
 * shapes, and they may reuse names — `firstRunCopy.ts` declares
 * `FirstRunCardCopy` (title, body, primaryLabel, skipLabel) and the nudge's
 * anonymous shape (title, body, actionLabel). `title` in one is NOT the `title`
 * in the other: the card's title is the card's masthead, the nudge's title is
 * the nudge's lead. So a read satisfies a field only when the ROOT of the read
 * is a binding that shape actually names — `FIRST_RUN_COPY` / an alias of it for
 * `FirstRunCardCopy`, `FIRST_RUN_NUDGE_COPY` for the nudge shape. V28 r2 slice
 * 6a fix 1 (F1): the first version keyed fields by bare name within the module
 * and let a read on ANY binding imported from the module satisfy them, so
 * `FIRST_RUN_NUDGE_COPY.title` was accepted as the consumption of
 * `FirstRunCardCopy.title` — deleting every card's title read left the guard
 * reporting the field read and exiting 0. That is this guard's own defect class
 * one rung inward, and the seed
 * `check.mjs — 'a card title read deleted while the nudge title stays'` is what
 * keeps it from coming back.
 *
 * WHAT COUNTS AS CONSUMPTION — the trap is that THE DEFINITION SITE IS NOT A
 * CONSUMER, so it is stated in full:
 *
 *   CONSUMED = a read of the field through a value that carries its shape, in a
 *   src file that is neither the module nor a test:
 *     FIRST_RUN_COPY.kids.skipLabel        — a direct chain
 *     kidsCopy.skipLabel                   — an alias (`const kidsCopy = FIRST_RUN_COPY.kids`)
 *     FIRST_RUN_COPY[card].title           — a computed hop inside the chain
 *     const { title } = FIRST_RUN_COPY.name — a destructuring of a copy value (F3)
 *     const { kids: { skipLabel } } = FIRST_RUN_COPY — the same, nested
 *     import { FIRST_RUN_COPY as copy } … copy.kids.skipLabel — an ALIASED
 *       IMPORT. The shapes are keyed by the exported name and the reads by the
 *       local one; conflating them made every read in such a file invisible and
 *       reported read fields as unread (fix 2, item E).
 *     skipLabel={`${kidsCopy.skipLabel}`}  — a read inside a TEMPLATE HOLE. It
 *       is an expression node, so it is visible (K2: the scanner claimed a hole
 *       was code in one line of itself and erased it in the next, and a template
 *       literal is the most natural way to render words).
 *
 *   NOT CONSUMED (each is a place the word is WRITTEN or ASSERTED, never a
 *   place it is USED — and only use is evidence the word is true):
 *     1. the field's own declaration (`skipLabel?: string`) — a shape
 *        statement. It says the field may exist; it cannot say anyone reads it;
 *     2. the value site in the module (`skipLabel: 'Skip'`) — writing
 *        data into the module is the definition, not a read of it;
 *     3. ANY TEST FILE, including the module's own (`firstRunCopy.test.ts`) — a
 *        test that reads a field proves the field is present and non-empty, NOT
 *        that the UI shows it. That is exactly how the defect above survived.
 *        F2 widened this from the module's own test to every `*.test.*`: the
 *        argument that exempts one test exempts all of them, and admitting the
 *        others would let an unread field buy immunity by asserting about
 *        itself in a file one directory over;
 *     4. a read through a binding that does not carry the shape — a bare
 *        `.title` in a file that never imports the module (`document.title`),
 *        or `.title` on a SIBLING shape's value (`FIRST_RUN_NUDGE_COPY.title`
 *        is not `FirstRunCardCopy.title`, see above);
 *     5. the word inside a STRING, a TEMPLATE LITERAL TEXT, or a COMMENT — a
 *        comment or a literal that names a field is documentation or data about
 *        it, not a read of it. An AST gets this for free: a string is a node,
 *        not a span of characters the instrument has to decide about.
 *
 * KNOWN LIMITS. Each one names the INPUT that reaches it, because a limit
 * without an input is a guess. Every one of them is a false NEGATIVE (a missed
 * read, which surfaces as a finding a human then allowlists) or an
 * over-approximation that needs a human to allowlist — none of them can report
 * a word as read when it is not, which is the direction that matters. The one
 * exception is stated where it applies, and it is fenced by a finding.
 *
 *   - a copy value carried by something other than an imported binding, a
 *     direct alias of one, or a destructuring of one (a function parameter, a
 *     re-export, a JSX spread) is not followed; reaching input:
 *     `renderCopy(FIRST_RUN_COPY.kids)` in a consumer. This is a DATA-FLOW limit,
 *     not a parsing limit — an AST makes the parse trivial and still does not
 *     answer "where did this value come from";
 *   - a default import of a copy module is not followed; reaching input:
 *     `import copy from '../lib/firstRunCopy'` (this repo uses named imports);
 *   - a NAMESPACE import is not followed either — `import * as copy from
 *     '../lib/firstRunCopy'` then `copy.FIRST_RUN_COPY.kids.skipLabel` is a
 *     missed read, so the field comes out unread (the safe direction). The
 *     binding is detected and reported on the `namespace imports` line so this
 *     is never silent;
 *   - a read straight off a `Record`-typed binding — `FIRST_RUN_COPY.title` —
 *     satisfies `FirstRunCardCopy.title` by ROOT attribution, because the guard
 *     attributes shapes per const, not per value. Reaching input: that line.
 *     It does not typecheck (`title` is not a key of the record), so it cannot
 *     exist in clean code; same ruling as the reviewer's, and the same reason
 *     `const { title } = FIRST_RUN_COPY` (a destructure of the whole record) is
 *     not chased;
 *   - a nested destructure (`const { kids: { skipLabel } } = FIRST_RUN_COPY`)
 *     attributes `skipLabel` to the shapes of the ROOT, not to the shape of the
 *     intermediate value. Reaching input: that line. Over-approximating — it can
 *     only make a field look more read, never less;
 *   - a destructured key counts as a read even if the bound variable is never
 *     used; reaching input: `const { skipLabel } = FIRST_RUN_COPY.kids` with the
 *     binding unused. `noUnusedLocals` is on in tsconfig.app.json, so that file
 *     does not compile — unreachable in clean code;
 *   - `extends` is not followed: a sub-shape contributes only its OWN declared
 *     fields, and the parent shape is judged on its own. Reaching input:
 *     `interface SkippableFirstRunCardCopy extends FirstRunCardCopy` — the
 *     sub-shape contributes `skipLabel` only, and `FirstRunCardCopy`'s four
 *     fields are judged on their own. Deliberate: following `extends` would make
 *     `SkippableFirstRunCardCopy.title` a second field needing its own read;
 *   - an interface that no exported const carries is not judged (it is a type
 *     used elsewhere, not a copy value the app reads);
 *   - an interface named in a VALUE position of an annotation that the const does
 *     not really carry — `export const C: Omit<FirstRunCardCopy, 'x'> = {…}` —
 *     is taken as carried, because the guard reads type SYNTAX, not types.
 *     Over-approximating: it can only make a field look more read. Reaching
 *     input: that line. Key positions are the one place it is precise — the
 *     first type argument of `Record`/`Partial`/`Required`/`Readonly` is a KEY,
 *     not a value, and is skipped, so an interface used as a record key is not
 *     mistaken for a copy shape (fix 2, ocr #5). A key-taking generic outside
 *     that four-name list has its key treated as a value — same safe direction;
 *   - an excess key in a typed data literal is not this guard's business: tsc's
 *     excess-property check already rejects one. Note the asymmetry the fix-2
 *     review raised and this guard does NOT close: `FirstRunCardCopy.skipLabel`
 *     is optional, so a non-skippable entry CAN carry `skipLabel: 'Skip'` and
 *     compile, and the guard will call it consumed (the read through the base
 *     shape is real). Tightening that means `Omit`-ing the key from the
 *     non-skippable arm of the mapped type, which changes the public shape and
 *     rewrites the pins in firstRunCopy.test.ts — out of this slice's scope;
 *   - A FILE THAT DOES NOT PARSE IS A FINDING, AND ITS READS COUNT FOR NOTHING.
 *     This is the one limit that could point the other way, so it is fenced:
 *     TypeScript's error recovery turns `const zz = 'abc<newline>read.field'`
 *     into a real property-access node, so an unparseable file COULD hand the
 *     guard a read that no compiling program contains. Measured on `typescript
 *     6.0.3`: that input yields `kidsCopy.skipLabel` as a PropertyAccessExpression
 *     plus three parse diagnostics. The guard therefore refuses every read from a
 *     file with parse diagnostics AND reports the file, so a broken file can
 *     neither fake a read nor pass unseen.
 *
 * THE GUARD POLICES ITS OWN INSTRUMENT. It prints the shape count, the field
 * count, the consumer-file count and the skipped-const count it derived, and a
 * run that discovers ZERO declared fields is a FAIL, not a pass: an instrument
 * that sees nothing looks exactly like a clean repo. Its behavior is proven by
 * `copy-field-consumption-guard.check.mjs`, which seeds each case and requires
 * the right exit code.
 *
 * WHY THIS IS AN AST WALK, AND WHAT IT COST TO LEARN THAT. Three rounds of
 * patching a hand-rolled lexer found more lexer bugs each time: the machine
 * review found 16 defects, 11 of them parser-shaped; fix round 2 fixed 9 and
 * retained 2 BLOCKING ones, one of which was a REGRESSION against fix 1 —
 * an odd number of apostrophes in JSX text paired with a real literal's opening
 * quote, blanked through the literal, and then scanned its BODY as code, so a
 * word inside a string counted as consumption at exit 0; and a read inside a
 * template hole was erased by the very code that claimed to scan it. Both are
 * questions about TOKENS, which is the one thing a character scanner cannot
 * answer without becoming a parser. `typescript` is a devDependency of this repo
 * (`~6.0.2`, installed 6.0.3), so a `node scripts/guards/*.mjs` run and CI both
 * have it. This file is that walk. Measured, it DELETES 17 functions outright —
 * `blankNonCode`, `scan`,
 * `skipString`, `skipRegex`, `regexCanStart`, `stringEnd`, `blankRange`,
 * `matchBrace`, `braceEnd`, `literalKeys`, `shapesInTypeExpr`, `exportedConsts`,
 * `importedBindings`, `aliasesOf`, `patternLeaves`, `destructuredReads`,
 * `readSitesByField` — and closes those defect classes by construction rather
 * than by policing them.
 *
 * What it does NOT do is shrink the file by two thirds, which is what an earlier
 * version of this header predicted. Measured: 860 lines to 734 total, and 472
 * code lines to 382 with comments and blanks excluded — **−19% of the code, not
 * −66%**. The prediction counted the lexer it would delete and forgot to count
 * what replaces it: `parseFile`, `walk`, `keyText`, `isExported`,
 * `rootIdentifier`, `typeNodeNames`, `resolveShapes`, `moduleShapeSet`,
 * `consumerReads`, `patternReads`, and the parse-diagnostic fence. A header that
 * overstates its own diff is the same defect this guard exists to catch, so the
 * measured number stays. What the rewrite buys is not length: it is that the
 * questions the lexer had to GUESS — does this quote open a string, is this
 * identifier a read, is this pattern element a key or a binding — are no longer
 * questions. The seeds written against the lexer are KEPT, because they encode
 * the RULE, not the implementation; two changed in fix 3, for stated reasons —
 * seed 20's mutation now routes through `editFile` (L4, an invariant with one
 * hole is a hole) and seed 17 now asserts the skipped-const COUNT as well as the
 * line (L3).
 *
 * Deterministic: no LLM, no test run. Same repo, same answer.
 *
 * Usage:  node scripts/guards/copy-field-consumption-guard.mjs [repo-root]
 * Exit:   0 = clean, 1 = findings
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()

/** The copy modules this guard judges: `src/lib/` modules whose whole job is
 *  to hold the UI's words as data. `consts` names the exports this guard exists
 *  to judge — that list is what makes "the instrument stopped seeing the copy" a
 *  finding instead of a pass, without turning every OTHER exported const in the
 *  file into a build break (see the not-judged rule in `moduleShapeSet`). Adding
 *  a copy module, or a copy const, means adding it here — a visible act, unlike
 *  a field silently going unread. */
const COPY_MODULES = [
  {
    module: 'src/lib/firstRunCopy.ts',
    consts: ['FIRST_RUN_COPY', 'FIRST_RUN_NUDGE_COPY'],
  },
]

/**
 * Fields allowed to be unread, keyed by module, then by `Shape.field`, with the
 * reason as the value. The reason is not decoration: an entry whose value is
 * blank is a FINDING, because an unexplained allowance is how a lie gets a pass
 * on paper. An entry for a field that IS consumed is also a finding (a stale
 * allowance is a hole left open for the next field to fall into), and so is an
 * entry for a field the module does not declare (a typo'd allowance guards
 * nothing).
 */
const ALLOWLIST = {
  'src/lib/firstRunCopy.ts': {
    // (none — every declared field is read by the app)
  },
}

/** Generics whose FIRST type argument is a KEY, not a value: `Record<Id, Shape>`
 *  says the keys are ids and the values are shapes. Reading the key as a value
 *  made an interface used as a record key a judged copy shape, whose own fields
 *  were then reported as unread copy — a hard finding against code that has no
 *  copy field in it at all (fix 2, ocr #5). */
const KEY_POSITION_GENERICS = new Set(['Record', 'Partial', 'Required', 'Readonly'])

// ---------------------------------------------------------------------------
// Parsing. One source file, one truth: which span is a string, which identifier
// is an import alias, which pattern element is a key and which is a binding.
// ---------------------------------------------------------------------------

/** `parseDiagnostics` is the parser's own error list, populated by
 *  `createSourceFile` (it is not in the public .d.ts, which is why it is read
 *  defensively). It is what lets the guard refuse to trust a file it cannot
 *  parse instead of trusting whatever error recovery happened to produce. */
function parseFile(file) {
  const text = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const parseErrors = (sf.parseDiagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
  return { file, text, sf, parseErrors }
}

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (child) => {
    walk(child, visit)
  })
}

/** The text of a property/pattern key, or null when it is computed (an
 *  expression, so nothing is known about which field it names). */
function keyText(name) {
  if (name === undefined || ts.isComputedPropertyName(name)) return null
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return null
}

const isExported = (node) => (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

/** The innermost identifier of `a.b['c'].d`, looking through casts and
 *  parentheses. That identifier is the ROOT, and the root is what decides which
 *  shapes a read can satisfy — which is the whole F1 rule. */
function rootIdentifier(expr) {
  let node = expr
  for (;;) {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      node.kind === ts.SyntaxKind.TypeAssertionExpression
    ) {
      node = node.expression
      continue
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      node = node.expression
      continue
    }
    break
  }
  return ts.isIdentifier(node) ? node.text : null
}

const srcFiles = (dir) => {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...srcFiles(p))
    else if (/(^|\.)(ts|tsx)$/.test(entry.name)) out.push(p)
  }
  return out
}

/** No test file is a consumer — see exclusion 3 in the header. */
const isTestFile = (name) => /\.test\.[cm]?[jt]sx?$/.test(name)

const lineAt = (parsed, node) => parsed.sf.getLineAndCharacterOfPosition(node.getStart(parsed.sf)).line + 1

/** `isTypeOnly` is deprecated in TypeScript 6 in favour of `importKind`; read
 *  whichever this compiler offers so the guard does not depend on a deprecated
 *  field either way. */
const isTypeOnlyImport = (node) => (typeof node.importKind === 'string' ? node.importKind === 'type' : node.isTypeOnly === true)

// ---------------------------------------------------------------------------
// 1. What the copy module DECLARES — the shape set, and each shape's fields.
// ---------------------------------------------------------------------------

function moduleShapeSet(parsed) {
  const interfaces = new Map() // shape name -> own declared field names
  const aliasTypes = new Map() // alias name -> its TypeNode
  const consts = [] // exported consts: { name, annotation?, initializer? }

  for (const stmt of parsed.sf.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      interfaces.set(
        stmt.name.text,
        stmt.members.filter((m) => ts.isPropertySignature(m)).map((m) => keyText(m.name)).filter((k) => k !== null),
      )
      continue
    }
    if (ts.isTypeAliasDeclaration(stmt)) {
      if (!aliasTypes.has(stmt.name.text)) aliasTypes.set(stmt.name.text, stmt.type)
      continue
    }
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) consts.push({ name: d.name.text, annotation: d.type, initializer: d.initializer })
      }
    }
  }

  /** The shape NAMES a type expression mentions. A mapped type, a conditional
   *  type and an intersection are all just nodes to descend, so
   *  `[K in Id]: K extends S ? A : B` needs no special case — and the type
   *  PARAMETER (`K`) and the key (`Id`) are not shapes because they are not
   *  names this module declares as one. */
  function typeNodeNames(node, out = new Set()) {
    if (ts.isTypeReferenceNode(node)) {
      const name = ts.isIdentifier(node.typeName) ? node.typeName.text : null
      const args = node.typeArguments ?? []
      const first = name !== null && KEY_POSITION_GENERICS.has(name) && args.length > 1 ? 1 : 0
      for (let i = first; i < args.length; i++) typeNodeNames(args[i], out)
      if (name !== null && (interfaces.has(name) || aliasTypes.has(name))) out.add(name)
      return out
    }
    // `ts.forEachChild` ABORTS when the callback returns anything defined (it
    // treats a defined result as "this node is done, use it"), so the callback
    // must return nothing — a bare arrow expression that hands back the Set
    // silently cuts the descent after the first child.
    ts.forEachChild(node, (child) => {
      typeNodeNames(child, out)
    })
    return out
  }

  /** An alias resolves by descending ITS type node, recursively. Source order is
   *  irrelevant, so a const annotated with an alias declared further down the
   *  file resolves exactly like one declared above it (fix 2, item F: the
   *  previous pass resolved aliases in source order, so a forward reference
   *  became "names no shape" — a hard finding on well-formed code, plus every
   *  field of that const silently dropping out of the run). The `seen` set is
   *  the cycle guard: `type A = B; type B = A` must terminate. */
  function resolveShapes(names) {
    const shapes = new Set()
    const seen = new Set()
    const visit = (name) => {
      if (seen.has(name)) return
      seen.add(name)
      if (interfaces.has(name)) {
        shapes.add(name)
        return
      }
      const body = aliasTypes.get(name)
      if (body === undefined) return
      for (const inner of typeNodeNames(body)) visit(inner)
    }
    for (const name of names) visit(name)
    return shapes
  }

  const shapes = new Map() // shape name -> { fields, declaredBy }
  const constShapes = new Map() // exported const name -> Set of shape names
  const notJudged = [] // annotated exported consts this guard does not judge

  for (const { name: constName, annotation, initializer } of consts) {
    if (annotation !== undefined) {
      const named = resolveShapes(typeNodeNames(annotation))
      if (named.size > 0) {
        constShapes.set(constName, named)
        for (const s of named) {
          if (!shapes.has(s)) shapes.set(s, { fields: interfaces.get(s) ?? [], declaredBy: `interface ${s}` })
        }
        continue
      }
      // An annotated const that names no shape this module declares is NOT a
      // copy value as this guard understands one — a list of ids, a
      // `Record<string, string>`, a lookup table. It is REPORTED and skipped.
      //
      // It used to be a hard finding, and that was wrong in the direction the
      // batch cares about: an unrelated exported const added to a copy module
      // broke the build with no way to excuse it (the ALLOWLIST is keyed by
      // Shape.field, and an unjudged const contributes no shape to allowlist).
      // The blind case is still caught, precisely: COPY_MODULES names the consts
      // this guard expects to judge, and a named const that is not judged is a
      // finding. So the tripwire fires on "the copy const stopped being
      // recognised", not on "someone added a const".
      notJudged.push({
        name: constName,
        why: `its annotation (${annotation.getText(parsed.sf).slice(0, 60)}) names no shape this module declares`,
      })
      continue
    }
    if (initializer === undefined || !ts.isObjectLiteralExpression(initializer)) continue // not copy data
    // An unannotated literal: its own keys ARE the shape, and the const's name
    // is the binding the app reads it through.
    shapes.set(constName, {
      fields: initializer.properties
        .filter((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
        .map((p) => keyText(p.name))
        .filter((k) => k !== null),
      declaredBy: `${constName} (literal shape)`,
    })
    constShapes.set(constName, new Set([constName]))
  }

  return { shapes, constShapes, notJudged }
}

// ---------------------------------------------------------------------------
// 2. Who READs it.
// ---------------------------------------------------------------------------

/** Every read in one consumer file, grouped by field name and tagged with the
 *  shapes its root carries. */
function consumerReads(parsed, moduleBase, constShapes) {
  const roots = new Map() // local name -> Set of shapes it carries
  const unfollowedImports = []

  for (const stmt of parsed.sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const spec = stmt.moduleSpecifier.text
    if (path.basename(spec, path.extname(spec)) !== moduleBase) continue
    const clause = stmt.importClause
    if (clause === undefined || isTypeOnlyImport(clause)) continue // a type cannot be read from
    const named = clause.namedBindings
    if (named === undefined) {
      unfollowedImports.push(`default import of ${spec}`)
      continue
    }
    if (ts.isNamespaceImport(named)) {
      unfollowedImports.push(`namespace import ${named.name.text} from ${spec}`)
      continue
    }
    if (!ts.isNamedImports(named)) continue
    for (const s of named.elements) {
      if (isTypeOnlyImport(s)) continue
      // `import { FIRST_RUN_COPY as copy }`: the SHAPES are keyed by the
      // exported name, the READS go through the local one. Conflating them made
      // every read in such a file invisible (fix 2, item E).
      const exported = (s.propertyName ?? s.name).text
      const local = s.name.text
      if (constShapes.has(exported)) roots.set(local, constShapes.get(exported))
    }
  }

  // Local aliases: `const kidsCopy = FIRST_RUN_COPY.kids` inherits the shapes of
  // its root, because that is the shape the reads actually go through. Iterated
  // to a fixpoint so an alias of an alias works in any source order.
  const declarations = []
  walk(parsed.sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) declarations.push(n)
  })
  for (let pass = 0; pass <= declarations.length; pass++) {
    let changed = false
    for (const d of declarations) {
      const local = d.name.text
      if (roots.has(local) || d.initializer === undefined) continue
      const root = rootIdentifier(d.initializer)
      if (root !== null && roots.has(root) && root !== local) {
        roots.set(local, roots.get(root))
        changed = true
      }
    }
    if (!changed) break
  }

  const byField = new Map() // field name -> [{ shapes, node }]
  const push = (field, shapes, node) => {
    if (field === null || field === '') return
    if (!byField.has(field)) byField.set(field, [])
    byField.get(field).push({ shapes, node })
  }

  /** The keys a destructuring pattern reads. `propertyName` is the KEY (the
   *  field read); `name` is the BINDING, which is never a read. That
   *  distinction is what closes fix 3's L1: `const { [k]: title } =
   *  FIRST_RUN_COPY.kids` reads an unknown key and binds a local called `title`,
   *  and the scanner counted the local as the read — manufacturing consumption
   *  out of a variable name. */
  function patternReads(pattern, shapes) {
    for (const el of pattern.elements) {
      if (ts.isOmittedExpression(el)) continue
      if (el.propertyName !== undefined) {
        const field = keyText(el.propertyName)
        if (field !== null) push(field, shapes, el) // computed key -> nothing is known, so nothing counts
      } else if (ts.isIdentifier(el.name)) {
        push(el.name.text, shapes, el) // shorthand: the binding name IS the key
      }
      if (ts.isObjectBindingPattern(el.name)) patternReads(el.name, shapes)
    }
  }

  walk(parsed.sf, (n) => {
    if (ts.isPropertyAccessExpression(n)) {
      const root = rootIdentifier(n.expression)
      if (root !== null && roots.has(root)) push(n.name.text, roots.get(root), n)
      return
    }
    if (ts.isElementAccessExpression(n) && ts.isStringLiteral(n.argumentExpression)) {
      const root = rootIdentifier(n.expression)
      if (root !== null && roots.has(root)) push(n.argumentExpression.text, roots.get(root), n)
      return
    }
    if (ts.isVariableDeclaration(n) && n.initializer !== undefined && ts.isObjectBindingPattern(n.name)) {
      const root = rootIdentifier(n.initializer)
      if (root !== null && roots.has(root)) patternReads(n.name, roots.get(root))
    }
  })

  return { byField, roots, unfollowedImports }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Copy-field consumption guard — a copy field nobody reads is a lie waiting to be told')
console.log('==================================================================================')

const findings = []

for (const { module: moduleRel, consts: expectedConsts } of COPY_MODULES) {
  const modulePath = path.join(ROOT, moduleRel)
  let parsed
  try {
    parsed = parseFile(modulePath)
  } catch {
    findings.push(`${moduleRel}: the copy module this guard judges is GONE — a guard whose input vanished is not passing, it is blind`)
    continue
  }
  if (parsed.parseErrors.length > 0) {
    findings.push(
      `${moduleRel}: the copy module does not PARSE (${parsed.parseErrors.length} error(s): ` +
        `${parsed.parseErrors[0]}) — the guard takes no shape from a file it cannot parse`,
    )
    continue
  }

  const { shapes, constShapes, notJudged } = moduleShapeSet(parsed)

  // The precise tripwire. COPY_MODULES names the consts this guard exists to
  // judge; a named const that is no longer recognised is the instrument going
  // blind, and that IS a finding. A const that is NOT named and carries no
  // shape is skipped with a printed line instead — an unrelated exported const
  // must not break the build with no way to excuse it.
  for (const want of expectedConsts) {
    if (!constShapes.has(want)) {
      findings.push(
        `${moduleRel}: "${want}" is listed as a copy const this guard judges, but it is not recognised as an ` +
          'annotated (or unannotated) object-literal export — the instrument is blind on it, which is not a pass',
      )
    }
  }

  // The instrument's own tripwire: zero shapes or zero fields means the walk
  // stopped matching, which looks exactly like a clean module.
  if (shapes.size === 0) {
    findings.push(`${moduleRel}: the parser found NO declared copy shapes — the instrument is broken, not the module`)
    continue
  }
  const declared = [] // [{ shape, field, declaredBy }]
  for (const [shape, { fields, declaredBy }] of shapes) {
    for (const field of fields) declared.push({ shape, field, declaredBy })
  }
  if (declared.length === 0) {
    findings.push(`${moduleRel}: the parser found NO declared copy fields — the instrument is broken, not the module`)
    continue
  }

  const moduleBase = path.basename(moduleRel, '.ts')
  const consumers = []
  const unfollowed = []
  for (const file of srcFiles(path.join(ROOT, 'src'))) {
    if (file === modulePath || isTestFile(path.basename(file))) continue
    let fileParsed
    try {
      fileParsed = parseFile(file)
    } catch {
      continue
    }
    if (fileParsed.parseErrors.length > 0) {
      // A file that does not parse is NOT allowed to contribute reads: TypeScript
      // recovers from `const zz = 'abc<newline>read.field'` by producing a real
      // property-access node out of the string's second line, so an unparseable
      // file could hand this guard a read that no compiling program contains.
      findings.push(
        `${path.relative(ROOT, file)}: does not PARSE (${fileParsed.parseErrors.length} error(s): ` +
          `${fileParsed.parseErrors[0]}) — no read from it counts, and a file the guard cannot read is not a clean file`,
      )
      continue
    }
    const { byField, roots, unfollowedImports } = consumerReads(fileParsed, moduleBase, constShapes)
    if (roots.size === 0) {
      unfollowed.push(...unfollowedImports)
      continue
    }
    if (unfollowedImports.length > 0) unfollowed.push(...unfollowedImports)
    consumers.push({ file, parsed: fileParsed, byField })
  }

  const allow = ALLOWLIST[moduleRel] ?? {}
  console.log(`  module: ${moduleRel}`)
  console.log(`  judged copy consts: ${expectedConsts.join(', ')}`)
  console.log(`  declared shapes: ${shapes.size} (${[...shapes.keys()].join(', ')})`)
  console.log(`  declared fields: ${declared.length} (${declared.map((d) => `${d.shape}.${d.field}`).join(', ')})`)
  console.log(`  consumer files (import the module; no test file qualifies): ${consumers.length}`)
  // L3: a skipped const must be VISIBLE IN THE COUNTS, not just in a line that
  // scrolls past, and the line must say what to do about it.
  console.log(`  skipped consts: ${notJudged.length} (${notJudged.map((n) => n.name).join(', ') || 'none'})`)
  for (const note of notJudged) {
    console.log(`  skipped— exported const ${note.name}: ${note.why}`)
    console.log(
      '           do this: if it IS copy, give it a shape this module declares and add it to COPY_MODULES in this ' +
        'guard; if it is not copy, leave it — this line is a notice, and the count above is what keeps it honest',
    )
  }
  for (const note of [...new Set(unfollowed)]) {
    console.log(`  limit—— ${note}: not followed, so a read through it is missed (see KNOWN LIMITS in the header)`)
  }

  const seenAllow = new Set()
  for (const { shape, field, declaredBy } of declared) {
    const key = `${shape}.${field}`
    let hit = null
    for (const c of consumers) {
      const found = (c.byField.get(field) ?? []).find((s) => s.shapes.has(shape))
      if (found !== undefined) {
        hit = { file: path.relative(ROOT, c.file), line: lineAt(c.parsed, found.node) }
        break
      }
    }
    const listed = Object.prototype.hasOwnProperty.call(allow, key)
    const reason = listed ? String(allow[key] ?? '').trim() : ''
    if (listed) seenAllow.add(key)

    if (hit !== null) {
      console.log(`  read   — ${key} (${declaredBy}) at ${hit.file}:${hit.line}`)
      if (listed) {
        findings.push(
          `${moduleRel}: "${key}" is allowlisted as unread but IS read at ${hit.file}:${hit.line} — ` +
            'a stale allowance is a hole left open for the next unread field to fall into; delete the entry',
        )
      }
      continue
    }

    if (!listed) {
      findings.push(
        `${moduleRel}: "${key}" (${declaredBy}) is declared and valued but READ BY NOTHING in src — no ` +
          `binding that carries ${shape} reads "${field}" anywhere outside the module's own declaration, its ` +
          `data, and its tests. A read through a SIBLING shape's binding does not count. Render it, delete it, ` +
          'or allowlist it with a reason.',
      )
      continue
    }
    if (reason === '') {
      findings.push(
        `${moduleRel}: "${key}" is allowlisted as unread with NO REASON — an unexplained allowance is ` +
          'how an unread word gets a pass on paper',
      )
      continue
    }
    console.log(`  allowed— ${key} (${declaredBy}): ${reason}`)
  }

  for (const key of Object.keys(allow)) {
    if (!seenAllow.has(key)) {
      findings.push(
        `${moduleRel}: the allowlist names "${key}", which this module does not declare as a shape.field — ` +
          'a typo in an allowance guards nothing and hides nothing',
      )
    }
  }
}

console.log()
if (findings.length === 0) {
  console.log('PASS — every declared copy field is read by the app, or allowed with a reason.')
  process.exit(0)
}

console.log(`FAIL — ${findings.length} finding(s):`)
for (const f of findings) console.log(`  - ${f}`)
console.log()
console.log('These are deterministic findings, not opinions. Fix the cause; do not')
console.log('silence the guard. Either the app renders the word, or the field goes away,')
console.log('or the allowance says why in writing.')
process.exit(1)
