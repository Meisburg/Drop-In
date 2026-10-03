#!/usr/bin/env node
/**
 * Self-check for check-acceptance-greps.
 *
 * WHY THIS FILE EXISTS. Quoting `run-all.sh`: *"A rule whose own behavior is
 * unchecked is a rule that can silently stop holding — a checker that matches
 * nothing looks exactly like a clean repo."* This guard's own bar is the same
 * sentence applied to itself: **a tagged-claim parser that finds ZERO tagged
 * claims ships green and useless.** So this checker seeds every failure shape
 * into a throwaway corpus and requires the guard's exit code to be the right one:
 *
 *   1. the real `plan.md` + briefs pass — and the run reports a NON-ZERO tagged
 *      claim count, so a green over an empty corpus cannot hide here;
 *   2. an UNTAGGED quotation of a bad grep (`rg "of 5" src/` → 0 hits, the exact
 *      shape `plan.md:241` uses to condemn the class) is IGNORED — the guard
 *      passes and counts it as a quotation, which is the boundary the tag buys;
 *   3. a ZERO claim over a BARE DIRECTORY fails (rule 1), even when the grep is
 *      genuinely empty — a bare directory cannot make the claim checkable;
 *   4. a scoped zero claim whose grep actually REPORTS hits fails (rule 2): the
 *      "unscoped-pattern" case, isolated so only the truth rule can fire;
 *   5. the first recorded pre-fix fixture — `rg "of 5" src/` → 0 hits — fails;
 *   6. the second recorded pre-fix fixture — `rg "hasPhoto" src/` → 0 hits —
 *      fails;
 *   7. the F1 exemption, BOTH halves: a zero claim whose only hit is a COMMENT
 *      passes (a comment that records a removal is documentation, not a hit),
 *      and the same claim with the mention in CODE fails;
 *   8. a corpus with NO tagged claims FAILS (the standing rule, made structural);
 *   9. a MALFORMED tagged claim (a tag the parser cannot read a command or a
 *      count from) FAILS — a claim that cannot be checked looks like one that
 *      holds;
 *  10. F1 does NOT depend on the claim's own flags: a zero claim whose only hit
 *      is a COMMENT passes even when the doc's command carries no `-n`, because
 *      the guard forces `-H -n` so the `path:line:` prefix is always complete;
 *  11. a `>` blockquote line-leading tag is a QUOTATION, not a claim — the
 *      list-marker allowance excludes `>`, so a quoted example is not judged.
 *
 * The sandboxes are throwaway temp corpora the checker builds and removes; the
 * repo tree is never seeded. `.check.mjs`, NOT `.test.mjs`: `npm test` discovers
 * `*.test.mjs`, and a top-level `process.exit()` inside vitest kills the run.
 *
 * Run: node scripts/guards/check-acceptance-greps.check.mjs
 * Exit 0 = the guard does its job, 1 = it does not.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = path.join(import.meta.dirname, '..', '..')
const guard = path.join(root, 'scripts', 'guards', 'check-acceptance-greps.mjs')

if (!existsSync(guard)) {
  console.error(`check: guard missing at ${guard}`)
  process.exit(1)
}

let checks = 0
let failures = 0
const check = (name, ok, detail = '') => {
  checks += 1
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const created = []
/** A throwaway corpus: `plan`, plus any `files` / `briefs` the case needs. */
function sandbox({ plan = '', files = {}, briefs = {} } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'acceptance-greps-check-'))
  created.push(dir)
  writeFileSync(path.join(dir, 'plan.md'), plan)
  const write = (rel, text) => {
    const p = path.join(dir, rel)
    mkdirSync(path.dirname(p), { recursive: true })
    writeFileSync(p, text)
  }
  for (const [rel, text] of Object.entries(files)) write(rel, text)
  for (const [name, text] of Object.entries(briefs)) write(path.join('.scratch', 'v28', 'briefs', name), text)
  return dir
}

