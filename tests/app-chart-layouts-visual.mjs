// Saved chart layouts (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-layouts-visual.mjs        (APP_URL / OUT / EMAIL / THEME env)
//
// A layout is the whole chart under a name. This drives the real menu, with prompt() answered
// the way a person would, and proves the round trip actually restores the chart rather than
// just writing a row: set a distinctive state, save it, change everything, load it back, and
// check the symbol, the interval, a style setting, an indicator and the drawings all come back. Then
// rename, delete, and reload the page to prove it survives.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = [
  'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright',
  'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright',
]
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-chart-layouts`
mkdirSync(OUT, { recursive: true })
const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const tokenFile = join(homedir(), '.supabase', 'access-token')
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')
const email = process.env.EMAIL || 'appreview@d1fpc3.com'
const theme = process.env.THEME || 'dark'
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = []
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1'); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', t)
  // once, not on every navigation: this runs again on the reload below, and clearing there
  // would wipe the layouts the reload is meant to prove survive
  if (!sessionStorage.getItem('lay-init')) { sessionStorage.setItem('lay-init', '1'); localStorage.removeItem('echelon-chart-layouts'); localStorage.removeItem('echelon-chart-layouts:at') } }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme])
const page = await ctx.newPage()
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))
// prompt() is how the menu asks for a name; answer it the way a person would
let answer = null
page.on('dialog', async (d) => { if (d.type() === 'prompt') await d.accept(answer ?? d.defaultValue()); else await d.accept() })

const openChart = async () => {
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click())
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  await page.waitForFunction(() => /O\s?[\d,]/.test(document.getElementById('ch-legend').textContent), null, { timeout: 40000 }).catch(() => {})
  await page.waitForTimeout(2500)
}
await page.goto(process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#td-h1', { timeout: 40000 })
await page.waitForTimeout(1500)
await openChart()
const st = () => page.evaluate(() => ({ sym: window.__CH.sym, tf: window.__CH.tf, type: window.__CH.s.type, lit: !!window.__CH.s.lit, rsi: !!window.__CH.s.p_rsi, up: window.__CH.s.up, dr: window.__CH.drawings.length, at: window.__CH.layoutId, saved: JSON.parse(localStorage.getItem('echelon-chart-layouts') || '[]').length }))

check(await page.evaluate(() => !!window.__CH?.layouts), 'the chart can hold layouts')

// a state nobody would land on by accident
await page.evaluate(() => {
  const CH = window.__CH
  CH.$.setSym('MNQ')
  CH.s.type = 'bars'; CH.s.p_rsi = true; CH.s.lit = false; CH.s.up = '#ff00aa'
  CH.drawings = [{ id: 'a1', type: 'hline', p: [{ t: Math.floor(Date.now() / 1000) - 3600, p: 20000 }], color: '#2962ff' }, { id: 'a2', type: 'hline', p: [{ t: Math.floor(Date.now() / 1000) - 7200, p: 20100 }], color: '#f23645' }]
})
await page.evaluate(() => window.__CH.$.menu(null))
await page.waitForTimeout(400)
await page.evaluate(() => { const CH = window.__CH; CH.tf = '15m'; localStorage.setItem('echelon-chart-tf', '15m'); CH.$.build(); CH.$.paint() })
await page.waitForTimeout(1200)
const mine = await st()
check(mine.sym === 'MNQ' && mine.tf === '15m' && mine.dr === 2, `set up a distinctive chart (${mine.sym} ${mine.tf}, ${mine.dr} drawings, type ${mine.type}, RSI ${mine.rsi})`)

// save it through the real menu
answer = 'Scalp'
await page.evaluate(() => window.__CH.$.menu('layouts'))
await page.waitForTimeout(500)
const title = await page.evaluate(() => document.getElementById('ch-menu-title')?.textContent)
check(title === 'Layouts', `the Layouts panel opens ("${title}")`)
await page.evaluate(() => [...document.querySelectorAll('#ch-menu-body .rowbtn')].find((b) => /Save this layout|Save over/.test(b.textContent))?.click())
await page.waitForTimeout(900)
let now = await st()
check(now.saved === 1 && !!now.at, `saved one layout and marked it current (${now.saved}, id ${now.at ? 'set' : 'none'})`)
await page.screenshot({ path: `${OUT}/layouts-saved.png` })

// change everything
await page.evaluate(() => window.__CH.$.menu(null))
await page.evaluate(() => {
  const CH = window.__CH
  CH.$.setSym('NQ')
  CH.s.type = 'candles'; CH.s.p_rsi = false; CH.s.lit = true; CH.s.up = ''
  CH.drawings = []
  CH.tf = '5m'; localStorage.setItem('echelon-chart-tf', '5m')
  CH.$.build(); CH.$.paint()
})
await page.waitForTimeout(1400)
const wrecked = await st()
check(wrecked.sym === 'NQ' && wrecked.tf === '5m' && wrecked.dr === 0, `then changed all of it (${wrecked.sym} ${wrecked.tf}, ${wrecked.dr} drawings, type ${wrecked.type})`)

// load it back through the menu
await page.evaluate(() => window.__CH.$.menu('layouts'))
await page.waitForTimeout(500)
await page.evaluate(() => { const r = [...document.querySelectorAll('#ch-menu-body .ch-obj')].find((x) => /Scalp/.test(x.textContent)); r?.querySelector('.t')?.click() ?? r?.click() })
await page.waitForTimeout(2500)
const back = await st()
check(back.sym === 'MNQ', `the symbol comes back (${back.sym})`)
check(back.tf === '15m', `the interval comes back (${back.tf})`)
check(back.type === 'bars' && back.up === '#ff00aa', `the style comes back (type ${back.type}, up ${back.up})`)
check(back.rsi === true && back.lit === false, `the indicators come back (RSI ${back.rsi}, LIT ${back.lit})`)
check(back.dr === 2, `the drawings come back (${back.dr})`)
await page.screenshot({ path: `${OUT}/layouts-restored.png` })

// a second layout, and switching between them
answer = 'Swing'
await page.evaluate(() => { const CH = window.__CH; CH.s.type = 'line'; CH.drawings = []; CH.tf = 'D'; localStorage.setItem('echelon-chart-tf', 'D'); CH.$.build(); CH.$.paint() })
await page.waitForTimeout(900)
await page.evaluate(() => window.__CH.$.menu('layouts'))
await page.waitForTimeout(400)
await page.evaluate(() => [...document.querySelectorAll('#ch-menu-body .rowbtn')].find((b) => /Save as a new one/.test(b.textContent))?.click())
await page.waitForTimeout(900)
now = await st()
check(now.saved === 2, `a second layout saves alongside the first (${now.saved})`)
await page.evaluate(() => window.__CH.$.menu('layouts'))
await page.waitForTimeout(400)
await page.evaluate(() => { const r = [...document.querySelectorAll('#ch-menu-body .ch-obj')].find((x) => /Scalp/.test(x.textContent)); r?.querySelector('.t')?.click() ?? r?.click() })
await page.waitForTimeout(2200)
const sw = await st()
check(sw.tf === '15m' && sw.type === 'bars' && sw.dr === 2, `switching back to the first restores it (${sw.tf}, ${sw.type}, ${sw.dr} drawings)`)

// survives a reload
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('#td-h1', { timeout: 40000 })
await page.waitForTimeout(1500)
await openChart()
const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('echelon-chart-layouts') || '[]').map((x) => x.name))
check(afterReload.length === 2 && afterReload.includes('Scalp') && afterReload.includes('Swing'), `both survive a reload (${afterReload.join(', ')})`)

// rename and remove
answer = 'Scalp v2'
await page.evaluate(() => window.__CH.$.menu('layouts'))
await page.waitForTimeout(500)
await page.evaluate(() => { const r = [...document.querySelectorAll('#ch-menu-body .ch-obj')].find((x) => /Scalp/.test(x.textContent)); r?.querySelector('button[data-a="rename"]')?.click() })
await page.waitForTimeout(700)
const named = await page.evaluate(() => JSON.parse(localStorage.getItem('echelon-chart-layouts') || '[]').map((x) => x.name))
check(named.includes('Scalp v2'), `rename sticks (${named.join(', ')})`)
await page.evaluate(() => { const r = [...document.querySelectorAll('#ch-menu-body .ch-obj')].find((x) => /Swing/.test(x.textContent)); r?.querySelector('button[data-a="x"]')?.click() })
await page.waitForTimeout(700)
const left = await page.evaluate(() => JSON.parse(localStorage.getItem('echelon-chart-layouts') || '[]').map((x) => x.name))
check(left.length === 1 && left[0] === 'Scalp v2', `remove takes one away (${left.join(', ') || 'none'})`)
await page.screenshot({ path: `${OUT}/layouts-list.png` })

console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
console.log('shots: ' + OUT)
await browser.close()
process.exit(fails.length ? 1 : 0)
