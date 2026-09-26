/**
 * V24 slice 04 (ticket 04): the Open-Meteo DAILY FORECAST seam.
 *
 * The feed already fetched ONE daily variable (`precipitation_probability_max`)
 * and reduced it to a bare number, which is why the "Rain likely" badge could
 * say "it may rain" and nothing more. The founder's ask is that tapping the chip
 * reveals THAT event's forecast — temperature, precipitation probability, wind
 * and the event's window — so the same single request now carries the extra
 * daily variables and this module owns the three pure decisions around it:
 *
 *  1. `openMeteoDailyUrl` — the request SHAPE. Two of its parameters are
 *     product defects waiting to ship (both verified against the live API on
 *     2026-09-25 and recorded in `research/open-meteo-daily.md`):
 *       - `wind_speed_10m_max` is the underscored MODERN name. The legacy alias
 *         `windspeed_10m_max` also answers 200 today, so a request using it would
 *         pass every smoke test and break whenever Open-Meteo retires it.
 *       - WITHOUT `temperature_unit=fahrenheit` / `wind_speed_unit=mph` the API
 *         answers in °C and km/h, and this is a Seattle app. The API's own label
 *         for mph is `mp/h` — which is why the UI renders "mph" itself and never
 *         prints a unit string the API sent. `precipitation_probability_max` is
 *         a unitless %, so no `precipitation_unit` is sent.
 *  2. `parseDailyForecast` — the RESPONSE shape. A rejected variable name is an
 *     HTTP 400, which the wrapper's "never throw, resolve null" contract turns
 *     into a permanently inert chip with every test green, so the parsed shape
 *     is pinned from a FIXTURE here rather than trusted to a live call.
 *     `weather_code` is deliberately NOT requested: it is a WMO integer, and the
 *     honest four facts the ticket asks for do not need a code→words table.
 *  3. `weatherPanelFor` — the PRESENTATION/INTERACTIVITY rule. Given a forecast
 *     (or null) and the event's window label, it returns the panel's contents or
 *     null. NULL is the rule that matters most: a null forecast leaves the chip
 *     NON-INTERACTIVE — never a disabled-looking button opening an empty panel,
 *     never an error (the zero-pressure soul).
 *
 * The four invariants of the fetch itself (one fetch per distinct
 * (zip, event-date) via the module cache + in-flight dedupe · retry once ·
 * never throw, resolve null · a failed attempt is NOT cached) are control flow,
 * not request shape. They live in `createDailyForecastLoader` here — with its
 * dependencies (the gazetteer, the HTTP call, the local-day key) INJECTED, so
 * each invariant is unit-tested with no browser, no network and no database
 * (the build law's injected-dependency rule). `db.ts` binds the factory to the
 * Supabase gazetteer and `fetch`.
 */

/** The one-day daily forecast this app asks for, in the units it renders. */
export interface DailyForecast {
  /** Daily max temperature, °F (the request asks for Fahrenheit). */
  temperatureMaxF: number | null
  /** Daily min temperature, °F. */
  temperatureMinF: number | null
  /** Daily max wind speed, mph (the request asks for mph; the UI says "mph"). */
  windSpeedMaxMph: number | null
  /** Daily max precipitation probability, % (unitless). */
  precipitationProbability: number | null
}

/**
 * The requested daily variables, in the request order, exactly as Open-Meteo
 * names them. Underscored `wind_speed_10m_max`, never the legacy alias — and
 * never both spellings in one file (research/open-meteo-daily.md, FINDING 1).
 */
export const DAILY_FORECAST_VARIABLES = [
  'temperature_2m_max',
  'temperature_2m_min',
  'wind_speed_10m_max',
  'precipitation_probability_max',
] as const

/**
 * The one-day Open-Meteo request URL for a coordinate + local date (YYYY-MM-DD).
 * Pure and exported so the request SHAPE is asserted by a test: the grounded
 * variable names, the Fahrenheit/mph unit parameters, and the absence of the
 * legacy wind alias.
 */
export function openMeteoDailyUrl(lat: number, lng: number, dateYmd: string): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('daily', DAILY_FORECAST_VARIABLES.join(','))
  url.searchParams.set('timezone', 'auto')
  // The units are part of the product, not a detail: default °C/km/h would tell
  // a Seattle parent their drop-in is at "16°, 25 km/h".
  url.searchParams.set('temperature_unit', 'fahrenheit')
  url.searchParams.set('wind_speed_unit', 'mph')
  url.searchParams.set('start_date', dateYmd)
  url.searchParams.set('end_date', dateYmd)
  return url.toString()
}

