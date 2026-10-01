#!/usr/bin/env node
/**
 * VACUOUS ABSENCE GUARD (V28 slice 7a).
 *
 * The first guard of the 7a pair. It catches the SPEC-side recurrence of the
 * V13 `toHaveCount(0)` class: an absence assertion whose target CANNOT render
 * on the route the spec is standing on — not because the feature is absent,
 * but because the feature lives on a DIFFERENT route. That assertion is
 * guaranteed true by construction (the element is structurally absent, not
 * absent as evidence), so it passes over the exact regressions it claims to
 * pin — the same "green over the wrong reason" failure mode the V13 guard
 * caught on the app side, mirrored onto the tests.
 *
 * THE RECURRENCE (the first finding this slice cuts): `e2e/
 * signup-zip-fallback.e2e.ts`'s first test stands on the FEED (`/`) after the
 * first-run CTA and asserted that the ZIP input's placeholder and the area-
 * card fallback note have count 0 — but both render ONLY inside the
 * onboarding area card (src/pages/OnboardingPage.tsx, reachable from
 * `/onboarding` and `/new`, never the feed). On `/` they can never exist, so
 * the two lines passed over a broken feed regardless of what the feed did.
 * The same class shows up in `e2e/zip-radius.e2e.ts` (the "e.g. 98107"
 * placeholder pinned to count 0 while standing on `/settings`).
 *
 * HOW IT DECIDES (deterministic, no LLM, no Playwright run):
 *   1. Build the ROUTE TABLE from src/App.tsx: every `<Route path element>`
 *      pair, each page component resolved to its source file through
 *      App.tsx's own imports (lazy routes through their `import('...')`
 *      specifier; components defined inside App.tsx fall back to App.tsx).
 *      Code-split routes wrap their page in `<Suspense fallback={...}>` with
 *      a JSX comment between `element={` and the wrapper (the `/browse`
 *      shape) — the derivation skips the comment and, for a wrapper element,
 *      resolves the wrapper's first child (the lazy component), not the
 *      wrapper itself.
 *   2. Build each route's REACHABLE FILE SET: the page file's transitive
 *      static-import closure, unioned with the shared chrome (App.tsx plus
 *      its non-page imports — providers, header, lightbox). Files under
 *      src/pages/ are excluded from the shared set, so a page's content is
 *      reachable only through its own route.
 *   3. For each literal `getByTestId('x')` / `getByPlaceholder('x')` target
 *      of a `toHaveCount(0)` in e2e/: find which src files contain the
 *      literal → the union of routes whose reachable set includes any of
 *      them = the routes where the target CAN render.
 *   4. Track each spec's CURRENT ROUTE per page subject through the
 *      route-establishing statements: `subject.goto('/x')`,
 *      `settleOnRoute(subject, '/x')`, `expect(subject).toHaveURL(...)`,
 *      `subject.waitForURL('/x')`, and
 *      `expect(new URL(subject.url()).pathname).toBe('/x')`. Module-level
 *      route constants (`const SETTINGS_ROUTE = '/settings'`) are resolved.
 *      Route knowledge is scoped to the ENCLOSING function/test block: a
 *      helper's `page` parameter is a different subject than the spec body's
 *      page, and cross-block attribution is exactly the false positive this
 *      guard must not make (the fixtures.ts RSVP-dismissal helper must never
 *      be judged as if it stood on some spec's `/login`).
 *   5. FINDING: the target's renderable-route set is non-empty and the
 *      current route is not in it — the absence is guaranteed by route
 *      structure, so the assertion can only be green by construction.
 *
 * WHAT IT IS NOT (the false-positive story, kept conservative on purpose):
 *   - It fires ONLY on plain-literal testids/placeholders feeding
 *     `toHaveCount(0)`. Role/text/label locators, `.count()` checks, and
 *     positive assertions are out of scope here (the sibling stale-locator
 *     guard owns the string-side story).
 *   - A target that can render on the current route is ALWAYS accepted —
 *     asserting "this conditional element is absent in state X" on the
 *     route that can render it is exactly the legitimate use the guard must
 *     never touch (the V13 guard's original contract, mirrored).
 *   - Over-approximation only: shared chrome (App.tsx imports) is reachable
 *     from every route, and an unresolvable component falls back to
 *     "reachable everywhere". A false NEGATIVE beats a false positive; the
 *     guard's job is to catch structurally-impossible assertions, not to
 *     prove every assertion is meaningful.
 *   - If a subject's route is never established IN THE SAME BLOCK, or the
 *     literal is not found anywhere in src, the site is reported as a NOTE
 *     (the latter is the stale-locator guard's turf) — never a finding.
 *   - CROSS-ROUTE ABSENCE IS NOT DISTINGUISHED FROM VACUOUS ABSENCE. A
 *     redirect/gate test that stands on route B, follows a redirect to route
 *     A, and asserts that a route-B-only element is now ABSENT is a
 *     legitimate test — but to this guard it looks exactly like a finding
 *     (route known = A, renderable routes = B, absence asserted on A).
 *     There is no tolerance mechanism for it today; the sanctioned response
 *     is the one this slice's own cuts used: cut the assertion and keep the
 *     intent in a comment, or move the assertion to a spec that stands on
 *     the route where the target renders.
 *   - ACTUAL COVERAGE IS THE PRINTED COUNT, NOT THE NOMINAL SCOPE. Of the
 *     suite's 289 toHaveCount(0) sites (as of the 7a fix round), this
 *     judges 25: the dominant escape is helper-driven navigation — the
 *     subject's route is established in a helper's block, not the spec's
 *     own, so the site is a "not judged" note. A 0-finding exit does NOT
 *     mean every absence pin was examined; read the notes and the count.
 *
 * Exit 0 when clean, 1 when findings are printed.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { escapeForRegExp } from '../../src/lib/escapeForRegExp.mjs'

const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()
const srcDir = path.join(repoRoot, 'src')
const e2eDir = path.join(repoRoot, 'e2e')

function fail(msg) {
  console.error(`vacuous-absence-guard: ${msg}`)
  process.exit(2)
}

if (!existsSync(srcDir) || !existsSync(e2eDir)) {
  fail(`neither src/ nor e2e/ under ${repoRoot} — run from the repo root (or pass it as an argument)`)
}

/** Every .ts/.tsx under dir (recursive), excluding tests. */
function listSrcFiles() {
  const out = []
  for (const entry of execSync(`find ${JSON.stringify(srcDir)} -name '*.ts' -o -name '*.tsx'`).toString().trim().split('\n')) {
    if (!entry) continue
    const name = path.basename(entry)
    if (name.endsWith('.test.ts') || name.endsWith('.test.tsx') || name.endsWith('.check.mjs')) continue
    out.push(path.relative(repoRoot, entry))
  }
  return out
}

