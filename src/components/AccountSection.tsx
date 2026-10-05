import { useState } from 'react'
import { Link } from 'react-router'
import { deleteMyAccount, exportMyData, signOutUser } from '../lib/db'
import { settingsErrorMessage } from '../lib/settingsError'
import { canModerate } from '../lib/moderation'
import { ConfirmDialog } from './ConfirmDialog'
import { useSessionContext } from './SessionProvider'

/**
 * The Account section (V27) — the parent-facing half of leaving.
 *
 * Two controls, both explicit and both OFF the mount path: a settings visit
 * must never run an export or an RPC, so nothing happens until a button is
 * pressed.
 *
 *  - Download my data: reads the rows this account owns and saves them as one
 *    JSON file. A failed read reports and downloads nothing (a partial file
 *    would be a lie about "your data").
 *  - Delete my account: a two-step destructive confirm whose copy names what
 *    actually disappears, then one RPC (migration 0056) that deletes the auth
 *    row and cascades. The failure sentence is honest when the migration has not
 *    been applied yet.
 */
export function AccountSection() {
  const { profile } = useSessionContext()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    setExportError(null)
    try {
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `drop-in-my-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(
        settingsErrorMessage(err, "Couldn't prepare your download. Please try again."),
      )
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteMyAccount()
      // The auth listener in the shell signs the parent out and routes to
      // /login; this component unmounts, so there is nothing to set here.
      await signOutUser()
    } catch (err) {
      setDeleteError(
        settingsErrorMessage(err, "Couldn't delete your account. Nothing was removed."),
      )
    } finally {
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* v30-7 (founder annotation 5): THE MODERATOR DOOR. The place-photo tool
          shipped in V28 r4 and was reachable only by typing /mod — the route
          exists, and NOTHING in the app linked to it, so the founder reported
          the tool as missing. This row is discoverability, not permission: the
          route guard and the database policies remain the authority.

          It renders ONLY for a moderator-flagged profile (the same pure
          `canModerate` the /mod guard reads), so a parent never sees a control
          they cannot use. It sits FIRST because it is the one control here that
          is not about leaving — a moderator who opened Settings to fix a wrong
          place photo should not scroll past an export, a sign-out and a delete
          to find it. */}
      {canModerate(profile) ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-medium text-slate-800">Moderator tools</p>
          <p className="mt-1 text-xs text-slate-500">
            Reports, and the place-photo tool for a place whose picture is missing or wrong.
          </p>
          <Link
            to="/mod"
            data-testid="moderator-tools-link"
            className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
          >
            Open moderator tools
          </Link>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-medium text-slate-800">Download your data</p>
        <p className="mt-1 text-xs text-slate-500">
          Get a file with your profile, kids, posts, saved families and places, comments and
          reviews.
        </p>
        <button
          type="button"
          data-testid="export-data"
          disabled={exporting}
          onClick={() => void handleExport()}
          className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          {exporting ? 'Preparing…' : 'Download my data'}
        </button>
        {exportError === null ? null : (
          <p className="mt-2 text-sm text-red-600" data-testid="export-error" role="alert">
            {exportError}
          </p>
        )}
      </div>

      {/* V29 v29-10: SIGN OUT LIVES HERE NOW, not in the app header. In the
          header it was a permanent one-tap control sitting beside the settings
          gear on every signed-in screen, with no confirmation — a mis-tap cost a
          password reset. Settings is where a parent goes to manage the account,
          and this sits with the other account-level actions rather than
          competing with navigation. No confirm dialog: the risk being removed
          was the HEADER mis-tap, and a second tap on a deliberate Settings
          control is friction, not safety. */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-medium text-slate-800">Sign out</p>
        <p className="mt-1 text-xs text-slate-500">
          Your family&apos;s drop-ins stay on Drop In — sign back in any time.
        </p>
        <button
          type="button"
          data-testid="account-sign-out"
          onClick={() => void signOutUser()}
          className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
        >
          Sign out
        </button>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
        <p className="text-sm font-medium text-slate-800">Delete my account</p>
        <p className="mt-1 text-xs text-slate-500">
          This removes your account and your family&apos;s posts, kids, photos and messages. It
          cannot be undone.
        </p>
        <button
          type="button"
          data-testid="delete-account"
          onClick={() => setConfirmingDelete(true)}
          className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-red-300 bg-white px-3 text-sm font-medium text-red-700"
        >
          Delete my account
        </button>
        {deleteError === null ? null : (
          <p className="mt-2 text-sm text-red-600" data-testid="delete-error" role="alert">
            {deleteError}
          </p>
        )}
      </div>

      {confirmingDelete ? (
        <ConfirmDialog
          testId="delete-account-confirm"
          title="Delete your account?"
          body="This deletes your account, your kids' details, your posts, photos and messages. It cannot be undone."
          confirmLabel="Delete my account"
          busyLabel="Deleting…"
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : null}
    </div>
  )
}
