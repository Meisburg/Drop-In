#!/usr/bin/env node
// Factory guard — the rules that must not depend on anyone remembering them.
//
// WHY THIS EXISTS. The factory's review lanes JUDGE; they do not GUARANTEE. A
// reviewer reads the diff it was given; `ocr` skips config and prose; the
// verifier runs the commands it was handed. The registry, the work state and the
// reservation file are exactly the kind of artifact none of them opens — and the
// registry is where the memory arithmetic lives, so a silent error in it is a
// silent OOM.
//
// So this is the deterministic half, in the same shape as the repo's other
// guards: it either finds a violation or it does not, it costs no tokens, and it
// runs in `npm run guards` on every slice.
//
// The rules, each with the failure it prevents:
//
//   registry-fields       every model and task kind declares where its numbers
//                         came from — an unlabelled number reads as measured
//   floors-meetable       every capability floor has at least one model above it,
//                         so `route` can never be unsatisfiable by construction
//   lane-states-legal     no work item sits in a state the machine cannot reach
//   acceptance-not-early  acceptance cannot be `pass` while a required lane is
//                         not complete — the gate the orchestrator must not be
//                         able to talk its way past
//   waived-has-reason     a waiver is a written decision, never a silent green
//   deps-exist            every depends_on names a work item that exists
//   artifacts-exist       EVERY ARTIFACT PATH A WORK ITEM NAMES IS ON DISK.
//                         This is the one with teeth: an artifact named but
//                         missing is a claim with nothing behind it, which is
//                         the exact failure this factory was built to stop.
//   health-declared       every model says HOW it is known to be reachable. A
//                         model with no probe is a fallback that fails late.
//   residency-declared    every model says whether it is resident, on-demand or
//                         remote, and every remote-capable probe can be run
//   one-resident-local    at most one LOCAL model is declared resident, because
//                         they share `exclusive: local-inference` and cannot
//                         coexist — and policy and the per-model fields agree
//   reclaim-opt-in        reclamation is not automatic (D-004)
//   remote-verified       an unverified remote endpoint is never a fallback (D-003)
//   independence-satisfiable  a lane requiring same_model:false has a second
//                         model that clears its floor, or says in writing that
//                         it does not — independence is not a slogan
//   instrument-headers-honest  a guard's header block states only what a reader
//                         can point at: the counts it reports are derived at run
//                         time, and a claim about its own text names the commit
//                         or the line that shows it
//   no-bare-head-count    no report or brief resolves a count through bare
//                         HEAD — an "N … at HEAD" label (any HEAD spelling, or
//                         the `@` shorthand), a `git … HEAD` read whatever the
//                         subcommand and whatever global options precede it, or
//                         a counted command that names no fixed revision
//                         (`git log … | wc -l`) — instead of naming the commit it
//                         was measured at. Such a count is unreproducible by
//                         construction: the commit carrying the sentence is the
//                         one that moves HEAD. Forward-only, and the run prints
//                         the size of the recorded baseline it passes.
//   count-provenance-unresolvable  a count's provenance names a commit sha that
//                         does not exist, is not a commit, or is otherwise
//                         unresolvable, so the count cannot be reproduced from
//                         it. The canonical provenance token is `N at <sha>`
//                         (7-40 lowercase hex) and the sha is VERIFIED with
//                         `git cat-file -e <sha>^{commit}` — the decidability
//                         this slice exists for. Not baselined: a wrong named
//                         commit is a finding, never a ceiling.
//
// SCOPE — the boundary this instrument reads, and therefore the boundary of its
// claims. `docs/agents/code-structure.md` makes THIS header, not any report's
// prose, the authoritative statement of what the guard covers.
//   - factory/config.json (JSON) — the registry, policies, task kinds and the
//     lane/acceptance state tables.
//   - factory/work/*.json (JSON), ONE level — each work item's lanes, artifacts
//     and depends_on.
//   - .opencode/agents/*.md, and the live harness dir ~/.pi/agent/agents/*.md
//     when present (markdown) — only each file's `model:` line.
//   - scripts/guards/*.mjs (JavaScript), ONE level — the leading comment block
//     of each file, before the first line of code.
//   - .scratch/v28/reports/*.md and .scratch/v28/briefs/*.md (markdown), ONE
//     level — every line, for the bare-HEAD shapes and for the provenance
//     tokens of counts.
//   - the git repository those provenance tokens are resolved against: the
//     `--repo <dir>` argument when given, else the scan root when it is a
//     worktree, else this instrument's own repository. No ref, object or index
//     content is read — the only git call is `cat-file -e <sha>^{commit}`.
//   NOT read, and therefore NOT counted: .scratch/v28/ledger.md,
//   .scratch/v28/plan.md, other V28 lanes and older versions, any file BELOW
//   the directories named above (every walk is non-recursive), any extension
//   other than the ones named, and any file's git status. The report/brief scan
//   is PRESENCE ON DISK, not `git ls-files`: a tracked file absent from the tree
//   is not seen, and a present untracked file IS seen.
//
// Usage:  node scripts/guards/factory-guard.mjs [--root <dir>] [--repo <dir>]
// Exit:   0 = clean, 1 = findings

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const rootFlag = argv.indexOf('--root')
const ROOT = resolve(rootFlag === -1 ? join(import.meta.dirname, '..', '..') : argv[rootFlag + 1])

const FACTORY = join(ROOT, 'factory')
const findings = []
const fail = (check, msg) => findings.push({ check, msg })

// ---------------------------------------------------------------------------

function readConfig() {
  const path = join(FACTORY, 'config.json')
  if (!existsSync(path)) {
    fail('config-exists', `factory/config.json is missing at ${FACTORY}`)
    return null
  }
  try {
    const config = JSON.parse(readFileSync(path, 'utf8'))
    if (config.version !== 1) fail('config-version', `unsupported config version ${config.version}`)
    return config
  } catch (e) {
    fail('config-parses', `factory/config.json does not parse: ${e.message}`)
    return null
  }
}

