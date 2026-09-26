/**
 * V24 slice 04 (ticket 04) — the TAPPABLE WEATHER CHIP, end to end.
 *
 * WHY THIS SPEC EXISTS. The chip's only unit-testable half is the pure rule in
 * `src/lib/weather.ts` (what a panel contains, and whether there is one). The
 * TAP itself cannot be pinned by any unit test in this repo: there is no
 * component-test tooling (no jsdom / testing-library), and the one behaviour the
 * ticket's AC is really about — a tap inside the card-wide `<Link>` opening the
 * panel INSTEAD of navigating — is a browser behaviour. It also cannot be
 * observed against the live API, because the chip mounts only when Open-Meteo
 * answers a probability of at least 50% for a TODAY drop-in.
 *
 * So this spec intercepts `api.open-meteo.com` (`page.route`, the
 * feed-empty-state pattern) and seeds ONE post in TODAY's section through /new
 * (which opens on today + the next 30-minute slot, so no date juggling is
 * needed). Everything else — the zip gazetteer, the feed query, the host's
 * home_zip — stays live.
 *
 * The two tests:
 *  1. a rainy forecast: the chip exists, the tap flips `aria-expanded`, opens a
 *     panel with the temperature / rain / wind / window, and the URL is STILL
 *     the feed afterwards (the `preventDefault` that the card's `<Link>`
 *     requires).
 *  2. the states where there is NOTHING to tap: a sparse reply (the probability
 *     only — the badge still renders, with no button and no panel), an all-null
 *     reply, and a metric reply (°C / km-h — refused by the unit guard, so no
 *     number is ever printed as °F / mph).
 *
 * Cleanup mirrors the house pattern: the marker's own post is deleted by title
 * through REST with the marker's JWT (never a destructive sweep, and never
 * `runLiveSql` — that path drives the human's own Chrome).
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  editTitle,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
/** Every Open-Meteo call the app makes is intercepted (the forecast is the knob). */
const OPEN_METEO = /api\.open-meteo\.com/

/** The wire shape the app parses, with the units it actually asked for. */
function forecastPayload(values: {
  temperatureMax: number | null
  temperatureMin: number | null
  windMax: number | null
  rainProbability: number | null
  temperatureUnit: string
  windUnit: string
}): string {
  return JSON.stringify({
    latitude: 47.6,
    longitude: -122.3,
    timezone: 'America/Los_Angeles',
    daily_units: {
      time: 'iso8601',
      temperature_2m_max: values.temperatureUnit,
      temperature_2m_min: values.temperatureUnit,
      wind_speed_10m_max: values.windUnit,
      precipitation_probability_max: '%',
    },
    daily: {
      time: [new Date().toISOString().slice(0, 10)],
      temperature_2m_max: [values.temperatureMax],
      temperature_2m_min: [values.temperatureMin],
      wind_speed_10m_max: [values.windMax],
      precipitation_probability_max: [values.rainProbability],
    },
  })
}

const RAINY = {
  temperatureMax: 60.9,
  temperatureMin: 49.1,
  windMax: 25.3,
  rainProbability: 92,
  temperatureUnit: '°F',
  windUnit: 'mp/h',
}

/** The reachable non-interactive case: the badge's probability, nothing else. */
const SPARSE = { ...RAINY, temperatureMax: null, temperatureMin: null, windMax: null }

/** Nothing usable at all (an out-of-range/no-data reply). */
const ALL_NULL = {
  ...RAINY,
  temperatureMax: null,
  temperatureMin: null,
  windMax: null,
  rainProbability: null,
}

/** The reply the unit guard must refuse: the request's units were ignored. */
const METRIC = { ...RAINY, temperatureUnit: '°C', windUnit: 'km/h' }

/**
 * Seed ONE post in TODAY's section through /new. The date field is deliberately
 * left alone: /new opens on today + the next 30-minute slot, and today's section
 * is the ONLY place the chip renders (FeedPage gates `rainLabel`/`rainForecast`
 * on `isToday`).
 */
async function seedTodayPost(page: Page, title: string): Promise<void> {
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill('E2E weather lot')
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
}

/** The card for a title (the card itself is the `<Link>` that must not win the tap). */
function cardFor(page: Page, title: string) {
  return page.locator('a').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
}

test.describe.configure({ retries: 1 })

