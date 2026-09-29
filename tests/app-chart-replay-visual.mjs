// Bar replay, driven like a person (D1, 09-29: "fix up the replay mode, make sure everything works perfectly fine"):
// choose a start with the future veiled, step, Shift+Right, the SAME MOMENT on every interval (the last price never
// changes with the interval: 5m to 1h mid-replay used to hand over the whole hour), play at 10x, Space, click the
// progress rail, choose again and Esc back, run to the live bar (Back to live), exit. W and H env pick the size.
import { createRequire } from 'module'
import { readFileSync, mkdirSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW = require('C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-chart-replay`; mkdirSync(OUT, { recursive: true })
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`, APP = process.env.APP_URL || 'http://127.0.0.1:8125/echelon/app/'
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'appreview@d1fpc3.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
const W = +(process.env.W || 1440), H = +(process.env.H || 900)
const b = await PW.chromium.launch({ channel: 'chrome' }); const ctx = await b.newContext({ viewport: { width: W, height: H } })
await ctx.addInitScript(([k, v]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, v); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', 'dark'); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1'); localStorage.setItem('echelon-chart-sym', 'NQ'); localStorage.setItem('echelon-chart-tf', '5m'); localStorage.removeItem('echelon-chart-settings') }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
const page = await ctx.newPage(), errs = []; page.on('pageerror', (e) => errs.push(String(e.message)))
await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#td-h1', { state: 'attached', timeout: 60000 }); await page.waitForTimeout(1500)
await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click())
await page.waitForFunction(() => window.__CH?.bars?.length > 100, null, { timeout: 45000 }).catch(() => {}); await page.waitForTimeout(3500)
const fails = [], ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails.push(w) }
const st = () => page.evaluate(() => { const C = window.__CH, R = C.replay, v = C.vis || C.bars, l = v[v.length - 1]; return { cutT: R.cut, tfSec: C.tfSec, on: R.on, arm: R.arm, at: R.at, cut: R.cut, n: v.length, all: C.bars.length, last: l && { t: l.t, c: l.c, h: l.h, l: l.l, partial: !!l.partial }, playing: R.playing, done: R.done, tf: C.tf, dock: !document.getElementById('ch-replay').hidden, hint: !document.getElementById('ch-rp-hint').hidden, at_text: document.getElementById('ch-rp-at').textContent, p: getComputedStyle(document.getElementById('ch-rp-track')).getPropertyValue('--p') } })
const R0 = await (await page.$('#ch-canvas')).boundingBox(), at = (fx, fy) => [R0.x + R0.width * fx, R0.y + R0.height * fy]
// 1. choose a start
await page.click('#ch-replay-btn'); await page.waitForTimeout(300)
let s = await st(); ok(s.arm && s.hint && !s.dock && !s.on, `Replay arms: the hint shows, no dock yet (${JSON.stringify({ arm: s.arm, hint: s.hint })})`)
await page.mouse.move(...at(0.55, 0.45)); await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${W}-01-arm.png` })
await page.mouse.click(...at(0.55, 0.45)); await page.waitForTimeout(500)
s = await st(); ok(s.on && !s.arm && s.dock && !s.hint && s.n < s.all && s.at > s.cut, `a click starts it there: ${s.n} of ${s.all} bars, at ${new Date(s.at * 1000).toISOString()}`)
const startN = s.n, start = s
await page.mouse.move(...at(0.3, 0.3)); await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${W}-02-start.png` })
// 2. step
for (let k = 0; k < 3; k++) { await page.click('#ch-rp-fwd'); await page.waitForTimeout(120) }
s = await st(); ok(s.cutT - start.cutT === 3 * s.tfSec && s.at_text.length > 4, `forward three times: ${(s.cutT - start.cutT) / s.tfSec} bars on (${s.at_text})`)
await page.click('#ch-rp-back'); await page.waitForTimeout(150)
s = await st(); ok(s.cutT - start.cutT === 2 * s.tfSec, `back once: ${(s.cutT - start.cutT) / s.tfSec}`)
await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(150)
s = await st(); ok(s.cutT - start.cutT === 3 * s.tfSec, `Shift+Right steps too (${(s.cutT - start.cutT) / s.tfSec})`)
// 3. the same moment on every interval: the last price never changes with the interval, and no bar ends after the moment
const at0 = s.at, c0 = s.last.c
const perTf = []
for (const tf of ['1m', '15m', '1h', '4h', 'D', '5m']) {
  await page.evaluate((tf) => document.querySelector(`#ch-tf button[data-tf="${tf}"]`)?.click(), tf); await page.waitForTimeout(1600)
  const x = await st(); perTf.push([tf, x.last?.c, x.at === at0, x.last?.partial])
}
ok(perTf.every(([, c, same]) => c === c0 && same), `the moment holds across intervals, last price ${c0} on each: ${JSON.stringify(perTf)}`)
// 4. play
await page.click('#ch-rp-speed button[data-s="10"]'); const n1 = (await st()).n
await page.click('#ch-rp-play'); const tA = Date.now(); await page.waitForTimeout(1600); s = await st(); const tB = Date.now(); ok(s.playing, 'Play plays')
await page.screenshot({ path: `${OUT}/${W}-03-playing.png` })
const moved = s.n - n1, secs = (tB - tA) / 1000
await page.keyboard.press('Space'); await page.waitForTimeout(200); s = await st()
ok(!s.playing && moved >= 7 * secs && moved <= 13 * secs, `at 10x it moved ${moved} bars in ${secs.toFixed(2)}s, Space paused it`)
// 5. seek on the track
const trk = () => page.$('#ch-rp-track').then((h) => h.boundingBox()); let tr = await trk(); await page.mouse.click(tr.x + tr.width * 0.5, tr.y + tr.height / 2); await page.waitForTimeout(300)
s = await st(); ok(Math.abs(parseFloat(s.p) - 50) < 3, `a click halfway along the track goes halfway (${s.p})`)
// 6. choose again, then Esc back to where it was
const atBefore = s.at, nBefore = s.n
await page.click('#ch-rp-pick'); await page.waitForTimeout(250); s = await st(); ok(s.arm && s.n === s.all && s.hint && !s.dock, 'Choose another start shows the whole tape with the hint')
await page.keyboard.press('Escape'); await page.waitForTimeout(250); s = await st(); ok(!s.arm && s.on && s.at === atBefore && s.n === nBefore, 'Esc goes back to the same moment')
// 7. to the end: it stops there and says so
tr = await trk(); await page.mouse.click(tr.x + tr.width - 1, tr.y + tr.height / 2); await page.waitForTimeout(300)
await page.click('#ch-rp-fwd'); await page.waitForTimeout(200); await page.click('#ch-rp-fwd'); await page.waitForTimeout(200)
s = await st(); const exitTxt = await page.evaluate(() => document.querySelector('#ch-rp-exit b').textContent)
ok(s.done && exitTxt === 'Back to live' && s.n === s.all, `at the live bar it stops: "${exitTxt}"`)
await page.screenshot({ path: `${OUT}/${W}-04-done.png` })
// 8. exit
await page.click('#ch-rp-exit'); await page.waitForTimeout(300); s = await st(); ok(!s.on && !s.dock && s.n === s.all, 'Exit is back to live')
ok(!errs.length, `no page errors (${errs.join(' | ') || 'none'})`)
console.log(fails.length ? `${fails.length} FAILED` : 'ALL OK'); await b.close(); process.exit(fails.length ? 1 : 0)
