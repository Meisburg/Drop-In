import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { HostAvatar } from '../components/DropInCard'
import { ReportDialog } from '../components/ReportDialog'
import { useSessionContext } from '../components/SessionProvider'
import { LOGIN_PATH } from '../lib/auth'
import {
  addComment,
  deleteComment,
  fetchRainProbabilityForZip,
  getBlockState,
  getGoingCount,
  getPlaydateDetail,
  getPublicPlaydateDetail,
  getShareUrl,
  hasPinged,
  hideComment,
  listComments,
  listPlaydateKidNames,
  setPlaydateStatus,
  togglePing,
} from '../lib/db'
import {
  isHiddenPost,
  kidsComingLine,
  mapsHref,
  rainBadgeLabel,
  toDuplicatePrefill,
} from '../lib/feed'
import { buildIcs } from '../lib/ics'
import { canModerate } from '../lib/moderation'
import {
  COMMENT_MAX_LENGTH,
  PLAYDATE_PING_INTENT_KEY,
  PLAYDATE_RETURN_KEY,
  groupCommentsForRender,
  planCommentAction,
  validateCommentBody,
  type CommentActionContext,
  type CommentActionPlan,
} from '../lib/trust'
import type {
  CommentWithAuthor,
  PlaydateKid,
  PlaydateStatus,
  PlaydateWithNeighborhood,
  PublicPlaydateDetail,
} from '../lib/types'

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not-found' }
  | { status: 'hidden' }
  | { status: 'blocked'; handle: string }
  | {
      status: 'ready'
      detail: PlaydateWithNeighborhood
      count: number | null
      going: boolean
      /** The comment thread (null = not loaded — 0013 not applied, section hidden). */
      comments: CommentWithAuthor[] | null
      /**
       * V3 slice 6 (ticket 09): the "Kids coming" rows (the 0022
       * playdate_kids selection, name-ordered — db.listPlaydateKidNames).
       * null = not loaded — 0022 not applied (the 42P01 is caught in the
       * load below) or the read failed: the line is hidden, never the
       * post (the DB-not-applied discipline, same as the ping section).
       */
      kids: PlaydateKid[] | null
    }
  /**
   * V2 slice 5: the signed-out public surface (the get_public_playdate RPC
   * payload — nothing beyond the pinned public fields). Rendered when the
   * page loads without a session.
   */
  | { status: 'public'; detail: PublicPlaydateDetail }

