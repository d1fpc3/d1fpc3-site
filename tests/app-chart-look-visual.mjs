// The chart's look, its intervals and its countdown (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-look-visual.mjs        (APP_URL / OUT / EMAIL env)
//
// Three things D1 asked for, each measured rather than eyeballed:
//
//   the look       sampled off his own TradingView screenshot: the canvas is
//                  #808080, the chrome around it stays dark, and the prices on
//                  the scale are WHITE. The first attempt got this wrong by
//                  letting the grey canvas flip the whole app to the light skin.
//   any interval   typing digits has always set one, but nothing said so; the +
//                  on the interval row opens the same box.
//   the countdown  it ran off the wall clock, so on a Saturday it counted down
//                  to a bar the market will never print. Checked on two clocks,
//                  a Wednesday mid-session and a Saturday, through CH.cdOn.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-chart-look`
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

const openChart = async (ctx) => {
  const page = await ctx.newPage()
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#td-h1', { timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click())
  await page.waitForTimeout(4000)
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  return page
}
const seed = (ctx) => ctx.addInitScript(([k, v]) => {
  localStorage.setItem(k, v)
  localStorage.setItem('echelon-splash-day', new Date().toDateString())
  localStorage.setItem('echelon-theme', 'dark')
  localStorage.setItem('echelon-gex-tour', '1')
}, [`sb-${REF}-auth-token`, JSON.stringify(session)])

