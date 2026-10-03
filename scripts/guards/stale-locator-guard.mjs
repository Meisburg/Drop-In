#!/usr/bin/env node
/**
 * Stale-locator guard — an e2e locator must point at something the app still
 * renders.
 *
 * WHY THIS EXISTS. A renamed testid breaks a spec quietly: Playwright does
 * not error on an unknown `data-testid`, the locator just never resolves, and
 * the spec dies on a timeout with no hint that the string it asked for no
 * longer exists in the app. V28 slice 7a's first instance was real: the
 * toggle in the place directory was renamed from `places-see-map` to
 * `places-view-toggle` (the map-band strip it once anchored went away), and
 * `e2e/places-map-view.e2e.ts` still clicked the old name.
 *
 * The rule, one direction only (a false NEGATIVE is the acceptable error, a
 * false positive would get the guard deleted):
 *
 *   For every PLAIN-STRING literal in an e2e locator —
 *       page.getByTestId('x')
 *       page.getByPlaceholder('x')
 *       page.getByText('x')
 *       page.getByRole('role', { name: 'x' })
 *   the literal must still be PRESENT in the src/ tree, any of:
 *     1. a substring of some source file (covers data-testid="x",
 *        placeholder="x", and rendered text);
 *     2. the OUTPUT SHAPE of a src template literal (covers
 *        `` `parent-card-${slot}` `` and friends);
 *     3. TWO PARTS spliced at render time: a BOUNDED TOKEN from src spliced
 *        to a template's output. The comment heading renders as the JSX text
 *        `Comments` + ` (${state.comments.length})`, so `Comments (1)` is
 *        provable although no single string or template emits it.
 *
 *   The two-part rule is the loosest proof, so it is the one that is gated —
 *   the gate is measured against the live corpus, not a guess:
 *     - the plain half must be a BOUNDED TOKEN in src: it appears there as a
 *       whole token (both neighbors non-identifier), not as a short substring
 *       of a longer identifier. Measured: the pre-fix rule accepted `plac`
 *       as the plain half because it is a 4-char substring of `placePath` —
 *       it is never a token anywhere in src. `Comments` IS a token (the
 *       `<h2>` heading), and stays a proof.
 *     - the template half must be DISCRIMINATING: its statics pin at least
 *       one alphanumeric character, OR the template is a single-hole shape
 *       pinned on BOTH sides (the `` ` (${n})` `` count shape — measured: the
 *       only zero-alnum shape in the corpus that proves a live literal).
 *       Every multi-hole zero-alnum shape is a pure separator pattern —
 *       `` `${y}-${m}-${d}` `` yields statics `[-, -]` and matches ANY three
 *       hyphen-separated segments. That was exactly the false proof that let
 *       the dead testid `places-see-map` through the pre-fix guard (a
 *       reviewer proved it: the committed guard exited 0 against the
 *       pre-defect spec). The gate closes it: no split of `places-see-map`
 *       has a bounded-token plain half AND a discriminating template half.
 *
 *   PRESENT (literal or shape)  -> pass.
 *   MISSING + only NEGATIVE use -> pass. A `toHaveCount(0)` / `toBeHidden()`
 *                                 on a string the app no longer renders is
 *                                 the suite's documented "pin of removal"
 *                                 habit: the whole point of that assertion
 *                                 is that the string is gone. Flagging it
 *                                 would make the guard forbid its own
 *                                 repo's convention.
 *   MISSING + any POSITIVE use  -> FINDING. `click()`, `fill()`,
 *                                 `toBeVisible()`, `toHaveCount(n>0)`,
 *                                 `waitFor()`… all demand the string still
 *                                 exist. It does not. Fix the spec (or
 *                                 restore the string in src, if the rename
 *                                 was the mistake).
 *
 * WHAT IT IS NOT.
 *   - It only reads the REPO. It does not run Playwright and does not know
 *     what renders; "present in src" is a deliberate over-approximation of
 *     "can resolve". Any uncertainty lands on the pass side.
 *   - It checks PLAIN-STRING literals only. A locator built from a
 *     variable, a template literal, or `page.locator('[data-testid=…']')`
 *     CSS is not judged and is never silently passed as safe — it is
 *     simply outside the rule (reported as a note when it is the only
 *     evidence for a missing-looking literal, never as a finding).
 *   - String-literal escapes are honored when capturing a site: the spec
 *     writes `getByText('Kids you\'re bringing')`; the literal the app sees
 *     is `Kids you're bringing`, and that is what gets checked against src.
 *   - A template shape with NO static text (`` `${id}` `` -> `^.*$`) is
 *     degenerate and cannot prove presence: it is excluded, so a literal
 *     matches only a shape that actually pins some of the string down.
 *
 * Deterministic: no LLM, no test run. Same repo, same answer.
 *
 * Usage:  node scripts/guards/stale-locator-guard.mjs
 * Exit:   0 = clean, 1 = findings
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { escapeForRegExp } from '../../src/lib/escapeForRegExp.mjs'

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()
const SRC_DIR = path.join(ROOT, 'src')
const E2E_DIR = path.join(ROOT, 'e2e')

const findings = []
const notes = []

// ---------------------------------------------------------------------------
// 1. What the app still says — src substring set + template shapes.
// ---------------------------------------------------------------------------

const srcFiles = []
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      walk(path.join(dir, entry.name))
      continue
    }
    const name = entry.name
    if (!/(^|\.)(ts|tsx|js|jsx)$/.test(name)) continue
    if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) continue
    srcFiles.push(path.join(dir, name))
  }
}
if (readdirSync(SRC_DIR, { withFileTypes: true }).length > 0) walk(SRC_DIR)

const srcContents = new Map(srcFiles.map((f) => [f, readFileSync(f, 'utf8')]))

/** The static text a template literal pins down, with each `${…}` hole
 *  stripped. `parent-card-${slot}` -> `parent-card-`. A hole's closing brace
 *  belongs to the HOLE, not the static text — forgetting that makes every
 *  composed testid look missing (the first draft's bug). */
