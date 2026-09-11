/**
 * Design detector (V6) — Impeccable's deterministic anti-pattern rules, run
 * against this project. No API key, no LLM: 61 rules over the source tree and
 * the rendered pages, seconds to run.
 *
 *   node scripts/design-detect.mjs [baseURL]
 *
 * Why a second gate next to mobile-audit.mjs: the audit enforces the
 * measurable floor (tap targets, font sizes, contrast, overflow) but knows
 * nothing about design tells. The detector is the other half — it is what
 * flagged the indigo accent as the single most recognizable "AI-generated UI"
 * marker in this app.
 *
 * Resolution order for the CLI: the local checkout, then npx. Keeping the local
 * one first means the gate works offline on this machine; npx keeps it working
 * anywhere else.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const LOCAL_CLI = process.env.IMPECCABLE_CLI ?? '/home/jmeisburg/Projects/skills/impeccable-main/cli/bin/cli.js'

/**
 * Findings we have SEEN and consciously accepted. Without this the gate is
 * permanently red — and a check that can never pass is a check nobody reads.
 * Every entry needs a reason, so accepting one stays a decision rather than a
 * shrug.
 */
const ACCEPTED = [
  {
    rule: 'ai-color-palette',
    reason:
      'Indigo is this app\'s brand: it is in the app icon, the splash, the manifest theme colour and the wordmark. The detector is right that purple/indigo is the most common AI tell, and the design jury independently ruled to keep it (teal would collide with the green "going" status). Changing it is a brand change, not a CSS edit — tracked as a product decision, not a code defect.',
  },
]

function runDetector(target) {
  const args = ['detect', target]
  // The detector EXITS NON-ZERO when it finds something — that is the point of
  // it — so a plain execFileSync throws and swallows the report. Read stdout off
  // the thrown error instead: findings arrive on stdout, not stderr.
  // Both streams, always: the detector may exit non-zero when it finds
  // something (a plain execFileSync would throw and swallow the report), and it
  // writes the findings in whichever stream it likes. 2>&1 removes the
  // question.
  const command = existsSync(LOCAL_CLI)
    ? `node "${LOCAL_CLI}" ${args.join(' ')}`
    : `npx -y impeccable ${args.join(' ')}`
  const output = (() => {
    try {
      return execSync(`${command} 2>&1`, { encoding: 'utf8' })
    } catch (err) {
      if (typeof err.stdout === 'string') return err.stdout
      throw err
    }
  })()
  const findings = []
  let current = null
  for (const line of output.split('\n')) {
    // The rule tag is NOT at the start of the line — findings read
    // "  line 174: [ai-color-palette] text-indigo-600 on heading".
    const head = line.match(/\[([a-z0-9-]+)\]\s*(.+)$/)
    if (head !== null) {
      if (current !== null) findings.push(current)
      current = { rule: head[1], detail: head[2] }
    }
  }
  if (current !== null) findings.push(current)
  return findings
}

const targets = [process.argv[3] ?? 'src', BASE]
let accepted = 0
const unexpected = []

for (const target of targets) {
  for (const finding of runDetector(target)) {
    const known = ACCEPTED.find((entry) => entry.rule === finding.rule)
    if (known !== undefined) {
      accepted += 1
      console.log(`accepted  [${finding.rule}] ${finding.detail} — ${known.reason.slice(0, 70)}…`)
    } else {
      unexpected.push(`${target}: [${finding.rule}] ${finding.detail}`)
    }
  }
}

if (unexpected.length > 0) {
  console.error('\nUnaccepted design findings:')
  for (const line of unexpected) console.error('  ' + line)
  process.exit(1)
}
console.log(`\nNo unaccepted design findings (${accepted} known, accepted).`)
