// Drawing on the chart, and indicators that read on D1's canvas (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-drawing-visual.mjs        (APP_URL / OUT env)
//
// D1, 09-28: "It should be easier to do drawings on there too. Refine the drawings and indicators and
// everything." What a trader's hands found, and what this proves:
//   keys          Alt+R was both Reset view and Rectangle (the reset won); Alt+S both Save image and Short.
//                 TradingView's keys now: Alt+Shift+R rectangle, Alt+Shift+S short, Alt+J horizontal ray,
//                 Alt+C cross line, and they read e.code, so a Mac's Alt (which types symbols) works too.
//   remove all    a native confirm(), four times over; now it goes at once and the toast carries Undo.
//   pitchfork     its tines could never be clicked (the reach was shadowed by the ends array).
//   the phone     a selected drawing's bar was a sheet over half the chart, the drawing under it; now one
//                 row: colour (swatches in its place), width, style, settings, lock, clone, delete.
//   indicators    TradingView's colours on D1's #808080: RSI purple 1.2:1, MACD blue 1.4:1. A default
//                 colour below 2.2:1 is walked away from the canvas; a picked colour is left alone.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-chart-drawing`; mkdirSync(OUT, { recursive: true })
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: process.env.EMAIL || 'appreview@d1fpc3.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
const fails = [], ok = (c, w) => { console.log((c ? '  ok   ' : '  FAIL ') + w); if (!c) fails.push(w) }
const seed = (ctx, theme = 'dark') => ctx.addInitScript(([k, v, theme]) => {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  localStorage.setItem(k, v); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', theme); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1')
  localStorage.setItem('echelon-chart-sym', 'NQ'); localStorage.setItem('echelon-chart-tf', '5m'); localStorage.removeItem('echelon-chart-settings'); localStorage.removeItem('echelon-chart-drawings')
}, [`sb-${REF}-auth-token`, JSON.stringify(session), theme])
async function open(ctx) {
  const page = await ctx.newPage(), errs = []; page.on('pageerror', (e) => errs.push(String(e.message)))
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#td-h1', { state: 'attached', timeout: 60000 }); await page.waitForTimeout(1500)
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click())
  await page.waitForFunction(() => window.__CH?.bars?.length > 100, null, { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(3500)
  await page.evaluate(() => { const C = window.__CH; C.s.lit = false; C.$.paint() })
  return { page, errs }
}
const st = (page) => page.evaluate(() => { const C = window.__CH; return { tool: C.tool, n: C.drawings.length, sel: C.sel?.type || null, types: C.drawings.map((d) => d.type) } })

// ── the desk: keys, remove all, the pitchfork ──
console.log('\n1440, the keys and the tools')
{
  const b = await PW.chromium.launch({ channel: 'chrome' })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await seed(ctx)
  const { page, errs } = await open(ctx)
  const R = await (await page.$('#ch-canvas')).boundingBox(), at = (fx, fy) => [R.x + R.width * fx, R.y + R.height * fy]
  const drag = async ([x0, y0], [x1, y1]) => { await page.mouse.move(x0, y0); await page.mouse.down(); for (let k = 1; k <= 12; k++) await page.mouse.move(x0 + (x1 - x0) * k / 12, y0 + (y1 - y0) * k / 12); await page.mouse.up(); await page.waitForTimeout(200) }
  const key = async (k) => { await page.mouse.move(...at(0.5, 0.5)); await page.keyboard.press(k); await page.waitForTimeout(150) }
  await key('Alt+t'); await drag(at(0.35, 0.55), at(0.6, 0.35))
  let s = await st(page); ok(s.types.includes('trend') && s.sel === 'trend' && s.tool === 'cross', `Alt+T, then a drag: a trend line, selected, and the cursor back (${JSON.stringify(s)})`)
  await key('Alt+Shift+R'); ok((await st(page)).tool === 'rect', 'Alt+Shift+R picks the rectangle')
  await page.mouse.click(...at(0.12, 0.3)); await page.mouse.click(...at(0.22, 0.45)); await page.waitForTimeout(200)
  ok((await st(page)).types.includes('rect'), 'and two clicks draw it')
  await page.evaluate(() => { const C = window.__CH; C.offset = 40; C.$.paint() }); await key('Alt+r')
  ok(await page.evaluate(() => window.__CH.offset !== 40 && window.__CH.tool === 'cross'), 'Alt+R resets the view and picks no tool')
  await key('Alt+Shift+S'); await page.mouse.click(...at(0.8, 0.5)); await page.waitForTimeout(200)
  ok((await st(page)).types.includes('short'), 'Alt+Shift+S, a click: a short position (Alt+S stays Save image)')
  await key('Alt+j'); ok((await st(page)).tool === 'hray', 'Alt+J picks the horizontal ray')
  await key('Escape'); await key('Alt+c'); ok((await st(page)).tool === 'xcross', 'Alt+C picks the cross line')
  // a Mac: Alt+T types a dagger, so only e.code says T
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '†', code: 'KeyT', altKey: true, bubbles: true })))
  ok((await st(page)).tool === 'trend', 'a Mac keyboard: Alt with the T key picks the trend line though the key reads "†"')
  await key('Escape')
  // pitchfork: three clicks, then a click on a tine selects it
  await page.evaluate(() => window.__CH.$.setTool('pitchfork'))
  await page.mouse.click(...at(0.3, 0.7)); await page.mouse.click(...at(0.55, 0.3)); await page.mouse.click(...at(0.55, 0.62)); await page.waitForTimeout(200)
  await page.mouse.click(...at(0.95, 0.95)); await page.waitForTimeout(150)
  const tine = await page.evaluate(() => { const d = window.__CH.drawings.find((x) => x.type === 'pitchfork'); if (!d || !d._ends) return null; const [a, b] = [d._ends[0], d._ends[1]], r = document.getElementById('ch-canvas').getBoundingClientRect(); return { x: r.left + a.x + (b.x - a.x) * 0.6, y: r.top + a.y + (b.y - a.y) * 0.6 } })
  if (tine) { await page.mouse.click(tine.x, tine.y); await page.waitForTimeout(200) }
  ok(tine && (await st(page)).sel === 'pitchfork', `a click on the pitchfork's tine selects it (${(await st(page)).sel})`)
  await page.screenshot({ path: `${OUT}/1440-tools.png` })
  // remove all: at once, then Undo on the toast
  const n0 = (await st(page)).n
  await page.click('#ch-clear'); await page.waitForTimeout(300)
  const gone = (await st(page)).n, toastT = await page.evaluate(() => document.getElementById('co-toast')?.innerText || '')
  ok(gone === 0 && /Removed \d+ drawings?/.test(toastT) && /Undo/.test(toastT), `the rail's × removes all ${n0} at once, no dialog, the toast says so with Undo ("${toastT.replace(/\s+/g, ' ')}")`)
  await page.click('#co-toast .act'); await page.waitForTimeout(300)
  ok((await st(page)).n === n0, `Undo on the toast puts all ${n0} back`)
  // the keyboard sheet no longer promises one key for two things
  await page.evaluate(() => window.__CH.$.menu('keys')); await page.waitForTimeout(300)
  const keysT = await page.evaluate(() => [...document.querySelectorAll('#ch-menu-body .ch-key kbd')].map((k) => k.textContent))
  const dup = keysT.filter((k, i) => keysT.indexOf(k) !== i && !/drag|while/i.test(k))
  ok(!dup.length && keysT.includes('Alt+Shift+R') && keysT.includes('Alt+Shift+S'), `the shortcut sheet lists each key once (${dup.join(', ') || 'no repeats'})`)
  ok(!errs.length, `no page errors (${errs.join(' | ') || 'none'})`)
  await b.close()
}