const srcContent = new Map() // file (relative to repoRoot) -> content
for (const file of listSrcFiles()) srcContent.set(file, readFileSync(path.join(repoRoot, file), 'utf8'))
if (srcContent.size === 0) fail('no src files found — did the repo layout change?')

/**
 * Resolve a relative import specifier (as found in `from '...'` /
 * `import('...')`) against the importing file's directory.
 */
function resolveImport(fromFileRel, spec) {
  const base = path.resolve(repoRoot, path.dirname(fromFileRel), spec)
  for (const candidate of [
    path.relative(repoRoot, base + '.ts'),
    path.relative(repoRoot, base + '.tsx'),
    path.relative(repoRoot, path.join(base, 'index.ts')),
    path.relative(repoRoot, path.join(base, 'index.tsx')),
  ]) {
    if (srcContent.has(candidate)) return candidate
  }
  return null
}

/** Static + dynamic relative import edges of one src file. */
function importEdges(content) {
  const specs = []
  for (const m of content.matchAll(/from\s+["'](\.[^"']+)["']/g)) specs.push(m[1])
  for (const m of content.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g)) specs.push(m[1])
  return specs
}

/** Transitive static-import closure of a file (file included). */
function closure(seedFile, seen = new Set()) {
  if (seen.has(seedFile)) return seen
  seen.add(seedFile)
  for (const spec of importEdges(srcContent.get(seedFile) ?? '')) {
    const target = resolveImport(seedFile, spec)
    if (target) closure(target, seen)
  }
  return seen
}