function checkRegistry(config) {
  if (!config) return
  for (const [key, model] of Object.entries(config.models ?? {})) {
    if (!model.provider) fail('registry-fields', `${key}: no provider`)
    if (!model.capabilities) fail('registry-fields', `${key}: no capabilities`)
    if (!model.resources) fail('registry-fields', `${key}: no resources`)
    else if (!model.resources.footprint_source) {
      fail('registry-fields', `${key}: resources has no footprint_source — an unlabelled number reads as measured`)
    }
    if (!Number.isFinite(model.cost_tier)) fail('registry-fields', `${key}: no cost_tier`)
    const probe = model.health?.probe
    if (!model.health) fail('health-declared', `${key}: no health block — a model with no availability check is a fallback that fails late`)
    else if (!['service', 'tcp'].includes(probe)) fail('health-declared', `${key}: health.probe is '${probe}', not one of service|tcp`)
    else if (probe === 'tcp' && !model.endpoint) fail('health-declared', `${key}: probe tcp needs an endpoint to derive host and port from`)
    else if (probe === 'service' && !model.service) fail('health-declared', `${key}: probe service needs a systemd unit name`)
    if (!['resident', 'on-demand', 'remote'].includes(model.residency)) {
      fail('residency-declared', `${key}: residency is ${JSON.stringify(model.residency)}, not one of resident|on-demand|remote`)
    }
    if (model.residency === 'resident' && model.provider !== 'local') {
      fail('residency-declared', `${key}: declared 'resident' but is not a local model`)
    }
  }

  // At most ONE local model may be declared resident. Every local model declares
  // `exclusive: local-inference` because they genuinely cannot coexist — measured
  // 2026-10-02, when ninfer-serve holding the GPU drove strata-max into 176 failed
  // starts in 20 minutes. Two residents would be a registry that contradicts the
  // hardware it describes.
  const residentLocals = Object.entries(config.models ?? {})
    .filter(([, m]) => m.provider === 'local' && m.residency === 'resident')
    .map(([k]) => k)
  if (residentLocals.length > 1) {
    fail('one-resident-local', `${residentLocals.length} local models are declared resident (${residentLocals.join(', ')}) — they share the 'local-inference' resource and cannot coexist`)
  }
  if (residentLocals.length === 0) {
    fail('one-resident-local', 'no local model is declared resident — the factory has no worker it expects to be running')
  }
  const declaredResidents = config.policies?.residency?.resident
  if (declaredResidents && JSON.stringify([...declaredResidents].sort()) !== JSON.stringify([...residentLocals].sort())) {
    fail('one-resident-local', `policies.residency.resident (${declaredResidents.join(', ')}) disagrees with the per-model residency fields (${residentLocals.join(', ')})`)
  }

  // Reclaim must never be able to kill a model that is in use, and it is not
  // automatic until the scheduler has liveness and ownership semantics (D-004).
  if (config.policies?.reclaim !== 'opt-in') {
    fail('reclaim-opt-in', `policies.reclaim is ${JSON.stringify(config.policies?.reclaim)} — automatic reclamation is a later change and must be a deliberate one`)
  }

  if (config.policies?.remote_verification !== 'required') {
    fail('remote-verified', `policies.remote_verification is ${JSON.stringify(config.policies?.remote_verification)} — an unverified remote endpoint must not be treated as a fallback (D-003)`)
  }

  for (const [kind, task] of Object.entries(config.task_kinds ?? {})) {
    if (!task.resources) fail('registry-fields', `task kind '${kind}': no resources`)
    else if (!task.resources.footprint_source) fail('registry-fields', `task kind '${kind}': no footprint_source`)
  }

  const gaps = (model, floors) =>
    Object.entries(floors ?? {}).filter(([name, floor]) => {
      const have = model.capabilities?.[name]
      return !Number.isFinite(have) || have < floor
    })

  for (const [kind, task] of Object.entries(config.task_kinds ?? {})) {
    const floors = task.capabilities ?? {}
    if (!Object.keys(floors).length) continue
    const models = Object.values(config.models ?? {})
    const eligible = models.filter((m) => gaps(m, floors).length === 0 && (!task.requires_local_inference || m.provider === 'local'))
    if (!eligible.length) {
      fail('floors-meetable', `task kind '${kind}' has a capability floor (or a local-inference requirement) no registered model can meet — route can never succeed`)
    }
  }

  // Independence is a property, not a slogan. A lane that declares
  // `same_model: false` needs at least TWO models that clear its floor, or the
  // rule cannot be satisfied and the router will hand back the implementer's own
  // sibling. Either register a second model, or ACKNOWLEDGE the gap in the
  // registry — an unacknowledged gap is one nobody has decided about.
  for (const [kind, task] of Object.entries(config.task_kinds ?? {})) {
    if (!task.independence?.required || task.independence.same_model !== false) continue
    const floors = task.capabilities ?? {}
    const qualified = Object.entries(config.models ?? {}).filter(([, m]) => gaps(m, floors).length === 0)
    if (qualified.length < 2 && !task._independence_gap) {
      fail(
        'independence-satisfiable',
        `task kind '${kind}' requires same_model:false but only ${qualified.length} model(s) clear its floor — either register a second, or record task_kinds.${kind}._independence_gap saying so`,
      )
    }
  }

  const lanes = config.lane_states ?? {}
  const laneNames = config.lanes ?? []
  const acceptanceStates = config.acceptance_states ?? {}
  if (!Object.keys(lanes).length) fail('lane-states-legal', 'config has no lane_states table')
  if (!laneNames.length) fail('lane-states-legal', 'config declares no lane set')
  if (!Object.keys(acceptanceStates).length) fail('lane-states-legal', 'config has no acceptance_states table')
  for (const [from, tos] of Object.entries(lanes)) {
    if (!Array.isArray(tos)) fail('lane-states-legal', `lane_states['${from}'] is not a list`)
  }

  const requires = config.acceptance_gate?.requires
  if (!Array.isArray(requires) || !requires.length) {
    fail('acceptance-not-early', 'config has no acceptance_gate.requires list')
  } else {
    // `requires` names LANES, not states. Comparing it against the state table
    // was this guard's own first bug, caught by its behavior check.
    for (const lane of requires) {
      if (!laneNames.includes(lane)) fail('acceptance-not-early', `acceptance_gate.requires names '${lane}', which is not a declared lane`)
    }
  }
}

function checkWorkItems(config) {
  const workDir = join(FACTORY, 'work')
  if (!existsSync(workDir)) return
  const items = readdirSync(workDir).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, item: JSON.parse(readFileSync(join(workDir, f), 'utf8')) }))
  const ids = new Set(items.map(({ item }) => item.id))

  for (const { file, item } of items) {
    const laneNames = config?.lanes ?? []
    const workStates = Object.keys(config?.lane_states ?? {})
    const acceptanceStates = Object.keys(config?.acceptance_states ?? {})

    for (const [lane, value] of Object.entries(item.lanes ?? {})) {
      if (laneNames.length && !laneNames.includes(lane)) {
        fail('lane-states-legal', `${file}: lane '${lane}' is not a declared lane`)
        continue
      }
      // The acceptance lane is the gate over the work, so it has its own
      // vocabulary rather than sharing the work-lane state table.
      const legal = lane === 'acceptance' ? acceptanceStates : workStates
      if (!legal.includes(value.state)) {
        fail('lane-states-legal', `${file}: lane '${lane}' is in state '${value.state}', which is not a legal state for that lane`)
      }
      if (value.state === 'waived' && !value.reason) {
        fail('waived-has-reason', `${file}: lane '${lane}' is waived with no reason — a waiver is a written decision`)
      }
    }

    // An artifact named but missing is a claim with nothing behind it.
    for (const [lane, value] of Object.entries(item.lanes ?? {})) {
      for (const artifact of value.artifacts ?? []) {
        const path = isAbsolute(artifact) ? artifact : join(ROOT, artifact)
        if (!existsSync(path)) fail('artifacts-exist', `${file}: lane '${lane}' names artifact '${artifact}', which is not on disk`)
      }
    }

    for (const dep of item.depends_on ?? []) {
      if (!ids.has(dep)) fail('deps-exist', `${file}: depends_on names '${dep}', which is not a work item`)
    }

    const requires = config?.acceptance_gate?.requires ?? []
    const acceptance = item.lanes?.acceptance
    if (acceptance?.state === 'pass') {
      const incomplete = requires.filter((lane) => item.lanes?.[lane]?.state !== 'complete')
      if (incomplete.length) {
        fail(
          'acceptance-not-early',
          `${file}: acceptance is 'pass' while ${incomplete.map((l) => `${l}=${item.lanes?.[l]?.state ?? 'missing'}`).join(', ')} — the gate cannot be talked past`,
        )
      }
    }
  }
}

/**
 * Agent definitions may declare a DEFAULT model, but it must be a model the
 * registry knows. A `model:` naming something absent from the registry is how a
 * role quietly goes back to being hardcoded — the exact drift capability routing
 * exists to remove. The live harness's agent dir is machine-local, so it is
 * checked when present and named as skipped when not.
 */
