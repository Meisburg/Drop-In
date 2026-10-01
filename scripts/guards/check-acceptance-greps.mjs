#!/usr/bin/env node
/**
 * check-acceptance-greps — a zero-hit acceptance claim must say WHERE it looked.
 *
 * WHY THIS EXISTS. A planning document claimed a ZERO over an unscoped
 * directory: *"`rg "of 5" src/` → 0 hits."* **It was never zero.** The pattern
 * matched star ratings, an unrelated live-data note and a scanner fixture —
 * files the claim was not about. A bare directory cannot tell "the thing is
 * gone" apart from "unrelated hits exist", and the plan made the same mistake
 * twice in an hour (`of 5`, then `hasPhoto`, whose name is a *place's* photo
 * local in `src/lib/places.ts`). Each bad claim would have sent a builder to
 * rewrite code the claim never mentioned.
 *
 * THE TRAP THIS GUARD WAS DESIGNED AROUND — a naive parser fires on the
 * documentation of the rule it enforces. These documents QUOTE the bad greps in
 * order to condemn them: `plan.md:241` ("⚠️ A blanket `rg "of 5" src/` is NOT
 * the check"), `plan.md:302`, `.scratch/v28/briefs/slice-2.md:49`, and
 * `.scratch/v28/briefs/explore-r2-restructure.md:65`. "Extract every acceptance
 * grep line" fails on the brief that exists to explain the defect.
 *
 * THE TAG CONVENTION — this file is its definition. A **claim** is a line whose
 * text, after optional leading whitespace and an optional markdown LIST marker
 * (`-`, `*`, `+`, `N.`), begins with the token:
 *
 *     ACCEPTANCE-GREP:
 *
 * Everything else is prose. An UNTAGGED grep — including the quotations above —
 * is read as a quotation and never judged. The tag must START the line on
 * purpose: a mention of the convention inline (the brief for this guard says "a
 * line tag such as `ACCEPTANCE-GREP:`") is not a claim, and a line-leading token
 * is what makes a claim machine-distinguishable from a quotation of a bad one.
 * A `>` blockquote marker is deliberately NOT a list marker here: a quoted
 * EXAMPLE inside a blockquote would then read as a claim, which is the trap this
 * guard exists to avoid. (Leading whitespace alone IS allowed, because the live
 * claims in `plan.md` are indented.)
 *
 * The claim's rest is the command it claims to have run, backticked, and the
 * count it asserts, in the documents' existing shape:
 *
 *     ACCEPTANCE-GREP: `rg -n "of 5" src/pages/OnboardingPage.tsx ...` → **0 hits**.
 *
 * The command may wrap across lines; the claim ends at the first `… hits` token.
 *
 * THE TWO RULES, both deterministic:
 *
 *   1. THE SCOPE RULE (syntactic — the actual defect class). A zero-hit claim's
 *      scope must name a PATH, not a bare directory. Every scope argument must
 *      resolve to something other than a directory (a file, or a glob). `src/`
 *      and `e2e/` are the defect: they contain files the claim never mentions.
 *      This rule does not know whether the claim is *true*; it knows that a bare
 *      directory cannot make the claim checkable.
 *
 *   2. THE TRUTH RULE (execution). The tagged `rg` command is actually RUN in
 *      the tree, and the hits it reports must equal the count the claim asserts.
 *      A claim that says "0 hits" over a scope that holds hits is a false claim,
 *      not a style problem. The recorded fixtures both fail here today: a
 *      blanket `rg "of 5" src/` reports 12, and `rg "hasPhoto" src/` reports 3.
 *
 *      THE F1 EXEMPTION, stated deliberately (plan.md's slice-4 ruling, not a
 *      loophole): *"Comments that describe a removal are EXEMPT from zero-hit
 *      acceptance greps."* A comment that says "this used to be `hasPhoto`" is
 *      honest documentation, not a hit. So the guard never counts a COMMENT line
 *      as a hit — a line whose content, after the `path:line:` prefix, begins
 *      `//`, `/*`, `*` or `#`. This is what makes the live `hasPhoto` criterion
 *      (`rg -n "hasPhoto" src/App.tsx src/pages/OnboardingPage.tsx
 *      src/lib/avatarUrl.test.ts e2e/onboarding-resume.e2e.ts` → 0 hits) pass:
 *      it reports three hits and all three are comments that record the removal.
 *
 * THE STANDING RULE (structural, not aspirational). A guard that matches nothing
 * looks exactly like a clean repo — so this one FAILS when it parses ZERO tagged
 * claims. A tagged-claim parser with no claims to read is the single most likely
 * way this guard ships green and useless, and it is the case
 * `check-acceptance-greps.check.mjs` is required to seed. The run prints the
 * claim count and the untagged-quotation count it derived, so "it looked" is in
 * the output and not only in this comment.
 *
 * WHAT IT IS NOT.
 *   - It does not read prose. A grep the documents quote to condemn is invisible
 *     to it, which is the whole point of the tag. That boundary has one real
 *     false negative, named deliberately: a restatement that is not line-leading
 *     cannot carry the tag. It lives mid-line at
 *     `.scratch/v28/reports/slice-2-review.md:38-39` ("`middle name|middle
 *     initial` in `OnboardingPage.tsx` → **0 hits**"; it names no backticked
 *     `rg` command), and it is ALSO outside the corpus below, which reads only
 *     `plan.md` and `.scratch/v28/briefs/*.md`. The criterion it restates IS
 *     tagged — `.scratch/v28/briefs/slice-2.md:107` and `plan.md:306` — so the
 *     live claim is still judged.
 *   - It judges no claim that asserts a non-zero count beyond rule 2's arithmetic
 *     (the F1 comment exemption applies to every count, because a comment is
 *     never evidence about the code).
 *   - A malformed tagged claim is a FINDING, never a skip: a line tagged as a
 *     claim whose command or count the parser cannot read is a claim that cannot
 *     be checked, which looks exactly like a claim that holds.
 *   - It only runs `rg`. If `rg` is missing the guard FAILS loudly rather than
 *     reporting a pass it did not earn.
 *
 * Deterministic: no LLM, no test run. Same tree, same answer.
 *
 * Usage:  node scripts/guards/check-acceptance-greps.mjs [repo-root]
 * Exit:   0 = every tagged claim is checkable and true, 1 = findings
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()

const TAG = /^\s*(?:[-*+]\s+|\d+\.\s+)?ACCEPTANCE-GREP:/
// The claim shape the documents already use: `… → **0 hits**`. `must be` is
// accepted because one review doc states the same claim that way.
const COUNT_RE = /(?:→|\bmust be\b)\s*\*{0,2}(\d+)\*{0,2}\s*hits?\b/
const MAX_CLAIM_LINES = 6

const findings = []

/** The corpus: the planning documents whose acceptance claims this guard reads.
 *  Deliberately narrow — these are the two places a slice's acceptance criteria
 *  are written. */
