/**
 * The notification COPY RULES (V8 ticket 08) — pure, no browser, no Deno, no
 * database. Two runtimes import this one file:
 *
 *   supabase/functions/send-push/index.ts   the sender, which builds the
 *                                           `starting_soon` rows its
 *                                           catch-up scan creates
 *   src/lib/push.ts                         the app's re-export seam, which
 *                                           is what the vitest spec imports
 *
 * It lives under `supabase/functions/_shared/` rather than in `src/lib/`
 * because that is the layout the Supabase CLI bundles for a deployed function
 * (a relative import that escapes `supabase/` is not something the deploy
 * step promises), and the app can import INTO it with no cost at all. The
 * server-side twin of these rules is the SQL function
 * `public.notification_payload` (migration 0032) — the same
 * "one pure seam + one SQL function" pairing as `src/lib/series.ts` ↔
 * `public.ensure_series_occurrences` (0028). Keep the two in step: the vitest
 * spec pins the wording of all eight kinds and the SQL header names this file.
 *
 * Everything here is deliberately string/number in, string out, so it can be
 * unit-tested without a DOM and evaluated identically in Deno and the browser.
 */

/** The eight kinds — the app-side twin of 0032's CHECK constraint (widened to
 * five by V12 t03, migration 0041: 'ended' joins the four; widened to six by
 * V26 slice 1, migration 0055: 'review_due' joins the five; widened to seven by
 * V27 slice 1, migration 0056: 'new_message' joins the six; widened to EIGHT by
 * migration 0060: 'followed_new_dropin' joins the seven — a kind whose producer
 * had been live-only since a migration was applied to production and never
 * committed, so this list lagged the database it twins). */
export const NOTIFICATION_KINDS = [
  'ping_received',
  'starting_soon',
  'cancelled',
  'new_comment',
  'ended',
  'review_due',
  'new_message',
  'followed_new_dropin',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/** Narrow an untrusted string (a push payload, a DB row) to a kind. */
export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === 'string' && (NOTIFICATION_KINDS as readonly string[]).includes(value)
}

/** The route a notification opens. The app's real route is /playdate/:id. */
export function notificationUrl(playdateId: string): string {
  return `/playdate/${playdateId}`
}

/**
 * The route a review prompt opens — the PLACE's detail page, not the drop-in's
 * (V26 slice 1, migration 0055). A SIBLING of `notificationUrl`, deliberately:
 * that function's `/playdate/:id` output is pinned by `src/lib/push.test.ts`
 * (a URL form five KINDS already depend on — it has exactly ONE call site,
 * `buildNotificationPayload` below), so the new kind gets its own rule rather
 * than widening the old one's contract.
 *
 * THE ID IS ENCODED, matching `/place/:id/details`'s canonical builder
 * `placeDetailsPath` (src/lib/places.ts, which uses `encodeURIComponent`). ONE
 * route, ONE encoding contract: unencoded, an id containing `/` would silently
 * point at a different route (`/place/a/b/details`) instead of at the place
 * named `a/b`. For a real uuid the output is byte-identical either way.
 *
 * WHY THIS IS A SECOND SPELLING RATHER THAN AN IMPORT of `placeDetailsPath`:
 * the dependency runs the OTHER way. `src/lib/places.ts` is app-side and pulls
 * in `./feed`, `./types` and `./reviews` (which reach for app-shaped modules),
 * while this file must stay pure — no browser, no Deno globals, no app imports
 * — because the deployed `send-push` function imports it too, and a relative
 * import escaping `supabase/` is not something the Supabase CLI's bundler
 * promises (see this file's header). Importing the app module here would drag
 * the whole app graph into the Edge Function. The duplication is deliberate and
 * this comment is the tally; the two are held together by the same
 * `encodeURIComponent` contract and pinned by `src/lib/push.test.ts`.
 */
export function reviewPromptUrl(placeId: string): string {
  return `/place/${encodeURIComponent(placeId)}/details`
}

/**
 * The route a new-message notification opens — the drop-in's THREAD, not its
 * detail page (V27 slice 1, migration 0056). A SIBLING of `notificationUrl`
 * and `reviewPromptUrl`, for the same reason: the parent's job is to reply, and
 * the conversation lives at `/inbox?thread=<playdate id>`. `notificationUrl`'s
 * `/playdate/:id` output is pinned by `src/lib/push.test.ts` (a URL form five
 * KINDS already depend on — it has exactly ONE call site,
 * `buildNotificationPayload` below), so the new kind gets its own rule rather
 * than widening the old one's contract.
 *
 * THE ID IS ENCODED, matching `reviewPromptUrl` and the canonical
 * `placeDetailsPath` (src/lib/places.ts). ONE route, ONE encoding contract:
 * unencoded, an id containing `?`, `#` or `&` would silently change which
 * thread the push opens. For a real uuid the output is byte-identical either
 * way.
 */
