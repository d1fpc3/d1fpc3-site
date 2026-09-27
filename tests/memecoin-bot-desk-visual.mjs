// Memecoin bot desk audit (manual, not a node:test).
//   node tests/memecoin-bot-desk-visual.mjs        (OUT / EMAIL / PORT / URL_BASE env)
// Serves the repo itself (or URL_BASE for production), signs in as the owner by minting a magic
// link with the service key, opens /echelon/admin/memecoin-bot/ at 2560 / 1440 / 390 in both
// themes, clicks every filter in the segmented control, opens the backtest, and reports cards,
// rows, horizontal overflow, console errors and whether the control's thumb tracks the active
// button. Also proves the tables are closed to anonymous readers. Read-only against the database.
import { createRequire } from 'module'
import { createServer } from 'http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname, normalize } from 'path'

const require = createRequire(import.meta.url)
const PW_PATHS = [
  'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright',
  'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright',
]
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')

const ROOT = join(import.meta.dirname, '..')
const OUT = process.env.OUT || `${tmpdir()}/memecoin-bot-desk`
const PORT = Number(process.env.PORT || 8124)
mkdirSync(OUT, { recursive: true })

let server = null
let BASE = process.env.URL_BASE
if (!BASE) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
  server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0])
    if (p.endsWith('/')) p += 'index.html'
    const file = join(ROOT, normalize(p).replace(/^([/\\])+/, ''))
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
  BASE = `http://127.0.0.1:${PORT}`
}
const URL = `${BASE}/echelon/admin/memecoin-bot/`

const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const email = process.env.EMAIL || 'd1fpc3@gmail.com'
const mgmt = process.env.SUPABASE_ACCESS_TOKEN
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.type === 'secret').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const publishable = keys.find((k) => k.type === 'publishable').api_key
const findings = []

// Privacy: the anonymous key must read nothing from either table.
for (const t of ['memecoin_bot_trades', 'memecoin_bot_reports']) {
  const r = await fetch(`${SB}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: publishable, Authorization: `Bearer ${publishable}` } })
  const body = await r.text()
  const leaked = r.ok && body.trim() !== '[]'
  console.log(`anon read ${t}: HTTP ${r.status} ${leaked ? 'LEAK ' + body.slice(0, 80) : 'closed'}`)
  if (leaked) findings.push(`anon can read ${t}`)
}

const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed: ' + JSON.stringify(session).slice(0, 200))

const VP = {
  wide: { viewport: { width: 2560, height: 1400 }, deviceScaleFactor: 1 },
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
const browser = await chromium.launch()

// Anonymous visit: the gate, never the desk.
{
  const ctx = await browser.newContext(VP.desk)
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#gate:not([hidden])', { timeout: 20000 }).catch(() => findings.push('anon: gate never showed'))
  const appVisible = await page.evaluate(() => !document.getElementById('app').hidden)
  console.log(`anon page: gate shown, app ${appVisible ? 'VISIBLE' : 'hidden'}`)
  if (appVisible) findings.push('anon: app visible')
  await page.screenshot({ path: `${OUT}/anon-gate.png` })
  await ctx.close()
}

for (const theme of ['dark', 'light']) {
  for (const [name, cfg] of Object.entries(VP)) {
    const ctx = await browser.newContext({ ...cfg, colorScheme: theme })
    await ctx.addInitScript(([k, v, th]) => { localStorage.setItem(k, v); localStorage.setItem('echelon-theme', th) }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme])
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
    const t0 = Date.now()
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.card .ret', { timeout: 30000 }).catch(() => findings.push(`${theme}/${name}: no strategy cards`))
    const firstPaint = Date.now() - t0
    await page.waitForTimeout(900) // count-up and entrance settle
    const info = await page.evaluate(() => ({
      cards: document.querySelectorAll('.card').length,
      who: document.querySelectorAll('#who tr').length,
      tools: document.querySelectorAll('#tools tr').length,
      trades: document.querySelectorAll('#trades tr').length,
      findings: document.querySelectorAll('.finding').length,
      pnl: document.getElementById('hero-pnl').textContent.trim(),
      workers: [...document.querySelectorAll('.w')].map((w) => w.textContent.trim()).join(', '),
      fresh: document.getElementById('fresh').textContent,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    await page.screenshot({ path: `${OUT}/${theme}-${name}-top.png` })
    await page.screenshot({ path: `${OUT}/${theme}-${name}-full.png`, fullPage: true })

    // Walk the segmented control: the thumb must sit under the pressed button every time.
    const segIds = await page.$$eval('#seg button', (bs) => bs.map((b) => b.dataset.id))
    let thumbOff = 0
    for (const id of segIds) {
      await page.click(`#seg button[data-id="${id}"]`)
      await page.waitForTimeout(340)
      const d = await page.evaluate(() => {
        const on = document.querySelector('#seg button[aria-pressed="true"]').getBoundingClientRect()
        const th = document.getElementById('thumb').getBoundingClientRect()
        return Math.abs(on.left - th.left) + Math.abs(on.width - th.width)
      })
      thumbOff = Math.max(thumbOff, d)
    }
    await page.click('#seg button[data-id="all"]')
    await page.click('#bt summary')
    await page.waitForTimeout(300)
    const btLines = await page.evaluate(() => document.getElementById('bt-text').textContent.split('\n').length)
    if (name !== 'wide') await page.screenshot({ path: `${OUT}/${theme}-${name}-backtest.png`, fullPage: true })

    console.log(`${theme}/${name}: first cards ${firstPaint} ms, cards ${info.cards}, who ${info.who}, tools ${info.tools}, trades ${info.trades}, findings ${info.findings}, backtest ${btLines} lines, P&L "${info.pnl}", thumb off ${thumbOff.toFixed(1)} px, overflow ${info.overflow}px | ${info.fresh} | ${info.workers}`)
    if (info.overflow > 1) findings.push(`${theme}/${name}: page scrolls sideways by ${info.overflow}px`)
    if (thumbOff > 2) findings.push(`${theme}/${name}: segmented thumb off by ${thumbOff.toFixed(1)}px`)
    if (!info.cards) findings.push(`${theme}/${name}: no cards`)
    for (const e of errors) findings.push(`${theme}/${name}: ${e}`)
    await ctx.close()
  }
}
await browser.close()
server?.close()
console.log(findings.length ? 'FINDINGS:\n  ' + findings.join('\n  ') : 'CLEAN')
console.log('screens in', OUT)
