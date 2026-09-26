// Following somebody answers now, not in half a second (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-follow-visual.mjs        (LAT, APP_URL, EMAIL env)
//
// Injects the real round trip into every Supabase call, then measures the gap between the
// tap and the button saying the new thing. The old path disabled the button, waited for the
// write, flipped the label, and only then fetched the counts: two serial trips with a dead
// control in between. Also proves the rollback, because an optimistic update that cannot
// undo itself is just a lie told quickly.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = [
  'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright',
  'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright',
]
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-follow`
mkdirSync(OUT, { recursive: true })
const LAT = Number(process.env.LAT || 140)
const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const tokenFile = join(homedir(), '.supabase', 'access-token')
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')
const email = process.env.EMAIL || 'appreview@d1fpc3.com'
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = []
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1'); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', 'dark') }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
let failWrites = false
// Order matters and it is backwards: Playwright tries the LAST registered route first, so
// the specific /follows handler has to come AFTER the catch-all or the catch-all eats it.
await ctx.route(/supabase\.co\/(rest|functions|auth)\//, async (route) => { await new Promise((f) => setTimeout(f, LAT)); await route.continue() })
await ctx.route(/supabase\.co\/rest\/v1\/follows/, async (route) => {
  await new Promise((f) => setTimeout(f, LAT))
  const m = route.request().method()
  if (failWrites && (m === 'POST' || m === 'DELETE')) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'nope' }) })
  await route.continue()
})

const page = await ctx.newPage()
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))
await page.goto(process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#td-h1', { timeout: 60000 })
await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
await page.waitForTimeout(3000)

await page.evaluate(() => document.querySelector('.tab[data-view="members"]')?.click())
await page.waitForTimeout(2500)
await page.evaluate(() => { const n = document.querySelectorAll('.mm-row, .member-row, [data-uid]')[1]; n?.click() })
await page.waitForTimeout(1800)
const state0 = await page.evaluate(() => { const b = document.getElementById('mm-followbtn'); const l = document.querySelector('#mm-follow span:first-child b'); return { there: !!b && !b.hidden, label: b?.textContent.trim(), on: b?.classList.contains('on'), n: l ? Number(l.textContent) : null } })
check(state0.there, `the follow button is on the card ("${state0.label}", ${state0.n} followers)`)

// how long until the button says the new thing
const answer = await page.evaluate(() => new Promise((done) => {
  const b = document.getElementById('mm-followbtn')
  const l = document.querySelector('#mm-follow span:first-child b')
  const was = b.textContent.trim(), wasN = l ? l.textContent : null
  const t0 = performance.now()
  let labelAt = null, countAt = null, deadFor = 0, deadFrom = b.disabled ? t0 : null
  const tick = () => {
    if (b.disabled && deadFrom == null) deadFrom = performance.now()
    if (!b.disabled && deadFrom != null) { deadFor += performance.now() - deadFrom; deadFrom = null }
    if (labelAt == null && b.textContent.trim() !== was) labelAt = performance.now() - t0
    if (countAt == null && l && l.textContent !== wasN) countAt = performance.now() - t0
    if (labelAt != null && (countAt != null || !l) && performance.now() - t0 > 240) {
      if (deadFrom != null) deadFor += performance.now() - deadFrom
      return done({ labelAt: Math.round(labelAt), countAt: countAt == null ? null : Math.round(countAt), deadFor: Math.round(deadFor) })
    }
    if (performance.now() - t0 > 4000) return done({ labelAt: labelAt && Math.round(labelAt), countAt: countAt && Math.round(countAt), deadFor: Math.round(deadFor), timeout: true })
    requestAnimationFrame(tick)
  }
  b.click(); requestAnimationFrame(tick)
}))
check(answer.labelAt != null && answer.labelAt < 60, `the button says the new thing in ${answer.labelAt}ms`)
check(answer.countAt != null && answer.countAt < 60, `and the follower count moves with it (${answer.countAt}ms)`)
check(answer.deadFor === 0, `the button is never disabled under the finger (dead for ${answer.deadFor}ms)`)
await page.waitForTimeout(LAT * 3)
const after = await page.evaluate(() => { const b = document.getElementById('mm-followbtn'); const l = document.querySelector('#mm-follow span:first-child b'); return { label: b?.textContent.trim(), on: b?.classList.contains('on'), n: l ? Number(l.textContent) : null } })
check(after.label !== state0.label, `and it stays changed after the write lands ("${state0.label}" to "${after.label}", ${state0.n} to ${after.n})`)

// put it back, then prove the rollback
await page.evaluate(() => document.getElementById('mm-followbtn')?.click())
await page.waitForTimeout(LAT * 4)
const restored = await page.evaluate(() => document.getElementById('mm-followbtn')?.textContent.trim())
check(restored === state0.label, `toggling back restores "${restored}"`)

failWrites = true
const rolled = await page.evaluate(() => new Promise((done) => {
  const b = document.getElementById('mm-followbtn')
  const was = b.textContent.trim()
  b.click()
  const flipped = b.textContent.trim() !== was
  setTimeout(() => done({ flipped, back: b.textContent.trim() === was, now: b.textContent.trim(), was }), 1600)
}))
check(rolled.flipped, 'a failing write still answers immediately')
check(rolled.back, `and rolls back when it fails (back to "${rolled.now}")`)
await page.screenshot({ path: `${OUT}/follow.png` })

await browser.close()

// Put the account back. This taps a real Follow against production, so without this the
// test account is left following somebody and a notification is left in their inbox.
const me = session.user?.id
if (me) {
  const h = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }
  const del = async (path) => (await fetch(`${SB}/rest/v1/${path}`, { method: 'DELETE', headers: h })).status
  const a = await del(`follows?follower_id=eq.${me}`)
  const b = await del(`notifications?kind=eq.follow&actor_id=eq.${me}`)
  console.log(`cleanup: follows ${a}, follow notifications ${b}`)
}

console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
process.exit(fails.length ? 1 : 0)
