/**
 * r3-9 — the /new post-form draft (option B, the founder's 2026-10-04 decision).
 *
 * The user problem: a parent fills the post form, a link INSIDE the form sends
 * them away ("Add kids" → /settings, the no-ZIP notice → /onboarding), and
 * when they come back everything they typed is gone — the form is plain
 * `useState` with no persistence.
 *
 * This module is the draft's whole storage concern, kept out of the page (the
 * build law: domain logic in `src/lib/` as pure functions with injected
 * dependencies). Everything here is pure and unit-testable without a DOM:
 * the storage is INJECTED (`DraftStorage` — `window.sessionStorage` satisfies
 * it), and the only effects are the three storage calls.
 *
 * THE SHAPE. The draft carries the form's `PlaydateFormValues` (all strings
 * and numbers, no `Date` — so a JSON round-trip is exact and no serializer is
 * hand-rolled) plus the three page-local fields a post also carries: the
 * picked place's id (null = free text), the optional address, and the host's
 * own picked kid ids. That is "every field the parent set" (the acceptance
 * list: title, place, date, time, duration, details, and the fields the form
 * writes around them).
 *
 * THE KEY IS SCOPED TO THE USER. `sessionStorage`, never `localStorage` — the
 * spec's rule: a shared device must not keep a half-written post, and nothing
 * may be readable by another account in the same browser session. The key is
 * the user id (the session's `session?.user?.id`, the same key the kids load
 * uses), so a second account signed in later in the same tab has its own
 * namespace.
 *
 * VERSIONING. The stored value is an envelope `{ version, draft }`. A reader
 * that does not recognise the version — or finds a corrupt or malformed
 * payload — gets `null`, the same as "no draft". A corrupt draft must never
 * crash the restore path or seed the form with garbage.
 */
import type { PlaydateFormValues } from './feed'

/** The draft: the form values + the page-local fields a post carries. */
export interface NewPlaydateDraft {
  values: PlaydateFormValues
  /** The picked place's id (the page's `placeId` state), null = free text. */
  placeId: string | null
  /** The optional address (the page's `address` state). */
  address: string
  /** The host's own picked kid ids (the page's `selectedKidIds` state). */
  kidIds: string[]
}

/**
 * The minimal storage surface this module needs (`window.sessionStorage`
 * satisfies it — that idiom, a plain `const` key + `window.sessionStorage`,
 * is the app's existing one, PlaydateDetailPage's `PLAYDATE_RETURN_KEY`).
 * Injected, never imported: the functions stay pure and DOM-free.
 */
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Bump when the shape changes; readers reject any other version. */
export const NEW_PLAYDATE_DRAFT_VERSION = 1

/**
 * The key prefix. One namespace per user: `playdate-new-draft:<userId>`.
 * (Not `PLAYDATE_RETURN_KEY` / `PLAYDATE_PING_INTENT_KEY` /
 * `dropin.first-run.nudge-dismissed` — those belong to other slices.)
 */
export const NEW_PLAYDATE_DRAFT_KEY_PREFIX = 'playdate-new-draft'

/** The per-user draft key (the scope the spec demands). */
export function newPlaydateDraftKey(userId: string): string {
  return `${NEW_PLAYDATE_DRAFT_KEY_PREFIX}:${userId}`
}

/** The stored envelope. */
interface DraftEnvelope {
  version: number
  draft: NewPlaydateDraft
}

/**
 * `PlaydateFormValues`, checked field by field. The interface is the contract
 * (all eight keys present, strings and finite numbers — no `Date` anywhere),
 * so a payload that is missing a key or carries a wrong-typed one is a
 * corrupt draft, not a value.
 */
function isPlaydateFormValues(x: unknown): x is PlaydateFormValues {
  if (typeof x !== 'object' || x === null) return false
  const v = x as Record<string, unknown>
  return (
    typeof v.title === 'string' &&
    typeof v.place === 'string' &&
    typeof v.neighborhoodId === 'string' &&
    typeof v.startDate === 'string' &&
    typeof v.startMinutes === 'number' &&
    Number.isFinite(v.startMinutes) &&
    typeof v.durationMinutes === 'number' &&
    Number.isFinite(v.durationMinutes) &&
    typeof v.ageHint === 'string' &&
    typeof v.details === 'string'
  )
}

