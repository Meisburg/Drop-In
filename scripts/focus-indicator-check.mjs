/**
 * Focus-indicator check (V22 slice 7) — no keyboard-reachable control may end
 * up with NO visible focus indicator.
 *
 * WHY THIS EXISTS: slice 7 renamed `focus:` -> `focus-visible:` on 37 controls.
 * The builder's safety check was `grep 'outline-none' | grep -v focus-visible`
 * and it reported empty — but that test cannot tell these apart:
 *
 *   "… focus-visible:outline-none"                              <- NO indicator
 *   "… focus-visible:outline-none focus-visible:ring-2 …"        <- fine
 *
 * Both contain the substring `focus-visible`, so both pass the grep. The first
 * removes the browser's ring and adds nothing back: a keyboard user tabbing into
 * that textarea sees nothing at all. The orchestrator found exactly this case in
 * InboxPage.tsx:949 (the message composer) — pre-existing as `focus:outline-none`,
 * faithfully preserved by the rename, and invisible to the grep.
 *
 * The rule this enforces: a class list that suppresses the outline (`outline-none`)
 * must ALSO declare some other focus cue — a ring, a border colour, or a
 * background change — in the same class list.
 *
 * Usage: node scripts/focus-indicator-check.mjs
 * Exits non-zero when a control suppresses its outline with no replacement.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/** Every .tsx file in the tree (tests included — a broken test control is still broken). */
function tsxFiles() {
  const out = execSync("find src -name '*.tsx' -not -path '*/node_modules/*'", {
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean)
}

/**
 * Pull each className="…" / className={`…`} payload out of a file, with the line
 * number it starts on. Good enough for this codebase: every control's classes
 * sit in one className attribute within ~20 lines of the tag.
 */
function classPayloads(source) {
  const payloads = []
  const re = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g
  let m
  while ((m = re.exec(source)) !== null) {
    const value = m[1] ?? m[2] ?? ''
    const line = source.slice(0, m.index).split('\n').length
    payloads.push({ value, line })
  }
  return payloads
}

/**
 * Does this class list suppress the outline AND provide no other focus cue?
 * A "cue" is any focus-visible:/focus: utility that changes appearance —
 * ring, border, bg, or shadow.
 */
function suppressesOutlineWithNoCue(classes) {
  const suppresses = /(^|\s)(focus-visible:|focus:)?outline-none(\s|$)/.test(classes)
  if (!suppresses) return false
  const hasCue = /(focus-visible|focus):(ring|border|bg|shadow)/.test(classes)
  return !hasCue
}

const offenders = []
for (const file of tsxFiles()) {
  const source = readFileSync(file, 'utf8')
  for (const { value, line } of classPayloads(source)) {
    if (suppressesOutlineWithNoCue(value)) {
      offenders.push({ file, line, value: value.trim().slice(0, 120) })
    }
  }
}

if (offenders.length > 0) {
  console.log('FAIL — controls that suppress the focus outline with no replacement:\n')
  for (const o of offenders) {
    console.log(`  ${o.file}:${o.line}`)
    console.log(`    ${o.value}`)
  }
  console.log(
    `\n${offenders.length} offender(s). A keyboard user tabbing into these sees no focus cue.` +
      '\nAdd a cue, e.g. "focus-visible:ring-2 focus-visible:ring-indigo-200".',
  )
  process.exit(1)
}

console.log('PASS — every control that suppresses its outline provides a focus cue')
