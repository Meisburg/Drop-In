#!/usr/bin/env node
// Artifact-centric work state, reservations, and the two logs.
//
// WHY THIS EXISTS
// ---------------
// Two failures the factory kept paying for.
//
// 1. THE AGENT SESSION WAS THE SOURCE OF TRUTH. A builder died mid-slice on
//    2026-10-02 and what survived was only what it had happened to write to
//    disk. Nothing could say "slice 6c: implementation complete, review
//    pending" without reading a 470 KB task-state.md, an 7,000-line ledger and
//    a chat transcript. Work state now lives in `factory/work/<id>.json`, one
//    file per work item, and any worker can be replaced because the state is
//    not inside the worker.
//
// 2. THE LEDGER WAS A DUMPING GROUND. `.scratch/v28/ledger.md` holds decisions
//    AND OOM kills AND dispatch receipts AND measurement tails. A resource
//    event is not a decision. So the logs are split:
//
//      WORK STATE      factory/work/<id>.json        what is true about the work
//      DECISION LOG    .scratch/<batch>/ledger.md    why a decision was made
//      RUN LOG         factory/logs/runs.jsonl       what happened during an execution
//      TELEMETRY       factory/logs/telemetry.jsonl  resources consumed or unavailable
//      ARTIFACTS       named by the work item, existence checked by the guard
//
// Only the first and the second are durable record. The logs are exhaust: they
// are gitignored, they are append-only, and nothing decides from them.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const paths = {
  root: join(REPO_ROOT, 'factory'),
  config: join(REPO_ROOT, 'factory', 'config.json'),
  work: join(REPO_ROOT, 'factory', 'work'),
  reservations: join(REPO_ROOT, 'factory', 'state', 'reservations.json'),
  runs: join(REPO_ROOT, 'factory', 'logs', 'runs.jsonl'),
  telemetry: join(REPO_ROOT, 'factory', 'logs', 'telemetry.jsonl'),
}

const ensure = (p) => mkdirSync(dirname(p), { recursive: true })

const readJson = (p, fallback) => {
  if (!existsSync(p)) return fallback
  return JSON.parse(readFileSync(p, 'utf8'))
}

const writeJson = (p, value) => {
  ensure(p)
  writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`)
}

// ---------------------------------------------------------------------------
// Work items
// ---------------------------------------------------------------------------

export function listWorkItems() {
  if (!existsSync(paths.work)) return []
  return readdirSync(paths.work)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(join(paths.work, f), null))
    .filter(Boolean)
}

export function readWorkItem(id) {
  return readJson(join(paths.work, `${id}.json`), null)
}

export function writeWorkItem(item) {
  writeJson(join(paths.work, `${item.id}.json`), item)
  return item
}

/**
 * A work item names its evidence, not its activity. `artifacts` are paths that
 * must exist — the guard checks them, because an artifact named but missing is
 * a claim with nothing behind it.
 */
export function newWorkItem({ id, title, planRef, track = null, base = null, dependsOn = [], lanes }) {
  const lane = (extra = {}) => ({ state: 'pending', owner: null, model: null, artifacts: [], evidence: [], ...extra })
  return {
    version: 1,
    id,
    title,
    plan_ref: planRef,
    track,
    base,
    depends_on: dependsOn,
    created_at: new Date().toISOString(),
    lanes: lanes ?? {
      implementation: lane(),
      verification: lane(),
      review: lane(),
      visual_validation: lane(),
      acceptance: lane({ reason: null }),
    },
    history: [],
  }
}

/** Transition one lane, appending to the item's own history. */
export function applyTransition(item, lane, to, meta = {}) {
  if (!item.lanes[lane]) return { ok: false, why: `no lane '${lane}' on ${item.id}` }
  const from = item.lanes[lane].state
  item.lanes[lane] = { ...item.lanes[lane], state: to, ...meta.fields }
  item.history.push({
    at: new Date().toISOString(),
    lane,
    from,
    to,
    note: meta.note ?? null,
    actor: meta.actor ?? null,
    model: meta.model ?? null,
  })
  return { ok: true, from, to }
}

// ---------------------------------------------------------------------------
// Reservations — the leases the scheduler admits against
// ---------------------------------------------------------------------------

export function readReservations() {
  return readJson(paths.reservations, { version: 1, reservations: [] }).reservations ?? []
}

export function writeReservations(reservations) {
  writeJson(paths.reservations, { version: 1, updated_at: new Date().toISOString(), reservations })
  return reservations
}

export function addReservation(record) {
  const all = readReservations().filter((r) => r.id !== record.id)
  all.push(record)
  return writeReservations(all)
}

export function releaseReservation(id) {
  const all = readReservations()
  const found = all.find((r) => r.id === id)
  if (found) found.releasedAt = new Date().toISOString()
  return writeReservations(all)
}

export function markRunning(id) {
  const all = readReservations()
  const found = all.find((r) => r.id === id)
  if (found) found.state = 'RUNNING'
  return writeReservations(all)
}

// ---------------------------------------------------------------------------
// Run log and telemetry — exhaust, not record
// ---------------------------------------------------------------------------

const append = (p, entry) => {
  ensure(p)
  appendFileSync(p, `${JSON.stringify(entry)}\n`)
}

export const logRun = (entry) => append(paths.runs, { at: new Date().toISOString(), ...entry })
export const logTelemetry = (entry) => append(paths.telemetry, { at: new Date().toISOString(), ...entry })

export function readRuns(limit = 50) {
  if (!existsSync(paths.runs)) return []
  return readFileSync(paths.runs, 'utf8')
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line))
}

export function readTelemetry(limit = 50) {
  if (!existsSync(paths.telemetry)) return []
  return readFileSync(paths.telemetry, 'utf8')
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line))
}

/**
 * The model and run that produced a work item's latest implementation, so the
 * reviewer can be required to sit on an independent reasoning path from it.
 */
export function implementerOf(item) {
  if (!item) return null
  const impl = item.lanes?.implementation
  return impl ? { model: impl.model ?? null, owner: impl.owner ?? null } : null
}