function corpusFiles() {
  const out = []
  const plan = path.join(ROOT, 'plan.md')
  if (existsSync(plan)) out.push(plan)
  const briefs = path.join(ROOT, '.scratch', 'v28', 'briefs')
  if (existsSync(briefs) && statSync(briefs).isDirectory()) {
    for (const name of readdirSync(briefs).sort()) {
      if (name.endsWith('.md')) out.push(path.join(briefs, name))
    }
  }
  return out
}

/** Shell-ish tokenizer: double/single quotes group, everything else splits on
 *  whitespace. Enough for `rg [-flags] "<pattern>" <scope...>`. */
function tokenize(source) {
  const out = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m
  while ((m = re.exec(source)) !== null) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

/** A scope token that names a bare DIRECTORY on disk (no glob): the shape the
 *  defect class is about. A token with a glob char is a path pattern, not a bare
 *  directory, and a token that does not resolve to a directory is left to the
 *  truth rule. */
function isBareDirectory(token) {
  if (/[*?[\]{}]/.test(token)) return false
  const abs = path.resolve(ROOT, token)
  return existsSync(abs) && statSync(abs).isDirectory()
}

/** `rg` output line -> the line's CONTENT, so comment-ness is judged on the code
 *  and not on the path prefix. Forced with `-H -n` so a single-file scope still
 *  carries the `path:line:` prefix: `-H` adds the path, `-n` adds the line
 *  number, and `contentOf` needs BOTH to strip the prefix and judge the code. */
function contentOf(rgLine) {
  const m = /^(.+?):(\d+):(.*)$/.exec(rgLine)
  return m === null ? rgLine : m[3]
}

/** F1: a comment is documentation about a removal, never a hit. */
const isComment = (content) => /^\s*(\/\/|\/\*|\*|#)/.test(content)

const files = corpusFiles()
if (files.length === 0) {
  findings.push(
    `no corpus found under ${ROOT} — expected plan.md and/or .scratch/v28/briefs/*.md. ` +
      'A guard with no documents to read is not passing, it is blind.',
  )
}

let claimCount = 0
let quotationCount = 0
const verdicts = []

for (const file of files) {
  const rel = path.relative(ROOT, file)
  const lines = readFileSync(file, 'utf8').split('\n')
  const claimLines = new Set()

  for (let i = 0; i < lines.length; i++) {
    if (!TAG.test(lines[i])) continue
    claimCount += 1
    const where = `${rel}:${i + 1}`

    // The claim spans from the tag to the first `… hits` token (inclusive),
    // because the documents wrap the command and the count across lines.
    let end = -1
    for (let j = i; j < Math.min(i + MAX_CLAIM_LINES, lines.length); j++) {
      if (COUNT_RE.test(lines[j])) {
        end = j
        break
      }
    }
    if (end === -1) {
      findings.push(
        `${where} — a tagged claim with no \`→ N hits\` count within ${MAX_CLAIM_LINES} lines: ` +
          'a claim that cannot be read is not a claim that holds. Write `… → 0 hits`.',
      )
      continue
    }
    for (let j = i; j <= end; j++) claimLines.add(j)
    const span = lines.slice(i, end + 1).join('\n')

    const commandMatch = [...span.matchAll(/`([^`]*)`/g)].map((m) => m[1].trim()).find((c) => c.startsWith('rg '))
    if (commandMatch === undefined) {
      findings.push(
        `${where} — a tagged claim with no backticked \`rg …\` command: the claim names a count but ` +
          'no command, so there is nothing to check.',
      )
      continue
    }
    const asserted = Number(COUNT_RE.exec(span)[1])

    const tokens = tokenize(commandMatch)
    const [bin, ...rest] = tokens
    const flags = rest.filter((t) => t.startsWith('-'))
    const positional = rest.filter((t) => !t.startsWith('-'))
    const pattern = positional[0]
    const scopes = positional.slice(1)
    if (bin !== 'rg' || pattern === undefined || scopes.length === 0) {
      findings.push(
        `${where} — tagged command \`${commandMatch}\` is not an \`rg PATTERN SCOPE…\` claim the guard ` +
          'can read (needs a pattern and at least one scope).',
      )
      continue
    }

    const problems = []

    // RULE 1 — the scope must name a path, not a bare directory.
    if (asserted === 0) {
      const bareScopes = scopes.filter(isBareDirectory)
      if (bareScopes.length > 0) {
        problems.push(
          `scope ${bareScopes.map((s) => `\`${s}\``).join(', ')} is a bare directory — a zero over a ` +
            'directory cannot tell "the thing is gone" from "unrelated hits exist". Name the paths the ' +
            'claim is about.',
        )
      }
    }

    // RULE 2 — the claim is executed. F1: comment lines are exempt.
    let observed = null
    try {
      const out = execFileSync('rg', [...flags, '-H', '-n', '--', pattern, ...scopes], {
        cwd: ROOT,
        encoding: 'utf8',
      })
      observed = out.split('\n').filter(Boolean).filter((l) => !isComment(contentOf(l))).length
    } catch (e) {
      if (e.status === 1) {
        observed = 0 // rg exit 1 = no matches at all
      } else {
        problems.push(
          `the claim's grep could not run (rg exit ${e.status ?? '?'}): ` +
            `${String(e.stderr ?? e.message).split('\n')[0].trim()}`,
        )
      }
    }
    if (observed !== null && observed !== asserted) {
      const commented = (() => {
        try {
          const out = execFileSync('rg', [...flags, '-H', '-n', '--', pattern, ...scopes], { cwd: ROOT, encoding: 'utf8' })
          const all = out.split('\n').filter(Boolean)
          return all.length - all.filter((l) => !isComment(contentOf(l))).length
        } catch {
          return 0
        }
      })()
      problems.push(
        `claim asserts ${asserted} hit(s); the grep actually reports ${observed}` +
          (commented > 0 ? ` (plus ${commented} comment line(s), exempt per F1)` : '') +
          '. The claim is false.',
      )
    }

    if (problems.length === 0) {
      verdicts.push(`  ok   — ${where} \`${commandMatch}\` → ${asserted} hit(s), observed ${observed}.`)
    } else {
      for (const p of problems) findings.push(`${where} — ${p}`)
    }
  }

  // An untagged `rg` line is a QUOTATION — documentation about a bad claim, the
  // shape both recorded defects and every one of these documents use to condemn
  // the class. Counted so the boundary is visible in the run; never judged.
  for (let i = 0; i < lines.length; i++) {
    if (claimLines.has(i)) continue
    if (/`\s*rg\s/.test(lines[i]) || /\brg\s+-\w/.test(lines[i])) quotationCount += 1
  }
}

console.log(
  `check-acceptance-greps: ${files.length} planning document(s), ${claimCount} tagged claim(s), ` +
    `${quotationCount} untagged quotation line(s) ignored.`,
)
for (const v of verdicts) console.log(v)

// THE STANDING RULE, structural: a parser that reads zero claims cannot tell a
// clean corpus from a corpus it never understood.
if (claimCount === 0) {
  findings.push(
    'the guard parsed ZERO tagged `ACCEPTANCE-GREP:` claims — an instrument that matches nothing ' +
      'looks exactly like a clean repo. Tag the acceptance greps, or the guard is not running.',
  )
}

if (findings.length === 0) {
  console.log('clean — every tagged acceptance claim names a path and matches the tree.')
  process.exit(0)
}

console.error(`FINDINGS (acceptance-grep claims that are not checkable or not true):`)
for (const f of findings) console.error(`  - ${f}`)
console.error()
console.error('These are deterministic findings, not opinions. Fix the claim (name the path it is')
console.error('about) or fix the tree; do not drop the tag. If the rule is genuinely wrong, change')
console.error('this rule file and say why in the commit — that is a reviewable act.')
process.exit(1)
