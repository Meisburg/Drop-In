// The fence scanner — ONE implementation, shared by the factory guard and its
// reference-derived conformance fixture.
//
// WHY THIS FILE EXISTS (D-039). The factory guard's `transcript-summary-agrees`
// rule reads fenced blocks, and for six rounds its fence recognition was a loop
// hand-written inside `factory-guard.mjs`. Three rounds of clause-patching moved
// the divergence from the CLOSER (an indentation bound, a `\r` suffix that made a
// CRLF file recognise no fence at all) to the OPENER (an any-whitespace over-read
// that swallowed the next real opener as a phantom closer and dropped a
// reference-fenced line). D-038 placed a rung below D-032's delete: stop
// hand-writing the recogniser and take the reference's own fence recognition. So
// the recogniser lives here, in ONE module imported by BOTH callers —
// `scripts/guards/factory-guard.mjs` (which reads blocks) and
// `scripts/guards/factory-guard.check.mjs` (which judges them against the
// reference-derived table). There is no second copy for the two to drift apart.
//
// WHAT WAS TAKEN, AND FROM WHERE (see docs/agents/borrowed-guards.md). Source:
// `commonmark` 0.31.2 (`lib/blocks.js`, BSD-2-Clause) — the canonical CommonMark
// reference implementation, and the authority named by the conformance fixture.
// Transcribed, not imported: this tree ships no markdown parser and must not
// gain one, because a guard whose meaning moves when a package bumps is the
// failure this suite exists to prevent. Taken verbatim or near-verbatim:
//   - `CODE_INDENT = 4` (blocks.js:7) — the column at which a line is an indented
//     code block, and therefore not a fence opener.
//   - `reCodeFence = /^`{3,}(?!.*`)|^~{3,}/` (blocks.js:48) — the opener: three or
//     more backticks with no backtick later on the line, or three or more tildes.
//   - `reClosingCodeFence = /^(?:`{3,}|~{3,})(?=[ \t]*$)/` (blocks.js:50) — the
//     closing run and its suffix.
//   - the leading-whitespace column (blocks.js:744-765) — a space advances one
//     column and a tab advances to the next multiple of four; the opener is
//     refused at `column >= 4`, the closer accepted only at `column <= 3`.
//   - `reLineEnding = /\r\n|\n|\r/` (blocks.js:54) — line endings are normalised
//     before scanning, which is why a CRLF file is ordinary text to the reference
//     and was invisible to the hand-written recogniser.
//   - the closer's remaining conditions (blocks.js:404-409) — the line's first
//     non-space character is the opener's own fence character, and the run is at
//     least as long as the opener's.
//
// WHAT WAS REFUSED, AND WHY.
//   - commonmark's full block parser and its container machinery (blockquotes,
//     lists, lazy continuation). This scanner is top-level and line-based, which
//     is the boundary the conformance fixture already declares; the guard's scan
//     set is prose reports, not container markdown.
//   - `marked` 18.0.14's fence tokeniser, the fixture's second reference. Its
//     closer suffix admits spaces only (` *`), so it keeps a closing run followed
//     by a tab as CONTENT where commonmark — the authority — closes. That is a
//     reference disagreement, not a divergence (D-037 §2); taking the authority's
//     clause is how it is settled without adjudicating it in prose.
//   - `_fenceOffset` content de-indentation, info-string unescaping and NUL
//     replacement: this scanner answers only "which lines are inside a fenced
//     block", which is all the rule reads.
//
// THE FOUR GUARD CRITERIA (docs/agents/borrowed-guards.md, "Adding a fourth
// guard"), each met:
//   1. It enforces a rule already written down — `transcript-summary-agrees`,
//      whose scope statement in factory-guard.mjs's header names this scanner.
//   2. It is deterministic: a pure function of its input text, no model, no
//      clock, no filesystem, no network.
//   3. It cannot be satisfied by editing itself without a visible diff: it has
//      no configuration and no allow-list, and the conformance fixture in
//      factory-guard.check.mjs fails on any divergence from the reference.
//   4. It is dependency-free (it imports nothing at all) and ships a behaviour
//      test: the fence-fixture block runs it over the reference-derived cases,
//      and the CRLF seed drives the real guard binary.

/** The reference's line-ending rule (blocks.js:54): CRLF, bare LF and bare CR
 * each end a line. commonmark splits on this before it looks for a fence, so a
 * CRLF file is ordinary text to it. */
export function normalizeLineEndings(text) {
  return text.replace(/\r\n|\r/g, '\n')
}

/** The file's lines, line endings normalised first. `split('\n')` on the
 * normalised text is exactly commonmark's `input.split(reLineEnding)`. */
export function splitLines(text) {
  return normalizeLineEndings(text).split('\n')
}

// commonmark 0.31.2, lib/blocks.js — the reference clauses, transcribed.
const CODE_INDENT = 4
const reCodeFence = /^`{3,}(?!.*`)|^~{3,}/
const reClosingCodeFence = /^(?:`{3,}|~{3,})(?=[ \t]*$)/

/** The fenced code blocks in `text`, in the guard's own representation:
 * zero-based, half-open content ranges `{ content, end }` — the lines BETWEEN an
 * opener and its closer, which is what the rule reads. An unclosed fence runs to
 * the last line. The reference's own boundaries, `commonmark 0.31.2`. */
export function scanFences(text) {
  const lines = splitLines(text)
  const blocks = []
  let open = null
  for (const [index, line] of lines.entries()) {
    // The leading-whitespace column (blocks.js:744-765): spaces at one column
    // each, a tab to the next multiple of four. `rest` starts at the first
    // character that is neither space nor tab.
    let column = 0
    let at = 0
    for (;;) {
      const ch = line.charAt(at)
      if (ch === ' ') {
        at += 1
        column += 1
      } else if (ch === '\t') {
        at += 1
        column += 4 - (column % 4)
      } else break
    }
    const rest = line.slice(at)
    if (!open) {
      // The opener: not indented past three columns (blocks.js:505,
      // `!parser.indented`), then the reference's own opener clause.
      if (column >= CODE_INDENT) continue
      const match = rest.match(reCodeFence)
      if (!match) continue
      open = { char: match[0][0], length: match[0].length, at: index }
    } else {
      // The closer (blocks.js:404-409): at most three columns of indent, the
      // opener's own fence character, the closing-run and suffix clause, and a
      // run no shorter than the opener's.
      if (column > 3) continue
      if (rest.charAt(0) !== open.char) continue
      const match = rest.match(reClosingCodeFence)
      if (!match || match[0].length < open.length) continue
      blocks.push({ content: open.at + 1, end: index })
      open = null
    }
  }
  if (open) blocks.push({ content: open.at + 1, end: lines.length })
  return blocks
}
