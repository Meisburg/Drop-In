/**
 * Unit tests for the V24 slice 04 Open-Meteo daily forecast seam
 * (`src/lib/weather.ts`).
 *
 * Two things here are load-bearing and deliberately pinned rather than trusted:
 *
 *  1. THE REQUEST AND RESPONSE SHAPES. A wrong or retired variable name is not a
 *     test failure anywhere else in this app — it is an HTTP 400 that the
 *     wrapper's "never throw, resolve null" contract converts into a
 *     permanently inert chip with every other test still green. So the URL's
 *     parameter list is asserted here, and the parsed forecast is asserted from
 *     a FIXTURE (the live response shape recorded in
 *     `research/open-meteo-daily.md`).
 *  2. THE FOUR FETCH INVARIANTS (one fetch per (zip, date) · retry once · never
 *     throw · never cache a failure). The loader takes its dependencies as
 *     parameters precisely so these are asserted with counting fakes, no
 *     network, no database, no browser.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createDailyForecastLoader,
  DAILY_FORECAST_VARIABLES,
  openMeteoDailyUrl,
  parseDailyForecast,
  weatherPanelFor,
  type DailyForecast,
} from './weather'

/**
 * The measured 200 response's `daily` block (research/open-meteo-daily.md),
 * already converted by the FIXTURE to the units the request asks for
 * (temperature_unit=fahrenheit → 60.9/49.1; wind_speed_unit=mph → 25.3).
 */
const WIRE_FIXTURE = {
  latitude: 47.6,
  longitude: -122.3,
  timezone: 'America/Los_Angeles',
  daily_units: {
    time: 'iso8601',
    temperature_2m_max: '°F',
    temperature_2m_min: '°F',
    wind_speed_10m_max: 'mp/h',
    precipitation_probability_max: '%',
  },
  daily: {
    time: ['2026-09-25'],
    temperature_2m_max: [60.9],
    temperature_2m_min: [49.1],
    wind_speed_10m_max: [25.3],
    precipitation_probability_max: [92],
  },
}

describe('openMeteoDailyUrl (the request shape — research/open-meteo-daily.md)', () => {
  const url = new URL(openMeteoDailyUrl(47.6, -122.3, '2026-09-25'))

  it('requests every daily variable, with the underscored modern wind name', () => {
    expect(url.searchParams.get('daily')).toBe(DAILY_FORECAST_VARIABLES.join(','))
    expect(url.searchParams.get('daily')).toBe(
      'temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max',
    )
    // The legacy alias answers 200 today and would break silently when retired:
    // it must not appear anywhere in the request.
    expect(url.searchParams.get('daily')).not.toContain('windspeed_10m_max')
  })

  it('asks for Fahrenheit and mph — the default is °C and km/h, and this is Seattle', () => {
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit')
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph')
    // precipitation_probability_max is a unitless % — no unit parameter for it.
    expect(url.searchParams.get('precipitation_unit')).toBeNull()
  })

  it('is one local day in the event timezone', () => {
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(url.searchParams.get('latitude')).toBe('47.6')
    expect(url.searchParams.get('longitude')).toBe('-122.3')
    expect(url.searchParams.get('timezone')).toBe('auto')
    expect(url.searchParams.get('start_date')).toBe('2026-09-25')
    expect(url.searchParams.get('end_date')).toBe('2026-09-25')
  })
})