/**
 * The ROUTE TABLE, parsed from src/App.tsx: [{ pattern, component, file }].
 * Element components resolve through App.tsx's own imports (the `from` clause
 * of `import { X } from './pages/X'`, or the lazy `import('...')`
 * specifier); components defined inside App.tsx (e.g. NewRoute) fall back to
 * App.tsx itself, which over-approximates their reachability — safe, since
 * the guard only ever flags assertions the route table proves impossible.
 */
const appRel = 'src/App.tsx'
if (!srcContent.has(appRel)) fail('src/App.tsx not found — the route table moved; re-derive this guard')
const appContent = srcContent.get(appRel)
/**
 * The first JSX child element of a wrapper tag (`<Suspense fallback={...}>`):
 * skip the wrapper's OPENING TAG with a brace/paren/bracket-depth scan — the
 * fallback is JSX inside an attribute, so its `>` never closes the opening
 * tag — then take the next element name. Deterministic for the shapes App.tsx
 * actually uses; returns null if the shape is unfamiliar (the route then
 * falls back to App.tsx reachability: conservative, never a false positive).
 */
function firstJsxChild(source, from) {
  let i = from
  let depth = 0
  while (i < source.length) {
    const c = source[i]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') {
      if (depth === 0) return null // run past the balanced region without a tag close
      depth--
    } else if (c === '>' && depth === 0) break
    i++
  }
  if (i >= source.length) return null
  const after = source.slice(i + 1)
  const m = after.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*<([A-Za-z][\w$]*)/)
  return m ? m[1] : null
}

const routeTable = []
for (const m of appContent.matchAll(/<Route\b/g)) {
  const start = m.index
  const next = appContent.indexOf('<Route', start + 1)
  const region = appContent.slice(start, next === -1 ? undefined : next)
  const pathM = region.match(/\bpath\s*=\s*["']([^"']+)["']/)
  if (!pathM) continue // <Route element={...}> — no own path; the parent owns it.
  const pattern = pathM[1]
  const elAt = region.indexOf('element=')
  if (elAt === -1) continue
  const afterEl = region.slice(elAt + 8)
  const compM = afterEl.match(/^\s*\{?\s*(?:\/\*[\s\S]*?\*\/\s*)?<([A-Za-z][\w$]*)/)
  if (!compM) continue // element shape unfamiliar — fall back, do not guess.
  let component = compM[1]
  // A code-split route's element is the WRAPPER (<Suspense>), not the page:
  // resolve the wrapper's first child (the lazy component) instead.
  if (component === 'Suspense' || component === 'ErrorBoundary') {
    const child = firstJsxChild(region, elAt + 8 + compM[0].length)
    if (child) component = child
  }
  let file = appRel
  const importRe = new RegExp(
    `import\\s+(?:\\{[^}]*\\b${component}\\b[^}]*\\}\\s*from|${component}\\s+from)\\s+["'](\\.[^"']+)["']`,
  )
  const importMatch = appContent.match(importRe)
  if (importMatch) {
    file = resolveImport(appRel, importMatch[1]) ?? appRel
  } else {
    const lazyRe = new RegExp(`${component}\\s*=\\s*lazy\\(\\s*\\(\\s*\\)\\s*=>\\s*import\\(\\s*["'](\\.[^"']+)["']`)
    const lazyMatch = appContent.match(lazyRe)
    if (lazyMatch) file = resolveImport(appRel, lazyMatch[1]) ?? appRel
  }
  routeTable.push({ pattern, component, file })
}
if (routeTable.length === 0) fail('no <Route> entries found in src/App.tsx — the route table changed shape; re-derive this guard')

/** Pattern -> matcher: `:param` segments match any non-slash token. */
function routeMatcher(pattern) {
  const re = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((seg) => (seg.startsWith(':') ? '[^/]+' : escapeForRegExp(seg)))
        .join('/') +
      '$',
  )
  return (pathname) => re.test(pathname.replace(/\/+$/, '') || '/')
}

