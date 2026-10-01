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
 *     5. any of the above inside a COMMENT — a comment that names a field is
 *        documentation about it, not a read of it. Comments are blanked before
 *        scanning.
 *
 * KNOWN LIMITS. Each one names the INPUT that reaches it, because a limit
 * without an input is a guess. All of them are false NEGATIVES (a missed read)
 * or false POSITIVES that need a human to allowlist — none of them can report a
 * word as read when it is not, which is the direction that matters.
 *
 *   - a copy value carried by something other than an imported binding, a
 *     direct `const X = BINDING.<key>` alias, or a destructuring of one (a
 *     function parameter, a re-export, a JSX spread) is not followed; reaching
 *     input: `renderCopy(FIRST_RUN_COPY.kids)` in a consumer;
 *   - a default import of a copy module is not followed; reaching input:
 *     `import copy from '../lib/firstRunCopy'` (this repo uses named imports);
 *   - a NAMESPACE import is not followed either — `import * as copy from
 *     '../lib/firstRunCopy'` then `copy.FIRST_RUN_COPY.kids.skipLabel` is a
 *     missed read, so the field comes out unread (the safe direction). The
 *     resolver used to collect `* as ns` bindings and then filter them out, so
 *     the branch was dead code while the comments promised support; the promise
 *     is gone and the limit is here instead;
 *   - a read straight off a `Record`-typed binding — `FIRST_RUN_COPY.title` —
 *     satisfies `FirstRunCardCopy.title` by ROOT attribution, because the guard
 *     attributes shapes per const, not per value. Reaching input: that line.
 *     It does not typecheck (`title` is not a key of the record), so it cannot
 *     exist in clean code; that is why it is a limit and not a defect. Same
 *     ruling as the reviewer's, and the same reason `const { title } =
 *     FIRST_RUN_COPY` (a destructure of the whole record) is not chased;
 *   - a destructured key counts as a read even if the bound variable is never
 *     used; reaching input: `const { skipLabel } = FIRST_RUN_COPY.kids` with the
 *     binding unused. `noUnusedLocals` is on in tsconfig.app.json, so that file
 *     does not compile — again unreachable in clean code;
 *   - two apostrophes in JSX TEXT on one line (`It's a dog's life`) still pair
 *     under the same-line string rule, and the span between them is blanked, so
 *     a read inside that span is missed. It can only hide, never manufacture:
 *     a real `'`/`"` literal always has its closing quote on its own line, so it
 *     is always blanked, which is what closes the lying direction;
 *   - a regex literal whose body contains quote characters is not lexed as a
 *     regex body; reaching input: `/it's a “dog”/` in a consumer file;
 *   - `extends` is not followed: a sub-shape contributes only its OWN declared
 *     fields, and the parent shape is judged on its own. Reaching input:
 *     `interface RichCardCopy extends FirstRunCardCopy { kicker: string }`;
 *   - an interface that no exported const carries is not judged (it is a type
 *     used elsewhere, not a copy value the app reads);
 *   - an excess key in a typed data literal is not this guard's business: tsc's
 *     excess-property check already rejects one. Note the asymmetry the fix-2
 *     review raised and this guard does NOT close: `FirstRunCardCopy.skipLabel`
 *     is optional, so a non-skippable entry CAN carry `skipLabel: 'Skip'` and
 *     compile, and the guard will call it consumed (the read through the base
 *     shape is real). Tightening that means `Omit`-ing the key from the
 *     non-skippable arm of the mapped type, which changes the public shape and
 *     rewrites the pins in firstRunCopy.test.ts — out of this slice's scope;
 *   - the shape resolver understands `interface`, `Record<Id, Shape>`,
 *     intersections of those, and a mapped type whose branches name interfaces
 *     (`[K in Id]: K extends S ? A : B`). A conditional type with a more
 *     involved body contributes no shapes, which surfaces as the const being
 *     skipped-with-a-printed-line, not as a silent pass. Key-position type
 *     arguments (`Record<Id, Shape>`'s `Id`) are blanked before scanning, so an
 *     interface used as a KEY is not mistaken for a copy shape; an interface in
 *     a value position that the const does not really carry (`Omit<Other, 'x'>`)
 *     is still taken as carried — over-approximating, which can only make a
 *     field look more read, never less;
 *   - a type alias's BODY is taken to the first `;` at brace depth 0 (or the
 *     brace-matched region if a `{` comes first). An alias written across two
 *     statements without a terminator, or a mapped type whose body outlives the
 *     400-char window, is read short. Reaching input: a ~40-line mapped type.
 *     This is the one place the guard is still pattern-matching rather than
 *     parsing — see the note at the bottom of this header.
 *
 * THE GUARD POLICES ITS OWN INSTRUMENT. It prints the shape count, the field
 * count and the consumer-file count it derived, and a run that discovers ZERO
 * declared fields is a FAIL, not a pass: a parser that matches nothing looks
 * exactly like a clean repo. Its behavior is proven by
 * `copy-field-consumption-guard.check.mjs`, which seeds each shape and requires
 * the right exit code.
 *
 * WHY THIS IS STILL A SCANNER, AND WHAT THAT COST. Two review rounds found
 * eleven defects that a syntax tree would not have had: an apostrophe in JSX
 * text read as a string opener, a string body read as code, an annotation regex
 * that crossed a statement boundary, an alias resolved before it was declared,
 * an import alias conflated with the imported name, a destructure pattern cut at
 * the first `}`. Every one of them is a question the parser was asked to answer
 * without a grammar. `typescript` is already a devDependency of this repo, and a
 * walk of `ts.createSourceFile` would delete `blankNonCode`, `stringEnd`,
 * `skipString`, `skipRegex`, `exportedConsts`, `importedBindings`, `aliasesOf`
 * and `destructuredReads` outright — roughly two thirds of this file — and close
 * the remaining limits by construction, because an AST knows which node is a
 * string, which identifier is an import alias, and which type a binding carries.
 * That rewrite is a slice of its own (it changes what the guard can see, so it
 * needs its own seeds); it is flagged here rather than attempted inside a fix
 * round.
 *
 * Deterministic: no LLM, no test run. Same repo, same answer.
 *
 * Usage:  node scripts/guards/copy-field-consumption-guard.mjs [repo-root]
 * Exit:   0 = clean, 1 = findings
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()

