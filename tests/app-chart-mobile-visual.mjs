// The chart on a phone: every control, at thumb size, doing what it says (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-mobile-visual.mjs        (APP_URL / OUT / EMAIL / ONLY env)
//
// D1, 09-26: "make sure that everything on the chart page works on mobile.
// Everything needs to be at scale and functional. And not lag."
//
// Four phones:
//   iphone     WebKit, iPhone 15 Pro portrait (what D1 carries)
//   se         WebKit, iPhone SE (3rd gen), 375 wide, the smallest iPhone still sold
//   galaxy     Chromium, Galaxy S24, 360 wide, the most common Android width
//   landscape  WebKit, iPhone 15 Pro on its side
//   android    Chromium, Pixel 7, which is also the one that can do real
//              multi-finger touch (CDP), so the gestures run here
// On each: no sideways scroll, every bar and foot control on screen with a
// 40px hit area (measured with elementFromPoint, not the box), and every
// panel opens inside the screen with nothing clipped or under-sized. Then the
// controls are driven: interval, symbol, chart type, indicators and their
// settings, settings tabs and a colour, layouts, alerts, replay, drawing a
// trend line and a horizontal line and deleting them, the timezone, the
// ranges, snapshot, fullscreen, the volume pane close. On Android the fingers:
// pan with a fling, pinch, press-and-hold, the price scale drag and its double
// tap. Lag is measured separately in app-chart-mobile-perf (see the bottom).
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-chart-mobile`
mkdirSync(OUT, { recursive: true })
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: process.env.EMAIL || 'appreview@d1fpc3.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = []
let tag = ''
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + `[${tag}] ` + what); if (!ok) fails.push(`[${tag}] ${what}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PHONES = [
  ['iphone', 'webkit', PW.devices['iPhone 15 Pro']],
  ['se', 'webkit', PW.devices['iPhone SE (3rd gen)']],
  ['galaxy', 'chromium', PW.devices['Galaxy S24']],
  ['landscape', 'webkit', PW.devices['iPhone 15 Pro landscape']],
  ['android', 'chromium', PW.devices['Pixel 7']],
].filter(([k]) => !process.env.ONLY || process.env.ONLY.split(',').includes(k))

// the hit area round an element's centre: how far a finger can land and still get it
const HIT = () => {
  window.__hit = (e) => {
    const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const on = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t) || t.contains(e) && t.tagName === 'LABEL') }
    if (!on(cx, cy)) return { w: 0, h: 0 }
    // each side on its own: a 40px button whose centre sits on a half pixel still reads 40
    const reach = (dx, dy) => { let d = 0; while (d < 24 && on(cx + dx * (d + 1), cy + dy * (d + 1))) d++; return d }
    return { w: reach(-1, 0) + reach(1, 0) + 1, h: reach(0, -1) + reach(0, 1) + 1 }
  }
  window.__name = (e) => (e.getAttribute('aria-label') || e.title || e.textContent || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 26)
}