test.afterEach(async () => {
  // Best-effort, TITLE-SCOPED cleanup (never a sweep of the marker's other rows):
  // delete this spec's post with the marker's own JWT (the host-only DELETE policy).
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const query =
      `${url}/rest/v1/playdates?host_profile_id=eq.${userId}` +
      `&title=like.${encodeURIComponent('e2e*weather*')}&select=id`
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    const del = await fetch(query, { method: 'DELETE', headers })
    console.log(
      del.ok
        ? `[e2e weather cleanup] ok — deleted this spec's marker post(s) (host ${userId})`
        : `[e2e weather cleanup] FAILED — HTTP ${del.status} (orchestrator sweep picks up e2e- rows)`,
    )
  } catch (err) {
    console.log(
      `[e2e weather cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})

test('the rain chip opens THAT event’s forecast in place — the tap never leaves the feed', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} weather chip`
  // The forecast is mocked for EVERY Open-Meteo call this page makes, installed
  // BEFORE the feed ever mounts (the seeding below ends on `/`) — and the URL is
  // kept, so the request's grounded shape is asserted too, not just its effect.
  const requested: string[] = []
  await page.route(OPEN_METEO, (route) => {
    requested.push(route.request().url())
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: forecastPayload(RAINY),
    })
  })

  await seedTodayPost(page, title)
  // A fresh load so the feed's weather effect certainly runs against the mock
  // (and so the wrapper's module cache starts empty).
  await page.goto('/')
  await settleOnRoute(page, '/')

  const card = cardFor(page, title)
  await expect(card).toBeVisible()
  const chip = card.getByTestId('weather-chip')
  // NON-VACUITY: the chip must genuinely be on screen before the tap is asserted.
  await expect(chip).toHaveCount(1)
  await expect(chip).toHaveAttribute('aria-expanded', 'false')

  const feedUrl = page.url()
  await chip.click()

  // THE ASSERTION THIS SPEC EXISTS FOR, FIRST so a regression NAMES its cause:
  // the card is a `<Link>`, so without the handler's `preventDefault()` this tap
  // navigates to /playdate/<id> and the failure reads
  // `expected http://localhost:4199/ received http://localhost:4199/playdate/…`
  // rather than a generic "element not found".
  await expect(page).toHaveURL(feedUrl)

  // The disclosure opened…
  await expect(chip).toHaveAttribute('aria-expanded', 'true')
  const panel = card.getByTestId('weather-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('High 61° · Low 49°')
  await expect(panel).toContainText('Rain 92%')
  await expect(panel).toContainText('Wind 25 mph')
  // …showing THAT event's window (the card's own time line)…
  // `feed.formatTimeWindow` drops ":00", so the window can be "10 PM–11 PM" —
  // the minutes are optional in this pattern on purpose.
  await expect(panel).toContainText(/When\s+\d{1,2}(:\d{2})?\s?(AM|PM)/)
  // …with the API's OWN unit label never printed (it is "mp/h"; the UI says mph).
  await expect(panel).not.toContainText('mp/h')
  await expect(panel).not.toContainText('km/h')

  // The request the app actually built (G2/G3 of research/open-meteo-daily.md):
  // the underscored modern wind name, Fahrenheit and mph, and NEVER the legacy
  // `windspeed_10m_max` alias.
  expect(requested.length).toBeGreaterThan(0)
  const called = new URL(requested[0])
  expect(called.searchParams.get('daily')).toContain('wind_speed_10m_max')
  expect(called.searchParams.get('daily')).not.toContain('windspeed_10m_max')
  expect(called.searchParams.get('temperature_unit')).toBe('fahrenheit')
  expect(called.searchParams.get('wind_speed_unit')).toBe('mph')

  // MEASURED LAYOUT (the `min-h-11` chip + the `basis-full` panel inside the
  // card's badge cluster): the panel must sit INSIDE the card's box, so it can be
  // neither clipped nor overlapping the card below it. The numbers are logged for
  // the slice report.
  const chipBox = await chip.boundingBox()
  const panelBox = await panel.boundingBox()
  const cardBox = await card.boundingBox()
  console.log(
    `[weather layout] chip=${JSON.stringify(chipBox)} panel=${JSON.stringify(panelBox)} ` +
      `card=${JSON.stringify(cardBox)} viewport=${JSON.stringify(page.viewportSize())}`,
  )
  expect(panelBox).not.toBeNull()
  expect(cardBox).not.toBeNull()
  expect(chipBox).not.toBeNull()
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1)
  expect(panelBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1)
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1)
  // The panel is BELOW the chip it belongs to, never over it.
  expect(panelBox!.y).toBeGreaterThanOrEqual(chipBox!.y + chipBox!.height - 1)
})

test('with nothing to show, the chip is the plain non-interactive badge — never a dead button', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} weather none`

  // ONE route for all three phases, reading a mutable payload: re-registering a
  // handler for the same matcher did NOT reliably replace the previous one (the
  // same-matcher unroute/route swap left the first payload serving), and a route
  // cannot be "the current state" if two of them disagree.
  let payload = forecastPayload(SPARSE)
  await page.route(OPEN_METEO, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: payload }),
  )

  // PHASE A — SPARSE: the probability alone. This is the null-panel case
  // production can actually reach: `rainBadgeLabel` fires (so the badge the app
  // always shipped is on screen), while `weatherPanelFor` refuses to build a
  // panel out of one fact. Note what this means: the reviewer's "all-null reply +
  // the badge still renders" cannot both hold, because the badge text IS derived
  // from the probability — so the non-interactive state is this one, and the
  // all-null state is phase B.
  await seedTodayPost(page, title)
  await page.goto('/')
  await settleOnRoute(page, '/')

  const card = cardFor(page, title)
  await expect(card).toBeVisible()
  // The badge is there (non-vacuity for the "no chip" assertion below)…
  await expect(card.getByText('Rain likely')).toBeVisible()
  // …and it is NOT a button opening an empty panel.
  await expect(card.getByTestId('weather-chip')).toHaveCount(0)
  await expect(card.getByTestId('weather-panel')).toHaveCount(0)

  // PHASE B — ALL NULL: no usable reply at all, so there is not even a badge.
  payload = forecastPayload(ALL_NULL)
  await page.goto('/')
  await settleOnRoute(page, '/')
  await expect(card).toBeVisible()
  await expect(card.getByText('Rain likely')).toHaveCount(0)
  await expect(card.getByTestId('weather-chip')).toHaveCount(0)
  await expect(card.getByTestId('weather-panel')).toHaveCount(0)

  // PHASE C — METRIC: the API ignored the unit parameters. The unit guard refuses
  // the reply, so NO number is ever printed as °F / mph (a missing chip is the
  // designed absence; a wrong number would be a product defect).
  payload = forecastPayload(METRIC)
  await page.goto('/')
  await settleOnRoute(page, '/')
  await expect(card).toBeVisible()
  await expect(card.getByText('Rain likely')).toHaveCount(0)
  await expect(card.getByTestId('weather-chip')).toHaveCount(0)
})