function checkAgentModels(config) {
  if (!config) return
  const known = new Set(Object.keys(config.models ?? {}))
  const sources = [{ dir: join(ROOT, '.opencode', 'agents'), label: 'in-repo' }]
  const piAgents = join(homedir(), '.pi', 'agent', 'agents')
  if (existsSync(piAgents)) sources.push({ dir: piAgents, label: 'live harness' })
  else console.log('  note — the live harness agent dir is absent; its defaults are unchecked here')

  for (const { dir, label } of sources) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(join(dir, file), 'utf8')
      const declared = /^model:\s*(\S+)\s*$/m.exec(text)?.[1]
      if (!declared) continue
      if (!known.has(declared)) {
        fail('agent-model-in-registry', `agents/${file} (${label}) pins model '${declared}', which is not in factory/config.json — a default that drifts out of the registry is a hardcoded role again`)
      }
    }
  }
}

/**
 * A guard's header is the statement of what the guard covers —
 * `docs/agents/code-structure.md` names `regexp-escape-guard.mjs`'s header as
 * authoritative for its scope — so a header that states something other than the
 * mechanism is a defect a reader acts on. Two shapes have actually gone wrong,
 * and both are cheap to catch:
 *
 *   - a COUNT of the instrument's own cases typed into the header ("all 9 checks
 *     passed", "12 cases"). The file grows, the sentence does not, and the
 *     sentence is what a reviewer trusts. Print the derived count instead.
 *   - a HISTORY claim about the header's own text with nothing that resolves it
 *     ("a typed count in this header went stale once already" — a sentence whose
 *     claimed commit does not exist). A commit sha or a `file:line` is what makes
 *     the claim checkable; without one, a reader has to take it on faith, and the
 *     pointer has to sit on the line that makes the claim — a header is short,
 *     and a claim whose evidence is three lines away is the shape that failed.
 *
 * The second shape is matched only where the line is about THIS instrument's own
 * text or numbers (count/number/total/header/sentence/prose/label/map). A header
 * that says some OTHER file's comment "used to be X" is documentation of the
 * codebase, not a claim about this header; flagging that would fire the rule on
 * prose about the repo.
 */
const HEADER_TYPED_COUNT = /\d+\s*[-\s]?\s*(?:check|checks|case|cases|test|tests)\b|checks?\s+passed|\ball\s+\d+\s+check/i
const HEADER_HISTORY = /\b(?:went stale|was once|used to be|has grown)\b/i
const HEADER_SELF_SUBJECT = /\b(?:count|counts|number|total|header|sentence|prose|label|map)\b/i
const HEADER_POINTER = /\b[0-9a-f]{7,40}\b|[\w@./-]+:\d+/