export function messageThreadUrl(playdateId: string): string {
  return `/inbox?thread=${encodeURIComponent(playdateId)}`
}

export interface NotificationPayloadInput {
  kind: NotificationKind
  playdateId: string
  /** The post's title; null/empty falls back rather than rendering `"null"`. */
  postTitle: string | null
  /** Who did it (a display name) — only the two social kinds use it. */
  actorName?: string | null
  /** How many families have pinged — only `starting_soon` uses it. */
  goingCount?: number | null
  /** The place to review. Only `review_due` uses it; null falls back. */
  placeId?: string | null
  /** The post's own TEXT place, as typed by the host. Only
   *  `followed_new_dropin` uses it: the place label is what the alert names,
   *  and a blank one falls back to the actor form rather than rendering
   *  `New drop-in at `. */
  placeLabel?: string | null
  /** The post's start instant (ISO). Only `followed_new_dropin` uses it: the
   *  body carries a `· Thu 3:00am` when-label, and NO label when the post has
   *  no start. */
  startsAt?: string | null
}

export interface NotificationPayload {
  title: string
  body: string
  url: string
}

/**
 * The subject of every sentence: the post's title in quotes, or the honest
 * fallback. A title that is null, whitespace, or an empty string must never
 * render as `""` or `"null"` — the same rule (and the same fallback string)
 * as the feed's while-away copy (src/lib/feed.ts, quotedTitle).
 */
function quotedSubject(postTitle: string | null): string {
  const trimmed = (postTitle ?? '').trim()
  return `"${trimmed === '' ? 'your drop-in' : trimmed}"`
}

/** The actor's display name, or "A parent" when it is missing or blank. */
function actorLabel(actorName: string | null | undefined): string {
  const trimmed = (actorName ?? '').trim()
  return trimmed === '' ? 'A parent' : trimmed
}

/**
 * `you're the only one going so far` / `1 family is going` /
 * `N families are going` — the singular the ticket pins, plus the honest zero
 * (AMENDED 2026-09-12, the 0023 amendment pattern; the SQL twin
 * `public.notification_payload` in migration 0032 carries the same three
 * branches).
 *
 * The zero branch exists because the plural template rendered
 * "0 families are going" — and a `starting_soon` notice is only ever sent to a
 * parent who IS going, so "0 families" reads as "nobody is coming, don't
 * bother". Two things make the zero reachable: the sender's count query returns
 * no rows for a post whose pings were removed, and a direct probe of
 * `notification_payload(..., null)` passes NULL. Negative and non-finite counts
 * clamp to 0 as well, so a bad upstream count can never render "NaN families".
 */
export function familiesGoingLabel(count: number | null | undefined): string {
  const going = Number.isFinite(count) ? Math.max(0, Math.trunc(count as number)) : 0
  if (going <= 0) return "you're the only one going so far"
  return going === 1 ? '1 family is going' : `${going} families are going`
}

/**
 * The zone the when-label is rendered in. A CONSTANT, not the device's zone,
 * because it must agree with the SQL twin, which pins it:
 * `to_char(starts_at at time zone 'America/Los_Angeles', …)`. A label that
 * moved with the reader's device would read differently on two phones looking
 * at the same drop-in — and would stop being the same string in both runtimes.
 */
const LABEL_TIME_ZONE = 'America/Los_Angeles'

/**
 * `Thu 3:00am` — the when-label, char-for-char the SQL twin's
 * `to_char(starts_at at time zone 'America/Los_Angeles', 'FMDy FMHH12:MIam')`
 * (migration 0060).
 *
 * Built from PARTS rather than a locale string: `Intl` in the default 'en-US'
 * shape yields `Wed, 3:00 AM` (a comma, an uppercase meridiem, and a padded
 * hour), and none of those three match the SQL. Each part is composed here so
 * the two spellings are the same string rather than merely both readable.
 *
 * A null/nonsense instant yields NULL — the caller then emits no label at all,
 * which is the SQL's own `p_starts_at is null` branch. It never yields an
 * empty segment or the literal `Invalid Date`.
 */
export function whenLabel(startsAt: string | null | undefined): string | null {
  const trimmed = (startsAt ?? '').trim()
  if (trimmed === '') return null
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: LABEL_TIME_ZONE,
  }).formatToParts(parsed)

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? ''

  const weekday = part('weekday')
  const hour = part('hour')
  const minute = part('minute')
  const meridiem = part('dayPeriod').toLowerCase()

  if (weekday === '' || hour === '' || minute === '' || meridiem === '') return null

  return `${weekday} ${hour}:${minute}${meridiem}`
}

