import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DeletePlaydateDialog } from '../components/DeletePlaydateDialog'
import { HostAvatar } from '../components/DropInCard'
import { PhotoButton } from '../components/ImageLightbox'
import { KidsComingPicker } from '../components/KidsComingPicker'
import { ReportDialog } from '../components/ReportDialog'
import { useSessionContext } from '../components/SessionProvider'
import { LOGIN_PATH } from '../lib/auth'
import {
  INITIAL_COMMENT_ACTION_STATE,
  armCommentAction,
  beginCommentAction,
  cancelCommentAction,
  commentActionDialogCopy,
  endCommentAction,
  isCommentActionBusy,
} from '../lib/commentActions'
import {
  addComment,
  deleteComment,
  deletePlaydate,
  ensureSeriesOccurrences,
  fetchGuestList,
  fetchRainProbabilityForZip,
  getBlockState,
  getGoingCount,
  getPlaydateDetail,
  getPlaydateSeries,
  getPublicPlaydateDetail,
  getShareUrl,
  hasPinged,
  hideComment,
  kidAgesForPlaydate,
  listComments,
  listKids,
  listKidsGoing,
  listMyPingKids,
  listPlaydateKidNames,
  listSeriesOccurrences,
  setPlaydateStatus,
  setSeriesActive,
  togglePing,
  unhideComment,
} from '../lib/db'
import {
  ageRangeLine,
  formatGuestLine,
  isHiddenPost,
  kidsComingLine,
  kidLabel,
  mapsHref,
  statedAgeRangeLine,
  rainBadgeLabel,
  resolveGuestListVisibility,
  toDuplicatePrefill,
} from '../lib/feed'
import { buildIcs } from '../lib/ics'
import { canModerate } from '../lib/moderation'
// V8 ticket 07: the signed-in AND signed-out place lines link to /place/:id
// (the 13th public field is a bare id; the place page reads the directory
// itself).
import { placePath } from '../lib/places'
// V8 ticket 09 (migration 0033): "Same time next week" — the pure
// ended-window gate, the next-occurrence chooser and its copy builder.
import {
  endedWithinDays,
  nextOccurrencePlan,
  occurrenceWhenLabel,
} from '../lib/follows'
// V8 ticket 08: recording the meaningful action (a saved ping) that may be
// followed by the notification opt-in; the shell's PushOptInPrompt decides.
import { armPushPromptForAction } from '../lib/pushClient'
import { seriesLineLabel, weeklyMetaSuffix } from '../lib/series'
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
  Kid,
  PlaydateKid,
  PlaydateSeries,
  PlaydateStatus,
  PlaydateWithNeighborhood,
  PublicPlaydateDetail,
} from '../lib/types'

/**
 * V8 ticket 09 (migration 0033): the "Same time next week" plan for ONE post,
 * resolved by the effect below and rendered by the block near the end of the
 * page. The post id is part of EVERY variant: a plan is only ever rendered for
 * the post it was read for (the seriesState discipline), so navigating between
 * posts cannot show one post's next occurrence on another's page.
 *
 * - 'one-off'      → the post does not repeat: the action prefills /new with
 *                    the existing duplicate router state (same place, same
 *                    titles — the time is always re-entered).
 * - 'occurrence'   → the post belongs to a 0028 series and the NEXT occurrence
 *                    is known: one tap pings it (`alreadyGoing` = the viewer
 *                    is on that roster already, so the page confirms instead
 *                    of offering a control that would UN-ping it).
 * - 'none'         → there is no next occurrence, and the page says WHY
 *                    ('stopped' = the host stopped repeating; 'no-more' = the
 *                    horizon has no week posted ahead). Never a dead control.
 */
