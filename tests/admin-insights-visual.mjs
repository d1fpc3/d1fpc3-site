// Manual: python -m http.server 8123 from the repo root, then node tests/admin-insights-visual.mjs (ADMIN_URL / OUT / W / H / FIXTURE=0 env).
// Drive the admin's new and fixed surfaces as the owner. admin_insights answers with the real payload; with
// FIXTURE=1 (default) page time is layered on top (the members app only started reporting it today), so the
// Pages, heat map and person sheet can be exercised with numbers in them. OUT=<dir> W=1440 node admin-insights-test.mjs
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || './ins-test'; mkdirSync(OUT, { recursive: true })
const URL = process.env.ADMIN_URL || 'http://127.0.0.1:8123/echelon/admin/'
const LOCAL = /127\.0\.0\.1|localhost/.test(URL)
const FIXTURE = process.env.FIXTURE !== '0'
const W = +(process.env.W || 1440), H = +(process.env.H || 900)
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
const fails = [], ok = (c, w) => { console.log((c ? '  ok   ' : '  FAIL ') + w); if (!c) fails.push(w) }

// deterministic page time for the members who were really active, so every chart has something to draw
function layer(D) {
  const VIEWS = ['overview', 'chart', 'gex', 'news', 'course', 'chat', 'library', 'watching', 'journal', 'notifs', 'inbox', 'set-profile']
  const act = D.people.filter((p) => p.days > 0)
  D.since = D.from
  D.page_people = []; D.hours = []
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  for (const p of act) {
    p.top = []; p.secs = 0; p.opens = 0
    for (const v of VIEWS) { if (rnd() < 0.35) continue; const s = Math.round(rnd() * 3600 * (v === 'chart' ? 2 : v === 'overview' ? 1.5 : 0.6)), o = 1 + Math.round(rnd() * 20); D.page_people.push({ v, u: p.user_id, o, s }); p.secs += s; p.opens += o }
  }
  D.page_people.sort((a, b) => b.s - a.s)
  for (let dw = 1; dw <= 7; dw++) for (let h = 0; h < 24; h++) { const peak = (h >= 8 && h <= 11 ? 3 : h >= 19 && h <= 22 ? 2 : h >= 13 && h <= 16 ? 1.4 : 0.15) * (dw >= 6 ? 0.4 : 1); if (rnd() < 0.25 * peak) D.hours.push({ dw, h, s: Math.round(rnd() * 900 * peak), p: 1 + Math.round(rnd() * 4) }) }
  for (const x of D.series) x.s = x.n ? Math.round(x.n * (600 + rnd() * 1800)) : 0
  for (const v of D.videos) { v.secs = v.viewers * Math.round(120 + rnd() * 600); v.frac = 0.2 + rnd() * 0.7; for (const w of v.who) { w.s = Math.round(rnd() * 900); w.f = Math.round(rnd() * 100) / 100 } }
  return D
}

const browser = await PW.chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark' })
if (LOCAL) await ctx.route('**/functions/v1/admin-api', async (r) => {
  const req = r.request()
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } })
  const res = await fetch(req.url(), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: req.headers()['authorization'] || `Bearer ${session.access_token}` }, body: req.postData() })
  r.fulfill({ status: res.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await res.text() })
})
const asked = []
await ctx.route('**/rest/v1/rpc/admin_insights', async (r) => {
  const body = JSON.parse(r.request().postData() || '{}'); asked.push(body.p_days)
  const res = await fetch(r.request().url(), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) })
  let D = await res.json()
  if (FIXTURE && res.ok) D = layer(D)
  r.fulfill({ status: res.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(D) })
})
await ctx.addInitScript(([k, v]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, v); localStorage.setItem('echelon-theme', 'dark'); localStorage.removeItem('echelon-ins-days'); for (const g of ['insights', 'members', 'money', 'course', 'community']) localStorage.removeItem('echelon-admin-group:' + g) }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
const page = await ctx.newPage(), errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#app.on', { timeout: 60000 })
await page.waitForTimeout(4000)
const shot = (n) => page.screenshot({ path: `${OUT}/${W}-${n}.png`, fullPage: true })
const click = (sel) => page.evaluate((sel) => { const n = document.querySelector(sel); if (!n) return false; n.click(); return true }, sel)

