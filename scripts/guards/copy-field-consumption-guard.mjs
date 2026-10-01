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
 *
 *   NOT CONSUMED (each is a place the word is WRITTEN or ASSERTED, never a
 *   place it is USED — and only use is evidence the word is true):
 *     1. the field's own declaration (`skipLabel?: string`) — a shape
 *        statement. It says the field may exist; it cannot say anyone reads it;
 *     2. the value site in the module (`skipLabel: 'Skip for now'`) — writing
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
 * KNOWN LIMITS — all of them false NEGATIVES, stated rather than hidden:
 *   - a copy value carried by something other than an imported binding, a
 *     direct `const X = BINDING.<key>` alias, or a destructuring of one (a
 *     function parameter, a re-export, a JSX spread) is not followed;
 *   - a default import of a copy module is not followed (this repo uses named
 *     imports);
 *   - the keys of a nested object literal are judged through the shape the const
 *     is annotated with, not through their own names — so a `Record<Id, Shape>`
 *     or a mapped type over card ids contributes the SHAPES' fields, not the
 *     card ids;
 *   - an interface that no exported const carries is not judged (it is a type
 *     used elsewhere, not a copy value the app reads);
 *   - `extends` is not followed: a sub-shape contributes only its OWN declared
 *     fields, and the parent shape is judged on its own;
 *   - an excess key in a typed data literal is not this guard's business: tsc's
 *     excess-property check already rejects one;
 *   - the comment/string stripper is a scanner, not a parser: it treats `/` as
 *     a regex start only where an operator precedes it, and treats a quote as a
 *     string start only where an operator or a keyword such as `from` precedes
 *     it, so an apostrophe in JSX text (`Who's`) does not swallow the code
 *     after it. It does not lex regex literals that contain quote characters
 *     (none in the files this guard reads), and it does not understand JSX
 *     attribute values as anything but code.
 *   - the shape resolver understands `interface`, `Record<Id, Shape>`,
 *     intersections of those, and a mapped type whose branches name interfaces
 *     (`[K in Id]: K extends S ? A : B`). A conditional type with a more
 *     involved body is reported as unresolved rather than guessed at.
 *
 * THE GUARD POLICES ITS OWN INSTRUMENT. It prints the shape count, the field
 * count and the consumer-file count it derived, and a run that discovers ZERO
 * declared fields is a FAIL, not a pass: a parser that matches nothing looks
 * exactly like a clean repo. Its behavior is proven by
 * `copy-field-consumption-guard.check.mjs`, which seeds each shape and requires
 * the right exit code.
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
 *  to hold the UI's words as data. Adding a copy module means adding it here —
 *  a visible act, unlike a field silently going unread. */
