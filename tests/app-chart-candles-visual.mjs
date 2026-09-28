// D1's candles, normal and vector (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-candles-visual.mjs        (APP_URL / OUT / EMAIL env)
//
// The colours were sampled with PIL off his own screenshot (2026-09-26):
//
//   normal up     body #dbdbdb, border and wick #ffffff
//   normal down   body, border and wick #faa1a4
//   vector up     body #32353e, border and wick #ffffff (the normal up edge)
//   vector down   body #dc4551, border and wick #faa1a4 (the normal down edge)
//
// So a vector candle is the same candle with a louder body. This reads those
// colours back off the canvas pixels at the bars the chart itself calls
// vectors (CH.$.vec), not off the settings object, and checks the migration
// moves an old saved chart onto them without resetting anything else.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-chart-candles`
mkdirSync(OUT, { recursive: true })
const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: process.env.EMAIL || 'appreview@d1fpc3.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = []
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
const WANT = { up: '#dbdbdb', upEdge: '#ffffff', dn: '#faa1a4', vUp: '#32353e', vDn: '#dc4551' }

const open = async (settings) => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 860 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(([k, v, st]) => {
    // latch: a reload must not re-seed (addInitScript runs on every navigation)
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem(k, v)
    localStorage.setItem('echelon-splash-day', new Date().toDateString())
    localStorage.setItem('echelon-theme', 'dark')
    localStorage.setItem('echelon-gex-tour', '1')
    if (st) localStorage.setItem('echelon-chart-settings', st); else localStorage.removeItem('echelon-chart-settings')
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), settings ? JSON.stringify(settings) : ''])
  const page = await ctx.newPage()
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#td-h1', { timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click())
  await page.waitForTimeout(4500)
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  return { ctx, page }
}

// Every bar in view with a body tall enough to sample: the body centre, the
// first pixel left of the body (its border) and a pixel on the upper wick.
const sample = (page) => page.evaluate(() => {
  const CH = window.__CH, cv = document.getElementById('ch-canvas'), g = cv.getContext('2d')
  // the D1 LIT session boxes tint every candle under them (Sunday night the Asia box covers the whole chart),
  // so the candles are read with the boxes off for one paint
  const BOX = ['litAsia', 'litLdn', 'litNy', 'litNwog'], keep = BOX.map((k) => CH.s[k]); BOX.forEach((k) => { CH.s[k] = false }); CH.$.paint()
  const W = cv.width, H = cv.height, d = g.getImageData(0, 0, W, H).data
  BOX.forEach((k, i) => { CH.s[k] = keep[i] }); CH.$.paint()
  const hex = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return null; const i = (y * W + x) * 4; return '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('') }
  const vt = new Set(CH.$.vec().map((b) => b.t))
  const out = []
  for (const b of CH.vis || CH.bars) {
    const a = CH.$.pt(b.t, b.o), c = CH.$.pt(b.t, b.c), hi = CH.$.pt(b.t, b.h)
    if (a.x < 12 || a.x > W - 90) continue
    const top = Math.min(a.y, c.y), bot = Math.max(a.y, c.y)
    if (bot - top < 6 || top < 4 || bot > H - 60) continue
    const x = Math.round(a.x), y = Math.round((top + bot) / 2), body = hex(x, y)
    let e = x; while (e > x - 40 && hex(e, y) === body) e--
    out.push({ vec: vt.has(b.t), up: b.c >= b.o, body, edge: hex(e, y), wick: top - hi.y >= 4 ? hex(x, top - 2) : null })
  }
  return { vecCount: vt.size, bars: out }
})
const tally = (list, f) => { const m = new Map(); for (const x of list) { const k = f(x); m.set(k, (m.get(k) || 0) + 1) } return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(', ') }
const share = (list, ok) => list.length ? list.filter(ok).length / list.length : 0

