// The chart's controls, explained (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-ux-visual.mjs        (APP_URL / OUT / EMAIL env)
//
// Five things D1 asked for in one sitting, each checked rather than eyeballed:
//   hover        every control on the bar says what it means, in a sentence
//   intervals    the whole list, 1m to monthly, not a box that invents one
//   types        the chart-type picker DRAWS each type beside its name
//   colours      the settings dialog shows the candle it is about to change,
//                and repaints it as the colour changes
//   layouts      they have their own button on the bar, not a link buried in a
//                dialog, which is why he asked where they had gone
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const { chromium } = require(PW.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-chart-ux`
mkdirSync(OUT, { recursive: true })
const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
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
const ctx = await browser.newContext({ viewport: { width: 1500, height: 880 }, deviceScaleFactor: 1 })
await ctx.addInitScript(([k, v]) => {
  localStorage.setItem(k, v)
  localStorage.setItem('echelon-splash-day', new Date().toDateString())
  localStorage.setItem('echelon-theme', 'dark')
  localStorage.setItem('echelon-gex-tour', '1')
}, [`sb-${REF}-auth-token`, JSON.stringify(session)])
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
await page.goto(process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#td-h1', { timeout: 60000 })
await page.waitForTimeout(1500)
await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click())
await page.waitForTimeout(4000)
await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })

// ── hovering says what a control means ──
const tagged = await page.evaluate(() => document.querySelectorAll('#v-chart [data-tip]').length)
check(tagged >= 20, `the bar's controls carry an explanation (${tagged} of them)`)
await page.hover('#ch-adj')
await page.waitForTimeout(700)
const tip = await page.evaluate(() => {
  const t = document.querySelector('.ch-tip'); if (!t) return null
  const r = t.getBoundingClientRect()
  return { name: t.querySelector('b')?.textContent, chars: (t.querySelector('span')?.textContent || '').length, on: t.classList.contains('on'), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }
})
check(!!tip && tip.on && tip.name === 'ADJ' && tip.chars > 60, `hovering ADJ explains it in a sentence ("${tip?.name}", ${tip?.chars} chars)`)
check(!!tip && tip.inside, 'and the note stays on screen')
await page.screenshot({ path: `${OUT}/tip-adj.png` })
await page.hover('#ch-tz')
await page.waitForTimeout(700)
check(await page.evaluate(() => document.querySelector('.ch-tip b')?.textContent) === 'Timezone', 'the timezone corner explains itself too')
check(await page.evaluate(() => !document.querySelector('#ch-adj[title], #ch-tz[title], #ch-autobtn[title]')), 'the native tooltip is stripped, so only one note appears')

// ── every interval ──
await page.evaluate(() => document.getElementById('ch-tf-any').click())
await page.waitForTimeout(600)
const ivs = await page.evaluate(() => [...document.querySelectorAll('#ch-menu-body .ch-ivs button')].map((b) => b.textContent))
const want = ['1m', '2m', '3m', '4m', '5m', '10m', '15m', '30m', '45m', '1h', '2h', '4h', 'D', 'W', 'M']
check(want.every((x) => ivs.includes(x)), `the list holds every interval (${ivs.length}: ${ivs.join(' ')})`)
await page.screenshot({ path: `${OUT}/intervals.png` })
await page.evaluate(() => [...document.querySelectorAll('#ch-menu-body .ch-ivs button')].find((b) => b.textContent === '45m')?.click())
await page.waitForTimeout(2600)
check(await page.evaluate(() => window.__CH.tf) === '45m', 'picking 45m from the list sets it')

// monthly has to bucket by calendar month, or it is a weekly chart with the wrong label
await page.evaluate(() => document.getElementById('ch-tf-any').click())
await page.waitForTimeout(500)
await page.evaluate(() => [...document.querySelectorAll('#ch-menu-body .ch-ivs button')].find((b) => b.textContent === 'M')?.click())
await page.waitForTimeout(3200)
const mon = await page.evaluate(() => {
  const months = window.__CH.bars.slice(-6).map((x) => new Date(x.t * 1000).toISOString().slice(0, 7))
  return { tf: window.__CH.tf, months, uniq: new Set(months).size }
})
check(mon.tf === 'M' && mon.uniq === mon.months.length && mon.months.length > 1, `monthly really buckets by month (${mon.months.join(' ')})`)
await page.evaluate(() => { const b = [...document.querySelectorAll('#ch-tf button')].find((x) => x.dataset.tf === '5m'); b && b.click() })
await page.waitForTimeout(2400)

// ── the type picker draws each type ──
await page.evaluate(() => document.getElementById('ch-type-btn')?.click())
await page.waitForTimeout(700)
const types = await page.evaluate(() => {
  const o = [...document.querySelectorAll('#ch-menu-body .ch-opt-ty')]
  const painted = o.filter((x) => {
    const c = x.querySelector('canvas'); if (!c) return false
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return true
    return false
  })
  return { n: o.length, art: o.filter((x) => x.querySelector('canvas')).length, painted: painted.length }
})
check(types.n === 6 && types.art === 6, `the type picker lists six types with a drawing each (${types.art}/${types.n})`)
check(types.painted === 6, `and each drawing has actually painted (${types.painted}/6)`)
await page.screenshot({ path: `${OUT}/types.png` })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// ── the candle you are colouring ──
await page.evaluate(() => document.getElementById('ch-settings-btn').click())
await page.waitForTimeout(900)
check(await page.evaluate(() => !!document.getElementById('ch-cprev-cv')), 'the settings dialog shows the candle it is about to change')
const shot = () => page.evaluate(() => {
  const c = document.getElementById('ch-cprev-cv'); if (!c) return ''
  // the whole image, not the first rows: the top of the box is blank, so a
  // slice of it is identical no matter what colour the candle is
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let h = 0
  for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] * 7 + d[i + 1] * 3 + d[i + 2]) % 2147483647
  return h
})
const before = await shot()
await page.evaluate(() => { window.__CH.s.up = '#00e5ff'; window.__CH.$.paint() })
await page.waitForTimeout(800)
const after = await shot()
check(!!before && before !== after, 'and it repaints the moment the colour changes')
await page.screenshot({ path: `${OUT}/preview.png` })
await page.evaluate(() => { window.__CH.s.up = '#ffffff'; window.__CH.$.paint() })

// ── layouts, findable ──
check(await page.evaluate(() => !!document.getElementById('ch-layouts-btn')), 'Layouts has its own button on the bar')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
await page.evaluate(() => document.getElementById('ch-layouts-btn').click())
await page.waitForTimeout(800)
check(await page.evaluate(() => document.getElementById('ch-menu-title')?.textContent) === 'Layouts', 'and it opens the layouts panel')
await page.screenshot({ path: `${OUT}/layouts.png` })

if (errs.length) fails.push('page errors: ' + errs.slice(0, 3).join(' | '))
console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
console.log('shots: ' + OUT)
await browser.close()
process.exit(fails.length ? 1 : 0)
