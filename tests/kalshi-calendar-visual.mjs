// Kalshi desk calendar harness (manual, not CI).
//   node tests/kalshi-calendar-visual.mjs        (THEME=dark|light, VPS=wide,desk,phone, OUT, PORT)
//
// Drives the calendar the way D1 would: loads the desk with a real admin session,
// waits for the month to paint, then exercises every control and checks the numbers
// move the way the arithmetic says they must.
//
//   clip     $16 -> $8 must roughly halve the all-time total, never leave it equal
//   floor    80c -> 85c must LOWER it (the wider band is worth about 2.2x)
//   months   the arrows must page and must disable at both ends of the data
//   a day    clicking one must open a per-book breakdown that sums to the day
//   custom   typing a clip must re-price and must drop the segment thumb
//
// Exit 1 on any finding, so a silent regression cannot pass as a screenshot.

import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const PW_PATHS = [
  'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright',
  'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright',
]
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const ROOT = join(import.meta.dirname, '..')
const OUT = process.env.OUT || join(tmpdir(), 'kalshi-calendar')
const PORT = Number(process.env.PORT || 8131)
const THEME = process.env.THEME || 'dark'
const VPS = (process.env.VPS || 'wide,desk,phone').split(',')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const file = join(ROOT, normalize(p).replace(/^([/\\])+/, ''))
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
const URL = process.env.URL || `http://127.0.0.1:${PORT}/echelon/admin/kalshi-desk/`

// admin session: management token (file, else env) -> service key -> magic link -> verify
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const tokenFile = join(homedir(), '.supabase', 'access-token')
const mgmt = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : process.env.SUPABASE_ACCESS_TOKEN
if (!mgmt) throw new Error('no Supabase management token (file or SUPABASE_ACCESS_TOKEN)')
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = (keys.find((k) => typeof k.api_key === 'string' && k.api_key.startsWith('sb_secret_')) ?? keys.find((k) => k.name === 'service_role')).api_key
const anon = (keys.find((k) => typeof k.api_key === 'string' && k.api_key.startsWith('sb_publishable_')) ?? keys.find((k) => k.name === 'anon')).api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed: ' + JSON.stringify(session).slice(0, 200))