const COPY_MODULES = [
  { module: 'src/lib/firstRunCopy.ts', ownTest: 'src/lib/firstRunCopy.test.ts' },
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

/** Words after which a quote really does open a string (`from './x'`,
 *  `return 'x'`). Without this, the previous significant character of a
 *  module's `from './firstRunCopy'` is a letter and the specifier would be
 *  read as code. */
const BEFORE_STRING_KEYWORDS = new Set([
  'from', 'return', 'typeof', 'instanceof', 'in', 'of', 'case', 'do', 'else',
  'await', 'yield', 'new', 'delete', 'void', 'default',
])

/** Does the quote at `i` open a string? A quote preceded by a word character
 *  that is not one of those keywords is JSX text or an apostrophe (`Who's`),
 *  not a string — mis-lexing that swallows the code between two apostrophes
 *  and hides real reads (measured: it hid `kidsCopy.skipLabel`). */
function stringCanStart(chars, i) {
  let j = i - 1
  while (j >= 0 && /\s/.test(chars[j])) j--
  if (j < 0) return true
  const prev = chars[j]
  if (!/[A-Za-z0-9_$]/.test(prev)) return true
  let end = j
  while (j >= 0 && /[A-Za-z0-9_$]/.test(chars[j])) j--
  return BEFORE_STRING_KEYWORDS.has(chars.slice(j + 1, end + 1).join(''))
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
    if ((ch === '"' || ch === "'" || ch === '`') && stringCanStart(chars, i)) {
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
function shapesInTypeExpr(expr, interfaces, aliases) {
  const found = new Set()
  for (const m of expr.matchAll(/\b([A-Za-z_$][\w$]*)/g)) {
    const name = m[1]
    if (interfaces.has(name)) found.add(name)
    else if (aliases.has(name)) for (const s of aliases.get(name)) found.add(s)
  }
  return found
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
  const aliases = new Map()
  for (const m of code.matchAll(/\btype\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    const start = m.index + m[0].length
    const brace = code.indexOf('{', start)
    const semi = code.indexOf(';', start)
    const nl = code.indexOf('\n', start)
    let body
    if (brace !== -1 && brace - start < 400 && (semi === -1 || brace < semi)) {
      const close = braceEnd(code, brace)
      body = code.slice(start, close === -1 ? brace + 400 : close + 1)
    } else {
      body = code.slice(start, nl === -1 ? code.length : nl)
    }
    aliases.set(m[1], shapesInTypeExpr(body, interfaces, aliases))
  }

  const shapes = new Map() // shape name -> { fields, declaredBy }
  const constShapes = new Map() // exported const name -> Set of shape names
  const unresolved = []

  for (const m of code.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*([\s\S]*?)=\s*\{/g)) {
    const constName = m[1]
    const annotation = m[2]
    const open = m.index + m[0].length - 1
    const close = braceEnd(code, open)
    if (close === -1) continue

    const named = shapesInTypeExpr(annotation, interfaces, aliases)
    if (named.size > 0) {
      constShapes.set(constName, named)
      for (const s of named) {
        if (!shapes.has(s)) shapes.set(s, { fields: interfaces.get(s) ?? [], declaredBy: `interface ${s}` })
      }
      continue
    }
    if (/[<>]/.test(annotation) || /:\s*[A-Za-z_$]/.test(annotation)) {
      unresolved.push(
        `${constName}: its annotation (${annotation.trim().slice(0, 60)}…) names no shape this module declares — ` +
          'its fields cannot be judged',
      )
      continue
    }
    // An unannotated literal: its own keys ARE the shape, and the const's name
    // is the binding the app reads it through.
    shapes.set(constName, { fields: literalKeys(code.slice(open + 1, close)), declaredBy: `${constName} (literal shape)` })
    constShapes.set(constName, new Set([constName]))
  }

  return { shapes, constShapes, unresolved }
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

/** Value names this file gets from the copy module: named imports and
 *  `* as ns`. A TYPE import contributes nothing — a type cannot be read from. */
function importedBindings(code, moduleBase) {
  const bindings = []
  for (const m of code.matchAll(/\bimport\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (path.basename(m[3]) !== moduleBase) continue
    if (m[1] !== undefined) continue
    for (const spec of m[2].split(',')) {
      const name = spec.trim().split(/\s+as\s+/).pop()?.trim()
      if (name) bindings.push(name)
    }
  }
  for (const m of code.matchAll(/\bimport\s+\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"]/g)) {
    if (path.basename(m[2]) === moduleBase) bindings.push(m[1])
  }
  return bindings
}

const CHAIN = String.raw`(?:\s*(?:\.\s*[A-Za-z_$][\w$]*|\[\s*[^\]]*\s*\]))*`

/** `const kidsCopy = FIRST_RUN_COPY.kids` — a local alias of a copy value. It
 *  inherits the shapes of the binding it is rooted at, because that is the
 *  shape the reads actually go through. */
function aliasesOf(code, bindings) {
  const aliases = new Map() // alias -> shapes of its root
  for (const b of bindings.keys()) {
    const re = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${b}${CHAIN}\\s*(?:[;\\n]|$)`,
      'g',
    )
    for (const m of code.matchAll(re)) {
      if (m[1] !== b) aliases.set(m[1], bindings.get(b))
    }
  }
  return aliases
}

/** `const { title, body } = FIRST_RUN_COPY.name` — the destructure IS the read
 *  of each key (F3: without this a destructured field is a false alarm). */
function destructuredReads(code, roots) {
  const sites = []
  for (const root of roots.keys()) {
    const re = new RegExp(
      `\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${root}${CHAIN}`,
      'g',
    )
    for (const m of code.matchAll(re)) {
      for (const part of m[1].split(',')) {
        const key = part.split(':')[0].split('=')[0].trim()
        if (/^[A-Za-z_$][\w$]*$/.test(key)) sites.push({ field: key, index: m.index, shapes: roots.get(root) })
      }
    }
  }
  return sites
}

/** Every member-access read of `field` rooted at one of `roots`. */
function readsOf(code, roots, field) {
  const sites = []
  for (const root of roots.keys()) {
    const re = new RegExp(
      `\\b${root}${CHAIN}\\s*(?:\\?\\.|\\.)\\s*${field}(?![A-Za-z0-9_$])`,
      'g',
    )
    for (const m of code.matchAll(re)) sites.push({ index: m.index, shapes: roots.get(root) })
  }
  return sites
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Copy-field consumption guard — a copy field nobody reads is a lie waiting to be told')
console.log('==================================================================================')

const findings = []

for (const { module: moduleRel } of COPY_MODULES) {
  const modulePath = path.join(ROOT, moduleRel)
  let raw
  try {
    raw = readFileSync(modulePath, 'utf8')
  } catch {
    findings.push(`${moduleRel}: the copy module this guard judges is GONE — a guard whose input vanished is not passing, it is blind`)
    continue
  }

  const code = blankNonCode(raw)
  const { shapes, constShapes, unresolved } = declaredShapes(code)
  for (const note of unresolved) findings.push(`${moduleRel}: ${note}`)

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
    const valueBindings = importedBindings(noComments, moduleBase).filter((b) => constShapes.has(b))
    if (valueBindings.length === 0) continue
    const roots = new Map(valueBindings.map((b) => [b, constShapes.get(b)]))
    for (const [alias, s] of aliasesOf(noComments, roots)) if (!roots.has(alias)) roots.set(alias, s)
    consumers.push({ file, code: blankNonCode(noComments, true), roots })
  }

  const allow = ALLOWLIST[moduleRel] ?? {}
  console.log(`  module: ${moduleRel}`)
  console.log(`  declared shapes: ${shapes.size} (${[...shapes.keys()].join(', ')})`)
  console.log(`  declared fields: ${declared.length} (${declared.map((d) => `${d.shape}.${d.field}`).join(', ')})`)
  console.log(`  consumer files (import the module; no test file qualifies): ${consumers.length}`)

  const seenAllow = new Set()
  for (const { shape, field, declaredBy } of declared) {
    const key = `${shape}.${field}`
    let hit = null
    for (const c of consumers) {
      const rawFile = readFileSync(c.file, 'utf8')
      const found =
        readsOf(c.code, c.roots, field).find((s) => s.shapes.has(shape)) ??
        destructuredReads(c.code, c.roots).find((s) => s.field === field && s.shapes.has(shape))
      if (found !== undefined) {
        hit = { file: path.relative(ROOT, c.file), line: lineOf(rawFile, found.index) }
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
