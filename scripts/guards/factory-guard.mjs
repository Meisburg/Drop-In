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
//                         HEAD — an "N … at HEAD" label (any HEAD spelling),
//                         a `git … HEAD` read whatever the subcommand, or a
//                         counted command that defaults to HEAD with no
//                         revision named (`git log … | wc -l`) — instead of
//                         naming the commit it was measured at. Such a count is
//                         unreproducible by construction: the commit carrying
//                         the sentence is the one that moves HEAD. Forward-only,
//                         and the run prints the size of the recorded baseline
//                         it passes.
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
//     level — every line, for the bare-HEAD shapes.
//   NOT read, and therefore NOT counted: .scratch/v28/ledger.md,
//   .scratch/v28/plan.md, other V28 lanes and older versions, any file BELOW
//   the directories named above (every walk is non-recursive), any extension
//   other than the ones named, and any file's git status. The report/brief scan
//   is PRESENCE ON DISK, not `git ls-files`: a tracked file absent from the tree
//   is not seen, and a present untracked file IS seen.
//
// Usage:  node scripts/guards/factory-guard.mjs [--root <dir>]
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
 * A count in a report or a brief must name the commit it was measured at.
 *
 * WHY THIS EXISTS. `instrument-headers-honest` reads guard HEADERS; this class
 * kept recurring in report PROSE, where no instrument was looking. A count
 * written as "N at HEAD" is unreproducible BY CONSTRUCTION — the commit that
 * carries the sentence is the one that moves HEAD, so the number was measured at
 * one commit and read at another. It has now cost four review rounds.
 *
 * THE WIDENED CLASS. Four rounds fixed instances of the `N at HEAD` shape while
 * reports kept producing the SAME class in two other shapes the old pattern
 * could not see: a tree count written `git ls-tree … HEAD | wc -l` (whose
 * `HEAD .scratch` argument the old pattern never reached), and a committed-blob
 * read written `git show HEAD:<path>`. The rule is named for the class — a count
 * whose provenance is bare HEAD — so the match now covers all three: an
 * `N … at HEAD` count label, a `git ls-tree … HEAD` listing, and a
 * `git show HEAD:<path>` read.
 *
 * WHAT IT STILL CANNOT SEE, stated rather than implied — the exact shapes, so
 * this can be judged rather than trusted:
 *   - OTHER MOVING REFS: a branch name (`main`), a tag, `ORIG_HEAD`,
 *     `MERGE_HEAD`, `FETCH_HEAD`, `REBASE_HEAD`, `refs/heads/*`. They move on
 *     a push or a fetch exactly as HEAD moves on a commit, but they are
 *     indistinguishable from ordinary prose, so they are not matched.
 *   - A COUNT WITH NO PROVENANCE AT ALL: `2067 passed (2067)` names no commit
 *     and no HEAD, and this instrument cannot tell whether it was measured at a
 *     commit or in the working tree. It is silent on it — which is why the
 *     summary line no longer claims otherwise.
 *   - A WRONG NAMED COMMIT: `… at 71bdd55` passes whether or not 71bdd55 is the
 *     tree measured. Naming a commit is necessary, not sufficient.
 *   - FILESYSTEM COUNTS: `ls | wc -l`, `wc -l < file`. They read the working
 *     tree, which is at no commit, but they are also the guard's own basis, and
 *     forbidding them would forbid every verify run. They are NOT flagged.
 *   - FILES OUTSIDE SCOPE: `.scratch/v28/ledger.md` (line 7091 carries the
 *     class and is recorded as known-open in `factory/decisions.md`),
 *     `plan.md`, older V28 lanes, and every non-`.md` extension.
 * This is a DETECTOR over the class's shapes, not a proof that no other shape
 * exists.
 *
 * FORWARD-ONLY, and that is a hard requirement. `factory/decisions.md` D-011
 * item 2 rules that a historical record KEEPS its original label: a record
 * retro-edited to look always-right is not evidence. So the known occurrences
 * are recorded in the baseline below, the run PRINTS the baseline's size at run
 * time (a size typed into the header would go stale in this file's own text),
 * and only an occurrence that is not in it fails. The baseline shrinks only by a
 * deliberate edit.
 *
 * EVERY MATCH ON A LINE IS COUNTED. `.exec()` counted the FIRST match and
 * silently dropped the rest, so appending a second occurrence to a line that
 * already carried a counted one left the total unchanged — the reviewer doubled
 * a `265 at HEAD` on one line and the guard still exited 0. `matchAll` now
 * enumerates every match; two live lines carry two matches each
 * (`slice-6c-fix-2-review.md:245`, `slice-6c-fix-3-review.md:177`) and record
 * two, not one.
 */
const MOVING_REV = String.raw`HEAD(?:~[0-9]*|\^[0-9]*|@\{[^}]*\})?|@(?![{\w])`
const FIXED_SHA = /\b[0-9a-f]{7,40}\b/

// Shape 1 — a count whose LABEL is a moving revision: "N … at HEAD" (any HEAD
// spelling), "N … at @", "N … at the working tree".
const BARE_HEAD_COUNT_AT = new RegExp(
  String.raw`(?<![\d/.\w])\d+(?![/\d])\s+(?:[a-z` + '`' + String.raw`][\w` + '`' + String.raw`.-]*\s+){0,4}\bat (?:the )?(?:${MOVING_REV}|working (?:tree|copy|directory))\b`,
  'g',
)
// Shape 2 — a git read whose REVISION is a moving one, whatever the subcommand:
// `git ls-tree … HEAD`, `git show HEAD:<path>`, `git rev-parse HEAD`,
// `git diff HEAD`, `git cat-file -p HEAD:<path>`. Structural, not the list of
// six command strings that happened to fail a review.
const BARE_HEAD_COUNT_CMD = new RegExp(String.raw`\bgit\s+[a-z][a-z-]*[^\n|` + '`' + String.raw`]*?\s(?:${MOVING_REV})\b`, 'g')
// Shape 3 — a COUNT taken from a git command that defaults to HEAD and names no
// revision at all: `git log … | wc -l`, `git rev-list … | wc -l`. The `| wc`
// requirement is what keeps this arm to counts and off ordinary prose.
const BARE_HEAD_COUNT_WC = /\bgit\s+(?:log|rev-list|shortlog|whatchanged|cherry|stash|branch|describe)\b[^|\n]*\|\s*wc\b/g

// One scan over all three shapes, every match on the line.
const BARE_HEAD_COUNT = new RegExp([BARE_HEAD_COUNT_AT.source, BARE_HEAD_COUNT_CMD.source, BARE_HEAD_COUNT_WC.source].join('|'), 'g')
const MOVING_REV_RE = new RegExp(MOVING_REV)
const BARE_HEAD_BASELINE = new Map([
  // Re-derived from THIS instrument's real matches under the widened pattern at
  // 87 recorded occurrence(s) across 47 keys (slice 6c fix round 5; see
  // .scratch/v28/reports/slice-6c-fix-5.md). Forward-only, per D-011 item 2: the
  // history keeps its labels and the baseline absorbs them; nothing below was
  // typed to make a run green.
  [".scratch/v28/briefs/slice-1-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-2-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-2a-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-2b-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-2c-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-3a-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-3b-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-3c-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-4a-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-4b-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-4c-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-2.md::265 at HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-3.md::265 at HEAD", 2],
  [".scratch/v28/briefs/slice-6c-fix-4.md::265 at HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-5.md::265 at HEAD", 2],
  [".scratch/v28/briefs/slice-6c-fix-5.md::git ls-tree -r --name-only HEAD", 2],
  [".scratch/v28/briefs/slice-6c-fix-5.md::git ls-tree … HEAD", 1],
  [".scratch/v28/briefs/slice-6c-fix-5.md::git show HEAD", 5],
  [".scratch/v28/reports/slice-6b-fix-1.md::git show HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-review.md::265 at HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::git ls-tree -r --name-only HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::git rev-parse HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::git show --name-only --format=\"%H\" HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1-verify.md::git show --stat HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-1.md::git show HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::265 at HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::271 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::439 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-review.md::git ls-tree -r --name-only HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-2-verify.md::265 at HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-2-verify.md::git rev-parse --short HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-3-review.md::276 tracked `.scratch` files at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::265 at HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::git archive HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::git ls-tree -r --name-only HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3-verify.md::git rev-parse HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-3.md::265 at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-3.md::git rev-parse HEAD", 1],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::265 at HEAD", 5],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::git ls-tree -r --name-only HEAD", 3],
  [".scratch/v28/reports/slice-6c-fix-4-review.md::git show HEAD", 4],
  [".scratch/v28/reports/slice-6c-fix-4-verify.md::265 at HEAD", 6],
  [".scratch/v28/reports/slice-6c-fix-4-verify.md::412 tracked files at HEAD", 2],
  [".scratch/v28/reports/slice-6c-fix-4.md::git show HEAD", 1],
  [".scratch/v28/reports/slice-6c.md::git show HEAD", 4],
])
const BARE_HEAD_BASELINE_SIZE = [...BARE_HEAD_BASELINE.values()].reduce((sum, n) => sum + n, 0)

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
    return 0
  }
  discloseScanProvenance(files)
  const seen = new Map()
  for (const path of files) {
    const rel = relative(ROOT, path)
    const lines = readFileSync(path, 'utf8').split('\n')
    for (const [index, line] of lines.entries()) {
      // EVERY match on the line, not only the first: `.exec()` dropped the rest,
      // so a second occurrence appended to an already-counted line was invisible.
      for (const match of line.matchAll(BARE_HEAD_COUNT)) {
        const text = match[0].trim()
        // Shape 3 names no revision by construction; if it names a fixed commit,
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
    }
  }
  return files.length
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
const reportFiles = checkReportHeadCounts()

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
  console.log(`  ok — ${models} model(s), ${kinds} task kind(s), ${items} work item(s); ${claims.join(', ')}`)
  console.log()
  console.log('PASS — the registry can be trusted and no work item claims evidence it does not have.')
  process.exit(0)
}

for (const f of findings) console.log(`  FINDING [${f.check}]: ${f.msg}`)
console.log()
console.log(`FAIL — ${findings.length} factory finding(s).`)
process.exit(1)