// ── indicators on the grey canvas ──
console.log('\n1440, indicators on the grey canvas, then on a dark one')
{
  const b = await PW.chromium.launch({ channel: 'chrome' })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await seed(ctx)
  const { page, errs } = await open(ctx)
  const read = () => page.evaluate(() => {
    const C = window.__CH; C.s.emaOn = true; C.s.p_rsi = true; C.s.p_macd = true; C.s.bb = true; C.$.build(); C.$.paint()
    const lum = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2] }
    const cr = (a, b) => { const x = lum(a), y = lum(b); return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2) }
    const legend = [...document.querySelectorAll('#ch-legend .ln')].map((n) => n.innerText.split('\n')[0]).join(' | ')
    const els = [...document.querySelectorAll('#ch-legend [style*="color"]')].map((n) => n.style.color).slice(0, 3)
    // the colours the panes and averages are drawn in, from the chart's own resolution
    const inks = window.__CH.$.inks ? window.__CH.$.inks() : null
    return { bg: C.bgNow, inks, cr: inks ? Object.fromEntries(Object.entries(inks).map(([k, v]) => [k, cr(v, C.bgNow)])) : null, legend, els }
  })
  const g = await read()
  ok(g.inks && Object.values(g.cr).every((x) => x >= 2.2), `on ${g.bg} every default indicator colour clears 2.2:1 (${JSON.stringify(g.cr)})`)
  await page.screenshot({ path: `${OUT}/1440-indicators-grey.png` })
  await page.evaluate(() => { window.__CH.s.bg = '#131722'; window.__CH.$.paint() })
  const d = await read()
  ok(d.inks && d.inks.rsi === '#7e57c2' && d.inks.macd === '#2962ff', `on a dark canvas the platform's own colours stay (${JSON.stringify(d.inks)})`)
  await page.evaluate(() => { window.__CH.s.bg = ''; window.__CH.s.rsiC = '#123456'; window.__CH.$.paint() })
  const u = await read()
  ok(u.inks && u.inks.rsi === '#123456', `a colour the member picked is never changed (${u.inks?.rsi})`)
  await page.screenshot({ path: `${OUT}/1440-indicators-dark.png` })
  ok(!errs.length, `no page errors (${errs.join(' | ') || 'none'})`)
  await b.close()
}

