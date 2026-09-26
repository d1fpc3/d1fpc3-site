// Kalshi desk visual harness (manual, not CI).
//   node tests/kalshi-desk-visual.mjs        (THEME=dark|light, VPS=wide,desk,phone, OUT, PORT env)
//
// Signs in as the admin with a minted magic link, loads /echelon/admin/kalshi-desk/ at three
// widths, waits for every panel to leave its skeleton, screenshots the top and the
// full page, and reports page overflow, leftover skeletons, empty required panels and
// console errors. Exit 1 on any finding. Same session recipe as memecoins-desk-visual.

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
const OUT = process.env.OUT || join(tmpdir(), 'kalshi-desk')
const PORT = Number(process.env.PORT || 8129)
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
// /echelon/admin/kalshi/ has never existed here: the desk publishes to kalshi-desk/. Pointed
// at the old path this harness loaded a 404 and reported every panel as empty, which reads
// exactly like a broken desk.
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
const browser = await chromium.launch()
const findings = []
for (const name of VPS) {
  const ctx = await browser.newContext({ ...VP[name], colorScheme: THEME === 'dark' ? 'dark' : 'light' })
  await ctx.addInitScript(([k, v, theme]) => { localStorage.setItem(k, v); localStorage.setItem('echelon-theme', theme) }, [`sb-${REF}-auth-token`, JSON.stringify(session), THEME])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })

  // past the gate and every panel populated: no skeletons left, pulse resolved
  const loaded = await page.waitForFunction(() =>
    document.getElementById('gate')?.hidden === true &&
    !/Checking/.test(document.getElementById('pulse-text')?.textContent || '') &&
    document.querySelectorAll('.skel').length === 0, null, { timeout: 25000 }).then(() => true).catch(() => false)
  if (!loaded) findings.push(`${name}: page did not finish loading (gate hidden: ${await page.evaluate(() => document.getElementById('gate')?.hidden)}, skeletons: ${await page.evaluate(() => document.querySelectorAll('.skel').length)}, pulse: "${await page.evaluate(() => document.getElementById('pulse-text')?.textContent)}")`)
  await page.waitForTimeout(1100) // the calendar and the sparklines settle

  // The panels this used to measure (hero-chart, coverage, cells, weights, e-pnl) were
  // deleted in "out with the model-era panels". It went on asking for them for weeks without
  // anyone noticing, because it was loading a 404 the whole time and every panel reads empty
  // on a 404. What follows is the desk that exists: status strip, calendar, the rule, calls,
  // research, index, engine room.
  const m = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    pulse: document.getElementById('pulse-text')?.textContent,
    pulseClass: document.getElementById('pulse')?.className,
    liveRows: document.querySelectorAll('#live tbody .ser').length,
    tickRows: document.querySelectorAll('#ticks tbody tr').length,
    calDays: document.querySelectorAll('#cal-grid [data-k]').length,
    ruleRows: document.querySelectorAll('#rules tbody tr, #rules .row').length,
    botRows: document.querySelectorAll('#bots tbody tr, #bots .row').length,
    researchRows: document.querySelectorAll('#research tbody tr, #research .row').length,
    // the six answers along the top: every one of them should read something
    status: ['st-bot', 'st-today', 'st-win', 'st-edge', 'st-next', 'st-bal'].map((id) => (document.getElementById(id)?.textContent || '').trim()),
    sections: [...document.querySelectorAll('.panel[id^="s-"]')].map((p) => p.id),
    // a panel that is present but rendered nothing at all is the failure this catches
    blank: [...document.querySelectorAll('.panel[id^="s-"]')].filter((p) => (p.textContent || '').replace(/\s+/g, '').length < 40).map((p) => p.id),
    refresh: document.getElementById('refresh-age')?.textContent,
  }))
  const dashes = m.status.filter((v) => !v || v === '–').length
  if (m.overflow > 0) findings.push(`${name}: horizontal page overflow ${m.overflow}px`)
  if (!m.liveRows) findings.push(`${name}: live board has no rows`)
  if (!m.tickRows) findings.push(`${name}: collector table empty`)
  if (!m.calDays) findings.push(`${name}: the calendar drew no days`)
  if (dashes > 2) findings.push(`${name}: ${dashes} of 6 status cells never filled in: ${m.status.join(' / ')}`)
  if (m.blank.length) findings.push(`${name}: panel(s) rendered nothing at all: ${m.blank.join(', ')}`)
  if (!m.refresh || m.refresh === ' ') findings.push(`${name}: the bar never said how old the numbers are`)
  if (errors.length) findings.push(`${name}: ${errors.length} page/console errors: ${errors.slice(0, 3).join(' | ')}`)
  console.log(`${name}: pulse "${m.pulse}" [${m.pulseClass}] · live ${m.liveRows} · ticks ${m.tickRows} · calendar ${m.calDays} days · rules ${m.ruleRows} · bots ${m.botRows} · research ${m.researchRows} · updated ${m.refresh}`)
  console.log(`  status: ${m.status.join(' / ')}`)
  console.log(`  sections: ${m.sections.join(' ')}`)

  await page.screenshot({ path: join(OUT, `${name}-${THEME}-top.png`) })
  await page.screenshot({ path: join(OUT, `${name}-${THEME}-full.png`), fullPage: true })
  // one hover: a day on the calendar, to see the tooltip
  const cell = page.locator('#cal-grid button[data-k]').first()
  if (await cell.count() && name !== 'phone') {
    await cell.hover()
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(OUT, `${name}-${THEME}-hover.png`) })
  }
  await ctx.close()
}
await browser.close()
server.close()

console.log('\nshots: ' + OUT)
if (findings.length) { console.log('\nFINDINGS'); findings.forEach((f) => console.log(' - ' + f)); process.exit(1) }
console.log('clean')