/** The whole draft shape, checked field by field (see `isPlaydateFormValues`). */
function isDraft(x: unknown): x is NewPlaydateDraft {
  if (typeof x !== 'object' || x === null) return false
  const d = x as Record<string, unknown>
  return (
    isPlaydateFormValues(d.values) &&
    (d.placeId === null || typeof d.placeId === 'string') &&
    typeof d.address === 'string' &&
    Array.isArray(d.kidIds) &&
    d.kidIds.every((id) => typeof id === 'string')
  )
}

/**
 * Read this user's draft. `null` for: no entry, unparseable JSON, an
 * unrecognised version, or a payload that fails the shape check (corrupt
 * drafts degrade to "no draft", never to a crash or a garbage form).
 */
export function readDraft(
  storage: DraftStorage,
  userId: string,
): NewPlaydateDraft | null {
  const raw = storage.getItem(newPlaydateDraftKey(userId))
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const envelope = parsed as Partial<DraftEnvelope>
  if (envelope.version !== NEW_PLAYDATE_DRAFT_VERSION) return null
  if (!isDraft(envelope.draft)) return null
  return envelope.draft
}

/** Write this user's draft (the versioned envelope; the round-trip is exact). */
export function writeDraft(
  storage: DraftStorage,
  userId: string,
  draft: NewPlaydateDraft,
): void {
  const envelope: DraftEnvelope = {
    version: NEW_PLAYDATE_DRAFT_VERSION,
    draft,
  }
  storage.setItem(newPlaydateDraftKey(userId), JSON.stringify(envelope))
}

/** Clear this user's draft (a no-op when there is none — a no-draft visit). */
export function clearDraft(storage: DraftStorage, userId: string): void {
  storage.removeItem(newPlaydateDraftKey(userId))
}

export interface DraftRestoreInput {
  /** The draft read for this user, or null (the "no draft" path). */
  draft: NewPlaydateDraft | null
  /** Entered with a place prefill ("Start a drop-in here", router state). */
  hasPlacePrefill: boolean
  /** Entered with a duplicate prefill ("Post again" / Duplicate). */
  hasDuplicatePrefill: boolean
}

export type DraftRestoreDecision =
  /** A prefill was passed: initialise from it exactly as today. */
  | { kind: 'prefill' }
  /** No prefill and a draft exists: restore it (and disclose it). */
  | { kind: 'restore'; draft: NewPlaydateDraft }
  /** No prefill and no draft: the ordinary first visit, unchanged. */
  | { kind: 'fresh' }

/**
 * THE PRECEDENCE RULE (decided, not invented): a fresh prefill WINS, and the
 * draft is LEFT UNTOUCHED.
 *
 * - entered with a prefill (place OR duplicate) → `prefill`: the page
 *   initialises from the prefill exactly as it does today, and neither
 *   restores nor clears the stored draft.
 * - entered with no prefill and a draft exists → `restore`.
 * - entered with no prefill and no draft → `fresh`.
 *
 * Rationale (the spec's words): an explicit "post here" is FRESH intent; a
 * stored draft is OLDER intent. Mixing them (fresh place + stale time) is the
 * confusing outcome to avoid — and silently destroying the draft on a
 * prefilled visit would lose the parent's work. This function only DECIDES;
 * "untouched" is honoured by the page not writing or clearing on a prefilled
 * visit (a prefill visit never calls `writeDraft`/`clearDraft` for the
 * restore, only the successful-submit clear, which the spec mandates
 * unconditionally).
 */
export function decideDraftRestore(
  input: DraftRestoreInput,
): DraftRestoreDecision {
  if (input.hasPlacePrefill || input.hasDuplicatePrefill) {
    return { kind: 'prefill' }
  }
  if (input.draft !== null) {
    return { kind: 'restore', draft: input.draft }
  }
  return { kind: 'fresh' }
}