// the shell: no Desk, no walkthrough, Insights second
const shell = await page.evaluate(() => ({ places: [...document.querySelectorAll('.grp[data-grp]')].map((b) => b.dataset.grp), links: document.querySelectorAll('.side-groups a.grp').length, tour: !!document.getElementById('admin-tour-btn') || !!document.querySelector('.tour-card'), desk: !!document.getElementById('v-gex') || !!document.getElementById('v-memes') }))
ok(shell.places.join() === 'overview,insights,members,money,course,community,settings', `places: ${shell.places.join(', ')}`)
ok(!shell.links && !shell.tour && !shell.desk, 'no Desk, no desk links, no walkthrough')
const badges = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.gc[data-gc]')].map((b) => [b.dataset.gc, b.textContent])))
ok(!badges.course && !badges.insights, `rail badges are only what waits on you: ${JSON.stringify(badges)}`)

// overview: tiles, pulse
const ov = await page.evaluate(() => ({ cards: [...document.querySelectorAll('#cards .scard .k')].map((k) => k.textContent), pulsePages: document.querySelectorAll('#ovp-pages .ps-row').length, nudges: document.querySelectorAll('#ovp-nudge .ovp-nudge').length, recent: [...document.querySelectorAll('#recent-buyers tbody tr td:first-child')].map((t) => t.textContent), overlap: [...document.querySelectorAll('#cards .scard')].some((c) => { const s = c.querySelector('.spark'), d = c.querySelector('.d'); if (!s || !d) return false; const a = s.getBoundingClientRect(), b = d.getBoundingClientRect(); return a.bottom > b.top && a.top < b.bottom && a.left < b.right }) }))
ok(ov.cards.join() === 'Members,Active today,Revenue,Course,Indicators', `overview tiles: ${ov.cards.join(', ')}`)
ok(!ov.overlap, 'no sparkline sits on a caption')
ok(ov.pulsePages > 0 && ov.nudges >= 1, `this week in the app: ${ov.pulsePages} page rows, ${ov.nudges} nudges`)
ok(!ov.recent.some((t) => /appreview|frankiepc3|d1fpc3@gmail/.test(t)), 'latest members leaves out your own and the review account')
await shot('overview')

// insights: activity
await click('.grp[data-grp="insights"]'); await page.waitForTimeout(2200)
const ia = await page.evaluate(() => ({ view: document.querySelector('.view.on')?.id, tiles: document.querySelectorAll('#ia-cards .scard').length, bars: document.querySelectorAll('#ia-days .bar').length, heat: document.querySelectorAll('#ia-heat .hc[data-l]').length, slip: document.querySelectorAll('#ia-slip .ins-person').length, range: [...document.querySelectorAll('#v-ins-activity .ins-bar .seg button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')).join(' ') }))
ok(ia.view === 'v-ins-activity' && ia.tiles === 4 && ia.bars > 0, `Activity: ${ia.tiles} tiles, ${ia.bars} day bars`)
ok(ia.heat > 10, `the heat map has ${ia.heat} lit hours`)
ok(ia.range === '7 days 30 days* 90 days', `range control: ${ia.range}`)
const bar = await page.$('#ia-days .hit[data-i]:nth-last-of-type(1)')
const hits = await page.$$('#ia-days .hit'); await hits[hits.length - 1].hover(); await page.waitForTimeout(250)
const tip = await page.evaluate(() => { const t = document.querySelector('.ins-tip'); return t && !t.hidden ? t.textContent : null })
ok(!!tip && /member/.test(tip), `hovering a day shows its tooltip: "${tip}"`)
const cell = await page.$('#ia-heat .hc[data-l]'); await cell.hover(); await page.waitForTimeout(200)
const tip2 = await page.evaluate(() => document.querySelector('.ins-tip')?.textContent)
ok(/to/.test(tip2 || '') && /on screen/.test(tip2 || ''), `hovering an hour: "${tip2}"`)
await page.mouse.move(5, 5)
await shot('ins-activity')
// the range: 7 days asks the server for 7
await page.evaluate(() => [...document.querySelectorAll('#v-ins-activity .ins-bar .seg button')].find((b) => b.textContent === '7 days').click()); await page.waitForTimeout(1800)
ok(asked.includes(7), `7 days asks for 7 (asked ${asked.join(',')})`)
const bars7 = await page.evaluate(() => document.querySelectorAll('#ia-days .hit').length)
ok(bars7 === 7, `seven day columns (${bars7})`)
await page.evaluate(() => [...document.querySelectorAll('#v-ins-activity .ins-bar .seg button')].find((b) => b.textContent === '30 days').click()); await page.waitForTimeout(1500)

