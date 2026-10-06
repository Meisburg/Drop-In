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
      'RESOLVED 2026-09-11 — the human made the brand change this entry was waiting on. Indigo is gone: the palette is now terracotta (#e8552f brand hue / #c8411c for AA-safe text and actions) on a warm off-white base, with park green, gold and sky as the status tints (V7, see the colour block in src/index.css). The old reason read "changing it is a brand change, not a CSS edit — tracked as a product decision", which is exactly how it was resolved. The entry stays because the rule fires on the SHAPE of a palette — one committed saturated accent — and committing to an accent is deliberate here: a timid, evenly-spread palette is the thing that made this app read as SaaS-utility rather than as a family app. If the detector now flags the terracotta, that is the accepted trade, not a defect.',
  },
  {
    rule: 'broken-image',
    file: 'ImageLightbox.tsx',
    reason:
      'FALSE POSITIVE — the detector read a COMMENT. The match is the comment "…and the arrows cannot disagree with the <img>", and there is no <img> element there at all. Accepted by FILE rather than by rule, because accepting "broken-image" outright would also silence a genuinely broken image — that distinction is the whole reason the narrow form exists.',
  },
  {
    rule: 'broken-image',
    file: 'ProfilePage.tsx',
    reason:
      'FALSE POSITIVE — a comment DESCRIBING a defect that was fixed. The text is "a row holding \'\' rendered an `<img src=\\"\\">` instead of the \\"Add a photo\\" label below", written to explain why `lib/avatarUrl.ts` exists. The detector read the post-mortem as the crime.',
  },
  {
    rule: 'gray-on-color',
    file: 'LocationModal.tsx',
    reason:
      'DELIBERATE, and the contrast is fine — slate-700 ink on an indigo-50 ground (dark on light; the rule targets low-contrast gray ON a saturated ground, which this is not). It is the location modal\'s "sign up to join in" prompt. The open question is PALETTE, not contrast: the brand moved to terracotta in V7 and this block kept an indigo tint. That belongs to a palette review with the design tool, not to a per-line exclusion — and the file is another session\'s in-flight work, so an agent editing it now would race them.',
  },
  // ⚠️ THE COLOUR AND TYPE-RAMP ACCEPTANCES ARE KEYED BY VALUE, ONE ENTRY EACH,
  // and that is the point of the transcription below rather than a single
  // rule-wide entry. A rule-wide acceptance would silently excuse the NEXT
  // off-palette colour somebody adds; these excuse exactly the values verified by
  // hand on 2026-10-05. Adding a colour means adding an entry WITH A REASON, which
  // is the decision this list exists to force.
  {
    rule: 'design-system-color',
    detail: '#dc2626',
    reason:
      'DELIBERATE — Tailwind red-600, the error / "you are here" Leaflet circle. A concrete colour is required in an SVG path; a CSS variable is not available there. (Two of these matches are also COMMENTS: the e2e test that pins the red marker.)',
  },
  {
    rule: 'design-system-color',
    detail: 'rgba(15, 23, 42, 0.25)',
    reason: 'DELIBERATE — the first-run tour veil, a boxShadow overlay. Not token-able.',
  },
  {
    rule: 'design-system-color',
    detail: 'rgba(15, 23, 42, 0.62)',
    reason:
      'DELIBERATE — the crop dialog dim, the same boxShadow-overlay technique as the tour veil.',
  },
  {
    rule: 'design-system-color',
    detail: '#241f1c',
    reason: 'DELIBERATE — the dark-mode card plate, defined with the dark palette in src/index.css.',
  },
  {
    rule: 'design-system-color',
    detail: '#64748b',
    reason:
      "DELIBERATE — Tailwind slate-500, secondary ink. The repo's contract is that COMPONENTS use the @theme tokens; this is the value such a token resolves to, which the detector cannot see through.",
  },
  {
    rule: 'design-system-color',
    detail: '#0f172a',
    reason: 'DELIBERATE — Tailwind slate-900, primary ink. Same reasoning as slate-500 above.',
  },
  {
    rule: 'design-system-color',
    detail: '#4f46e5',
    reason:
      'DELIBERATE — the map marker indigo, now in ONE place (`PLACE_MARKER_STYLE`, src/lib/mapStrip.ts) after this review found `PlaceMap.tsx` re-typing it as a second literal. The marker palette predates the V7 terracotta brand and is a deliberate map-layer choice; changing it is a palette decision, not a per-line one.',
  },
  {
    rule: 'design-system-color',
    detail: '#312e81',
    reason:
      "DELIBERATE — the FOCUSED marker's darker indigo, the other half of the pair in src/lib/mapStrip.ts.",
  },
  {
    rule: 'design-system-font-size',
    detail: 'font-size: 16px',
    reason:
      'THE RAMP ITSELF — a definition in the type scale at src/index.css, which the detector cannot tell from a call site using it.',
  },
  {
    rule: 'design-system-font-size',
    detail: 'font-size: 22px',
    reason: 'THE RAMP ITSELF — the second definition the detector read as a call site. Same file.',
  },
  {
    rule: 'design-system-font-size',
    detail: '10px',
    reason:
      'DELIBERATE — the photo credit and the moderator "review" badge, both labels ON a photograph that must not compete with it. The ramp\'s 14px floor is a floor for TEXT; a badge over an image is not body copy.',
  },
  {
    rule: 'text-occlusion',
    detail: 'font-display.text-2xl.font-bold "Drop In"',
    reason:
      'FALSE POSITIVE, MEASURED TWICE — it is the BOOT SPLASH. `p.font-display.text-2xl.font-bold` is the splash\'s OWN wordmark, drawn inside `div.fixed.inset-0.z-50` while the app hydrates; the page\'s real wordmark is a `<span>`, so a genuine occlusion of the header would be reported with a different selector — and would still fail this check. Probed at 200/600/1200ms: the wordmark is 111x40 at y=466 beneath the fixed splash, and by ~1.2s THE ELEMENT IS GONE (it unmounted with the splash). Two structural limits of the detector are recorded here rather than blamed on the app: it measures DURING the splash instead of waiting for it to clear, and its occlusion test is PAINT-ORDER-BLIND — it also named the static email input as "covering" the wordmark 100%, an element that paints BELOW the z-50 overlay. The covered-element detail is the key on purpose: a new occlusion on any other element still fails.',
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
  let currentFile = null
  for (const line of output.split('\n')) {
    // The detector prints one FILE HEADER before that file's findings:
    //   /abs/path/src/components/Thing.tsx (imported by App.tsx, …)
    // Capturing it is what lets an acceptance be NARROW — keyed to the file (and
    // sometimes the exact detail) instead of silencing a whole rule class.
    const file = line.match(/^(\/\S+\.(?:tsx?|mjs|css))\b/)
    if (file !== null && !line.includes('[')) {
      currentFile = file[1]
      continue
    }
    // The rule tag is NOT at the start of the line — findings read
    // "  line 174: [ai-color-palette] text-indigo-600 on heading".
    const head = line.match(/\[([a-z0-9-]+)\]\s*(.+)$/)
    if (head !== null) {
      if (current !== null) findings.push(current)
      current = { rule: head[1], detail: head[2], file: currentFile }
    }
  }
  if (current !== null) findings.push(current)
  return findings
}