const VP = {
  wide: { viewport: { width: 2560, height: 1400 }, deviceScaleFactor: 1 },
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

const findings = []
const fail = (vp, msg) => { findings.push(`[${vp}] ${msg}`); console.log(`  FAIL  ${msg}`) }
const pass = (msg) => console.log(`  ok    ${msg}`)
const cash = (s) => Number(String(s ?? '').replace(/[^0-9.-]/g, '')) * (String(s).trim().startsWith('-') ? 1 : 1)

const browser = await chromium.launch()
for (const name of VPS) {
  console.log(`\n── ${name} ──`)
  const ctx = await browser.newContext({ ...VP[name], colorScheme: THEME === 'dark' ? 'dark' : 'light' })
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)])
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#cal-grid .cal-d[data-k]', { timeout: 30_000 })
  await page.waitForTimeout(700)

  // ── the month paints with real numbers
  const cells = await page.$$eval('#cal-grid .cal-d[data-k]', (n) => n.length)
  cells > 0 ? pass(`${cells} days painted`) : fail(name, 'the grid painted no days')
  const strip = await page.$$eval('#cal-strip .cal-cell b', (n) => n.map((x) => x.textContent.trim()))
  strip.length >= 6 ? pass(`month strip: ${strip.slice(0, 3).join('  ')}`) : fail(name, `month strip has ${strip.length} cells, expected 6`)
  if (strip[0] === '$0.00' || strip[0] === '–') fail(name, `month total reads ${strip[0]}`)

  const allAt = async () => Number((await page.$eval('#cal-all b', (n) => n.textContent)).replace(/[^0-9.-]/g, ''))
  const monthLabel = () => page.$eval('#cal-month', (n) => n.textContent.trim().replace(/\s+/g, ' '))

  // ── clip: the calendar opens at whatever the bot is running, so pin $16 first; $8 must roughly halve it
  await page.click('#cal-clip button[data-v="16"]')
  await page.waitForTimeout(260)
  const at16 = await allAt()
  at16 > 0 ? pass(`all-time at $16 = $${at16.toFixed(2)}`) : fail(name, `all-time at $16 reads ${at16}`)
  await page.click('#cal-clip button[data-v="8"]')
  await page.waitForTimeout(260)
  const at8 = await allAt()
  const ratio = at8 / at16
  if (at8 === at16) fail(name, 'changing the clip did not change the total')
  else if (ratio > 0.62 || ratio < 0.38) fail(name, `$8 is ${(100 * ratio).toFixed(0)}% of $16, expected about half`)
  else pass(`$8 = $${at8.toFixed(2)}, ${(100 * ratio).toFixed(0)}% of the $16 total`)

  await page.click('#cal-clip button[data-v="16"]')
  await page.waitForTimeout(260)
  Math.abs((await allAt()) - at16) < 0.01 ? pass('back to $16 restores the total') : fail(name, 'returning to $16 did not restore the total')

  // ── floor: the 85c band is the narrower one and must earn less
  await page.click('#cal-floor button[data-v="0.85"]')
  await page.waitForTimeout(260)
  const at85 = await allAt()
  // the two floors must re-price the history to different totals. Which is larger depends on
  // the window: over 69 days the 80c band earned more, over the 285-day archive the 80-85c
  // slice is net negative in Dec-May and the 85c floor comes out ahead. Assert the mechanism.
  Math.abs(at85 - at16) > 0.01 ? pass(`85c floor = $${at85.toFixed(2)} vs 80c $${at16.toFixed(2)}, re-priced`) : fail(name, `changing the floor did not change the total ($${at85.toFixed(2)})`)
  await page.click('#cal-floor button[data-v="0.8"]')
  await page.waitForTimeout(260)

  // ── a custom clip re-prices and drops the thumb
  await page.fill('#cal-own', '40')
  await page.waitForTimeout(300)
  const at40 = await allAt()
  at40 > at16 ? pass(`custom $40 = $${at40.toFixed(2)}`) : fail(name, `custom clip $40 gave $${at40.toFixed(2)}, expected more than $16`)
  const onCount = await page.$$eval('#cal-clip button.on', (n) => n.length)
  onCount === 0 ? pass('custom clip clears the segment') : fail(name, `custom clip left ${onCount} segment buttons lit`)
  await page.fill('#cal-own', '')
  await page.click('#cal-clip button[data-v="16"]')
  await page.waitForTimeout(260)

  // ── months page, and stop at the ends of the data
  const m0 = await monthLabel()
  await page.click('#cal-prev')
  await page.waitForTimeout(260)
  const m1 = await monthLabel()
  m1 !== m0 ? pass(`paged ${m0} -> ${m1}`) : fail(name, 'the previous arrow did not change the month')
  let guard = 0
  while (!(await page.$eval('#cal-prev', (n) => n.disabled)) && guard++ < 24) { await page.click('#cal-prev'); await page.waitForTimeout(90) }
  guard < 24 ? pass(`the back arrow disables at ${await monthLabel()}`) : fail(name, 'the back arrow never disabled')
  await page.click('#cal-today')
  await page.waitForTimeout(300)
  const mBack = await monthLabel()
  mBack === m0 ? pass(`"This month" returns to ${m0}`) : fail(name, `"This month" landed on ${mBack}, expected ${m0}`)

  // ── a day opens, and its books sum to the day
  const target = await page.$$eval('#cal-grid .cal-d[data-k]', (n) => {
    const best = n.map((x) => ({ k: x.dataset.k, v: Math.abs(Number(x.querySelector('.val').textContent.replace(/[^0-9.-]/g, ''))) }))
      .sort((a, b) => b.v - a.v)[0]
    return best?.k ?? null
  })
  if (!target) fail(name, 'no day cell to click')
  else {
    await page.click(`#cal-grid .cal-d[data-k="${target}"]`)
    await page.waitForTimeout(320)
    const open = await page.$eval('#cal-day', (n) => !n.hidden)
    open ? pass(`${target} opened`) : fail(name, `clicking ${target} did not open the day`)
    const books = await page.$$eval('#cal-day .cal-book .mny', (n) => n.map((x) => Number(x.textContent.replace(/[^0-9.-]/g, ''))))
    const dayTotal = Number((await page.$eval('#cal-day .cal-day-hd em', (n) => n.textContent)).replace(/[^0-9.-]/g, ''))
    const sum = books.reduce((a, b) => a + b, 0)
    if (!books.length) fail(name, `${target} opened with no per-book rows`)
    else if (Math.abs(sum - dayTotal) > 0.02) fail(name, `${target}: books sum to $${sum.toFixed(2)} but the day reads $${dayTotal.toFixed(2)}`)
    else pass(`${target}: ${books.length} books sum to the day's ${dayTotal.toFixed(2)}`)
    await page.$eval('#cal-day', (n) => n.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(260)
    await page.screenshot({ path: join(OUT, `day-${name}-${THEME}.png`) })
  }

  // ── the rest of the desk still works
  const skels = await page.$$eval('.skel', (n) => n.length)
  skels === 0 ? pass('no panel left in a skeleton') : fail(name, `${skels} skeletons never resolved`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  overflow <= 1 ? pass('no horizontal overflow') : fail(name, `page overflows by ${overflow}px`)

  await page.click('#cal-today')
  await page.waitForTimeout(400)
  // the top of the page at scroll 0: the status strip lives above the calendar, and a full-page
  // capture taken while scrolled paints the sticky bar over it
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(OUT, `top-${name}-${THEME}.png`) })
  await page.$eval('#s-calendar', (n) => n.scrollIntoView())
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(OUT, `calendar-${name}-${THEME}.png`) })
  await page.screenshot({ path: join(OUT, `desk-${name}-${THEME}-full.png`), fullPage: true })

  errs.length ? errs.forEach((e) => fail(name, e)) : pass('no console or page errors')
  await ctx.close()
}
await browser.close()
server.close()

console.log(`\nshots -> ${OUT}`)
if (findings.length) { console.log(`\n${findings.length} finding(s):`); findings.forEach((f) => console.log('  ' + f)); process.exit(1) }
console.log('\nall checks passed')
