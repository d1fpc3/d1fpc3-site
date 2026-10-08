// Manual: python -m http.server 8123 from the repo root, then node tests/admin-personal-visual.mjs (ADMIN_URL / OUT / W / H / THEME env).
// Money > Personal as the owner: every section renders from owner_money, nothing spills sideways on a phone, and
// one plan tick saves and un-saves (the row is compared before and after, so the run leaves it exactly as it was).
// Screenshots hold D1's real figures: OUT defaults to the temp folder, never the repo.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || join(tmpdir(), 'echelon-personal'); mkdirSync(OUT, { recursive: true })
const URL = process.env.ADMIN_URL || 'http://127.0.0.1:8123/echelon/admin/'
const W = +(process.env.W || 1440), H = +(process.env.H || 900), THEME = process.env.THEME || 'dark'
const TICK = process.env.TICK !== '0'
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const SH = { apikey: service, Authorization: `Bearer ${service}` }
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { ...SH, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
const fails = [], ok = (c, w) => { console.log((c ? '  ok   ' : '  FAIL ') + w); if (!c) fails.push(w) }
const latest = async () => (await (await fetch(`${SB}/rest/v1/owner_money?select=id,data&order=as_of.desc,id.desc&limit=1`, { headers: SH })).json())[0]
const before = await latest()
if (!before) throw new Error('no owner_money row to show')

const browser = await PW.chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: THEME })
// admin-api only answers d1fpc3.com: relay it from a local server, as the other admin harnesses do
if (/127\.0\.0\.1|localhost/.test(URL)) await ctx.route('**/functions/v1/admin-api', async (r) => {
  const req = r.request()
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } })
  const res = await fetch(req.url(), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: req.headers()['authorization'] || `Bearer ${session.access_token}` }, body: req.postData() })
  r.fulfill({ status: res.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await res.text() })
})
await ctx.addInitScript(([k, v, theme]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, v); localStorage.setItem('echelon-theme', theme); localStorage.removeItem('echelon-admin-group:money') }, [`sb-${REF}-auth-token`, JSON.stringify(session), THEME])
const page = await ctx.newPage(), errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)) })
// a failed request is named by its URL, so a 403 says which call it was
// (Hostinger's bot check answers a headless browser's first page load with a 403 and then lets it through: not ours)
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !(r.status() === 403 && r.request().isNavigationRequest())) errs.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '').slice(0, 120)}`) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#app.on', { timeout: 60000 })
await page.waitForTimeout(1500)

// the real way in: the Money place on the rail, then Personal in its segment
await page.click('.grp[data-grp="money"]')
await page.waitForSelector('#subnav .sub-seg button[data-view="mine"]', { timeout: 10000 })
const segs = await page.$$eval('#subnav .sub-seg button[data-view]', (b) => b.map((x) => x.textContent.trim()))
ok(segs.join() === 'Billing,Growth,Personal', `money segment: ${segs.join(', ')}`)
await page.click('#subnav .sub-seg button[data-view="mine"]')
await page.waitForFunction(() => document.querySelectorAll('#om-plan .om-row').length > 0, null, { timeout: 20000 })
await page.waitForTimeout(1200)

const s = await page.evaluate(() => {
  const q = (sel) => [...document.querySelectorAll(sel)]
  return {
    title: document.getElementById('pane-title').textContent,
    on: document.getElementById('v-mine').classList.contains('on'),
    cards: q('#om-cards .scard .k').map((k) => k.textContent), vals: q('#om-cards .scard .v').map((v) => v.textContent),
    read: !document.getElementById('om-read').hidden && document.getElementById('om-read').textContent.length > 80,
    plan: q('#om-plan .om-row').length, done: q('#om-plan .om-row.done').length, planN: document.getElementById('om-plan-n').textContent,
    prog: document.getElementById('om-prog').style.width,
    dates: q('#om-dates .om-row').length, datePills: q('#om-dates .om-pill').map((p) => p.textContent),
    inRows: q('#om-in .om-fl').length, outRows: q('#om-out .om-fl').length, bars: q('#om-out .om-bars i').filter((i) => i.getBoundingClientRect().width > 0).length,
    prop: q('#om-prop .om-row').length, propN: document.getElementById('om-prop-n').textContent,
    rules: q('#om-rules li').length, bills: q('#om-bills .om-row').length, billsN: document.getElementById('om-bills-n').textContent,
    acct: q('#om-acct .om-row').length, worth: document.querySelector('#om-acct .total .om-amt')?.textContent,
    empty: !document.getElementById('om-empty').hidden,
    foot: document.getElementById('om-foot').textContent,
    wide: document.scrollingElement.scrollWidth - window.innerWidth,
    clipped: q('#v-mine .om-row, #v-mine .om-fl').filter((r) => r.scrollWidth > r.clientWidth + 1).length,
  }
})
const D = before.data
ok(s.on && s.title === 'Personal', `Personal view open (${s.title})`)
ok(s.cards.join() === 'Net worth,Coming in, a month,Going out, a month,Trading, after fees', `tiles: ${s.cards.join(' | ')} = ${s.vals.join(' | ')}`)
ok(s.read, 'the read paragraph shows')
ok(s.plan === D.plan.length && s.done === D.plan.filter((p) => p.done).length, `plan ${s.done}/${s.plan} (${s.planN}), bar ${s.prog}`)
ok(s.dates === D.dates.length, `dates: ${s.datePills.join(', ')}`)
ok(s.inRows === D.income.length + 1 && s.outRows === D.spend.length + 1, `in ${s.inRows} rows, out ${s.outRows} rows`)
ok(s.bars >= D.spend.length, `bars drew (${s.bars})`)
ok(s.prop === D.prop.length, `prop firms ${s.prop} (${s.propN})`)
ok(s.rules === D.rules.length, `rules ${s.rules}`)
ok(s.bills === D.bills.length, `bills ${s.bills} (${s.billsN})`)
ok(s.acct === D.accounts.length + 1, `accounts ${s.acct}, net worth ${s.worth}`)
ok(!s.empty, 'no empty state for the owner')
ok(/only your own login/.test(s.foot), 'privacy line in the footer')
ok(s.wide <= 1, `no sideways scroll (${s.wide}px)`)
ok(s.clipped === 0, `no row clips its content (${s.clipped})`)
await page.screenshot({ path: `${OUT}/${W}-${THEME}-personal.png`, fullPage: true })

if (TICK) {
  // tick the first open task, read it back, untick it, and leave the row exactly as it was
  const idx = D.plan.findIndex((p) => !p.done)
  const row = page.locator('#om-plan .om-row').nth(idx)
  await row.click()
  await page.waitForTimeout(1600)
  const mid = await latest()
  ok(mid.data.plan[idx].done === true, `tick saved: "${D.plan[idx].text}"`)
  ok(await row.evaluate((r) => r.classList.contains('done') && r.querySelector('.om-check').getAttribute('aria-checked') === 'true'), 'row shows done, checkbox says checked')
  await page.screenshot({ path: `${OUT}/${W}-${THEME}-ticked.png`, clip: await page.locator('#om-plan').evaluate((n) => { const r = n.closest('.block').getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, width: r.width, height: r.height } }) })
  await row.click()
  await page.waitForTimeout(1600)
  const after = await latest()
  ok(JSON.stringify(after.data) === JSON.stringify(before.data), 'untick restored the row exactly')
}
ok(!errs.length, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`)
await browser.close()
console.log(fails.length ? `${fails.length} FAILED` : 'ALL GREEN', '->', OUT)
process.exit(fails.length ? 1 : 0)