/**
 * The full title/body/url for one notification — the exact strings the
 * producers write into `notification_log` and the sender posts.
 *
 * The `switch` is exhaustive over NotificationKind, so a ninth kind is a
 * compile error here rather than a silent default at runtime.
 */
export function buildNotificationPayload(input: NotificationPayloadInput): NotificationPayload {
  const subject = quotedSubject(input.postTitle)
  const actor = actorLabel(input.actorName)
  const url = notificationUrl(input.playdateId)
  // A review prompt points at the PLACE, never the drop-in — but only when a
  // usable place id actually arrived. null, empty and whitespace-only all fall
  // back to the drop-in route rather than rendering `/place/null/details` or
  // `/place//details`. The trim matches the subject/actor rules above: it is
  // invisible for a real uuid and closes the whitespace hole.
  const placeId = (input.placeId ?? '').trim()
  const reviewUrl = placeId === '' ? url : reviewPromptUrl(placeId)

  switch (input.kind) {
    case 'ping_received':
      return { title: `${actor} is going`, body: `to ${subject}`, url }
    case 'new_comment':
      return { title: `${actor} commented`, body: `on ${subject}`, url }
    case 'cancelled':
      return {
        title: `Cancelled: ${subject}`,
        // The "don't drive to an empty park" sentence.
        body: "The host called it off — don't head out.",
        url,
      }
    case 'ended':
      return {
        title: `Ended: ${subject}`,
        // 0041 pin d: the same "don't drive to an empty park" sentence class,
        // char-for-char twin of the SQL branch in migration 0041 section 4.
        body: "The host ended it — don't head out.",
        url,
      }
    case 'starting_soon':
      return {
        title: `Starting soon: ${subject}`,
        body: `Starts within the hour · ${familiesGoingLabel(input.goingCount)}`,
        url,
      }
    case 'review_due':
      return {
        title: `How was ${subject}?`,
        // NOT "you went". `going_pings` (0007) has no status column and no
        // check-in exists anywhere in the schema, so a ping is a STATED
        // INTENTION, never evidence of attendance — "you went" would be false
        // for every no-show. The SQL twin (0055 section 2) carries this string
        // char-for-char.
        body: 'You said you were going — rate the place.',
        url: reviewUrl,
      }
    case 'new_message':
      return {
        title: `${actor} messaged you`,
        // The message BODY is never carried (V27 slice 1's privacy pin): the
        // subject is the post's title, and the sentence points at the thread.
        // The SQL twin (0056 section 2) carries this string char-for-char.
        body: `Tap to reply in ${subject}`,
        url: messageThreadUrl(input.playdateId),
      }
    case 'followed_new_dropin': {
      // The place label wins over the actor; a blank one falls back rather
      // than rendering `New drop-in at `. The `.trim()` matches the SQL's
      // `nullif(btrim(p_place_label), '')`: whitespace-only is the same as
      // absent.
      const place = (input.placeLabel ?? '').trim()
      const label = whenLabel(input.startsAt)
      return {
        title: place === '' ? `New drop-in from ${actor}` : `New drop-in at ${place}`,
        // The subject, plus the when-label only when there IS a start — never
        // a trailing `· ` with nothing after it. The SQL twin (0060 section 3)
        // carries this branch char-for-char.
        body: label === null ? subject : `${subject} · ${label}`,
        url,
      }
    }
  }
}

export interface NotificationDedupeInput {
  profileId: string
  kind: NotificationKind
  playdateId: string | null
}

/**
 * The dedupe key — the app-side derivation of migration 0032's
 * `unique (profile_id, kind, playdate_id)`. One notification per
 * (parent, kind, post), enforced by the DB on insert and reused on the client
 * as the notification's `tag`, where the platform collapses a repeat into the
 * already-visible notification instead of stacking a second one. Same
 * semantics, both ends: "if we already told them about this, don't buzz
 * again."
 *
 * A null post id renders as the literal 'none' rather than an empty segment,
 * so no combination of ids can collide by concatenation.
 */
export function notificationDedupeKey(input: NotificationDedupeInput): string {
  return `${input.profileId}:${input.kind}:${input.playdateId ?? 'none'}`
}

/**
 * Keep the first row per dedupe key — the in-memory twin of the producers'
 * `on conflict (profile_id, kind, playdate_id) do nothing`. Order is the
 * caller's (newest-first for the /profile fallback list), so the FIRST row
 * wins and later duplicates are dropped.
 */
export function dedupeNotifications<T extends NotificationDedupeInput>(rows: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    const key = notificationDedupeKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}