/** The copy modules this guard judges: `src/lib/` modules whose whole job is
 *  to hold the UI's words as data. `consts` names the exports this guard exists
 *  to judge — that list is what makes "the parser stopped seeing the copy" a
 *  finding instead of a pass, without turning every OTHER exported const in the
 *  file into a build break (see the not-judged rule in `declaredShapes`). Adding
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

// ---------------------------------------------------------------------------
// Comment stripping. A comment is not a consumer, so it is blanked (in place,
// preserving offsets and newlines) before anything is scanned.
// ---------------------------------------------------------------------------

/** Can a `/` here open a regex literal? Only after an operator or nothing at
 *  all — never after a value (`a / b`, `foo() / x`, `'s' / x`). Conservative
 *  by design: when unsure it is treated as division, so a regex body is read
 *  as code rather than swallowed. */
function regexCanStart(prev) {
  return prev === '' || '=(,:[{;!?&|+-*%<>~^'.includes(prev)
}

/**
 * THE RULE for whether the quote at `i` opens a string — and it is a rule, not
 * an allowlist:
 *
 *   A single- or double-quoted literal cannot contain a raw newline. So such a
 *   quote opens a string ONLY IF an unescaped matching quote closes it on the
 *   SAME LINE. A quote with no same-line partner is an apostrophe in JSX text
 *   (`Who's`) or a stray — not a string. A backtick always opens one, because
 *   a template may span lines.
 *
 * This replaced an allowlist of words after which a quote "counted" (`from`,
 * `return`, `typeof`, …). An allowlist is one keyword short, and three inputs
 * proved it: `as` (`x as 'a'`), `extends` (`<T extends 'a'>`) and tagged
 * templates (`` t`…` ``) all fell through as "not a string", so the string
 * BODY was scanned as code. Measured on the previous version:
 * `(FIRST_RUN_COPY.name.primaryLabel as 'kidsCopy.title')` made the guard
 * report `FirstRunCardCopy.title` as READ and exit 0 — a word inside a string
 * counted as consumption, which is exclusion 5 inverted and the guard lying.
 *
 * The direction matters, and the rule is chosen for it: mis-blanking a real
 * string only HIDES (a missed read, a false alarm); failing to blank a real
 * string MANUFACTURES a read (a false pass). The same-line rule can never fail
 * to blank a real `'`/`"` literal — such a literal always has its closing quote
 * on its own line — so the lying direction is closed by construction. What
 * remains is the hiding direction: two apostrophes in JSX text on one line
 * (`It's a dog's life`) still pair, and the span between them is blanked, which
 * can hide a read. That is a limit, listed below.
 *
 * Returns the index of the closing quote, -1 when this quote is not a string
 * opener, and -2 for a backtick (always a template; `skipString` finds its end).
 */
