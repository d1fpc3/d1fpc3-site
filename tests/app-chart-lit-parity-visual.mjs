// D1 LIT on the Echelon chart against the Pine it ports (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-lit-parity-visual.mjs        (APP_URL / OUT env)
//
// D1, 09-27: "It's not the same as the D1 lit indicator. Mimic the D1 lit indicator."
// tools/indicators/D1 LIT Indicator.pine is the spec. On live NQ bars this proves, rule by rule:
// every part the Pine ships on is on (and a saved litV 3 profile is brought along once), one PDH/PDL
// pair, the NWOG voids match an independent walk of the Pine's 8d rules (4 ticks, eaten from the
// Sunday edge, dropped through the Friday close, 10 at most) and are dated "NWOG Sep 27", the weekly
// open stops at the current bar with its name just past it, the opens say "[18:00 Open]", the
// HOW / LOW line covers Tue 02:00 to Wed 11:00 only, day names are full, the PO3 and chart 4H candles
// open at 18/22/02/06/10/14, the key opens (replayed to a Friday afternoon) freeze the 10:00 at 14:00,
// the QQQ / SPY rows come from the tape and hide when the ETF is not printing, the Pine colours land on
// D1's grey canvas and on white, and no two placed labels overlap. Screens at 2560, 1440 and an iPhone.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-chart-lit-parity`; mkdirSync(OUT, { recursive: true })
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: process.env.EMAIL || 'appreview@d1fpc3.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = [], ok = (c, w) => { console.log((c ? '  ok   ' : '  FAIL ') + w); if (!c) fails.push(w) }
const PARTS = ['litPd', 'litPw', 'litPm', 'litWo', 'litOpen', 'litAsia', 'litNy', 'litMarks', 'litKo', 'litPo3', 'litGold', 'litNwog', 'litRef', 'litVector', 'litWm', 'litSig', 'litDs', 'litOpen22', 'litLdn']
const seed = (ctx, { theme = 'dark', tf = '1m', settings = null } = {}) => ctx.addInitScript(([k, v, theme, tf, settings]) => {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  localStorage.setItem(k, v); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', theme); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1')
  localStorage.setItem('echelon-chart-sym', 'NQ'); localStorage.setItem('echelon-chart-tf', tf)
  if (settings) localStorage.setItem('echelon-chart-settings', settings); else localStorage.removeItem('echelon-chart-settings')
}, [`sb-${REF}-auth-token`, JSON.stringify(session), theme, tf, settings])
async function open(ctx) {
  const page = await ctx.newPage(), errs = []; page.on('pageerror', (e) => errs.push(String(e.message)))
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#td-h1', { state: 'attached', timeout: 60000 }); await page.waitForTimeout(1500)
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click())
  await page.waitForFunction(() => window.__CH?.$?.lit && window.__CH.$.lit().wo, null, { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(3500)
  return { page, errs }
}
const overlaps = (page) => page.evaluate(() => { const r = (window.__CH.lbl || []).filter((x) => !x.forced); let h = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], b = r[j]; if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) h++ } return { n: (window.__CH.lbl || []).length, h } })
const ONLY = process.env.ONLY || ''   // 'phone' runs just the iPhone pass
const browser = await PW.chromium.launch({ channel: 'chrome' })

