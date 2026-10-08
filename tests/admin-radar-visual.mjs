// Manual: python -m http.server 8123 from the repo root, then node tests/admin-radar-visual.mjs (ADMIN_URL / OUT / W / H / THEME env).
// Admin > Radar as the owner (D1, 10-08): the Radar place on the rail with Deals | Events, ?view=deals opens Deals
// straight from a push, the lists render from radar_items, filters move the thumb and the counts, a dismiss folds the
// row and writes dismissed_at (then the harness puts it back), a watchlist add / switch / remove round-trips, the hot
// bar picker saves and is restored, Scan now runs the radar function with the owner's session, nothing scrolls sideways.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || join(tmpdir(), 'echelon-radar'); mkdirSync(OUT, { recursive: true })
const URL = process.env.ADMIN_URL || 'http://127.0.0.1:8123/echelon/admin/'
const W = +(process.env.W || 1440), H = +(process.env.H || 900), THEME = process.env.THEME || 'dark'
const WRITES = process.env.WRITES !== '0'
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const SH = { apikey: service, Authorization: `Bearer ${service}` }
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { ...SH, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
const fails = [], ok = (c, w) => { console.log((c ? '  ok   ' : '  FAIL ') + w); if (!c) fails.push(w) }
const rest = async (path, opt = {}) => { const r = await fetch(`${SB}/rest/v1/${path}`, { ...opt, headers: { ...SH, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } }); return r.json() }
const prefsBefore = (await rest('radar_prefs?id=eq.1'))[0]

const browser = await PW.chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: THEME })
// the edge functions only answer d1fpc3.com: relay them from a local server, as the other admin harnesses do
if (/127\.0\.0\.1|localhost/.test(URL)) await ctx.route(/\/functions\/v1\/(admin-api|radar)$/, async (r) => {
  const req = r.request()
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } })
  const res = await fetch(req.url(), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: req.headers()['authorization'] || `Bearer ${session.access_token}` }, body: req.postData() })
  r.fulfill({ status: res.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await res.text() })
})
await ctx.addInitScript(([k, v, theme]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, v); localStorage.setItem('echelon-theme', theme) }, [`sb-${REF}-auth-token`, JSON.stringify(session), THEME])
const page = await ctx.newPage(), errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)) })
page.on('response', (r) => { if (r.status() >= 400 && !/favicon|slickdealscdn|evbuc|allevents/.test(r.url()) && !(r.status() === 403 && r.request().isNavigationRequest())) errs.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '').slice(0, 120)}`) })
const sideways = () => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)

// ── a push lands on ?view=deals ──
await page.goto(URL + '?view=deals', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#app.on', { timeout: 60000 })
await page.waitForFunction(() => document.querySelectorAll('#rd-deals .rd-row').length > 0, null, { timeout: 25000 })
await page.waitForTimeout(900)
const d = await page.evaluate(() => {
  const q = (s) => [...document.querySelectorAll(s)]
  return {
    title: document.getElementById('pane-title').textContent, on: document.getElementById('v-deals').classList.contains('on'),
    grp: document.querySelector('.grp.on')?.dataset.grp, segs: q('#subnav .sub-seg button[data-view]').map((b) => b.textContent.replace(/\d+/g, '').trim()),
    cards: q('#rd-cards .scard .k').map((k) => k.textContent), vals: q('#rd-cards .scard .v').map((v) => v.textContent),
    rows: q('#rd-deals .rd-row').length, filters: q('#rd-filter button').map((b) => b.textContent), thumbW: getComputedStyle(document.querySelector('#rd-filter .thumb')).width,
    imgs: q('#rd-deals .rd-img').length, prices: q('#rd-deals .rd-price b').slice(0, 3).map((b) => b.textContent), first: document.querySelector('#rd-deals .rd-row .n')?.textContent,
    watch: q('#rd-watch .rd-w').map((w) => w.querySelector('.n').firstChild.textContent), push: document.getElementById('rd-push').checked,
    pct: document.querySelector('#rd-pct .on')?.textContent, cap: document.querySelector('#rd-cap .on')?.textContent,
  }
})
ok(d.on && d.title === 'Deals' && d.grp === 'radar', `?view=deals opened Deals in the Radar place (${d.title}, ${d.grp})`)
ok(d.segs.join() === 'Deals,Events', `radar segment: ${d.segs.join(', ')}`)
ok(d.cards.join() === 'Worth a look,Best right now,Watchlist hits,Pushed today', `tiles: ${d.cards.map((c, i) => `${c} ${d.vals[i]}`).join(' | ')}`)
ok(d.rows > 0 && d.imgs === d.rows, `${d.rows} deal rows, each with a picture; first "${d.first}" ${d.prices.join(' ')}`)
ok(d.filters.length === 4 && parseFloat(d.thumbW) > 20, `filters ${d.filters.join(' / ')}, thumb ${d.thumbW}`)
ok(d.watch.length >= 6 && d.watch.includes('Gatorade'), `watchlist: ${d.watch.join(', ')}`)
ok(typeof d.push === 'boolean' && d.pct && d.cap, `alerts: push ${d.push}, bar ${d.pct}, cap ${d.cap}`)
ok((await sideways()) <= 1, 'no sideways scroll on Deals')
await page.screenshot({ path: `${OUT}/${W}-${THEME}-deals.png`, fullPage: true })

// filters: All has at least as many rows as Worth it, and the thumb moves
const x0 = await page.$eval('#rd-filter .thumb', (t) => t.style.getPropertyValue('--x'))
await page.click('#rd-filter button[data-v="all"]'); await page.waitForTimeout(500)
const allRows = await page.$$eval('#rd-deals .rd-row', (r) => r.length), x1 = await page.$eval('#rd-filter .thumb', (t) => t.style.getPropertyValue('--x'))
ok(allRows >= d.rows && x1 !== x0, `All: ${allRows} rows, thumb ${x0} -> ${x1}`)
await page.click('#rd-filter button[data-v="worth"]'); await page.waitForTimeout(400)

if (WRITES) {
  // dismiss the first row: it folds away and dismissed_at lands, then the harness puts it back
  const id = await page.$eval('#rd-deals .rd-row', (r) => r.dataset.rid)
  await page.hover('#rd-deals .rd-row'); await page.click('#rd-deals .rd-row .rd-ic.x'); await page.waitForTimeout(900)
  const gone = await page.$$eval(`#rd-deals .rd-row[data-rid="${id}"]`, (r) => r.length)
  const row = (await rest(`radar_items?id=eq.${id}&select=dismissed_at`))[0]
  ok(gone === 0 && !!row.dismissed_at, `dismiss folded the row and saved (${row.dismissed_at})`)
  await rest(`radar_items?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ dismissed_at: null }) })

  // watchlist: add, switch off and on, remove
  await page.fill('#rd-term', 'Celsius'); await page.fill('#rd-maxp', '30'); await page.click('#rd-add .btn'); await page.waitForTimeout(1200)
  const added = (await rest('radar_watch?term=eq.Celsius'))[0]
  ok(added && +added.max_price === 30 && added.match === '\\bcelsiuss?\\b', `added Celsius under $30 (${added?.match})`)
  const last = page.locator('#rd-watch .rd-w').last()
  ok((await last.textContent()).includes('Under $30'), 'its row says Under $30')
  await last.locator('.tgl').click(); await page.waitForTimeout(900)
  ok((await rest('radar_watch?term=eq.Celsius'))[0]?.active === false && await last.evaluate((r) => r.classList.contains('off')), 'switched off, row dims')
  await last.locator('.rd-ic.x').click(); await page.waitForTimeout(900)
  ok(!(await rest('radar_watch?term=eq.Celsius')).length && !(await page.locator('#rd-watch').textContent()).includes('Celsius'), 'removed from the list and the table')

  // hot bar: pick 50%, saved, then put back
  await page.click('#rd-pct button:has-text("50%")'); await page.waitForTimeout(900)
  ok((await rest('radar_prefs?id=eq.1'))[0].min_pct === 50, 'hot bar 50% saved')
  await rest('radar_prefs?id=eq.1', { method: 'PATCH', body: JSON.stringify({ min_pct: prefsBefore.min_pct, deal_cap: prefsBefore.deal_cap, deals_push: prefsBefore.deals_push, events_push: prefsBefore.events_push }) })

  // Scan now with the owner's own session
  await page.click('#v-deals .rd-scan')
  await page.waitForFunction(() => /found|Try again/.test(document.querySelector('#v-deals .rd-scan span').textContent), null, { timeout: 60000 })
  const said = await page.textContent('#v-deals .rd-scan span')
  ok(/\d+ found/.test(said), `Scan now: "${said}"`)
}

// ── Events, through the segment ──
await page.click('#subnav .sub-seg button[data-view="events"]')
await page.waitForFunction(() => document.querySelectorAll('#re-list .rd-row').length > 0, null, { timeout: 25000 })
await page.waitForTimeout(900)
const e = await page.evaluate(() => {
  const q = (s) => [...document.querySelectorAll(s)]
  return {
    title: document.getElementById('pane-title').textContent, cards: q('#re-cards .scard .k').map((k) => k.textContent), vals: q('#re-cards .scard .v').map((v) => v.textContent),
    rows: q('#re-list .rd-row').length, months: q('#re-list .om-grp').map((g) => g.textContent), tiles: q('#re-list .om-day').length,
    wk: q('#re-weekend .rd-row').length + ' rows, ' + document.getElementById('re-wk-n').textContent, cars: q('#re-list .om-pill.car').length,
    filters: q('#re-filter button').map((b) => b.textContent), push: document.getElementById('re-push').checked,
  }
})
ok(e.title === 'Events' && e.cards.join() === 'This weekend,Car meets,Free,Next up', `events tiles: ${e.cards.map((c, i) => `${c} ${e.vals[i]}`).join(' | ')}`)
ok(e.rows > 0 && e.tiles === e.rows && e.months.length > 0, `${e.rows} events under ${e.months.join(', ')}; weekend ${e.wk}`)
ok(e.filters.length === 3, `filters ${e.filters.join(' / ')}, push ${e.push}`)
await page.click('#re-filter button[data-v="car"]'); await page.waitForTimeout(500)
const carRows = await page.$$eval('#re-list .rd-row', (r) => r.length), carPills = await page.$$eval('#re-list .om-pill.car', (r) => r.length)
ok(carRows === carPills, `Car meets filter: ${carRows} rows, all car (${carPills})`)
ok((await sideways()) <= 1, 'no sideways scroll on Events')
await page.screenshot({ path: `${OUT}/${W}-${THEME}-events.png`, fullPage: true })

ok(!errs.length, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`)
await browser.close()
console.log(fails.length ? `${fails.length} FAILED` : 'ALL GREEN', '->', OUT)
process.exit(fails.length ? 1 : 0)
