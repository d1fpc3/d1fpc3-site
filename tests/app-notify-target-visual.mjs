// A notification lands on the moment it is about (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-notify-target-visual.mjs
//
// Every notification already navigated; the gap was that it navigated to TODAY. A GEX alert
// from Tuesday opened Friday's board, which is a different market, and a news alert opened
// this week's calendar whatever week it was announcing. This taps the real rows in the
// notifications page and in the bell popover and checks where each one actually lands.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = [
  'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright',
  'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright',
]
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-notify-target`
mkdirSync(OUT, { recursive: true })
const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const tokenFile = join(homedir(), '.supabase', 'access-token')
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')
const email = process.env.EMAIL || 'appreview@d1fpc3.com'
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = []
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1'); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', 'dark') }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
const page = await ctx.newPage()
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))
await page.goto(process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#td-h1', { timeout: 60000 })
await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
await page.waitForTimeout(3000)

const ET = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const today = ET(Date.now())

const openInbox = async () => { await page.evaluate(() => document.querySelector('.tab[data-view="inbox"]')?.click()); await page.waitForTimeout(2200) }
await openInbox()

// what the app itself thinks each row is about, so the expectation comes from the data
const rows = await page.evaluate(() => [...document.querySelectorAll('#inbox .nb-row')].slice(0, 12).map((r, i) => ({ i, txt: (r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 52) })))
check(rows.length > 0, `the notifications page has ${rows.length} rows`)

// find a GEX row that is NOT from today: that is the case the fix is for
const dated = await page.evaluate(() => {
  const out = []
  const list = document.querySelectorAll('#inbox .nb-row')
  for (let i = 0; i < list.length; i++) {
    const t = (list[i].innerText || '').replace(/\s+/g, ' ')
    out.push({ i, gex: /D1 GEX/.test(t), news: /^News/.test(t), txt: t.slice(0, 44) })
  }
  return out
})
const gexRows = dated.filter((d) => d.gex)
check(gexRows.length > 0, `${gexRows.length} of them are GEX alerts`)

let checkedOld = false
for (const r of gexRows.slice(0, 6)) {
  await openInbox()
  await page.evaluate((i) => document.querySelectorAll('#inbox .nb-row')[i]?.click(), r.i)
  await page.waitForTimeout(2600)
  const land = await page.evaluate(() => ({
    view: (document.querySelector('.view.on') || {}).id,
    hist: window.__gexHist ?? null,
    title: document.getElementById('gex-read-title')?.textContent?.trim(),
  }))
  check(land.view === 'v-gex', `${r.txt.slice(0, 34)} -> ${land.view}`)
  // "Today's read" means live; anything else names the day it opened on
  if (/read$/.test(land.title || '') && !/Today/.test(land.title || '')) { checkedOld = true; console.log(`       and it opened on "${land.title}"`) }
}
check(checkedOld, 'at least one GEX alert opened the board on its own day, not today')

// the bell popover uses the same handler
await page.evaluate(() => document.querySelector('.tab[data-view="overview"]')?.click())
await page.waitForTimeout(900)
const bell = await page.evaluate(() => { const b = document.getElementById('tb-bell'); if (!b || b.offsetParent === null) return false; b.click(); return true })
if (bell) {
  await page.waitForTimeout(2000)
  const n = await page.evaluate(() => document.querySelectorAll('#nbp .nb-row').length)
  if (n) {
    await page.evaluate(() => document.querySelector('#nbp .nb-row')?.click())
    await page.waitForTimeout(2400)
    const land = await page.evaluate(() => ({ view: (document.querySelector('.view.on') || {}).id, title: document.getElementById('gex-read-title')?.textContent?.trim(), open: !document.getElementById('nbp')?.hidden }))
    check(land.view === 'v-gex' && !land.open, `the bell popover lands too and closes behind it (${land.view}, "${land.title}")`)
  } else console.log('       (the page visit marked everything read, so the popover is empty; nothing to tap)')
} else console.log('       (no bell on this width, skipped)')

await page.screenshot({ path: `${OUT}/landed.png` })
console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
await browser.close()
process.exit(fails.length ? 1 : 0)
