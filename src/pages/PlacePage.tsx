import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { DropInCard } from '../components/DropInCard'
import { useSessionContext } from '../components/SessionProvider'
import { getPlaceById, listPlaceFeed, loadZipCodes } from '../lib/db'
import { formatDistanceLabel, mapsHref } from '../lib/feed'
import type { ZipCoords } from '../lib/feed'
import {
  placeAgeFitLabel,
  placeDistanceMiles,
  placeIndoorLabel,
  placeKindLabel,
  sortPlaceUpcoming,
} from '../lib/places'
import type { Place, PlacePrefill, PlaydateWithNeighborhood } from '../lib/types'

/**
 * /place/:id — one place in the directory (V8 ticket 07, migration 0029).
 *
 * What the page answers, in order: what is this place (name, kind, indoor or
 * outdoor), is it good for MY kid (the age line — and when the directory has no
 * age data, it says so rather than implying "all ages"), where is it (address +
 * the SAME tappable Google Maps link the detail page uses, the pure mapsHref
 * seam), what should I know (notes), and what is happening there. Then the one
 * action: "Start a drop-in here".
 *
 * UPCOMING DROP-INS ARE RADIUS-INDEPENDENT (the pinned decision): the parent
 * asked about THIS place, so the viewer's discovery radius must not filter its
 * own page — a place 30 miles away that you deliberately opened still has
 * drop-ins, and hiding them would make the page lie. Blocks still apply: the
 * one filter that is about people rather than distance. The ordering is the
 * pure sortPlaceUpcoming (soonest first).
 *
 * SIGNED OUT: the place's own public columns render (the 0029 anon SELECT —
 * the reason that grant exists), and the drop-in list does NOT. Not a tease:
 * profiles and neighborhoods carry no anon policy, so an anon drop-in read
 * returns nothing and the list would render "Nothing planned yet" — a claim
 * about the world that we cannot make. The sign-in prompt is the honest
 * version of the same wall the public detail page puts in front of comments.
 *
 * A missing place, and a failed read, are two DIFFERENT states: not-found is
 * permanent (that id is not in the directory), while a failure is the
 * documented DB-not-applied state (0029 not applied yet is exactly PGRST205
 * here) and says so.
 */
export function PlacePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, loading, profile } = useSessionContext()
  const [place, setPlace] = useState<Place | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // null = still loading; [] = signed-out (no read) or nothing upcoming.
  const [posts, setPosts] = useState<PlaydateWithNeighborhood[] | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)
  const [zipCoords, setZipCoords] = useState<ReadonlyMap<string, ZipCoords> | null>(null)

  useEffect(() => {
    if (id === undefined) return
    let cancelled = false
    setPlace(null)
    setMissing(false)
    setLoadError(null)
    getPlaceById(id)
      .then((row) => {
        if (cancelled) return
        if (row === null) setMissing(true)
        else setPlace(row)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Could not load this place.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // The gazetteer, for the "N mi from you" line. A failed load degrades to no
  // distance line at all — never to a guess (the pure seam returns null and the
  // render omits the line, the formatDistanceLabel discipline).
  useEffect(() => {
    let cancelled = false
    loadZipCodes()
      .then((coords) => {
        if (!cancelled) setZipCoords(coords)
      })
      .catch(() => {
        if (!cancelled) setZipCoords(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The drop-ins here. Signed-in only (see the page doc): a signed-out visitor
  // does not issue this read at all, so the page can never render a false
  // "Nothing planned yet".
  useEffect(() => {
    if (loading || session === null || id === undefined) return
    let cancelled = false
    setPosts(null)
    setPostsError(null)
    listPlaceFeed(id, session.user.id)
      .then((rows) => {
        if (!cancelled) setPosts(sortPlaceUpcoming(rows))
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPostsError(err instanceof Error ? err.message : 'Could not load drop-ins here.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [loading, session, id])

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Place</h1>
        <p className="text-sm text-red-600">{loadError}</p>
        <p className="text-xs text-slate-500">
          The places directory may not be set up on the server yet.
        </p>
        <Link to="/browse" className="text-sm font-medium text-indigo-600">
          Back to places
        </Link>
      </div>
    )
  }

  if (missing) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">We couldn’t find this place</h1>
        <p className="text-sm text-slate-600">
          It may have been removed from the directory.
        </p>
        <Link to="/browse" className="text-sm font-medium text-indigo-600">
          Back to places
        </Link>
      </div>
    )
  }

  if (place === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  const maps = mapsHref(place.name, place.address)
  const ageFit = placeAgeFitLabel(place)
  const distance =
    zipCoords === null
      ? null
      : placeDistanceMiles(place, { homeZip: profile?.home_zip ?? null }, zipCoords)

  /**
   * "Start a drop-in here" — the duplicate-prefill router-state pattern, with
   * the place as the payload: /new's route reads `state.place` and hands the
   * page a typed PlacePrefill (App.tsx NewRoute). It carries the place's id,
   * name, address and neighborhood, so the post lands with the place link and
   * the place's coordinates for distance — and the parent still picks the time,
   * exactly as the ticket pins.
   */
  function startHere() {
    const prefill: PlacePrefill = {
      placeId: place!.id,
      place: place!.name,
      address: place!.address,
      neighborhoodId: place!.neighborhood_id,
    }
    navigate('/new', { state: { place: prefill } })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link to="/browse" className="text-sm font-medium text-indigo-600">
          ← Places
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{place.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {placeKindLabel(place.kind)} · {placeIndoorLabel(place)}
          {distance !== null ? ` · ${formatDistanceLabel(distance)} from your zip` : ''}
        </p>
      </div>

      {place.photo_url !== null ? (
        <img
          src={place.photo_url}
          alt=""
          className="w-full rounded-xl border border-slate-200 object-cover"
        />
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-700">
          {maps !== null ? (
            <a
              href={maps}
              target="_blank"
              rel="noopener"
              className="font-medium text-indigo-600 hover:underline"
            >
              {place.address}
            </a>
          ) : (
            place.address
          )}
        </p>
        {/* The age line states the data we have and NOTHING more: the directory
            carries no age range for any seeded row (0029's header), so the
            honest line is that it is not listed — "all ages" would be a claim
            the data does not support, on the one question this page exists to
            answer. */}
        {ageFit !== null ? (
          <p className="mt-2 text-sm text-slate-600">{ageFit}</p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Ages not listed yet.</p>
        )}
        {place.notes !== null ? (
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{place.notes}</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
        <button
          type="button"
          data-testid="start-here"
          onClick={startHere}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Start a drop-in here
        </button>
        <p className="mt-2 text-xs text-indigo-700">
          Fills this place in on the post form — you pick the time.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Upcoming drop-ins here
        </h2>
        {session === null ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Drop-ins are for signed-in parents.</p>
            <Link to="/login" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-indigo-600">
              Sign in to see them
            </Link>
          </div>
        ) : postsError !== null ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-red-600">{postsError}</p>
          </div>
        ) : posts === null ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600 shadow-sm">
            Loading…
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">
              Nothing planned here yet — start the first one.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.map((post) => (
              <DropInCard key={post.id} playdate={post} nowIso={new Date().toISOString()} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
