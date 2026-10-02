#!/usr/bin/env node
// Derive the fence-closure conformance table from a reference CommonMark parser.
//
// WHAT THIS IS FOR. The factory guard reads fenced blocks by CommonMark's own
// closure rules, and for three rounds that claim lived only in prose — nothing
// checked it. This script is how the table in `fence-conformance.fixture.json`
// is PRODUCED: it parses each case with the reference implementation and records
// the content boundaries the reference derives, so the guard's parser is judged
// against a reference and not against a reading of the spec.
//
// The reference is NOT a dependency of this repo (the tree ships no markdown
// parser). It is installed in a throwaway root and located through `MDREF`:
//
//   mkdir -p /tmp/mdref && (cd /tmp/mdref && npm i commonmark@0.31.2 marked@18.0.14)
//   MDREF=/tmp/mdref node scripts/guards/fence-conformance.derive.mjs > scripts/guards/fence-conformance.fixture.json
//
// `commonmark` is the canonical reference and the authority for every case.
// `marked` is parsed alongside it only as a second opinion: the script counts
// their disagreements and prints them to stderr. A case on which the two
// references disagree is NOT recorded — the seed is shrunk until they agree,
// rather than the disagreement being settled in prose (D-037). The one such
// shape measured here is a closing fence with a tab after the run: the spec
// allows the tab and commonmark closes on it, marked does not. It is left out of
// the table for that reason, and the guard's behaviour on it is reported, not
// pinned by the fixture.
//
// `source` is the case text WITHOUT a trailing newline, so the guard's own
// `split('\n')` line indices are the reference's. `blocks` is the guard's own
// representation: zero-based, half-open content ranges `[content, end)` — the
// lines BETWEEN a fence and its closer, which is what the rule reads. The opener
// is never indented more than three spaces, because the guard reads an opener at
// any indent as a fence by a deliberate, declared over-read; a case past that
// would measure the declared ceiling rather than the closure rules.
//
// Exit: 0 = the table printed on stdout; 1 = the reference could not be loaded.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const MDREF = process.env.MDREF ?? '/tmp/mdref'
const refPath = (pkg) => join(MDREF, 'node_modules', pkg)

let Parser
let marked
try {
  ;({ Parser } = await import(refPath('commonmark/lib/index.js')))
  ;({ marked } = await import(refPath('marked/lib/marked.esm.js')))
} catch (e) {
  console.error(`the reference implementation is not loadable from MDREF=${MDREF}\n${e.message}`)
  process.exit(1)
}

/** The code text between the fences as a line count. commonmark hands it back
 * with the final newline, marked without it. */
function countLines(text) {
  if (text === '') return 0
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n').length
}

/** The content ranges commonmark derives: a fenced block opening on one-based
 * line `S` has content lines `S+1 .. S+count`, which in the guard's zero-based
 * half-open form is `[S, S + count)` — the same shape the guard emits. */
function commonmarkBlocks(src) {
  const parser = new Parser()
  const blocks = []
  const walk = (node) => {
    if (node.type === 'code_block' && node._isFenced) {
      const start = node._sourcepos[0][0]
      blocks.push([start, start + countLines(node._literal ?? '')])
    }
    for (let c = node.firstChild; c; c = c.next) walk(c)
  }
  walk(parser.parse(src))
  return blocks
}

/** The same boundaries from marked, as a second opinion. */
function markedBlocks(src) {
  const blocks = []
  let line = 1
  for (const token of marked.lexer(src)) {
    if (token.type === 'code') blocks.push([line, line + countLines(token.text ?? '')])
    line += token.raw.split('\n').length - 1
  }
  return blocks
}

