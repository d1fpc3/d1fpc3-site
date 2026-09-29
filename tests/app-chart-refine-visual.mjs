// Chart refinements of 2026-09-28 (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-refine-visual.mjs        (APP_URL / OUT env)
//
// D1, 09-28: "Keep going in there and just refining the chart. Just test everything to the max." What the
// sweep found, and what each fix has to keep true:
//   the archive     66 of NQ's "daily" rows were MONTHS (Yahoo answers interval=1d&range=max in months, each
//                   stamped the 1st): a Saturday candle the size of August and ten million contracts that
//                   flattened the volume pane. None may come back.
//   the daily       a day is the archive's daily bar wherever there is one (true 18:00 open, the settlement
//                   close), stamped with its trade date: the crosshair read "Sun 27 Sep" on Monday's bar, and
//                   the first day built from the minutes opened 150 points off.
//   the load        the hourly archive (45k bars) came in behind the minute one: a cold 4H chart sat on 22 bars
//                   for ten seconds. The recent slice now comes first.
//   the 4H          the out-of-session shade striped every other 4H bar; it stops at the hourly, as the
//                   Pine's own session boxes do.
//   the tag         at 1440 the OHLC row runs past the middle and the low printed across "@appreview".
//   the scale       the top price printed half off the canvas.
//   light canvas    D1's light grey up candles with white edges vanished on the light theme; untouched, they
//                   read as their mirror there (white body, ink edge), volume included.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-chart-refine`; mkdirSync(OUT, { recursive: true })
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: process.env.EMAIL || 'appreview@d1fpc3.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
const fails = [], ok = (c, w) => { console.log((c ? '  ok   ' : '  FAIL ') + w); if (!c) fails.push(w) }
const seed = (ctx, { theme = 'dark', tf = '5m' } = {}) => ctx.addInitScript(([k, v, theme, tf]) => {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  localStorage.setItem(k, v); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', theme); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1')
  localStorage.setItem('echelon-chart-sym', 'NQ'); localStorage.setItem('echelon-chart-tf', tf); localStorage.removeItem('echelon-chart-settings')
}, [`sb-${REF}-auth-token`, JSON.stringify(session), theme, tf])
async function open(ctx, wait = true) {
  const page = await ctx.newPage(), errs = []; page.on('pageerror', (e) => errs.push(String(e.message)))
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#td-h1', { state: 'attached', timeout: 60000 }); await page.waitForTimeout(1500)
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  const t0 = Date.now()
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click())
  if (wait) { await page.waitForFunction(() => window.__CH?.bars?.length > 50, null, { timeout: 45000 }).catch(() => {}); await page.waitForTimeout(4000) }
  return { page, errs, t0 }
}
const browser = await PW.chromium.launch({ channel: 'chrome' })