function checkInstrumentHeaders() {
  const dir = join(ROOT, 'scripts', 'guards')
  if (!existsSync(dir)) {
    console.log('  note — no scripts/guards under this root; instrument headers unchecked here')
    return 0
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs'))
  for (const file of files) {
    const lines = readFileSync(join(dir, file), 'utf8').split('\n')
    for (const [index, line] of lines.entries()) {
      const text = line.trim()
      // The header block: the leading comment lines, before the first line of
      // code. `#` covers the shebang; the rest are the block-comment spellings.
      // A BLANK line is part of the block, not the end of it — treating it as
      // "not a comment" used to stop the scan silently, so a typed count after
      // one went unflagged (the gap this scan's own behaviour check now seeds).
      if (!text) continue
      if (!/^(?:\/\/|\/\*|\*|#)/.test(text)) break
      if (HEADER_TYPED_COUNT.test(text)) {
        fail(
          'instrument-headers-honest',
          `${file}:${index + 1}: the header types a count of this instrument's own cases — print the count the run derives instead: ${JSON.stringify(text)}`,
        )
      }
      if (HEADER_HISTORY.test(text) && HEADER_SELF_SUBJECT.test(text) && !HEADER_POINTER.test(text)) {
        fail(
          'instrument-headers-honest',
          `${file}:${index + 1}: the header claims its own text changed and names no commit sha or file:line to check it against: ${JSON.stringify(text)}`,
        )
      }
    }
  }
  return files.length
}

/**
 * A count in a report or a brief must name the commit it was measured at, in a
 * form a reader — or a machine — can check.
 *
 * WHY THIS EXISTS. `instrument-headers-honest` reads guard HEADERS; this class
 * kept recurring in report PROSE, where no instrument was looking. A count
 * written as "N at HEAD" is unreproducible BY CONSTRUCTION — the commit that
 * carries the sentence is the one that moves HEAD, so the number was measured at
 * one commit and read at another. It has now cost six review rounds.
 *
 * THE CANONICAL PROVENANCE TOKEN — `N at <sha>`. A count's provenance is a
 * COMMIT, written as a count, the connector `at`, and 7-40 lowercase hex
 * characters: `276 tracked `.scratch` files at 1c3471a`. The `at` may introduce
 * the sha in either word order within the same clause (`at 1c3471a the corpus
 * reports 276 documents`), punctuation attached to the token is part of the
 * spelling on BOTH sides — `at 1c3471a, 276 files` and `at 1c3471a: 276 files`
 * are the commonest English parenthetical — and the COUNT may carry the dress a
 * report puts around a quantity: `**412** tracked files at <sha>`,
 * `412 (tracked) files at <sha>`, `| 412 | tracked files at <sha> |`,
 * `"412" tracked files at <sha>`, `412: tracked files at <sha>`, and the
 * undressed `276 tracked files at <sha>`. That list is the specification, and
 * the count token implements it: a number whose dress is up to three attached
 * punctuation characters, followed within two tokens by the label it counts.
 *
 * THE SHA IS VERIFIED, and that is the decidability this slice exists for. Every
 * token in provenance position is resolved with `git cat-file -e <sha>^{commit}`.
 * A sha that does not exist, names a blob or a tree rather than a commit, or is
 * otherwise unresolvable is a FINDING (`count-provenance-unresolvable`) — so "a
 * wrong named commit" is no longer a declared ceiling. Naming a commit is
 * necessary AND sufficient here: the run checks it instead of guessing. SHA
 * findings are NOT baselined; a re-derivation can absorb a historical bare-HEAD
 * label, never a broken sha.
 *
 * PROVENANCE POSITION. A sha-shaped token is a count's provenance in two places,
 * and only those two are verified: (a) in an `N … at <sha>` label, in either
 * word order — the canonical form; and (b) as the revision of a counted git
 * command (`git ls-tree -r --name-only <sha> .scratch | wc -l`). A sha-shaped
 * token anywhere else is not a provenance token and is not verified: an
 * md5/sha256 content hash in an evidence tail is a hash of bytes, not a commit.
 * Quoting the sha (`` `1c3471a` ``, `"1c3471a"`, `'1c3471a'`) is the usual dress
 * of the canonical spelling and is accepted.
 *
 * NOT A GIT WORKTREE — the decision, because the behaviour checks run in
 * git-less temp roots and the rule must not be untestable through its own seam.
 * The repository the shas are resolved against is resolved in order: the
 * `--repo <dir>` argument when it is given, else the scan root when it holds a
 * `.git`, else THIS instrument's own repository. `--repo` is an INSTRUCTION, not
 * a hint: when it is given and is not a worktree the shas are NOT verified, and
 * the run does not silently substitute the scan root or this repository for it —
 * the note names the `--repo` argument as the reason. When none of those is a
 * worktree, the run prints a note saying the provenance shas were NOT verified
 * and reports no sha finding for them — it never manufactures one — and the
 * `ok —` summary omits the resolved-as-a-commit claim, exactly as it omits any
 * other check that did not run. A check that cannot run must not pass as if it
 * had.
 *
 * THE MOVING-REV DETECTOR — three arms over every line of every report and
 * brief, each match counted per `file::matched-text`:
 *   - ARM 1 — a count token and a MOVING-REV token adjacent to each other in
 *     EITHER word order (`N … at HEAD` and `at HEAD … reports N`), where
 *     adjacency is up to five non-quoted tokens between them, and the count may
 *     be dressed (`**412**`, `| 412 |`, `412 (tracked)`, `"412"`, `412:`) or
 *     undressed. It is about the TOKEN, not about one English sentence shape:
 *     earlier rounds matched the literal word `at` and one word class, and so
 *     missed the reverse order — live in this corpus at
 *     `.scratch/v28/reports/slice-6b-fix-1.md:292` — plus labels the word class
 *     could not spell, and every non-`at` connector.
 *   - ARM 2 — a `git` read whose REVISION is a moving one, whatever the
 *     subcommand and whatever precedes it: `git show HEAD:p`, `git --no-pager
 *     log HEAD`, `git -C <dir> show HEAD`, `git -c core.pager=cat show HEAD`,
 *     `git show "HEAD"`, `git rev-parse 'HEAD'`, `git diff <sha>..HEAD`. Global
 *     options and quoting are part of the spelling; matching them is a fix, not
 *     a widening.
 *   - ARM 3 — a counted git command that names NO fixed revision:
 *     `git <anything> … | wc -l`, INCLUDING a pipeline that filters in between
 *     (`git ls-files src | grep -c '\.ts$' | wc -l`). This is a PROPERTY, not
 *     the eight-name list it replaced, and the list was wrong in both
 *     directions: it missed `git show |
 *     wc -l`, `git reflog | wc -l`, `git blame <file> | wc -l` and `git annotate
 *     <file> | wc -l` (all HEAD-resolving) and it fired on `git branch | wc -l`
 *     and `git stash | wc -l`. Under the property all six fire, because a count
 *     taken from a git command that names no fixed revision has no reproducible
 *     provenance — `git branch` counts moving refs, `git status --porcelain |
 *     wc -l` counts the working tree. THE WORKING-TREE COUNT IS THEREFORE
 *     ENFORCED HERE, not a ceiling: naming a fixed sha (which the sha rule then
 *     verifies) is what makes the arm stand down.
 *
 * REPAIRED BY THE ROUND-6 REVIEW'S BOUNDED REPAIR, each with a behaviour check
 * that CAN fail (a mutation of its own anchor makes the check red), so these are
 * no longer ceilings:
 *   - (B1) A DRESSED COUNT NAMING A SHA: `**412** tracked files at deadbee`,
 *     `412 (tracked) files at deadbee`, `| 412 | tracked files at deadbee |`,
 *     `"412"` and `412:` before the label. The count token used to require
 *     whitespace then a letter immediately after the digits, so the count was
 *     never recognised and the sha was neither counted nor verified. Four LIVE
 *     corpus lines carry the class in this dress and were absorbed by
 *     re-derivation, not by hand (`slice-6c-fix-2-review.md:226`,
 *     `slice-6c-fix-1-review.md:18`, `slice-6c-fix-3-review.md:165`,
 *     `briefs/slice-6c-fix-2.md:60`).
 *   - (B2) PUNCTUATION DIRECTLY AFTER THE SHA: `at deadbee, 276 tracked files`,
 *     `at deadbee: 276`, `The corpus, at 1c3471a, held 276 tracked files.` The
 *     gap required whitespace immediately after the sha, so a canonical token
 *     written inside a comma or a colon was not a provenance token at all — a
 *     wrong sha passed and the run did not even count a token.
 *   - (N1) A COUNT TAKEN THROUGH A FILTER: `git ls-files src | grep -c '\.ts$' |
 *     wc -l`. ARM 3 could not cross a pipe, so the arm's stated property — a
 *     counted git command that names no fixed revision — was wider than the
 *     mechanism.
 *   - (N2) A BARE `@{…}` REFLOG LABEL: `276 tracked files at @{2}`
 *     (`git rev-parse @{2}` == `git rev-parse HEAD@{2}`, measured). The old `@`
 *     lookahead suppressed the bare reflog form while the surrounding text
 *     called `@` a moving revision.
 *   - (N3) THE `--repo` NOTE now says what actually happened: when `--repo` is
 *     given it is an instruction, and a non-worktree `--repo` is reported as the
 *     reason the shas were not verified rather than claiming all three
 *     candidates were consulted.
 *
 * WHAT IT STILL CANNOT SEE, stated rather than implied — the exact shapes, so
 * this can be judged rather than trusted:
 *   - A COUNT WHOSE PROVENANCE IS IMPLIED AND NOT WRITTEN: `2067 passed (2067)`
 *     names no commit and no moving ref, so no arm fires. The canonical form is
 *     enforceable only where a provenance is STATED — which is why the summary
 *     claim names bare HEAD and unresolvable shas, not "every count".
 *   - A RESOLVABLE BUT WRONG COMMIT: `… at 1c3471a` passes when 1c3471a is A
 *     commit, whether or not it is the tree the count came from. Verification
 *     closes "the sha does not exist or is not a commit"; it cannot close
 *     "the sha is the wrong one". This is the residue of the ruling and it is
 *     declared, not implied.
 *   - A SHA PROVENANCE WRITTEN WITHOUT THE `at` CONNECTOR: `… from 1c3471a`,
 *     `… of 1c3471a`, `3 commits before 1c3471a`. The canonical connector is
 *     `at`, and only it starts the verification; a count whose sha provenance is
 *     spelled otherwise is not verified. Requiring the connector is what keeps
 *     a `->`-separated content-hash table from being read as provenance, which
 *     is the trade this ceiling buys.
 *   - A PROVENANCE TOKEN THAT IS NEITHER A MOVING REV NOR A SHA: `… at latest`,
 *     `… at 71bdd5` (six hex characters, below the 7-character sha floor). A
 *     non-commit-looking token is indistinguishable from ordinary prose; the
 *     floor is 7 because that is the shortest sha git itself prints.
 *   - A MOVING REV WRITTEN AS A PLACEHOLDER OR AS PART OF ANOTHER REF: `<HEAD>`
 *     is how a report names the bare token while quoting it, and `MERGE_HEAD`,
 *     `ORIG_HEAD`, `FETCH_HEAD`, `REBASE_HEAD` hold the token as a substring.
 *     None is read as a revision: ARM 1's gap ends in whitespace, so a
 *     `<`-bounded token is never reached, and the left token boundary keeps the
 *     reverse-order arm off `MERGE_HEAD`-style refs. Deliberate and
 *     behaviour-checked (a seeded control turns red when the boundary goes).
 *   - A BARE `@` FOLLOWED BY A WORD CHARACTER: `user@example.com`, `@decorator`.
 *     The token's own `(?!\w)` END assertion is the mechanism — `@` followed by
 *     a word character is not a standalone token — and it is behaviour-checked
 *     (removing the assertion turns the seeded email/decorator control red).
 *     `@` followed by anything else IS a revision, and `@{…}` is matched by its
 *     own alternative (see N2 above).
 *   - OTHER MOVING REFS: a branch name (`main`), a tag, `ORIG_HEAD`,
 *     `MERGE_HEAD`, `FETCH_HEAD`, `REBASE_HEAD`, `refs/heads/*`. They move on a
 *     push or a fetch exactly as HEAD moves on a commit, but they are
 *     indistinguishable from ordinary prose, so they are not matched.
 *   - ARM 1 IS A LEXICAL PROXIMITY RULE, not a provenance classifier: a
 *     sentence that merely mentions a moving revision within five tokens of a
 *     count fires even when the count's subject is something else, and the
 *     count token's dress window (`**412**`) widens what counts as a count. That
 *     is the declared cost of a token rule where a phrase list used to be, and
 *     it is why this half is the DETECTOR half while `N at <sha>` + verification
 *     is the DECIDABLE half.
 *   - ARM 3 DOES NOT TELL A TEMPLATE FROM A MEASUREMENT: `git ls-tree -r
 *     --name-only <c> .scratch | wc -l` (a placeholder in a command the report
 *     is explaining) fires like a real count, because it names no revision
 *     either. A placeholder command is a command the reader cannot run.
 *   - FILESYSTEM COUNTS: `ls | wc -l`, `wc -l < file`. They read the working
 *     tree, which is at no commit, but they are also the guard's own basis, and
 *     forbidding them would forbid every verify run. They are NOT flagged — a
 *     named ceiling, not an oversight: arm 3 is scoped to GIT counts, and this
 *     one cannot be enforced without failing the guard's own evidence.
 *   - FILES OUTSIDE SCOPE: `.scratch/v28/ledger.md` (line 7091 carries the
 *     class and is recorded as known-open in `factory/decisions.md`), `plan.md`,
 *     older V28 lanes, and every non-`.md` extension.
 * This is a DETECTOR over the class's shapes, not a proof that no other shape
 * exists. The DECIDABLE half is `N at <sha>` + verification: there, a violation
 * fails mechanically.
 *
 * FORWARD-ONLY, and that is a hard requirement. `factory/decisions.md` D-011
 * item 2 rules that a historical record KEEPS its original label: a record
 * retro-edited to look always-right is not evidence. So the known occurrences
 * are recorded in the baseline below, the run PRINTS the baseline's size at run
 * time (a size typed into the header would go stale in this file's own text),
 * and only an occurrence that is not in it fails. The baseline shrinks only by a
 * deliberate edit, and a widened arm is absorbed by RE-DERIVING the map from the
 * instrument's own matches (D-021 item 2), never by typing a key.
 *
 * EVERY MATCH ON A LINE IS COUNTED. `.exec()` counted the FIRST match and
 * silently dropped the rest, so appending a second occurrence to a line that
 * already carried a counted one left the total unchanged — the reviewer doubled
 * a `265 at HEAD` on one line and the guard still exited 0. `matchAll` now
 * enumerates every match.
 */
const MOVING_REV = String.raw`HEAD(?:~[0-9]*|\^[0-9]*|@\{[^}]*\})?|@`
const FIXED_SHA = /\b[0-9a-f]{7,40}\b/
const BACKTICK = '`'

// A count token: a standalone number, optionally carrying the dress a report
// puts around a count (`**412**`, `"412"`, `` `412` ``, `412:`, `412 (tracked)`,
// `| 412 |`), followed within two tokens by the label it counts. The label
// requirement is what keeps a number that is not a quantity — a version
// fragment, a table cell holding another number — out of a rule about counts.
const COUNT_TOKEN = String.raw`(?<![\d/.\w])\d+(?![/\d])[^\s\w/]{0,3}(?=\s[^\s]*\s?[a-zA-Z` + BACKTICK + String.raw`])`
// Between the count and the revision, in EITHER ORDER: punctuation attached to
// the token that precedes it (`,`, `:`, `)`, `**` — `at 1c3471a, 276 files` is
// the commonest English parenthetical), then up to FIVE tokens. Five, not four,
// because a table row puts a cell separator between a count and its label
// (`| 412 | tracked files | at HEAD`). A token is a whitespace-delimited run and
// a quoted string is not one, so a quote ends the run.
const COUNT_GAP = String.raw`[^\s]*?(?:\s[^\s'"“”]+){0,5}\s+`
// A moving revision as a STANDALONE token — not the `HEAD` inside `MERGE_HEAD`,
// not a revision a count label reaches mid-word — ending at `(?!\w)` rather than
// `\b`, because `@` ends in a non-word character and the trailing `\b` truncated
// the token for `HEAD^`/`HEAD@{}` and dropped the `@` arm entirely. One `@`
// alternative covers every shape: the bare shorthand (`at @`), the reflog
// selector (`@{2}` — a moving revision in its own right, `git rev-parse @{2}` ==
// `git rev-parse HEAD@{2}` measured), and `@{upstream}`; there is no separate
// `@{…}` alternative because the end assertion already admits `{`, and an arm
// that cannot be reached is the defect this rule exists to stop. The end
// assertion is what keeps `@` off `user@example.com` and `@decorator`. The left
// boundary is what keeps the reverse-order arm (`HEAD … N`) off
// `MERGE_HEAD`/`ORIG_HEAD`; ARM 1's gap ends in whitespace, so `<HEAD>` never
// reaches the token either way.
const REV_TOKEN = String.raw`(?<![\w<])(?:${MOVING_REV}|working (?:tree|copy|directory))(?!\w)`
// A git invocation, options and all: `git [options] <lowercase-subcommand>`.
// Global options (`--no-pager`, `-C <dir>`, `-c k=v`) precede the subcommand and
// are part of the real spelling, which the old pattern could not see.
const GIT_CMD = String.raw`\bgit\s+(?:--?[A-Za-z][\w-]*(?:[=\s]\S{1,40})?\s+){0,4}[a-z][a-z-]*\b`
// What may introduce a revision argument: whitespace, a quote, `(`, `=`, or the
// `..`/`...` of a range.
const REV_LEAD = String.raw`(?:[\s"'` + BACKTICK + String.raw`(=]|\.{2,3})`

// ARM 1 — the count label, either word order (the alternative round 5 lacked:
// `at HEAD the corpus reports 90 documents` is a live member of the class and
// the guard used to PASS it).
const BARE_HEAD_COUNT_AT = new RegExp(String.raw`(?:${COUNT_TOKEN}${COUNT_GAP}${REV_TOKEN}|${REV_TOKEN}${COUNT_GAP}${COUNT_TOKEN})`, 'g')
// ARM 2 — a git read whose REVISION is a moving one, whatever the subcommand,
// whatever global options precede it, however the revision is quoted.
const BARE_HEAD_COUNT_CMD = new RegExp(String.raw`${GIT_CMD}[^\n|` + BACKTICK + String.raw`]{0,120}?${REV_LEAD}(?:${MOVING_REV})(?![\w])`, 'g')
// ARM 3 — a COUNT taken from a git command that names NO fixed revision. The
// property, not the subcommand list: `git show|reflog|blame|annotate` (which the
// list missed) and `git branch|stash|status` (which it fired on wrongly) all
// fire, because none of them names a commit the reader can go to. The middle
// class CROSSES pipes, because a lane counting through a filter
// (`git ls-files src | grep -c '\.ts$' | wc -l`) has no more provenance than
// `git ls-files src | wc -l` and the arm's stated property covers both.
const BARE_HEAD_COUNT_WC = new RegExp(String.raw`${GIT_CMD}[^\n` + BACKTICK + String.raw`]{0,160}?\|\s*wc\b`, 'g')
// The provenance token of a count, in the two positions that ARE provenance: the
// canonical `N … at <sha>` label (either order) and the revision of a counted
// git command. `SHA_TOKEN` is 7-40 lowercase hex, quote-dressed or not.
const SHA_TOKEN = String.raw`[0-9a-f]{7,40}`
const COUNT_AT_SHA = new RegExp(
  String.raw`(?:${COUNT_TOKEN}${COUNT_GAP}at\s+(?:the\s+)?["'` + BACKTICK + String.raw`]?(\b${SHA_TOKEN}\b)|at\s+(?:the\s+)?["'` + BACKTICK + String.raw`]?(\b${SHA_TOKEN}\b)${COUNT_GAP}${COUNT_TOKEN})`,
  'g',
)
const COUNT_CMD_SHA = new RegExp(String.raw`${GIT_CMD}[^\n|` + BACKTICK + String.raw`]{0,120}?["'` + BACKTICK + String.raw`]?(\b${SHA_TOKEN}\b)[^\n]*\|\s*wc\b`, 'g')

// One scan over all three arms, every match on the line.
const BARE_HEAD_COUNT = new RegExp([BARE_HEAD_COUNT_AT.source, BARE_HEAD_COUNT_CMD.source, BARE_HEAD_COUNT_WC.source].join('|'), 'g')
// "Does this matched text carry a moving revision?" — asked with the SAME token
// semantics the arms use (a standalone token with its left and right boundaries),
// not with a bare `@`/`HEAD` search, so the arm-3 fixed-sha exemption cannot be
// defeated by an `@` in prose.
const MOVING_REV_RE = new RegExp(REV_TOKEN)
const BARE_HEAD_BASELINE = new Map([
  // Re-derived from THIS instrument's own matches under the three arms above —
  // never typed, never extended by hand (D-021 item 2). The run prints the size
  // at run time. Forward-only, per D-011 item 2: a historical record keeps its
  // original label and is absorbed here rather than rewritten.
  [".scratch/v28/briefs/slice-1-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-2-verify.md::1`, `git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-2a-verify.md::1. **State first, verbatim.** `git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-2b-verify.md::1. **State first.** `git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-2c-verify.md::1. **State first.** `git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-3-verify.md::git log --oneline c9ab382..HEAD", 1],
  [".scratch/v28/briefs/slice-3a-verify.md::1. **State first.** `git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-3b-verify.md::1. **State first.** `git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-3c-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-4a-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-4b-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-4c-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-6.md::2. The copy-field guard **passes on HEAD", 1],
  [".scratch/v28/briefs/slice-6a-fix-5.md::41 checks on HEAD", 1],
  [".scratch/v28/briefs/slice-6a.md::2. **The guard passes on HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-1-completion.md::git ls-files .scratch | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-1-review.md::git diff c484648..HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-1-verify.md::git ls-files '.scratch/**/*.mjs' | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-1-verify.md::git ls-files .scratch | wc", 2],
  [".scratch/v28/briefs/slice-6c-fix-1.md::git grep --untracked --fixed-strings -- \"$PAT\" -- . | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-2-review.md::git diff 0205c8d..HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-2-verify.md::git diff 0205c8d..HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-2.md::265 at HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-2.md::git ls-files .scratch | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-2.md::git ls-tree -r --name-only <c> .scratch | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-3.md::259 at `ce3479c`/`32e9f48`, 265 at HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-3.md::265 at HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-3.md::git ls-files .scratch | wc", 2],
  [".scratch/v28/briefs/slice-6c-fix-4.md::265 at HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-4.md::276 tracked \\`.scratch\\` files at HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-5.md::265 at HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-5.md::7091`** (`265 at HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-5.md::HEAD). **Round 4:**", 1],
  [".scratch/v28/briefs/slice-6c-fix-5.md::git ls-tree -r --name-only HEAD", 2],
  [".scratch/v28/briefs/slice-6c-fix-5.md::git ls-tree … HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-5.md::git ls-tree … | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-5.md::git show HEAD", 5],
  [".scratch/v28/briefs/slice-6c-fix-6.md::55) — all of which resolve HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::HEAD the corpus reports 90", 2],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git --no-pager log HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git -C <dir> show HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git -c core.pager=cat show HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git annotate <file> | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git blame <file> | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git branch | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git reflog | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git rev-parse 'HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git show \"HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git show | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git stash | wc", 1],
  [".scratch/v28/briefs/slice-6c-fix-6.md::git status --porcelain | wc", 1],
  [".scratch/v28/reports/slice-6b-fix-1.md::HEAD the corpus reports 90", 1],
  [".scratch/v28/reports/slice-6b-fix-1.md::git show HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-review.md::259 at ce3479c/32e9f48, 265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-review.md::262 at c484648, 265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-review.md::265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-1-review.md::git diff --stat c2ec32e..HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-review.md::git diff --stat c484648..HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-review.md::git diff c484648..HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-review.md::git ls-files '.scratch/**/*.mjs' '.scratch/*.mjs' | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-1-review.md::git ls-files .scratch | wc", 4],
  [".scratch/v28/reports/slice-6c-fix-1-review.md::git ls-tree -r --name-only <c> .scratch | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::262 @", 2],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::262 real, at c484648 and HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::git ls-files '.scratch/**/*.mjs' | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::git ls-files .scratch | wc", 3],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::git ls-tree -r --name-only HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::git rev-parse HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::git show --name-only --format=\"%H\" HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::git show --stat HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1.md::git grep --untracked -F -f /tmp/g1demo/needle.txt -- . | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-1.md::git grep --untracked -F -f /tmp/g1demo/needle.txt -- src e2e scripts supabase | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-1.md::git grep … \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-1.md::git ls-files .scratch \\| wc", 2],
  [".scratch/v28/reports/slice-6c-fix-1.md::git ls-files .scratch | wc", 3],
  [".scratch/v28/reports/slice-6c-fix-1.md::git show HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::163`, HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::2) measures 271 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::2. `ladder:` `265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::259 at `ce3479c`/`32e9f48`, 265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::271 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::3** at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::439 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::git diff 0205c8d..HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::git ls-files .scratch \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::git ls-files .scratch | wc", 3],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::git ls-tree -r --name-only $c .scratch \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::git ls-tree -r --name-only HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-verify.md::259 at `ce3479c`/`32e9f48`, 265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-verify.md::265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-2-verify.md::265` was HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-verify.md::46`). Run at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-verify.md::git diff 0205c8d..HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-2-verify.md::git ls-files '.scratch/**/*.mjs' | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-2-verify.md::git ls-files .scratch | wc", 3],
  [".scratch/v28/reports/slice-6c-fix-2-verify.md::git rev-parse --short HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2.md::git ls-files .scratch \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-2.md::git ls-files .scratch | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-2.md::git ls-tree -r --name-only $c .scratch | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::2 working tree", 2],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::2067** at its HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::276 tracked `.scratch` files at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::6`) names `71bdd55` as the HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::git diff --stat 71bdd55..HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::git ls-files .scratch \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::git ls-files .scratch | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::git ls-tree -r --name-only \"$c\" .scratch | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::git ls-tree -r --name-only <c> .scratch \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::HEAD, git absent (shim exits 127,", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::git archive HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::git diff b4a8b73..HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::git log --oneline a4b3cf5..HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::git ls-files .scratch \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::git ls-tree -r --name-only HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3.md::0 / HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3.md::265 `0205c8d` / 276 HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3.md::265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-3.md::HEAD (276 = 276,", 1],
  [".scratch/v28/reports/slice-6c-fix-3.md::git diff a4b3cf5..HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3.md::git ls-tree -r --name-only \"$c\" .scratch | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-3.md::git ls-tree -r --name-only <sha> .scratch \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-3.md::git rev-parse HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::0; lines containing the word HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::1: a count is labelled HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::23 recorded occurrence(s); a count labelled HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::29` — `before (git show HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::32) — the starting HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::57 $ git ls-tree -r --name-only HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::7091 259 at `32e9f48`, 265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::7091` (`265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::git ls-files .scratch/v28/reports .scratch/v28/briefs | grep '\\.md$' | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::git ls-tree -r --name-only HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::git show HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-4-verify.md::1: a count is labelled HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4-verify.md::23 recorded occurrence(s); a count labelled HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-4-verify.md::265 at HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-4-verify.md::265 at HEAD\\n265 at HEAD\\n265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-4-verify.md::412 tracked files at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-4-verify.md::5: a count is labelled HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4.md::1: a count is labelled HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4.md::23 recorded occurrence(s); a count labelled HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-4.md::HEAD the corpus reports 90", 2],
  [".scratch/v28/reports/slice-6c-fix-4.md::git show HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::11 branch names, HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::11; `git rev-parse @", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::2, `slice-6c-fix-3-review.md::265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::207 files at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::259 at 32e9f48, 265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::265 at HEAD and 87 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::265 at the working tree", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::271 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::280 files (tracked) at HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::280 files in src/lib at HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::280 tracked .scratch files at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::280 tracked `.scratch` files at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::280 tracked file(s) at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::280 tracked files at @", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::280 tracked files at HEAD", 5],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::2} are not HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::4 control lines, wildcard @", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::450` — `git show HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::55) — every one resolves HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::550`); `the total is 265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::6.** At the current working tree", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::87 as of HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::87 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::87 measured on HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::87 occurrences at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::87, taken at HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::@{2} form…` / `the count is 5", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::HEAD by default, 327", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::HEAD the corpus reports 90", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::HEAD/x` — all `PASS exit 0`.", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::HEAD: 87", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::HEAD; commits `1282871` (round 5)", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git --no-pager log HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git --no-pager show \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git --no-pager show | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git -C /tmp/ws show HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git -C <dir> show HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git -c core.pager=cat show HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git annotate <file> | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git annotate package.json \\| wc", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git annotate package.json | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git blame <file> | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git blame package.json \\| wc", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git blame package.json | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git branch \\| wc", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git branch | wc", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git cat-file -p HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git cherry \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git cherry | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git describe \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git describe | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git diff --cached HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git diff \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git for-each-ref | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git log --oneline -1 \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git log --oneline -1 | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git log --oneline HEAD~1", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git log -1 --format=%H | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git log HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git log \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git log | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git log … | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git ls-files \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git ls-tree -r --name-only @", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git ls-tree -r --name-only HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git merge-base HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git reflog \\| wc", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git reflog show \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git reflog show | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git reflog | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git rev-list --count HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git rev-list \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git rev-list | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git rev-parse 'HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git rev-parse @", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git rev-parse HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git shortlog \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git shortlog | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show \"HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show --stat \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show --stat | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show @", 4],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show HEAD", 11],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show HEAD@{2}", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show HEAD@{upstream}", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show HEAD^", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show HEAD~1", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show HEAD~3", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show \\| wc", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show | wc", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git show' 'git show --stat' 'git reflog' 'git blame package.json' 'git annotate package.json' 'git branch' 'git stash list'; do printf '%-30s %s\\n' \"$p\" \"$(eval $p | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git stash \\| wc", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git stash list | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git stash | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git status --porcelain \\| wc", 2],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git status --porcelain | wc", 3],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git tag | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-review.md::git worktree list | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::0 findings: the @", 1],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::280 tracked files at @", 2],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::2} are not HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::7 @", 1],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::@` shapes caught (arm 2", 1],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::HEAD, commits `1282871` (round 5)", 1],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::git ls-tree -r --name-only @", 2],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::git ls-tree -r --name-only HEAD@{2}", 1],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::git ls-tree -r --name-only HEAD^", 1],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::git show @", 2],
  [".scratch/v28/reports/slice-6c-fix-5-verify.md::git status --porcelain | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::1`, `… at @", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::4 files mention the @", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::HEAD when round 4", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::HEAD`. Arm 3", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::git command that resolves to `HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::git diff | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::git grep | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::git ls-files | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::git ls-tree -r --name-only $c .scratch | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::git ls-tree -r --name-only <HEAD> … | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::git ls-tree -r --name-only <c> .scratch \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-5.md::git status --porcelain | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::2067** at its HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::259 at `32e9f48`, 265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::262 @", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::265 at HEAD\\\\n265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::265 at HEAD\\n265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::276 tracked files at @", 6],
  [".scratch/v28/reports/slice-6c-fix-6.md::280 files (tracked) at HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::280 files in src/lib at HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::280 tracked .scratch files at HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::2}` (`git rev-parse @", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::2}` == `git rev-parse HEAD@{2}", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::2}` as well as `at @", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::3** at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::4 files mention the @", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::412 \\\\| tracked files \\\\| at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::412 \\| tracked files \\| at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::412 | tracked files | at HEAD", 6],
  [".scratch/v28/reports/slice-6c-fix-6.md::412\" … at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::412** tracked files at HEAD", 6],
  [".scratch/v28/reports/slice-6c-fix-6.md::412: tracked files at HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::412: … at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::412\\\" tracked files at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::412\\\" … at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::87 as of HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::87, taken at HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::@ c484648 / 23`),", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::@ c484648, 265", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::HEAD the corpus reports 90`,", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git --no-pager log HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::git -C /tmp/ws show HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::git -c core.pager=cat show HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::git annotate package.json | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::git blame package.json | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::git blame package.json' 'git annotate … | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::git branch \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git branch | wc", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::git branch\\|stash\\|status … \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git log --oneline \\\\| grep -c \\\"round 6\\\" \\\\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git log --oneline \\| grep -c \"round 6\" \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git log --oneline | grep -c \\\"round 6\\\" | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git log --oneline | grep -c \\\\\\\"round 6\\\\\\\" | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git ls-files src \\\\| grep -c \\\"\\\\.ts$\\\" \\\\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git ls-files src \\| grep -c \"\\.ts$\" \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git ls-files src | grep -c \\\"\\.ts$\\\" | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git ls-files src | grep -c \\\\\\\"\\\\.ts$\\\\\\\" | wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git ls-tree -r --name-only <c> .scratch | wc", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::git ls-tree -r --name-only <sha> .scratch | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::git reflog | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::git rev-parse 'HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-6.md::git rev-parse HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::git show \"HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git show HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::git show \\\"HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::git show \\\\\\\"HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git show | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::git show\\|reflog\\|blame\\|annotate … \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git stash \\| wc", 1],
  [".scratch/v28/reports/slice-6c-fix-6.md::git stash | wc", 2],
  [".scratch/v28/reports/slice-6c-fix-6.md::git status --porcelain \\\\| wc", 3],
  [".scratch/v28/reports/slice-6c-fix-6.md::git status --porcelain \\| wc", 3],
  [".scratch/v28/reports/slice-6c-fix-6.md::git status --porcelain | wc", 4],
  [".scratch/v28/reports/slice-6c.md::git grep --fixed-strings -- \"$PAT\" -- . | wc", 2],
  [".scratch/v28/reports/slice-6c.md::git grep --untracked --fixed-strings -- \"$PAT\" -- . | wc", 1],
  [".scratch/v28/reports/slice-6c.md::git ls-files .scratch | wc", 1],
  [".scratch/v28/reports/slice-6c.md::git show HEAD", 4],
])