// a panel on screen: inside the viewport, nothing sticking out sideways, every control a thumb can hit
const surface = (page, sel) => page.evaluate((sel) => {
  const s = document.querySelector(sel); if (!s || s.hidden || getComputedStyle(s).display === 'none') return null
  const vw = innerWidth, vh = innerHeight, r = s.getBoundingClientRect()
  const small = [], clipped = []
  for (const c of s.querySelectorAll('button, input:not([type=checkbox]), select, label.tgl, .ch-cbtn')) {
    const cr = c.getBoundingClientRect(), cs = getComputedStyle(c)
    if (cs.display === 'none' || cs.visibility === 'hidden' || !cr.width || c.closest('[hidden]')) continue
    // outside the panel's own scroll box it cannot be hit, so it is judged when scrolled to
    const box = c.closest('.ch-menu-body, .ch-sheet-body, .ch-ctx, .ch-dlg-nav') || s, br = box.getBoundingClientRect()
    if (cr.top < br.top - 1 || cr.bottom > br.bottom + 1) continue   // part-scrolled: judged when the body scrolls it fully in
    if (c.closest('.ch-dlg-nav') && (cr.right > br.right || cr.left < br.left)) continue   // the tab strip scrolls sideways on purpose
    if (cr.right > vw + 1 || cr.left < -1) { clipped.push(`${window.__name(c)} ${Math.round(cr.left)}..${Math.round(cr.right)}`); continue }
    const h = window.__hit(c), swatch = !!c.closest('.ch-cpick .g, .sws')
    const need = swatch ? 28 : 38
    if (h.w && (h.w < need || h.h < need)) small.push(`${window.__name(c)} ${h.w}x${h.h}`)
  }
  return { r: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], inView: r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1, small, clipped }
}, sel)
const judge = (name, s) => {
  if (!s) { check(false, `${name} opens`); return }
  check(s.inView, `${name} sits inside the screen (${s.r.join(',')})`)
  check(!s.clipped.length, `${name}: nothing cut off at the sides${s.clipped.length ? ' (' + s.clipped.slice(0, 4).join('; ') + ')' : ''}`)
  check(!s.small.length, `${name}: every control is thumb-sized${s.small.length ? ' (' + s.small.slice(0, 6).join('; ') + (s.small.length > 6 ? ` +${s.small.length - 6}` : '') + ')' : ''}`)
}