// ── the archive ──
console.log('\nthe daily archive')
{
  const from = new Date(Date.now() - 800 * 864e5).toISOString().slice(0, 10), to = new Date(Date.now() + 864e5).toISOString().slice(0, 10)
  const j = await (await fetch(`${SB}/functions/v1/tape?interval=1d&from=${from}&to=${to}&symbol=NQ`, { headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` } })).json()
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  const wk = (t) => { const p = {}; for (const x of f.formatToParts(new Date(t * 1000))) p[x.type] = x.value; return p }
  const bars = j.bars || [], sat = bars.filter((b) => wk(b[0]).weekday === 'Sat'), sunMid = bars.filter((b) => { const p = wk(b[0]); return p.weekday === 'Sun' && +p.hour % 24 === 0 })
  const vs = bars.map((b) => b[5]).filter((v) => v > 0).sort((a, b) => a - b), med = vs[Math.floor(vs.length / 2)], big = bars.filter((b) => b[5] > 8 * med)
  ok(bars.length > 400, `two years of NQ days from the tape (${bars.length})`)
  ok(!sat.length && !sunMid.length, `no day stamped on a Saturday or at Sunday midnight (${sat.length} / ${sunMid.length})`)
  ok(!big.length, `no day trades eight times the median of ${med} (${big.map((b) => new Date(b[0] * 1000).toISOString().slice(0, 10) + ' ' + b[5]).join(', ') || 'none'})`)
}

// ── the daily chart ──
console.log('\n1440, daily')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await seed(ctx, { tf: 'D' })
  const { page, errs } = await open(ctx)
  const r = await page.evaluate(() => {
    const C = window.__CH; C.s.badj = false; C.$.build(); C.$.paint()
    const bars = C.bars, n = bars.length, f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
    const hm = (t) => { const p = {}; for (const x of f.formatToParts(new Date(t * 1000))) p[x.type] = x.value; return (+p.hour % 24) * 60 + +p.minute }
    const arch = new Map(C.base['1d'].map((b) => [b[0], b]))
    let matched = 0, off = []
    for (const b of bars.slice(0, -1)) { const a = arch.get(b.t); if (!a) continue; matched++; if (a[1] !== b.o || a[2] !== b.h || a[3] !== b.l || a[4] !== b.c) off.push(new Date(b.t * 1000).toISOString().slice(0, 10)) }
    const lastT = bars[n - 1].t, m1 = C.base['1m'], sess = m1.filter((b) => b[0] >= lastT - 6 * 3600 && b[0] < lastT + 18 * 3600)
    const rolls = (C.$.rolls() || []).length
    return { rolls, n, sorted: bars.every((b, i) => !i || b.k > bars[i - 1].k), midnight: bars.filter((b) => hm(b.t) !== 0).map((b) => new Date(b.t * 1000).toISOString()).slice(0, 5), matched, off: off.slice(0, 5), recent: bars.slice(-30).filter((b) => arch.has(b.t)).length, lastO: bars[n - 1].o, sessO: sess[0]?.[1], sessN: sess.length }
  })
  ok(r.n > 5000 && r.sorted, `${r.n} days, one per trade date, in order`)
  ok(!r.midnight.length, `every day is stamped midnight ET, its trade date (${r.midnight.join(', ') || 'all'})`)
  ok(r.matched > 5000 && r.off.length <= r.rolls, `a finished day is the archive's own bar (${r.matched} matched; off: ${r.off.join(', ') || 'none'}, a roll day may split: ${r.rolls})`)
  ok(r.recent >= 25, `the last month too, not days rebuilt from the minutes (${r.recent} of 30)`)
  ok(r.sessN > 0 && r.lastO === r.sessO, `today is built from the minutes and opens on the session's first bar (${r.lastO} / ${r.sessO})`)
  // the crosshair on today's bar says today's date
  const pos = await page.evaluate(() => { const C = window.__CH, b = C.bars.at(-1), p = C.$.pt(b.t, b.c), r = document.getElementById('ch-canvas').getBoundingClientRect(); return { x: r.left + p.x, y: r.top + r.height * 0.4 } })
  await page.mouse.move(pos.x, pos.y); await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/1440-daily-hover.png` })
  ok(!errs.length, `no page errors (${errs.join(' | ') || 'none'})`)
  await ctx.close()
}

// ── a cold 4H chart ──
console.log('\n2560, a cold 4H chart')
{
  const ctx = await browser.newContext({ viewport: { width: 2560, height: 1300 } }); await seed(ctx, { tf: '4h' })
  const { page, t0 } = await open(ctx, false)
  let first = null, full = null
  for (let i = 0; i < 60 && full == null; i++) {
    const n = await page.evaluate(() => (window.__CH?.vis || window.__CH?.bars || []).length)
    if (first == null && n >= 300) first = Date.now() - t0
    if (n >= 5000) full = Date.now() - t0
    await page.waitForTimeout(250)
  }
  ok(first != null && first < 5000, `300+ bars on screen at ${first} ms (it used to wait ten seconds on 22)`)
  ok(full != null, `and the years behind them at ${full} ms`)
  await page.waitForTimeout(1500)
  // the shade: a row just under the volume pane's top edge, where no bar reaches, holds one colour at 4H
  const shade = await page.evaluate(() => {
    const C = window.__CH, cv = document.getElementById('ch-canvas'), g = cv.getContext('2d'), dpr = cv.width / cv.getBoundingClientRect().width
    const L = { mainH: C.axisAt.mainH, plotW: C.axisAt.plotW }, y = Math.round((L.mainH + 3) * dpr), d = g.getImageData(0, y, Math.round(L.plotW * dpr) - 4, 1).data
    const set = new Set(); for (let i = 0; i < d.length; i += 4) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2])
    return [...set]
  })
  ok(shade.length <= 2, `no out-of-session stripes across a 4H chart (${shade.length} colours: ${shade.slice(0, 4).join(' ')})`)
  await page.screenshot({ path: `${OUT}/2560-4h.png` })
  // and the hourly keeps its shade
  await page.evaluate(() => { document.querySelector('#ch-tf button[data-tf="1h"]')?.click() })
  await page.waitForTimeout(1500)
  const shade1h = await page.evaluate(() => {
    const C = window.__CH, cv = document.getElementById('ch-canvas'), g = cv.getContext('2d'), dpr = cv.width / cv.getBoundingClientRect().width
    const y = Math.round((C.axisAt.mainH + 3) * dpr), d = g.getImageData(0, y, Math.round(C.axisAt.plotW * dpr) - 4, 1).data
    const set = new Set(); for (let i = 0; i < d.length; i += 4) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2])
    return [...set].length
  })
  ok(shade1h >= 2, `the hourly still shades outside 9:30 to 16:00 (${shade1h} colours)`)
  await ctx.close()
}

// ── the tag and the scale at 1440 ──
console.log('\n1440, grey canvas, 15m')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await seed(ctx, { tf: '15m' })
  const { page, errs } = await open(ctx)
  const r = await page.evaluate(() => {
    const C = window.__CH, cv = document.getElementById('ch-canvas'), c = cv.getBoundingClientRect(), tag = C.wmRect
    const rows = [...document.querySelectorAll('#ch-legend .ln')].map((n) => n.getBoundingClientRect()).filter((r) => r.width).map((r) => ({ x0: r.left - c.left, x1: r.right - c.left, y0: r.top - c.top, y1: r.bottom - c.top }))
    const hit = tag && rows.filter((r) => tag.x0 + 4 < r.x1 && tag.x1 - 4 > r.x0 && tag.y0 + 2 < r.y1 && tag.y1 - 3 > r.y0)
    const vch = document.getElementById('v-chart')
    return { tag, hits: hit ? hit.length : -1, ticks: C.axisAt.ticks, mainH: C.axisAt.mainH, halo: getComputedStyle(vch).getPropertyValue('--ch-bg').trim(), bg: C.bgNow, shadow: getComputedStyle(document.querySelector('#ch-legend .ln')).textShadow }
  })
  ok(r.tag && r.hits === 0, `the watermark tag sits clear of every legend row (tag y ${Math.round(r.tag?.y0)} to ${Math.round(r.tag?.y1)}, ${r.hits} rows crossed)`)
  ok(r.ticks.length > 4 && r.ticks.every((y) => y >= 8 && y <= r.mainH - 6), `every price on the scale prints whole (${r.ticks.length} ticks, top at ${Math.round(Math.min(...r.ticks))}px)`)
  ok(r.halo.toLowerCase() === r.bg.toLowerCase() && /px/.test(r.shadow), `the legend rows wear a halo in the canvas colour (${r.halo})`)
  // the crosshair's price tag, on the tick like the context menu's "Add alert at"
  await page.screenshot({ path: `${OUT}/1440-15m.png` })
  ok(!errs.length, `no page errors (${errs.join(' | ') || 'none'})`)
  await ctx.close()
}

// ── the light canvas ──
console.log('\n1440, light theme, 5m')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await seed(ctx, { theme: 'light', tf: '5m' })
  const { page, errs } = await open(ctx)
  const r = await page.evaluate(() => {
    const C = window.__CH, K = C.candleC, lum = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2] }
    const cr = (a, b) => { const x = lum(a), y = lum(b); return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2) }
    return { bg: C.bgNow, light: C.lightBg, s: { up: C.s.up, wickUp: C.s.wickUp }, K: { up: K.up, wickUp: K.wickUp, borderUp: K.borderUp, wickDown: K.wickDown, volUp: K.volUp, volDown: K.volDown }, edge: cr(K.borderUp, C.bgNow), wickDn: cr(K.wickDown, C.bgNow), volUp: cr(K.volUp, C.bgNow) }
  })
  ok(r.light && r.s.up === '#dbdbdb', `a light canvas (${r.bg}) with D1's saved candles untouched (${r.s.up} / ${r.s.wickUp})`)
  ok(r.K.up === '#ffffff' && r.edge >= 7, `up candles read as a white body with an ink edge (${r.K.up}, ${r.K.borderUp} at ${r.edge}:1)`)
  ok(r.wickDn >= 3, `down wicks and edges clear the canvas (${r.K.wickDown} at ${r.wickDn}:1; #faa1a4 was 1.9:1)`)
  ok(r.volUp >= 3, `up volume clears it too (${r.K.volUp} at ${r.volUp}:1)`)
  await page.screenshot({ path: `${OUT}/1440-light-5m.png` })
  ok(!errs.length, `no page errors (${errs.join(' | ') || 'none'})`)
  await ctx.close()
}

// ── the phone, daily: a name with no free row slides along its line instead of printing over another ──
console.log('\niPhone 15 Pro, WebKit, daily')
{
  const wk = await PW.webkit.launch()
  const ctx = await wk.newContext({ ...PW.devices["iPhone 15 Pro"] }); await seed(ctx, { tf: "D" })
  const { page, errs } = await open(ctx)
  const r = await page.evaluate(() => { const L = window.__CH.lbl || []; const hit = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j]; if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) hit.push(a.text + " / " + b.text) } return { n: L.length, hit, forced: L.filter((x) => x.forced).map((x) => x.text) } })
  ok(r.n > 3 && !r.hit.length, `${r.n} names on the phone daily, none printed over another (${r.hit.join(", ") || "none"}; drawn where they asked: ${r.forced.join(", ") || "none"})`)
  await page.screenshot({ path: `${OUT}/phone-daily.png` })
  ok(!errs.length, `no page errors (${errs.join(" | ") || "none"})`)
  await wk.close()
}