/**
 * /playdate/:id — a drop-in's full details (slice 4): title, place,
 * neighborhood, human-readable start/end times, age hint, details, and the
 * host's handle linking to /u/:handle. The "going" ping toggle
 * (counts shown only, never a per-person attendee list) plus a report entry.
 *
 * V2 slice 1: the post's own host sees an explicit "This is your post" panel
 * with the going count and a Duplicate action (navigates to /new with
 * router-state prefill of everything except the date/time — which is always
 * re-entered) — never the ping button. Everyone else sees the unchanged
 * ping toggle + count (V3 slice 3, ticket 06: the labels are "Attend" /
 * "✓ Going" — same toggle semantics, the green-600 fill tracks the
 * going state).
 *
 * The detail fetch is a direct lookup — the feed query's DB-level block
 * filter (slice 3) cannot cover this path — so a blocked host's post is
 * checked after the fetch and renders a hidden state, never the content.
 * The same post-fetch discipline covers the slice-5 moderator hide
 * (hidden_at set → the removed state, never the content).
 *
 * V2 slice 4 (ticket 04): a flat chronological comment thread under the
 * post — any signed-in parent comments (<= 500 chars, empty rejected
 * client-side), the author or the event's host deletes (the pure
 * planCommentAction decides the buttons), moderators get a per-comment
 * Hide (the soft-hide via hidden_at; no /mod comment list in V2 scope —
 * hiding happens here, on the detail page). The comments table (0013)
 * may not be applied yet: a failed thread load hides the section instead
 * of crashing the page (the same discipline as the ping section above).
 *
 * The going_pings table (migration 0007) may not exist in the live project
 * until the orchestrator applies it — a failed count/ping load hides the
 * ping section instead of crashing the page (same discipline as slices 2–3).
 *
 * V2 slice 5 (ticket 05): signed-out visitors open this route and see the
 * public surface ONLY (the get_public_playdate RPC, migration 0015 — post
 * fields + neighborhood label + host handle/avatar + going count; comments
 * stay auth-walled, /u/:handle is not linked, every action surface shows
 * the sign-up prompt). "I'm coming" stores the return target + a ping
 * intent in session storage and hops to /login; the app shell applies the
 * return once the onboarding gate settles, and the ping is an explicit
 * highlighted tap after the return (the zero-pressure soul — no silent
 * auto-ping). The Share button (Web Share API + copy-link fallback) builds
 * its URL from VITE_PUBLIC_BASE_URL, falling back to the window origin
 * before deployment.
 *
 * V3 slice 2 (ticket 02): the host sees a status control (On / Cancelled)
 * inside the "This is your post" panel — the ONLY host-actions
 * surface, so the control is invisible to non-hosts (the RLS
 * playdates_update_host is the wall; a non-host API write is a silent
 * 0-row 2xx, the 0014 lesson). A cancelled post renders the
 * muted states (the chip near the title + the grayed info card — the
 * event STAYS in the feed; the host can revert, no auto-expiry). A
 * best-effort "Rain likely" badge (the pure rainBadgeLabel threshold on
 * the Open-Meteo daily probability for the host's home_zip — silently
 * absent on error, no error state) sits beside the time row. The
 * signed-out public view (renderPublicView) stays the public surface
 * (11 fields per the 0015 pin; V3 slice 5 extends it to 12 — the
 * address, migration 0021): no status, no badge.
 *
 * V3 slice 3 (ticket 06, the quick feedback batch): the status control
 * trims to On / Cancelled (migration 0019 — the third option, redundant
 * with Cancelled, is removed per feedback/v3.md #5; the muted chip
 * renders for "Cancelled" only, the Open-Meteo badge is an independent
 * forecast and stays); the ping
 * button's copy is "Attend" (inactive) / "✓ Going" (active, green-600
 * filled — same geometry, the toggle semantics unchanged); the
 * "Best for …" age-hint line is out of the authenticated detail view
 * (the DB column + the /new field stay — ticket 09 reworks /new; the
 * signed-out public view keeps its 0015 field).
 *
 * V3 slice 5 (ticket 08, migration 0021): when the post has an address
 * (the /new "Address (optional)" field), the place line becomes a
 * tappable Google Maps link (the pure mapsHref seam in feed.ts —
 * "place, address" URL-encoded into the maps q= param; new tab +
 * rel="noopener"). The render logic is SHARED: the link shows in the
 * signed-in view AND the signed-out public view (the public surface
 * gained the address as its 12th field — the signed-out read flows
 * through get_public_playdate). No address (null / pre-0021-apply
 * missing) → the place line stays plain text.
 *
 * V3 slice 6 (ticket 09, migration 0022): the "Kids coming" line below
 * the ping section — the post's host-picked kids (the playdate_kids
 * table), names + ages only, NO photos (the kid-photo pin: a kid photo
 * renders only in the profile kids list). Authenticated view only: the
 * signed-out public surface stays the 12-field get_public_playdate with
 * no kids fetch (the ticket pin). Pre-0022-apply the table 42P01s; the
 * caught load hides the line, never the post (the DB-not-applied
 * discipline, same as the ping section).
 *
 * V3 slice 7 (ticket 10, migration 0023): one-level comment replies —
 * any signed-in parent can reply to a top-level comment (the 2026-09-09
 * human call: open to ALL authenticated users, not host-only; no Reply
 * affordance on a reply — the one-level pin, the pure
 * planCommentAction's canReply). A reply renders one level indented
 * (ml-8, the 24px HostAvatar) under its parent: the pure
 * groupCommentsForRender (trust.ts) threads the flat row set — children
 * in created_at order, a hidden parent's replies excluded (the mod's
 * hide covers the thread, 0023 header (b)), orphan + reply-to-reply
 * rows dropped (defense in depth; 0023 allows such rows at the DB
 * level). The bottom composer gains a "Replying to @handle" mode with a
 * Cancel affordance: the submit carries the parent's id as parent_id
 * (db.addComment's optional third arg — omitted for a plain comment, so
 * a pre-0023-apply reply submit 42703s and surfaces the existing error
 * line — red-by-design until the orchestrator's live apply). Delete on
 * a reply = the reply's author or the event host (the per-row plan; the
 * parent's author is out — deleting the parent orphans its replies and
 * the seam drops them, the render self-heals); the moderator Hide
 * covers replies like comments. The header count stays the total row
 * count (parents + replies). Pre-apply, rows lack parent_id (treated as
 * null): the thread renders exactly as today, flat, with the Reply
 * buttons present.
 *
 * V3 slice 8 (ticket 03): "Add to calendar" beside Share in the info
 * card's action row — builds the post's ICS file purely client-side
 * (the pure buildIcs seam, ics.ts: UTC dates, RFC 5545 escaping +
 * CRLF + 75-octet folding, the LOCATION line folding in "place,
 * address" per the ticket 08 AC) and triggers a Blob download named
 * playdate-<id>.ics (MIME text/calendar). Public-surface fields only —
 * the button renders in the signed-in AND the signed-out (public)
 * views (read-only, no new data exposure), and the row's flex-wrap
 * keeps it fitting at 375px with no horizontal scroll.
 */