/**
 * Does a `daily_units` label describe the unit this app requested? The request
 * pins `temperature_unit=fahrenheit` / `wind_speed_unit=mph`, but if the API
 * ever ignored those parameters the reply's VALUES would be °C and km/h and the
 * panel would print them as °F/mph — the exact silent failure the parameters
 * exist to prevent, and a wrong number is worse than no chip.
 *
 * So the units are VERIFIED, and the check FAILS CLOSED: an unrecognised or
 * absent label resolves the forecast to null (the wrapper retries, then the chip
 * is simply inert — the app's designed absence, no error state). The accepted
 * spellings are the ones the live API is measured to send (°F, and the wind
 * label `mp/h` — see research/open-meteo-daily.md) plus the plain `mph` variant
 * so a label tidy-up does not take the chip down for no reason.
 */
function isFahrenheitLabel(label: unknown): boolean {
  return typeof label === 'string' && label.includes('F')
}

function isMphLabel(label: unknown): boolean {
  if (typeof label !== 'string') return false
  const lower = label.toLowerCase()
  return lower.includes('mph') || lower.includes('mp/h')
}

/** One daily array as the wire returns it (a null entry = no value for that day). */
function firstFinite(values: unknown): number | null {
  if (!Array.isArray(values)) return null
  const first = values[0]
  return typeof first === 'number' && Number.isFinite(first) ? first : null
}

/**
 * Parse the Open-Meteo daily payload into a `DailyForecast`, or null when there
 * is nothing usable to show (a missing `daily` block, or every requested
 * variable null — the caller then settles a null forecast, uncached).
 *
 * A variable that came back missing or null is simply null in the object; the
 * panel renders the facts it has. The four key names are pinned by the test to
 * the same names `DAILY_FORECAST_VARIABLES` requests, so a renamed variable
 * cannot silently become "no forecast" without failing here.
 */
export function parseDailyForecast(payload: unknown): DailyForecast | null {
  if (payload === null || typeof payload !== 'object') return null
  const units = (payload as { daily_units?: unknown }).daily_units
  if (units === null || typeof units !== 'object') return null
  const unitBlock = units as Record<string, unknown>
  // Fail closed: a reply whose temperature or wind unit is not the one asked
  // for is NOT a forecast we may render (see the helpers above).
  if (!isFahrenheitLabel(unitBlock.temperature_2m_max)) return null
  if (!isMphLabel(unitBlock.wind_speed_10m_max)) return null
  const daily = (payload as { daily?: unknown }).daily
  if (daily === null || typeof daily !== 'object') return null
  const block = daily as Record<string, unknown>
  const forecast: DailyForecast = {
    temperatureMaxF: firstFinite(block.temperature_2m_max),
    temperatureMinF: firstFinite(block.temperature_2m_min),
    windSpeedMaxMph: firstFinite(block.wind_speed_10m_max),
    precipitationProbability: firstFinite(block.precipitation_probability_max),
  }
  const usable =
    forecast.temperatureMaxF !== null ||
    forecast.temperatureMinF !== null ||
    forecast.windSpeedMaxMph !== null ||
    forecast.precipitationProbability !== null
  return usable ? forecast : null
}

/** The panel a tapped chip opens (see `weatherPanelFor`). */
export interface WeatherPanel {
  /** The panel's heading. */
  title: string
  /** One line per fact; the event's window is always the last line. */
  lines: string[]
}

/** The chip's panel heading (the chip itself keeps saying "Rain likely"). */
export const WEATHER_PANEL_TITLE = 'Forecast'

/**
 * What the chip's panel shows for one forecast, or null when the chip must stay
 * NON-INTERACTIVE (a null forecast, or a forecast with fewer than two usable
 * facts — a panel whose only line is the window the page already shows is not
 * worth a tap).
 *
 * REACHABILITY, stated honestly: the full-null case is NOT produced by either
 * call site today (a chip only mounts when `rainBadgeLabel` fires on a
 * probability of at least 50). The case production DOES hit is the SPARSE
 * forecast — a reply carrying the probability but no temperature or wind — and
 * the null branch is part of this rule's contract for the next caller rather
 * than a state the feed can currently reach. Both are pinned by the test.
 *
 * The window label is the CALLER's formatting, and the two surfaces deliberately
 * differ: the card passes `feed.formatTimeWindow` ("3:00 PM–5:00 PM"), the detail
 * page its own `formatDay` + `formatTime` line ("Today · 3:00 PM–5:00 PM", which
 * the panel sits under). This rule owns WHAT the panel contains, never how
 * "when" is worded, so those two spellings are expected to differ.
 */
