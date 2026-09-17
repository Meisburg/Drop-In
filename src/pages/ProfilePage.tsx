import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { NAV_ICONS } from '../components/icons'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import { useFamilyPhotoUrl } from '../components/useFamilyPhotoUrl'
import { useKidPhotoUrls } from '../components/useKidPhotoUrls'
import { listKids, supabase } from '../lib/db'
import {
  kidLabel,
  partitionPostsByTime,
  playdateKidsKidIds,
  queryMyPlaydatesWithClient,
  toDuplicatePrefill,
} from '../lib/feed'
import type { Kid, Playdate } from '../lib/types'

/**
 * /profile — the READ-ONLY "what other families see" view (V11 ticket 06).
 *
 * Before this ticket the page was the family's editor AND its view in one
 * screen. Ticket 06 split them: every control (name, bio, photos, location,
 * kids, notifications, and the private Following/Neighborhoods lists) now
 * lives on /settings, reachable from the header gear and from the one
 * "Edit profile" button below. This page answers one question only — "what do
 * other parents see about me?" — and its AC is ZERO inputs or toggles on the
 * route.
 *
 * The read set, in the pinned block order (family photo → "About our family"
 * → the kids list, all optional, the page looks finished with none of them):
 *  - the avatar (display only — its editor is on /settings)
 *  - "A photo of your family" (the signed-URL image, or nothing; never a
 *    placeholder box, a "no photo yet" sentence, or an add button)
 *  - "About our family" (the display name — the public handle — and the bio,
 *    plain text; the display name renders as its own text node so a spec can
 *    match it exactly while the app-shell header shows the @-prefixed form)
 *  - kids by first name + age (the privacy pin, the kidLabel seam — no editing,
 *    no likes line; the rows are DISPLAY li's, not the /settings inputs). Each
 *    row MAY carry its photo (V12 t04): the owner-only, batched, best-effort
 *    signed-URL image from `useKidPhotoUrls`, rendered for a kid whose
 *    `avatar_url` is set and hidden on a failed fetch. This is the ONE place a
 *    kid photo shows — every other surface stays photo-free.
 *  - "Your posts" (the owner's drop-ins, the same Upcoming/Past split as
 *    /u/:handle; every row keeps its Duplicate action, which is not an edit of
 *    anything on this page — it navigates to /new)
 *
 * The family photo's signed URL comes from the same batched, best-effort hook
 * /settings uses (never persisted; null while in flight or when the mint
 * failed, and the card simply shows no image in that case). The kid photos'
 * URLs come from the same discipline via `useKidPhotoUrls` (V12 t04): absent
 * while in flight or when the mint failed, and the kid row simply shows no
 * image.
 */