function stringEnd(chars, i, to) {
  const quote = chars[i]
  if (quote === '`') return -2
  const nl = chars.indexOf('\n', i + 1)
  const lineEnd = nl === -1 ? to : Math.min(nl, to)
  for (let j = i + 1; j < lineEnd; j++) {
    if (chars[j] === '\\') { j++; continue }
    if (chars[j] === quote) return j
  }
  return -1
}

function blankRange(chars, start, end) {
  for (let i = start; i < end && i < chars.length; i++) {
    if (chars[i] !== '\n') chars[i] = ' '
  }
}

/** Blanks comments in place (offsets preserved), and with `strings` also blanks
 *  string/template bodies. Two views are needed: import specifiers live in
 *  string literals, so import detection reads the comment-blanked text, while
 *  structural parsing and read-detection read the string-blanked text (a word
 *  inside a string is data, never a read). */
function blankNonCode(text, strings = true) {
  const chars = [...text]
  scan(chars, 0, chars.length, '', strings)
  return chars.join('')
}

function scan(chars, from, to, prev, strings = true) {
  let i = from
  let prevSig = prev
  while (i < to) {
    const ch = chars[i]
    const nxt = chars[i + 1]
    if (ch === '/' && nxt === '/') {
      const nl = chars.indexOf('\n', i)
      const end = nl === -1 ? to : Math.min(nl, to)
      blankRange(chars, i, end)
      i = end
      continue
    }
    if (ch === '/' && nxt === '*') {
      let j = i + 2
      while (j < to - 1 && !(chars[j] === '*' && chars[j + 1] === '/')) j++
      const end = Math.min(j + 2, to)
      blankRange(chars, i, end)
      i = end
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      if (stringEnd(chars, i, to) === -1) {
        // Not a string opener — an apostrophe inside JSX text. Treat it as an
        // ordinary character so the code after it is still scanned.
        i++
        prevSig = ch
        continue
      }
      i = skipString(chars, i, to, ch, strings)
      prevSig = ch
      continue
    }
    if (ch === '/' && regexCanStart(prevSig)) {
      i = skipRegex(chars, i, to)
      prevSig = '/'
      continue
    }
    if (!/\s/.test(ch)) prevSig = ch
    i++
  }
}

function skipString(chars, start, to, quote, strings) {
  const blank = (c, a, b) => {
    if (strings) blankRange(c, a, b)
  }
  let i = start + 1
  while (i < to) {
    const ch = chars[i]
    if (ch === '\\') {
      blank(chars, i, Math.min(i + 2, to))
      i += 2
      continue
    }
    if (ch === quote) {
      blank(chars, start, i + 1)
      return i + 1
    }
    if (quote === '`' && ch === '$' && chars[i + 1] === '{') {
      // A template hole is CODE: scan it (so a real read inside `${…}` counts)
      // and blank its delimiters.
      const close = matchBrace(chars, i + 1, to)
      blankRange(chars, i, i + 2)
      scan(chars, i + 2, close === -1 ? to : close, '', strings)
      if (close !== -1) blankRange(chars, close, close + 1)
      i = close === -1 ? to : close + 1
      continue
    }
    i++
  }
  blank(chars, start, to)
  return to
}