/**
 * Reachable file set per route: page closure + shared chrome.
 *
 * Shared chrome: App.tsx plus its NON-PAGE imports (providers, header,
 * lightbox). Page files are excluded so a page's content is reachable only
 * through its own route — the one over-approximation the guard gets to make
 * is that this chrome renders on every route, which is true by the Outlet
 * structure.
 */
const shared = new Set()
for (const spec of importEdges(appContent)) {
  const target = resolveImport(appRel, spec)
  if (target && !target.startsWith('src/pages/')) shared.add(target)
}
shared.add(appRel)
const routeReachable = routeTable.map((route) => {
  const set = new Set(closure(route.file))
  for (const file of shared) set.add(file)
  set.add(appRel)
  return { ...route, files: set }
})

/** Which routes can render a literal (the src files that contain it). */
function renderableRoutes(literal) {
  const containing = [...srcContent.entries()].filter(([, content]) => content.includes(literal)).map(([file]) => file)
  if (containing.length === 0) return null // not in src at all — the stale-locator guard's turf.
  const routes = routeReachable.filter((r) => containing.some((file) => r.files.has(file))).map((r) => r.pattern)
  return routes.length > 0 ? routes : null // containment with no matching route = conservative skip
}

// ---------- spec side: route tracking + toHaveCount(0) extraction ----------

const SPEC_FILES = execSync(`find ${JSON.stringify(e2eDir)} -name '*.ts'`).toString().trim().split('\n').filter(Boolean)

const findings = []
const notes = []
let checked = 0

const SUBJ = '([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)'

/**
 * Enclosing function / test-callback blocks of a spec file.
 *
 * A "block header" is a function declaration, an arrow-function binding, or
 * a `test(...)` / `test.<modifier>(...)` call; its block opens at the
 * signature's first `{` (up to 12 lines ahead — multi-line signatures) and
 * closes at the matching brace, with string bodies stripped first so a `{`
 * inside copy cannot fool the count. `enclosing[line]` = index of the
 * innermost block containing that line (or null at module scope).
 */
