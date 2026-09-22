// Memecoins desk audit (manual, not a node:test).
//   node tests/memecoins-desk-visual.mjs        (THEME=dark|light, VPS=wide,desk,phone, OUT, PORT, URL env)
// Serves the repo itself (or URL= for production), signs in as the owner by minting a
// magic link with the service key, then: desk (tape, Next up, wire, board, named this
// week), a Next up row jumping the wire, board sort, arrow keys stepping, a coin from the
// board and one from a wire chip (chart hover, range switch, Escape), then the scorecard
// filter, section filter and by-ticker rows. Screenshots per viewport; reports overflow,
// missing rows, segmented-ink drift and page errors. CoinGecko throttles this IP after a
// few runs; the page is expected to degrade to its Retry note and the profile still
// draws from stored marks.
import { createRequire } from 'module'
import { createServer } from 'http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join, extname, normalize } from 'path'

const require = createRequire(import.meta.url)
const PW_PATHS = [
  'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright',
  'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright',
]
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const ROOT = join(import.meta.dirname, '..')
const OUT = process.env.OUT || join(tmpdir(), 'memecoins-desk')
const PORT = Number(process.env.PORT || 8128)
const THEME = process.env.THEME || 'dark'
const VPS = (process.env.VPS || 'wide,desk,phone').split(',')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const file = join(ROOT, normalize(p).replace(/^([/\\])+/, ''))
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
const URL = process.env.URL || `http://127.0.0.1:${PORT}/echelon/admin/`

