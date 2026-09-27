// Does the chart keep up with the hand? (manual, not CI)
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-perf-visual.mjs        (APP_URL / W / H / EMAIL env)
//
// Drives a drag-pan, a crosshair sweep and a wheel zoom on D1's 2560 monitor
// size and records every animation frame, once at full speed and once with the
// CPU slowed 4x (a busy laptop, a phone). A frame over 20ms is one the eye can
// catch.
//
// It runs real Chrome with the GPU on. Playwright's own headless Chromium
// rasterises the canvas in software, and there the copy of a 2560 canvas each
// frame (Canvas2DResourceProvider) is 3s of a 5s trace: a cost D1's browser
// never pays, which buries the one that matters. Point APP_URL at the live site
// to compare a build against what members have now.
import { createRequire } from 'module'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: process.env.EMAIL || 'appreview@d1fpc3.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = []
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const W = +(process.env.W || 2560), H = +(process.env.H || 1440)
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization'] })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
await ctx.addInitScript(([k, v]) => {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  localStorage.setItem(k, v); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', 'dark'); localStorage.setItem('echelon-gex-tour', '1')
  localStorage.removeItem('echelon-chart-settings')
}, [`sb-${REF}-auth-token`, JSON.stringify(session)])
const page = await ctx.newPage()
await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#td-h1', { timeout: 60000 }); await page.waitForTimeout(1500)
await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click()); await page.waitForTimeout(4500)
await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
const gl = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return g ? String(g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER)) : 'none' })
console.log(`     ${W}x${H}, renderer: ${gl}`)
if (/swiftshader|software|none/i.test(gl)) console.log('     (no GPU here: the numbers below overstate the canvas cost)')
const box = await page.locator('#ch-canvas').boundingBox()
const cdp = await ctx.newCDPSession(page)

const run = async (rate) => {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  await page.evaluate(() => { window.__ft = []; let last = performance.now(); const loop = (t) => { window.__ft.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(loop) }; window.__stop = false; requestAnimationFrame(loop) })
  const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.4
  await page.mouse.move(cx, cy); await page.mouse.down()
  for (let k = 0; k < 50; k++) await page.mouse.move(cx - k * 10, cy + Math.sin(k / 5) * 30)
  await page.mouse.up()
  for (let k = 0; k < 50; k++) await page.mouse.move(cx - 300 + k * 12, cy + 40)
  for (let k = 0; k < 10; k++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(16) }
  const ft = await page.evaluate(() => { window.__stop = true; return window.__ft.slice(2) })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  ft.sort((a, b) => a - b)
  return { frames: ft.length, p95: +ft[Math.floor(ft.length * 0.95)].toFixed(1), max: +ft.at(-1).toFixed(1), long: ft.filter((x) => x > 20).length }
}
// the paint alone, straight from the chart's own entry point
const paint = await page.evaluate(() => { const t = []; for (let k = 0; k < 30; k++) { const a = performance.now(); window.__CH.$.paint(); t.push(performance.now() - a) } t.sort((a, b) => a - b); return { med: +t[15].toFixed(1), p90: +t[27].toFixed(1) } })
check(paint.p90 < 8, `one full paint: median ${paint.med}ms, p90 ${paint.p90}ms`)
const full = await run(1)
// One stray frame over 20ms turned up in 2 of ~10 full-speed runs against live
// and never in six profiled runs or at 4x, so it is the machine (a poll, a GC,
// the OS), not the paint. Two or more is the chart.
check(full.long <= 1,`full speed: ${full.frames} frames, p95 ${full.p95}ms, worst ${full.max}ms, ${full.long} over 20ms`)
const slow = await run(4)
check(slow.long <= 5, `CPU slowed 4x: ${slow.frames} frames, p95 ${slow.p95}ms, worst ${slow.max}ms, ${slow.long} over 20ms`)
await ctx.close()