// ── the rules, on D1's monitor and his grey canvas ──
if (!ONLY) {
  console.log('\n2560, grey canvas, NQ 1m')
  const ctx = await browser.newContext({ viewport: { width: 2560, height: 1300 } }); await seed(ctx)
  const { page, errs } = await open(ctx)
  const st = await page.evaluate((parts) => ({ v: window.__CH.s.litV, off: parts.filter((k) => !window.__CH.s[k]) }), PARTS)
  ok(st.v === 4 && !st.off.length, `a fresh chart has every part the Pine ships on (litV ${st.v}, off: ${st.off.join(', ') || 'none'})`)

  const r = await page.evaluate(() => {
    const C = window.__CH, L = C.$.lit(), bars = C.vis || C.bars, n = bars.length
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    const et = (t) => { const p = {}; for (const x of f.formatToParts(new Date(t * 1000))) p[x.type] = x.value; return { wd: p.weekday, h: +p.hour % 24, m: +p.minute, date: `${p.year}-${p.month}-${p.day}` } }
    const trade = (t) => et(t + 6 * 3600).date
    // the Pine's 8d, walked independently: week = the Monday of the trade date
    const weekOf = (t) => { const d = new Date(trade(t) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10) }
    const open = []
    for (let i = 0; i < n; i++) {
      const b = bars[i]
      if (i > 0 && weekOf(b.t) !== weekOf(bars[i - 1].t)) { const fri = bars[i - 1].c, sun = b.o; if (Math.abs(sun - fri) >= 1) { open.push({ o: sun, c: fri, f: sun, t: b.t }); if (open.length > 10) open.shift() } }
      for (let k = open.length - 1; k >= 0; k--) { const g = open[k], up = g.o > g.c; if (up ? b.l <= g.c : b.h >= g.c) open.splice(k, 1); else g.f = up ? Math.min(g.f, b.l) : Math.max(g.f, b.h) }
    }
    const want = open.map((g) => ({ top: g.o > g.c ? g.f : g.c, bottom: g.o > g.c ? g.c : g.f, t: g.t }))
    const got = L.nwog.map((g) => ({ top: g.top, bottom: g.bottom, t: g.t }))
    // the prior session's high and low
    const sess = [...new Set(bars.map((b) => trade(b.t)))], prevS = sess[sess.length - 2]
    const prev = bars.filter((b) => trade(b.t) === prevS), pdh = Math.max(...prev.map((b) => b.h)), pdl = Math.min(...prev.map((b) => b.l))
    const g = L.gold, gb = g ? [et(bars[g.i0].t), et(bars[g.i1].t), g.i1 + 1 < n ? et(bars[g.i1 + 1].t) : null] : null
    const po3 = L.po3.map((c) => ({ label: c.label, at: et(c.openAt) }))
    const lbl = C.lbl || []
    return { n, want, got, pd: L.pd.map((p) => [p.label, p.p]), pdh, pdl, gb, po3, days: L.days.map((d) => d.name), open18: L.open18.length, lbl: lbl.map((x) => x.text), wo: L.wo && { p: L.wo.p, at: et(bars[L.wo.i0].t) }, nwogLbl: lbl.filter((x) => /^NWOG /.test(x.text)).map((x) => x.text), mode: C.bgNow }
  })
  console.log(`  ${r.n} bars, canvas ${r.mode}, weekly open ${r.wo?.p} at ${r.wo?.at.wd} ${r.wo?.at.h}:${String(r.wo?.at.m).padStart(2, '0')}`)
  ok(r.pd.length === 2 && r.pd[0][0] === 'PDH' && r.pd[0][1] === r.pdh && r.pd[1][1] === r.pdl, `one PDH/PDL pair, the prior session's ${r.pdh} / ${r.pdl}: ${JSON.stringify(r.pd)}`)
  ok(JSON.stringify(r.got) === JSON.stringify(r.want), `NWOG voids match an independent walk of the Pine's rules (${r.got.length} open): ${JSON.stringify(r.got.map((g) => [g.bottom, g.top]))}`)
  ok(r.got.length <= 10, 'never more than 10 voids')
  const onScreen = r.nwogLbl.length
  ok(r.nwogLbl.every((t) => /^NWOG (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}$/.test(t)), `voids are dated the Pine's way: ${r.nwogLbl.join(', ') || '(none in view)'}`)
  ok(!r.lbl.some((t) => /OPEN\]$/.test(t) && t !== '[WEEKLY OPEN]') && !r.lbl.some((t) => /^(Golden|LDN|\d\/8)/.test(t)), 'the opens read "[18:00 Open]", no Golden / LDN / eighths text: ' + r.lbl.filter((t) => /Open|OPEN/.test(t)).join(', '))
  ok(r.days.every((d) => /^(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day$/.test(d)), `day separators name the whole day: ${r.days.join(', ')}`)
  if (r.gb) ok(r.gb[0].wd === 'Tue' && r.gb[0].h >= 2 && ((r.gb[1].wd === 'Wed' && r.gb[1].h < 11) || r.gb[1].wd === 'Tue') && (!r.gb[2] || !((r.gb[2].wd === 'Wed' && r.gb[2].h < 11))), `HOW / LOW spans Tue ${r.gb[0].h}:${String(r.gb[0].m).padStart(2, '0')} to ${r.gb[1].wd} ${r.gb[1].h}:${String(r.gb[1].m).padStart(2, '0')} and stops`)
  const p4 = r.po3.find((c) => c.label === '4H PO3'), p30 = r.po3.find((c) => c.label === '30m PO3'), pD = r.po3.find((c) => c.label === 'D1 PO3')
  ok(p4 && [18, 22, 2, 6, 10, 14].includes(p4.at.h) && p4.at.m === 0, `the 4H PO3 opens on the 18:00 grid: ${p4 && p4.at.h + ':00'}`)
  ok(p30 && p30.at.m % 30 === 0, `the 30m PO3 opens on the half hour: ${p30 && p30.at.h + ':' + p30.at.m}`)
  ok(!pD || (pD.at.h === 0 && pD.at.m === 0), `the D1 PO3 opens at NY midnight: ${pD ? '00:00' : 'none yet (no midnight bar since the open)'}`)

  // the weekly open stops at the current bar, its name just past it and centred on the line
  const wo = await page.evaluate(() => {
    const C = window.__CH, L = C.$.lit(), bars = C.vis || C.bars, n = bars.length, pt = (i, p) => C.$.pt(bars[i].t, p)
    const a = pt(L.wo.i0, L.wo.p), b = pt(n - 1, L.wo.p), lb = (C.lbl || []).find((x) => x.text === '[WEEKLY OPEN]')
    const cv = document.getElementById('ch-canvas'), g = cv.getContext('2d'), dpr = cv.width / cv.clientWidth
    const dark = (x) => { const d = g.getImageData(Math.round(x * dpr), Math.round(b.y * dpr), 1, 1).data; return d[0] + d[1] + d[2] < 120 }
    let on = 0, tot = 0; for (let x = Math.max(a.x, 2); x < b.x - 2; x += 7) { tot++; if (dark(x)) on++ }
    let past = 0; const bw = C.barW; for (let x = b.x + bw / 2 + 1; lb && x < lb.x0 - 1; x += 1) if (dark(x)) past++
    // the plot's right edge: where the price scale starts (the label is pulled back to it when the margin is short)
    const plotW = C.$.pt(bars[n - 1].t, 0).x + (C.offset + 0.5) * C.barW
    return { x: b.x, y: b.y, lb, on, tot, past, plotW, inView: b.y > 0 && b.y < document.getElementById('ch-canvas').clientHeight }
  })
  if (wo.inView) {
    ok(wo.on / Math.max(1, wo.tot) > 0.6, `the weekly open is a near-black line on the grey canvas (${wo.on}/${wo.tot} samples dark)`)
    const fits = wo.lb && wo.x + 6 + (wo.lb.x1 - wo.lb.x0) <= wo.plotW - 3
    ok(wo.lb && Math.abs(wo.lb.x0 - (fits ? wo.x + 6 : wo.plotW - 4 - (wo.lb.x1 - wo.lb.x0))) < 2 && Math.abs((wo.lb.y0 + wo.lb.y1) / 2 - wo.y) < 5, `"[WEEKLY OPEN]" ${fits ? 'starts just past the current bar' : 'is held inside the plot (short right margin)'} and sits on the line: ${JSON.stringify(wo.lb && { x0: Math.round(wo.lb.x0), mid: Math.round((wo.lb.y0 + wo.lb.y1) / 2) })} vs bar ${Math.round(wo.x)}, line ${Math.round(wo.y)}, plot edge ${Math.round(wo.plotW)}`)
    ok(wo.past === 0, `the line stops at the current bar, nothing drawn between the bar and its name (${wo.past} dark px)`)
  } else console.log('  (the weekly open is outside the visible prices)')
  const ov = await overlaps(page)
  ok(ov.h === 0, `${ov.n} labels placed, no two overlap`)
  await page.screenshot({ path: `${OUT}/2560-grey-1m.png` })

  // replay to last Friday afternoon: key opens, the 10:00 freeze at 14:00, the markers, a frozen 18:00 open
  const fri = await page.evaluate(() => {
    const C = window.__CH, all = C.bars, f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    const et = (t) => { const p = {}; for (const x of f.formatToParts(new Date(t * 1000))) p[x.type] = x.value; return { wd: p.weekday, h: +p.hour % 24, m: +p.minute } }
    let cut = null; for (let i = all.length - 1; i >= 0; i--) { const e = et(all[i].t); if (e.wd === 'Fri' && e.h === 15 && e.m === 0) { cut = all[i].t; break } }
    if (!cut) return null
    C.replay.on = true; C.vis = all.filter((b) => b.t <= cut); C.$.paint()
    const L = C.$.lit(), bars = C.vis
    const out = { ko: L.ko.map((k) => ({ label: k.label, p: k.p, at: et(bars[k.i0].t), o: bars[k.i0].o, end: k.end != null ? et(bars[k.end].t) : null })), marks: L.marks.filter((m) => et(bars[m.i].t).wd === 'Fri').map((m) => { let hh = -Infinity; for (let j = Math.max(0, m.i - 9); j <= m.i; j++) hh = Math.max(hh, bars[j].h); return { label: m.label, at: et(bars[m.i].t), y: m.y, want: hh + 18.75 } }), o18: L.open18.map((o) => ({ at: et(bars[o.i0].t), end: et(bars[o.i1].t), live: o.live })), lbl: (C.lbl || []).map((x) => x.text) }
    return out
  })
  await page.screenshot({ path: `${OUT}/2560-grey-replay-fri-1500.png` })
  if (fri) {
    ok(fri.ko.length === 3 && fri.ko.every((k) => k.p === k.o) && fri.ko.map((k) => `${k.at.h}:${k.at.m}`).join() === '8:30,9:30,10:0', `Friday 15:00: the 08:30, 09:30 and 10:00 opens: ${fri.ko.map((k) => k.label + ' ' + k.p).join(', ')}`)
    const k10 = fri.ko.find((k) => k.label === '[10:00 Open]')
    ok(k10 && k10.end && k10.end.h === 14 && k10.end.m === 0, `the 10:00 ray stops on the 14:00 bar: ${JSON.stringify(k10?.end)}`)
    ok(['[08:30 Open]', '[09:30 Open]', '[10:00 Open]'].every((t) => fri.lbl.includes(t)), 'their names are on the chart')
    ok(['FF', 'LO', 'MM1', 'MM2', 'LC'].every((l) => fri.marks.some((m) => m.label === l)) && fri.marks.every((m) => Math.abs(m.y - m.want) < 1e-6), `Friday's markers FF LO MM1 MM2 LC, lettered at the 10-bar high + 75 ticks: ${fri.marks.map((m) => `${m.label}@${m.at.h}:${String(m.at.m).padStart(2, '0')}`).join(' ')}`)
    const thu = fri.o18.at(-1)
    ok(thu && thu.at.wd === 'Thu' && thu.at.h === 18 && thu.end.h === 10 && thu.end.m === 59 && !thu.live, `Thursday's 18:00 open froze on Friday's 10:59 bar: ${JSON.stringify(thu)}`)
  } else ok(false, 'found a Friday 15:00 bar to replay to')
  // replay to Thursday 23:00: the 18:00 and 22:00 opens are live and run past price
  const thu = await page.evaluate(() => {
    const C = window.__CH, all = C.bars, f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    const et = (t) => { const p = {}; for (const x of f.formatToParts(new Date(t * 1000))) p[x.type] = x.value; return { wd: p.weekday, h: +p.hour % 24, m: +p.minute } }
    let cut = null; for (let i = all.length - 1; i >= 0; i--) { const e = et(all[i].t); if (e.wd === 'Thu' && e.h === 23 && e.m === 0) { cut = all[i].t; break } }
    C.vis = all.filter((b) => b.t <= cut); C.$.paint()
    const L = C.$.lit(), n = C.vis.length, lb = (C.lbl || []).find((x) => x.text === '[18:00 Open]'), end = C.$.pt(C.vis[n - 1].t, 0).x + 22 * C.barW
    const r = { o18: L.open18.at(-1)?.live, o22: L.open22.at(-1)?.live, lb: lb && lb.x0, end, plotRight: document.getElementById('ch-canvas').clientWidth }
    C.replay.on = false; C.vis = null; C.$.paint()
    return r
  })
  await page.screenshot({ path: `${OUT}/2560-grey-after-replay.png` })
  ok(thu.o18 === true && thu.o22 === true, 'Thursday 23:00: the 18:00 and 22:00 opens are live')
  ok(thu.lb != null, `and "[18:00 Open]" is on the chart (at x ${Math.round(thu.lb)}, 22 bars out is ${Math.round(thu.end)})`)

  // QQQ / SPY: fetched from the tape, hidden while the ETF is not printing, shown when it is
  await page.waitForFunction(() => window.__CH.ref && window.__CH.ref.QQQ && window.__CH.ref.SPY, null, { timeout: 20000 }).catch(() => {})
  const ref = await page.evaluate(() => { const C = window.__CH, bars = C.vis || C.bars, last = bars[bars.length - 1]; const q = C.ref || {}; const before = (C.lbl || []).filter((x) => /^(QQQ|SPY) : /.test(x.text)).map((x) => x.text); const live = Math.abs(last.t - (q.QQQ?.t || 0)) <= 300
    const keep = JSON.parse(JSON.stringify(q)); C.ref = { QQQ: { p: q.QQQ.p, t: last.t }, SPY: { p: q.SPY.p, t: last.t } }; C.$.paint(); const after = (C.lbl || []).filter((x) => /^(QQQ|SPY) : /.test(x.text)); C.ref = keep; C.$.paint()
    return { qqq: q.QQQ, spy: q.SPY, before, live, after: after.map((x) => ({ t: x.text, y: (x.y0 + x.y1) / 2 })), price: C.$.pt(last.t, last.c).y } })
  ok(ref.qqq?.p > 100 && ref.spy?.p > 100, `the tape serves QQQ ${ref.qqq?.p} and SPY ${ref.spy?.p} (regular session)`)
  ok(ref.live || !ref.before.length, `not printing now, so no rows (${ref.before.join(' | ') || 'none'})`)
  ok(ref.after.length === 2 && /^QQQ : \d+(\.\d{1,2})?$/.test(ref.after[0].t) && ref.after.every((a) => Math.abs(a.y - ref.price) < 14), `printing, both rows sit beside price: ${ref.after.map((a) => a.t).join(' | ')}`)
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''))
  await ctx.close()
}