const BARE_HEAD_BASELINE_SIZE = [...BARE_HEAD_BASELINE.values()].reduce((sum, n) => sum + n, 0)

/**
 * The repository provenance shas are resolved against, with the reason, so the
 * note a reader sees describes what actually happened. The seam the behaviour
 * checks need: they run in git-less temp roots, and a rule that could not run
 * there would be untestable through its own seam. `--repo <dir>` is an
 * INSTRUCTION, not a hint: when it is given and is not a worktree the shas are
 * NOT verified and the other two candidates are NOT substituted for it — a stale
 * `--repo` must be loud, not silently ignored. `repo: null` means "no
 * repository can answer", which is a printed note and no finding — never a
 * manufactured one, never a silent pass.
 */
function resolveRepo() {
  const repoFlag = argv.indexOf('--repo')
  const own = resolve(join(import.meta.dirname, '..', '..'))
  if (repoFlag !== -1) {
    const dir = resolve(argv[repoFlag + 1])
    if (existsSync(join(dir, '.git'))) return { repo: dir, why: `--repo ${dir}` }
    return {
      repo: null,
      why: `--repo ${dir} was given and is not a git worktree — an explicit --repo is an instruction, so neither the scan root nor this instrument's own repository was consulted`,
    }
  }
  if (existsSync(join(ROOT, '.git'))) return { repo: ROOT, why: 'the scan root' }
  if (existsSync(join(own, '.git'))) return { repo: own, why: `this instrument's own repository (${own}); the scan root is not a worktree` }
  return { repo: null, why: "neither the scan root nor this instrument's own repository is a git worktree" }
}