function blockOf(lines) {
  const strip = (line) =>
    line
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/`(?:\\.|[^`\\])*`/g, '``')
  const HEADER =
    /^\s*(export\s+)?(async\s+)?function\b|^\s*(export\s+)?const\s+[A-Za-z_$][\w$]*\s*=\s*(async\s*)?\(|^\s*test\s*\(|^\s*test\.[A-Za-z]+\s*\(/
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    if (!HEADER.test(lines[i])) continue
    let open = -1
    for (let j = i; j < Math.min(i + 12, lines.length); j++) {
      if (strip(lines[j]).includes('{')) {
        open = j
        break
      }
    }
    if (open === -1) continue
    let depth = 0
    let close = lines.length - 1
    for (let j = open; j < lines.length; j++) {
      const s = strip(lines[j])
      depth += (s.match(/\{/g) ?? []).length - (s.match(/\}/g) ?? []).length
      if (depth === 0 && j > open) {
        close = j
        break
      }
    }
    blocks.push({ open, close })
  }
  const enclosing = new Array(lines.length).fill(null)
  for (let b = blocks.length - 1; b >= 0; b--) {
    for (let line = blocks[b].open; line <= blocks[b].close; line++) {
      if (enclosing[line] === null) enclosing[line] = b
    }
  }
  return enclosing
}

for (const file of SPEC_FILES) {
  const content = readFileSync(file, 'utf8')
  const rel = path.relative(repoRoot, file)
  const lines = content.split('\n')
  const lineAt = (index) => content.slice(0, index).split('\n').length
  const enclosing = blockOf(lines)

  // Module-level route constants (the `const SETTINGS_ROUTE = '/settings'` shape).
  const consts = new Map()
  for (const line of lines) {
    const cm = line.match(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["']([^"']+)["']/)
    if (cm) consts.set(cm[1], cm[2])
  }

  /**
   * Route-establishing statements, tagged with their line AND enclosing block.
   * Template-literal navigations (`goto(\`/playdate/${id}\`)`) are recorded as
   * UNKNOWN: the route's SHAPE is known but its value is not, so the subject's
   * route becomes uncertain from that point (a NOTE, never a finding).
   */
  const routeStatements = []
  const push = (subject, raw, index, known = true) => {
    const line = lineAt(index)
    routeStatements.push({ subject, raw, known, index, line, block: enclosing[line] })
  }
  for (const m of content.matchAll(new RegExp(`${SUBJ}\\s*\\.\\s*goto\\(\\s*["']([^"']+)["']`, 'g'))) push(m[1], m[2], m.index)
  for (const m of content.matchAll(new RegExp(`${SUBJ}\\s*\\.\\s*goto\\(\\s*\\u0060[^\\u0060]+\\u0060`, 'g'))) push(m[1], null, m.index, false)
  for (const m of content.matchAll(new RegExp(`settleOnRoute\\(\\s*${SUBJ}\\s*,\\s*\\u0060[^\\u0060]+\\u0060`, 'g'))) push(m[1], null, m.index, false)
  for (const m of content.matchAll(new RegExp(`${SUBJ}\\s*\\.\\s*waitForURL\\(\\s*["']([^"']+)["']`, 'g'))) {
    push(m[1], m[2], m.index)
  }
  for (const m of content.matchAll(new RegExp(`settleOnRoute\\(\\s*${SUBJ}\\s*,\\s*["']([^"']+)["']`, 'g'))) {
    push(m[1], m[2], m.index)
  }
  for (const m of content.matchAll(new RegExp(`expect\\(\\s*${SUBJ}\\s*\\)\\s*\\.\\s*toHaveURL\\(\\s*["']([^"']+)["']`, 'g'))) {
    push(m[1], m[2], m.index)
  }
  // `expect(page).toHaveURL(/\/onboarding/)` — pull the path token out of a
  // plain-slash regex (the shape the specs actually use).
  for (const m of content.matchAll(
    new RegExp(`expect\\(\\s*${SUBJ}\\s*\\)\\s*\\.\\s*toHaveURL\\(\\s*/(\\\\?/[a-zA-Z0-9_.:-]*)/`, 'g'),
  )) {
    push(m[1], m[2].replace(/\\?\/([a-zA-Z0-9_.:-]+)/g, '/$1'), m.index)
  }
  for (const m of content.matchAll(
    new RegExp(
      `expect\\(\\s*new URL\\(\\s*${SUBJ}\\s*\\.\\s*url\\(\\)\\s*\\)\\s*\\.\\s*pathname\\s*\\)\\s*\\.\\s*toBe\\(\\s*["']([^"']+)["']`,
      'g',
    ),
  )) {
    push(m[1], m[2], m.index)
  }
  // The same shapes through module constants: `page.goto(SETTINGS_ROUTE)`.
  for (const m of content.matchAll(new RegExp(`${SUBJ}\\s*\\.\\s*(?:goto|waitForURL)\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)`, 'g'))) {
    if (consts.has(m[2])) push(m[1], consts.get(m[2]), m.index)
  }
  for (const m of content.matchAll(new RegExp(`settleOnRoute\\(\\s*${SUBJ}\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)`, 'g'))) {
    if (consts.has(m[2])) push(m[1], consts.get(m[2]), m.index)
  }
  for (const m of content.matchAll(new RegExp(`expect\\(\\s*${SUBJ}\\s*\\)\\s*\\.\\s*toHaveURL\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)`, 'g'))) {
    if (consts.has(m[2])) push(m[1], consts.get(m[2]), m.index)
  }
  routeStatements.sort((a, b) => a.line - b.line)

  function normRoute(raw) {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const m = raw.match(/https?:\/\/[^/]+(\/[^?]*)?/)
      return (m[1] ?? '/').replace(/\/+$/, '') || '/'
    }
    return raw.replace(/\/+$/, '') || '/'
  }

  /**
   * The subject's route AT (block, line): the latest route statement in the
   * SAME block at or before the line. Cross-block statements (a helper's
   * `page` parameter vs. the spec's own page) are deliberately not
   * attributed — that is the conservative, no-false-positive direction: a
   * site whose route is not established in its own block is a NOTE, not a
   * finding.
   */
  function routeBefore(subject, line, block) {
    let current = null
    for (const st of routeStatements) {
      if (st.line > line) break
      if (st.subject === subject && st.block === block) current = st
    }
    return current
  }

  /**
   * A navigation-capable interaction (click / dblclick / press / tap) on the
   * subject AFTER the last route statement means the route may have moved to
   * a place we cannot see (the spec drove a CTA that navigated it). The route
   * is then UNCERTAIN — a note, never a finding. Reads (expects, fills) do
   * not invalidate; only interactions that can navigate do.
   */
  function interactionAfter(subject, fromIndex, toIndex) {
    const slice = content.slice(fromIndex, toIndex)
    return new RegExp(`${subject}\\b[\\s\\S]{0,800}?\\.(?:click|dblclick|press|tap)\\(`).test(slice)
  }

  /**
   * Every toHaveCount(0) on a plain-literal testid/placeholder whose subject
   * is a plain page identifier.
   */
  for (const m of content.matchAll(/toHaveCount\(\s*0\s*\)/g)) {
    // Scan back (up to ~300 chars) for the enclosing expect statement and
    // pull the LAST plain-subject locator target out of that window (the
    // multi-line `expect(\n  locator,\n  { exact: true },\n)` shape).
    const window = content.slice(Math.max(0, m.index - 300), m.index)
    const matches = [...window.matchAll(new RegExp(`${SUBJ}\\s*\\.\\s*(getByTestId|getByPlaceholder)\\(\\s*["']([^"']+)["']`, 'g'))]
    if (matches.length === 0) continue // subject is not a plain page identifier — out of scope.
    const hit = matches[matches.length - 1]
    const subject = hit[1]
    const locatorKind = hit[2]
    const literal = hit[3]
    const line = lineAt(m.index)
    const block = enclosing[line]

    const known = routeBefore(subject, line, block)
    if (!known) {
      notes.push(`${rel}:${line} — '${literal}': no route established for \`${subject}\` in its own block; not judged.`)
      continue
    }
    if (!known.known || interactionAfter(subject, known.index + 1, m.index)) {
      notes.push(
        `${rel}:${line} — '${literal}': route uncertain for \`${subject}\` (a navigation-capable interaction ` +
        `followed the last route statement); not judged.`,
      )
      continue
    }
    const currentRoute = normRoute(known.raw)
    const routes = renderableRoutes(literal)
    if (routes === null) {
      notes.push(`${rel}:${line} — '${literal}': not found anywhere in src/; the stale-locator guard owns this.`)
      continue
    }
    // The current route must match a table pattern to be known. A route that
    // matches NO pattern is a safety net, not a skip: print it so a route
    // that silently fell out of the derived table can never be judged (or
    // not judged) without a line in the output.
    const matchedPattern = routeTable.find((r) => routeMatcher(r.pattern)(currentRoute))
    if (!matchedPattern) {
      notes.push(
        `${rel}:${line} — '${literal}': route \`${currentRoute}\` matches no pattern in the derived route table; not judged. ` +
          `If that route exists in src/App.tsx, the table derivation is stale — re-derive the guard.`,
      )
      continue
    }
    checked += 1
    if (!routes.includes(matchedPattern.pattern)) {
      findings.push(
        `${rel}:${line} — \`expect(${subject}.${locatorKind}('${literal}')).toHaveCount(0)\` while on route \`${currentRoute}\`, ` +
          `but \`${literal}\` can only render on: ${routes.join(', ')}. ` +
          `Structurally absent, not absent as evidence — cut the line (its intent belongs in the file header).`,
      )
    }
  }
}

console.log(`vacuous-absence-guard: ${checked} route-checkable absence assertions examined; ${findings.length} finding(s).`)
for (const n of notes) console.log(`  note: ${n}`)
if (findings.length > 0) {
  console.error('FINDINGS (structurally vacuous absence assertions):')
  for (const f of findings) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('clean — no structurally vacuous absence assertions.')