// ── the views pass (D1, 09-28: "there's still a few things that look off, refine the desktop and phone view") ──
console.log('\n1440, the views pass')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await seed(ctx, { tf: '5m' })
  const { page, errs } = await open(ctx)
  const natives = []; page.on('dialog', async (d) => { natives.push(d.type()); await d.dismiss() })
  const geo = () => page.evaluate(() => { const c = document.getElementById('ch-canvas').getBoundingClientRect(), m = document.getElementById('ch-menu'), r = m.getBoundingClientRect(); return { cv: Math.round(c.right), ml: Math.round(r.left), mr: Math.round(r.right), open: !m.hidden, dock: document.querySelector('#v-chart .ch-body').classList.contains('dock') } })
  // chart type: six rows, a picture beside each name, none cut off
  await page.click('#ch-type-btn'); await page.waitForTimeout(500)
  const ty = await page.evaluate(() => { const m = document.getElementById('ch-menu'), bs = [...m.querySelectorAll('.ch-opt-ty')]; return { n: bs.length, flex: bs.every((b) => getComputedStyle(b).display === 'flex'), tall: Math.max(...bs.map((b) => b.getBoundingClientRect().height)), fits: m.scrollHeight <= m.clientHeight + 1 && document.getElementById('ch-menu-body').scrollHeight <= document.getElementById('ch-menu-body').clientHeight + 1 } })
  ok(ty.n === 6 && ty.flex && ty.tall < 56 && ty.fits, `chart type: ${ty.n} rows with the picture beside the name (tallest ${Math.round(ty.tall)}px), all in view`)
  await page.evaluate(() => window.__CH.$.menu(null)); await page.waitForTimeout(300)
  // a side drawer docks: the price scale stays in view, and the chart takes the width back after
  const g0 = await geo()
  await page.click('#ch-alerts-btn'); await page.waitForTimeout(600)
  const g1 = await geo()
  ok(g1.dock && g1.open && Math.abs(g1.cv - g1.ml) <= 1 && g1.mr === g0.cv, `Alerts docks beside the chart: the chart ends at ${g1.cv}, the drawer runs ${g1.ml} to ${g1.mr}`)
  await page.screenshot({ path: `${OUT}/1440-alerts-docked.png` })
  await page.evaluate(() => window.__CH.$.menu(null)); await page.waitForTimeout(500)
  const g2 = await geo()
  ok(!g2.dock && g2.cv === g0.cv, `closed, the chart takes its width back (${g2.cv})`)
  // symbol search fits its four futures
  await page.evaluate(() => window.__CH.$.menu('sym')); await page.waitForTimeout(600)
  const sh = await page.evaluate(() => Math.round(document.getElementById('ch-menu').getBoundingClientRect().height))
  ok(sh < 460, `symbol search is as tall as its rows (${sh}px, was 620)`)
  await page.evaluate(() => window.__CH.$.menu(null)); await page.waitForTimeout(300)
  // the indicator Templates row and a part panel
  await page.evaluate(() => window.__CH.$.menu('ind')); await page.waitForTimeout(500)
  const tr = await page.evaluate(() => { const t = document.querySelector('#ch-menu-body .ch-tpl'); const cs = t && getComputedStyle(t); return cs ? { border: cs.borderTopWidth, bg: cs.backgroundColor } : null })
  ok(tr && tr.border === '0px', `the Templates row is a row, not the drawing-template chip's box (border ${tr?.border})`)
  await page.evaluate(() => window.__CH.$.menu('ind:lit')); await page.waitForTimeout(500)
  const lit = await page.evaluate(() => { const m = document.getElementById('ch-menu'), n = [...m.querySelectorAll('.ch-prow .t')].find((x) => /PDH/.test(x.textContent)); return { w: Math.round(m.getBoundingClientRect().width), h: n ? Math.round(n.getBoundingClientRect().height) : 0 } })
  ok(lit.w >= 540 && lit.h > 0 && lit.h < 26, `D1 LIT's parts panel is ${lit.w}px wide and "PDH / PDL" keeps one line (${lit.h}px)`)
  await page.evaluate(() => window.__CH.$.menu(null)); await page.waitForTimeout(300)
  // a layout: named in the chart's own dialog, removed after its own yes
  await page.evaluate(() => window.__CH.$.menu('layouts')); await page.waitForTimeout(500)
  await page.click('#ch-menu-body .rowbtn.pri'); await page.waitForTimeout(400)
  const asked = await page.evaluate(() => document.querySelector('.ch-ask input')?.value)
  await page.fill('.ch-ask input', 'Views pass'); await page.keyboard.press('Enter'); await page.waitForTimeout(600)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('echelon-chart-layouts') || '[]').map((x) => x.name))
  ok(asked && saved.includes('Views pass'), `Save this layout asks in the chart's dialog (offered "${asked}") and keeps it (${saved.join(', ')})`)
  await page.locator('#ch-menu-body .ch-obj button[data-a="x"]').first().click(); await page.waitForTimeout(400)
  const sure = await page.evaluate(() => ({ t: document.querySelector('.ch-ask h4')?.textContent, ok: document.querySelector('.ch-ask .ok')?.textContent }))
  await page.click('.ch-ask .ok'); await page.waitForTimeout(600)
  const gone = await page.evaluate(() => JSON.parse(localStorage.getItem('echelon-chart-layouts') || '[]').length)
  ok(sure.ok === 'Remove' && gone === 0, `Remove asks "${sure.t}" with a ${sure.ok} button, then removes it (${gone} left)`)
  ok(!natives.length, `no native prompt() or confirm() box (${natives.join(', ') || 'none'})`)
  // a line's Extend: two chips
  await page.evaluate(() => { const C = window.__CH, bs = C.bars, n = bs.length; const d = { id: 'xt', type: 'trend', p: [{ t: bs[n - 60].t, p: bs[n - 60].l }, { t: bs[n - 10].t, p: bs[n - 10].h }], color: '' }; C.drawings.push(d); C.sel = d; C.$.build(); C.$.paint(); C.$.menu('draw') }); await page.waitForTimeout(500)
  await page.click('.ch-xt button[data-ext="r"]'); await page.waitForTimeout(200)
  const xt = await page.evaluate(() => ({ r: window.__CH.sel?.ext?.r, pressed: document.querySelector('.ch-xt button[data-ext="r"]').getAttribute('aria-pressed'), boxes: document.querySelectorAll('#ch-menu-body input[type="checkbox"]:not(.tgl input)').length }))
  ok(xt.r === true && xt.pressed === 'true', `Extend is two chips: Right switches the line's right extension on (${JSON.stringify(xt)})`)
  // a trend line the TradingView way (D1: "when I click it should start the drawing and then when I click again it
  // should be done ... and then it should take you back to the crosshair"), with a click that wobbles 6px as real ones do
  await page.evaluate(() => { const C = window.__CH; C.$.menu(null); C.sel = null; C.drawings = []; C.$.paint() }); await page.waitForTimeout(400)
  const R = await (await page.$('#ch-canvas')).boundingBox(), at = (fx, fy) => [R.x + R.width * fx, R.y + R.height * fy]
  const wobble = async ([x, y]) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 6, y + 3, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(150) }
  const tv = []
  for (const k of [0, 1]) {
    await page.click('#ch-tools button[data-tool="trend"]'); await page.waitForTimeout(250)
    const A = at(0.3, 0.6 - k * 0.1), B = at(0.62, 0.35 - k * 0.1)
    await wobble(A)
    const mid = await page.evaluate(() => ({ tool: window.__CH.tool, pending: !!window.__CH.pending, n: window.__CH.drawings.length }))
    for (let s = 1; s <= 10; s++) { await page.mouse.move(A[0] + (B[0] - A[0]) * s / 10, A[1] + (B[1] - A[1]) * s / 10); await page.waitForTimeout(16) }
    await wobble(B)
    const end = await page.evaluate(() => { const C = window.__CH, d = C.drawings.at(-1); return { tool: C.tool, pending: !!C.pending, n: C.drawings.length, span: d ? Math.abs(C.$.pt(d.p[1].t, d.p[1].p).x - C.$.pt(d.p[0].t, d.p[0].p).x) : 0 } })
    await page.mouse.click(...at(0.85, 0.8)); await page.waitForTimeout(200)
    const after = await page.evaluate(() => ({ tool: window.__CH.tool, n: window.__CH.drawings.length, sel: !!window.__CH.sel }))
    tv.push({ mid, end, after })
  }
  ok(tv.every((r, k) => r.mid.tool === 'trend' && r.mid.pending && r.mid.n === k && r.end.n === k + 1 && !r.end.pending && r.end.tool === 'cross' && r.end.span > 200 && r.after.n === k + 1 && !r.after.sel), `click, move, click draws the line, puts the crosshair back, and the next click only deselects, twice over (${JSON.stringify(tv.map((r) => [r.mid.pending, r.end.n, r.end.tool, Math.round(r.end.span), r.after.n]))})`)
  // the feed chip: Yahoo's steady ten-minute delay reads quietly
  const chip = await page.evaluate(() => { const s = document.getElementById('ch-sess'); return { hidden: s.hidden, cls: s.className, text: s.textContent, lag: window.__CH.feedAt ? Math.floor((Date.now() / 1000 - window.__CH.feedAt) / 60) : null } })
  ok(chip.hidden || (chip.lag <= 12 ? /dly/.test(chip.cls) && /^Delayed/.test(chip.text) : /lag/.test(chip.cls)), `the feed chip: "${chip.text || 'hidden'}" (${chip.cls}, ${chip.lag} min)`)
  ok(!errs.length, `no page errors (${errs.join(' | ') || 'none'})`)
  await ctx.close()
}
console.log('\niPhone 15 Pro, WebKit, the views pass')
{
  const wk = await PW.webkit.launch()
  const ctx = await wk.newContext({ ...PW.devices['iPhone 15 Pro'] }); await seed(ctx, { tf: '5m' })
  const { page, errs } = await open(ctx)
  await page.evaluate(() => window.__CH.$.menu('layouts')); await page.waitForTimeout(700)
  const s = await page.evaluate(() => { const m = document.getElementById('ch-menu'), b = m.querySelector('.ch-menu-body > .rowbtn.pri'), body = document.getElementById('ch-menu-body'); const a = +(getComputedStyle(m).backgroundColor.match(/[\d.]+\)$/) || ['1'])[0].replace(')', ''); const bs = getComputedStyle(body); return { a, bw: b ? Math.round(b.getBoundingClientRect().width) : 0, cw: Math.round(body.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight)) } })
  ok(s.a >= 0.9, `a sheet is solid enough that the bar under it does not ghost through (alpha ${s.a})`)
  ok(s.bw > 0 && Math.abs(s.bw - s.cw) <= 2, `Save this layout spans the sheet (${s.bw} of ${s.cw}px)`)
  await page.screenshot({ path: `${OUT}/phone-layouts.png` })
  await page.locator('#ch-menu-body .rowbtn.pri').tap(); await page.waitForTimeout(600)
  ok(await page.locator('.ch-ask input').count() === 1, 'and a tap asks for the name in the chart\'s own dialog')
  await page.screenshot({ path: `${OUT}/phone-ask.png` })
  ok(!errs.length, `no page errors (${errs.join(' | ') || 'none'})`)
  await wk.close()
}

await browser.close()
console.log(fails.length ? `\n${fails.length} FAILED:\n  ${fails.join('\n  ')}` : '\nALL OK')
console.log(`shots: ${OUT}`)
process.exit(fails.length ? 1 : 0)