const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const VP = {
  wide: { viewport: { width: 2560, height: 1400 }, deviceScaleFactor: 1 },
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
const browser = await chromium.launch()
const findings = []
for (const name of VPS) {
  const cfg = VP[name]
  const ctx = await browser.newContext({ ...cfg, colorScheme: THEME === 'dark' ? 'dark' : 'light' })
  await ctx.addInitScript(([k, v, theme]) => {
    localStorage.setItem(k, v)
    localStorage.setItem('echelon-admin-tour', 'done'); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-theme', theme)
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), THEME])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/admin-api|ERR_FAILED|CORS/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  for (let attempt = 0; attempt < 3; attempt++) {
    const ok = await page.waitForFunction(() => document.getElementById('app')?.classList.contains('on'), null, { timeout: 20000 }).then(() => true).catch(() => false)
    if (ok) break
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  const closeDrawer = () => page.evaluate(() => { document.getElementById('app')?.classList.remove('nav-open') })
  const shot = (tag, full = false) => page.screenshot({ path: join(OUT, `${name}-${tag}.png`), fullPage: full })
  const metrics = async (tag) => {
    const m = await page.evaluate(() => ({
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      paneOverflow: (() => { const p = document.querySelector('#v-memes'); return p ? Math.max(0, p.scrollWidth - p.clientWidth) : 0 })(),
    }))
    if (m.pageOverflow > 0) findings.push(`${name}/${tag}: page overflows ${m.pageOverflow}px`)
    if (m.paneOverflow > 0) findings.push(`${name}/${tag}: pane overflows ${m.paneOverflow}px`)
    return m
  }

  // desk
  await page.evaluate(() => document.querySelector('.tab[data-view="memes"]').click())
  await closeDrawer()
  await page.evaluate(() => document.querySelector('.mm-tab[data-mm="desk"]').click())
  await page.waitForFunction(() => document.querySelectorAll('#mm-wire .wire-row').length > 0, null, { timeout: 20000 }).catch(() => findings.push(`${name}: wire never rendered`))
  await page.waitForFunction(() => document.querySelectorAll('#mm-chips .board-row').length > 0 || document.querySelector('#mm-strip .mm-strip-note'), null, { timeout: 25000 }).catch(() => findings.push(`${name}: board never settled`))
  await page.waitForTimeout(900)
  const desk = await page.evaluate(() => ({
    stats: [...document.querySelectorAll('#mm-strip .mm-stat')].map((s) => s.querySelector('.k')?.textContent + '=' + s.querySelector('.v')?.textContent?.trim()),
    strip: document.querySelector('#mm-strip .mm-strip-note')?.textContent || null,
    board: document.querySelectorAll('#mm-chips .board-row').length,
    logos: [...document.querySelectorAll('#mm-chips .board-row .logo')].filter((i) => i.complete && i.naturalWidth > 0).length,
    rows: document.querySelectorAll('#mm-wire .wire-row').length,
    dated: document.querySelectorAll('#mm-wire .wire-when').length,
    chips: document.querySelectorAll('#mm-wire .tk').length,
    dimChips: [...document.querySelectorAll('#mm-wire .tk.dim')].map((b) => b.textContent),
    sources: document.querySelectorAll('#mm-wire .wire-src a').length,
    sections: [...document.querySelectorAll('#mm-wire .wire-sec-head')].map((h) => h.textContent.trim()),
    cur: document.getElementById('wire-cur')?.textContent,
    foot: document.querySelector('#mm-wire .wire-foot')?.textContent?.slice(0, 60),
  }))
  console.log(`\n== ${name} desk ==`); console.log(JSON.stringify(desk, null, 1))
  await page.waitForFunction(() => document.querySelectorAll('#nx-rows .wire-row').length > 0 || document.querySelector('#nx-rows .nx-empty'), null, { timeout: 15000 }).catch(() => findings.push(`${name}: next up never rendered`))
  await page.waitForTimeout(400)
  const nx = await page.evaluate(() => ({
    upd: document.getElementById('nx-upd')?.textContent,
    rows: [...document.querySelectorAll('#nx-rows .wire-row')].map((r) => `${r.querySelector('.d')?.textContent} ${r.querySelector('.rel')?.textContent} | ${[...r.querySelectorAll('.lead-tk')].map((b) => b.textContent).join(',')} | ${r.querySelector('.wire-text')?.textContent.trim().slice(0, 60)} | ${r.querySelector('.wire-src a')?.textContent || '-'}`),
    more: document.querySelector('#nx-rows .nx-more')?.textContent || null,
    watch: [...document.querySelectorAll('#mm-watch-rows .board-row')].map((r) => `${r.querySelector('.sym')?.textContent} ${r.querySelector('.sub')?.textContent} ${r.querySelector('.since')?.textContent}`),
    sort: document.querySelector('#board-sort .on')?.dataset.s,
  }))
  console.log('next up:', JSON.stringify(nx, null, 1))
  await shot('desk'); await metrics('desk')
  if (name === 'wide') await shot('desk-full', true)
  // next up row -> the wire jumps to the digest that first named it
  const jumped = await page.evaluate(() => { const r = document.querySelector('#nx-rows .wire-row'); if (!r) return null; r.click(); return true })
  await page.waitForTimeout(700)
  if (jumped) {
    const j = await page.evaluate(() => ({ cur: document.getElementById('wire-cur')?.textContent, title: document.querySelector('#mm-wire h4')?.textContent }))
    console.log('after next-up click:', JSON.stringify(j))
    if (/latest of/.test(j.cur || '') && nx.rows[0] && !/Sep 21/.test(j.title || '')) findings.push(`${name}: next-up click did not jump`)
    await shot('desk-jumped')
    await page.evaluate(() => { while (!document.getElementById('wire-next').disabled) document.getElementById('wire-next').click() })
    await page.waitForTimeout(300)
  }
  // board sort by 24h reorders
  const firstCap = await page.evaluate(() => document.querySelector('#mm-chips .board-row .sym')?.textContent)
  await page.evaluate(() => document.querySelector('#board-sort [data-s="d24"]')?.click()); await page.waitForTimeout(300)
  const first24 = await page.evaluate(() => ({ sym: document.querySelector('#mm-chips .board-row .sym')?.textContent, order: [...document.querySelectorAll('#mm-chips .board-row .c-px .sub')].map((s) => s.textContent.split(' ')[0]).join(' ') }))
  console.log('sort cap first:', firstCap, '| 24h first:', JSON.stringify(first24))
  await page.evaluate(() => document.querySelector('#board-sort [data-s="cap"]')?.click()); await page.waitForTimeout(200)
  // arrow keys step the wire
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(400)
  const keyed = await page.evaluate(() => document.getElementById('wire-cur')?.textContent)
  if (!/2 of/.test(keyed || '')) findings.push(`${name}: ArrowLeft did not step the wire (${keyed})`)
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300)

  // step back one digest
  await page.evaluate(() => document.getElementById('wire-prev').click())
  await page.waitForTimeout(500)
  const step = await page.evaluate(() => ({ cur: document.getElementById('wire-cur')?.textContent, title: document.querySelector('#mm-wire h4')?.textContent, rows: document.querySelectorAll('#mm-wire .wire-row').length }))
  console.log('step back:', JSON.stringify(step))
  if (!/2 of/.test(step.cur || '')) findings.push(`${name}: stepper did not move`)
  await shot('desk-prev')
  await page.evaluate(() => document.getElementById('wire-next').click())
  await page.waitForTimeout(300)

  // open a coin from the board (or a chip when the board is throttled)
  const opened = await page.evaluate(() => {
    const row = document.querySelector('#mm-chips .board-row') || document.querySelector('#mm-wire .tk:not(.dim)')
    if (!row) return null
    row.click(); return row.textContent.trim().slice(0, 30)
  })
  console.log('opened:', opened)
  await page.waitForFunction(() => document.body.classList.contains('cp-open') && document.querySelectorAll('#cp .cp-call').length > 0, null, { timeout: 20000 }).catch(() => findings.push(`${name}: profile never filled`))
  await page.waitForTimeout(700)
  const prof = await page.evaluate(() => ({
    name: document.querySelector('#cp h3')?.textContent, sym: document.querySelector('#cp .sym')?.textContent, price: document.querySelector('#cp .cp-price .px')?.textContent,
    live: document.querySelector('#cp .cp-price .live')?.textContent || null,
    chartPts: document.querySelector('#cp .cp-chart path.line')?.getAttribute('d')?.split('L').length,
    rings: document.querySelectorAll('#cp .cp-chart circle.call').length,
    calls: document.querySelectorAll('#cp .cp-call').length,
    grid: [...document.querySelectorAll('#cp .cp-grid > div')].map((d) => d.querySelector('.k')?.textContent + '=' + d.querySelector('.v')?.textContent),
    empty: document.querySelector('#cp .cp-chart-empty')?.textContent || null,
    width: document.getElementById('cp').getBoundingClientRect().width,
    range: document.querySelector('#cp .cp-range') ? `${document.querySelector('#cp .cp-range .bar i')?.style.left} ${document.querySelector('#cp .cp-range .ends')?.textContent}` : null,
  }))
  console.log('profile:', JSON.stringify(prof))
  // hover the chart mid-way
  const box = await page.$('#cp .cp-chart')
  if (box) { const b = await box.boundingBox(); await page.mouse.move(b.x + b.width * 0.62, b.y + b.height * 0.5); await page.waitForTimeout(250) }
  await shot('profile')
  // 7d range
  await page.evaluate(() => [...document.querySelectorAll('#cp .sc-seg-btn')].find((b) => b.dataset.r === '7d')?.click())
  await page.waitForTimeout(400)
  await shot('profile-7d')
  // esc closes
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  const closed = await page.evaluate(() => !document.body.classList.contains('cp-open'))
  if (!closed) findings.push(`${name}: Escape did not close the profile`)

  // a chip in the wire opens a coin the board does not carry
  const chipOpened = await page.evaluate(() => {
    const boardSyms = new Set([...document.querySelectorAll('#mm-chips .sym')].map((s) => s.textContent))
    const b = [...document.querySelectorAll('#mm-wire .tk:not(.dim)')].find((x) => !boardSyms.has(x.textContent.trim()))
    if (!b) return null; b.click(); return b.textContent.trim()
  })
  if (chipOpened) {
    await page.waitForFunction(() => document.body.classList.contains('cp-open') && !document.querySelector('#cp .live')?.textContent?.includes('loading'), null, { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(600)
    const p2 = await page.evaluate(() => ({ name: document.querySelector('#cp h3')?.textContent, price: document.querySelector('#cp .cp-price .px')?.textContent, live: document.querySelector('#cp .live')?.textContent || null, calls: document.querySelectorAll('#cp .cp-call').length, rings: document.querySelectorAll('#cp .cp-chart circle.call').length, empty: document.querySelector('#cp .cp-chart-empty')?.textContent || null }))
    console.log('chip profile', chipOpened, JSON.stringify(p2))
    await shot('profile-chip')
    await page.evaluate(() => document.getElementById('cp-scrim').click()); await page.waitForTimeout(400)
  }

  // scorecard: filter + section
  await page.evaluate(() => document.querySelector('.mm-tab[data-mm="scorecard"]').click())
  await page.waitForFunction(() => document.querySelectorAll('#sc-rows tr').length > 0, null, { timeout: 20000 }).catch(() => findings.push(`${name}: no scorecard rows`))
  await page.waitForTimeout(600)
  await shot('scorecard'); await metrics('scorecard')
  await page.fill('#sc-q', 'pu'); await page.waitForTimeout(300)
  const filt = await page.evaluate(() => ({ rows: document.querySelectorAll('#sc-rows tr').length, first: document.querySelector('#sc-rows .tk')?.textContent }))
  console.log('filter pu:', JSON.stringify(filt))
  await page.fill('#sc-q', ''); await page.waitForTimeout(200)
  await page.evaluate(() => document.querySelector('#sc-sections .sc-sec-row')?.click()); await page.waitForTimeout(300)
  const secf = await page.evaluate(() => ({ rows: document.querySelectorAll('#sc-rows tr').length, on: document.querySelector('#sc-sections .sc-sec-row.on .sym')?.textContent, byTicker: [...document.querySelectorAll('#sc-tickers .sc-tk-row')].slice(0, 4).map((r) => r.textContent.replace(/\s+/g, ' ').trim()) }))
  console.log('section filter:', JSON.stringify(secf))
  await shot('scorecard-section')
  await page.evaluate(() => document.querySelector('#sc-sections .sc-sec-row.on')?.click())
  const inkDrift = await page.evaluate(() => { const seg = document.getElementById('sc-seg'); const on = seg.querySelector('.on'), ink = seg.querySelector('.sc-seg-ink'); return Math.round(Math.abs(on.getBoundingClientRect().left - ink.getBoundingClientRect().left)) })
  if (inkDrift > 2) findings.push(`${name}: segmented ink ${inkDrift}px off`)

  for (const e of errors) findings.push(`${name}: ${e}`)
  await ctx.close()
}
await browser.close(); server.close()
console.log('\nshots: ' + OUT)
console.log(findings.length ? 'FINDINGS:\n  ' + findings.join('\n  ') : 'no findings')
