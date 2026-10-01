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
 *   somewhere in src/, or appear in ALLOWLIST below with a non-empty reason.
 *
 * WHAT COUNTS AS CONSUMPTION — and this is the whole point of the guard, so it
 * is stated in full. The trap is that THE DEFINITION SITE IS NOT A CONSUMER.
 *
 *   CONSUMED = a member access `.<field>` on an expression rooted at a name
 *   IMPORTED FROM THE COPY MODULE, in a src file that is neither the module nor
 *   its own test:
 *     FIRST_RUN_COPY.kids.skipLabel        — a direct chain
 *     kidsCopy.skipLabel                   — an alias (`const kidsCopy = FIRST_RUN_COPY.kids`)
 *     FIRST_RUN_COPY[card].title           — a computed hop inside the chain
 *
 *   NOT CONSUMED (each of these is a place the word is WRITTEN or ASSERTED,
 *   never a place it is USED — and only use is evidence the word is true):
 *     1. the field's own declaration (`skipLabel?: string`) — a shape
 *        statement. It says the field may exist; it cannot say anyone reads it;
 *     2. the value site in the module (`skipLabel: 'Skip for now'`) — writing
 *        data into the module is the definition, not a read of it;
 *     3. the module's OWN TEST (`firstRunCopy.test.ts`) — a test that reads a
 *        field proves the field is present and non-empty, NOT that the UI shows
 *        it. That is exactly how the defect above survived: the test pinned
 *        `skipLabel?.length > 0` while nothing rendered it. A test is not a
 *        consumer; if it were, every unread field could buy immunity by adding
 *        an assertion about itself;
 *     4. a bare `.field` in a file that does not import the module —
 *        `document.title` is not the copy module's `title`. The chain must be
 *        rooted at an imported binding (or a local alias of one), which is what
 *        stops the guard from passing a field off as read on an unrelated
 *        property with the same name;
 *     5. any of the above inside a COMMENT — a comment that names a field is
 *        documentation about it, not a read of it. Comments are blanked before
 *        scanning.
 *
 * KNOWN LIMITS — all of them false NEGATIVES, stated rather than hidden:
 *   - a copy value carried by something other than an imported binding or a
 *     direct `const X = BINDING.<key>` alias (a function parameter, a re-export,
 *     a JSX spread) is not followed;
 *   - a default import of a copy module is not followed (this repo uses named
 *     imports);
 *   - the keys of a nested object literal are judged through the interface the
 *     const is annotated with, not through their own names — so a `Record<Id,
 *     Shape>` contributes Shape's fields, not the card ids;
 *   - an excess key in a typed data literal is not this guard's business: tsc's
 *     excess-property check already rejects one;
 *   - the comment stripper treats `/` as a regex start only where an operator
 *     precedes it, and does not lex regex literals that contain quote
 *     characters (none in the files this guard reads).
 *
 * THE GUARD POLICES ITS OWN INSTRUMENT. It prints the field count and the
 * consumer-file count it derived, and a run that discovers ZERO declared
 * fields is a FAIL, not a pass: a parser that matches nothing looks exactly
 * like a clean repo. Its behavior is proven by
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
 * Fields allowed to be unread, keyed by module then field, with the reason as
 * the value. The reason is not decoration: an entry whose value is blank is a
 * FINDING, because an unexplained allowance is how a lie gets a pass on paper.
 * An entry for a field that IS consumed is also a finding (a stale allowance
 * is a hole left open for the next field to fall into), and so is an entry for
 * a field the module does not declare (a typo'd allowance guards nothing).
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
// 1. What the copy module DECLARES — the field set.
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

/** The declared fields of one copy module: interface fields, plus the keys of
 *  any exported const literal (or of the interface its `Record<…, Iface>`
 *  annotation names). */
function declaredFields(code) {
  const interfaces = new Map()
  for (const m of code.matchAll(/\binterface\s+([A-Za-z_$][\w$]*)[^{]*\{/g)) {
    const open = m.index + m[0].lastIndexOf('{')
    const close = braceEnd(code, open)
    if (close === -1) continue
    const fields = [...code.slice(open + 1, close).matchAll(/^\s*([A-Za-z_$][\w$]*)\??\s*:/gm)].map((x) => x[1])
    interfaces.set(m[1], fields)
  }

  const fields = new Map() // field -> where it is declared
  const unresolved = []
  const add = (name, where) => {
    if (!fields.has(name)) fields.set(name, where)
  }

  for (const [name, list] of interfaces) {
    for (const f of list) add(f, `interface ${name}`)
  }

  for (const m of code.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*([\s\S]*?)=\s*\{/g)) {
    const constName = m[1]
    const annotation = m[2]
    const open = m.index + m[0].length - 1
    const close = braceEnd(code, open)
    if (close === -1) continue
    const record = /Record<\s*[^,]+,\s*([A-Za-z_$][\w$]*)\s*>/.exec(annotation)
    if (record !== null) {
      const iface = interfaces.get(record[1])
      if (iface === undefined) {
        unresolved.push(`${constName}: Record<…, ${record[1]}> names no interface in this module`)
        continue
      }
      for (const f of iface) add(f, `${constName} : Record<…, ${record[1]}>`)
      continue
    }
    if (/[<>]/.test(annotation)) continue // a non-literal shape; not judged
    for (const k of literalKeys(code.slice(open + 1, close))) add(k, `${constName}`)
  }

  return { fields, unresolved }
}

// ---------------------------------------------------------------------------
// 2. Who READS it.
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

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/** Names this file gets from the copy module: named imports and `* as ns`. */
function importedBindings(code, moduleBase) {
  const bindings = []
  for (const m of code.matchAll(/\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (path.basename(m[2]) !== moduleBase) continue
    for (const spec of m[1].split(',')) {
      const name = spec.trim().split(/\s+as\s+/).pop()?.trim()
      if (name) bindings.push(name)
    }
  }
  for (const m of code.matchAll(/\bimport\s+\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"]/g)) {
    if (path.basename(m[2]) === moduleBase) bindings.push(m[1])
  }
  return bindings
}

/** `const kidsCopy = FIRST_RUN_COPY.kids` — a local alias of a copy value. The
 *  alias is a name the reads actually go through, so it is a root too. */
function aliasesOf(code, bindings) {
  const aliases = []
  const chain = String.raw`(?:\s*(?:\.\s*[A-Za-z_$][\w$]*|\[\s*[^\]]*\s*\]))*`
  for (const b of bindings) {
    const re = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${b}${chain}\\s*(?:[;\\n]|$)`,
      'g',
    )
    for (const m of code.matchAll(re)) {
      if (m[1] !== b) aliases.push(m[1])
    }
  }
  return aliases
}

/** Every read of `field` in this file: a member access on a chain rooted at a
 *  binding or an alias of one. */
function readsOf(code, roots, field) {
  const chain = String.raw`(?:\s*(?:\.\s*[A-Za-z_$][\w$]*|\[\s*[^\]]*\s*\]))*`
  const re = new RegExp(
    `\\b(?:${roots.join('|')})${chain}\\s*(?:\\?\\.|\\.)\\s*${field}(?![A-Za-z0-9_$])`,
    'g',
  )
  return [...code.matchAll(re)]
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Copy-field consumption guard — a copy field nobody reads is a lie waiting to be told')
console.log('==================================================================================')

const findings = []

for (const { module: moduleRel, ownTest } of COPY_MODULES) {
  const modulePath = path.join(ROOT, moduleRel)
  let raw
  try {
    raw = readFileSync(modulePath, 'utf8')
  } catch {
    findings.push(`${moduleRel}: the copy module this guard judges is GONE — a guard whose input vanished is not passing, it is blind`)
    continue
  }

  const code = blankNonCode(raw)
  const { fields, unresolved } = declaredFields(code)
  for (const note of unresolved) findings.push(`${moduleRel}: ${note}`)

  // The instrument's own tripwire: zero declared fields means the parser
  // stopped matching, which looks exactly like a clean module.
  if (fields.size === 0) {
    findings.push(`${moduleRel}: the parser found NO declared copy fields — the instrument is broken, not the module`)
    continue
  }

  const moduleBase = path.basename(moduleRel, '.ts')
  const excluded = new Set([path.join(ROOT, moduleRel), path.join(ROOT, ownTest)])
  const consumers = []
  for (const file of srcFiles(path.join(ROOT, 'src'))) {
    if (excluded.has(file)) continue
    const rawFile = readFileSync(file, 'utf8')
    // Imports are found in the comment-blanked view (their specifier is a
    // string literal); aliases and reads in the string-blanked view.
    const noComments = blankNonCode(rawFile, false)
    const bindings = importedBindings(noComments, moduleBase)
    if (bindings.length === 0) continue
    consumers.push({
      file,
      code: blankNonCode(noComments, true),
      roots: [...bindings, ...aliasesOf(noComments, bindings)],
    })
  }

  const allow = ALLOWLIST[moduleRel] ?? {}
  console.log(`  module: ${moduleRel}`)
  console.log(`  declared fields: ${fields.size} (${[...fields.keys()].join(', ')})`)
  console.log(`  consumer files (import the module, not its own test): ${consumers.length}`)

  for (const [field, where] of fields) {
    let hit = null
    for (const c of consumers) {
      const reads = readsOf(c.code, c.roots, field)
      if (reads.length > 0) {
        hit = { file: path.relative(ROOT, c.file), line: lineOf(readFileSync(c.file, 'utf8'), reads[0].index) }
        break
      }
    }
    const listed = Object.prototype.hasOwnProperty.call(allow, field)
    const reason = listed ? String(allow[field] ?? '').trim() : ''

    if (hit !== null) {
      console.log(`  read   — ${field} (${where}) at ${hit.file}:${hit.line}`)
      if (listed) {
        findings.push(
          `${moduleRel}: "${field}" is allowlisted as unread but IS read at ${hit.file}:${hit.line} — ` +
            'a stale allowance is a hole left open for the next unread field to fall into; delete the entry',
        )
      }
      continue
    }

    if (!listed) {
      findings.push(
        `${moduleRel}: "${field}" (${where}) is declared and valued but READ BY NOTHING in src — ` +
          `the only sites that mention it are its own declaration, the module's data, and the module's own ` +
          `test, and none of those is a consumer. Render it, delete it, or allowlist it with a reason.`,
      )
      continue
    }
    if (reason === '') {
      findings.push(
        `${moduleRel}: "${field}" is allowlisted as unread with NO REASON — an unexplained allowance is ` +
          'how an unread word gets a pass on paper',
      )
      continue
    }
    console.log(`  allowed— ${field} (${where}): ${reason}`)
  }

  for (const field of Object.keys(allow)) {
    if (!fields.has(field)) {
      findings.push(
        `${moduleRel}: the allowlist names "${field}", which this module does not declare — a typo in an ` +
          'allowance guards nothing and hides nothing',
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
