import { useState } from 'react'
import { Link } from 'react-router'
import { PhotoButton } from './ImageLightbox'
import { WeatherChip } from './WeatherChip'
// V9 ticket 01 (review cycle 1, F3): `formatTimeWindow` used to live at the
// bottom of this file. It moved to feed.ts so e2e/post-location can assert the
// meta line against the SAME rule the card renders, instead of a copy of it.
import {
  buildGoingLine,
  cardWhenLabel,
  formatDistanceLabel,
  formatTimeWindow,
  GOING_CIRCLE_LIMIT,
  isEnded,
  isHappeningNow,
  mapsHref,
  type CardCountdown,
  type GoingPinger,
} from '../lib/feed'
import { weeklyMetaSuffix } from '../lib/series'
import type { DailyForecast } from '../lib/weather'
import type { PlaydateHost, PlaydateWithNeighborhood } from '../lib/types'

/**
 * One drop-in in the feed / browse lists (slice 3). Title, place,
 * neighborhood, a locale-formatted time window, and the host's public
 * handle; live drop-ins get a "Happening now" badge. Tapping navigates to
 * /playdate/:id. (V2 slice 1: the card's report flag is gone — reporting
 * lives on the detail page and the profile page, so the card stays clean at
 * 375px.)
 *
 * V2 slice 2: the host line gains a 40px round avatar (the host's
 * avatar_url, with an initial-fallback circle when there is none).
 *
 * V2 slice 3: the card's meta line gains the radius feed's "N mi"
 * distance label (integer miles, from the pure haversine predicate) when
 * the post came through the radius feed (distanceMiles set).
 *
 * V3 slice 1 (ticket 01): an ended post (feed.isEnded, ends_at <= now)
 * renders grayed with an "Ended" badge. V9 ticket 04 REMOVED the half of that
 * rule that lived on the FEED: the Today section used to demote ended events
 * behind the upcoming ones, and the feed now does not return an ended post at
 * all (its cutoff IS `ends_at > now` — feed.isStillAhead). The styling below
 * stays, because the archive lists (V8/04's Past sections on /profile and
 * /u/:handle, and the archive rows /profile renders) are exactly what those
 * branches serve, and this is what makes them read as history. A "Starts soon"
 * badge (amber) renders in the same badge slot as "Happening now" when the page
 * passes startsSoon (V27 slice 2: EVERY card inside the 60-minute window, not
 * just the soonest — the page decides who gets it, the card only renders it).
 * V27 slice 2 also adds the `countdown` line (below the when line): "starts in
 * N min" / "ends in N min", computed by the page.
 * V25 ticket 05 SUPERSEDES the old pin that "cards never carry a per-card day
 * label — the day section headers do": the card now carries its own day (see
 * the ticket-05 paragraph below).
 *
 * V3 slice 2 (ticket 02): a host-marked post (playdate.status
 * 'cancelled' — 0016, trimmed to 'on' | 'cancelled' by 0019) renders
 * muted like an ended post: the status chip takes the badge slot (the
 * host's explicit state wins over the time-based badges) + the
 * grayed-out card. Pre-0016-apply the row lacks the column (undefined →
 * the normal styling).
 *
 * V9 ticket 04 SUPERSEDES half of that V3/02 pin — recorded here, not assumed:
 * a cancelled post with a FUTURE end still stays in the feed ("the host can
 * revert; no auto-expiry" holds), but one whose window has ENDED now leaves `/`
 * exactly like any other ended drop-in: the cutoff is time-based and does not
 * ask WHY a row is over. So the reassurance that sentence carried (the host
 * flipping a cancellation back on from the feed) is no longer available there
 * for a cancelled post past its end — the detail page and the archive still
 * carry it, and V8/09's "Same time next week" is explicitly kept for a
 * cancelled post (PlaydateDetailPage's own pin: "the rule here is time-based").
 * NO SPEC COVERS the cancelled-and-ended case: e2e/host-status.e2e.ts posts for
 * TOMORROW and pins "the event stays in the feed" for a post that is still
 * ahead. See the V9 ticket 04 Comments.
 *
 * The optional "Rain likely" badge (the rainLabel prop, from the page's
 * best-effort Open-Meteo fetch) renders in the same slot, independent of the
 * status (a forecast, not a state) — only Today-section cards get it (the page
 * decides; BrowsePage passes nothing new).
 *
 * V3 slice 3 (ticket 06, the quick feedback batch): a 32px circular
 * "going" check toggle in the card's top-right (the badge cluster's last
 * item — appended, never shifting the content at 375px). Inactive:
 * white bg + slate border + gray check; active (this post is pinged by
 * the viewer): green-600 fill + white check. The click stops
 * propagation + prevents the default so the card's <Link> still
 * navigates when tapped elsewhere. Hidden (the pingToggle prop
 * omitted) on the host's own posts (the detail's host panel covers it)
 * and in the signed-out public view (DropInCard is not used there — the
 * sign-up prompt stands in); the feed page owns the optimistic write
 * path (toggle + revert on error, the detail page's behavior).
 *
 * V3 slice 4 (ticket 07): the card's age-hint line is REPLACED by the
 * going line (feedback #1 — "it'd be cool to see their little circles"):
 * up to 3 pinger avatar circles (24px, -12px overlap), then the "N going"
 * label — plus a "+N" chip riding the stack when the cap drops faces. The
 * circles LEAD and the count follows (V25 ticket 06 changed the order and the
 * overlap, and nothing else about this line). The circles are the pingers'
 * avatars (the feed
 * page's listPingsForPosts group, in the 0020 created_at order), with a
 * display-name initial on a slate-200 circle as the fallback; names
 * never surface as VISIBLE TEXT on cards (the guest list stays on the detail
 * page per ticket 05). frontend-design pass slice 2: the avatar's accessible
 * name carries the pinger's display name (`alt` on the photo, `aria-label`
 * on the initial fallback), because the circle is an identity avatar and
 * nothing adjacent to it names the person — the same public display name the
 * host already renders as `@handle` on cards, and the same treatment
 * WhileAwayCard gives its faces. No visible name text is added. count 0 → the line is hidden. The host's own posts keep
 * the line (the host sees who's coming — unlike the ping toggle, which
 * is hidden there).
 *
 * V8 ticket 06 (migration 0028): an occurrence of a weekly series carries
 * ` · weekly` as TEXT on this same meta line — deliberately NOT a new badge.
 * The badge slot is full (status / ended / happening-now / starts-soon /
 * rain), and "this repeats" is a property of the post, not a state it is in.
 * A one-off post renders exactly as it always did (`series_id` absent
 * pre-0028-apply → no marker).
 *
 * V8 ticket 09 (migration 0033): the card's going-line area gains ONE more
 * text line — `metBeforeLabel`, e.g. "2 families you've met before are
 * going" (the pure `follows.metBeforeLine`, computed by the page from the
 * viewer's own follows ∩ this post's pingers). It sits UNDER the going line
 * in the same bordered action row, it is TEXT (never a badge — the badge
 * slot stays full), and it is absent (`null`) whenever the count is 0, which
 * is every card for a viewer who follows nobody: the card is then
 * byte-identical to the one that shipped before this ticket. The page owns
 * the data; this component only renders the string it is handed.
 *
 * V25 ticket 05 (the founder's sequencing note + "this should be hyperlinked"):
 *
 * (a) THE ORDER IS NOW title → day · time → ages → place → meta → host → the
 *     going row. The day and the window used to be two different lines in two
 *     different places (the day was the SECTION HEADER's, the window sat in the
 *     quiet meta line); `feed.cardWhenLabel` now composes them into ONE line
 *     directly under the title — "Sat, Sep 26 · 6:30 PM–7:30 PM" — which is the
 *     compact form of the founder's own reference ("Sat, Sep 26 · 5:00 PM PDT").
 *     NO ZONE LABEL IS PRINTED — this card prints no zone and this diff invents
 *     none, so the screenshot's "PDT" cannot be honestly produced here. (The app
 *     is not zoneless everywhere: `series.resolveTimeZone` / `deviceTimeZone`
 *     exist for weekly-series scheduling, and `playdate_series` stores a zone.
 *     A one-off `playdates` row stores only `starts_at`/`ends_at`, and
 *     `formatTimeWindow` renders them device-local with no zone parameter — so
 *     there is nothing to label the card's time with that would mean the EVENT's
 *     zone rather than the viewer's. The ticket forbids inventing one.) The
 *     quiet meta line therefore keeps only the
 *     neighbourhood and the distance (the weekly marker moved up to the when
 *     line), and it renders NOTHING when both are absent — the old form ended
 *     each fact with " · " precisely because the window was always there to
 *     follow it.
 *
 * (b) THE ADDRESS IS A REAL GOOGLE MAPS LINK — and it cannot live inside the
 *     card's own anchor. The card body is still ONE <Link> (the whole-card tap
 *     target every spec and every habit depends on), so the address row is a
 *     SIBLING of that <Link> inside a wrapper that carries the card's border,
 *     radius and width. An <a> inside an <a> is invalid HTML and browsers hoist
 *     it out of the card; siblings are valid, keep the Maps link keyboard-
 *     reachable and screen-reader-announced, and leave every existing
 *     descendant-based spec (the toggle, the avatar, the circles) untouched.
 *     The href is `feed.mapsHref` — the same seam the detail page uses — and a
 *     post with no address renders no row at all (the mapsHref null contract;
 *     the place line stays plain text).
 *
 * V25 ticket 06 (the attendee line): the going row's CIRCLES now LEAD and the
 * count follows them ("◍◍◍ 3 going · 1 kid", never the old order), and the
 * circles overlap by HALF the face (12px on the 24px avatar, `-ml-3`) instead
 * of a third (the old `-ml-2`). The founder read the old row as confusing —
 * the numbers named the faces before the faces appeared. The cap
 * (`feed.GOING_CIRCLE_LIMIT`) and the label string (`feed.goingCountsLabel`)
 * are UNCHANGED and are still the pure seam's; this ticket is ordering and
 * stagger only. The count text is deliberately NOT rewritten to the reference
 * app's single "61 attendees" number — the V6 decision comment at
 * `feed.ts` stands (parents are how the app is used, kids are why it exists),
 * and the copy question is raised with the founder rather than decided here.
 */
