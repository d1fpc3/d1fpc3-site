// The Notifications panel on the Kalshi desk: it loads the real row, the master switch dims the
// rest, a change arms Save, and a save round-trips to the database and back.
//   node tests/kalshi-notify-visual.mjs        (OUT, PORT env)
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
const OUT = process.env.OUT || join(tmpdir(), 'kalshi-notify')
const PORT = Number(process.env.PORT || 8139)
mkdirSync(OUT, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
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
const readRow = async () => (await (await fetch(`${SB}/rest/v1/kalshi_notify?select=*&id=eq.1`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })).json())[0]

const findings = []
const fail = (m) => { findings.push(m); console.log('  FAIL  ' + m) }
const pass = (m) => console.log('  ok    ' + m)

const before = await readRow()
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)])
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#notify', { timeout: 30_000 })
await page.waitForTimeout(2500)

// it loaded the real row
const shown = await page.$eval('#n-fills', (n) => n.checked)
shown === (before.fills === true) ? pass(`loaded the row (fills ${before.fills})`) : fail(`fills shows ${shown}, the row says ${before.fills}`)
;(await page.$eval('#n-save', (n) => n.disabled)) ? pass('Save starts disabled') : fail('Save was armed with no change')

// a change arms Save; the master switch dims the rest
await page.click('#n-rounds')
await page.waitForTimeout(150)
!(await page.$eval('#n-save', (n) => n.disabled)) ? pass('a change arms Save') : fail('a change did not arm Save')
await page.click('#n-enabled')
await page.waitForTimeout(200)
;(await page.$eval('#notify', (n) => n.classList.contains('off'))) ? pass('turning the master off dims the rest') : fail('the master switch did not dim the grid')
await page.click('#n-enabled')
await page.waitForTimeout(150)

// save round trip, then put it back exactly as it was
await page.click('#n-save')
await page.waitForTimeout(2000)
const after = await readRow()
after.rounds === !before.rounds ? pass(`saved: rounds ${before.rounds} -> ${after.rounds}`) : fail(`save did not land (rounds still ${after.rounds})`)
after.enabled === before.enabled ? pass('the master switch came back as it was') : fail(`enabled changed to ${after.enabled}`)

await page.$eval('#notify', (n) => n.scrollIntoView({ block: 'center' }))
await page.waitForTimeout(300)
await page.screenshot({ path: join(OUT, 'notify-desk-dark.png') })

// restore
await fetch(`${SB}/rest/v1/kalshi_notify?id=eq.1`, { method: 'PATCH', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rounds: before.rounds }) })
const restored = await readRow()
restored.rounds === before.rounds ? pass('restored the row') : fail('could not restore the row')

errs.length ? errs.forEach(fail) : pass('no page or console errors')
await browser.close(); server.close()
console.log(`\nshot -> ${join(OUT, 'notify-desk-dark.png')}`)
if (findings.length) { console.log(`\n${findings.length} finding(s)`); process.exit(1) }
console.log('\nall checks passed')