/** Is `sha` a commit in `repo`? The decidability half's only git call. */
function isCommit(repo, sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repo, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function checkReportHeadCounts() {
  console.log(`  note — no-bare-head-count: baseline holds ${BARE_HEAD_BASELINE_SIZE} recorded occurrence(s); a new count resolved through bare HEAD is a finding`)
  const dirs = ['reports', 'briefs'].map((d) => join(ROOT, '.scratch', 'v28', d))
  const files = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) files.push(join(dir, f))
  }
  if (!files.length) {
    console.log('  note — no .scratch/v28/reports or briefs under this root; report and brief counts unchecked here')
    console.log('  note — count-provenance: no report or brief to verify a provenance sha in; unchecked here')
    return { reportFiles: 0, provenanceChecked: false }
  }
  discloseScanProvenance(files)

  // THE DECIDABLE HALF. Every count's provenance token is resolved against a
  // real repository; a sha that is not a commit there is a finding, never a
  // ceiling and never a baseline entry.
  const { repo, why } = resolveRepo()
  const shaIsCommit = new Map()
  const alreadyReported = new Set()
  let provenanceTokens = 0
  let unresolvable = 0
  if (!repo) {
    console.log(`  note — count-provenance: no git worktree to resolve provenance shas against — ${why}; the provenance shas of counts are NOT verified here, and no finding is reported for them`)
  }

  const seen = new Map()
  for (const path of files) {
    const rel = relative(ROOT, path)
    const lines = readFileSync(path, 'utf8').split('\n')
    for (const [index, line] of lines.entries()) {
      // EVERY match on the line, not only the first: `.exec()` dropped the rest,
      // so a second occurrence appended to an already-counted line was invisible.
      for (const match of line.matchAll(BARE_HEAD_COUNT)) {
        const text = match[0].trim()
        // ARM 3 names no revision by construction; if it names a fixed commit,
        // that IS the fix this rule asks for and it is not a finding.
        if (!MOVING_REV_RE.test(text) && FIXED_SHA.test(text)) continue
        const key = `${rel}::${text}`
        const seenCount = (seen.get(key) ?? 0) + 1
        seen.set(key, seenCount)
        if (seenCount > (BARE_HEAD_BASELINE.get(key) ?? 0)) {
          fail(
            'no-bare-head-count',
            `${rel}:${index + 1}: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: ${JSON.stringify(text)}`,
          )
        }
      }
      for (const pattern of [COUNT_AT_SHA, COUNT_CMD_SHA]) {
        for (const match of line.matchAll(pattern)) {
          const sha = match[1] ?? match[2]
          provenanceTokens += 1
          if (!repo) continue
          if (!shaIsCommit.has(sha)) shaIsCommit.set(sha, isCommit(repo, sha))
          if (shaIsCommit.get(sha)) continue
          unresolvable += 1
          const key = `${rel}::${sha}`
          if (alreadyReported.has(key)) continue
          alreadyReported.add(key)
          fail(
            'count-provenance-unresolvable',
            `${rel}:${index + 1}: a count's provenance names ${sha}, which is not a commit in this repository (\`git cat-file -e ${sha}^{commit}\` fails) — name a commit a reader can resolve`,
          )
        }
      }
    }
  }
  if (repo) {
    const label = relative(ROOT, repo)
    console.log(`  note — count-provenance: ${provenanceTokens} provenance token(s) in the scan, ${shaIsCommit.size} distinct sha(s) resolved with \`git cat-file -e <sha>^{commit}\` against ${label && !label.startsWith('..') ? label : repo} (${why}) — ${unresolvable} unresolvable`)
  }
  return { reportFiles: files.length, provenanceChecked: Boolean(repo) }
}