const CASES = [
  ['simplest closed fence', '```md\ncontent\n```'],
  ['nested same-kind fence (info-string closer)', '```md\ncontent\n```js\n✓ seven\n```'],
  ['shorter closer run stays content', '````md\ncontent\n```\n✓ seven\n````'],
  ['longer closer run closes', '```md\ncontent\n`````\n✓ seven'],
  ['closer indented three spaces closes', '```md\ncontent\n   ```\n✓ seven'],
  ['closer indented four spaces stays content', '```md\ncontent\n    ```\n✓ seven'],
  ['closer indented eight spaces stays content', '```md\ncontent\n        ```\n✓ seven\n```'],
  ['tab-indented closer stays content', '```md\ncontent\n\t```\n✓ seven\n```'],
  ['closer with trailing text stays content', '```md\ncontent\n``` trailing\n✓ seven\n```'],
  ['closer with trailing spaces closes', '```md\ncontent\n```   \n✓ seven'],
  ['closer with a vertical-tab suffix stays content', '```md\ncontent\n```\v\n✓ seven\n```'],
  ['closer with an NBSP suffix stays content', '```md\ncontent\n```\u00a0\n✓ seven\n```'],
  ['unclosed fence reads to the end', '```md\ncontent\n✓ seven'],
  ['empty closed fence', '```\n```\n✓ seven'],
  ['tilde fence closes on a tilde run', '~~~md\ncontent\n~~~\n✓ seven'],
  ['backtick closer does not close a tilde fence', '~~~md\ncontent\n```\n✓ seven\n~~~'],
  ['tilde closer indented four spaces stays content', '~~~md\ncontent\n    ~~~\n✓ seven\n~~~'],
  ['other-kind fence nested inside is content', '```md\ncontent\n~~~\n✓ seven\n~~~\n```'],
  ['backtick opener info string with a backtick is not a fence', '``` a`b\nparagraph\n\n```md\n✓ seven\n```'],
  ['two separate blocks', '```\nfirst\n```\n\n```\nsecond\n```'],
  ['opener indented three spaces', '   ```md\ncontent\n   ```\n✓ seven'],
  ['opener indented two, closer one', '  ```md\ncontent\n ```\n✓ seven'],
  ['five-run opener, three-run line inside is content', '`````md\ncontent\n```\n✓ seven\n`````'],
  ['closer run longer than the opener closes', '```\ncontent\n~~~~\n✓ seven\n~~~~'],
  ['a same-kind closer with an info string is content', '```\ncontent\n```js\nmore\n```\n✓ seven'],
  ['a tilde opener with a backtick info string still opens', '~~~ `x`\ncontent\n~~~\n✓ seven'],
]

const version = (pkg) => JSON.parse(readFileSync(refPath(`${pkg}/package.json`), 'utf8')).version

let disagreements = 0
const cases = CASES.map(([name, source]) => {
  const blocks = commonmarkBlocks(source)
  const second = markedBlocks(source)
  if (JSON.stringify(blocks) !== JSON.stringify(second)) {
    disagreements += 1
    console.error(`reference disagreement — ${name}: commonmark ${JSON.stringify(blocks)} vs marked ${JSON.stringify(second)}`)
  }
  return { name, source, blocks }
})

const fixture = {
  _header: {
    what: 'Fence-closure cases for the factory guard\'s fenced-block parser (the transcript-summary-agrees rule), each with the code-content boundaries the reference CommonMark implementation derives. Guarded by the fence-fixture block in factory-guard.check.mjs, which runs the guard\'s own parser over every case.',
    reference: `commonmark ${version('commonmark')} (the authority) cross-checked against marked ${version('marked')}`,
    derivation: 'MDREF=/tmp/mdref node scripts/guards/fence-conformance.derive.mjs > scripts/guards/fence-conformance.fixture.json',
    blocks: 'zero-based, half-open [content, end) line ranges: the lines between a fence and its closer, which is what the rule reads',
    boundary: 'every case opens with a fence indented at most three spaces; the guard reads any leading whitespace on an OPENER as a fence by a deliberate declared over-read, so an opener past three spaces would measure that ceiling rather than these closure rules. Fences nested in blockquotes or lists are likewise a declared ceiling, outside this line-based table.',
  },
  cases,
}

process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`)
console.error(`${cases.length} case(s); ${disagreements} reference-vs-reference disagreement(s)`)
