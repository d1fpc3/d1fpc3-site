// Scorecard tab audit (manual, not a node:test).
//   node tests/memecoin-scorecard-visual.mjs        (OUT / EMAIL / PORT env)
// Serves the repo itself, signs in as the owner by minting a magic link with
// the service key, opens Memecoins -> Scorecard, walks every horizon and
// screenshots each viewport. Reports row counts, horizontal overflow, console
// errors and whether the segmented control's ink actually tracks the active
// button. Read-only against the database.
import { createRequire } from 'module'
import { createServer } from 'http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join, extname, normalize } from 'path'

const require = createRequire(import.meta.url)
const PW_PATHS = [
  'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright',
  'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright',
]
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')

const ROOT = join(import.meta.dirname, '..')
const OUT = process.env.OUT || `${tmpdir()}/memecoin-scorecard`
const PORT = Number(process.env.PORT || 8123)
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
const URL = `http://127.0.0.1:${PORT}/echelon/admin/`

// the owner is whoever public.admins says (frankiepc3@gmail.com is NOT it)
const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const email = process.env.EMAIL || 'd1fpc3@gmail.com'
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed: ' + JSON.stringify(session).slice(0, 200))

const VP = {
  wide: { viewport: { width: 2560, height: 1400 }, deviceScaleFactor: 1 },
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
const findings = []
const browser = await chromium.launch()

for (const [name, cfg] of Object.entries(VP)) {
  const ctx = await browser.newContext(cfg)
  await ctx.addInitScript(([k, v]) => {
    localStorage.setItem(k, v)
    localStorage.setItem('echelon-admin-tour', 'done')
    localStorage.setItem('echelon-gex-tour', '1')
  }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.getElementById('app')?.classList.contains('on'), null, { timeout: 30000 })
    .catch(() => findings.push(`${name}: never signed in`))

  // JS clicks: at phone width the sidebar is off-canvas, so a real click
  // cannot reach the tab until the drawer is open
  await page.evaluate(() => document.querySelector('.tab[data-view="memes"]').click())
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const scrim = document.getElementById('scrim')
    if (scrim && getComputedStyle(scrim).opacity !== '0') scrim.click()
    document.getElementById('app')?.classList.remove('nav-open')
  })
  await page.evaluate(() => document.querySelector('.mm-tab[data-mm="scorecard"]').click())
  await page.waitForFunction(() => document.querySelectorAll('#sc-rows tr').length > 0, null, { timeout: 20000 })
    .catch(() => findings.push(`${name}: no scorecard rows rendered`))
  await page.waitForTimeout(700)

  const shot = async (tag) => page.screenshot({ path: join(OUT, `${name}-${tag}.png`) })
  await shot('1d')

  const m = await page.evaluate(() => {
    const seg = document.getElementById('sc-seg')
    const on = seg?.querySelector('.sc-seg-btn.on')
    const ink = seg?.querySelector('.sc-seg-ink')
    const onR = on?.getBoundingClientRect(), inkR = ink?.getBoundingClientRect()
    const pane = document.querySelector('#v-memes')
    return {
      rows: document.querySelectorAll('#sc-rows tr').length,
      sections: document.querySelectorAll('#sc-sections tr').length,
      stats: [...document.querySelectorAll('#sc-strip .mm-stat')].map((s) => `${s.querySelector('.k').textContent}=${s.querySelector('.v').textContent}`),
      unpriced: document.getElementById('sc-unpriced')?.hidden ? null : document.getElementById('sc-unpriced')?.textContent.trim().slice(0, 120),
      inkDrift: onR && inkR ? Math.round(Math.abs(onR.left - inkR.left)) : null,
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      paneOverflow: pane ? Math.max(0, pane.scrollWidth - pane.clientWidth) : 0,
    }
  })
  console.log(`\n== ${name} (${cfg.viewport.width}x${cfg.viewport.height}) ==`)
  console.log(JSON.stringify(m, null, 2))
  if (m.rows === 0) findings.push(`${name}: zero rows`)
  if (m.pageOverflow > 0) findings.push(`${name}: page overflows by ${m.pageOverflow}px`)
  if (m.paneOverflow > 0) findings.push(`${name}: pane overflows by ${m.paneOverflow}px`)
  if (m.inkDrift != null && m.inkDrift > 2) findings.push(`${name}: segmented ink is ${m.inkDrift}px off the active button`)
  for (const e of errors) findings.push(`${name}: ${e}`)

  // walk the horizons; each switch must re-render without a refetch or a throw
  for (const h of ['ret_7d', 'ret_30d', 'ret_event']) {
    await page.evaluate((sel) => document.querySelector(sel).click(), `.sc-seg-btn[data-h="${h}"]`)
    await page.waitForTimeout(450)
    const after = await page.evaluate(() => {
      const seg = document.getElementById('sc-seg')
      const on = seg.querySelector('.sc-seg-btn.on'), ink = seg.querySelector('.sc-seg-ink')
      const onR = on.getBoundingClientRect(), inkR = ink.getBoundingClientRect()
      return {
        label: on.textContent,
        rows: document.querySelectorAll('#sc-rows tr').length,
        scored: document.querySelectorAll('#sc-rows .px:not(.none)').length,
        inkDrift: Math.round(Math.abs(onR.left - inkR.left)),
        strip: document.querySelector('#sc-strip .mm-stat:nth-child(2) .v')?.textContent,
      }
    })
    console.log(`  ${h}: ${JSON.stringify(after)}`)
    if (after.inkDrift > 2) findings.push(`${name}/${h}: segmented ink ${after.inkDrift}px off`)
    await shot(h.replace('ret_', ''))
  }

  await ctx.close()
}

await browser.close()
server.close()
console.log('\nscreenshots: ' + OUT)
console.log(findings.length ? 'FINDINGS:\n  ' + findings.join('\n  ') : 'no findings')
