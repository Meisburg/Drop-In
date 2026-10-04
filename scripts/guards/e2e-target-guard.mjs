#!/usr/bin/env node
/**
 * E2E target guard — a test run cannot silently point at the LIVE project.
 *
 * WHY THIS EXISTS. Every other guard around the e2e suite governs what a spec
 * WRITES: the marker convention (`docs/agents/e2e-fixture-convention.md`), the
 * sweep that removes markers, and `0060`'s rule that a fixture action notifies
 * nobody. All of them share one assumption — that the suite is aimed at the
 * live project and the damage must therefore be cleaned up afterwards.
 *
 * That assumption is the defect. The convention doc states the durable fix in
 * its own words: "a separate Supabase project or branch for e2e, so the marker
 * set and real parents are never in the same database." The measured cost of
 * not having it sits two paragraphs above: 1195 accounts swept, ~40 more created
 * in the 90 minutes after, and the 2026-10-03 incident where a real parent's
 * `going_pings` row was destroyed by a cascade from a marker parent. Marker
 * hygiene is what makes that damage RECOVERABLE. Pointing the suite somewhere
 * else is what makes it not happen.
 *
 * So this is the TARGET half of the problem, and it is the half nothing checked.
 * The marker guard asks "is this fixture identifiable?"; this asks "should this
 * fixture have been written to this database at all?"
 *
 * WHAT IT CHECKS. The project ref that `e2e/` will actually talk to, resolved
 * from the same place the specs resolve it (`readSupabaseEnv()` → the repo
 * `.env`), against an allowlist in `e2e/.e2e-target.json`. Two ways to pass:
 *
 *   - the ref is listed as a test target (the separate project the convention
 *     doc asks for), or
 *   - the ref is listed as production AND that entry carries a written reason
 *     and a future date by which it stops being acceptable.
 *
 * A production ref with no expiry is a waiver that never ends, which is the
 * state this guard exists to make visible. Past the expiry it fails.
 *
 * HOW IT FAILS. Closed, on purpose, and unlike `is_e2e_profile`: this guard's
 * failure mode is "the suite did not run", not "every parent's alerts switched
 * off", so refusing to run is strictly better than running blind.
 *
 *   - `.env` unreadable, or the ref unresolvable  → finding (cannot prove the target)
 *   - ref not in the config file at all           → finding (unknown target)
 *   - ref is a test target                        → pass
 *   - ref is production, waiver live              → pass, with a loud note
 *   - ref is production, no waiver / expired      → finding
 *
 * It never contacts Supabase: a guard that needs live credentials to pass is a
 * guard that gets skipped.
 *
 * Usage:  node scripts/guards/e2e-target-guard.mjs
 * Exit:   0 = clean, 1 = findings
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env')
const CONFIG_PATH = path.join(ROOT, 'e2e', '.e2e-target.json')

const findings = []
const notes = []

/** Plain KEY=VALUE parser — the same one `e2e/fixtures.ts` uses. */
function readEnvFile(filePath) {
  if (!existsSync(filePath)) return null
  const out = {}
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

/**
 * The project ref out of a Supabase URL. Returns null when the string is not a
 * `https://<ref>.supabase.co` shape — an unresolvable target is a finding, not
 * a pass, so the caller distinguishes null from a ref.
 */
export function refFromUrl(url) {
  if (typeof url !== 'string') return null
  const match = /^https?:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec(url.trim())
  return match === null ? null : match[1]
}

/** Today as YYYY-MM-DD, UTC, so an expiry compares as a plain string. */
function today() {
  return new Date().toISOString().slice(0, 10)
}

function main() {
  // --- The target the suite will actually use -----------------------------
  const env = readEnvFile(ENV_PATH)
  if (env === null) {
    findings.push(
      `Cannot read ${ENV_PATH} — the e2e target cannot be resolved. ` +
        `Run from the repo root; a missing .env means the suite cannot run either.`,
    )
  }

  const url = env?.VITE_SUPABASE_URL
  const ref = refFromUrl(url)
  if (env !== null && ref === null) {
    findings.push(
      `VITE_SUPABASE_URL in .env is not a https://<ref>.supabase.co URL ` +
        `(got: ${url === undefined ? 'undefined' : `"${url}"`}) — the e2e target cannot be resolved.`,
    )
  }

  // --- The allowlist ------------------------------------------------------
  if (!existsSync(CONFIG_PATH)) {
    findings.push(
      `Missing ${CONFIG_PATH} — nothing declares which Supabase project e2e may write to. ` +
        `Create it (see docs/agents/e2e-target-guard.md) listing the test project's ref.`,
    )
  }

  if (findings.length > 0) return report()

  let config
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch (error) {
    findings.push(`${CONFIG_PATH} is not valid JSON: ${error.message}`)
    return report()
  }

  const tests = Array.isArray(config?.testRefs) ? config.testRefs : []
  const production = config?.productionRef

  if (tests.length === 0 && production === undefined) {
    findings.push(
      `${CONFIG_PATH} declares neither a testRefs entry nor a productionRef — ` +
        `an empty allowlist cannot vouch for anything.`,
    )
    return report()
  }

  // --- The verdict --------------------------------------------------------
  if (tests.includes(ref)) {
    notes.push(`target ${ref} is declared a TEST project — the suite is aimed correctly.`)
    return report()
  }

  if (production === undefined) {
    findings.push(
      `e2e target ${ref} is in neither testRefs nor productionRef of ${CONFIG_PATH}. ` +
        `An unrecognised target is not a safe one.`,
    )
    return report()
  }

  if (production?.ref !== ref) {
    findings.push(
      `e2e target ${ref} does not match productionRef (${production?.ref ?? 'missing'}) ` +
        `and is not in testRefs. An unrecognised target is not a safe one.`,
    )
    return report()
  }

  const reason = production.reason
  const expires = production.expires
  const environment = production.environment

  // An explicit `environment` is not ceremony. The failure this guard exists to
  // catch is a target that LOOKS declared — a ref sitting in a config file with
  // a reason and a date — while nobody has said out loud which environment it is.
  // Requiring the word is what makes "this is production" a claim someone made
  // rather than a fact the guard inferred on their behalf.
  if (environment !== 'production') {
    findings.push(
      `productionRef for ${ref} must declare "environment": "production" (got: ` +
        `${environment === undefined ? 'missing' : `"${environment}"`}). ` +
        `The environment is stated, never inferred.`,
    )
  }

  if (typeof reason !== 'string' || reason.trim() === '') {
    findings.push(
      `e2e is aimed at PRODUCTION (${ref}) with no written reason. ` +
        `Add a "reason" explaining why running against real parents' database is acceptable.`,
    )
  }

  // --- One extension, then permanent refusal -------------------------------
  //
  // WHY A COUNTER AND NOT JUST A DATE. This repo's own history is the argument:
  // the waiver pattern was tried before and outlived its excuse. A date alone is
  // a chore — change the string, stay green, learn nothing. `extensionsUsed`
  // makes renewal a visible, finite act: the first extension is permitted and
  // must be recorded here, and the second is refused outright.
  //
  // The refusal is deliberately NOT escapable by editing this file's logic. The
  // only ways out are the two the convention doc already names: a separate test
  // project, or an explicit decision to keep writing to production — which then
  // has to be argued in the open rather than renewed in silence.
  const MAX_EXTENSIONS = 1
  const extensionsUsed = production.extensionsUsed
  const extensionsOk =
    extensionsUsed === undefined ||
    (Number.isInteger(extensionsUsed) && extensionsUsed >= 0 && extensionsUsed <= MAX_EXTENSIONS)

  if (!extensionsOk) {
    findings.push(
      `productionRef for ${ref} declares "extensionsUsed": ${JSON.stringify(extensionsUsed)} — ` +
        `the maximum is ${MAX_EXTENSIONS}. This waiver has been extended as far as it may be. ` +
        `The durable fix is the one docs/agents/e2e-fixture-convention.md already names: ` +
        `a separate Supabase project or branch for e2e.`,
    )
  } else if (extensionsUsed === MAX_EXTENSIONS) {
    notes.push(
      `  this waiver has used its ${MAX_EXTENSIONS} permitted extension — the NEXT renewal is refused. ` +
        `Build the separate test project, or argue for production in the open.`,
    )
  }

  // The extension history is what makes the counter checkable by a human: a
  // count with no dates behind it is a number someone typed.
  const extensions = Array.isArray(production.extensions) ? production.extensions : []
  if (extensionsUsed !== undefined && extensions.length !== extensionsUsed) {
    findings.push(
      `productionRef for ${ref} says "extensionsUsed": ${extensionsUsed} but lists ` +
        `${extensions.length} entr${extensions.length === 1 ? 'y' : 'ies'} in "extensions". ` +
        `The counter and the record must agree — a number with no history is a number someone typed.`,
    )
  }
  for (const [index, entry] of extensions.entries()) {
    if (typeof entry?.reason !== 'string' || entry.reason.trim() === '' || typeof entry?.on !== 'string') {
      findings.push(
        `productionRef.extensions[${index}] for ${ref} needs both a "reason" and an "on" date — ` +
          `an extension with no stated cause is indistinguishable from forgetting to fix it.`,
      )
    }
  }

  if (typeof expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    findings.push(
      `e2e is aimed at PRODUCTION (${ref}) with no expiry date. A waiver that never ends ` +
        `is how the separate test project never gets built. Add "expires": "YYYY-MM-DD".`,
    )
  } else if (expires < today()) {
    findings.push(
      `e2e is aimed at PRODUCTION (${ref}) and the waiver EXPIRED on ${expires} ` +
        `(today: ${today()}). Point e2e at a test project, or renew the waiver on purpose.`,
    )
  }

  if (findings.length === 0) {
    notes.push(
      `target ${ref} is PRODUCTION, waiver live until ${expires} — this run writes to real parents' database.`,
    )
    notes.push(`  reason on file: ${reason.trim()}`)
  }
  return report()
}

function report() {
  for (const note of notes) console.log(`note: ${note}`)
  if (findings.length === 0) {
    console.log('e2e-target-guard: PASS — the e2e target is declared and acceptable.')
    return 0
  }
  console.error('e2e-target-guard: FAIL')
  for (const finding of findings) console.error(`  - ${finding}`)
  return 1
}

process.exit(main())