for (const [name, engine, dev] of PHONES) {
  tag = name
  const browser = await PW[engine].launch()
  const ctx = await browser.newContext({ ...dev })
  await ctx.addInitScript(([k, v]) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem(k, v); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', 'dark'); localStorage.setItem('echelon-gex-tour', '1')
    for (const x of ['echelon-chart-settings', 'echelon-chart-layouts', 'echelon-chart-drawings', 'echelon-chart-alerts', 'echelon-chart-tf', 'echelon-chart-sym']) localStorage.removeItem(x)
  }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
  const page = await ctx.newPage()
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message || e)))
  page.on('dialog', (d) => d.type() === 'prompt' ? d.accept('Phone test') : d.accept())
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#td-h1', { timeout: 60000 }); await wait(1500)
  await page.evaluate(() => document.querySelector('[data-view="chart"]')?.click()); await wait(4500)
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  await page.evaluate(HIT)
  const CH = (fn, arg) => page.evaluate(fn, arg)
  const shot = (n) => page.screenshot({ path: `${OUT}/${name}-${n}.png` })
  const tapSel = async (sel) => { await page.locator(sel).first().tap({ timeout: 5000 }); await wait(450) }
  const closeAll = async () => { await CH(() => { window.__CH.$.menu(null); document.getElementById('ch-ctx').hidden = true; document.getElementById('ch-goto-pop').hidden = true; if (!document.getElementById('ch-sheet').hidden) document.getElementById('ch-sheet-close').click() }); await wait(350) }
  await shot('00-chart')

  // ── the page itself ──
  const lay = await CH(() => {
    const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, bad: [], ids: [] }
    for (const e of document.querySelectorAll('#v-chart .ch-bar > button, #v-chart .ch-bar .ch-symbtn, #v-chart .ch-foot button')) {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect(); if (cs.display === 'none' || !r.width) continue
      out.ids.push(e.id || e.textContent.trim())
      const h = window.__hit(e), onScreen = r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= innerHeight + 1
      if (!onScreen || h.w < 38 || h.h < 38) out.bad.push(`${window.__name(e)} ${onScreen ? '' : 'OFF-SCREEN '}${h.w}x${h.h}`)
    }
    const st = document.getElementById('ch-stage').getBoundingClientRect(); out.stage = [Math.round(st.width), Math.round(st.height)]
    return out
  })
  check(lay.sw <= lay.vw, `no sideways scroll (${lay.sw} in ${lay.vw})`)
  const want = ['ch-back', 'ch-sym-btn', 'ch-tf-btn', 'ch-snap-btn', 'ch-full', 'ch-tools-btn', 'ch-alerts-btn', 'ch-type-btn', 'ch-ind-btn', 'ch-replay-btn', 'ch-layouts-btn', 'ch-settings-btn', 'ch-goto', 'ch-tz']
  check(want.every((w) => lay.ids.includes(w)), `every chart control is there (${want.filter((w) => !lay.ids.includes(w)).join(', ') || 'all ' + want.length})`)
  check(!lay.bad.length, `bar and foot controls on screen with a 38px+ hit area${lay.bad.length ? ' (' + lay.bad.join('; ') + ')' : ''}`)
  check(lay.stage[1] >= (name === 'landscape' ? 200 : 380), `the chart gets the room (${lay.stage.join('x')})`)

  // ── every panel ──
  for (const [btn, sel, label] of [['#ch-sym-btn', '#ch-menu', 'Symbol search'], ['#ch-tf-btn', '#ch-sheet', 'Interval'], ['#ch-tools-btn', '#ch-sheet', 'Drawing tools'], ['#ch-alerts-btn', '#ch-menu', 'Alerts'], ['#ch-type-btn', '#ch-menu', 'Chart type'], ['#ch-ind-btn', '#ch-menu', 'Indicators'], ['#ch-layouts-btn', '#ch-menu', 'Layouts'], ['#ch-settings-btn', '#ch-menu', 'Settings'], ['#ch-snap-btn', '#ch-ctx', 'Snapshot'], ['#ch-tz', '#ch-ctx', 'Timezone'], ['#ch-goto', '#ch-goto-pop', 'Go to date']]) {
    await tapSel(btn); await wait(250)
    judge(label, await surface(page, sel))
    await shot('p-' + label.replace(/\W+/g, '-').toLowerCase())
    await closeAll()
  }
  // the settings tabs, each one's content judged in turn
  await tapSel('#ch-settings-btn')
  const tabs = await CH(() => [...document.querySelectorAll('#ch-menu .ch-dlg-nav button[data-t]')].map((b) => b.dataset.t))
  check(tabs.length >= 5, `settings has its tabs (${tabs.join(', ')})`)
  for (const t of tabs) {
    await page.locator(`#ch-menu .ch-dlg-nav button[data-t="${t}"]`).tap(); await wait(350)
    const vis = await CH(() => { const b = document.getElementById('ch-menu-body'); return [...b.children].filter((n) => !n.hidden).length })
    check(vis > 0, `settings tab ${t} shows its settings (${vis} rows)`)
    // scroll the body through so the rows below the fold are judged too
    for (let k = 0; k < 4; k++) { judge(`Settings > ${t} (${k})`, await surface(page, '#ch-menu')); const more = await CH(() => { const b = document.getElementById('ch-menu-body'); const was = b.scrollTop; b.scrollTop += b.clientHeight * 0.8; return b.scrollTop > was }); if (!more) break; await wait(150) }
    await shot('settings-' + t.replace(/\W+/g, '-').toLowerCase())
  }
  // a colour, through the shared picker
  await page.locator('#ch-menu .ch-dlg-nav button[data-t="Symbol"]').tap(); await wait(300)
  await CH(() => document.querySelector('#ch-menu .ch-cbtn[data-key="up"]')?.scrollIntoView({ block: 'center' })); await wait(200)
  await tapSel('#ch-menu .ch-cbtn[data-key="up"]')
  judge('Colour picker', await surface(page, '#ch-cpick'))
  await shot('colour-picker')
  const sw = await CH(() => { const b = [...document.querySelectorAll('#ch-cpick .g button')].find((x) => x.dataset.c && x.dataset.c !== window.__CH.s.up); return b?.dataset.c })
  if (sw) { await tapSel(`#ch-cpick .g button[data-c="${sw}"]`); check(await CH(() => window.__CH.s.up) === sw, `tapping a swatch sets the up body (${sw})`) }
  await CH(() => { window.__CH.s.up = '#dbdbdb'; window.__CH.$.paint() })
  await closeAll()

  // ── what the controls do ──
  // interval
  await tapSel('#ch-tf-btn'); await tapSel('#ch-sheet-body button:text-is("15m")')
  check(await CH(() => window.__CH.tf) === '15m', `Interval: 15m from the sheet (${await CH(() => window.__CH.tf)})`)
  await tapSel('#ch-tf-btn'); await tapSel('#ch-sheet-body button:text-is("5m")')
  // symbol
  await tapSel('#ch-sym-btn'); await tapSel('#ch-menu .ch-symrow[data-sym="MNQ"]'); await wait(1500)
  check(await CH(() => window.__CH.sym) === 'MNQ', `Symbol: MNQ from the list (${await CH(() => window.__CH.sym)})`)
  await tapSel('#ch-sym-btn'); await tapSel('#ch-menu .ch-symrow[data-sym="NQ"]'); await wait(1200)
  // chart type
  await tapSel('#ch-type-btn')
  await page.locator('#ch-menu .ch-opt').filter({ has: page.locator('b', { hasText: /^Bars$/ }) }).first().tap(); await wait(400)
  check(await CH(() => window.__CH.s.type) === 'bars', `Chart type: Bars (${await CH(() => window.__CH.s.type)})`)
  await CH(() => { window.__CH.s.type = 'candles'; window.__CH.$.paint() }); await closeAll()
  // indicators: a switch, then its gear, then back
  await tapSel('#ch-ind-btn')
  const vwapRow = page.locator('#ch-menu .ch-row').filter({ hasText: 'VWAP' }).first()
  await vwapRow.locator('label.tgl').tap(); await wait(300)
  check(await CH(() => window.__CH.s.vwap) === true, 'Indicators: the VWAP switch turns it on')
  await vwapRow.locator('.ch-gear').tap(); await wait(400)
  check(await CH(() => document.getElementById('ch-menu-title').textContent) === 'VWAP', `its gear opens the VWAP panel (${await CH(() => document.getElementById('ch-menu-title').textContent)})`)
  judge('VWAP panel', await surface(page, '#ch-menu')); await shot('ind-vwap')
  await tapSel('#ch-menu-back')
  check(await CH(() => window.__CH.menu) === 'ind', 'and Back returns to the list')
  await page.locator('#ch-menu .ch-row').filter({ hasText: 'D1 LIT' }).first().locator('.ch-gear').tap(); await wait(400)
  judge('D1 LIT panel', await surface(page, '#ch-menu')); await shot('ind-lit')
  await CH(() => { window.__CH.s.vwap = false; window.__CH.$.paint() }); await closeAll()
  // layouts: save one, it lists, apply it
  await tapSel('#ch-layouts-btn')
  const saveBtn = page.locator('#ch-menu button').filter({ hasText: /save/i }).first()
  if (await saveBtn.count()) { await saveBtn.tap(); await wait(500) }
  const lays = await CH(() => JSON.parse(localStorage.getItem('echelon-chart-layouts') || '[]').length)
  check(lays >= 1, `Layouts: Save keeps the chart under a name (${lays} saved)`)
  judge('Layouts with one saved', await surface(page, '#ch-menu')); await shot('layouts-saved')
  await closeAll()
  // alerts: add at the last price, then take it away
  const a0 = await CH(() => window.__CH.alerts.length)
  await tapSel('#ch-alerts-btn')
  await page.locator('#ch-menu button').filter({ hasText: /Add alert/ }).first().tap(); await wait(400)
  check(await CH(() => window.__CH.alerts.length) === a0 + 1, 'Alerts: Add alert at the last price adds one')
  judge('Alerts with one set', await surface(page, '#ch-menu')); await shot('alerts-set')
  await CH(() => { window.__CH.alerts.length = 0; localStorage.removeItem('echelon-chart-alerts'); window.__CH.$.paint() }); await closeAll()
  // replay: arm, pick a bar, step, the bar of controls fits, exit
  await tapSel('#ch-replay-btn')
  const box = await page.locator('#ch-canvas').boundingBox()
  await page.touchscreen.tap(box.x + box.width * 0.4, box.y + box.height * 0.6); await wait(500)   // below the legend, which takes taps of its own
  check(await CH(() => window.__CH.replay.on) === true, 'Replay: tap the chart to start from that bar')
  judge('Replay controls', await surface(page, '#ch-replay')); await shot('replay')
  const cut0 = await CH(() => window.__CH.replay.cut)
  await tapSel('#ch-rp-fwd')
  check(await CH(() => window.__CH.replay.cut) > cut0, 'and forward steps one bar')
  await tapSel('#ch-rp-exit')
  check(await CH(() => window.__CH.replay.on) === false, 'and Exit leaves replay')
  // drawing: a trend line by two taps, a horizontal line by one, the selection bar, delete
  const d0 = await CH(() => window.__CH.drawings.length)
  await tapSel('#ch-tools-btn'); await page.locator('#ch-sheet-body button').filter({ hasText: 'Trend line' }).first().tap(); await wait(400)
  await page.touchscreen.tap(box.x + box.width * 0.25, box.y + box.height * 0.7); await wait(250)
  await page.touchscreen.tap(box.x + box.width * 0.55, box.y + box.height * 0.45); await wait(450)
  check(await CH(() => window.__CH.drawings.length) === d0 + 1, `Drawing: two taps make a trend line (${await CH(() => window.__CH.drawings.length) - d0} added)`)
  judge('Selection bar', await surface(page, '#ch-selbar')); await shot('drawn-trend')
  const del = page.locator('#ch-selbar button[title*="Delete" i], #ch-selbar button[aria-label*="Delete" i], #ch-selbar .danger').first()
  if (await del.count()) { await del.tap(); await wait(350) }
  check(await CH(() => window.__CH.drawings.length) === d0, 'and the selection bar deletes it')
  await tapSel('#ch-tools-btn'); await page.locator('#ch-sheet-body button').filter({ hasText: 'Horizontal line' }).first().tap(); await wait(400)
  await page.touchscreen.tap(box.x + box.width * 0.4, box.y + box.height * 0.5); await wait(450)
  check(await CH(() => window.__CH.drawings.some((d) => d.type === 'hline')), 'Drawing: one tap places a horizontal line')
  await CH(() => { window.__CH.drawings.length = 0; window.__CH.sel = null; window.__CH.$.paint() }); await CH(() => document.getElementById('ch-selbar').hidden = true)
  await CH(() => window.__CH.$.setTool?.('cross'))
  // timezone
  await tapSel('#ch-tz'); await page.locator('#ch-ctx .it').filter({ hasText: 'Chicago' }).first().tap(); await wait(300)
  check(await CH(() => window.__CH.s.tz) === 'America/Chicago', `Timezone: Chicago from the sheet (${await CH(() => window.__CH.s.tz)})`)
  await tapSel('#ch-tz'); await page.locator('#ch-ctx .it').filter({ hasText: 'New York' }).first().tap(); await wait(300)
  // ranges
  const bw0 = await CH(() => window.__CH.barW)
  await tapSel('#ch-foot button[data-range="1M"]')
  check(await CH(() => window.__CH.barW) !== bw0, `Ranges: 1M refits the view (bar width ${bw0} to ${(await CH(() => window.__CH.barW)).toFixed(2)})`)
  await tapSel('#ch-foot button[data-range="1D"]')
  // fullscreen: the tools row folds away and comes back
  const h0 = await CH(() => document.getElementById('ch-stage').getBoundingClientRect().height)
  await tapSel('#ch-full')
  const h1 = await CH(() => document.getElementById('ch-stage').getBoundingClientRect().height)
  check(h1 > h0 + 20, `Fullscreen gives the chart more room (${Math.round(h0)} to ${Math.round(h1)})`)
  await shot('fullscreen')
  await tapSel('#ch-full')
  // the volume pane's ×
  const vx = await CH(() => window.__CH.volX)
  if (vx) { await page.touchscreen.tap(box.x + (vx.x0 + vx.x1) / 2, box.y + (vx.y0 + vx.y1) / 2); await wait(350) }
  check(await CH(() => window.__CH.s.volume) === false, 'the volume pane × closes it under a finger')
  await CH(() => { window.__CH.s.volume = true; window.__CH.$.paint() })

  // ── fingers (Chromium only: it is the engine Playwright can put two of them on) ──
  if (engine === 'chromium') {
    const cdp = await ctx.newCDPSession(page)
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) })
    const cx = box.x + box.width * 0.45, cy = box.y + box.height * 0.45
    // pan, and let go moving: the chart glides (from the default view, so there is history to glide into)
    await CH(() => { window.__CH.barW = 9; window.__CH.offset = 6; window.__CH.auto = true; window.__CH.$.paint() }); await wait(300)
    const o0 = await CH(() => window.__CH.offset)
    await touch('touchStart', [[cx, cy]])
    for (let k = 1; k <= 12; k++) { await touch('touchMove', [[cx + k * 14, cy]]); await wait(12) }
    await touch('touchEnd', []); await wait(80)
    const o1 = await CH(() => window.__CH.offset); await wait(500)
    const o2 = await CH(() => window.__CH.offset)
    check(o1 !== o0, `a one-finger drag pans (offset ${o0.toFixed(1)} to ${o1.toFixed(1)})`)
    check(o2 !== o1, `and a fling keeps it gliding after the finger lifts (${o1.toFixed(1)} to ${o2.toFixed(1)})`)
    const latest = await CH(() => !document.getElementById('ch-latest').hidden)
    check(latest, 'the back-to-latest button shows once scrolled back')
    if (latest) { judge('Latest button', await surface(page, '#ch-latest')); await tapSel('#ch-latest'); await wait(600); check(await CH(() => window.__CH.offset) < 20, 'and it brings the latest bar back') }
    // pinch out: bars get wider
    const w0 = await CH(() => window.__CH.barW)
    await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]])
    for (let k = 1; k <= 10; k++) { await touch('touchMove', [[cx - 40 - k * 9, cy], [cx + 40 + k * 9, cy]]); await wait(12) }
    await touch('touchEnd', []); await wait(200)
    const w1 = await CH(() => window.__CH.barW)
    check(w1 > w0 * 1.3, `a pinch zooms the bars (${w0.toFixed(1)} to ${w1.toFixed(1)}px)`)
    // the price scale: drag scales it, a double tap puts auto back
    const px = box.x + box.width - 20
    await touch('touchStart', [[px, cy]]); for (let k = 1; k <= 8; k++) { await touch('touchMove', [[px, cy + k * 10]]); await wait(12) } await touch('touchEnd', []); await wait(200)
    check(await CH(() => window.__CH.auto) === false, 'dragging the price scale takes it off auto')
    for (let k = 0; k < 2; k++) { await touch('touchStart', [[px, cy]]); await wait(40); await touch('touchEnd', []); await wait(120) }
    await wait(200)
    check(await CH(() => window.__CH.auto) === true, 'and a double tap on it puts auto back')
    // press and hold: the context menu, as a sheet, and it stays open when the finger lifts
    await touch('touchStart', [[cx, cy]]); await wait(800); await touch('touchEnd', []); await wait(400)
    const held = await surface(page, '#ch-ctx')
    judge('Press-and-hold menu', held); await shot('press-hold')
    await closeAll()
  }

  check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`)
  await browser.close()
}

console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
console.log('shots: ' + OUT)
process.exit(fails.length ? 1 : 0)