export function ProfilePage() {
  const navigate = useNavigate()
  const { session, loading, profile } = useSessionContext()
  const userId = session?.user?.id ?? null

  const [kids, setKids] = useState<Kid[] | null>(null)
  const [kidsError, setKidsError] = useState<string | null>(null)
  // V12 t04: the kid ids whose photo <img> 404'd (minted but the object was
  // never uploaded, or was deleted). Keyed by kid id because each kid's
  // canonical path is stable, so a re-mint never resurrects a dead image.
  const [kidPhotoErrors, setKidPhotoErrors] = useState<Record<string, boolean>>({})
  const [myPosts, setMyPosts] = useState<Playdate[] | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)

  // The owner's own kids (V2 ticket 02). A failed load (0011 not applied yet)
  // renders a designed error, never a crash — same discipline as the rest of
  // the page.
  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setKids(null)
    setKidsError(null)
    listKids(userId)
      .then((rows) => {
        if (cancelled) return
        setKids(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setKidsError(err instanceof Error ? err.message : 'Could not load your kids.')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // The "Your posts" list (V2 slice 1): the owner's own drop-ins, newest
  // first. A failed load (e.g. the playdates table not applied yet) renders a
  // designed error, never a crash.
  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setMyPosts(null)
    setPostsError(null)
    queryMyPlaydatesWithClient(supabase, userId)
      .then((rows) => {
        if (cancelled) return
        setMyPosts(rows as unknown as Playdate[])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPostsError(err instanceof Error ? err.message : 'Could not load your posts.')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // The family photo's signed URL — called ABOVE the `loading` early return:
  // a hook after an early return is the V6 regression that blanked the detail
  // page.
  const familyPhotoUrl = useFamilyPhotoUrl(profile?.family_photo_url)
  // The owner's kid photos' signed URLs (V12 t04) — the ONE kid-photo render
  // site, owner-only, batched + best-effort. Called above the early return for
  // the same reason as the family-photo hook.
  const kidPhotoUrls = useKidPhotoUrls(userId, kids)

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  // The "Your posts" split — the same pure seam /u/:handle uses (upcoming
  // ascending, past descending). nowIso is read once per render.
  const nowIso = new Date().toISOString()
  const { upcoming: upcomingPosts, past: pastPosts } = partitionPostsByTime(
    myPosts ?? [],
    nowIso,
  )

  /**
   * One "Your posts" row (built once, rendered in BOTH sections): the title
   * (a link to the drop-in — the way this archive reaches V8/09's "Same time
   * next week"), when + place, and the Duplicate action, which stays on every
   * row, past posts included. V12 t03 (migration 0041): a host-early-ended
   * post (status 'ended') gets an "Ended" label on the when/place line — the
   * honest-history "ended", distinct from "Cancelled" (the label the detail
   * page + DropInCard chips render).
   *
   * `muted` is the archive's own signal (the DropInCard opacity-60): a Past
   * row is history, an Upcoming row is a plan. It mutes the row's TEXT only —
   * Duplicate stays at full strength because it works.
   */
  const renderPostRow = (post: Playdate, muted: boolean) => (
    <li
      key={post.id}
      className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5"
    >
      <div className={'min-w-0' + (muted ? ' opacity-60' : '')}>
        <Link
          to={`/playdate/${post.id}`}
          className="block truncate text-sm text-slate-800 underline-offset-2 hover:underline"
        >
          {post.title}
        </Link>
        <p className="text-xs text-slate-500">
          {formatPostWhen(post.starts_at)} · {post.place}
          {post.status === 'ended' ? ' · Ended' : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          navigate('/new', {
            state: { duplicate: toDuplicatePrefill(post, playdateKidsKidIds(post.playdate_kids)) },
          })
        }
        className="shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
      >
        Duplicate
      </button>
    </li>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionHeader
          icon={NAV_ICONS.profile}
          title="Your family"
          tagline="Your profile, kids, and posts"
        />
        <p className="mt-2 text-sm text-slate-600">
          This is what other families see about you. To change anything, go to your settings.
        </p>
        <Link
          to="/settings"
          className="mt-3 inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Edit profile
        </Link>
      </div>

      {/* The avatar — display only; its editor (the crop step) is on /settings. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Photo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Your photo shows on your posts and profile.
        </p>
        <div className="mt-3 flex items-center gap-3">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Your avatar"
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-500"
            >
              {((profile?.display_name ?? '?').charAt(0) || '?').toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* "A photo of your family" — display only (the signed URL, or nothing).
          The control lives on /settings; an unset (or un-minted) photo is
          simply a missing card, never a placeholder or a disabled control. */}
      {familyPhotoUrl !== null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">A photo of your family</h2>
          <p className="mt-1 text-sm text-slate-600">
            Optional. One photo of your family — it shows here, to signed-in families.
          </p>
          <img
            data-testid="family-photo"
            src={familyPhotoUrl}
            alt="Your family photo"
            className="mt-3 max-h-72 w-full rounded-xl object-cover"
          />
        </div>
      ) : null}

      {/* "About our family" — the display name (the public handle) and the bio,
          plain text. The display name renders as its OWN text node: the specs
          match it by exact text (the app-shell header shows the @-prefixed
          form, so the two never collide). */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">About our family</h2>
        <p className="mt-2 text-sm font-medium text-slate-800">{profile?.display_name}</p>
        <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
          {profile?.bio && profile.bio.trim() !== '' ? profile.bio : 'No bio yet.'}
        </p>
      </div>

{/* Kids — first name + age (the privacy pin), no editing. Each row MAY
           carry its photo (V12 t04): the owner-only signed URL from
           `useKidPhotoUrls`, hidden on a failed fetch. The row is the kidLabel
           seam (the same one /u/:handle renders, photo-free); the editor is on
           /settings. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Kids</h2>
        {kidsError !== null ? (
          <p className="mt-3 text-sm text-red-600">{kidsError}</p>
        ) : kids === null ? (
          <p className="mt-3 text-sm text-slate-600">Loading…</p>
        ) : kids.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No kids yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {kids.map((kid) => {
              const kidPhoto = kidPhotoUrls[kid.id]
              return (
                <li key={kid.id} data-testid="kid-row" className="flex flex-wrap items-center gap-2">
                  {kidPhoto !== undefined && !kidPhotoErrors[kid.id] ? (
                    <img
                      data-testid="kid-photo"
                      src={kidPhoto}
                      alt={kidLabel(kid.first_name, kid.age)}
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                      onError={() => setKidPhotoErrors((prev) => ({ ...prev, [kid.id]: true }))}
                    />
                  ) : null}
                  <p className="text-sm text-slate-800">{kidLabel(kid.first_name, kid.age)}</p>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Your posts</h2>
        <p className="mt-1 text-sm text-slate-600">
          Duplicate one to re-post it — place, kids, and duration come along (V12 t04);
          you only pick a new start time.
        </p>

        {postsError !== null ? (
          <p className="mt-3 text-sm text-red-600">{postsError}</p>
        ) : myPosts === null ? (
          <p className="mt-3 text-sm text-slate-600">Loading…</p>
        ) : myPosts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No posts yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {upcomingPosts.length === 0 ? (
              <p className="text-sm text-slate-600">
                Nothing coming up — past drop-ins below.
              </p>
            ) : (
              <section className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-slate-700">Upcoming</h3>
                <ul className="flex flex-col gap-1">
                  {upcomingPosts.map((post) => renderPostRow(post, false))}
                </ul>
              </section>
            )}
            {pastPosts.length > 0 ? (
              <section className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-slate-700">Past</h3>
                <ul className="flex flex-col gap-1">
                  {pastPosts.map((post) => renderPostRow(post, true))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

/** Local "Sep 12 · 3 PM" for an own-post row. */
function formatPostWhen(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric' })}`
}