function templateStatics(template) {
  const statics = []
  const segs = template.split('${')
  if (segs[0] !== '') statics.push(segs[0])
  for (let i = 1; i < segs.length; i++) {
    const close = segs[i].indexOf('}')
    const rest = close === -1 ? segs[i] : segs[i].slice(close + 1)
    if (rest !== '') statics.push(rest)
  }
  return statics
}

/**
 * A missing literal is still PRESENT when it is the output of some src
 * template literal: every static segment must appear in the literal, in
 * order. This is the over-approximation by design — `parent-card-1`
 * matches `parent-card-${slot}` whether or not `slot` is ever `1`.
 */
const shapes = []
const gatedShapes = []
for (const [, content] of srcContents) {
  for (const match of content.matchAll(/`([^`\n]*)`/g)) {
    const template = match[1]
    if (!template.includes('${')) continue
    const statics = templateStatics(template)
    if (statics.length === 0) continue
    const holes = template.split('${').length - 1
    const alnum = (statics.join('').match(/[A-Za-z0-9]/g) ?? []).length
    // FULL-shape pool: a whole literal is one template's output only when the
    // statics pin down real text. `@${handle}` and `%${trimmed}%` pin just
    // punctuation and would match nearly every string — a full shape needs
    // several alphanumeric characters of static text.
    if (alnum >= 4) shapes.push({ statics })
    // TWO-PART pool (the gated one): the template half must be DISCRIMINATING.
    //  G1 — the statics pin at least one alphanumeric character: the static
    //       text itself carries the evidence.
    //  G2 — a zero-alnum template is usable only as a single hole pinned on
    //       BOTH sides (the ` (${n})` count shape). Measured on the live
    //       corpus: that is the only zero-alnum shape that proves a live
    //       literal; every multi-hole zero-alnum shape is a separator
    //       pattern (`${y}-${m}-${d}` -> [-, -] matches any three hyphen-
    //       separated segments — the false proof behind the `places-see-map`
    //       hole this guard was credited with and the committed version
    //       failed to close).
    const flankedSingle =
      holes === 1 && alnum === 0 && statics.length === 2 && statics[0] !== '' && statics[1] !== ''
    if (alnum >= 1 || flankedSingle) gatedShapes.push({ statics, flankedSingle })
  }
}

function matchesStatics(literal, statics) {
  // statics must occur in order inside the literal
  let pos = 0
  for (const segment of statics) {
    const found = literal.indexOf(segment, pos)
    if (found === -1) return false
    pos = found + segment.length
  }
  return true
}

function matchesAnyShape(literal, pool) {
  return pool.some(({ statics }) => matchesStatics(literal, statics))
}

/** Is this text a BOUNDED TOKEN in src? It must occur in some source file
 *  as a whole token — both neighbors (if any) non-identifier — not as a short
 *  substring of a longer identifier or string. `plac` fails everywhere (it
 *  only occurs inside `placePath`/`places`); `Comments` occurs as a token in
 *  the `<h2>` heading. Shorter than 4 characters it is too short to be
 *  evidence on its own. Memoized — the two-part rule asks per split. */
const boundedTokenCache = new Map()
function isBoundedToken(text) {
  const hit = boundedTokenCache.get(text)
  if (hit !== undefined) return hit
  if (text.length < 4) {
    boundedTokenCache.set(text, false)
    return false
  }
  const re = new RegExp(escapeForRegExp(text), 'g')
  let found = false
  for (const content of srcContents.values()) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(content)) !== null) {
      const before = m.index === 0 ? '' : content[m.index - 1]
      const after = content[m.index + m[0].length] ?? ''
      if (!/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after)) {
        found = true
        break
      }
    }
    if (found) break
  }
  boundedTokenCache.set(text, found)
  return found
}

/** The template half of a two-part match. `isSuffixHalf`: the template's
 *  output sits AFTER the plain token (the seam is the prefix's end); the
 *  mirror case sits before it (the seam is the suffix's start). */
function shapeHalf(text, isSuffixHalf) {
  return gatedShapes.some(({ statics, flankedSingle }) => {
    if (flankedSingle) {
      // a single-hole both-sides shape must match anchored at both ends:
      // ` (1)` starts with ` (` and ends with `)`. Un-anchored, ` (X)`-class
      // shapes would swallow `X(anything)Y`-class strings.
      return text.startsWith(statics[0]) && text.endsWith(statics[1])
    }
    if (isSuffixHalf) return matchesStatics(text, statics)
    return matchesStatics(text, statics) && text.endsWith(statics[statics.length - 1])
  })
}

function literalPresent(literal) {
  // 1. verbatim in src — the testid, placeholder, or rendered text is there.
  //    (No length gate: `Age` and `On` are real, short, and findable.)
  if ([...srcContents.values()].some((content) => content.includes(literal))) return true
  // 2. the output of one src template literal (`parent-card-${slot}`).
  if (matchesAnyShape(literal, shapes)) return true
  // 3. TWO PARTS: a bounded src token spliced to a discriminating template's
  //    output. The comment heading renders as the JSX text `Comments` +
  //    ` (${n})`, so `Comments (1)` is provable even though no single string
  //    or template emits it. Both halves are gated — see the header — because
  //    this is the proof that once let `places-see-map` through.
  for (let i = 1; i < literal.length; i++) {
    const prefix = literal.slice(0, i)
    const suffix = literal.slice(i)
    if (isBoundedToken(prefix) && shapeHalf(suffix, true)) return true
    if (isBoundedToken(suffix) && shapeHalf(prefix, false)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// 2. Where the specs point — the four locator forms, plain strings only.
// ---------------------------------------------------------------------------

/** Every plain-string literal in the four locator forms, per file. The
 *  string capture honors JS escapes (`'Kids you\'re bringing'`) and the
 *  literal is unescaped — the app sees the unescaped string, and that is
 *  what must still exist in src. */
const STR = String.raw`(["'])((?:\\.|(?!\1)[^\\])*)\1`
const unescapeLit = (raw) =>
  raw.replace(/\\(.)/gs, (_, ch) => ({ '\\': '\\', n: '\n', t: '\t', r: '\r' }[ch] ?? ch))
function locatorLiterals(source) {
  const sites = []
  const push = (re, usage) => {
    for (const match of source.matchAll(re)) {
      const literal = unescapeLit(match[2])
      const line = source.slice(0, match.index).split('\n').length
      sites.push({ literal, line, usage, match })
    }
  }
  push(new RegExp(`\\bgetByTestId\\(\\s*${STR}\\s*\\)`, 'g'), 'testid')
  push(new RegExp(`\\bgetByPlaceholder\\(\\s*${STR}\\s*\\)`, 'g'), 'placeholder')
  push(new RegExp(`\\bgetByText\\(\\s*${STR}\\s*[,)]`, 'g'), 'text')
  // getByRole('role', { name: 'x' }) — name only, so a `name` that is a
  // variable is out of the rule by construction.
  push(new RegExp(`\\bgetByRole\\(\\s*["'][a-z]+["']\\s*,\\s*\\{[^{}]*?\\bname:\\s*${STR}`, 'g'), 'role-name')
  return sites
}

/** Positive use of a locator: it must resolve. */
const POSITIVE = /\.(?:click|dblclick|fill|press|tap|hover|check|uncheck|check|setChecked|selectOption|clear|dispatchEvent|scrollIntoViewIfNeeded|waitFor|waitForSelector)\s*\(|toHaveText|toContainText|toHaveValue|toHaveAttribute|toBeAttached|toBeVisible|toBeEnabled|toBeDisabled|toBeFocused|toHaveCount\(\s*[1-9]/
/** Negative use: a pin of absence. `toBeHidden` also counts, because the
 *  repo's convention is to pin removed controls with it. */
const NEGATIVE = /toHaveCount\(\s*0\s*\)|toBeHidden\s*\(/

/**
 * Classify the use of a literal at its site. Inline sites read the text from
 * the end of the locator call to the statement end (same line). Sites that
 * assign to a variable (`const x = page.getByTestId('a')`) are followed
 * THROUGH THE FILE: a positive chain on that variable anywhere later in the
 * same file makes the site positive.
 */
function classifyUsage(source, site) {
  const callEnd = site.match.index + site.match[0].length
  // The statement the site sits in.
  let stmtEnd = source.indexOf(';', callEnd)
  if (stmtEnd === -1 || source.slice(callEnd, stmtEnd).includes('\n')) {
    // Multi-line statement: take the line the call ends on plus two.
    const lineStart = source.lastIndexOf('\n', callEnd) + 1
    stmtEnd = source.indexOf('\n', lineStart + 400)
    if (stmtEnd === -1) stmtEnd = source.length
  }
  const inline = source.slice(callEnd, stmtEnd)

  // A variable assignment: `const x = page.getByTestId('a')`. The subject
  // between `=` and the call (`page.`, `v1Thread.`) is optional chain text.
  const assign = new RegExp(
    '\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:[A-Za-z_$][\\w$]*\\s*\\.\\s*)*$',
  ).exec(source.slice(Math.max(0, site.match.index - 120), site.match.index).replace(/\n/g, ' '))
  if (assign !== null) {
    const variable = assign[1]
    const later = source.slice(callEnd)
    const varUse = new RegExp(`\\b${variable}\\b[\\s\\S]{0,120}?${POSITIVE.source}`, 'm')
    if (varUse.test(later)) return 'positive'
    const varNegative = new RegExp(`\\b${variable}\\b[\\s\\S]{0,120}?${NEGATIVE.source}`, 'm')
    if (varNegative.test(later)) return 'negative'
    // Variable exists but no chain was readable.
    return 'untracked'
  }

  if (NEGATIVE.test(inline)) return 'negative'
  if (POSITIVE.test(inline)) return 'positive'
  return 'untracked'
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Stale-locator guard — e2e locator literals vs what src still renders')
console.log('============================================================')

let specFiles = []
try {
  specFiles = readdirSync(E2E_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.mts'))
} catch {
  console.log('SKIP — e2e/ not found')
  process.exit(0)
}

let siteCount = 0
let missingCount = 0

for (const name of specFiles) {
  const file = path.join(E2E_DIR, name)
  const source = readFileSync(file, 'utf8')
  const relative = path.relative(ROOT, file)

  for (const site of locatorLiterals(source)) {
    siteCount++
    if (literalPresent(site.literal)) continue
    const usage = classifyUsage(source, site)
    if (usage === 'negative') {
      missingCount++
      notes.push(
        `${relative}:${site.line} \`${site.literal}\` is gone from src and the spec pins its ` +
          'absence (toHaveCount(0)/toBeHidden) — a pin of removal, not a bug',
      )
      continue
    }
    if (usage === 'positive') {
      missingCount++
      findings.push(
        `${relative}:${site.line} — \`${site.literal}\` no longer appears anywhere in src ` +
          '(no substring, no template shape) but the spec uses it positively ' +
          `(a ${site.usage} locator that must resolve). The string was renamed or removed ` +
          'in the app; point the spec at the new string or restore it.',
      )
      continue
    }
    // Untracked: the use of the variable was not readable, or the use is
    // ambiguous. Over-approximation: say so, never flag.
    missingCount++
    notes.push(
      `${relative}:${site.line} \`${site.literal}\` is not in src and its use could not be ` +
        'classified statically — not judged, not passed',
    )
  }
}

console.log(`  checked ${specFiles.length} spec file(s)`)
console.log(`  checked ${siteCount} plain-string locator site(s) against ${srcFiles.length} src file(s)`)
console.log(`  ${missingCount} literal(s) missing from src; ${findings.length} positively used`)
for (const note of notes) console.log(`  ok — ${note}`)

if (findings.length === 0) {
  console.log()
  console.log('PASS — every positively-used e2e locator literal still exists in src.')
  process.exit(0)
}

console.log()
console.log(`FAIL — ${findings.length} stale locator literal(s):`)
for (const f of findings) console.log(`  - ${f}`)
console.log()
console.log('These are deterministic findings, not opinions. Fix the cause; do not')
console.log('silence the guard. If the literal is genuinely back in src, the check above')
console.log('is the thing that is wrong — fix the rule, not the spec.')
process.exit(1)