type SameTimeNextWeek =
  | { postId: string; kind: 'one-off' }
  | {
      postId: string
      kind: 'occurrence'
      id: string
      startsAt: string
      alreadyGoing: boolean
    }
  | { postId: string; kind: 'none'; reason: 'stopped' | 'no-more' }

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
       * V8 ticket 02: the comment thread's load FAILED (as opposed to
       * "there are none"). The two are different facts and the page used to
       * render them identically — an absent section, which reads as "no
       * comments yet" and quietly tells a parent the post has no replies.
       * With this flag the failed read renders its own honest state
       * ("Couldn't load comments." + Retry). Always false when `comments` is
       * non-null.
       */
      commentsFailed: boolean
      /**
       * V3 slice 6 (ticket 09): the "Kids coming" rows (the 0022
       * playdate_kids selection, name-ordered — db.listPlaydateKidNames).
       * null = not loaded — 0022 not applied (the 42P01 is caught in the
       * load below) or the read failed: the line is hidden, never the
       * post (the DB-not-applied discipline, same as the ping section).
       */
      kids: PlaydateKid[] | null
      /**
       * V9 ticket 10: the post's derived kid AGES (db.kidAgesForPlaydate — the
       * ages-only SECURITY DEFINER read, migration 0040). They are what keeps
       * the ages line alive for a viewer the names are gated from: a stranger
       * reads "Ages 3–6" alone. null = the read failed or has not settled:
       * the line falls back to deriving from `kids`, exactly as before.
       */
      kidAges: number[] | null
      /**
       * V3 slice 10 (ticket 05): the guest-list names (the 0025
       * get_guest_list RPC — the pingers' display_names, created_at
       * order). null = not loaded — 0025 not applied (the 404 is
       * caught in the load below) or the read failed: the block is
       * hidden, never the post (the DB-not-applied discipline, same
       * as the ping / kids sections).
       */
      guestNames: string[] | null
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
 * "✓ Going" — same toggle semantics, the green-700 fill tracks the
 * going state).
 *
 * V8 ticket 05 (post edit + delete): that host panel gains Edit (a Link to
 * /playdate/:id/edit — the shared field set, so a typo in the time is fixed
 * in place instead of cancel + repost, which silently lost everyone who had
 * said they were going) and Delete (behind the in-page
 * DeletePlaydateDialog, whose copy names the consequence). Both are inside
 * the host-only panel, so neither is rendered for a non-host or the
 * signed-out view; the RLS playdates_update_host / _delete_host policies
 * from 0005 are the DB wall behind them. Everything else on this page — the
 * status control, Share, Add to calendar, Duplicate — is untouched.
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
 * muted states (the chip near the title + the grayed info card). V9 ticket 04
 * superseded V3/02's "the event STAYS in the feed" for one case, recorded in
 * that ticket's Comments: it holds while the window is ahead (the host can
 * revert, no auto-expiry), but a cancelled post whose window has ENDED leaves
 * the FEED — this detail page and the archive still carry it, which is exactly
 * why the control lives here rather than on a card. A
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
 * button's copy is "Attend" (inactive) / "✓ Going" (active, green-700
 * filled — same geometry, the toggle semantics unchanged); the
 * "Best for …" age-hint line is out of the authenticated detail view
 * (the DB column + the /new field stay — ticket 09 reworks /new; the
 * signed-out public view keeps its 0015 field).
 *
 * V12 t03 (ticket 03, migration 0041): the status control gains a
 * third, genuinely different option — "End this post now" (status
 * 'ended'): the host ends the event early, so the post leaves the feed
 * immediately while its window is still ahead (honest history, option
 * A — it stays in the owner's Past list, labelled "Ended", distinct
 * from "Cancelled"); the muted chip renders "Ended" for it.
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
 *
 * V3 slice 10 (ticket 05, migration 0025): the guest-list block below
 * the ping section (the "Kids coming" block) — progressive disclosure
 * (the founder-approved spec, .scratch/guest-list/spec.md): the host
 * sees "Going: <names>" (the pingers' display names, up to 3 + the
 * "+ N more" overflow), a pinger sees "You, <others>" (their own
 * display name stands in as "You" — dropped from the RPC list, up to
 * 2 others), a stranger sees NOTHING here (their count line above
 * stays unchanged — the zero-pressure surface). Hidden when the count
 * is 0/null; the 0025 get_guest_list RPC (SECDEF, EXECUTE
 * authenticated-only) 404s pre-apply and the load's catch keeps
 * guestNames null — the block stays hidden, never the post (the
 * DB-not-applied discipline, same as the ping / kids sections); the
 * signed-out public view never renders it (the RPC is
 * EXECUTE-to-authenticated-only — the signed-in surface).
 *
 * V8 ticket 06 (migration 0028): an occurrence of a weekly series says so on
 * the time line — ` · weekly` as TEXT after the window (never a new badge: the
 * badge slot carries status / ended / happening-now / starts-soon / rain, and
 * the rain badge keeps its place). The post is otherwise an ordinary drop-in —
 * pings, the guest list, kids, comments, ICS, share and the public view all
 * behave exactly as they do for a one-off, which is the point of the whole
 * design.
 *
 * The host's panel gains the rule behind the post ("Weekly · every Saturday
 * 10 AM") and "Stop repeating", which sets `active = false` on the series and
 * deletes NOTHING: the weeks already generated are other families' plans and
 * stay as ordinary posts. Two disciplines ride along:
 *   - the HOST opening this page is generation trigger (b) (the pinned
 *     (a)+(b) strategy — no cron job, never a write on a viewer's read);
 *   - pre-0028-apply the row has no series_id and the RPC/table do not exist,
 *     so nothing is fetched, nothing renders and nothing is swallowed into a
 *     crash (the DB-not-applied discipline).
 */
export function PlaydateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, loading: sessionLoading, profile } = useSessionContext()
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const [reporting, setReporting] = useState(false)
  const [pingBusy, setPingBusy] = useState(false)
  const [pingError, setPingError] = useState<string | null>(null)
  // V8 ticket 02: the two degraded states' retry buttons (a failed going-count
  // read, a failed comment-thread read). Both live up here with every other
  // hook — the component returns early for its loading/error states, and a
  // hook after a conditional return makes React throw (the V6 lesson below).
  const [countRetryBusy, setCountRetryBusy] = useState(false)
  const [commentsRetryBusy, setCommentsRetryBusy] = useState(false)
  // V2 slice 4: the comment composer (empty rejected client-side; the
  // pure validateCommentBody is the second check in handleAddComment).
  const [commentDraft, setCommentDraft] = useState('')
  // V8 ticket 10: the comment-row action state machine (the pure
  // lib/commentActions.ts — arm → confirm/cancel, one in-flight write for the
  // whole thread). `busy` is the guard every comment write already shared, so
  // the composer and the row actions still cannot overlap.
  const [commentAction, setCommentAction] = useState(INITIAL_COMMENT_ACTION_STATE)
  const commentBusy = isCommentActionBusy(commentAction)
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
  // V8 ticket 10: the share sheet went away AND the clipboard write failed —
  // then the link is shown to select by hand. Silent failure was the bug: the
  // "Copied" chip never appeared and nothing said why, so a parent who was
  // trying to send the link had nothing to send and no idea.
  const [shareError, setShareError] = useState(false)
  // V2 slice 5 (the zero-pressure soul): true when the visitor returned
  // from the /login hop intending to ping THIS post (the stored ping-intent
  // flag) — the ping button highlights as "Tap to confirm you're coming";
  // the ping itself is always an explicit tap, never a silent auto-ping.
  const [pingIntent, setPingIntent] = useState(false)
  // V6: who is bringing kids (migration 0026). These hooks MUST live up here
  // with the others: the component returns early for its loading/error states,
  // and a hook called after a conditional return makes React throw "rendered
  // more hooks than during the previous render" — which is exactly how this
  // first landed (a blank detail page, caught by the end-to-end check).
  // The load is a progressive enhancement: pre-0026 the RPCs 404 and every
  // piece below simply stays empty, so it can never knock the post itself into
  // an error state.
  const [kidsGoing, setKidsGoing] = useState<
    Array<{ id: string; firstName: string; age: number | null }>
  >([])
  const [myKids, setMyKids] = useState<Kid[]>([])
  const [myPingKids, setMyPingKids] = useState<string[]>([])
  // `going` is derived from the state machine far below (the early returns sit
  // in between), so read it here in its always-safe form for the effect deps.
  const goingNow = state.status === 'ready' ? state.going : false
  // Bumped after the picker writes, so the names line below re-reads — without
  // it the page kept showing the list it loaded BEFORE the selection (caught by
  // the end-to-end check: the card counted the kid while the detail page still
  // said nothing).
  const [kidsReloadToken, setKidsReloadToken] = useState(0)

  useEffect(() => {
    if (session === null || id === undefined) return
    const postId = id
    let cancelled = false
    void (async () => {
      const [goingKids, mine] = await Promise.all([
        listKidsGoing(postId).catch(() => []),
        listKids(session.user.id).catch(() => []),
      ])
      if (cancelled) return
      setKidsGoing(goingKids)
      setMyKids(mine)
      const selected = goingNow ? await listMyPingKids(postId).catch(() => []) : []
      if (cancelled) return
      setMyPingKids(selected)
    })()
    return () => {
      cancelled = true
    }
  }, [id, goingNow, session])

  // The picker's own write is the only thing that changes the names line, and
  // it re-reads ONLY that — re-running the whole load above would clobber the
  // picker's optimistic selection with a read that can beat the write.
  useEffect(() => {
    if (id === undefined || kidsReloadToken === 0) return
    const postId = id
    let cancelled = false
    void (async () => {
      const rows = await listKidsGoing(postId).catch(() => [])
      if (!cancelled) setKidsGoing(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [id, kidsReloadToken])
  // V3 slice 2 (ticket 02): the host's status control — its busy flag + a
  // designed error line (a failed write never hides the event; zero
  // pressure), and the best-effort rain probability (the "Rain likely"
  // badge; null = silently absent — the fetch never rejects).
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [rainProbability, setRainProbability] = useState<number | null>(null)
  // V8 ticket 05: the host's Delete — the in-page confirmation (never
  // window.confirm), its in-flight flag and its error line. All three live
  // up here with the other hooks (the V6 lesson below): the component
  // returns early for its loading/error states.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // V8 ticket 06: the weekly series behind this post, as the HOST sees it
  // (the "Weekly · every Saturday 10 AM" line + Stop repeating). The row is
  // stored WITH the series id it was read for, so navigating from one
  // occurrence to another can never render the previous post's rule while the
  // new read is in flight. These hooks live up here with the others (the V6
  // lesson: the component returns early below, and a hook after a conditional
  // return makes React throw).
  const [seriesState, setSeriesState] = useState<{
    seriesId: string
    row: PlaydateSeries | null
  } | null>(null)
  const [seriesBusy, setSeriesBusy] = useState(false)
  const [seriesError, setSeriesError] = useState<string | null>(null)
  // V8 ticket 09 (migration 0033): "Same time next week" — the action a post
  // that ENDED in the last 7 days offers its host and the families who pinged
  // it. The state is stored WITH the post id it was read for (the seriesState
  // discipline), so navigating from one post to another can never render the
  // previous post's next occurrence. null = no affordance (not eligible, the
  // reads have not settled, or a read failed — see the effect below: a series
  // whose rule cannot be read offers NOTHING rather than a dead control).
  // These hooks live up here with the others (the V6 lesson: the component
  // returns early below, and a hook after a conditional return makes React
  // throw).
  const [sameNextWeek, setSameNextWeek] = useState<SameTimeNextWeek | null>(null)
  const [nextWeekBusy, setNextWeekBusy] = useState(false)
  const [nextWeekError, setNextWeekError] = useState<string | null>(null)
  // Read off the settled state so the effect below has stable deps regardless
  // of where the early returns sit. null (the post is a one-off, the viewer is
  // not the host, or pre-0028-apply — the column is absent from the row) means
  // no series panel at all.
  const seriesIdOnPost = state.status === 'ready' ? (state.detail.series_id ?? null) : null
  const viewerIsHost =
    state.status === 'ready' && session !== null && state.detail.host_profile_id === session.user.id
  // The loaded row for THIS post only (a stale one is ignored, not cleared —
  // no setState in an effect, and no flash of the wrong series).
  const series =
    seriesState !== null && seriesState.seriesId === seriesIdOnPost ? seriesState.row : null

  // V8 ticket 06: the HOST's own open of an occurrence is generation trigger
  // (b) — the second half of the pinned strategy (the first is series
  // creation in /new), and the reason the feature stays correct with no cron
  // job. It runs ONLY for the host: a viewer's page load must never write
  // (and the RPC is EXECUTE-to-authenticated anyway, so a viewer's call would
  // be a pointless round-trip). Fire-and-forget: pre-0028-apply the RPC does
  // not exist, and a failed top-up must never cost the post a section.
  useEffect(() => {
    if (seriesIdOnPost === null || !viewerIsHost) return
    const seriesId = seriesIdOnPost
    let cancelled = false
    void ensureSeriesOccurrences(seriesId).catch(() => {
      /* Swallowed: pre-0028-apply the RPC 404s; a transient failure retries
         on the next open (the (a)+(b) fallback is the whole strategy). */
    })
    getPlaydateSeries(seriesId)
      .then((row) => {
        if (!cancelled) setSeriesState({ seriesId, row })
      })
      .catch(() => {
        if (!cancelled) setSeriesState({ seriesId, row: null })
      })
    return () => {
      cancelled = true
    }
  }, [seriesIdOnPost, viewerIsHost])

  /**
   * V8 ticket 09: the "Same time next week" plan, read once per settled post.
   *
   * THE GATE (the pinned three): the post ENDED within the last 7 days, the
   * viewer is its HOST or has PINGED it, and the load settled. Nothing else
   * gets this affordance — a stranger sees exactly the page that shipped
   * before this ticket, and the signed-out public view never renders it at
   * all (there is no session, so there is no host/pinger relationship to
   * check).
   *
   * WHAT IT READS: only the post itself, plus — for an occurrence — the
   * series row and its sibling occurrences (both plain reads; a viewer's page
   * load NEVER generates, the 0028 pin (h)), and whether the viewer is
   * already going to the next one. Pre-0028/0033-apply any of those can fail,
   * and a failed read settles to NO affordance (never a guessed date).
   *
   * A one-off post needs no read at all: its plan is the /new duplicate
   * prefill, decided at render.
   */
  // Read off the settled state so the effect below has PRIMITIVE deps (the
  // seriesIdOnPost discipline): a comment or a ping landing must not re-run
  // the planning reads, and the plan can never belong to a previous post.
  const nextWeekPostId = state.status === 'ready' ? state.detail.id : null
  const nextWeekEndsAt = state.status === 'ready' ? state.detail.ends_at : null
  const nextWeekGoing = state.status === 'ready' ? state.going : false
  const sameNextWeekEligible =
    nextWeekPostId !== null &&
    nextWeekEndsAt !== null &&
    (viewerIsHost || nextWeekGoing) &&
    endedWithinDays({ ends_at: nextWeekEndsAt }, new Date().toISOString())
  useEffect(() => {
    const postId = nextWeekPostId
    if (postId === null || !sameNextWeekEligible) {
      setSameNextWeek(null)
      setNextWeekError(null)
      return
    }
    const seriesId = seriesIdOnPost
    let cancelled = false
    setNextWeekError(null)
    if (seriesId === null) {
      // A one-off: no read, no query — the plan is the existing duplicate
      // prefill (the ticket's "same place and titles" path).
      setSameNextWeek({ postId, kind: 'one-off' })
      return
    }
    void (async () => {
      try {
        // The HOST's page is generation trigger (b) (0028, the effect above) —
        // and that top-up is FIRE-AND-FORGET there. Here the host's plan is
        // read AFTER awaiting the SAME idempotent generator, so a horizon that
        // had run out cannot make this block claim "no more weeks are posted
        // yet" one beat before the new week lands. The call is a no-op when the
        // horizon is already full (it returns rows created = 0), and a VIEWER
        // never calls it at all (pin (h): a viewer's page load must not write).
        if (viewerIsHost) {
          await ensureSeriesOccurrences(seriesId).catch(() => 0)
        }
        const [seriesRow, occurrences] = await Promise.all([
          getPlaydateSeries(seriesId),
          listSeriesOccurrences(seriesId),
        ])
        if (cancelled) return
        if (seriesRow === null) {
          // The rule behind this post cannot be read (a failed read, or the
          // row is gone): no affordance at all — we cannot name a next week,
          // so we do not offer one.
          setSameNextWeek(null)
          return
        }
        const plan = nextOccurrencePlan(
          { active: seriesRow.active },
          occurrences,
          new Date().toISOString(),
        )
        if (plan.kind === 'none') {
          setSameNextWeek({ postId, kind: 'none', reason: plan.reason })
          return
        }
        // Already going to the next one? Then there is nothing to ping — the
        // page says so instead of showing a button whose tap would UN-ping it
        // (the toggle's own semantics). One cheap read on an eligible page.
        // Skipped for the HOST: they cannot ping their own post (the client
        // guard in db.togglePing + the 0010 DB trigger), so the host never
        // gets the ping control at all — see the render.
        const alreadyGoing = viewerIsHost ? false : await hasPinged(plan.id).catch(() => false)
        if (cancelled) return
        setSameNextWeek({
          postId,
          kind: 'occurrence',
          id: plan.id,
          startsAt: plan.startsAt,
          alreadyGoing,
        })
      } catch {
        if (!cancelled) setSameNextWeek(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [nextWeekPostId, sameNextWeekEligible, seriesIdOnPost, viewerIsHost])

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
          // yet (0007 / 0013 / 0022): a failed load never costs the post
          // itself. V8 ticket 02: the going count's and the thread's failures
          // are no longer SILENT — a null count gets the retry line under the
          // ping button, and a failed thread gets "Couldn't load comments." +
          // Retry (commentsFailed) instead of an absent section that reads as
          // "no comments yet". The kids block still degrades silently (the
          // ticket pin: no error UI on best-effort decorations).
          const [count, going, commentsResult, kids, kidAges, guestNames] = await Promise.all([
            getGoingCount(id).catch(() => null),
            hasPinged(id).catch(() => false),
            // V8 ticket 02: the thread's failure is caught as its OWN fact
            // (commentsFailed) instead of collapsing into null — a failed read
            // must never be rendered as "no comments yet" (nor as an absent
            // section, which reads the same way). The catch still keeps the
            // post itself alive: a broken thread never costs the drop-in.
            listComments(id)
              .then((rows) => ({ rows, failed: false }))
              .catch(() => ({ rows: null, failed: true })),
            // V3 slice 6 (ticket 09) + V9 ticket 10 (0040): the "Kids coming"
            // rows, now through the GATED SECURITY DEFINER get_playdate_kids
            // (host / going / moderator). A stranger gets an empty array, not
            // an error — the names simply never arrive on their page.
            // Authenticated view only — the signed-out public surface (the
            // get_public_playdate 12-field payload) carries no kids data (the
            // ticket pin). Pre-0022-apply the 42P01 is caught: the line stays
            // hidden, the post never crashes (the DB-not-applied discipline).
            listPlaydateKidNames(id).catch(() => null),
            // V9 ticket 10: the DERIVED range's own read (the ages-only
            // SECDEF function — the T1 coupling). It is what lets a viewer who
            // may not see the names still read "Ages 3–6": without it the
            // tightening of `playdate_kids` would have left every non-host
            // with no ages line at all — the silent blanking ticket 05 warned
            // about. Best-effort, like every other decoration: a failure
            // leaves the line to derive from `kids` (or to stay hidden).
            kidAgesForPlaydate(id).catch(() => null),
            // V3 slice 10 (ticket 05): the guest-list names (the 0025
            // get_guest_list RPC — the host/pinger gate lives in the
            // function; the count path getGoingCount above is
            // unchanged). Authenticated view only — the signed-out
            // public surface carries no names (the RPC is
            // EXECUTE-to-authenticated-only). Pre-0025-apply the 404
            // is caught: the block stays hidden, the post never
            // crashes (the DB-not-applied discipline).
            fetchGuestList(id).catch(() => null),
          ])
          if (cancelled) return
          setState({
            status: 'ready',
            detail,
            count,
            going,
            comments: commentsResult.rows,
            commentsFailed: commentsResult.failed,
            kids,
            kidAges,
            guestNames,
          })
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
      // V8 ticket 08: a ping was just saved — the second of the two MEANINGFUL
      // actions that may be followed by the notification opt-in. This records
      // the action only (the write publishes to subscribePushArmed, which the
      // shell's PushOptInPrompt listens to); it owns the decision, not this
      // page. Only on the way IN: taking a ping back is not "we're going".
      if (going) armPushPromptForAction('ping_saved')
      // V8 ticket 02: the count read is BEST-EFFORT here, deliberately. The
      // ping WRITE already landed — if only the follow-up read fails, this
      // used to throw and report "Could not update your ping" over a ping that
      // is in the database. Instead `count` stays at its last known value
      // (never clobbered to null) and the retry line below owns the unknown
      // state; the button itself is never disabled by a failed read.
      const count = await getGoingCount(detail.id).catch(() => null)
      // V3 slice 10 (ticket 05): the toggle changed the caller's
      // pinger status — refetch the guest list so the block appears
      // ("You, ...") when a viewer pings and disappears (back to the
      // count-only line) when they unping. The RPC 404s pre-0025-
      // apply: null keeps the block hidden (the DB-not-applied
      // discipline).
      const guestNames = await fetchGuestList(detail.id).catch(() => null)
      // Functional merge: touch ONLY count/going/guestNames (the thread
      // settled in the meantime survives), and only for the post this
      // toggle was issued against — a ping op in flight during a
      // comment op must never clobber the post-op comments array (or a
      // post we navigated away from).
      setState((prev) =>
        prev.status === 'ready' && prev.detail.id === detail.id
          ? { ...prev, going, guestNames, ...(count !== null ? { count } : {}) }
          : prev,
      )
    } catch (err) {
      setPingError(err instanceof Error ? err.message : 'Could not update your ping. Try again.')
    } finally {
      setPingBusy(false)
    }
  }

  /**
   * V8 ticket 02: retry the going-count read (the retry line under a ping
   * button whose count came back null). The button itself was never disabled
   * by that failure — this only removes the "we don't know" line once the read
   * lands. A failing retry changes nothing: the line stays, and there is
   * nothing new to say about a read that was already reported as failed.
   */
  async function handleRetryGoingCount() {
    if (state.status !== 'ready' || countRetryBusy) return
    const postId = state.detail.id
    setCountRetryBusy(true)
    try {
      const count = await getGoingCount(postId)
      setState((prev) =>
        prev.status === 'ready' && prev.detail.id === postId ? { ...prev, count } : prev,
      )
    } catch {
      /* Swallowed: the retry line already says the read failed. */
    } finally {
      setCountRetryBusy(false)
    }
  }

  /**
   * V8 ticket 02: retry the comment-thread read (the "Couldn't load comments."
   * state). On success the thread replaces the error block — the same section
   * a successful first load renders, composer and all. On failure the state
   * stays exactly where it was (still failed, still offering Retry).
   */
  async function handleRetryComments() {
    if (state.status !== 'ready' || commentsRetryBusy) return
    const postId = state.detail.id
    setCommentsRetryBusy(true)
    try {
      const comments = await listComments(postId)
      setState((prev) =>
        prev.status === 'ready' && prev.detail.id === postId
          ? { ...prev, comments, commentsFailed: false }
          : prev,
      )
    } catch {
      setState((prev) =>
        prev.status === 'ready' && prev.detail.id === postId
          ? { ...prev, comments: null, commentsFailed: true }
          : prev,
      )
    } finally {
      setCommentsRetryBusy(false)
    }
  }

  /**
   * V8 ticket 09 (migration 0033): "Same time next week".
   *
   * A one-off post: navigate to /new with the existing duplicate prefill —
   * the same router-state pattern the host panel's Duplicate button uses, so
   * /new needs no new key and the parent still picks the new date and time
   * (the pinned duplicate rule: the date/time is always re-entered).
   *
   * A series post: ONE TAP pings the next occurrence through the EXISTING
   * optimistic write path (db.togglePing — the same call the detail page's
   * going button and the feed cards make, arming the ticket-08 push prompt on
   * the way in), and the block then shows the confirmation line naming the
   * date it landed on, with a link to that post. The one guard is
   * `hasPinged` FIRST: togglePing is a toggle, so pinging blind could UN-ping
   * a meetup the parent already said yes to (raced from another tab).
   */
  async function handleSameTimeNextWeek() {
    if (state.status !== 'ready' || sameNextWeek === null || nextWeekBusy) return
    const detail = state.detail
    if (sameNextWeek.postId !== detail.id) return
    if (sameNextWeek.kind === 'one-off') {
      navigate('/new', { state: { duplicate: toDuplicatePrefill(detail) } })
      return
    }
    if (sameNextWeek.kind !== 'occurrence' || sameNextWeek.alreadyGoing) return
    // The host of this post is the host of the next occurrence too (an
    // occurrence inherits its series' host), and the app never lets a parent
    // ping their own post (db.togglePing's client guard + the 0010 trigger).
    // The host's branch renders a LINK to next week instead of this control,
    // so this is a belt-and-braces guard against a false "you're going".
    if (viewerIsHost) return
    const nextId = sameNextWeek.id
    setNextWeekBusy(true)
    setNextWeekError(null)
    try {
      const alreadyGoing = await hasPinged(nextId)
      const going = alreadyGoing ? true : await togglePing(nextId)
      // V8 ticket 08: the same meaningful action a card and the detail page's
      // ping record — the opt-in may follow a saved ping, never a taken-back
      // one.
      if (!alreadyGoing && going) armPushPromptForAction('ping_saved')
      setSameNextWeek((prev) =>
        prev !== null && prev.kind === 'occurrence' && prev.id === nextId
          ? { ...prev, alreadyGoing: true }
          : prev,
      )
    } catch (err) {
      setNextWeekError(
        err instanceof Error ? err.message : 'Could not add you to next week. Try again.',
      )
    } finally {
      setNextWeekBusy(false)
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
   * V8 ticket 06: "Stop repeating" — the host turns the SERIES off
   * (`active = false`; the RLS `playdate_series_update_host` policy is the
   * wall, and this button lives in the host-only panel).
   *
   * Deliberately NOT a delete, and it deletes nothing: every occurrence
   * already generated is another family's plan, so the weeks already posted
   * stay exactly as they are — the generator simply stops adding more. A
   * failed write surfaces the designed error line and changes no state.
   */
  async function handleStopRepeating() {
    if (series === null || seriesBusy) return
    const seriesId = series.id
    setSeriesBusy(true)
    setSeriesError(null)
    try {
      await setSeriesActive(seriesId, false)
      setSeriesState((prev) =>
        prev === null || prev.seriesId !== seriesId
          ? prev
          : { seriesId, row: prev.row === null ? null : { ...prev.row, active: false } },
      )
    } catch (err) {
      setSeriesError(
        err instanceof Error ? err.message : 'Could not stop the weekly repeat. Try again.',
      )
    } finally {
      setSeriesBusy(false)
    }
  }

  /**
   * V8 ticket 05: the host's Delete, after the in-page confirmation.
   *
   * The cleanup is the DATABASE's job: going_pings (0007), comments (0013),
   * playdate_kids (0022) and ping_kids (0026) all carry ON DELETE CASCADE
   * to this row, so this is one plain delete and nothing else — a
   * client-side hand-delete of the children would be a partial cascade the
   * DB's own rule already covers (and would fail RLS wherever a child row is
   * not the host's to remove).
   *
   * No RETURNING (the 42501 lesson): the write not erroring is the whole
   * signal, then the page navigates to /. The feed re-fetches on mount, so
   * the post is gone from it; the old detail URL re-reads, finds nothing,
   * and renders the existing not-found state. A failed delete keeps the
   * dialog open with an honest error line — the post is still there.
   */
  async function handleDeletePost() {
    if (state.status !== 'ready' || deleteBusy) return
    const postId = state.detail.id
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await deletePlaydate(postId)
      navigate('/', { replace: true })
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Could not delete this drop-in. Try again.',
      )
      setDeleteBusy(false)
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
   *
   * V8 ticket 10: a share that produced NOTHING is now visible. Dismissing the
   * sheet falls through to the copy fallback, and if that copy fails too the
   * page used to do exactly nothing — no chip, no message, no link. Now it
   * says "Couldn’t copy the link" and renders the URL in a selectable field
   * (the render below), so the parent can still send it.
   */
  async function handleShare() {
    if (state.status !== 'ready' && state.status !== 'public') return
    if (shareBusy) return
    const detail = state.detail
    const url = getShareUrl(detail.id)
    setShareBusy(true)
    setShareCopied(false)
    setShareError(false)
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
      } else {
        setShareError(true)
      }
    } finally {
      setShareBusy(false)
    }
  }

  /**
   * V8 ticket 10: the share fallback line — "Couldn’t copy the link" + the URL
   * in a readonly field the parent can select (one tap selects the whole URL,
   * so a failed automatic copy costs two taps, not a dead end). Rendered in
   * BOTH views, right under the Share button that failed.
   */
  function renderShareFallback(url: string) {
    if (!shareError) return null
    return (
      <div data-testid="share-copy-error" className="mt-2 w-full">
        <p className="text-sm text-red-600">Couldn’t copy the link.</p>
        <p className="mt-1 text-sm text-slate-600">Select it and copy it yourself:</p>
        <input
          readOnly
          data-testid="share-url-fallback"
          aria-label="Link to this drop-in"
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
          className="mt-1 w-full select-all rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        />
      </div>
    )
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
    setCommentAction(beginCommentAction)
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
      setCommentAction(endCommentAction)
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

  /**
   * V8 ticket 10: ARM the delete — the button opens the confirmation instead
   * of deleting. The tap used to fire the hard DELETE immediately, with no
   * question and no way back (and 0023 cascades every reply with the row).
   * The arm carries what the dialog has to name: whose comment it is and how
   * many replies go with it.
   */
  function handleDeleteCommentRequest(commentId: string, authorHandle: string, replyCount: number) {
    if (state.status !== 'ready' || commentBusy) return
    setCommentError(null)
    setCommentAction((prev) =>
      armCommentAction(prev, { kind: 'delete', commentId, authorHandle, replyCount }),
    )
  }

  /** Delete a comment (author or event host — confirmed first, then the pure planCommentAction gates it). */
  async function handleDeleteComment(commentId: string) {
    if (state.status !== 'ready' || commentBusy) return
    const detail = state.detail
    // The arm is consumed by the confirm itself (the dialog closes with the
    // tap) and the write takes the same shared in-flight guard.
    setCommentAction(beginCommentAction)
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
      setCommentAction(endCommentAction)
    }
  }

  /**
   * Hide a comment (moderator op — the soft-hide via hidden_at, the /mod
   * model). 0014: the widened SELECT policy (hidden_at is null OR
   * moderator) keeps hidden rows readable by moderators, so the row
   * stays in the thread in its muted hidden state (matching a re-fetch)
   * instead of being dropped; non-moderators never see it (RLS). One tap,
   * no confirm: it is reversible by the Unhide button on the same row.
   */
  async function handleHideComment(commentId: string) {
    if (state.status !== 'ready' || commentBusy) return
    const detail = state.detail
    setCommentAction(beginCommentAction)
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
      setCommentAction(endCommentAction)
    }
  }

  /**
   * Unhide a comment (V8 ticket 10) — the moderator's way back, and the one
   * button V2 shipped without (Hide rendered only when `!isHidden`, so a
   * mis-tapped hide was permanent from the UI).
   *
   * The write path is the SAME one Hide already used (moderation.
   * issueModeratorUpdate — now reachable for `comments`; db.unhideComment
   * passes hidden_at: null): the moderator UPDATE policy is any-column and
   * row-independent, which was verified LIVE before this button was written
   * (see moderation.ts's ModeratorTable note). No migration.
   *
   * The row is updated in place off the LATEST settled thread (the functional
   * merge hide uses): unhiding a reply-to target does not need to touch the
   * mode — the mode is already off — and the row simply becomes visible again.
   */
  async function handleUnhideComment(commentId: string) {
    if (state.status !== 'ready' || commentBusy) return
    const detail = state.detail
    setCommentAction(beginCommentAction)
    setCommentError(null)
    try {
      await unhideComment(commentId)
      setState((prev) =>
        prev.status === 'ready' && prev.detail.id === detail.id
          ? {
              ...prev,
              comments: (prev.comments ?? []).map((c) =>
                c.id === commentId ? { ...c, hidden_at: null } : c,
              ),
            }
          : prev,
      )
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Could not unhide that comment. Try again.')
    } finally {
      setCommentAction(endCommentAction)
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
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
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
        <p className="text-xs text-slate-500">
          If you just signed up, the server setup may not be complete yet.
        </p>
        <Link to="/" className="flex min-h-11 items-center text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'not-found') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">We couldn’t find this drop-in</h1>
        <p className="text-sm text-slate-600">It may have been removed, or the link is a typo.</p>
        <Link to="/" className="flex min-h-11 items-center text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'hidden') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">This drop-in has been removed</h1>
        <p className="text-sm text-slate-600">
          A moderator hid this post — it no longer shows up in feeds.
        </p>
        <Link to="/" className="flex min-h-11 items-center text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'blocked') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Hidden</h1>
        <p className="text-sm text-slate-600">
          You blocked @{state.handle} — their drop-ins are hidden from you.
        </p>
        <Link
          to={`/u/${encodeURIComponent(state.handle)}`}
          className="flex min-h-11 items-center text-sm text-indigo-600"
        >
          View @{state.handle} to unblock
        </Link>
      </div>
    )
  }

  const { detail, count, going, kids, kidAges, guestNames } = state
  // V8 ticket 09: ONE "now" for this render — the "Same time next week"
  // block's day/time label reads the same clock it was offered under, so the
  // block can never be labelled with a day it is not actually offering.
  const nowIso = new Date().toISOString()
  // Unreachable (the loading gate above renders Loading for a null session
  // with a 'ready' state — 'ready' only ever settles from a signed-in
  // load): an explicit guard so TS narrows session to non-null below.
  if (session === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
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
  // card. (V9 ticket 04: "the event STAYS in the feed" is V3/02's pin and it
  // still holds while the window is ahead; once the window has ENDED the post
  // leaves the FEED regardless of status — this page and the archive keep it.
  // See the ticket's Comments.) The rain badge is the pure rainBadgeLabel
  // threshold on the best-effort probability (null = silently absent).
  const postStatus: PlaydateStatus = detail.status ?? 'on'
  // V3 slice 3 (ticket 06, migration 0019) trimmed the chip to "Cancelled"
  // only; V12 t03 (migration 0041) re-added a third state: the host can
  // END the event early, and the chip renders "Ended" for it (distinct
  // from "Cancelled"). The Open-Meteo "Rain likely" badge is an
  // independent forecast, not a status state.
  const statusChip =
    postStatus === 'ended' ? 'Ended' : postStatus === 'cancelled' ? 'Cancelled' : null
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
  // load is null (0022 not applied / failed) or there is nothing to say —
  // "Kids coming:" with nothing after is not a state, like a 0 going
  // line). Names + ages only — NO photos (the kid-photo pin).
  //
  // V9 ticket 05 makes it AGES-FIRST ("Ages 3–6 · Bernie, Lily" — the range
  // the parent is actually deciding on, then the names) and feeds it the
  // AUTHORITATIVE range: the host's own statement (the /new chips, age_min /
  // age_max — absent pre-0037, which is simply "nothing stated") wins over the
  // range derived from these same kids' ages, exactly as it does on the feed
  // card (feed.playdateAgeRangeLine is the one precedence rule). No chips
  // stated → the derived range answers; no kids EITHER → the line is
  // "Ages 2–5" alone, which is the no-kids case the chips exist for.
  //
  // V9 ticket 10 (migration 0040): the derived range now comes from its OWN
  // read — db.kidAgesForPlaydate, the ages-only SECURITY DEFINER function —
  // because the names no longer cross to everyone. For the host and a pinger
  // nothing changes (same kids, same range); for a signed-in stranger `kids`
  // is now EMPTY (the gated RPC returns no rows), and this line is what they
  // get: the ages, and no name. That is the confirmed scope's accepted shape:
  // "where a name can no longer be shown, the honest replacement is the AGES
  // signal that already exists".
  const statedAgeRangeLabel = statedAgeRangeLine(detail.age_min, detail.age_max)
  const derivedAgeRangeLabel = kidAges !== null ? ageRangeLine(kidAges) : null
  const kidsRangeLabel = statedAgeRangeLabel ?? derivedAgeRangeLabel
  const kidsLine = kids !== null ? kidsComingLine(kids, kidsRangeLabel) : null
  // V3 slice 10 (ticket 05): the guest-list line — the pure feed
  // seams (resolveGuestListVisibility: the host/pinger gate +
  // count > 0; formatGuestLine: "Going: ..." for the host, "You,
  // ..." for a pinger — their own display_name dropped from the RPC
  // list, up to 2 others + "+ N more"). null = hidden: the RPC did
  // not land (guestNames null — pre-0025-apply 404 caught), the
  // count is null/0, or the viewer is a stranger (the count-only
  // surface stays exactly as shipped). The empty-string fallback
  // (the host view with an empty list) also hides — "Going:" with
  // nothing after is not a state.
  const guestLine =
    guestNames !== null &&
    count !== null &&
    resolveGuestListVisibility(isHost, going, count)
      ? formatGuestLine(guestNames, profile?.display_name ?? null, isHost) || null
      : null
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
    // V8 ticket 07: when the post names a DIRECTORY place, the place line links
    // to that place's page instead (the 13th public field, a bare id — no place
    // payload crosses to anon; the client reads the anon-readable `places` table
    // itself). Same tap-to-go affordance as the Maps link, one hop to the place's
    // address, notes, age line and — once signed in — the drop-ins there.
    const publicPlaceHref = d.place_id != null ? placePath(d.place_id) : null
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{d.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {publicPlaceHref !== null ? (
              <Link
                to={publicPlaceHref}
                className="font-medium text-indigo-600 hover:underline"
              >
                {d.place}
              </Link>
            ) : publicMapsHref !== null ? (
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
            )}
            {/* V9 ticket 01: `· <neighbourhood>` renders ONLY when the RPC
                returned one. 0035's LEFT JOIN means neighborhood_name is null
                for a post with no neighbourhood, and the signed-out view must
                tolerate it as a MISSING LABEL rather than an error: a dangling
                " · " (or the string "null") would be a visible bug on a post
                that is perfectly fine. The window is the line below. */}
            {d.neighborhood_name !== null && d.neighborhood_name !== ''
              ? ` · ${d.neighborhood_name}`
              : ''}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">
            {formatDay(d.starts_at)} · {formatTime(d.starts_at)}–{formatTime(d.ends_at)}
          </p>
          {d.age_hint !== null ? (
            <p className="mt-1 text-sm text-slate-600">Ages {d.age_hint}</p>
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Add to calendar
              </button>
            </div>
            {/* V8 ticket 10: a dismissed sheet + a failed copy is no longer
                silent — the URL is right there to select. */}
            {renderShareFallback(getShareUrl(d.id))}
          </div>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <button
            type="button"
            onClick={handleJoinIn}
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            I’m coming
          </button>
          <p className="mt-2 text-sm font-medium text-indigo-900">Sign up to join in</p>
          <p className="mt-1 text-sm text-indigo-700">{goingCountLine(d.going_count)}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Comments</h2>
          {/* V6 (design jury, copy item): this used to end with a second
              "Sign up to join in" — the same CTA as the card above, eight lines
              away, and internally redundant ("sign up" + "join in"). One CTA
              phrase per screen; this line just states the rule. */}
          <p className="mt-2 text-sm text-slate-600">Comments are for signed-in parents.</p>
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
   * REPLY's author or the host; the parent's author is out) — which now
   * ASKS FIRST (V8 ticket 10, the pure commentActions machine; `replyCount`
   * is what a top-level delete takes with it), Hide (moderators) and Unhide
   * (moderators, on a hidden row — V8 ticket 10: the way back that V2 never
   * shipped), and Reply — top-level rows only (the one-level pin, the plan's
   * canReply) and never on a hidden row (a reply under a hidden parent is
   * excluded from the thread — the 0023 header (b) rule, the mod's hide
   * covers the thread). 0014: hidden rows come back to moderators only (the
   * SELECT policy's moderator branch) — rendered muted + chipped;
   * non-moderators never receive them (RLS).
   */
  function renderCommentRow(
    comment: CommentWithAuthor,
    plan: CommentActionPlan,
    isReply: boolean,
    replyCount = 0,
  ) {
    const isHidden = !plan.canSee
    const showReply = plan.canReply && !isHidden
    const showHide = plan.canHide && !isHidden
    const showUnhide = plan.canHide && isHidden
    return (
      <div className={`flex gap-3${isHidden ? ' opacity-60' : ''}`}>
        <HostAvatar host={comment.author} size={isReply ? 'sm' : 'md'} expandable />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <Link
              to={`/u/${encodeURIComponent(comment.author.display_name)}`}
              className="font-medium text-indigo-600"
            >
              @{comment.author.display_name}
            </Link>
            {isHidden ? (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                Hidden by moderator
              </span>
            ) : (
              <span className="ml-2 text-xs text-slate-500">
                {formatTime(comment.created_at)}
              </span>
            )}
          </p>
          <p
            className={`mt-0.5 whitespace-pre-line text-sm ${isHidden ? 'text-slate-500' : 'text-slate-700'}`}
          >
            {comment.body}
          </p>
          {plan.canDelete || showHide || showUnhide || showReply ? (
            <div className="mt-1 flex gap-3">
              {plan.canDelete ? (
                <button
                  type="button"
                  disabled={commentBusy}
                  onClick={() =>
                    handleDeleteCommentRequest(
                      comment.id,
                      comment.author.display_name,
                      replyCount,
                    )
                  }
                  className="text-xs text-slate-500 transition-colors hover:text-red-600"
                >
                  Delete
                </button>
              ) : null}
              {showHide ? (
                <button
                  type="button"
                  disabled={commentBusy}
                  onClick={() => void handleHideComment(comment.id)}
                  className="text-xs text-slate-500 transition-colors hover:text-red-600"
                >
                  Hide
                </button>
              ) : null}
              {showUnhide ? (
                <button
                  type="button"
                  data-testid="unhide-comment"
                  disabled={commentBusy}
                  onClick={() => void handleUnhideComment(comment.id)}
                  className="text-xs text-slate-500 transition-colors hover:text-indigo-600"
                >
                  Unhide
                </button>
              ) : null}
              {showReply ? (
                <button
                  type="button"
                  disabled={commentBusy}
                  onClick={() => handleReplyTo(comment.id)}
                  className="text-xs text-slate-500 transition-colors hover:text-indigo-600"
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

  // V8 ticket 10: the armed comment delete (the pure machine's pending state) —
  // read once here so the dialog's copy and its target are the SAME value.
  const pendingCommentAction = commentAction.pending
  const pendingCommentCopy =
    pendingCommentAction === null ? null : commentActionDialogCopy(pendingCommentAction)

  return (
    <div className="flex flex-col gap-4">
      <div>
        {/* V3 slice 2 (ticket 02; V3 slice 3, migration 0019 trimmed it to
             "Cancelled" only; V12 t03, migration 0041 re-added a third
             state — "Ended", the host ended the event early): the
             muted-state chip —
            rendered for every viewer; the host's explicit state is
            information, not a removal. (V9 ticket 04: on the FEED that
            "not a removal" now holds only while the window is ahead — an
            ended cancelled post leaves `/` like any ended one, and this page
            is where it stays reachable. See the ticket's Comments.) */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">{detail.title}</h1>
          {statusChip !== null ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {statusChip}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {/* V8 ticket 07: a directory place links to its own page; a free-text
              place keeps the V3 slice 5 Maps link (the place page carries the
              Maps link for the posts that have a place_id). */}
          {detail.place_id != null ? (
            <Link
              to={placePath(detail.place_id)}
              className="font-medium text-indigo-600 hover:underline"
            >
              {detail.place}
            </Link>
          ) : placeMapsHref !== null ? (
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
          )}
          {/* V9 ticket 01: the neighbourhood label only when the post HAS one
              (the LEFT JOIN embed yields null, and every post created from this
              version on has none — the parent was never asked). `place · window`
              is the shape: the place on this line, the window in the card
              below, and no dangling separator in between. */}
          {detail.neighborhood !== null && detail.neighborhood !== undefined
            ? ` · ${detail.neighborhood.name}`
            : ''}
        </p>
      </div>

      <div
        className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm${
          statusMuted ? ' opacity-60' : ''
        }`}
      >
        <p className="text-sm text-slate-700">
          {formatDay(detail.starts_at)} · {formatTime(detail.starts_at)}–{formatTime(detail.ends_at)}
          {/* V8 ticket 06: ` · weekly` as TEXT after the time window when this
              post is an occurrence of a series (the pure weeklyMetaSuffix seam
              returns '' for a one-off). Not a badge — the badge slot is full,
              and the rain badge below keeps its place. Rendered for every
              viewer: it is a property of the post, not of the host panel. */}
          {weeklyMetaSuffix(detail.series_id)}
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
          {/* V6 (decision #3): the avatar and the name do different things.
              Tapping the PHOTO enlarges it — 'the first thing I'd do is
              tap their profile picture to see a bigger picture' — and the
              name is what goes to the profile. They used to be one link,
              which is why the tap did the thing nobody expected. */}
          <div className="flex items-center gap-2">
            <HostAvatar host={detail.host} expandable />
            <Link
              to={`/u/${encodeURIComponent(detail.host.display_name)}`}
              className="text-sm font-medium text-indigo-600"
            >
              Hosted by @{detail.host.display_name}
            </Link>
          </div>
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
              className="text-sm text-slate-500 transition-colors hover:text-slate-600"
            >
              Report
            </button>
          </div>
          {/* V8 ticket 10: the share fallback (same as the public view) — a
              dismissed sheet plus a failed copy says so and hands over the
              URL. */}
          {renderShareFallback(getShareUrl(detail.id))}
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
            <div className="flex flex-wrap items-center gap-2">
              {/* V8 ticket 05: Edit — the host's own post, fixed in place
                  (the shared /new field set at /playdate/:id/edit) instead of
                  cancel + repost, which used to lose everyone who had said
                  they were going. A post that has ALREADY STARTED is still
                  editable (late plans are the normal case): the form carries
                  the stored time as-is and invents no new rule about it. */}
              <Link
                to={`/playdate/${detail.id}/edit`}
                data-testid="edit-post"
                className="rounded-xl border border-indigo-300 bg-white px-3 py-3 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
              >
                Edit
              </Link>
              {/* V8 ticket 05: Delete — behind an in-page confirmation that
                  names the consequence (the going pings + the comments go
                  with it). The button only OPENS the dialog; the write lives
                  in handleDeletePost. */}
              <button
                type="button"
                data-testid="delete-post"
                onClick={() => {
                  setDeleteError(null)
                  setConfirmingDelete(true)
                }}
                className="rounded-xl border border-red-200 bg-white px-3 py-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate('/new', { state: { duplicate: toDuplicatePrefill(detail) } })
                }
                className="rounded-xl border border-indigo-300 bg-white px-3 py-3 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
              >
                Duplicate
              </button>
            </div>
          </div>
          {/* V8 ticket 02 REVIEW ROUND: the host's line carried the same lie
              the non-host branch was fixed for. A failed count read rendered
              the flat claim "No pings yet" — a FACT the page did not have, on
              the host's only retention signal, with no way to re-ask. It now
              says so, and the same retry re-reads it. */}
          {count !== null ? (
            <p className="mt-1 text-sm text-indigo-700">{hostGoingCountLine(count)}</p>
          ) : (
            <div
              data-testid="host-going-count-unavailable"
              className="mt-1 flex flex-wrap items-center gap-2"
            >
              <p className="text-sm text-indigo-700">Couldn’t load who’s going.</p>
              <button
                type="button"
                disabled={countRetryBusy}
                onClick={() => void handleRetryGoingCount()}
                className="flex min-h-11 items-center rounded-xl border border-indigo-300 bg-white px-3 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
              >
                {countRetryBusy ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}
          {/* V3 slice 2 (ticket 02; V3 slice 3, ticket 06 + migration
               0019 trimmed the options to On / Cancelled — the redundant
               third option was removed; V12 t03, migration 0041, added a
               genuinely different third option — "End this post now",
               which ends the event early so it leaves the feed
               immediately (honest history, option A)): the host's
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
                        ? 'rounded-xl bg-indigo-600 px-3 py-3 text-sm font-medium text-white disabled:opacity-50'
                        : 'rounded-xl border border-indigo-300 bg-white px-3 py-3 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50'
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

          {/* V8 ticket 06: the series line + "Stop repeating" — inside the
              host-only panel, so only the host sees (or can touch) the rule
              behind this post. Rendered for an occurrence only: a one-off has
              no series_id, and pre-0028-apply the column is absent from the
              row entirely (no line, no query, no crash). The line reads the
              rule back in words + the wall clock ("Weekly · every Saturday
              10 AM"); Stop repeating flips active and DELETES NOTHING — the
              weeks already posted stay as ordinary posts, because other
              families have said they are going to them. */}
          {seriesIdOnPost !== null ? (
            <div className="mt-3 border-t border-indigo-100 pt-3" data-testid="series-panel">
              {series !== null ? (
                <>
                  <p className="text-sm font-medium text-indigo-900" data-testid="series-line">
                    {seriesLineLabel(series.weekday, series.start_minutes)}
                  </p>
                  {series.active ? (
                    <button
                      type="button"
                      data-testid="stop-repeating"
                      disabled={seriesBusy}
                      onClick={() => void handleStopRepeating()}
                      className="mt-2 rounded-xl border border-indigo-300 bg-white px-3 py-3 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                    >
                      Stop repeating
                    </button>
                  ) : (
                    <p className="mt-1 text-sm text-indigo-700" data-testid="series-stopped">
                      Repeating stopped — the weeks already posted stay up.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-indigo-700">Couldn’t load the weekly details.</p>
              )}
              {seriesError !== null ? (
                <p className="mt-2 text-sm text-red-600">{seriesError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            aria-pressed={going}
            /* V8 ticket 02: a FAILED count read no longer disables this
               button. `count === null` meant "the going count did not load",
               and the button then sat there dead with no explanation — the one
               control the page exists for, disabled by an unrelated read, with
               "I'm going" as the only thing a visitor came to do. The write
               path never needed the count (togglePing upserts/deletes on its
               own), so the button stays enabled and the unknown count is
               reported honestly BELOW it, with a Retry. */
            disabled={pingBusy}
            onClick={() => void handlePingToggle()}
            autoFocus={confirmPing}
            /* V6 (design jury item 5): the primary action leads by FILL and
               WEIGHT, not by being taller. It was the same weight as its
               outlined siblings and 2px shorter than them (they carry a
               border), which is backwards: the most important control on the
               page should not be the smallest one. The verb also now matches
               the card's pill — "I'm going" / "Going" — instead of introducing
               a third word for the same intent. */
            className={`rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50${
              going ? ' bg-green-700' : ' bg-indigo-600'
            }${confirmPing ? ' ring-2 ring-indigo-400 ring-offset-2' : ''}`}
          >
            {pingBusy
              ? 'Updating…'
              : confirmPing
                ? 'Tap to confirm you’re coming'
                : going
                  ? '✓ Going'
                  : 'I’m going'}
          </button>
          {count !== null ? (
            <p className="mt-2 text-sm text-slate-600">{goingCountLine(count)}</p>
          ) : (
            /* V8 ticket 02: the honest line where the count would be — the
               read failed, so the page says so instead of showing nothing (the
               old silence next to a dead button was the whole complaint). */
            <div
              data-testid="going-count-unavailable"
              className="mt-2 flex flex-wrap items-center gap-2"
            >
              <p className="text-sm text-slate-600">Couldn’t load how many families are going.</p>
              <button
                type="button"
                disabled={countRetryBusy}
                onClick={() => void handleRetryGoingCount()}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {countRetryBusy ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}
          {pingError !== null ? <p className="mt-2 text-sm text-red-600">{pingError}</p> : null}
          {/* V6: only once you're actually going, and only if you have kids to
              bring — otherwise there is nothing to ask. */}
          {going && myKids.length > 0 && id !== undefined ? (
            <KidsComingPicker
              playdateId={id}
              kids={myKids}
              selected={myPingKids}
              onChange={setMyPingKids}
              onSaved={() => setKidsReloadToken((token) => token + 1)}
            />
          ) : null}
        </div>
      )}

      {/* V8 ticket 09 (migration 0033): "Same time next week" — the loop
          closer. Rendered ONLY on a post that ENDED within the last 7 days,
          and ONLY for its host and for the families who pinged it (the
          eligibility gate lives in the effect above; a stranger's page is
          unchanged). The block is deliberately BELOW the ping/host panel: the
          past meetup's own controls stay where they were, and this is the
          NEXT step, not a replacement. A cancelled post keeps the affordance
          — the rule here is time-based (the plan ended; here is the next one)
          and repeating the plan is a legitimate action either way; that is a
          decision, not an oversight. */}
      {state.status === 'ready' &&
      sameNextWeek !== null &&
      sameNextWeek.postId === state.detail.id ? (
        <div
          data-testid="same-time-next-week"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"
        >
          {sameNextWeek.kind === 'occurrence' ? (
            viewerIsHost ? (
              /* The HOST's own series post: next week is a post THEY host, so
                 there is nothing to ping (and claiming "you're going" would be
                 a lie). The honest, useful thing is the link. */
              <>
                <p
                  data-testid="same-time-next-week-next"
                  className="text-sm font-semibold text-emerald-900"
                >
                  Next week is already posted — {occurrenceWhenLabel(sameNextWeek.startsAt, nowIso)}.
                </p>
                <Link
                  to={`/playdate/${sameNextWeek.id}`}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-emerald-800"
                >
                  View next week’s drop-in ›
                </Link>
              </>
            ) : sameNextWeek.alreadyGoing ? (
              <>
                <p
                  data-testid="same-time-next-week-confirm"
                  className="text-sm font-semibold text-emerald-900"
                >
                  You’re going to {occurrenceWhenLabel(sameNextWeek.startsAt, nowIso)}.
                </p>
                <Link
                  to={`/playdate/${sameNextWeek.id}`}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-emerald-800"
                >
                  View next week’s drop-in ›
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-emerald-900">Same time next week?</p>
                <p className="mt-1 text-sm text-emerald-800">
                  This one repeats — {occurrenceWhenLabel(sameNextWeek.startsAt, nowIso)} is already
                  posted.
                </p>
                <button
                  type="button"
                  data-testid="same-time-next-week-action"
                  disabled={nextWeekBusy}
                  onClick={() => void handleSameTimeNextWeek()}
                  className="mt-2 rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {nextWeekBusy ? 'Adding you…' : 'Same time next week'}
                </button>
              </>
            )
          ) : sameNextWeek.kind === 'one-off' ? (
            <>
              <p className="text-sm font-semibold text-emerald-900">Same time next week?</p>
              <p className="mt-1 text-sm text-emerald-800">
                Post it again — the place and the details come with you, and you pick the new time.
              </p>
              <button
                type="button"
                data-testid="same-time-next-week-action"
                onClick={() => void handleSameTimeNextWeek()}
                className="mt-2 rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-white"
              >
                Same time next week
              </button>
            </>
          ) : (
            <>
              {/* No next occurrence — say so honestly, and offer the one
                  action that does work (post it again), never a dead control. */}
              <p
                data-testid="same-time-next-week-none"
                className="text-sm font-semibold text-emerald-900"
              >
                {sameNextWeek.reason === 'stopped'
                  ? 'Repeating has stopped — the weeks already posted stay up.'
                  : 'No more weeks are posted yet.'}
              </p>
              <button
                type="button"
                data-testid="same-time-next-week-action"
                onClick={() => void handleSameTimeNextWeek()}
                className="mt-2 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-medium text-emerald-800"
              >
                Post it again
              </button>
            </>
          )}
          {nextWeekError !== null ? (
            <p className="mt-2 text-sm text-red-600">{nextWeekError}</p>
          ) : null}
        </div>
      ) : null}

      {/* V3 slice 6 (ticket 09): the "Kids coming" line — the post's
          host-picked kids (the 0022 playdate_kids selection), below the
          ping section. Names + ages ONLY — no photos (the kid-photo pin,
          V9 ticket 11: a kid photo renders NOWHERE any more, and never did on
          this line). Hidden when the load is null (0022 not applied —
          the 42P01 is caught, the DB-not-applied discipline) or there is
          nothing to say (the 0-count "line" is not a state).
          V9 ticket 05: the line is AGES-FIRST, and it is also how a host who
          listed NO kids but stated a range is read back ("Kids coming: Ages
          2–5" — the range is the whole line then, which is why this block's
          own condition did not need a third branch).
          V9 ticket 10 (migration 0040): the NAMES are now gated by the
          database (get_playdate_kids — host / going / moderator), so a
          signed-in stranger's `kids` array is empty and their line is the
          derived AGES alone ("Kids coming: Ages 3–6") — the honest replacement
          the confirmed scope pins, never an initial, a count of kids or a
          blank. The block itself is unchanged: the ages line keeps it. */}
      {kidsLine !== null || kidsGoing.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {kidsLine !== null ? (
            <p className="text-sm text-slate-700">Kids coming: {kidsLine}</p>
          ) : null}
          {/* V6 (migration 0026): the kids the OTHER families are bringing.
              The RPC returns rows only to the host, to people who are going,
              and to moderators — a stranger sees neither this line nor any
              error, because the function simply returns nothing. Names + ages
              only, the same pin the host's own line has kept since ticket 09.
              V9 ticket 05: a kid whose own parent left the name blank reads
              "Age 6" here (feed.kidLabel) instead of an empty string. The GATE
              is untouched — "names last, and only for the host and people who
              pinged, as today" — and nothing about it was widened. */}
          {kidsGoing.length > 0 ? (
            <p className="mt-1 text-sm text-slate-700">
              Other kids coming:{' '}
              {kidsGoing
                .map((kid) => kidLabel(kid.firstName, kid.age))
                .filter((label) => label !== '')
                .join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* V3 slice 10 (ticket 05): the guest-list block — the named
          list of who pinged (progressive disclosure, the
          founder-approved spec): the host sees "Going: Sarah, Mia +
          2 families", a pinger sees "You, Sarah, Mia + 2 families",
          a stranger sees NOTHING here (their count line above is
          unchanged — the zero-pressure surface). Hidden when the
          count is 0/null or the 0025 RPC has not landed (pre-apply
          the 404 is caught — the block stays hidden, never a crash).
          Signed-out (public) view: never rendered — the RPC is
          EXECUTE-to-authenticated-only (the signed-in surface). */}
      {guestLine !== null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">{guestLine}</p>
        </div>
      ) : null}

      {/* V2 slice 4 (ticket 04): the comment thread — author avatar
        (the HostAvatar shape) + handle linking to /u/:handle. The
        per-row buttons come from the pure planCommentAction.
        V8 ticket 02: a FAILED thread read is its own honest state
        ("Couldn't load comments." + Retry) — it used to render as an
        absent section, which is indistinguishable from "no comments",
        so a parent asking a question about a post with replies could
        conclude nobody was talking. The post itself is never affected:
        a broken thread costs a section, never the drop-in.
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
            <p className="mt-2 text-sm text-slate-600">No comments yet — ask a question below.</p>
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
                    {/* V8 ticket 10: a top-level delete takes its one-level
                        replies with it (0023's parent_id self-FK cascades), so
                        the confirm names how many go. */}
                    {renderCommentRow(group.parent, parentPlan, false, group.children.length)}
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
                <p className="text-xs font-medium text-slate-600">
                  Replying to{' '}
                  <span className="font-semibold text-indigo-600">
                    @{replyToAuthor.author.display_name}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setReplyToId(null)}
                  className="text-xs text-slate-500 transition-colors hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <label htmlFor="comment-composer" className="text-xs font-medium text-slate-600">
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
              className="mt-1 w-full resize-none rounded-xl border border-slate-200 p-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {commentDraft.length}/{COMMENT_MAX_LENGTH}
              </span>
              <button
                type="button"
                disabled={commentBusy || commentDraft.trim().length === 0}
                onClick={() => void handleAddComment()}
                className="rounded-xl bg-indigo-600 px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {commentBusy ? 'Posting…' : 'Comment'}
              </button>
            </div>
            {commentError !== null ? (
              <p className="mt-2 text-sm text-red-600">{commentError}</p>
            ) : null}
          </div>
        </div>
      ) : state.commentsFailed ? (
        /* V8 ticket 02: the failed thread read — its own state, never an
           absent section (which reads as "no comments"). Retry re-reads; a
           failing retry keeps this block exactly as it is. */
        <div
          data-testid="comments-load-error"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-base font-semibold text-slate-900">Comments</h2>
          <p className="mt-2 text-sm text-slate-600">Couldn’t load comments.</p>
          <button
            type="button"
            disabled={commentsRetryBusy}
            onClick={() => void handleRetryComments()}
            className="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {commentsRetryBusy ? 'Retrying…' : 'Retry'}
          </button>
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

      {/* V8 ticket 10: the comment Delete confirmation (the pure
          commentActions machine armed it) — the copy names whose comment it is
          and how many replies go with it. One dialog for the whole thread: the
          armed row is what it acts on. */}
      {pendingCommentAction !== null && pendingCommentCopy !== null ? (
        <ConfirmDialog
          testId="comment-action-dialog"
          title={pendingCommentCopy.title}
          body={pendingCommentCopy.body}
          confirmLabel={pendingCommentCopy.confirmLabel}
          busyLabel="Deleting…"
          busy={commentBusy}
          onConfirm={() => void handleDeleteComment(pendingCommentAction.commentId)}
          onCancel={() => setCommentAction(cancelCommentAction)}
        />
      ) : null}

      {/* V8 ticket 05: the host's delete confirmation — the ReportDialog
          pattern (portal + role="dialog"), so the one destructive action in
          the app is deterministic for Playwright and can state the real
          consequence before the tap. Host-only by construction: the button
          that opens it lives in the host panel. */}
      {confirmingDelete && isHost ? (
        <DeletePlaydateDialog
          title={detail.title}
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => void handleDeletePost()}
          onCancel={() => {
            setConfirmingDelete(false)
            setDeleteError(null)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * The host's status control options (V3 slice 2, ticket 02; trimmed by
 * V3 slice 3, ticket 06 + migration 0019; a genuinely different third
 * state re-added by V12 t03, migration 0041): the playdates.status
 * values with their display labels. 'on' is the DB default (the "it's
 * on" state). 'cancelled' is the pre-event cancel; 'ended' — labelled
 * "End this post now" (the ticket's label) — ends an event early: it
 * leaves the feed immediately, stays in the owner's Past list labelled
 * "Ended" (option A, honest history), and is distinct from "Cancelled".
 * The Open-Meteo "Rain likely" badge is an independent forecast and is
 * unaffected.
 */
const HOST_STATUS_OPTIONS: ReadonlyArray<{ value: PlaydateStatus; label: string }> = [
  { value: 'on', label: 'On' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'ended', label: 'End this post now' },
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
    // V6: expandable here too — a signed-out visitor decides whether to
    // come partly on who is hosting, and this is the only photo they get.
    <PhotoButton src={avatarUrl} alt={`${name ?? 'the host'}’s photo`}>
      <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
    </PhotoButton>
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