// ── the phone: one-row selection bar ──
console.log('\niPhone 15 Pro, WebKit, drawing')
{
  const b = await PW.webkit.launch()
  const ctx = await b.newContext({ ...PW.devices['iPhone 15 Pro'] }); await seed(ctx)
  const { page, errs } = await open(ctx)
  const tap = async (sel) => { await page.locator(sel).first().tap({ timeout: 5000 }); await page.waitForTimeout(450) }
  const box = await page.locator('#ch-canvas').boundingBox()
  await tap('#ch-tools-btn'); await tap('#ch-prail button[data-tool="trend"]')
  await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height * 0.62); await page.waitForTimeout(250)
  await page.touchscreen.tap(box.x + box.width * 0.62, box.y + box.height * 0.4); await page.waitForTimeout(600)
  const g = await page.evaluate(() => {
    const C = window.__CH, bar = document.getElementById('ch-selbar'), r = bar.getBoundingClientRect(), cv = document.getElementById('ch-canvas').getBoundingClientRect(), d = C.sel
    const pts = d ? d.p.map((q) => { const p = C.$.pt(q.t, q.p); return { x: cv.left + p.x, y: cv.top + p.y } }) : []
    return { sel: d?.type, cls: bar.className, h: r.height, w: r.width, vw: innerWidth, covered: pts.filter((p) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom).length, btns: bar.querySelectorAll('button').length }
  })
  ok(g.sel === 'trend' && /compact/.test(g.cls), `two taps draw a trend line and its bar is the one-row kind (${g.cls})`)
  ok(g.h <= 56 && g.w <= g.vw - 16 && g.btns <= 8, `one row: ${Math.round(g.w)} by ${Math.round(g.h)}px, ${g.btns} buttons`)
  ok(g.covered === 0, `and it covers neither end of the line (${g.covered} covered)`)
  await page.screenshot({ path: `${OUT}/phone-selected.png` })
  await tap('#ch-selbar .cur'); ok(await page.evaluate(() => /picking/.test(document.getElementById('ch-selbar').className)), 'the colour dot opens the swatches in its place')
  await page.screenshot({ path: `${OUT}/phone-swatches.png` })
  await tap('#ch-selbar .sw[data-c="#2962ff"]')
  ok(await page.evaluate(() => window.__CH.sel?.color === '#2962ff' && !/picking/.test(document.getElementById('ch-selbar').className)), 'a swatch colours the line and the row comes back')
  await tap('#ch-selbar .wcy'); ok(await page.evaluate(() => window.__CH.sel?.w === 2), 'the width button steps 1 to 2')
  await tap('#ch-selbar [data-props]'); ok(await page.evaluate(() => window.__CH.menu === 'draw'), 'settings opens the drawing\'s own sheet')
  await page.evaluate(() => window.__CH.$.menu(null)); await page.waitForTimeout(400)
  await tap('#ch-selbar [data-del]'); ok(await page.evaluate(() => window.__CH.drawings.length === 0), 'delete takes it off')
  ok(!errs.length, `no page errors (${errs.join(' | ') || 'none'})`)
  await b.close()
}

console.log(fails.length ? `\n${fails.length} FAILED:\n  ${fails.join('\n  ')}` : '\nALL OK')
console.log(`shots: ${OUT}`)
process.exit(fails.length ? 1 : 0)