export function PlaydateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, loading: sessionLoading, profile } = useSessionContext()
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const [reporting, setReporting] = useState(false)
  const [pingBusy, setPingBusy] = useState(false)
  const [pingError, setPingError] = useState<string | null>(null)
  // V2 slice 4: the comment composer (empty rejected client-side; the
  // pure validateCommentBody is the second check in handleAddComment).
  const [commentDraft, setCommentDraft] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  // V3 slice 7 (ticket 10): the reply-to mode — the id of the top-level
  // comment the bottom composer is answering (null = plain "Add a
  // comment"). Set by a row's Reply button; cleared on submit, on
  // Cancel, when the target is deleted or hidden (the handlers below),
  // and on any fresh thread load (the id/session effect).
  const [replyToId, setReplyToId] = useState<string | null>(null)
  // V2 slice 5: the share button (Web Share API where supported, the
  // copy-link fallback otherwise) + its "Copied" confirmation.
  const [shareBusy, setShareBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  // V2 slice 5 (the zero-pressure soul): true when the visitor returned
  // from the /login hop intending to ping THIS post (the stored ping-intent
  // flag) — the ping button highlights as "Tap to confirm you're coming";
  // the ping itself is always an explicit tap, never a silent auto-ping.
  const [pingIntent, setPingIntent] = useState(false)
  // V3 slice 2 (ticket 02): the host's status control — its busy flag + a
  // designed error line (a failed write never hides the event; zero
  // pressure), and the best-effort rain probability (the "Rain likely"
  // badge; null = silently absent — the fetch never rejects).
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [rainProbability, setRainProbability] = useState<number | null>(null)

  useEffect(() => {
    if (id === undefined || id === '') return
    if (sessionLoading) return
    let cancelled = false
    setState({ status: 'loading' })
    // V3 slice 7 (ticket 10): a fresh load (a new post, a session change)
    // never carries the reply-to mode over from the previous thread.
    setReplyToId(null)
    if (session === null) {
      // V2 slice 5: the signed-out public surface — the SECURITY DEFINER
      // RPC (0015). A missing OR hidden post settles not-found (the
      // function returns NULL for both — a hidden post's existence is not
      // confirmed to a signed-out visitor). Pre-0015-apply the RPC errors
      // (the function does not exist yet) — the error state, same
      // DB-not-applied discipline as slices 2–4.
      ;(async () => {
        try {
          const pub = await getPublicPlaydateDetail(id)
          if (cancelled) return
          setState(pub === null ? { status: 'not-found' } : { status: 'public', detail: pub })
        } catch (err) {
          if (cancelled) return
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Could not load this drop-in.',
          })
        }
      })()
    } else {
      ;(async () => {
        try {
          const detail = await getPlaydateDetail(id)
          if (cancelled) return
          if (detail === null) {
            setState({ status: 'not-found' })
            return
          }
          // Slice 5: a moderator-hidden post (hidden_at set) renders the
          // hidden state, never the content — the client-side check is the
          // detail-path equivalent of the feed's DB-level .is('hidden_at',
          // null) filter (same discipline as the slice-4 block check above).
          if (isHiddenPost(detail)) {
            setState({ status: 'hidden' })
            return
          }
          if (await getBlockState(detail.host.id)) {
            setState({ status: 'blocked', handle: detail.host.display_name })
            return
          }
          // The ping + comments + playdate_kids tables may not be applied
          // yet (0007 / 0013 / 0022): a failed load just hides that
          // section, never the post itself.
          const [count, going, comments, kids] = await Promise.all([
            getGoingCount(id).catch(() => null),
            hasPinged(id).catch(() => false),
            listComments(id).catch(() => null),
            // V3 slice 6 (ticket 09): the "Kids coming" rows (the 0022
            // playdate_kids table). Authenticated view only — the
            // signed-out public surface (the get_public_playdate 12-field
            // payload) carries no kids data (the ticket pin). Pre-0022-
            // apply the 42P01 is caught: the line stays hidden, the post
            // never crashes (the DB-not-applied discipline).
            listPlaydateKidNames(id).catch(() => null),
          ])
          if (cancelled) return
          setState({ status: 'ready', detail, count, going, comments, kids })
        } catch (err) {
          if (cancelled) return
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Could not load this drop-in.',
          })
        }
      })()
    }
    return () => {
      cancelled = true
    }
  }, [id, session, sessionLoading])

  // V2 slice 5: the ping-intent flag (the stored "I'm coming" target from
  // the signed-out view). It highlights the ping button for THIS post only;
  // handlePingToggle clears it (the explicit tap happened). An intent that
  // never got its confirming tap is cleared on leaving the post (id change
  // or unmount) — a stale intent must not re-highlight "Tap to confirm" on
  // a later visit to the same post. The exception is the in-flight "I'm
  // coming" return: its one-shot return target still points at this post
  // (the shell clears it on landing), so that intent is kept.
  useEffect(() => {
    if (id === undefined || id === '') return
    setPingIntent(window.sessionStorage.getItem(PLAYDATE_PING_INTENT_KEY) === id)
    return () => {
      if (window.sessionStorage.getItem(PLAYDATE_RETURN_KEY) === `/playdate/${id}`) return
      if (window.sessionStorage.getItem(PLAYDATE_PING_INTENT_KEY) === id) {
        window.sessionStorage.removeItem(PLAYDATE_PING_INTENT_KEY)
      }
    }
  }, [id])

  // V3 slice 2 (ticket 02): the best-effort "Rain likely" badge — the
  // Open-Meteo daily probability for the HOST's home_zip on the event's
  // local date (the post's location = the host's home zip, the V2 pin; the
  // zip rides the detail's host embed). One fetch per (zip, date) — the
  // wrapper's module cache + in-flight dedupe; the wrapper NEVER rejects
  // (null on any error / out-of-range date → the badge is silently absent,
  // the zero-pressure soul). An unset host zip → no fetch, never an
  // invented coordinate.
  const rainHostZip = state.status === 'ready' ? state.detail.host.home_zip : null
  const rainEventDateIso = state.status === 'ready' ? state.detail.starts_at : null
  useEffect(() => {
    if (typeof rainHostZip !== 'string' || rainHostZip === '' || rainEventDateIso === null) {
      return
    }
    let cancelled = false
    setRainProbability(null)
    void fetchRainProbabilityForZip(rainHostZip, rainEventDateIso).then((probability) => {
      if (!cancelled) setRainProbability(probability)
    })
    return () => {
      cancelled = true
    }
  }, [rainHostZip, rainEventDateIso])

  async function handlePingToggle() {
    if (state.status !== 'ready' || pingBusy) return
    const detail = state.detail
    // V2 slice 5: the explicit tap happened — clear the stored ping intent
    // (the "Tap to confirm" highlight was its whole job).
    window.sessionStorage.removeItem(PLAYDATE_PING_INTENT_KEY)
    setPingIntent(false)
    setPingBusy(true)
    setPingError(null)
    try {
      const going = await togglePing(detail.id)
      const count = await getGoingCount(detail.id)
      // Functional merge: touch ONLY count/going (the thread settled in the
      // meantime survives), and only for the post this toggle was issued
      // against — a ping op in flight during a comment op must never
      // clobber the post-op comments array (or a post we navigated away
      // from).
      setState((prev) =>
        prev.status === 'ready' && prev.detail.id === detail.id
          ? { ...prev, count, going }
          : prev,
      )
    } catch (err) {
      setPingError(err instanceof Error ? err.message : 'Could not update your ping. Try again.')
    } finally {
      setPingBusy(false)
    }
  }

  /**
   * V3 slice 2 (ticket 02; trimmed to On / Cancelled by V3 slice 3,
   * ticket 06, migration 0019): the host's status control. The control
   * renders in the host-only "This is your post" panel, so this is the
   * only caller; the RLS playdates_update_host is
   * the wall (a non-host API write is a silent 0-row 2xx — the 0014
   * lesson). A failed write (0016 not applied → 42703; a transient
   * network error) surfaces a designed error line — the event STAYS in
   * the feed (zero pressure; the host can retry). The functional merge
   * touches ONLY detail.status: the count / going + the comment thread
   * settled in the meantime survive (the ping + comment ops' discipline).
   */
  async function handleSetStatus(status: PlaydateStatus) {
    if (state.status !== 'ready' || statusBusy) return
    const detail = state.detail
    setStatusBusy(true)
    setStatusError(null)
    try {
      await setPlaydateStatus(detail.id, status)
      setState((prev) =>
        prev.status === 'ready' && prev.detail.id === detail.id
          ? { ...prev, detail: { ...prev.detail, status } }
          : prev,
      )
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Could not update the status. Try again.')
    } finally {
      setStatusBusy(false)
    }
  }

  /**
   * V2 slice 5 (the zero-pressure soul): the signed-out "I'm coming" tap.
   * Store BOTH the return target (the app shell applies it once the
   * onboarding gate has settled — a new signup goes through zip+radius
   * first) and the ping intent (the button highlights on return), then
   * hop to /login. The ping itself is NEVER issued here — it stays an
   * explicit tap after the return (no silent auto-ping).
   */
  function handleJoinIn() {
    if (state.status !== 'public') return
    const detail = state.detail
    window.sessionStorage.setItem(PLAYDATE_RETURN_KEY, `/playdate/${detail.id}`)
    window.sessionStorage.setItem(PLAYDATE_PING_INTENT_KEY, detail.id)
    navigate(LOGIN_PATH)
  }

  /**
   * V2 slice 5: Share — the Web Share API where supported, otherwise the
   * copy-link fallback (clipboard API + textarea fallback) with the
   * "Copied" confirmation. The URL is the pure buildShareUrl (db.getShareUrl:
   * VITE_PUBLIC_BASE_URL, or the window origin before deployment).
   */
  async function handleShare() {
    if (state.status !== 'ready' && state.status !== 'public') return
    if (shareBusy) return
    const detail = state.detail
    const url = getShareUrl(detail.id)
    setShareBusy(true)
    setShareCopied(false)
    try {
      if (navigator.share !== undefined) {
        try {
          await navigator.share({ title: detail.title, url })
          return
        } catch {
          // The share sheet was dismissed (or the platform rejected) —
          // fall through to the copy fallback.
        }
      }
      if (await copyToClipboard(url)) {
        setShareCopied(true)
        window.setTimeout(() => setShareCopied(false), 2000)
      }
    } finally {
      setShareBusy(false)
    }
  }

  /**
   * V3 slice 8 (ticket 03): "Add to calendar" — build the post's ICS
   * file from the post already in hand (the pure buildIcs seam,
   * ics.ts) and trigger a Blob download named playdate-<id>.ics (MIME
   * text/calendar, createObjectURL + anchor click + revoke). Works in
   * BOTH views: the signed-in 'ready' state hands over the
   * PlaydateWithNeighborhood row, the signed-out 'public' state the
   * 12-field PublicPlaydateDetail payload — public-surface fields only,
   * so no new data crosses the anon boundary (the ticket pin).
   */
  function handleDownloadIcs() {
    if (state.status !== 'ready' && state.status !== 'public') return
    const detail = state.detail
    const blob = new Blob([buildIcs(detail)], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `playdate-${detail.id}.ics`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  /**
   * Post the composer's draft (V2 slice 4): the empty/over-cap rejection is
   * the pure validateCommentBody (the DB CHECK is the backstop); a success
   * re-fetches the thread for the new row (the insert is a plain chain —
   * the issueReportInsert discipline, so the fresh row's author join comes
   * back with the list).
   *
   * V3 slice 7 (ticket 10): in the reply-to mode the insert carries the
   * target's id as parent_id (addComment's optional third arg — for a
   * plain comment it stays undefined and the key is OMITTED from the
   * payload, so a pre-0023-apply reply submit 42703s and surfaces the
   * error line below, red-by-design until the live apply). A success
   * clears the mode + the draft (the re-list keeps the settled thread).
   */
  async function handleAddComment() {
    if (state.status !== 'ready' || commentBusy) return
    const detail = state.detail
    const bodyError = validateCommentBody(commentDraft)
    if (bodyError !== null) {
      setCommentError(bodyError)
      return
    }
    // V3 slice 7 (ticket 10): the reply-to target (addComment's optional
    // third arg — null becomes undefined so the key is OMITTED from the
    // payload for a plain comment, the pre-0023-apply discipline).
    const parentId = replyToId ?? undefined
    setCommentBusy(true)
    setCommentError(null)
    try {
      await addComment(detail.id, commentDraft, parentId)
      setCommentDraft('')
      setReplyToId(null)
      const comments = await listComments(detail.id)
      // Functional merge: the fresh thread replaces comments, but count/
      // going (and detail) survive as settled in the meantime — a comment
      // op in flight during a ping toggle must never clobber the
      // post-toggle count (or a post we navigated away from).
      setState((prev) =>
        prev.status === 'ready' && prev.detail.id === detail.id
          ? { ...prev, comments }
          : prev,
      )
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Could not post your comment. Try again.')
    } finally {
      setCommentBusy(false)
    }
  }

  /**
   * V3 slice 7 (ticket 10): enter the reply-to mode — the bottom composer
   * targets this top-level comment (the submit carries its id as
   * parent_id). The affordance renders on top-level rows only (the pure
   * planCommentAction's canReply — the one-level pin: a reply offers no
   * Reply) and on visible rows only (a reply under a hidden parent would
   * be excluded from the thread — the 0023 header (b) rule).
   */
  function handleReplyTo(commentId: string) {
    setCommentError(null)
    setReplyToId(commentId)
  }

  /** Delete a comment (author or event host — the pure planCommentAction gates the button). */
  async function handleDeleteComment(commentId: string) {
    if (state.status !== 'ready' || commentBusy) return
    const detail = state.detail
    setCommentBusy(true)
    setCommentError(null)
    try {
      await deleteComment(commentId)
      // V3 slice 7 (ticket 10): the composer's reply-to target is gone —
      // clear the mode (its replies orphan out of the render via the
      // seam; no extra delete handling).
      if (replyToId === commentId) setReplyToId(null)
      // The removal is computed off the LATEST settled thread (functional
      // merge), not the render-time closure — a delete in flight during an
      // add must not resurrect the pre-add thread (or clobber the
      // post-add one, or a post we navigated away from).
      setState((prev) =>
        prev.status === 'ready' && prev.detail.id === detail.id
          ? { ...prev, comments: (prev.comments ?? []).filter((c) => c.id !== commentId) }
          : prev,
      )
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Could not delete that comment. Try again.')
    } finally {
      setCommentBusy(false)
    }
  }

  /**
   * Hide a comment (moderator op — the soft-hide via hidden_at, the /mod
   * model). 0014: the widened SELECT policy (hidden_at is null OR
   * moderator) keeps hidden rows readable by moderators, so the row
   * stays in the thread in its muted hidden state (matching a re-fetch)
   * instead of being dropped; non-moderators never see it (RLS).
   */
  async function handleHideComment(commentId: string) {
    if (state.status !== 'ready' || commentBusy) return
    const detail = state.detail
    setCommentBusy(true)
    setCommentError(null)
    try {
      await hideComment(commentId)
      // V3 slice 7 (ticket 10): hiding the reply-to target hides the
      // thread it would sit under (the mod's hide covers the thread — the
      // 0023 header (b) rule; the seam excludes the children) — clear
      // the mode.
      if (replyToId === commentId) setReplyToId(null)
      // Soft-hide (0014's model: the row stays, muted) — computed off the
      // LATEST settled thread (functional merge): a hide in flight during
      // an add must not resurrect the pre-add thread.
      const now = new Date().toISOString()
      setState((prev) =>
        prev.status === 'ready' && prev.detail.id === detail.id
          ? {
              ...prev,
              comments: (prev.comments ?? []).map((c) =>
                c.id === commentId ? { ...c, hidden_at: now } : c,
              ),
            }
          : prev,
      )
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Could not hide that comment. Try again.')
    } finally {
      setCommentBusy(false)
    }
  }

  // V2 slice 5: signed-out visitors render the public view — the page is
  // Loading only while its own loads are in flight (a stale 'ready' state
  // with the session gone is one beat before the public load re-runs).
  if (
    sessionLoading ||
    state.status === 'loading' ||
    (session === null && state.status === 'ready')
  ) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (state.status === 'public') {
    return renderPublicView(state.detail)
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-red-600">{state.message}</p>
        <p className="text-xs text-slate-400">
          If you just signed up, the server setup may not be complete yet.
        </p>
        <Link to="/" className="text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'not-found') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">We couldn’t find this drop-in</h1>
        <p className="text-sm text-slate-500">It may have been removed, or the link is a typo.</p>
        <Link to="/" className="text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'hidden') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">This drop-in has been removed</h1>
        <p className="text-sm text-slate-500">
          A moderator hid this post — it no longer shows up in feeds.
        </p>
        <Link to="/" className="text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'blocked') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Hidden</h1>
        <p className="text-sm text-slate-500">
          You blocked @{state.handle} — their drop-ins are hidden from you.
        </p>
        <Link
          to={`/u/${encodeURIComponent(state.handle)}`}
          className="text-sm text-indigo-600"
        >
          View @{state.handle} to unblock
        </Link>
      </div>
    )
  }

  const { detail, count, going, kids } = state
  // Unreachable (the loading gate above renders Loading for a null session
  // with a 'ready' state — 'ready' only ever settles from a signed-in
  // load): an explicit guard so TS narrows session to non-null below.
  if (session === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }
  const isHost = session.user.id === detail.host_profile_id
  // The moderator flag off the shared profile (same source the /mod route
  // guard reads): true shows each comment's Hide action (ticket 04).
  const isModerator = canModerate(profile)
  // V3 slice 2 (ticket 02): the post's status — pre-0016-apply the row
  // lacks the column (undefined → treated as 'on'). A non-'on' status
  // renders the muted states: the chip near the title + the grayed info
  // card (the event STAYS in the feed — the host can revert, no
  // auto-expiry). The rain badge is the pure rainBadgeLabel threshold on
  // the best-effort probability (null = silently absent).
  const postStatus: PlaydateStatus = detail.status ?? 'on'
  // V3 slice 3 (ticket 06, migration 0019): the muted chip renders for
  // "Cancelled" only — the third status option (redundant with Cancelled,
  // the origin-user feedback 2026-09-09) was trimmed; the Open-Meteo
  // "Rain likely" badge is an independent forecast, not a status state.
  const statusChip = postStatus === 'cancelled' ? 'Cancelled' : null
  const statusMuted = statusChip !== null
  const rainLabel = rainBadgeLabel(rainProbability)
  // V3 slice 5 (ticket 08): the place line's tappable Google Maps link
  // (the pure mapsHref seam, feed.ts) — null when the post has no address
  // (or pre-0021-apply, when the row lacks the column): plain text.
  const placeMapsHref = mapsHref(detail.place, detail.address)
  // V2 slice 5 (the zero-pressure soul): the stored ping intent highlights
  // the button as an EXPLICIT confirm — but only while the visitor is not
  // already going (a re-tap would unping, so the label tracks the real
  // state instead). Cleared by handlePingToggle (the tap happened).
  const confirmPing = pingIntent && !going
  // V3 slice 6 (ticket 09): the "Kids coming" line — the pure
  // feed.kidsComingLine over the name-ordered rows (null = hidden: the
  // load is null (0022 not applied / failed) or the selection is empty —
  // "Kids coming:" with nothing after is not a state, like a 0 going
  // line). Names + ages only — NO photos (the kid-photo pin).
  const kidsLine = kids !== null ? kidsComingLine(kids) : null
  // V2 slice 4 (ticket 04) + V3 slice 7 (ticket 10): the per-row comment
  // action plan's context (the signed-in viewer, the event's host, the
  // moderator flag) — shared by the top-level rows and their one-level
  // replies (the delete rule is per row: a reply's delete = the reply's
  // author or the host, never the parent's author).
  const commentActionCtx: CommentActionContext = {
    viewerId: session.user.id,
    hostId: detail.host_profile_id,
    isModerator,
  }
  // V3 slice 7 (ticket 10): the reply-to mode's target row (null when the
  // mode is off, or the target left the thread — the mode only clears via
  // the handlers / a fresh load, so a stale id simply falls back to the
  // plain "Add a comment" composer).
  const replyToAuthor =
    replyToId !== null && state.comments !== null
      ? (state.comments.find((c) => c.id === replyToId) ?? null)
      : null

  /**
   * V2 slice 5: the signed-out public surface — EXACTLY the pinned public
   * fields (title, place, address — the 12th field since V3 slice 5 /
   * migration 0021 — time window, age hint, details, neighborhood label,
   * host handle + avatar, going count). Every action surface shows
   * the sign-up prompt: the ping ("I'm coming" → the /login return path),
   * the auth-walled comment thread (no content, no composer), and reporting
   * (signed-in only — the reports RLS is the wall). The host line is plain
   * text: /u/:handle stays auth-walled, so no link out of here.
   */
  function renderPublicView(d: PublicPlaydateDetail) {
    // V3 slice 5 (ticket 08): the place line's tappable Google Maps link
    // (the public surface's 12th field, migration 0021) — null when the
    // post has no address (or pre-0021-apply, when the 11-field payload
    // omits it): the place line stays plain text.
    const publicMapsHref = mapsHref(d.place, d.address)
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{d.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {publicMapsHref !== null ? (
              <a
                href={publicMapsHref}
                target="_blank"
                rel="noopener"
                className="font-medium text-indigo-600 hover:underline"
              >
                {d.place}
              </a>
            ) : (
              d.place
            )}{' '}
            · {d.neighborhood_name}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">
            {formatDay(d.starts_at)} · {formatTime(d.starts_at)}–{formatTime(d.ends_at)}
          </p>
          {d.age_hint !== null ? (
            <p className="mt-1 text-sm text-slate-500">Best for {d.age_hint}</p>
          ) : null}
          {d.details !== null ? (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{d.details}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <PublicHostAvatar name={d.host_display_name} avatarUrl={d.host_avatar_url} />
              {/* 0015's composite type is nullable text (the RPC's LEFT
                  JOIN to profiles) — practically unreachable (the FK
                  cascade), rendered null-safe. */}
              {d.host_display_name !== null ? (
                <span>Hosted by @{d.host_display_name}</span>
              ) : null}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleShare()}
                disabled={shareBusy}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {shareCopied ? 'Copied' : 'Share'}
              </button>
              {/* V3 slice 8 (ticket 03): "Add to calendar" — the pure
                  buildIcs Blob download, beside Share on the signed-out
                  (public) surface too (the 12-field payload only — no
                  new data exposure; the group's flex-wrap keeps the row
                  fitting at 375px with no horizontal scroll). */}
              <button
                type="button"
                onClick={handleDownloadIcs}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Add to calendar
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <button
            type="button"
            onClick={handleJoinIn}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            I’m coming
          </button>
          <p className="mt-2 text-sm font-medium text-indigo-900">Sign up to join in</p>
          <p className="mt-1 text-sm text-indigo-700">{goingCountLine(d.going_count)}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Comments</h2>
          <p className="mt-2 text-sm text-slate-500">
            Comments are for signed-in parents.{' '}
            <Link to={LOGIN_PATH} className="font-medium text-indigo-600">
              Sign up to join in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  /**
   * One render row of the comment thread (V2 slice 4 + V3 slice 7,
   * ticket 10): a top-level comment OR a one-level reply — same shape,
   * the reply with the 24px avatar (HostAvatar size="sm"). The per-row
   * action buttons come from the pure planCommentAction: Delete (the
   * row's author or the event host — per row, so a reply's delete is the
   * REPLY's author or the host; the parent's author is out), Hide
   * (moderators; never offered on an already-hidden row — no unhide in
   * V2, the 0014 chip stays muted), and Reply — top-level rows only (the
   * one-level pin, the plan's canReply) and never on a hidden row (a
   * reply under a hidden parent is excluded from the thread — the 0023
   * header (b) rule, the mod's hide covers the thread). 0014: hidden
   * rows come back to moderators only (the SELECT policy's moderator
   * branch) — rendered muted + chipped; non-moderators never receive
   * them (RLS).
   */
  function renderCommentRow(
    comment: CommentWithAuthor,
    plan: CommentActionPlan,
    isReply: boolean,
  ) {
    const isHidden = !plan.canSee
    const showReply = plan.canReply && !isHidden
    return (
      <div className={`flex gap-3${isHidden ? ' opacity-60' : ''}`}>
        <HostAvatar host={comment.author} size={isReply ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <Link
              to={`/u/${encodeURIComponent(comment.author.display_name)}`}
              className="font-medium text-indigo-600"
            >
              @{comment.author.display_name}
            </Link>
            {isHidden ? (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                Hidden by moderator
              </span>
            ) : (
              <span className="ml-2 text-xs text-slate-400">
                {formatTime(comment.created_at)}
              </span>
            )}
          </p>
          <p
            className={`mt-0.5 whitespace-pre-line text-sm ${isHidden ? 'text-slate-400' : 'text-slate-700'}`}
          >
            {comment.body}
          </p>
          {plan.canDelete || (plan.canHide && !isHidden) || showReply ? (
            <div className="mt-1 flex gap-3">
              {plan.canDelete ? (
                <button
                  type="button"
                  disabled={commentBusy}
                  onClick={() => void handleDeleteComment(comment.id)}
                  className="text-xs text-slate-400 transition-colors hover:text-red-600"
                >
                  Delete
                </button>
              ) : null}
              {plan.canHide && !isHidden ? (
                <button
                  type="button"
                  disabled={commentBusy}
                  onClick={() => void handleHideComment(comment.id)}
                  className="text-xs text-slate-400 transition-colors hover:text-red-600"
                >
                  Hide
                </button>
              ) : null}
              {showReply ? (
                <button
                  type="button"
                  disabled={commentBusy}
                  onClick={() => handleReplyTo(comment.id)}
                  className="text-xs text-slate-400 transition-colors hover:text-indigo-600"
                >
                  Reply
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        {/* V3 slice 2 (ticket 02; V3 slice 3 trimmed it to "Cancelled"
            only — migration 0019, ticket 06): the muted-state chip —
            rendered for every viewer; the host's explicit state is
            information, not a removal (the event stays in the feed). */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">{detail.title}</h1>
          {statusChip !== null ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {statusChip}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {placeMapsHref !== null ? (
            <a
              href={placeMapsHref}
              target="_blank"
              rel="noopener"
              className="font-medium text-indigo-600 hover:underline"
            >
              {detail.place}
            </a>
          ) : (
            detail.place
          )}{' '}
          · {detail.neighborhood.name}
        </p>
      </div>

      <div
        className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm${
          statusMuted ? ' opacity-60' : ''
        }`}
      >
        <p className="text-sm text-slate-700">
          {formatDay(detail.starts_at)} · {formatTime(detail.starts_at)}–{formatTime(detail.ends_at)}
          {/* V3 slice 2 (ticket 02): the best-effort "Rain likely" badge
              (Open-Meteo, host's home zip, >= 50%) — silently absent when
              the fetch fails or the probability is below the threshold. */}
          {rainLabel !== null ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 align-middle text-xs font-medium text-sky-700">
              ☔ {rainLabel}
            </span>
          ) : null}
        </p>
        {/* V3 slice 3 (ticket 06, feedback #4): the "Best for …" age-hint line
            is out of the authenticated detail view — the DB column + the
            /new field stay (ticket 09 reworks /new); the signed-out
            public view keeps its 0015 field. */}
        {detail.details !== null ? (
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{detail.details}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <Link
            to={`/u/${encodeURIComponent(detail.host.display_name)}`}
            className="flex items-center gap-2 text-sm font-medium text-indigo-600"
          >
            <HostAvatar host={detail.host} />
            <span>Hosted by @{detail.host.display_name}</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={shareBusy}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-50"
            >
              {shareCopied ? 'Copied' : 'Share'}
            </button>
            {/* V3 slice 8 (ticket 03): "Add to calendar" — the pure
                buildIcs Blob download, beside Share for every viewer
                (the public-surface fields only; the row's flex-wrap
                keeps it fitting at 375px with no horizontal scroll). */}
            <button
              type="button"
              onClick={handleDownloadIcs}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Add to calendar
            </button>
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="text-sm text-slate-400 transition-colors hover:text-slate-600"
            >
              Report
            </button>
          </div>
        </div>
      </div>

      {isHost ? (
        // The host sees an explicit "This is your post" panel with the going
        // count and a Duplicate action (V2 slice 1) — no ping button (the
        // host cannot ping their own post: the client guard in
        // db.togglePing, the 0010 DB trigger behind it).
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-indigo-900">This is your post</p>
            <button
              type="button"
              onClick={() =>
                navigate('/new', { state: { duplicate: toDuplicatePrefill(detail) } })
              }
              className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              Duplicate
            </button>
          </div>
          <p className="mt-1 text-sm text-indigo-700">
            {count !== null ? hostGoingCountLine(count) : 'No pings yet'}
          </p>
          {/* V3 slice 2 (ticket 02; V3 slice 3, ticket 06 + migration
               0019 trimmed the options to On / Cancelled — the third
               option, redundant with Cancelled, was removed): the host's
               status control — the ONLY status surface (this panel
               renders for the host only; non-hosts + the signed-out
               view never see it). The RLS playdates_update_host is the
               wall; the active option shows the current state. */}
          <div className="mt-3 border-t border-indigo-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900">Status</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {HOST_STATUS_OPTIONS.map((option) => {
                const active = postStatus === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    disabled={statusBusy}
                    onClick={() => void handleSetStatus(option.value)}
                    className={
                      active
                        ? 'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50'
                        : 'rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50'
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            {statusError !== null ? (
              <p className="mt-2 text-sm text-red-600">{statusError}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            aria-pressed={going}
            disabled={pingBusy || count === null}
            onClick={() => void handlePingToggle()}
            autoFocus={confirmPing}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50${
              going ? ' bg-green-600' : ' bg-indigo-600'
            }${confirmPing ? ' ring-2 ring-indigo-400 ring-offset-2' : ''}`}
          >
            {pingBusy
              ? 'Updating…'
              : confirmPing
                ? 'Tap to confirm you’re coming'
                : going
                  ? '✓ Going'
                  : 'Attend'}
          </button>
          {count !== null ? (
            <p className="mt-2 text-sm text-slate-500">{goingCountLine(count)}</p>
          ) : null}
          {pingError !== null ? <p className="mt-2 text-sm text-red-600">{pingError}</p> : null}
        </div>
      )}

      {/* V3 slice 6 (ticket 09): the "Kids coming" line — the post's
          host-picked kids (the 0022 playdate_kids selection), below the
          ping section. Names + ages ONLY — no photos (the kid-photo pin:
          a kid photo renders only in the profile kids list, never on the
          event line). Hidden when the load is null (0022 not applied —
          the 42P01 is caught, the DB-not-applied discipline) or the
          selection is empty (the 0-count "line" is not a state). */}
      {kidsLine !== null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">Kids coming: {kidsLine}</p>
        </div>
      ) : null}

      {/* V2 slice 4 (ticket 04): the comment thread — author avatar
        (the HostAvatar shape) + handle linking to /u/:handle. The
        per-row buttons come from the pure planCommentAction; the
        section is absent (null) until 0013 is applied — the page
        never crashes on a missing table.
        V3 slice 7 (ticket 10): the thread groups — the pure
        groupCommentsForRender (trust.ts) renders each top-level
        comment with its one-level replies indented (ml-8, 24px
        avatar); any signed-in parent gets the Reply affordance on a
        top-level row (the composer's reply-to mode targets it — the
        submit carries parent_id; pre-0023-apply that insert 42703s
        and the error line surfaces, red-by-design until the live
        apply); a reply offers no Reply (the one-level pin). */}
      {state.comments !== null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Comments{state.comments.length > 0 ? ` (${state.comments.length})` : ''}
          </h2>
          {state.comments.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No comments yet — ask a question below.</p>
          ) : (
            // V3 slice 7 (ticket 10): the thread groups — the pure
            // groupCommentsForRender (trust.ts) threads the flat row set:
            // one group per top-level comment, its one-level replies under
            // it (ml-8 indent, 24px avatar), children in created_at order;
            // a hidden parent's group renders its muted row only (the
            // children are excluded — the mod's hide covers the thread, the
            // 0023 header (b) rule); a reply whose parent left the row set
            // (or points at another reply — the one-level pin is
            // client-side, 0023 allows such rows at the DB level) is
            // dropped. Pre-0023-apply every row lacks parent_id (treated
            // as null): the current flat thread renders unchanged.
            <ul className="mt-3 flex flex-col gap-3">
              {groupCommentsForRender(state.comments).map((group) => {
                const parentPlan = planCommentAction(group.parent, commentActionCtx)
                return (
                  <li key={group.parent.id}>
                    {renderCommentRow(group.parent, parentPlan, false)}
                    {group.children.length > 0 ? (
                      <ul className="ml-8 mt-2 flex flex-col gap-2">
                        {group.children.map((child) => (
                          <li key={child.id}>
                            {renderCommentRow(
                              child,
                              planCommentAction(child, commentActionCtx),
                              true,
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-4 border-t border-slate-100 pt-3">
            {replyToAuthor !== null ? (
              // V3 slice 7 (ticket 10): the reply-to mode — the composer
              // targets the parent (the submit carries its id as parent_id).
              // Cancel clears the mode only (the draft stays, as a plain
              // "Add a comment" below).
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">
                  Replying to{' '}
                  <span className="font-semibold text-indigo-600">
                    @{replyToAuthor.author.display_name}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setReplyToId(null)}
                  className="text-xs text-slate-400 transition-colors hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <label htmlFor="comment-composer" className="text-xs font-medium text-slate-500">
                Add a comment
              </label>
            )}
            <textarea
              id="comment-composer"
              rows={2}
              value={commentDraft}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="Ask a question — e.g. “Is a stroller okay to bring?”"
              onChange={(e) => setCommentDraft(e.target.value)}
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {commentDraft.length}/{COMMENT_MAX_LENGTH}
              </span>
              <button
                type="button"
                disabled={commentBusy || commentDraft.trim().length === 0}
                onClick={() => void handleAddComment()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {commentBusy ? 'Posting…' : 'Comment'}
              </button>
            </div>
            {commentError !== null ? (
              <p className="mt-2 text-sm text-red-600">{commentError}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {reporting ? (
        <ReportDialog
          targetLabel="this drop-in"
          playdateId={detail.id}
          profileId={detail.host.id}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </div>
  )
}

/**
 * The host's status control options (V3 slice 2, ticket 02; trimmed by
 * V3 slice 3, ticket 06 + migration 0019): the playdates.status values
 * with their display labels. 'on' is the DB default (the "it's on"
 * state). The third option was removed as redundant with Cancelled (the
 * origin-user feedback 2026-09-09, feedback/v3.md #5) — the Open-Meteo
 * "Rain likely" badge is an independent forecast and is unaffected.
 */
const HOST_STATUS_OPTIONS: ReadonlyArray<{ value: PlaydateStatus; label: string }> = [
  { value: 'on', label: 'On' },
  { value: 'cancelled', label: 'Cancelled' },
]

/** Local day label, e.g. "Sat, Sep 12" (the device's timezone — V1). */
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Human-readable time, e.g. "3 PM" or "3:30 PM". */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** The friendly count line (counts only — no per-person attendee list). */
function goingCountLine(count: number): string {
  if (count === 0) return 'Be the first — we’d love to see you'
  return `${count} ${count === 1 ? 'family' : 'families'} going — come say hi`
}

/** The host's own count line (it's your post — no "come say hi"). */
function hostGoingCountLine(count: number): string {
  if (count === 0) return 'No one has pinged yet'
  return `${count} ${count === 1 ? 'family' : 'families'} going`
}

/**
 * V2 slice 5: the 40px round host avatar for the SIGNED-OUT public view —
 * the HostAvatar shape without the profile row (the public surface carries
 * only the host's display_name + avatar_url; no host.id crosses to anon).
 */
function PublicHostAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  return avatarUrl !== null && avatarUrl !== '' ? (
    <img
      src={avatarUrl}
      alt=""
      className="h-10 w-10 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-500"
    >
      {(name?.charAt(0) || '?').toUpperCase()}
    </span>
  )
}

/**
 * V2 slice 5: the copy-link fallback (the Share button's fallback path when
 * the Web Share API is absent or the sheet is dismissed): the async
 * clipboard API first, then the classic textarea + execCommand fallback.
 * Returns whether the text actually landed in the clipboard.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Insecure context / permission denied — fall through to the
    // textarea path below.
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(area)
  return ok
}