export function DropInCard({
  playdate,
  nowIso,
  startsSoon = false,
  countdown = null,
  rainLabel = null,
  rainForecast = null,
  pingToggle,
  goingPings = [],
  kidsGoingCount = 0,
  metBeforeLabel = null,
  ageRangeLabel = null,
  eagerAvatar = false,
}: {
  playdate: PlaydateWithNeighborhood
  nowIso: string
  /** V3 slice 1: the feed's Today-section "Starts soon" badge (see above). */
  startsSoon?: boolean
  /**
   * V27 slice 2: the page-computed countdown (feed.feedCardCountdown) for a
   * post that is either within the hour of starting or happening now. null
   * (the ordinary case: further out, or already ended) renders no line.
   */
  countdown?: CardCountdown | null
  /** V3 slice 2: the Today-section "Rain likely" badge (see above). */
  rainLabel?: string | null
  /**
   * V24 slice 04: the same request's full daily forecast — what the tappable
   * weather chip's panel shows (temperature / rain / wind / the window). null
   * (or a forecast with no usable fact) leaves the chip the non-interactive
   * badge it was. The PAGE owns the fetch; this component only renders it.
   */
  rainForecast?: DailyForecast | null
  /**
   * V3 slice 3 (ticket 06): the card's "going" check toggle (see above).
   * Omitted = no toggle (BrowsePage; the host's own posts; the signed-out
   * public view never renders a DropInCard at all).
   */
  pingToggle?: DropInCardPingToggle
  /**
   * V3 slice 4 (ticket 07): this post's pingers (the feed page's
   * listPingsForPosts group, in ping order). Rendered as the card's
   * going line (buildGoingLine: up to 3 circles + a "+N" chip, then the
   * "N going" label), replacing the old age-hint line. Empty (BrowsePage; no
   * pings) = no line.
   */
  goingPings?: ReadonlyArray<GoingPinger>
  /**
   * V6 (migration 0027): how many kids are coming, for the card's line. A bare
   * COUNT — decision #2 keeps names and ages off the card entirely (they reach
   * only the host and the people going, through the 0026 gated RPC).
   */
  kidsGoingCount?: number
  /**
   * V8 ticket 09 (migration 0033): the met-before line — "2 families you've
   * met before are going" (the pure follows.metBeforeLine, computed by the
   * page). null/'' = the line is hidden (the count is 0, or the viewer
   * follows nobody, or the follows read has not landed — the pre-0033-apply
   * state). Rendered as TEXT under the going line, never as a badge.
   */
  metBeforeLabel?: string | null
  /**
   * V9 ticket 05: the drop-in's AGE RANGE, as the FIRST line of the card's
   * meta — `ages 3–6`, `age 4`, `all ages`, or null (nothing to say, and then
   * no line and no stray separator at all).
   *
   * The PAGE computes it (feed.cardAgeRangeLabel — the precedence seam over the
   * row's own stated columns and the batched derived ages; the card owns NO
   * fetching, the same rule the going line and the met-before line follow) and
   * hands over one string.
   *
   * WIRED BY every surface that renders this card — FeedPage, PlacePage and
   * UserPage each run ONE batched ages read for their own posts (review cycle 1,
   * F5: the AC's sentence is about the card, not only the feed). An omitted prop
   * still means "no line", which is the signed-out / failed-read state.
   *
   * It is the headline signal on purpose: "the age of the kid should be the
   * most important cuz the kids people want to know what age they're playing
   * with". It sits ABOVE the place line, which is where the meta block starts.
   * Names are never part of it — the whole string is a range.
   */
  ageRangeLabel?: string | null
  /**
   * Slice 11: keep the card's host avatar eager (no `loading="lazy"`). Only the
   * first feed card sets this; every other list/row card lazy-loads its avatar.
   */
  eagerAvatar?: boolean
}) {
  const live = isHappeningNow(playdate, nowIso)
  const ended = isEnded(playdate, nowIso)
  // V3 slice 2 (ticket 02; trimmed by V3 slice 3, ticket 06 + migration
  // 0019; 'ended' added by V12 t03, migration 0041): the host's status chip
  // (null = 'on' / the column is absent pre-0016-apply → the normal,
  // non-muted styling). The chip renders "Ended" (the host ended it early)
  // or "Cancelled"; the "Rain likely" badge is an independent forecast.
  const statusChip =
    playdate.status === 'ended'
      ? 'Ended'
      : playdate.status === 'cancelled'
        ? 'Cancelled'
        : null
  const muted = ended || statusChip !== null
  // The radius feed's per-post distance (V2 slice 3, the "N mi" label,
  // integer miles — the pure haversine predicate in feed.ts). Undefined
  // outside the radius feed (e.g. the detail page) → no label.
  const distanceLabel =
    playdate.distanceMiles !== undefined && playdate.distanceMiles !== null
      ? formatDistanceLabel(playdate.distanceMiles)
      : null
  // V3 slice 4 (ticket 07): the card's going line (null = hidden — no
  // pings yet). The page owns the data (the listPingsForPosts group); the
  // card applies the pure buildGoingLine with the 3-circle cap. V25 ticket
  // 06 changes only how this line is LAID OUT (circles first, half-stagger):
  // the cap and the label are still that seam's.
  const goingLine = buildGoingLine(
    goingPings.length,
    goingPings,
    GOING_CIRCLE_LIMIT,
    kidsGoingCount,
  )
  const cardClasses = [
    // V22 slice 9: the feed's list column widens to max-w-3xl (768px) at md+,
    // but a single-card column reads best at the phone measure — so cards cap
    // at max-w-md (448px) there. Below md the shell is already 448px, so this
    // class changes nothing on a phone.
    // V25 ticket 05: the padding moved to the body <Link> below, because the
    // box now holds TWO siblings — that link and the address's Maps row.
    // (The body's own indentation is deliberately left at its old depth: the
    // structural change is then the only thing the diff shows — code-structure
    // .md's 5-minute read test.)
    'rounded-xl border border-slate-200 bg-white transition-colors motion-reduce:transition-none hover:border-indigo-300 md:max-w-md',
    muted ? 'opacity-60' : '',
  ]
    .filter((c) => c !== '')
    .join(' ')
  // V9 ticket 01: the post's neighbourhood label, or null when it has none
  // (the ordinary case now — every seeded place carries none, and /new stopped
  // asking). One derived value, so the meta line has exactly one rule.
  const neighborhoodLabel = playdate.neighborhood?.name ?? null
  // V25 ticket 05: the quiet line's facts, with the EMPTY ones dropped so the
  // join can never print a dangling " · " (the old form was safe from that only
  // because the window was always there to follow the neighbourhood) and the
  // line disappears entirely when both are absent.
  const metaParts = [neighborhoodLabel, distanceLabel].filter(
    (part): part is string => part !== null && part !== '',
  )
  // V25 ticket 05: the Maps row's href, or null when the post has no address —
  // the SAME pure seam the detail page links with (feed.mapsHref).
  const maps = mapsHref(playdate.place, playdate.address)
  return (
    <div data-testid="dropin-card" className={cardClasses}>
      {/* The card body: still ONE anchor, so the whole-card tap target, the
          going toggle and the avatar behave exactly as they always have. The
          address's Maps link is its SIBLING below (see the file header, (b)) —
          never a child of this one. V25 ticket 05 also added the card box's
          `data-testid="dropin-card"`: the specs need to address the CARD, not
          the anchor, now that the box holds two of them. */}
      <Link to={`/playdate/${playdate.id}`} className="block p-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{playdate.title}</h3>
          {/* The badge slot: the host's status chip first (the explicit
              state wins — a cancelled post does not also say
              "Happening now"), then the time-based badges, then the
              independent "Rain likely" forecast badge, then the
              "going" check toggle (V3 slice 3, ticket 06 — the
              card's top-right circle; appended last so it never shifts
              the badges or the content at 375px). */}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {statusChip !== null ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {statusChip}
              </span>
            ) : ended ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Ended
              </span>
            ) : live ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Happening now
              </span>
            ) : startsSoon ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Starts soon
              </span>
            ) : null}
            {rainLabel !== null && rainLabel !== '' ? (
              /* V24 slice 04: the badge became the tappable weather chip (the
                 forecast panel the ticket asks for). With no forecast it
                 renders the same non-interactive badge as before — see
                 WeatherChip. */
              <WeatherChip
                label={rainLabel}
                forecast={rainForecast ?? null}
                whenLabel={formatTimeWindow(playdate.starts_at, playdate.ends_at)}
              />
            ) : null}

          </div>
        </div>
        {/* V25 ticket 05: the WHEN line — the day, then the window, directly
            under the title ("Sat, Sep 26 · 6:30 PM–7:30 PM"). Both halves come
            from the pure `feed.cardWhenLabel` seam (the day from the app's
            always-the-date wording, the window from the ONE `formatTimeWindow`
            rule). NO ZONE is printed: this line prints none and this diff
            invents none, so the founder's reference's "PDT" is not produced
            (see the file header, (a) — the app's only zones are the series
            scheduling seam's, and a one-off post stores none).
            `data-testid` is the stable handle the specs read, because the line
            moved and a positional `p` index silently tests the wrong element
            (see e2e/post-fast, e2e/post-location).

            The weekly marker rides THIS line (V8 ticket 06's text suffix, V25
            ticket 05 moved it): the when line is never empty, so the suffix can
            never dangle, and "this repeats" is a property of WHEN the drop-in
            happens. */}
        <p data-testid="card-when" className="text-sm font-medium text-slate-900">
          {cardWhenLabel(playdate.starts_at, playdate.ends_at)}
          {weeklyMetaSuffix(playdate.series_id)}
        </p>
        {/* V27 slice 2: the countdown rides its OWN line, directly under the
            when line, so the pinned `card-when` format ("Sat, Sep 26 ·
            6:30 PM–7:30 PM") is untouched — specs assert that string exactly.
            The page computes it (feed.feedCardCountdown); the card only
            renders the tone colour + label it is handed. */}
        {countdown !== null ? (
          <p
            data-testid="card-countdown"
            className={
              countdown.tone === 'starting'
                ? 'text-xs font-medium text-amber-700'
                : 'text-xs font-medium text-emerald-700'
            }
          >
            {countdown.label}
          </p>
        ) : null}
        {/* V9 ticket 05: the AGE RANGE — the card's meta starts here. It is
            the question another parent asks first ("is this the right age
            crowd?"), so it leads the block, above the place. Absent (null)
            means there is nothing to say — no kids picked and nothing stated —
            and then NOTHING renders: no empty line, no stray separator.
            `data-testid` is the stable handle the e2e reads (and asserts the
            ABSENCE of, which is the other half of the rule). */}
        {ageRangeLabel !== null && ageRangeLabel !== '' ? (
          <p data-testid="card-age-range" className="text-sm font-medium text-slate-700">
            {ageRangeLabel}
          </p>
        ) : null}
        <p data-testid="card-place" className="text-sm text-slate-700">
          {playdate.place}
        </p>
        {/* V9 ticket 01, narrowed by V25 ticket 05: the QUIET line — the
            neighbourhood and the distance, each dropping out when the post has
            none, joined by ` · ` with nothing to dangle (the WINDOW used to
            live here and is the card's own when-line now; the weekly marker
            moved up to that line). Both absent → `metaParts` is empty → NO
            paragraph renders: never an empty line and never the word "null"
            (the post is normal, the parent just was not asked). The perishable
            fact the founder asked to lead (when) is the loud line above; these
            stay quiet. */}
        {metaParts.length > 0 ? (
          <p data-testid="card-meta" className="text-sm text-slate-600">
            {metaParts.join(' · ')}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <HostAvatar host={playdate.host} eager={eagerAvatar} />
          <p className="text-sm text-slate-500">@{playdate.host.display_name}</p>
        </div>
        {/* V6 (first phone feedback): the going toggle used to be a bare
            circle in the badge cluster, and it read as a status badge rather
            than a button — 'it's not clear that's indicating that you're
            going'. It is now a LABELLED pill in the card's action row, so it
            says what it does; and the same row carries a 'More info' chevron
            so the card's tappability is advertised instead of assumed. */}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-slate-100 pt-2">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5">
              {goingLine !== null ? (
                <>
                  {/* V25 ticket 06: the CIRCLES lead and the count follows —
                      "◍◍◍ 3 going · 1 kid", never the old "3 going · 1 kid ◍◍◍".
                      The label named the numbers before the faces it was
                      counting, which is what the founder read as confusing.
                      These siblings render in DOM order, so the stack is simply
                      FIRST here; the cap (GOING_CIRCLE_LIMIT) and the label
                      string are still the pure buildGoingLine's. */}
                  <div className="flex items-center">
                    {goingLine.circles.map((circle, index) => {
                      // frontend-design pass slice 2: the circle is an identity
                      // avatar and nothing adjacent to it names the pinger, so
                      // the name rides the avatar for assistive tech. `circles`
                      // is `goingPings.slice(0, limit)` (buildGoingLine), so the
                      // index aligns with the raw pingers passed in.
                      //
                      // V25 ticket 06: the overlap is HALF the 24px face
                      // (`-ml-3` = 12px), not the old third (`-ml-2` = 8px), and
                      // it applies from the SECOND circle on — so the first face
                      // stays whole and the stack reads as a stack.
                      const pingerName = goingPings[index]?.displayName ?? ''
                      return circle.avatarUrl !== null && circle.avatarUrl !== '' ? (
                        <img
                          key={index}
                          src={circle.avatarUrl}
                          alt={pingerName}
                          loading="lazy"
                          decoding="async"
                          className={`h-6 w-6 rounded-full border-2 border-white object-cover${index > 0 ? ' -ml-3' : ''}`}
                        />
                      ) : (
                        <span
                          key={index}
                          role={pingerName === '' ? undefined : 'img'}
                          aria-label={pingerName === '' ? undefined : pingerName}
                          aria-hidden={pingerName === '' ? true : undefined}
                          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-semibold text-slate-600${index > 0 ? ' -ml-3' : ''}`}
                        >
                          {circle.initial}
                        </span>
                      )
                    })}
                  </div>
                  {/* The "+N" chip stays welded to the circle stack it counts
                      the missing faces of (it is not a count of the post); the
                      "N going · M kids" count is the row's LAST item. */}
                  {goingLine.overflow > 0 ? (
                    <span className="text-xs font-medium text-slate-600">+{goingLine.overflow}</span>
                  ) : null}
                  <span className="text-xs text-slate-600">{goingLine.label}</span>
                </>
              ) : (
                <span className="text-xs text-slate-600">
                  {pingToggle?.enabled ? 'No one’s said they’re going yet' : 'No one’s going yet'}
                </span>
              )}
            </div>
            {/* V8 ticket 09: the met-before line — one more TEXT line in this
                same going-line area (no new badge). Hidden at 0, and hidden
                for a viewer who follows nobody. */}
            {metBeforeLabel !== null && metBeforeLabel !== '' ? (
              <p
                data-testid="met-before-line"
                className="text-xs font-medium text-indigo-700"
              >
                {metBeforeLabel}
              </p>
            ) : null}
          </div>
          {pingToggle?.enabled ? (
            <button
              type="button"
              aria-pressed={pingToggle.active}
              aria-label={
                pingToggle.active
                  ? `Going — tap to take it back`
                  : `Say we’re going to ${playdate.title}`
              }
              disabled={pingToggle.busy}
              onClick={(event) => {
                // The card is a <Link>: the toggle must NOT navigate —
                // prevent the default (the href) and stop the click from
                // reaching the card (the link still navigates when the card
                // itself is tapped).
                event.preventDefault()
                event.stopPropagation()
                if (!pingToggle.busy) pingToggle.onToggle()
              }}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors motion-reduce:transition-none disabled:opacity-60 ${
                pingToggle.active
                  ? 'border-green-700 bg-green-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <svg
                viewBox="0 0 16 16"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {pingToggle.active ? 'Going' : 'I’m going'}
            </button>
          ) : null}
        </div>
        {/* The card BODY is a link, so this is a label, not a nested control
            (an <a> inside an <a> is invalid HTML) — it advertises where a tap
            already goes. The address row below IS a real link, which is exactly
            why it is OUTSIDE this anchor rather than inside it. */}
        <div className="flex items-center justify-end gap-1 text-sm font-medium text-indigo-600">
          More info
          <span aria-hidden="true">›</span>
        </div>
      </div>
      </Link>
      {/* V25 ticket 05: the address, as a real Google Maps link — `feed.mapsHref`
          (the same builder the detail page uses), opening in a new tab with
          `rel="noopener"`. A post with NO address renders no row at all (the
          mapsHref null contract) and the place line above stays plain text.
          The row is a SIBLING of the body <Link>, inside the border that makes
          it read as part of the card, because an <a> inside an <a> is invalid
          HTML and the browser hoists it out of the card.
          `min-h-11` is the 44px tap target the house requires; the accessible
          name says where the tap goes (the visible address first, then the
          destination — WCAG 2.5.3's label-in-name).
          `rounded-b-xl` matches the box's own radius (V25 t05 fix round 1): the
          box paints its border/radius but does NOT clip (`overflow-hidden` would
          also clip focus rings), so without it this row's hover fill squared off
          the box's bottom two corners. */}
      {maps !== null ? (
        <a
          data-testid="card-maps-link"
          href={maps}
          target="_blank"
          rel="noopener"
          aria-label={`${playdate.address ?? ''} — open in Google Maps`}
          className="flex min-h-11 items-center gap-1.5 rounded-b-xl border-t border-slate-100 px-4 py-2 text-sm font-medium text-indigo-600 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path
              d="M8 1.75c-2.35 0-4.25 1.9-4.25 4.25C3.75 9.2 8 14.25 8 14.25s4.25-5.05 4.25-8.25C12.25 3.65 10.35 1.75 8 1.75Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="6" r="1.5" />
          </svg>
          <span className="min-w-0">{playdate.address}</span>
          <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </div>
  )
}

/**
 * The card's "going" check toggle (V3 slice 3, ticket 06): the feed page
 * owns the write path (the optimistic toggle + revert on error, the
 * detail page's behavior) and hands each card its slice of the state.
 * The card only renders — it never issues the query itself.
 */
export interface DropInCardPingToggle {
  /** Render + enable (the caller confirmed a signed-in, non-host viewer). */
  enabled: boolean
  /** The viewer has pinged this post (the green-700 filled state). */
  active: boolean
  /** The write path is in flight (the circle is disabled while pending). */
  busy: boolean
  /** Issue the toggle (the feed's optimistic write path). */
  onToggle: () => void
}

/**
 * A 40px round host avatar (V2 ticket 02): the host's avatar_url when set,
 * otherwise a deterministic initial-fallback circle (the same shape the
 * comment list will reuse — "comments-ready" per the ticket AC).
 *
 * V3 slice 7 (ticket 10): `size` — 'md' (the default, 40px: every
 * existing call site — the card's host line, the detail page's host line,
 * and top-level comment rows) or 'sm' (24px — the indented one-level reply
 * rows under the detail page's comment thread).
 *
 * V16 t05: `'lg'` (80px) — the IDENTITY surface only (`/u/:handle`'s handle
 * header, alongside the `text-lg` @name). It exists so the profile page can
 * size its avatar to its heading WITHOUT moving the default: the drop-in
 * cards, the detail page's host line and the comment rows all keep their
 * 40px circle, because they were never the founder's complaint and their
 * density is deliberate.
 *
 * V24 slice 04: a stored `avatar_url` whose object is GONE (a re-upload, a
 * deleted bucket object) used to paint a broken-image glyph on every surface
 * that renders this primitive. The image's own `onError` now flips HostAvatar
 * to the initial circle it already draws for a missing URL — so "no photo" and
 * "dead photo" render identically, and the inbox's row faces inherit the fix
 * rather than carrying a second avatar implementation.
 *
 * The state is the FAILED URL, not a boolean: a boolean would stay true after
 * the next, working URL arrived (re-uploading over a dead avatar on the user's
 * own surface would keep painting the initial circle until a remount). A URL
 * that is not the one that failed renders normally, so the recovery is instant.
 *
 * The URL key is sufficient for the "re-upload keeps the same avatar_url"
 * worry: the object path is fixed per user (`<uid>/avatar`), but
 * `uploadAvatarObject` returns `${publicUrl}?v=${Date.now()}` (db.ts), so
 * replacing the photo ALWAYS produces a new `avatar_url` string and this
 * component renders it immediately. The one value the latch can suppress is the
 * SAME url — the same object version — which is the initial circle a remount
 * would draw too, because there is no newer image to fetch. The alternatives
 * were considered and rejected: a boolean regresses the re-upload recovery
 * above; a bounded retry needs a cache-busting `src`, which belongs to the
 * upload/write path, not to this presentational primitive.
 */
export function HostAvatar({
  host,
  size = 'md',
  expandable = false,
  eager = false,
}: {
  host: PlaydateHost
  size?: 'md' | 'sm' | 'lg'
  /**
   * V6: when the avatar has a photo, tapping it opens the full-screen
   * viewer instead of doing nothing. Deliberately opt-in — on the feed card
   * the whole surface is a link to the drop-in, and intercepting the avatar
   * there would break the card's one obvious gesture. An initial-fallback
   * circle has nothing to enlarge, so it stays inert.
   */
  expandable?: boolean
  /**
   * Slice 11: keep this avatar's image eager (no `loading="lazy"`). The first
   * feed card's host avatar is the LCP hero; every other list/row avatar lazy-loads.
   */
  eager?: boolean
}) {
  // Hooks run before every return (the early returns below are on the photo).
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const box = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-20 w-20' : 'h-10 w-10'
  const initialClass = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-2xl' : 'text-sm'
  // Slice 11: list imagery lazy-loads; the first feed card's host avatar is
  // the LCP hero and stays eager (FeedPage passes `eager` for its first card).
  // A URL whose object is gone is treated as no URL at all (see the header):
  // `failedUrl` is set by the image's own onError below, and only the URL that
  // failed is suppressed — a later, different URL renders immediately.
  const storedUrl = host.avatar_url ?? ''
  const photoUrl = storedUrl !== '' && storedUrl !== failedUrl ? storedUrl : ''
  // V21 t05: the expandable wrapper must own the SAME box as its child img —
  // a fixed h-11 w-11 (44px) around an 80px `lg` photo drew an ellipse. The
  // 44px tap floor is preserved for the default `md` size (the only caller that
  // relied on it); larger photos carry their own tap area, smaller ones keep
  // the floor via the same rule.
  const buttonBox =
    size === 'lg'
      ? 'flex h-20 w-20 shrink-0 items-center justify-center rounded-full'
      : size === 'sm'
        ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full'
        : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full'
  if (photoUrl !== '') {
    const photo = eager ? (
      <img
        src={photoUrl}
        alt=""
        onError={() => setFailedUrl(storedUrl)}
        className={`${box} shrink-0 rounded-full object-cover`}
      />
    ) : (
      <img
        src={photoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(storedUrl)}
        className={`${box} shrink-0 rounded-full object-cover`}
      />
    )
    return expandable ? (
      <PhotoButton src={photoUrl} alt={`${host.display_name}’s photo`} className={buttonBox}>
        {photo}
      </PhotoButton>
    ) : (
      photo
    )
  }
  return (
    <span
      aria-hidden
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-indigo-100 ${initialClass} font-semibold text-indigo-500`}
    >
      {(host.display_name.charAt(0) || '?').toUpperCase()}
    </span>
  )
}