// ── the look ──
{
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 860 }, deviceScaleFactor: 1 })
  await seed(ctx)
  const page = await openChart(ctx)
  const s = await page.evaluate(() => ({ skin: document.getElementById('v-chart')?.dataset.skin, bg: window.__CH.bgNow, up: window.__CH.s.up, down: window.__CH.s.down, grid: window.__CH.s.grid }))
  check(s.bg === '#808080', `the canvas is his grey (${s.bg})`)
  check(s.skin === 'dark', `and it does NOT flip the app to the light skin (${s.skin})`)
  check(s.up === '#dbdbdb' && !s.grid, `light grey bars up (white edge, see app-chart-candles-visual.mjs), no grid (up ${s.up}, grid ${s.grid})`)

  // The prices on the scale, read off the canvas as a CONTRAST RATIO against the
  // background. Counting light pixels was not enough and passed while the prices
  // were invisible: the last-price tag and the white bars bleed into that strip,
  // so the count was bright while the labels themselves were #7c8189 on #808080,
  // a ratio of 1.02. This finds the ink the labels are actually drawn in, with
  // the last-price tag's rows left out: it is filled in the up-bar colour, and
  // since that became #dbdbdb (not white) it out-counted the labels.
  const scale = await page.evaluate(() => {
    const cv = document.querySelector('#v-chart canvas'); const g = cv.getContext('2d')
    const r = cv.getBoundingClientRect(), dpr = cv.width / r.width
    const x0 = Math.round((r.width - 58) * dpr), w = Math.round(46 * dpr)
    const y0 = Math.round(cv.height * 0.18), h = Math.round(cv.height * 0.5)
    const d = g.getImageData(x0, y0, w, h).data
    const last = window.__CH.bars.at(-1), tagY = window.__CH.$.pt(last.t, last.c).y * dpr
    const lum = ([R, G, B]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(R) + 0.7152 * f(G) + 0.0722 * f(B) }
    const count = new Map()
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(y0 + Math.floor(i / 4 / w) - tagY) < 12 * dpr) continue
      const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2]
      count.set(k, (count.get(k) || 0) + 1)
    }
    const rows = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ c: k.split(',').map(Number), n }))
    const bg = rows[0].c                               // the scale's own background
    // Text is anti-aliased, so most of a glyph's pixels are blends between the
    // ink and the background and the single most common one is a blend. The ink
    // is the colour furthest from the background among the ones that make up a
    // real share of the text (>= 5%), which ignores a stray pixel or two.
    const text = rows.slice(1).filter((r2) => Math.abs(lum(r2.c) - lum(bg)) > 0.02), total = text.reduce((s2, r2) => s2 + r2.n, 0)
    const ink = text.filter((r2) => r2.n >= total * 0.05).sort((a, b) => Math.abs(lum(b.c) - lum(bg)) - Math.abs(lum(a.c) - lum(bg)))[0] || rows[1]
    const hi = Math.max(lum(ink.c), lum(bg)), lo = Math.min(lum(ink.c), lum(bg))
    const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
    return { bg: hex(bg), ink: hex(ink.c), ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2) }
  })
  check(scale.ratio >= 3, `the prices can actually be read: ${scale.ink} on ${scale.bg} is ${scale.ratio}:1`)
  await page.screenshot({ path: `${OUT}/look.png` })

  // the legend's OHLC sits on the canvas too: it wears the candles' wick colours
  // (the theme's teal was #089981 on #808080, 1.1:1)
  const leg = await page.evaluate(() => [...document.querySelectorAll('#ch-legend i.up, #ch-legend i.down')].map((n) => [n.className, getComputedStyle(n).color]))
  const legOk = leg.length && leg.every(([k, c]) => c === (k === 'up' ? 'rgb(255, 255, 255)' : 'rgb(250, 161, 164)'))
  check(legOk, `legend prices read in the candle colours (${[...new Set(leg.map(([k, c]) => `${k} ${c}`))].join(', ')})`)

  // ── the last price, zoomed in the way D1 had it (09-26) ──
  // His screenshot: the scale set by hand, so the AUTO chip was up; its
  // textAlign 'center' leaked into the tag, which printed the price half off
  // the tag and across the plot, with the 30,922 tick showing behind it.
  // Candles zoomed that far also ran on down through the volume pane.
  for (const [name, span] of [['scrolled into the future space', [14, 16]], ['zoomed so candles overflow', [6, 4]]]) {
    await page.evaluate(([lo, hi]) => { const CH = window.__CH, c = CH.bars.at(-1).c; CH.barW = 12; CH.offset = 60; CH.auto = false; CH.pMin = c - lo; CH.pMax = c + hi; CH.$.paint() }, span)
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => {
      const CH = window.__CH, cv = document.getElementById('ch-canvas'), g = cv.getContext('2d'), dpr = cv.width / cv.getBoundingClientRect().width
      // CH.axisAt is what the scale says it drew; worked out by hand when it is
      // missing (a build before it existed), so the pixel checks still run there
      const last = CH.bars.at(-1), w0 = cv.clientWidth, ax = w0 < 520 ? 60 : 78
      const A = CH.axisAt || { plotW: w0 - ax, mainH: Math.round((cv.clientHeight - 24) * 0.84), tag: CH.$.pt(last.t, last.c).y, cd: false, chip: null, ticks: [] }
      const lum = (i, d) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
      // dark tag ink that landed LEFT of the scale, in the tag's own rows
      const band = g.getImageData(Math.round((A.plotW - 80) * dpr), Math.round((A.tag - 5) * dpr), Math.round(78 * dpr), Math.round(10 * dpr)).data
      let leak = 0; for (let i = 0; i < band.length; i += 4) if (lum(i, band) < 0.08) leak++
      // and inside the tag, where it belongs
      const tag = g.getImageData(Math.round((A.plotW + 4) * dpr), Math.round((A.tag - 5) * dpr), Math.round(60 * dpr), Math.round(10 * dpr)).data
      let ink = 0; for (let i = 0; i < tag.length; i += 4) if (lum(i, tag) < 0.2) ink++
      // a tick label is ~12px tall; the tag spans 18, the countdown 15 under it, the chip 15
      const hit = A.ticks.filter((y) => (Math.abs(y - A.tag) < 15) || (A.cd && y > A.tag && y < A.tag + 30) || (A.chip != null && y + 6 > A.chip))
      // exact candle colours in the top rows of the volume pane
      const vp = g.getImageData(Math.round(100 * dpr), Math.round((A.mainH + 2) * dpr), Math.round((A.plotW - 110) * dpr), Math.round(8 * dpr)).data
      const fills = new Set(['219,219,219', '250,161,164', '50,53,62', '220,69,81']); let spill = 0
      for (let i = 0; i < vp.length; i += 4) if (fills.has(vp[i] + ',' + vp[i + 1] + ',' + vp[i + 2])) spill++
      return { tag: A.tag != null, leak, ink, hit: hit.map(Math.round), ticks: A.ticks.length, spill }
    })
    check(r.tag && r.ink > 20 && r.leak === 0, `${name}: the price sits inside its tag (${r.ink} ink px in the tag, ${r.leak} spilled onto the plot)`)
    check(r.ticks > 4 && !r.hit.length, `${name}: no scale price under the tag, countdown or AUTO chip (${r.ticks} drawn, colliding at ${r.hit.join(',') || 'none'})`)
    check(r.spill === 0, `${name}: candles stop at their pane, none in the volume pane (${r.spill} px)`)
    await page.screenshot({ path: `${OUT}/last-price-${name.split(' ')[0]}.png` })
  }
  await page.evaluate(() => { const CH = window.__CH; CH.barW = 9; CH.offset = 6; CH.auto = true; CH.$.paint() })

  // ── any interval ──
  // the row's chevron opens the whole list; app-chart-ux-visual.mjs walks it
  check(await page.evaluate(() => !!document.getElementById('ch-tf-any')), 'the interval row opens onto every interval')
  await page.evaluate(() => document.getElementById('ch-tf-any').click())
  await page.waitForTimeout(600)
  const ivn = await page.evaluate(() => document.querySelectorAll('#ch-menu-body .ch-ivs button').length)
  check(ivn > 15, `and that list is the full one (${ivn} intervals)`)
  await page.evaluate(() => [...document.querySelectorAll('#ch-menu-body .ch-ivs button')].find((b2) => b2.textContent === '45m')?.click())
  await page.waitForTimeout(2600)
  check(await page.evaluate(() => window.__CH.tf) === '45m', `picking 45m gives a 45 minute chart (${await page.evaluate(() => window.__CH.tf)})`)
  await page.screenshot({ path: `${OUT}/interval-45m.png` })
  await ctx.close()
}

// ── the countdown follows the session, not the clock ──
for (const [when, iso, want] of [['a Wednesday mid-session', '2026-09-23T14:30:00Z', true], ['a Saturday', '2026-09-26T14:30:00Z', false]]) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 860 }, deviceScaleFactor: 1, timezoneId: 'America/New_York' })
  await seed(ctx)
  const page = await ctx.newPage()
  await page.clock.setSystemTime(new Date(iso))
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#td-h1', { timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click())
  await page.waitForTimeout(4000)
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  const sess = await page.evaluate(() => document.getElementById('ch-sess')?.textContent)
  const on = await page.evaluate(() => window.__CH?.cdOn === true)
  check(on === want, `on ${when} the session reads "${sess}" and the countdown is ${on ? 'running' : 'off'}`)
  await ctx.close()
}

console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
console.log('shots: ' + OUT)
await browser.close()
process.exit(fails.length ? 1 : 0)
