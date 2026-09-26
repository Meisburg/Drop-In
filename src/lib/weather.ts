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
 * NON-INTERACTIVE (a null forecast, or a forecast with no usable fact in it — a
 * panel whose only line is the window the page already shows is not worth a
 * tap). The window label is the CALLER's formatting ("3:00 PM–5:00 PM"), so the
 * two surfaces that render the chip cannot drift in how they say "when"; the
 * rule here only decides what a panel contains and whether there is one.
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

    const inFlight = (async () => {
      let coordsMap: ReadonlyMap<string, ForecastCoords>
      try {
        coordsMap = await deps.loadCoords()
      } catch {
        // The gazetteer fetch failed — uncacheable: delete the in-flight entry
        // so the NEXT call re-issues the fetch (never cache a rejection).
        cache.delete(key)
        return null
      }
      const coords = coordsMap.get(zip)
      if (coords === undefined) {
        // Not in the seeded gazetteer — stable for the SPA session, cacheable.
        return null
      }
      try {
        return await deps.fetchForecast(coords.lat, coords.lng, dateYmd)
      } catch {
        // One retry on failure (the plan pin).
        try {
          return await deps.fetchForecast(coords.lat, coords.lng, dateYmd)
        } catch {
          // Double failure / out-of-range date → null, uncacheable.
          cache.delete(key)
          return null
        }
      }
    })()
    cache.set(key, inFlight)
    return inFlight
  }
}