function run(dir) {
  try {
    return { exit: 0, out: execFileSync('node', [guard, dir], { encoding: 'utf8', stdio: 'pipe' }).toString() }
  } catch (e) {
    return { exit: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}
const findings = (out) =>
  out
    .split('\n')
    .filter((l) => l.startsWith('  - '))
    .join(' | ')

try {
  // 1. The real documents, which STILL QUOTE the bad greps as defects.
  let r = run(root)
  check('the real plan.md + briefs pass', r.exit === 0, `exit ${r.exit}: ${findings(r.out)}`)
  const tagged = /(\d+) tagged claim\(s\)/.exec(r.out)
  check(
    'the real run read a non-zero number of tagged claims (it matched something)',
    Number(tagged?.[1]) > 0,
    `tagged=${tagged?.[1]}`,
  )

  // 2. An untagged quotation is ignored; a tagged scoped claim passes.
  r = run(
    sandbox({
      plan: [
        '# plan',
        '',
        'A blanket `rg "of 5" src/` → 0 hits is NOT the check — a defect, twice.',
        'ACCEPTANCE-GREP: `rg -n "zz" src/aaa.ts` → **0 hits**.',
        '',
      ].join('\n'),
      files: { 'src/aaa.ts': 'export const other = 1\n' },
    }),
  )
  check(
    'an untagged quotation of a bad grep is IGNORED (the tag is the boundary)',
    r.exit === 0 && /[1-9]\d* untagged quotation line\(s\) ignored/.test(r.out),
    `exit ${r.exit}: ${r.out.split('\n')[0]}`,
  )

  // 3. Rule 1 alone: a bare-directory zero claim is a finding even when the grep
  //    is genuinely empty, because a directory cannot make the claim checkable.
  r = run(
    sandbox({
      plan: 'ACCEPTANCE-GREP: `rg -n "zz" src/` → **0 hits**.\n',
      files: { 'src/aaa.ts': 'export const other = 1\n' },
    }),
  )
  check(
    'a zero claim over a BARE DIRECTORY fails (rule 1, isolated)',
    r.exit !== 0 && /bare directory/.test(r.out),
    `exit ${r.exit}: ${findings(r.out)}`,
  )

  // 4. Rule 2 alone: a SCOPED zero claim whose grep reports hits is a false claim.
  r = run(
    sandbox({
      plan: 'ACCEPTANCE-GREP: `rg -n "of 5" src/components/place.tsx` → **0 hits**.\n',
      files: { 'src/components/place.tsx': "export const line = '4.3 out of 5'\n" },
    }),
  )
  check(
    'a scoped zero claim whose grep reports hits fails (rule 2, isolated)',
    r.exit !== 0 && /actually reports 1/.test(r.out),
    `exit ${r.exit}: ${findings(r.out)}`,
  )

  // 5. Recorded pre-fix fixture: the blanket `of 5` zero.
  r = run(
    sandbox({
      plan: 'ACCEPTANCE-GREP: `rg "of 5" src/` → **0 hits**.\n',
      files: { 'src/ratings.ts': "export const line = '4.3 out of 5'\n" },
    }),
  )
  check(
    'the recorded `rg "of 5" src/` → 0-hits fixture FAILS',
    r.exit !== 0 && /bare directory/.test(r.out) && /actually reports 1/.test(r.out),
    `exit ${r.exit}: ${findings(r.out)}`,
  )

  // 6. Recorded pre-fix fixture: the blanket `hasPhoto` zero.
  r = run(
    sandbox({
      plan: 'ACCEPTANCE-GREP: `rg "hasPhoto" src/` → **0 hits**.\n',
      files: { 'src/places.ts': 'const hasPhoto = place.photo_url !== null\n' },
    }),
  )
  check(
    'the recorded `rg "hasPhoto" src/` → 0-hits fixture FAILS',
    r.exit !== 0 && /actually reports 1/.test(r.out),
    `exit ${r.exit}: ${findings(r.out)}`,
  )

  // 7. F1, both halves: comment-only hits are exempt; the same mention in code is not.
  const f1 = (body) =>
    sandbox({
      plan: 'ACCEPTANCE-GREP: `rg -n "hasPhoto" src/lib/zz.ts` → **0 hits**.\n',
      files: { 'src/lib/zz.ts': body },
    })
  r = run(f1('// the first run used to have a hasPhoto fact\nexport const x = 1\n'))
  check(
    'F1 — a zero claim whose only hit is a COMMENT passes (a removal note is not a hit)',
    r.exit === 0,
    `exit ${r.exit}: ${findings(r.out)}`,
  )
  r = run(f1('export const hasPhoto = 1\n'))
  check(
    'F1 — the same claim with the mention in CODE fails (the exemption is not a loophole)',
    r.exit !== 0 && /actually reports 1/.test(r.out),
    `exit ${r.exit}: ${findings(r.out)}`,
  )

  // 8. THE STANDING RULE: a corpus with no tagged claims FAILS.
  r = run(
    sandbox({
      plan: 'A blanket `rg "of 5" src/` → 0 hits. This sentence carries no tag.\n',
      files: { 'src/aaa.ts': 'export const x = 1\n' },
    }),
  )
  check(
    'a corpus with NO tagged claims FAILS (an instrument that matches nothing is not a pass)',
    r.exit !== 0 && /ZERO tagged/.test(r.out),
    `exit ${r.exit}: ${findings(r.out)}`,
  )

  // 9. A malformed tagged claim is a finding, never a skip.
  r = run(sandbox({ plan: 'ACCEPTANCE-GREP: `rg -n "zz"` → **0 hits**.\n' }))
  check(
    'a tagged claim with no SCOPE fails (nothing to check is not a pass)',
    r.exit !== 0 && /not an `rg PATTERN SCOPE…` claim/.test(r.out),
    `exit ${r.exit}: ${findings(r.out)}`,
  )
  r = run(sandbox({ plan: 'ACCEPTANCE-GREP: `rg -n "zz" src/aaa.ts`.\n' }))
  check(
    'a tagged claim with no COUNT fails (a claim that cannot be read is not one that holds)',
    r.exit !== 0 && /no `→ N hits` count/.test(r.out),
    `exit ${r.exit}: ${findings(r.out)}`,
  )

  // 10. F1 must not depend on the claim's own flags. The guard forces `-H -n`,
  //     so a comment-only hit is exempt even when the doc's command carries no
  //     `-n`: without `-n` the `path:line:` prefix is incomplete, `contentOf`
  //     fails, and a comment reads as a HIT (the residual of the `-H` bug).
  r = run(
    sandbox({
      plan: 'ACCEPTANCE-GREP: `rg "zz" src/lib/zz.ts` → **0 hits**.\n',
      files: { 'src/lib/zz.ts': '// a removal note mentioning zz\nexport const x = 1\n' },
    }),
  )
  check(
    'F1 holds when the claim command does NOT carry -n (the guard forces -H -n)',
    r.exit === 0,
    `exit ${r.exit}: ${findings(r.out)}`,
  )

  // 11. A `>` blockquote line-leading tag is a quotation of the convention, not
  //     a claim: the list-marker allowance excludes `>`, so a quoted example is
  //     never judged even when it states a bad claim.
  r = run(
    sandbox({
      plan: [
        '> ACCEPTANCE-GREP: `rg -n "zz" src/` → **0 hits**.',
        'ACCEPTANCE-GREP: `rg -n "zz" src/aaa.ts` → **0 hits**.',
        '',
      ].join('\n'),
      files: { 'src/aaa.ts': 'export const other = 1\n' },
    }),
  )
  check(
    'a blockquote (`>`) line-leading tag is a QUOTATION, not a claim',
    r.exit === 0 && /1 untagged quotation line\(s\) ignored/.test(r.out),
    `exit ${r.exit}: ${r.out.split('\n')[0]}`,
  )
} finally {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(`check-acceptance-greps check: ${failures} of ${checks} check(s) failed — the guard is not doing its job.`)
  process.exit(1)
}
console.log(`check-acceptance-greps check: all ${checks} checks passed.`)
