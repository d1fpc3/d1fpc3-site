// Runtime probe for the Kalshi desk: load it with a real admin session, collect every page
// error and console error for a few seconds, and report which panels painted. For when the
// visual harness times out and you need the exception, not a screenshot.
//   node tests/kalshi-desk-probe.mjs        (PORT, URL env as the other harnesses)
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const PW_PATHS = [
  'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright',
  'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright',
]
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const ROOT = join(import.meta.dirname, '..')
const PORT = Number(process.env.PORT || 8137)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'
  const file = join(ROOT, normalize(p).replace(/^([/\\])+/, ''))
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
const URL = process.env.URL || `http://127.0.0.1:${PORT}/echelon/admin/kalshi-desk/`

const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const tokenFile = join(homedir(), '.supabase', 'access-token')
const mgmt = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : process.env.SUPABASE_ACCESS_TOKEN
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = (keys.find((k) => typeof k.api_key === 'string' && k.api_key.startsWith('sb_secret_')) ?? keys.find((k) => k.name === 'service_role')).api_key
const anon = (keys.find((k) => typeof k.api_key === 'string' && k.api_key.startsWith('sb_publishable_')) ?? keys.find((k) => k.name === 'anon')).api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)])
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + (e.stack || e.message)))
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type().toUpperCase() + ' ' + m.text()) })
page.on('requestfailed', (r) => errs.push('REQFAIL ' + r.url().slice(0, 120) + ' ' + (r.failure()?.errorText ?? '')))
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
const state = await page.evaluate(() => {
  const t = (id) => (document.getElementById(id)?.textContent ?? '(missing)').trim().slice(0, 60)
  return {
    calCells: document.querySelectorAll('#cal-grid .cal-d[data-k]').length,
    stBot: t('st-bot'), stToday: t('st-today'), stWin: t('st-win'), stEdge: t('st-edge'), stNext: t('st-next'),
    rlMode: t('rl-mode'), rlEdge7: t('rl-edge7'),
    calClipOn: document.querySelector('#cal-clip button.on')?.dataset.v ?? '(none)',
    calStripFirst: (document.querySelector('#cal-strip .cal-cell span')?.textContent ?? '').trim().slice(0, 40),
    ordersRows: document.querySelectorAll('#orders tbody tr').length,
    researchRows: document.querySelectorAll('#research tbody tr').length,
    skeletons: document.querySelectorAll('.skel').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dupIds: (() => { const seen = new Map(); for (const e of document.querySelectorAll('[id]')) seen.set(e.id, (seen.get(e.id) ?? 0) + 1); return [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`) })(),
  }
})
console.log(JSON.stringify(state, null, 1))
console.log(errs.length ? errs.join('\n') : 'no page or console errors')
await browser.close(); server.close()
