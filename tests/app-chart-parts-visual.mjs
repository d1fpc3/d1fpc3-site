// Every part of every indicator, customisable (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-parts-visual.mjs        (APP_URL / OUT / W / HGT env)
//
// D1, 09-27, on his 2560 monitor: "can you not show yesterday's GEX levels or the days before",
// "the daily reset levels, turn all of that off", "the text has a box around it and it shouldn't",
// "I need to be able to fully customize every single indicator: take off the text for the London,
// change the colors of the New York trap box and everything".
// Seeds the settings he had (saved at litV 2 with the daily reset levels on) and proves: the
// migration turns them off once, D1 GEX draws only the session on screen now (and its switch
// brings the earlier ones back), no label has a plate behind it, every part row has a gear that
// opens that part, London's text goes, the NYT box takes its own fill, border colour and width,
// and the same part panel works as a sheet on a phone.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-chart-parts`; mkdirSync(OUT, { recursive: true })
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: process.env.EMAIL || 'appreview@d1fpc3.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = []
const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails.push(w) }
const browser = await PW.chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=d3d11'] })
const seed = (ctx) => ctx.addInitScript(([k, v]) => {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  localStorage.setItem(k, v); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', 'dark'); localStorage.setItem('echelon-gex-tour', '1')
  localStorage.setItem('echelon-chart-tf', '15m')
  localStorage.setItem('echelon-chart-settings', JSON.stringify({ litV: 2, lit: true, litDr: true, litLdn: true, litNy: true, gex: true, litDays: 3 }))
}, [`sb-${REF}-auth-token`, JSON.stringify(session)])
async function open(ctx) {
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e.message)))
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#td-h1', { timeout: 60000 }); await page.waitForTimeout(1500)
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  await page.evaluate(() => document.querySelector('[data-view="chart"]').click()); await page.waitForTimeout(7000)
  return { page, errs }
}
const labels = (page) => page.evaluate(() => (window.__CH.lbl || []).map((l) => ({ t: l.text, x0: l.x0, x1: l.x1, y0: l.y0, y1: l.y1 })))
const partRow = (page, name) => page.evaluate((name) => { const r = [...document.querySelectorAll('#ch-menu .ch-prow')].find((x) => x.querySelector('.t')?.firstChild?.textContent === name); if (!r) return false; r.querySelector('.ch-gear').click(); return true }, name)

