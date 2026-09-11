/**
 * Regenerate the iOS startup images (the native half of the V4 splash).
 *
 * V7: rendered with a real browser instead of rsvg-convert.
 *
 * rsvg resolves fonts through fontconfig, and this app's brand face is NOT
 * installed system-wide — it is a self-hosted woff2 in public/fonts/ that only
 * the app itself loads. So rsvg painted the wordmark in whatever fontconfig fell
 * back to (Liberation Sans on this machine), which meant the launch frame
 * changed TYPEFACE the instant the web splash took over — a worse artifact than
 * having no wordmark at all. Chromium loads the app's own woff2 (inlined as a
 * data URL, so there is no file:// origin problem), so these images are now the
 * same frame the app paints.
 *
 * SIZES COME FROM THE APP, not from a ratio of the screen: mark 112px, wordmark
 * 32px/40px, a 16px gap, on the brand field. Those are the exact numbers in
 * src/components/SplashScreen.tsx and in the boot splash in index.html. If one
 * changes, change all three — that is what keeps the launch frames continuous
 * instead of a series of small jumps.
 *
 * The <link rel="apple-touch-startup-image"> tags in index.html must list the
 * SAME sizes — this script prints them so the two never drift.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// [css width, css height, device pixel ratio]
const SIZES = [
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 2],
  [375, 667, 2],
  [768, 1024, 2],
]

/** The mark, mono variant — everything white, depth from opacity. Identical
 *  geometry to src/components/DropInMark.tsx (variant="mono"). */
const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g fill="#ffffff">
        <circle cx="15" cy="21" r="10"/>
        <circle cx="23" cy="26" r="6.5" fill-opacity=".75"/>
        <rect x="12.5" y="28" width="5" height="18" rx="2.5"/>
        <rect x="28" y="12" width="14" height="9" rx="4.5"/>
      </g>
      <g stroke="#ffffff" stroke-linecap="round" fill="none">
        <path d="M38 19 L51 41" stroke-width="8.5"/>
        <path d="M31.5 22 L31.5 45 M37.5 22 L37.5 45" stroke-width="3.6"/>
        <path d="M31.5 30 L37.5 30 M31.5 37.5 L37.5 37.5" stroke-width="3"/>
      </g>
      <rect x="7" y="48" width="50" height="6.5" rx="3.25" fill="#ffffff" fill-opacity=".45"/>
    </svg>`

/**
 * Playwright's own default browser resolution expects `chrome-linux/chrome`,
 * which is not where current builds live (`chrome-linux64/`,
 * `chrome-headless-shell-linux64/`), so on this machine an explicit path is
 * required. Walk the cache rather than guess a directory name per release, and
 * let an env var override it for other machines/CI.
 */
function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH
  const cache = join(homedir(), '.cache', 'ms-playwright')
  if (!existsSync(cache)) return null
  const wanted = new Set(['chrome', 'chrome-headless-shell', 'headless_shell'])
  const found = []
  const walk = (dir, depth) => {
    if (depth > 3) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path, depth + 1)
      else if (wanted.has(entry.name)) found.push(path)
    }
  }
  for (const entry of readdirSync(cache, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('chromium')) walk(join(cache, entry.name), 0)
  }
  // Prefer the HEADLESS SHELL. It is what Playwright itself drives for headless
  // runs, and the full chromium build additionally wants a crashpad database
  // that a locked-down environment may refuse ("chrome_crashpad_handler:
  // --database is required") — which is exactly how the first attempt at this
  // script failed.
  return (
    found.find((path) => path.endsWith('/chrome-headless-shell')) ??
    found.find((path) => path.endsWith('/headless_shell')) ??
    found.find((path) => path.endsWith('/chrome')) ??
    null
  )
}

const fontB64 = readFileSync(join(root, 'public/fonts/bricolage-grotesque-latin.woff2')).toString(
  'base64',
)

const page = (w, h) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face {
    font-family: 'Bricolage Grotesque';
    font-style: normal;
    font-weight: 400 800;
    font-display: block;
    src: url(data:font/woff2;base64,${fontB64}) format('woff2');
  }
  html, body { margin: 0; padding: 0; }
  /* The app's splash is laid out by Tailwind, whose preflight zeroes margins.
     Without this reset a bare <p> keeps its default 1em top/bottom margin and
     the wordmark lands ~32px lower here than in the app — measured, not
     guessed: it is exactly how the first version of this script was wrong. */
  * { margin: 0; padding: 0; }
  body {
    width: ${w}px; height: ${h}px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 16px;
    background: #e8552f;
    -webkit-font-smoothing: antialiased;
  }
  svg { width: 112px; height: 112px; display: block; }
  .wordmark {
    font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
    font-weight: 700; font-size: 32px; line-height: 40px; color: #ffffff;
  }
</style></head>
<body>
  ${MARK}
  <p class="wordmark">Drop In</p>
</body></html>`

const executablePath = findChromium()
if (executablePath === null) {
  console.error(
    'No chromium found. Install it with `npx playwright install chromium`, or point\n' +
      'PLAYWRIGHT_CHROMIUM_PATH at a chrome binary.',
  )
  process.exit(1)
}

mkdirSync(join(root, 'public/splash'), { recursive: true })
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })

for (const [w, h, dpr] of SIZES) {
  const shot = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: dpr,
  })
  await shot.setContent(page(w, h), { waitUntil: 'load' })
  // font-display:block holds the text invisible until the face is ready; this
  // waits for that, so no image is ever written with the fallback face in it.
  await shot.evaluate(() => document.fonts.ready)
  // ...and then ASSERT it, because "waited for fonts" is not the same as "the
  // brand face is the one in use" — a typo in the @font-face, or a data URL the
  // browser refuses, would still resolve fonts.ready and silently write eight
  // launch images in a fallback face. That failure is invisible in a screenshot
  // diff and obvious to a user watching the app start, so it fails here instead.
  const brandFace = await shot.evaluate(() =>
    document.fonts.check("700 32px 'Bricolage Grotesque'"),
  )
  if (!brandFace) {
    await browser.close()
    console.error(
      "The brand font did not load, so the wordmark would render in a fallback face.\n" +
        'Check that public/fonts/bricolage-grotesque-latin.woff2 exists and is a valid woff2.',
    )
    process.exit(1)
  }
  await shot.screenshot({ path: join(root, `public/splash/${w * dpr}x${h * dpr}.png`) })
  await shot.close()
  console.log(`  ${w * dpr}x${h * dpr}.png`)
}

await browser.close()

console.log('\nindex.html tags:\n')
for (const [w, h, dpr] of SIZES) {
  console.log(
    `    <link\n      rel="apple-touch-startup-image"\n      href="/splash/${w * dpr}x${h * dpr}.png"\n      media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr})"\n    />`,
  )
}