function skipRegex(chars, start, to) {
  let i = start + 1
  let inClass = false
  while (i < to) {
    const ch = chars[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '[') inClass = true
    else if (ch === ']') inClass = false
    else if (ch === '/' && !inClass) {
      i++
      while (i < to && /[gimsuyd]/.test(chars[i])) i++
      return i
    } else if (ch === '\n') return i
    i++
  }
  return to
}

function matchBrace(chars, open, to) {
  let depth = 0
  for (let i = open; i < to; i++) {
    if (chars[i] === '{') depth++
    else if (chars[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// ---------------------------------------------------------------------------
// 1. What the copy module DECLARES — the shape set, and each shape's fields.
// ---------------------------------------------------------------------------

function braceEnd(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Top-level `key:` entries of an object-literal body (comment/string-blanked,
 *  outer braces already stripped — so a top-level key sits at depth 0). */
function literalKeys(body) {
  const keys = []
  let depth = 0
  for (const m of body.matchAll(/([{}[\]()]|\b[A-Za-z_$][\w$]*\s*:)/g)) {
    const tok = m[1]
    if (tok.length === 1) {
      if ('{[('.includes(tok)) depth++
      else depth--
      continue
    }
    if (depth === 0) keys.push(tok.slice(0, -1))
  }
  return keys
}

/** The shapes a type expression names, restricted to interfaces this module
 *  declares: `Record<Id, Shape>`, an intersection of those, a bare interface,
 *  or a mapped type whose conditional branches name them. */
/** Generics whose FIRST type argument is a KEY, not a value: `Record<Id, Shape>`
 *  says the keys are ids and the values are shapes. `shapesInTypeExpr` scans
 *  every identifier in an expression, which made a key-position interface a
 *  judged shape — `Record<zzCardKey, FirstRunCardCopy>` added `zzCardKey` and
 *  its own fields to the copy set, i.e. a hard finding of "unread copy field"
 *  against code that has no copy field at all. Blanking the key position before
 *  scanning closes the direction that fires on clean code. The opposite
 *  direction (an interface named in a value position that the const does not
 *  really carry, e.g. `Omit<Other, 'x'>`) over-approximates — it can only make a
 *  field look MORE consumed, never less — and stays a stated limit. */
const KEY_POSITION_GENERIC = /\b(Record|Partial|Required|Readonly)\s*<\s*[A-Za-z_$][\w$]*\s*,/g

function shapesInTypeExpr(expr, interfaces, aliases) {
  const found = new Set()
  for (const m of expr.replace(KEY_POSITION_GENERIC, (_all, generic) => `${generic}< ,`).matchAll(/\b([A-Za-z_$][\w$]*)/g)) {
    const name = m[1]
    if (interfaces.has(name)) found.add(name)
    else if (aliases.has(name)) for (const s of aliases.get(name)) found.add(s)
  }
  return found
}

/** `export const NAME <annotation> = { … }`, found by scanning rather than by
 *  one unbounded regex. The annotation runs to the first `=` at depth 0, and
 *  the search gives up at the first `;` or `}` at depth 0, so a const that is
 *  NOT an object literal can never borrow the NEXT statement's literal.
 *
 *  The previous regex was `/\bexport\s+const\s+(\w+)\s*([\s\S]*?)=\s*\{/`, and
 *  for `export const A = ['x']` followed by `export const B = { … }` its first
 *  match bound A's NAME to B's LITERAL (annotation `= ['x']\nexport const B `),
 *  and because lastIndex landed inside B's body, B was never matched at all — a
 *  wrong shape attribution that generates false findings downstream. */
function exportedConsts(code) {
  const out = []
  for (const m of code.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)/g)) {
    let i = m.index + m[0].length
    let depth = 0
    let eq = -1
    for (; i < code.length; i++) {
      const ch = code[i]
      if ('{['.includes(ch) || ch === '(') depth++
      else if ('}])'.includes(ch)) {
        if (depth === 0) break // left the statement (a nested block, an array…)
        depth--
      } else if (depth === 0 && ch === ';') break
      else if (depth === 0 && ch === '=') {
        eq = i
        break
      }
    }
    if (eq === -1) continue
    let j = eq + 1
    while (j < code.length && /\s/.test(code[j])) j++
    if (code[j] !== '{') continue // not an object-literal const
    const close = braceEnd(code, j)
    if (close === -1) continue
    out.push({
      name: m[1],
      annotation: code.slice(m.index + m[0].length, eq),
      body: code.slice(j + 1, close),
    })
  }
  return out
}

/**
 * The declared shapes of one copy module, and which exported const carries
 * which. A shape is either an `interface` or the anonymous shape of an
 * unannotated exported object literal (named after the const, which is the
 * binding the app reads it through).
 */
function declaredShapes(code) {
  const interfaces = new Map() // name -> own field names
  for (const m of code.matchAll(/\binterface\s+([A-Za-z_$][\w$]*)[^{]*\{/g)) {
    const open = m.index + m[0].lastIndexOf('{')
    const close = braceEnd(code, open)
    if (close === -1) continue
    const fields = [...code.slice(open + 1, close).matchAll(/^\s*([A-Za-z_$][\w$]*)\??\s*:/gm)].map((x) => x[1])
    interfaces.set(m[1], fields)
  }

  // Type aliases, resolved to the shapes they name. This is what lets a mapped
  // type (`[K in Id]: K extends S ? A : B`) carry shapes without the const's
  // annotation restating which key gets which.
  //
  // Bodies are collected FIRST and then resolved to a fixpoint. Resolving in
  // source order made a forward reference (`const C: Later = {…}` above
  // `type Later = …`) resolve to the empty set, which read as "this const names
  // no shape" — a hard finding against perfectly well-formed code, caused by
  // our own resolution order. Iterating until stable costs nothing at this size
  // and removes the whole class.
  const aliasBodies = new Map()
  for (const m of code.matchAll(/\btype\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    const start = m.index + m[0].length
    const brace = code.indexOf('{', start)
    const semi = code.indexOf(';', start)
    let body
    if (brace !== -1 && brace - start < 400 && (semi === -1 || brace < semi)) {
      const close = braceEnd(code, brace)
      body = code.slice(start, close === -1 ? brace + 400 : close + 1)
    } else {
      body = code.slice(start, semi === -1 ? code.length : semi)
    }
    if (!aliasBodies.has(m[1])) aliasBodies.set(m[1], body)
  }
  const aliases = new Map()
  for (const name of aliasBodies.keys()) aliases.set(name, new Set())
  for (let pass = 0; pass <= aliasBodies.size; pass++) {
    let changed = false
    for (const [name, body] of aliasBodies) {
      const into = aliases.get(name)
      const before = into.size
      for (const s of shapesInTypeExpr(body, interfaces, aliases)) into.add(s)
      if (into.size !== before) changed = true
    }
    if (!changed) break
  }

  const shapes = new Map() // shape name -> { fields, declaredBy }
  const constShapes = new Map() // exported const name -> Set of shape names
  const notJudged = [] // exported object-literal consts this guard does not judge

  for (const { name: constName, annotation, body } of exportedConsts(code)) {
    const named = shapesInTypeExpr(annotation, interfaces, aliases)
    if (named.size > 0) {
      constShapes.set(constName, named)
      for (const s of named) {
        if (!shapes.has(s)) shapes.set(s, { fields: interfaces.get(s) ?? [], declaredBy: `interface ${s}` })
      }
      continue
    }
    if (/[^\s]/.test(annotation)) {
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
      // parseable", not on "someone added a const".
      notJudged.push(`${constName} (annotation ${annotation.trim().slice(0, 48)} names no shape this module declares)`)
      continue
    }
    // An unannotated literal: its own keys ARE the shape, and the const's name
    // is the binding the app reads it through.
    shapes.set(constName, { fields: literalKeys(body), declaredBy: `${constName} (literal shape)` })
    constShapes.set(constName, new Set([constName]))
  }

  return { shapes, constShapes, notJudged }
}

// ---------------------------------------------------------------------------
// 2. Who READs it.
// ---------------------------------------------------------------------------

function srcFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...srcFiles(p))
      continue
    }
    if (/(^|\.)(ts|tsx)$/.test(entry.name)) out.push(p)
  }
  return out
}

/** No test file is a consumer — see exclusion 3 in the header. */
const isTestFile = (name) => /\.test\.[cm]?[jt]sx?$/.test(name)

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/** Value names this file gets from the copy module, as `{ local, exported }`.
 *  `import { FIRST_RUN_COPY as copy }` yields `{ local: 'copy', exported:
 *  'FIRST_RUN_COPY' }` — the SHAPES are keyed by the exported name and the
 *  READS go through the local one. Keying one by the other (what the previous
 *  version did) made every read in an aliased-import file invisible: the file
 *  was filtered out as a non-consumer and its read fields were reported
 *  `READ BY NOTHING` — a false alarm on clean code.
 *
 *  A TYPE import contributes nothing (a type cannot be read from). A namespace
 *  import (`import * as copy`) is deliberately NOT followed; the previous
 *  version collected it and then filtered it out, which made the branch dead
 *  code while the comments promised support. It is a limit now, stated in both
 *  places. */
function importedBindings(code, moduleBase) {
  const bindings = []
  for (const m of code.matchAll(/\bimport\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (path.basename(m[3]) !== moduleBase) continue
    if (m[1] !== undefined) continue
    for (const raw of m[2].split(',')) {
      const spec = raw.trim()
      if (spec === '' || /^type\s/.test(spec)) continue
      const parts = spec.split(/\s+as\s+/)
      const exported = parts[0].trim()
      const local = parts[parts.length - 1].trim()
      if (exported !== '' && local !== '') bindings.push({ local, exported })
    }
  }
  return bindings
}

const CHAIN = String.raw`(?:\s*(?:\.\s*[A-Za-z_$][\w$]*|\[\s*[^\]]*\s*\]))*`

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Longest first, so `copyFull` is not matched as `copy`. */
const alternation = (names) => names.map(escapeRe).sort((a, b) => b.length - a.length).join('|')

/** `const kidsCopy = FIRST_RUN_COPY.kids` — a local alias of a copy value. It
 *  inherits the shapes of the binding it is rooted at, because that is the
 *  shape the reads actually go through. */
function aliasesOf(code, bindings) {
  const aliases = new Map() // alias -> shapes of its root
  for (const b of bindings.keys()) {
    const re = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escapeRe(b)}${CHAIN}\\s*(?:[;\\n]|$)`,
      'g',
    )
    for (const m of code.matchAll(re)) {
      if (m[1] !== b) aliases.set(m[1], bindings.get(b))
    }
  }
  return aliases
}

/** The leaf names of a destructuring pattern. `kids: { skipLabel }` binds
 *  `skipLabel` (`kids` is a hop, not a read); `title: t` binds `title`; `title`
 *  binds `title`. The previous version split the pattern text on `,` and stopped
 *  at the first `}`, so a nested pattern recorded the HOP name as a read and
 *  missed the field — a false alarm at the very style F3 was added to support. */
function patternLeaves(pattern) {
  const tokens = pattern.match(/[A-Za-z_$][\w$]*|[{}[\],:=]/g) ?? []
  const leaves = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (!/^[A-Za-z_$][\w$]*$/.test(tok)) continue
    const next = tokens[i + 1]
    if (next === '{' || next === '[') continue // a hop into a nested pattern
    if (next === ':') {
      const after = tokens[i + 2]
      if (after === '{' || after === '[') continue // `kids: { … }` — a hop
      leaves.push(tok) // `title: t` — the KEY is the field read
      if (after !== undefined && /^[A-Za-z_$][\w$]*$/.test(after)) i += 2 // skip the local alias
      continue
    }
    leaves.push(tok) // shorthand, or `x = default`
  }
  return leaves
}

/** `const { title, body } = FIRST_RUN_COPY.name` — the destructure IS the read
 *  of each key (without this, a destructured field is a false alarm). The
 *  pattern is brace-matched, not `[^}]*`, so nesting works. */
function destructuredReads(code, roots) {
  const sites = []
  const rooted = new RegExp(`^\\s*=\\s*(?:(${alternation([...roots.keys()])}))${CHAIN}`)
  for (const m of code.matchAll(/\b(?:const|let|var)\s*\{/g)) {
    const open = m.index + m[0].length - 1
    const close = matchBrace(code, open, code.length)
    if (close === -1) continue
    const hit = rooted.exec(code.slice(close + 1, close + 400))
    if (hit === null) continue
    for (const field of patternLeaves(code.slice(open + 1, close))) {
      sites.push({ field, index: m.index, shapes: roots.get(hit[1]) })
    }
  }
  return sites
}

/** Every read in this file, grouped by the field name it reads and tagged with
 *  the shapes its root carries. Computed ONCE per consumer — the previous
 *  version re-read the file from disk and re-scanned it per field × consumer. */
function readSitesByField(code, roots) {
  const byField = new Map()
  const push = (field, site) => {
    if (!byField.has(field)) byField.set(field, [])
    byField.get(field).push(site)
  }
  const re = new RegExp(
    `\\b(${alternation([...roots.keys()])})${CHAIN}\\s*(?:\\?\\.|\\.)\\s*([A-Za-z_$][\\w$]*)(?![A-Za-z0-9_$])`,
    'g',
  )
  for (const m of code.matchAll(re)) push(m[2], { index: m.index, shapes: roots.get(m[1]) })
  for (const s of destructuredReads(code, roots)) push(s.field, s)
  return byField
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Copy-field consumption guard — a copy field nobody reads is a lie waiting to be told')
console.log('==================================================================================')

const findings = []

for (const { module: moduleRel, consts: expectedConsts } of COPY_MODULES) {
  const modulePath = path.join(ROOT, moduleRel)
  let raw
  try {
    raw = readFileSync(modulePath, 'utf8')
  } catch {
    findings.push(`${moduleRel}: the copy module this guard judges is GONE — a guard whose input vanished is not passing, it is blind`)
    continue
  }

  const code = blankNonCode(raw)
  const { shapes, constShapes, notJudged } = declaredShapes(code)

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

  // The instrument's own tripwire: zero shapes or zero fields means the parser
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
  for (const file of srcFiles(path.join(ROOT, 'src'))) {
    if (file === modulePath || isTestFile(path.basename(file))) continue
    const rawFile = readFileSync(file, 'utf8')
    // Imports are found in the comment-blanked view (their specifier is a
    // string literal); aliases and reads in the string-blanked view.
    const noComments = blankNonCode(rawFile, false)
    const valueBindings = importedBindings(noComments, moduleBase).filter((b) => constShapes.has(b.exported))
    if (valueBindings.length === 0) continue
    const roots = new Map(valueBindings.map((b) => [b.local, constShapes.get(b.exported)]))
    for (const [alias, s] of aliasesOf(noComments, roots)) if (!roots.has(alias)) roots.set(alias, s)
    const code = blankNonCode(noComments, true)
    consumers.push({ file, raw: rawFile, sites: readSitesByField(code, roots) })
  }

  const allow = ALLOWLIST[moduleRel] ?? {}
  console.log(`  module: ${moduleRel}`)
  console.log(`  judged copy consts: ${expectedConsts.join(', ')}`)
  console.log(`  declared shapes: ${shapes.size} (${[...shapes.keys()].join(', ')})`)
  console.log(`  declared fields: ${declared.length} (${declared.map((d) => `${d.shape}.${d.field}`).join(', ')})`)
  console.log(`  consumer files (import the module; no test file qualifies): ${consumers.length}`)
  for (const note of notJudged) console.log(`  skipped— exported const ${note} — not judged, and saying so is the difference between a limit and a lie`)

  const seenAllow = new Set()
  for (const { shape, field, declaredBy } of declared) {
    const key = `${shape}.${field}`
    let hit = null
    for (const c of consumers) {
      const found = (c.sites.get(field) ?? []).find((s) => s.shapes.has(shape))
      if (found !== undefined) {
        hit = { file: path.relative(ROOT, c.file), line: lineOf(c.raw, found.index) }
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