/**
 * Does an acceptance cover this finding?
 *
 * A RULE ALONE IS THE BLUNT FORM and still the right one for a rule that is
 * wrong about the whole class (`ai-color-palette` is the standing example). The
 * optional `file` and `detail` substrings make the narrow form possible, which
 * is what a FALSE POSITIVE needs: accepting `broken-image` outright would also
 * silence a genuinely broken `<img>`, so those entries name the file whose
 * COMMENT the detector read.
 */
function accepts(entry, finding) {
  if (entry.rule !== finding.rule) return false
  if (entry.file !== undefined && !(finding.file ?? '').includes(entry.file)) return false
  if (entry.detail !== undefined && !finding.detail.includes(entry.detail)) return false
  return true
}

const targets = [process.argv[3] ?? 'src', BASE]
let accepted = 0
const unexpected = []

for (const target of targets) {
  for (const finding of runDetector(target)) {
    // ⚠️ `accepts`, NOT `entry.rule === finding.rule`. The narrow matcher is what
    // keeps a false-positive acceptance from silencing its whole rule: without it
    // the `broken-image` entries (both of them a COMMENT the detector read) would
    // also excuse a genuinely broken `<img>` anywhere in the app.
    const known = ACCEPTED.find((entry) => accepts(entry, finding))
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