// the thumb slides between pages and sits on the live button
const thumbAt = () => page.evaluate(() => { const s = document.querySelector('#subnav .sub-seg'), t = s.querySelector('.thumb').getBoundingClientRect(), b = s.querySelector('button.on').getBoundingClientRect(); return Math.abs(t.left - b.left) + Math.abs(t.width - b.width) })
await click('#subnav .sub-seg button[data-view="ins-pages"]'); await page.waitForTimeout(1500)
ok(await thumbAt() < 2, 'the segment thumb sits on Pages')
const segSame = await page.evaluate(() => { const a = document.querySelector('#subnav .sub-seg'); document.querySelector('#subnav .sub-seg button[data-view="ins-videos"]').click(); return document.querySelector('#subnav .sub-seg') === a })
ok(segSame, 'switching pages inside a place keeps the segment (the thumb slides instead of regrowing)')
await page.waitForTimeout(600)
await click('#subnav .sub-seg button[data-view="ins-pages"]'); await page.waitForTimeout(1200)

// pages
const ip = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#ip-list .ip-row .n')].map((n) => n.textContent) }))
ok(ip.rows.length >= 5 && ip.rows.includes('Notifications') && !ip.rows.includes('notifs') && !ip.rows.includes('inbox'), `pages by name: ${ip.rows.join(', ')}`)
await click('#ip-list .ip-row .ip-head'); await page.waitForTimeout(500)
const who = await page.evaluate(() => document.querySelectorAll('#ip-list .ip-row.open .ins-person').length)
ok(who > 0, `tapping a page lists who uses it (${who})`)
await shot('ins-pages')

// videos
await click('#subnav .sub-seg button[data-view="ins-videos"]'); await page.waitForTimeout(1200)
const iv = await page.evaluate(() => document.querySelectorAll('#iv-list .iv-row').length)
ok(iv >= 1, `library videos: ${iv}`)
await click('#iv-list .iv-row .iv-head'); await page.waitForTimeout(500)
const ivw = await page.evaluate(() => ({ who: document.querySelectorAll('#iv-list .iv-row.open .iv-who tbody tr').length, not: document.querySelectorAll('#iv-list .iv-row.open .pchip').length }))
ok(ivw.who > 0, `a video lists who watched (${ivw.who}) and who has not (${ivw.not})`)
await shot('ins-videos')
await page.evaluate(() => [...document.querySelectorAll('#v-ins-videos .ins-bar .seg button')].find((b) => b.dataset.v === 'lessons').click()); await page.waitForTimeout(700)
const il = await page.evaluate(() => ({ rows: document.querySelectorAll('#iv-list .il-row').length, mods: document.querySelectorAll('#iv-list .il-mod').length }))
ok(il.rows > 20 && il.mods > 2, `course lessons in order: ${il.rows} lessons in ${il.mods} chapters`)
await shot('ins-lessons')

// people
await click('#subnav .sub-seg button[data-view="ins-people"]'); await page.waitForTimeout(1200)
const pp = await page.evaluate(() => document.querySelectorAll('#ipp-table tbody tr').length)
ok(pp >= 15, `people: ${pp} rows`)
await page.evaluate(() => [...document.querySelectorAll('#ipp-table th')].find((t) => t.textContent.startsWith('Visits')).click()); await page.waitForTimeout(300)
const sorted = await page.evaluate(() => [...document.querySelectorAll('#ipp-table tbody tr .ipp-days b')].map((b) => +b.textContent))
ok(sorted.every((v, i) => !i || sorted[i - 1] >= v), `sorting by Visits: ${sorted.slice(0, 8).join(' ')}`)
await page.evaluate(() => [...document.querySelectorAll('#v-ins-people .ins-bar .seg button')].find((b) => b.dataset.v === 'slipping').click()); await page.waitForTimeout(300)
const slip = await page.evaluate(() => document.querySelectorAll('#ipp-table tbody tr').length)
ok(slip > 0 && slip < pp, `Slipping narrows it to ${slip}`)
await page.evaluate(() => [...document.querySelectorAll('#v-ins-people .ins-bar .seg button')].find((b) => b.dataset.v === 'all').click()); await page.waitForTimeout(300)
await page.fill('#v-ins-people .ins-q', 'emashi'); await page.waitForTimeout(300)
const q = await page.evaluate(() => [...document.querySelectorAll('#ipp-table tbody tr .nm b')].map((b) => b.textContent))
ok(q.length === 1 && /emashi/.test(q[0]), `search finds one: ${q.join(', ')}`)
await shot('ins-people')
await click('#ipp-table tbody tr'); await page.waitForTimeout(700)
const sheet = await page.evaluate(() => { const s = document.querySelector('.psheet'); if (!s) return null; const r = s.getBoundingClientRect(); return { name: s.querySelector('h3')?.textContent, secs: [...s.querySelectorAll('.ps-sec h4')].map((h) => h.firstChild.textContent), cal: s.querySelectorAll('.ps-cal i').length, vids: s.querySelectorAll('.ps-vid').length, inView: r.right <= innerWidth + 1 && r.left >= 0, focus: document.activeElement?.className } })
ok(sheet && /emashi/.test(sheet.name) && sheet.secs.join() === 'Visits,Pages,Videos,In the last 30 days' && sheet.cal === 30 && sheet.inView, `the person sheet: ${JSON.stringify(sheet)}`)
await page.screenshot({ path: `${OUT}/${W}-person-sheet.png` })
await page.keyboard.press('Escape'); await page.waitForTimeout(500)
ok(await page.evaluate(() => !document.querySelector('.psheet-scrim')), 'Escape closes the sheet')