describe('parseDailyForecast (the response shape, pinned from a fixture)', () => {
  it('reads the four facts out of the measured wire shape', () => {
    expect(parseDailyForecast(WIRE_FIXTURE)).toEqual({
      temperatureMaxF: 60.9,
      temperatureMinF: 49.1,
      windSpeedMaxMph: 25.3,
      precipitationProbability: 92,
    })
  })

  it('leaves a missing or null variable null, and keeps the others', () => {
    const partial = parseDailyForecast({
      daily_units: { temperature_2m_max: '°F', wind_speed_10m_max: 'mp/h' },
      daily: {
        time: ['2026-09-25'],
        temperature_2m_max: [60.9],
        temperature_2m_min: [null],
        precipitation_probability_max: [92],
      },
    })
    expect(partial).toEqual({
      temperatureMaxF: 60.9,
      temperatureMinF: null,
      windSpeedMaxMph: null,
      precipitationProbability: 92,
    })
  })

  it('is null when there is nothing usable to show (never an empty panel)', () => {
    const units = { temperature_2m_max: '°F', wind_speed_10m_max: 'mp/h' }
    expect(parseDailyForecast({ daily_units: units, daily: { time: ['2026-09-25'] } })).toBeNull()
    expect(
      parseDailyForecast({ daily_units: units, daily: { temperature_2m_max: [null] } }),
    ).toBeNull()
    expect(parseDailyForecast({})).toBeNull()
    expect(parseDailyForecast({ daily: null })).toBeNull()
    expect(parseDailyForecast(null)).toBeNull()
    expect(parseDailyForecast('nope')).toBeNull()
  })

  it('REFUSES a metric reply — a °C / km-h value must never print as °F / mph', () => {
    // The request pins fahrenheit + mph. If the API ignored those parameters the
    // values would be metric and the panel would label them imperial: a wrong
    // number shown to a parent, which is worse than the chip being absent.
    expect(
      parseDailyForecast({
        daily_units: { temperature_2m_max: '°C', wind_speed_10m_max: 'km/h' },
        daily: {
          time: ['2026-09-25'],
          temperature_2m_max: [16],
          temperature_2m_min: [9.5],
          wind_speed_10m_max: [25.3],
          precipitation_probability_max: [92],
        },
      }),
    ).toBeNull()
  })

  it('fails CLOSED when the units are absent or unrecognised', () => {
    expect(parseDailyForecast({ daily: { temperature_2m_max: [60.9] } })).toBeNull()
    expect(
      parseDailyForecast({
        daily_units: { temperature_2m_max: '°F' },
        daily: { temperature_2m_max: [60.9], precipitation_probability_max: [92] },
      }),
    ).toBeNull()
    expect(
      parseDailyForecast({
        daily_units: { temperature_2m_max: 'kelvin', wind_speed_10m_max: 'knots' },
        daily: { temperature_2m_max: [60.9], precipitation_probability_max: [92] },
      }),
    ).toBeNull()
  })

  it('accepts the plain "mph" spelling too, so a label tidy-up does not take the chip down', () => {
    expect(
      parseDailyForecast({
        daily_units: { temperature_2m_max: '°F', wind_speed_10m_max: 'mph' },
        daily: { temperature_2m_max: [60.9], precipitation_probability_max: [92] },
      }),
    ).toEqual({
      temperatureMaxF: 60.9,
      temperatureMinF: null,
      windSpeedMaxMph: null,
      precipitationProbability: 92,
    })
  })

  it('does not treat the legacy wind spelling as a value', () => {
    expect(
      parseDailyForecast({
        daily_units: { temperature_2m_max: '°F', wind_speed_10m_max: 'mp/h' },
        daily: { windspeed_10m_max: [25.3], temperature_2m_max: [60.9] },
      }),
    ).toEqual({
      temperatureMaxF: 60.9,
      temperatureMinF: null,
      windSpeedMaxMph: null,
      precipitationProbability: null,
    })
  })
})

describe('weatherPanelFor (the chip’s interactivity rule — the null case is the point)', () => {
  const full: DailyForecast = {
    temperatureMaxF: 60.9,
    temperatureMinF: 49.1,
    windSpeedMaxMph: 25.3,
    precipitationProbability: 92,
  }

  it('is null for a null forecast — the chip stays non-interactive, never an empty panel', () => {
    // NOTE ON REACHABILITY: neither call site can hand the chip a fully null
    // forecast today (a chip only mounts when the ≥50% badge fires). This case
    // is the rule's contract for the next caller; the case production DOES hit
    // is the sparse forecast below, and it is pinned for the same reason.
    expect(weatherPanelFor(null, '3:00 PM–5:00 PM')).toBeNull()
  })

  it('is null when only the window would be left — no fact, no panel', () => {
    expect(
      weatherPanelFor(
        {
          temperatureMaxF: null,
          temperatureMinF: null,
          windSpeedMaxMph: null,
          precipitationProbability: null,
        },
        '3:00 PM–5:00 PM',
      ),
    ).toBeNull()
    // One fact is still not a panel: the page around the chip already says it.
    expect(
      weatherPanelFor(
        {
          temperatureMaxF: null,
          temperatureMinF: null,
          windSpeedMaxMph: null,
          precipitationProbability: 92,
        },
        '3:00 PM–5:00 PM',
      ),
    ).toBeNull()
  })

  it('shows temperature, rain, wind and the event’s window, in that order', () => {
    expect(weatherPanelFor(full, '3:00 PM–5:00 PM')).toEqual({
      title: 'Forecast',
      lines: ['High 61° · Low 49°', 'Rain 92%', 'Wind 25 mph', 'When 3:00 PM–5:00 PM'],
    })
  })

  it('renders “mph” itself — never the API’s own “mp/h” label', () => {
    const panel = weatherPanelFor({ ...full, temperatureMaxF: null, temperatureMinF: null }, '5 PM')
    expect(panel?.lines).toEqual(['Rain 92%', 'Wind 25 mph', 'When 5 PM'])
    expect(JSON.stringify(panel)).not.toContain('mp/h')
  })

  it('names a single-sided temperature honestly instead of inventing the other end', () => {
    const panel = weatherPanelFor({ ...full, temperatureMinF: null }, '5 PM')
    expect(panel?.lines[0]).toBe('High 61°')
  })
})