// ── a fresh chart: D1's look out of the box ──
{
  const { ctx, page } = await open(null)
  const s = await page.evaluate(() => { const S = window.__CH.s; return { up: S.up, down: S.down, wickUp: S.wickUp, wickDown: S.wickDown, borderUp: S.borderUp, borderDown: S.borderDown, border: S.border, litVecUp: S.litVecUp, litVecDn: S.litVecDn, lit: S.lit, litVector: S.litVector, lookV: S.lookV, bg: window.__CH.bgNow } })
  check(s.up === WANT.up && s.wickUp === WANT.upEdge && s.borderUp === WANT.upEdge, `up: body ${s.up}, wick ${s.wickUp}, border ${s.borderUp}`)
  check(s.down === WANT.dn && s.wickDown === WANT.dn && s.borderDown === WANT.dn, `down: body ${s.down}, wick ${s.wickDown}, border ${s.borderDown}`)
  check(s.lit && s.litVector && s.border && s.lookV === 5, `vectors on, borders on, lookV ${s.lookV}`)
  check(s.bg === '#808080', `on his grey canvas (${s.bg})`)

  const r = await sample(page)
  const vUp = r.bars.filter((b) => b.vec && b.up), vDn = r.bars.filter((b) => b.vec && !b.up)
  const nUp = r.bars.filter((b) => !b.vec && b.up), nDn = r.bars.filter((b) => !b.vec && !b.up)
  console.log(`     ${r.vecCount} vectors in the data, sampled ${vUp.length} up / ${vDn.length} down vectors and ${nUp.length} up / ${nDn.length} down normal bars`)
  check(vUp.length >= 1 && vDn.length >= 1, 'there are vector candles of both kinds on screen to read')
  // Overlays (Asia box fill, level lines, labels) can sit over a few bars, so a
  // part passes when nearly every sampled bar carries it, and the misses print.
  const part = (list, what, key, want) => { const p = share(list, (b) => b[key] === want); check(p >= 0.8, `${what} ${want} on ${Math.round(p * 100)}% (${tally(list, (b) => b[key])})`) }
  part(vUp, 'vector up body', 'body', WANT.vUp)
  part(vUp, 'vector up border', 'edge', WANT.upEdge)
  part(vDn, 'vector down body', 'body', WANT.vDn)
  part(vDn, 'vector down border', 'edge', WANT.dn)
  part(nUp, 'normal up body', 'body', WANT.up)
  part(nUp, 'normal up border', 'edge', WANT.upEdge)
  part(nDn, 'normal down body', 'body', WANT.dn)
  const wk = (list) => list.filter((b) => b.wick)
  part(wk([...vUp, ...nUp]), 'up wick', 'wick', WANT.upEdge)
  part(wk([...vDn, ...nDn]), 'down wick', 'wick', WANT.dn)
  // the old paint laid the vector at 85% over the canvas; no half-tone may remain
  check(!r.bars.some((b) => b.vec && ['#3d4048', '#cf4a55'].includes(b.body)), 'no see-through vector bodies left over')

  // the LIT menu's Default for vectors is his colour, not the old green and white
  await page.evaluate(() => window.__CH.$.menu('ind:lit')); await page.waitForTimeout(500)
  const pills = await page.evaluate(() => ['litVecUp', 'litVecDn'].map((k) => { const b = document.querySelector(`#ch-menu-body .ch-cbtn[data-key="${k}"]`); return b && { c: b.style.getPropertyValue('--c'), label: b.querySelector('.hx').textContent } }))
  check(pills[0]?.c === WANT.vUp && pills[1]?.c === WANT.vDn, `LIT menu vector pills default to ${pills.map((p) => p && `${p.label} ${p.c}`).join(' / ')}`)
  await page.screenshot({ path: `${OUT}/lit-menu.png` })
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)

  // a close look at one of each vector, for the eye
  const shot = await page.evaluate(() => { const CH = window.__CH, cv = document.getElementById('ch-canvas'), r = cv.getBoundingClientRect(); const v = CH.$.vec().map((b) => ({ b, p: CH.$.pt(b.t, (b.o + b.c) / 2) })).filter(({ p }) => p.x > 150 && p.x < cv.width - 260); const pick = v.at(-1); return pick ? { x: r.left + pick.p.x, y: r.top + pick.p.y } : null })
  await page.screenshot({ path: `${OUT}/chart.png` })
  if (shot) await page.screenshot({ path: `${OUT}/vector-close.png`, clip: { x: Math.max(0, shot.x - 220), y: Math.max(0, shot.y - 170), width: 440, height: 340 } })
  await ctx.close()
}

// ── an old saved chart moves onto the new candles, and keeps everything else ──
{
  const old = { lookV: 4, up: '#ffffff', down: '#faa1a4', wickUp: '#ffffff', wickDown: '#faa1a4', borderUp: '#ffffff', borderDown: '#faa1a4', litVecUp: '#008f47', litVecDn: '#ffffff', bg: '#6d6d6d', grid: true, bodyW: 'thin', litV: 2 }
  const { ctx, page } = await open(old)
  const s = await page.evaluate(() => { const S = window.__CH.s; return { up: S.up, wickUp: S.wickUp, borderUp: S.borderUp, litVecUp: S.litVecUp, litVecDn: S.litVecDn, bg: S.bg, grid: S.grid, bodyW: S.bodyW, lookV: S.lookV, stored: JSON.parse(localStorage.getItem('echelon-chart-settings') || '{}').lookV } })
  check(s.up === WANT.up && s.wickUp === WANT.upEdge && s.borderUp === WANT.upEdge, `a lookV 4 chart gets the grey up body with the white edge (${s.up} / ${s.wickUp} / ${s.borderUp})`)
  check(s.litVecUp === '' && s.litVecDn === '', `its old green / white vector colours are cleared to the default ("${s.litVecUp}" / "${s.litVecDn}")`)
  check(s.bg === '#6d6d6d' && s.grid === true && s.bodyW === 'thin', `and its own canvas, grid and body width survive (bg ${s.bg}, grid ${s.grid}, body ${s.bodyW})`)
  check(s.lookV === 5 && s.stored === 5, `stamped lookV 5 and saved (${s.lookV}, stored ${s.stored})`)
  // a reload must not run it again
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('echelon-chart-settings')); S.litVecUp = '#00ff00'; localStorage.setItem('echelon-chart-settings', JSON.stringify(S)) })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#td-h1', { timeout: 60000 }); await page.waitForTimeout(1200)
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click()); await page.waitForTimeout(3500)
  const after = await page.evaluate(() => window.__CH.s.litVecUp)
  check(after === '#00ff00', `a vector colour set on purpose after the move is kept on reload (${after})`)
  const r = await sample(page)
  const vUp = r.bars.filter((b) => b.vec && b.up)
  check(!vUp.length || share(vUp, (b) => b.body === '#00ff00') >= 0.8, `and the chart paints it (${tally(vUp, (b) => b.body) || 'no up vector in view'})`)
  await ctx.close()
}

console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
console.log('shots: ' + OUT)
await browser.close()
process.exit(fails.length ? 1 : 0)