// ── D1's monitor ──
{
  console.log('\n2560')
  const ctx = await browser.newContext({ viewport: { width: +(process.env.W || 2560), height: +(process.env.HGT || 1300) } }); await seed(ctx)
  const { page, errs } = await open(ctx)
  const st = await page.evaluate(() => ({ v: window.__CH.s.litV, dr: window.__CH.s.litDr, last: window.__CH.s.gexLast }))
  ok(st.v === 3 && st.dr === false, `the daily reset levels he had on went off once, litV 3: ${JSON.stringify(st)}`)
  const L0 = await labels(page)
  ok(!L0.some((l) => /^(Mon|Tue|Wed|Thu|Fri|Sun) (Open|High|Low|Close)$/.test(l.t)), 'no Thu Open / Thu Close / Fri Open labels')
  ok(L0.some((l) => l.t === '[18:00 OPEN]'), 'the 18:00 open stays')
  const gex0 = L0.filter((l) => /Γ|Wall|Flip/.test(l.t))
  await page.screenshot({ path: `${OUT}/2560-chart.png` })
  // no plate: the pixels just left of a label's first letter are the canvas colour, not a darker or lighter box
  const plate = await page.evaluate(() => {
    const cv = document.getElementById('ch-canvas'), g = cv.getContext('2d'), dpr = cv.width / cv.clientWidth, bg = window.__CH.bgNow
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const want = /^#[0-9a-f]{6}$/i.test(bg) ? hex(bg) : null; if (!want) return { skip: true }
    let off = 0, n = 0
    for (const l of (window.__CH.lbl || []).slice(0, 12)) { const d = g.getImageData(Math.round((l.x0 - 1.5) * dpr), Math.round(((l.y0 + l.y1) / 2) * dpr), 1, 1).data; n++; if (Math.abs(d[0] - want[0]) + Math.abs(d[1] - want[1]) + Math.abs(d[2] - want[2]) > 60) off++ }
    return { n, off }
  })
  ok(plate.skip || plate.off <= Math.ceil(plate.n / 4), `no box behind the labels (${plate.off} of ${plate.n} edges differ from the canvas, lines and candles can cross a few)`)
  // D1 GEX: the latest session only, and the switch brings the rest back
  await page.evaluate(() => { window.__CH.s.gexLast = false; window.__CH.$.paint() }); await page.waitForTimeout(300)
  const gexAll = (await labels(page)).filter((l) => /Γ|Wall|Flip/.test(l.t))
  await page.evaluate(() => { window.__CH.s.gexLast = true; window.__CH.$.paint() }); await page.waitForTimeout(300)
  ok(gex0.length > 0 && gexAll.length > gex0.length, `D1 GEX draws today's session only (${gex0.length} names), earlier sessions come back with the switch off (${gexAll.length})`)
  // the part panels
  await page.evaluate(() => window.__CH.$.menu('ind:lit')); await page.waitForTimeout(500)
  const gears = await page.evaluate(() => document.querySelectorAll('#ch-menu .ch-prow .ch-gear').length)
  ok(gears >= 18, `every D1 LIT part row has its own gear (${gears})`)
  ok(await partRow(page, 'London box'), 'the London box gear opens its panel')
  await page.waitForTimeout(500)
  ok(await page.evaluate(() => document.getElementById('ch-menu-title').textContent === 'London box' && !document.getElementById('ch-menu-back').hidden), 'titled London box, with a way back')
  await page.evaluate(() => { const r = [...document.querySelectorAll('#ch-menu .ch-row')].find((x) => /Show the text/.test(x.textContent)); r.querySelector('label.tgl').click() }); await page.waitForTimeout(400)
  ok(await page.evaluate(() => window.__CH.s.litLdnTxt === false && !(window.__CH.lbl || []).some((l) => l.text === 'LDN')), 'London text off: the LDN label is gone, the box stays')
  ok(await page.evaluate(() => window.__CH.s.litLdn === true), 'and the London box itself is still on')
  await page.screenshot({ path: `${OUT}/2560-london-panel.png` })
  await page.evaluate(() => document.getElementById('ch-menu-back').click()); await page.waitForTimeout(400)
  ok(await page.evaluate(() => window.__CH.menu) === 'ind:lit', 'Back returns to D1 LIT')
  ok(await partRow(page, 'NYT box'), 'the NYT box gear opens its panel'); await page.waitForTimeout(400)
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#ch-menu .ch-dlg-nav button[data-t]')].map((b) => b.dataset.t))
  ok(['Text', 'Box', 'Border'].every((t) => tabs.includes(t)), `the NYT box panel has Text, Box and Border: ${tabs.join(', ')}`)
  // a fill colour, a border colour and a border width, painted: sample the NYT box's corner pixel before and after
  await page.evaluate(() => { const S = window.__CH.s; S.litNyC = '#26a69a'; S.litNyBc = '#ffeb3b'; S.litNyBw = 3; S.litNyF = 0.25; window.__CH.$.paint() }); await page.waitForTimeout(300)
  const yellow = await page.evaluate(() => { const cv = document.getElementById('ch-canvas'), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 3) if (d[i] > 230 && d[i + 1] > 210 && d[i + 2] < 90) n++; return n })
  ok(yellow > 200, `the NYT border paints in its own colour (${yellow} yellow pixels)`)
  await page.evaluate(() => { const r = [...document.querySelectorAll('#ch-menu .ch-dlg-nav button[data-t]')].find((b) => b.dataset.t === 'Border'); r?.click() }); await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/2560-nyt-border.png` })
  await page.evaluate(() => { const r = [...document.querySelectorAll('#ch-menu .ch-row')].find((x) => /Show the border/.test(x.textContent)); r.querySelector('label.tgl').click() }); await page.waitForTimeout(300)
  const yellow2 = await page.evaluate(() => { const cv = document.getElementById('ch-canvas'), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 3) if (d[i] > 230 && d[i + 1] > 210 && d[i + 2] < 90) n++; return n })
  ok(yellow2 < yellow / 10, `Show the border off takes it away (${yellow2} left)`)
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ch-menu .rowbtn')].find((x) => /Reset this part/.test(x.textContent)); b?.click() }); await page.waitForTimeout(300)
  ok(await page.evaluate(() => { const S = window.__CH.s; return !S.litNyBc && S.litNyBd !== false && !S.litNyC }), 'Reset this part puts the NYT box back to its defaults')
  // every other indicator with parts has the gear too
  for (const [ind, name] of [['ind:gex', 'Call wall'], ['ind:ict', 'Midnight open'], ['ind:eng', 'BoS / CHoCH'], ['ind:pend', 'Buy-side (highs)'], ['ind:amit', 'Bullish']]) {
    await page.evaluate((w) => window.__CH.$.menu(w), ind); await page.waitForTimeout(350)
    const opened = await partRow(page, name); await page.waitForTimeout(300)
    ok(opened && await page.evaluate((n) => document.getElementById('ch-menu-title').textContent === n, name), `${ind}: ${name} opens its own panel`)
  }
  await page.evaluate(() => window.__CH.$.menu('ind:gex')); await page.waitForTimeout(300)
  ok(await page.evaluate(() => [...document.querySelectorAll('#ch-menu .ch-row')].some((x) => /Latest session only/.test(x.textContent))), 'D1 GEX has the Latest session only switch')
  // round 2 (D1: "I need to be able to customize the watermark ... make everything fully customizable")
  // a part's text size and line style
  await page.evaluate(() => window.__CH.$.menu('ind:lit')); await page.waitForTimeout(300)
  await partRow(page, '18:00 open'); await page.waitForTimeout(300)
  const lineRows = await page.evaluate(() => [...document.querySelectorAll('#ch-menu .ch-row')].map((r) => r.querySelector('.ch-row-t')?.firstChild?.textContent).filter(Boolean))
  ok(['Text size', 'Line style', 'Line width'].every((t) => lineRows.includes(t)), `a line part has text size, line style and width: ${lineRows.join(', ')}`)
  const h0 = await page.evaluate(() => (window.__CH.lbl || []).find((l) => l.text === '[18:00 OPEN]'))
  await page.evaluate(() => { window.__CH.s.litOpenTs = 15; window.__CH.$.paint() }); await page.waitForTimeout(250)
  const h1 = await page.evaluate(() => (window.__CH.lbl || []).find((l) => l.text === '[18:00 OPEN]'))
  ok(h0 && h1 && (h1.y1 - h1.y0) > (h0.y1 - h0.y0) + 2, `Text size Larger grows the 18:00 label (${h0 && h0.y1 - h0.y0}px to ${h1 && h1.y1 - h1.y0}px)`)
  await page.evaluate(() => { delete window.__CH.s.litOpenTs; window.__CH.$.paint() })
  // SD zones: demand and supply are parts with borders of their own
  await page.evaluate(() => { window.__CH.s.sd = true; window.__CH.$.menu('ind:sd') }); await page.waitForTimeout(500)
  ok(await partRow(page, 'Demand'), 'SD zones: Demand is a part with its own panel'); await page.waitForTimeout(300)
  const sdTabs = await page.evaluate(() => [...document.querySelectorAll('#ch-menu .ch-dlg-nav button[data-t]')].map((b) => b.dataset.t))
  ok(sdTabs.includes('Border'), `and its box has a Border tab: ${sdTabs.join(', ')}`)
  await page.evaluate(() => { window.__CH.s.sd = false; window.__CH.$.menu(null); window.__CH.$.paint() })
  // the watermark: Settings has a section, the LIT part opens the same, and every piece moves
  await page.evaluate(() => window.__CH.$.menu('settings')); await page.waitForTimeout(500)
  const setTabs = await page.evaluate(() => [...document.querySelectorAll('#ch-menu .ch-dlg-nav button[data-t]')].map((b) => b.dataset.t))
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ch-menu .ch-dlg-nav button[data-t]')].find((x) => x.dataset.t === 'Canvas'); b?.click() }); await page.waitForTimeout(300)
  const wmRows = await page.evaluate(() => [...document.querySelectorAll('#ch-menu .ch-row')].filter((r) => r.offsetParent).map((r) => r.querySelector('.ch-row-t')?.firstChild?.textContent).filter(Boolean))
  ok(['Show the tag', 'First line', 'Second line', 'Opacity', 'Size', 'Position', 'Align', 'Show the big symbol'].every((t) => wmRows.includes(t)), `Settings, Canvas carries the watermark: ${wmRows.filter((t) => /tag|line|Opacity|Size|Position|Align|symbol/i.test(t)).join(', ')}`)
  await page.screenshot({ path: `${OUT}/2560-settings-watermark.png` })
  const magenta = (where) => page.evaluate((where) => { const cv = document.getElementById('ch-canvas'), g = cv.getContext('2d'), dpr = cv.width / cv.clientWidth, W = cv.width, H = cv.height; const [x0, y0, x1, y1] = where === 'topmid' ? [W * 0.3, 0, W * 0.7, H * 0.15] : [W * 0.55, H * 0.55, W, H]; const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] > 200) n++; return n }, where)
  await page.evaluate(() => { const S = window.__CH.s; S.litWm = true; S.litWmC = '#ff00ff'; S.wmA = 1; S.wmSize = 1.6; S.wmL1 = 'custom'; S.wmT1 = 'D1 TRADES'; S.wmPos = 'top'; S.wmAlign = 'center'; window.__CH.$.menu(null); window.__CH.$.paint() }); await page.waitForTimeout(300)
  const top = await magenta('topmid')
  await page.evaluate(() => { const S = window.__CH.s; S.wmPos = 'bottom'; S.wmAlign = 'right'; window.__CH.$.paint() }); await page.waitForTimeout(300)
  const moved = { top: await magenta('topmid'), br: await magenta('br') }
  await page.screenshot({ path: `${OUT}/2560-watermark-custom.png` })
  ok(top > 300 && moved.top < top / 10 && moved.br > 300, `the tag takes a custom colour and text and moves: top ${top}px, then bottom right ${moved.br}px (top ${moved.top})`)
  await page.evaluate(() => { const S = window.__CH.s; S.wmL1 = 'off'; S.wmL2 = 'off'; window.__CH.$.paint() }); await page.waitForTimeout(250)
  ok(await magenta('br') < 20, 'both lines off leaves no tag')
  await page.evaluate(() => window.__CH.$.menu('ind:lit')); await page.waitForTimeout(300)
  await partRow(page, 'Watermark tag'); await page.waitForTimeout(300)
  const wmTabs = await page.evaluate(() => [...document.querySelectorAll('#ch-menu .ch-dlg-nav button[data-t]')].map((b) => b.dataset.t))
  ok(wmTabs.includes('Tag') && wmTabs.includes('Big symbol'), `the LIT watermark gear opens the same controls: ${wmTabs.join(', ')}`)
  await page.screenshot({ path: `${OUT}/2560-watermark-part.png` })
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ch-menu .rowbtn')].find((x) => /Reset this part/.test(x.textContent)); b?.click() }); await page.waitForTimeout(300)
  ok(await page.evaluate(() => { const S = window.__CH.s; return S.wmL1 === 'user' && S.wmL2 === 'info' && !S.litWmC && S.wmPos === 'top' }), 'Reset this part puts the watermark back')
  await page.evaluate(() => window.__CH.$.menu(null))
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''))
  await ctx.close()
}

// ── a phone: the same part panel as a sheet ──
{
  console.log('\nphone')
  const ctx = await browser.newContext({ ...PW.devices['iPhone 15 Pro'] }); await seed(ctx)
  const { page, errs } = await open(ctx)
  const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] })
  await page.evaluate(() => window.__CH.$.menu('ind:lit')); await page.waitForTimeout(600)
  await page.evaluate(() => { const r = [...document.querySelectorAll('#ch-menu .ch-prow')].find((x) => x.querySelector('.t')?.firstChild?.textContent === 'NYT box'); r?.scrollIntoView({ block: 'center' }) }); await page.waitForTimeout(300)
  const g = page.locator('#ch-menu .ch-prow', { hasText: 'NYT box' }).locator('.ch-gear').first()
  const box = await g.boundingBox()
  ok(box && box.width >= 38 && box.height >= 38, `the part gear is thumb-sized on a phone (${box ? Math.round(box.width) + 'x' + Math.round(box.height) : 'none'})`)
  await g.tap(); await page.waitForTimeout(700)
  const sheet = await page.evaluate(() => { const m = document.getElementById('ch-menu'), r = m.getBoundingClientRect(); return { title: document.getElementById('ch-menu-title').textContent, inView: r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, kind: m.dataset.kind } })
  ok(sheet.title === 'NYT box' && sheet.inView, `the NYT box panel rises as a sheet inside the screen: ${JSON.stringify(sheet)}`)
  await page.screenshot({ path: `${OUT}/phone-nyt-sheet.png` })
  ok(!errs.length, 'no page errors on the phone' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''))
  await ctx.close()
}

await browser.close()
console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
console.log('shots: ' + OUT)
process.exit(fails.length ? 1 : 0)