/** A loader whose fakes count calls, so each invariant is an assertion. */
function makeLoader(options: {
  coords?: ReadonlyMap<string, { lat: number; lng: number }>
  coordsError?: Error
  fetchForecast: (lat: number, lng: number, dateYmd: string) => Promise<DailyForecast>
}) {
  const loadCoords = vi.fn(async () => {
    if (options.coordsError !== undefined) throw options.coordsError
    return options.coords ?? new Map([['98101', { lat: 47.6, lng: -122.3 }]])
  })
  const fetchForecast = vi.fn(options.fetchForecast)
  const load = createDailyForecastLoader({
    loadCoords,
    fetchForecast,
    localDayKey: (iso: string) => iso.slice(0, 10),
  })
  return { load, loadCoords, fetchForecast }
}

const FORECAST: DailyForecast = {
  temperatureMaxF: 60.9,
  temperatureMinF: 49.1,
  windSpeedMaxMph: 25.3,
  precipitationProbability: 92,
}

describe('createDailyForecastLoader (the wrapper’s four invariants)', () => {
  it('ONE fetch per distinct (zip, event-date): the module cache', async () => {
    const { load, fetchForecast } = makeLoader({ fetchForecast: async () => FORECAST })
    expect(await load('98101', '2026-09-25T15:00:00Z')).toEqual(FORECAST)
    expect(await load('98101', '2026-09-25T18:00:00Z')).toEqual(FORECAST)
    // ...and the key is the DAY, so a different date is a different fetch.
    expect(await load('98101', '2026-09-26T15:00:00Z')).toEqual(FORECAST)
    expect(fetchForecast).toHaveBeenCalledTimes(2)
  })

  it('ONE fetch for concurrent callers: the in-flight dedupe', async () => {
    const { load, fetchForecast } = makeLoader({
      fetchForecast: () => new Promise((resolve) => setTimeout(() => resolve(FORECAST), 5)),
    })
    const [a, b] = await Promise.all([
      load('98101', '2026-09-25T15:00:00Z'),
      load('98101', '2026-09-25T15:00:00Z'),
    ])
    expect(a).toEqual(FORECAST)
    expect(b).toEqual(FORECAST)
    expect(fetchForecast).toHaveBeenCalledTimes(1)
  })

  it('retries once, then succeeds', async () => {
    let attempt = 0
    const { load, fetchForecast } = makeLoader({
      fetchForecast: async () => {
        attempt += 1
        if (attempt === 1) throw new Error('Open-Meteo HTTP 500')
        return FORECAST
      },
    })
    expect(await load('98101', '2026-09-25T15:00:00Z')).toEqual(FORECAST)
    expect(fetchForecast).toHaveBeenCalledTimes(2)
  })

  it('never throws, and NEVER caches a double failure — the next call retries', async () => {
    const { load, fetchForecast } = makeLoader({
      fetchForecast: async () => {
        throw new Error('Open-Meteo HTTP 400')
      },
    })
    expect(await load('98101', '2026-09-25T15:00:00Z')).toBeNull()
    expect(fetchForecast).toHaveBeenCalledTimes(2)
    // The failed attempt is NOT pinned: the next call re-issues both attempts.
    // (A cached rejection is the bug this repo already fixed once, e0d3756.)
    expect(await load('98101', '2026-09-25T15:00:00Z')).toBeNull()
    expect(fetchForecast).toHaveBeenCalledTimes(4)
  })

  it('does not cache a SYNCHRONOUS gazetteer throw either (the ordering hole)', async () => {
    // A `loadCoords` that throws before its first await used to delete the
    // in-flight entry INSIDE the attempt body — i.e. BEFORE the cache write a
    // line later re-pinned it — so the failure stuck and the next call never
    // retried. The delete is now ordered after the write, which this asserts by
    // COUNTING the load attempts: 2, not 1.
    let loadCalls = 0
    const load = createDailyForecastLoader({
      loadCoords: () => {
        loadCalls += 1
        throw new Error('0012 not applied (synchronous)')
      },
      fetchForecast: async () => FORECAST,
      localDayKey: (iso: string) => iso.slice(0, 10),
    })
    expect(await load('98101', '2026-09-25T15:00:00Z')).toBeNull()
    expect(await load('98101', '2026-09-25T15:00:00Z')).toBeNull()
    expect(loadCalls).toBe(2)
  })

  it('never throws when the gazetteer itself rejects, and does not cache that either', async () => {
    const { load, loadCoords } = makeLoader({
      coordsError: new Error('0012 not applied'),
      fetchForecast: async () => FORECAST,
    })
    expect(await load('98101', '2026-09-25T15:00:00Z')).toBeNull()
    expect(await load('98101', '2026-09-25T15:00:00Z')).toBeNull()
    expect(loadCoords).toHaveBeenCalledTimes(2)
  })

  it('never invents coordinates: a zip outside the gazetteer is a cached null', async () => {
    const { load, fetchForecast } = makeLoader({ fetchForecast: async () => FORECAST })
    expect(await load('00000', '2026-09-25T15:00:00Z')).toBeNull()
    expect(await load('00000', '2026-09-25T15:00:00Z')).toBeNull()
    expect(fetchForecast).not.toHaveBeenCalled()
  })
})