// ── the 4H chart: session-cut candles, no intraday-only parts ──
if (!ONLY) {
  console.log('\n2560, NQ 4h')
  const ctx = await browser.newContext({ viewport: { width: 2560, height: 1300 } }); await seed(ctx, { tf: '4h' })
  const { page, errs } = await open(ctx)
  const r = await page.evaluate(() => {
    const C = window.__CH, L = C.$.lit(), bars = (C.vis || C.bars).slice(-60), f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false })
    return { tf: C.tf, hours: [...new Set(bars.map((b) => +f.format(new Date(b.t * 1000)) % 24))].sort((a, b) => a - b), o18: L.open18.length, days: L.days.length, asia: L.asia.length, ko: L.ko.length, d1: L.po3.some((c) => c.label === 'D1 PO3') }
  })
  ok(r.tf === '4h' && r.hours.every((h) => [2, 6, 10, 14, 18, 22].includes(h)), `4H candles open at 18, 22, 02, 06, 10, 14 like TradingView's: ${r.hours.join(', ')}`)
  ok(!r.o18 && !r.days && !r.asia, `no 18:00 open, Asia box or day separators on 4H (${r.o18}, ${r.asia}, ${r.days})`)
  ok(!r.d1, 'no D1 PO3 on 4H (no bar opens at midnight, as on TradingView)')
  await page.screenshot({ path: `${OUT}/2560-4h.png` })
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''))
  await ctx.close()
}