export function weatherPanelFor(
  forecast: DailyForecast | null,
  whenLabel: string,
): WeatherPanel | null {
  if (forecast === null) return null
  const lines: string[] = []
  const high = forecast.temperatureMaxF
  const low = forecast.temperatureMinF
  if (high !== null && low !== null) {
    lines.push(`High ${Math.round(high)}° · Low ${Math.round(low)}°`)
  } else if (high !== null) {
    lines.push(`High ${Math.round(high)}°`)
  } else if (low !== null) {
    lines.push(`Low ${Math.round(low)}°`)
  }
  if (forecast.precipitationProbability !== null) {
    lines.push(`Rain ${Math.round(forecast.precipitationProbability)}%`)
  }
  if (forecast.windSpeedMaxMph !== null) {
    // "mph" is OURS. The API's own unit label is `mp/h` — never printed.
    lines.push(`Wind ${Math.round(forecast.windSpeedMaxMph)} mph`)
  }
  // Below 2 facts there is nothing the chip's own page does not already say —
  // no panel, and therefore no button (the null rule, applied to a sparse
  // forecast as well as to a missing one).
  if (lines.length < 2) return null
  if (whenLabel !== '') lines.push(`When ${whenLabel}`)
  return { title: WEATHER_PANEL_TITLE, lines }
}

/** A coordinate from the 0012 gazetteer (structurally `ZipCoords`). */
export interface ForecastCoords {
  lat: number
  lng: number
}

/** Everything the forecast fetch needs, injected (no ambient client, no globals). */
export interface DailyForecastDeps {
  /** The seeded zip→coords gazetteer. May REJECT (0012 not applied / transient). */
  loadCoords: () => Promise<ReadonlyMap<string, ForecastCoords>>
  /** ONE Open-Meteo daily fetch. REJECTS on any HTTP/parse problem. */
  fetchForecast: (lat: number, lng: number, dateYmd: string) => Promise<DailyForecast>
  /** The event's LOCAL day key (YYYY-MM-DD) — `feed.localDayKey`. */
  localDayKey: (iso: string) => string
}

/**
 * The per-(zip, event-date) forecast fetch, with the wrapper's four load-bearing
 * invariants preserved verbatim from the number-returning version they replace:
 *
 *  - ONE fetch per distinct (zip, event-date): a module cache of SETTLED
 *    promises plus an in-flight entry written SYNCHRONOUSLY, so concurrent
 *    callers for the same key share exactly one fetch;
 *  - RETRY once on a failed fetch;
 *  - NEVER throw: any failure (including a rejected gazetteer) resolves null, and
 *    a zip outside the seeded gazetteer resolves null too — coordinates are
 *    never invented (the radius feed's pinned rule);
 *  - a FAILED attempt is NOT cached: the entry is deleted before resolving null,
 *    so the next call re-issues the fetch (the zip-cache lesson, e0d3756 — a
 *    pinned rejection used to need a page reload to clear).
 *
 * The factory exists so those invariants are testable without a network: the
 * test supplies counting fakes and asserts the fetch count per case.
 */
export function createDailyForecastLoader(
  deps: DailyForecastDeps,
): (zip: string, eventDateIso: string) => Promise<DailyForecast | null> {
  const cache = new Map<string, Promise<DailyForecast | null>>()

  return (zip: string, eventDateIso: string) => {
    const dateYmd = deps.localDayKey(eventDateIso)
    const key = `${zip}:${dateYmd}`
    const pending = cache.get(key)
    if (pending !== undefined) return pending

    // The attempt answers with a DISCRIMINATED result rather than deleting the
    // cache entry from inside its own body. That matters for ordering: a
    // `loadCoords` that throws SYNCHRONOUSLY (before the body's first await)
    // used to run its `cache.delete(key)` BEFORE the `cache.set(key, …)` a line
    // later — which re-pinned the very failure it had just removed. Here the
    // body only reports `ok: false`, and the delete happens in a settled
    // callback registered BEFORE the write, so a microtask guarantees it runs
    // AFTER the write for synchronous and asynchronous failures alike.
    type Attempt = { ok: true; forecast: DailyForecast | null } | { ok: false }

    const attempt = (async (): Promise<Attempt> => {
      let coordsMap: ReadonlyMap<string, ForecastCoords>
      try {
        coordsMap = await deps.loadCoords()
      } catch {
        // The gazetteer fetch failed — never cacheable.
        return { ok: false }
      }
      const coords = coordsMap.get(zip)
      if (coords === undefined) {
        // Not in the seeded gazetteer — stable for the SPA session, cacheable.
        return { ok: true, forecast: null }
      }
      try {
        return { ok: true, forecast: await deps.fetchForecast(coords.lat, coords.lng, dateYmd) }
      } catch {
        // One retry on failure (the plan pin).
        try {
          return {
            ok: true,
            forecast: await deps.fetchForecast(coords.lat, coords.lng, dateYmd),
          }
        } catch {
          // Double failure / out-of-range date — never cacheable.
          return { ok: false }
        }
      }
    })()

    const settled = attempt.then((result) => {
      if (!result.ok) {
        // Runs strictly AFTER the cache write below (see the note above), so
        // the next call re-issues the fetch. A failed attempt is never pinned.
        cache.delete(key)
        return null
      }
      return result.forecast
    })
    cache.set(key, settled)
    return settled
  }
}
