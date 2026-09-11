/**
 * Design preview (V6): accent candidates + heading typefaces, rendered on the
 * REAL feed with a seeded marker — screenshots, not swatches.
 *
 * Tailwind v4 emits each palette step as a theme variable and the utilities
 * reference it (--color-indigo-600 -> .bg-indigo-600{background-color:var(...)}),
 * so a candidate is a :root override with no source edits. That is also the
 * shape the real change will take.
 */
import { chromium } from '@playwright/test'
const BASE = 'http://127.0.0.1:4173'
const OUT = process.env.OUT ?? '.scratch/v4'
const epoch = Math.floor(Date.now() / 1000)

const ACCENTS = {
  indigo_current: null, // the shipped palette, for comparison
  coral: { 50:'#fef4f1',100:'#fde7e1',200:'#f9cabc',300:'#f3a791',400:'#e97c5f',500:'#dd5c39',600:'#c9492b',700:'#a63b23',900:'#6f2717' },
  ochre: { 50:'#fdf8ed',100:'#faedd0',200:'#f4d99c',300:'#ecc063',400:'#e3a52f',500:'#cf8914',600:'#ad7010',700:'#87560f',900:'#543509' },
  blue:  { 50:'#eff5ff',100:'#dbe8fe',200:'#bfd7fe',300:'#93bbfd',400:'#6096fa',500:'#3b76f6',600:'#2557eb',700:'#1d44d8',900:'#1c3694' },
}

const FONTS = {
  system_current: null,
  fraunces: { family: 'Fraunces', url: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap' },
  bricolage: { family: 'Bricolage Grotesque', url: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&display=swap' },
  nunito: { family: 'Nunito', url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&display=swap' },
}

const scaleCss = (scale) => Object.entries(scale).map(([k, v]) => `--color-indigo-${k}:${v};`).join('')
const accentCss = (scale) => (scale === null ? '' : `:root{${scaleCss(scale)}}`)
const fontCss = (font) =>
  font === null
    ? ''
    : `h1, h2, h3, .font-display { font-family: '${font.family}', var(--font-sans, system-ui), sans-serif; letter-spacing: -0.01em; }`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const settle = async (p) => { await p.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 12000 }).catch(() => {}) }

// --- seed a signed-in marker (feed needs a session) ----------------------
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await settle(page)
await page.getByRole('button', { name: 'New here? Create an account' }).click()
await page.locator('input[autocomplete="nickname"]').fill(`e2e-${epoch}`)
await page.locator('input[type="email"]').fill(`e2e-${epoch}@gmail.com`)
await page.locator('input[type="password"]').fill(`e2e-pw-${epoch}`)
await page.getByRole('button', { name: 'Create account' }).click()
await page.getByRole('heading', { name: 'Set your location' }).waitFor({ timeout: 60000 })
await page.getByPlaceholder('e.g. 98107').fill('98103')
await page.locator('select').first().selectOption({ label: '5 miles' })
await page.getByRole('button', { name: /^Continue/ }).click()
await page.getByRole('heading', { name: 'Near you' }).waitFor({ timeout: 60000 })
await ctx.storageState({ path: `${OUT}/marker-state.json` })

// --- one page per candidate ---------------------------------------------
async function shot(name, css) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: `${OUT}/marker-state.json` })
  const p = await c.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await settle(p)
  if (css !== '') await p.addStyleTag({ content: css })
  await p.waitForTimeout(1800)
  await p.screenshot({ path: `${OUT}/preview-${name}.png` })
  await c.close()
  console.log('shot', name)
}

for (const [name, scale] of Object.entries(ACCENTS)) {
  await shot(`accent-${name}`, accentCss(scale))
}
for (const [name, font] of Object.entries(FONTS)) {
  if (font !== null) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: `${OUT}/marker-state.json` })
    const p = await c.newPage()
    await p.goto(BASE + '/', { waitUntil: 'networkidle' })
    await p.addStyleTag({ url: font.url })
    await p.addStyleTag({ content: fontCss(font) })
    await p.waitForTimeout(2500)
    await p.screenshot({ path: `${OUT}/preview-font-${name}.png` })
    await c.close()
    console.log('shot font', name)
  }
}

console.log('MARKER', `e2e-${epoch}@gmail.com`)
await browser.close()