/**
 * GIT CONTENT vs FILESYSTEM CONTENT. The report/brief scan walks the WORKING
 * TREE. When the root IS a git worktree, the walk is cross-checked against
 * `git ls-files` so the run says WHICH one it read instead of assuming disk
 * happens to equal the tracked set. A scanned file git does not track is
 * working-tree content: reproducible in this worktree, at no commit. A
 * disclosure, not a rule — a round legitimately writes reports before they are
 * committed — and silent where the root is a throwaway temp dir.
 */
function discloseScanProvenance(files) {
  if (!existsSync(join(ROOT, '.git'))) {
    console.log('  note — no-bare-head-count: this root is not a git worktree; the scan read FILESYSTEM (working-tree) content only')
    return
  }
  let tracked
  try {
    tracked = new Set(
      execFileSync('git', ['ls-files', '-z', '.scratch/v28/reports', '.scratch/v28/briefs'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split('\0')
        .filter(Boolean),
    )
  } catch {
    console.log('  note — no-bare-head-count: git ls-files was not runnable here; the scan read FILESYSTEM (working-tree) content only')
    return
  }
  const onDisk = files.map((f) => relative(ROOT, f))
  const untracked = onDisk.filter((r) => !tracked.has(r))
  const absent = [...tracked].filter((t) => !onDisk.includes(t))
  console.log(`  note — no-bare-head-count: scanned ${onDisk.length} WORKING-TREE file(s); git tracks ${tracked.size} under the same paths (${untracked.length} untracked, ${absent.length} tracked-but-absent)`)
  for (const u of untracked) console.log(`  note — ${u} is UNTRACKED: its counts are working-tree content, at no commit`)
}


// ---------------------------------------------------------------------------

console.log('Factory guard — the scheduler registry and the work state')
console.log('===========================================================')

const config = readConfig()
checkRegistry(config)
checkWorkItems(config)
checkAgentModels(config)
const headerFiles = checkInstrumentHeaders()
const { reportFiles, provenanceChecked } = checkReportHeadCounts()

if (!findings.length) {
  const items = existsSync(join(FACTORY, 'work')) ? readdirSync(join(FACTORY, 'work')).filter((f) => f.endsWith('.json')).length : 0
  const models = Object.keys(config?.models ?? {}).length
  const kinds = Object.keys(config?.task_kinds ?? {}).length
  // The summary claims only the checks that were actually run: a root with no
  // scripts/guards has no header to vouch for, and saying otherwise is the same
  // failure this guard exists to catch.
  const claims = ['every floor meetable', 'every artifact present']
  if (headerFiles) claims.push('every instrument header stating only what it can point at')
  if (reportFiles) claims.push('no report or brief count resolved through bare HEAD beyond the recorded baseline')
  if (provenanceChecked) claims.push("every count's provenance sha resolving as a commit")
  console.log(`  ok — ${models} model(s), ${kinds} task kind(s), ${items} work item(s); ${claims.join(', ')}`)
  console.log()
  console.log('PASS — the registry can be trusted and no work item claims evidence it does not have.')
  process.exit(0)
}

for (const f of findings) console.log(`  FINDING [${f.check}]: ${f.msg}`)
console.log()
console.log(`FAIL — ${findings.length} factory finding(s).`)
process.exit(1)