// ── a member saved at litV 3 comes along once ──
if (!ONLY) {
  console.log('\nsaved litV 3 profile, white canvas, 1440')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await seed(ctx, { theme: 'light', settings: JSON.stringify({ lit: true, litV: 3, litNwog: false, litPm: false, litDr: false, litEighths: true, litNwogF: 0.12, litLdnF: 0.1, litPdC: '#123456', lookV: 5 }) })
  const { page, errs } = await open(ctx)
  const st = await page.evaluate((parts) => { const S = window.__CH.s; return { v: S.litV, off: parts.filter((k) => !S[k]), dr: 'litDr' in S, ei: 'litEighths' in S, f: S.litNwogF, lf: S.litLdnF, pdc: S.litPdC, saved: JSON.parse(localStorage.getItem('echelon-chart-settings')).litV } }, PARTS)
  ok(st.v === 4 && st.saved === 4 && !st.off.length, `litV 3 to 4, every Pine part on (off: ${st.off.join(', ') || 'none'})`)
  ok(!st.dr && !st.ei, 'the dropped parts (daily reset, eighths) are gone from the settings')
  ok(st.f === 0.18 && st.lf === 0.15 && st.pdc === '#123456', `fills take the Pine's transparency (${st.f}, ${st.lf}), a picked colour stays (${st.pdc})`)
  const c = await page.evaluate(() => { const C = window.__CH; return { bg: C.bgNow, lbl: (C.lbl || []).length } })
  ok(/^#f/i.test(c.bg), `white canvas: ${c.bg}`)
  await page.evaluate(() => window.__CH.$.menu('ind:lit')); await page.waitForTimeout(500)
  const rows = await page.evaluate(() => [...document.querySelectorAll('#ch-menu .ch-prow .t')].map((t) => t.firstChild?.textContent))
  ok(rows.length === 19 && !rows.some((t) => /eighth|reset/i.test(t)) && rows.includes('HOW / LOW window') && rows.includes('QQQ / SPY prices'), `the LIT menu lists the Pine's parts: ${rows.join(' · ')}`)
  await page.screenshot({ path: `${OUT}/1440-white-menu.png` })
  await page.evaluate(() => window.__CH.$.menu(null)); await page.waitForTimeout(300)
  const ov = await overlaps(page)
  ok(ov.h === 0, `${ov.n} labels placed at 1440, no two overlap`)
  await page.screenshot({ path: `${OUT}/1440-white-1m.png` })
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''))
  await ctx.close()
}
await browser.close()

// ── an iPhone (WebKit) ──
{
  console.log('\niPhone 15 Pro, WebKit')
  const wk = await PW.webkit.launch()
  const ctx = await wk.newContext({ ...PW.devices['iPhone 15 Pro'] }); await seed(ctx)
  const { page, errs } = await open(ctx)
  const ov = await overlaps(page)
  ok(ov.h === 0, `${ov.n} labels on the phone, no two overlap`)
  await page.screenshot({ path: `${OUT}/phone-1m.png` })
  ok(!errs.length, 'no page errors on the phone' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''))
  await wk.close()
}

console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nALL OK')
console.log('shots: ' + OUT)
process.exit(fails.length ? 1 : 0)