// ── a phone: real touch through CDP on a Pixel 7 screen (2.6x pixels) ──
// A phone CPU is taken as 4x slower than this desktop, and 6x for an older one.
// The fingers: a slow pan, a fling, a pinch out and back, and a Settings sheet
// rising (its slide is a transform, so it should cost the page nothing).
{
  const { devices } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
  const pctx = await browser.newContext({ ...devices['Pixel 7'] })
  await pctx.addInitScript(([k, v]) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem(k, v); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', 'dark'); localStorage.setItem('echelon-gex-tour', '1')
    localStorage.removeItem('echelon-chart-settings')
  }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
  const pg = await pctx.newPage()
  await pg.goto(APP, { waitUntil: 'domcontentloaded' }); await pg.waitForSelector('#td-h1', { timeout: 60000 }); await pg.waitForTimeout(1500)
  await pg.evaluate(() => document.querySelector('[data-view="chart"]').click()); await pg.waitForTimeout(4500)
  await pg.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  const pcdp = await pctx.newCDPSession(pg)
  const pb = await pg.locator('#ch-canvas').boundingBox()
  const touch = (type, pts) => pcdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) })
  const frames = async (fn) => {
    await pg.evaluate(() => { window.__ft = []; let last = performance.now(); const loop = (t) => { window.__ft.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(loop) }; window.__stop = false; requestAnimationFrame(loop) })
    await fn(); await pg.waitForTimeout(700)
    const ft = await pg.evaluate(() => { window.__stop = true; return window.__ft.slice(2) }); ft.sort((a, b) => a - b)
    return { frames: ft.length, p95: +ft[Math.floor(ft.length * 0.95)].toFixed(1), max: +ft.at(-1).toFixed(1), long: ft.filter((x) => x > 20).length }
  }
  const cx = pb.x + pb.width * 0.5, cy = pb.y + pb.height * 0.55
  const fingers = async () => {
    await pg.evaluate(() => { window.__CH.barW = 9; window.__CH.offset = 6; window.__CH.auto = true; window.__CH.$.paint() })
    await touch('touchStart', [[cx + 120, cy]]); for (let k = 1; k <= 40; k++) { await touch('touchMove', [[cx + 120 - k * 6, cy + Math.sin(k / 6) * 10]]); await pg.waitForTimeout(8) } await touch('touchEnd', [])
    await touch('touchStart', [[cx - 100, cy]]); for (let k = 1; k <= 10; k++) { await touch('touchMove', [[cx - 100 + k * 22, cy]]); await pg.waitForTimeout(8) } await touch('touchEnd', []); await pg.waitForTimeout(500)
    await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]); for (let k = 1; k <= 25; k++) { await touch('touchMove', [[cx - 30 - k * 5, cy], [cx + 30 + k * 5, cy]]); await pg.waitForTimeout(8) }
    for (let k = 24; k >= 0; k--) { await touch('touchMove', [[cx - 30 - k * 5, cy], [cx + 30 + k * 5, cy]]); await pg.waitForTimeout(8) } await touch('touchEnd', [])
  }
  // The first Settings open of a session compiles the panel code and rasterises its glyphs for
  // the first time (~26ms of script and layout here, then the GPU). Reported on its own; the
  // opens after it are what a trader feels all day.
  const first = await frames(async () => { await pg.locator('#ch-settings-btn').tap(); await pg.waitForTimeout(450); await pg.evaluate(() => window.__CH.$.menu(null)) })
  check(first.max < 160, `phone, first Settings open of the session: worst frame ${first.max}ms, ${first.long} over 20ms`)
  for (const rate of [1, 4, 6]) {
    await pcdp.send('Emulation.setCPUThrottlingRate', { rate })
    const r = await frames(fingers)
    // the first pass pays for compiling the gesture code, so full speed allows two
    check(r.long <= (rate === 1 ? 2 : rate === 4 ? 5 : 14), `phone, fingers, CPU ${rate}x: ${r.frames} frames, p95 ${r.p95}ms, worst ${r.max}ms, ${r.long} over 20ms`)
    const s = await frames(async () => { await pg.locator('#ch-settings-btn').tap(); await pg.waitForTimeout(450); await pg.evaluate(() => window.__CH.$.menu(null)) })
    check(s.long <= (rate === 1 ? 1 : 3), `phone, Settings sheet up and down, CPU ${rate}x: p95 ${s.p95}ms, worst ${s.max}ms, ${s.long} over 20ms`)
    const tf = await pg.evaluate(async () => { const a = performance.now(); window.__CH.$.menu(null); document.querySelector('#ch-tf .seg button, #ch-tf button[data-tf="15m"]')?.click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const b = performance.now(); document.querySelector('#ch-tf button[data-tf="5m"]')?.click(); return +(b - a).toFixed(0) })
    check(tf < (rate === 1 ? 120 : 400), `phone, switching the interval paints in ${tf}ms at CPU ${rate}x`)
  }
  await pcdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await pctx.close()
}

console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
await browser.close()
process.exit(fails.length ? 1 : 0)