// community: mods, past requests, reports
await click('.grp[data-grp="community"]'); await page.waitForTimeout(1500)
const cm = await page.evaluate(() => ({ mods: document.querySelectorAll('#mod-table .mod-chip').length, pickHidden: document.getElementById('mod-picker').hidden, appRows: document.querySelectorAll('#app-table tbody tr').length, appWrap: document.querySelector('#app-table').closest('.tbl-scroll').hidden, hist: document.getElementById('app-hist').textContent, liveHead: document.querySelector('#live-table').closest('.tbl-scroll').hidden }))
ok(cm.mods >= 1 && cm.pickHidden, `mods as chips (${cm.mods}), the picker closed until you type`)
ok(cm.appRows === 0 && cm.appWrap && /past/.test(cm.hist), `free requests fold away: "${cm.hist}"`)
ok(cm.liveHead, 'an empty table shows its empty line, not bare headers')
await page.fill('#mod-q', 'o'); await page.waitForTimeout(300)
const pick = await page.evaluate(() => ({ open: !document.getElementById('mod-picker').hidden, n: document.querySelectorAll('#mod-picker .mod-row').length }))
ok(pick.open && pick.n > 0 && pick.n <= 8, `typing lists up to 8 members to promote (${pick.n})`)
await page.fill('#mod-q', ''); await page.waitForTimeout(200)
await click('#app-hist'); await page.waitForTimeout(300)
const hist = await page.evaluate(() => { const emails = [...document.querySelectorAll('#app-table tbody tr td:first-child')].map((t) => t.textContent); return { n: emails.length, dupes: emails.length - new Set(emails).size } })
ok(hist.n > 0 && hist.dupes === 0, `past requests: ${hist.n}, one row per person`)
await click('#app-hist')
await shot('community')

// course, video library: the row menu
await click('.grp[data-grp="course"]'); await page.waitForTimeout(800)
await click('#subnav .sub-seg button[data-view="library"]'); await page.waitForTimeout(1800)
const libCols = await page.evaluate(() => [...document.querySelectorAll('#lib-table thead th')].map((t) => t.textContent))
ok(libCols.join() === 'Video,Watched,Who can watch,Captions,', `library columns: ${libCols.join(' | ')}`)
await click('#lib-table .more-btn'); await page.waitForTimeout(400)
const menu = await page.evaluate(() => [...document.querySelectorAll('#rmenu button')].map((b) => b.textContent))
ok(menu.includes('Who can watch') && menu.includes('Delete video'), `the "..." menu: ${menu.join(', ')}`)
await page.screenshot({ path: `${OUT}/${W}-library-menu.png` })
await page.keyboard.press('Escape'); await page.waitForTimeout(300)
ok(await page.evaluate(() => !document.getElementById('rmenu')), 'Escape closes the menu')

// settings in plain words
await click('.grp[data-grp="settings"]'); await page.waitForTimeout(1500)
const st = await page.evaluate(() => [...document.querySelectorAll('#integrations .set-row')].map((r) => r.querySelector('.n').textContent + ':' + r.querySelector('.conn').textContent))
ok(st.length === 5 && !st.some((s) => /Bunny/.test(s)), `settings rows: ${st.join(', ')}`)
await shot('settings')

// statistics leaves out house accounts
await click('.grp[data-grp="members"]'); await page.waitForTimeout(600)
await click('#subnav .sub-seg button[data-view="stats"]'); await page.waitForTimeout(1200)
const sts = await page.evaluate(() => [...document.querySelectorAll('#onb-table tbody tr td:first-child')].map((t) => t.textContent))
ok(!sts.some((t) => /appreview|@d1fpc3$/.test(t)), 'Statistics leaves out your own and the review account')
await click('#subnav .sub-seg button[data-view="users"]'); await page.waitForTimeout(800)
const tags = await page.evaluate(() => [...document.querySelectorAll('#users-table .house-tag')].map((t) => t.textContent))
ok(tags.length >= 2, `Users tags house accounts: ${tags.join(', ')}`)

ok(!errs.length, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`)
await browser.close()
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed')
process.exit(fails.length ? 1 : 0)
