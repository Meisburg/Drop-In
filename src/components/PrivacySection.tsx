import { useEffect, useState } from 'react'
import {
  getProfile,
  listKids,
  listMyBlocks,
  toggleBlock,
  unblockProfile,
  type BlockedFamily,
} from '../lib/db'
import { buildPrivacyReport } from '../lib/privacy'
import type { PrivacyFact } from '../lib/privacy'
import { settingsErrorMessage } from '../lib/settingsError'
import type { Kid, Profile } from '../lib/types'
import { HostAvatar } from './DropInCard'
import { UndoLine } from './UndoLine'

type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; message: string }

/**
 * The Privacy & safety section (V27).
 *
 * Two jobs, both about the same anxiety a parent brings to a kids' app:
 *   1. STATE THE MODEL. The privacy rules are structural (first name + age, no
 *      public kid profiles, signed-out visitors see nothing) but they lived only
 *      in the signup screen. `buildPrivacyReport` turns this parent's OWN data
 *      into the two lists — what other parents can see, and what stays with the
 *      account — so the promise is visible where they go looking for it.
 *   2. MANAGE BLOCKS. The `blocks` table (0006) already filters the feed and the
 *      profile paths; this is the only place a parent could not see or undo a
 *      block without finding the family again. Remove is optimistic with an
 *      Undo, because a list row does not deserve a modal.
 *
 * Each load contains its own failure: a failed blocks read renders its own
 * sentence and does not hide the privacy facts, and vice versa.
 */
export function PrivacySection({ userId }: { userId: string }) {
  const [data, setData] = useState<Loadable<{ profile: Profile; kids: Kid[] }>>({
    status: 'loading',
  })
  const [blocks, setBlocks] = useState<Loadable<BlockedFamily[]>>({ status: 'loading' })
  const [unblockingId, setUnblockingId] = useState<string | null>(null)
  const [removed, setRemoved] = useState<BlockedFamily | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [profile, kids] = await Promise.all([getProfile(userId), listKids(userId)])
        if (cancelled) return
        if (profile === null) {
          setData({ status: 'error', message: 'Your profile could not be found.' })
          return
        }
        setData({ status: 'ready', value: { profile, kids } })
      } catch (err) {
        if (cancelled) return
        setData({
          status: 'error',
          message: settingsErrorMessage(err, "Couldn't load your privacy details."),
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false
    listMyBlocks()
      .then((rows) => {
        if (!cancelled) setBlocks({ status: 'ready', value: rows })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setBlocks({
          status: 'error',
          message: settingsErrorMessage(err, "Couldn't load your blocked families."),
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleUnblock(row: BlockedFamily) {
    if (unblockingId !== null) return
    setUnblockingId(row.profileId)
    setActionError(null)
    try {
      await unblockProfile(row.profileId)
      setBlocks((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', value: prev.value.filter((item) => item.profileId !== row.profileId) }
          : prev,
      )
      setRemoved(row)
    } catch (err) {
      setActionError(settingsErrorMessage(err, "Couldn't unblock that family. Nothing changed."))
    } finally {
      setUnblockingId(null)
    }
  }

  async function handleUndo() {
    if (removed === null || undoBusy) return
    setUndoBusy(true)
    setActionError(null)
    try {
      // The row is currently unblocked, so the existing toggle re-blocks it —
      // one path in and out, no second insert to keep in step.
      await toggleBlock(removed.profileId)
      setBlocks((prev) =>
        prev.status === 'ready' ? { status: 'ready', value: [...prev.value, removed] } : prev,
      )
      setRemoved(null)
    } catch (err) {
      setActionError(settingsErrorMessage(err, "Couldn't undo that. Please try again."))
    } finally {
      setUndoBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {data.status === 'loading' ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : data.status === 'error' ? (
        <p className="text-sm text-slate-600" data-testid="privacy-error">
          {data.message}
        </p>
      ) : (
        <PrivacyFacts
          facts={buildPrivacyReport({
            displayName: data.value.profile.display_name,
            bio: data.value.profile.bio,
            homeZip: data.value.profile.home_zip,
            kids: data.value.kids,
            familyPhotoCount: data.value.profile.family_photo_url ? 1 : 0,
          })}
        />
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Families you&apos;ve blocked</h3>
        <p className="text-sm text-slate-600">
          You and a blocked family won&apos;t see each other&apos;s drop-ins or messages.
        </p>

        {actionError === null ? null : (
          <p className="text-sm text-red-600" data-testid="blocks-error">
            {actionError}
          </p>
        )}

        {removed === null ? null : (
          <UndoLine
            message={`Unblocked ${removed.displayName ?? 'that family'}.`}
            busy={undoBusy}
            onUndo={() => void handleUndo()}
          />
        )}

        {blocks.status === 'loading' ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : blocks.status === 'error' ? (
          <p className="text-sm text-slate-600" data-testid="blocks-load-error">
            {blocks.message}
          </p>
        ) : blocks.value.length === 0 ? (
          <p className="text-sm text-slate-600" data-testid="blocks-empty">
            You haven&apos;t blocked anyone. You can block a family from their profile.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {blocks.value.map((row) => (
              <li key={row.profileId} className="flex flex-wrap items-center gap-2">
                <HostAvatar
                  host={{
                    id: row.profileId,
                    display_name: row.displayName ?? '?',
                    avatar_url: row.avatarUrl,
                  }}
                />
                <span className="text-sm text-slate-700">
                  {row.displayName ?? 'A family who left Drop In'}
                </span>
                <button
                  type="button"
                  data-testid="unblock-family"
                  disabled={unblockingId === row.profileId}
                  onClick={() => void handleUnblock(row)}
                  className="ml-auto inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {unblockingId === row.profileId ? 'Updating…' : 'Unblock'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** The two factual lists. Presentational; the report is built by lib/privacy. */
function PrivacyFacts({
  facts,
}: {
  facts: { visible: PrivacyFact[]; kept: PrivacyFact[] }
}) {
  return (
    <div className="flex flex-col gap-3">
      <FactList
        heading="What other parents can see"
        testId="privacy-visible"
        facts={facts.visible}
      />
      <FactList
        heading="What stays with your account"
        testId="privacy-kept"
        facts={facts.kept}
      />
    </div>
  )
}

function FactList({
  heading,
  testId,
  facts,
}: {
  heading: string
  testId: string
  facts: PrivacyFact[]
}) {
  return (
    <div data-testid={testId}>
      <h3 className="text-sm font-semibold text-slate-700">{heading}</h3>
      <dl className="mt-1 flex flex-col gap-2">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <dt className="text-xs font-medium text-slate-500">{fact.label}</dt>
            <dd className="text-sm font-medium text-slate-800">{fact.value}</dd>
            <dd className="text-xs text-slate-500">{fact.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
