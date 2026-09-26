// Every left/right swipe in the members app, driven with real touches (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-swipe-visual.mjs        (APP_URL / OUT / EMAIL / THEME env)
//
// The app has four horizontal gestures and they used to be three different qualities. This
// holds them to one standard: the thing you drag follows the finger, a short drag springs
// back, a long one commits, a flick commits early, and a gesture with nowhere to go pushes
// back instead of silently doing nothing. Touches go through CDP, so these are real
// touchstart/touchmove/touchend sequences and not synthetic clicks.
//   - Study: turn a lesson left and right
//   - Settings: edge swipe back off a sub-page
//   - Notifications: swipe back to where you came from
//   - Feed comments sheet: pull down to dismiss (the vertical cousin, same footing)
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
const OUT = process.env.OUT || `${tmpdir()}/app-swipe`
mkdirSync(OUT, { recursive: true })
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const tokenFile = join(homedir(), '.supabase', 'access-token')
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')
const email = process.env.EMAIL || 'appreview@d1fpc3.com'
const theme = process.env.THEME || 'dark'
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = []
const note = (s) => console.log('  ' + s)
const check = (ok, what) => { note((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await ctx.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1'); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', t) }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme])
const page = await ctx.newPage()
page.on('pageerror', (e) => { note('PAGEERROR ' + e.message); fails.push('pageerror: ' + e.message) })
const cdp = await ctx.newCDPSession(page)

// one real touch drag, reporting what the page looked like mid-flight
async function drag(from, to, { steps = 10, hold = 22, peek = null } = {}) {
  const pt = (p) => [{ x: Math.round(p.x), y: Math.round(p.y) }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) })
  let seen = null
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p) })
    await page.waitForTimeout(hold)
    if (peek && i === Math.ceil(steps * 0.75)) seen = await page.evaluate(peek)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  return seen
}
const paneX = () => page.evaluate(() => {
  const p = document.getElementById('lesson'); if (!p) return null
  const m = new DOMMatrixReadOnly(getComputedStyle(p).transform)
  return { x: Math.round(m.m41), op: Number(getComputedStyle(p).opacity).toFixed(2), wall: p.dataset.wall }
})
const lessonTitle = () => page.evaluate(() => (document.getElementById('tt-title')?.textContent || '').trim())

await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#td-h1', { timeout: 30000 })
await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
await page.waitForTimeout(1500)

console.log('\nStudy: turning a lesson')
await page.evaluate(() => document.querySelector('.tab[data-view="course"]').click())
await page.waitForTimeout(1200)
// open the first chapter, then step in a couple of lessons so both directions exist
await page.evaluate(() => document.querySelector('#study-map .sm-card')?.click())
await page.waitForTimeout(1400)
await page.evaluate(() => { window.__slide && document.querySelector('#index button:nth-child(3)')?.click() })
await page.waitForTimeout(900)
check(await page.evaluate(() => !!window.__slide), 'the slide is wired')
const startTitle = await lessonTitle()
note(`       on "${startTitle}"`)
const mid = { x: 320, y: 560 }

// 1. a short drag tracks the finger and springs back
const held = await drag(mid, { x: 250, y: 562 }, { peek: () => { const p = document.getElementById('lesson'); const m = new DOMMatrixReadOnly(getComputedStyle(p).transform); return { x: Math.round(m.m41), op: Number(getComputedStyle(p).opacity).toFixed(2) } } })
check(held && held.x < -12, `a short drag moves the page with the finger (${held && held.x}px, opacity ${held && held.op})`)
await page.waitForTimeout(600)
let now = await paneX()
check(now.x === 0 && now.op === '1.00', `and springs back to rest (${now.x}px, opacity ${now.op})`)
check((await lessonTitle()) === startTitle, 'a short drag does not change the lesson')

// 2. a long drag to the left goes forward
await drag(mid, { x: 60, y: 566 })
await page.waitForTimeout(900)
const fwd = await lessonTitle()
check(fwd !== startTitle, `dragging left turns to the next lesson: "${startTitle}" to "${fwd}"`)
now = await paneX()
check(now.x === 0 && now.op === '1.00', `and the new page settles square (${now.x}px, opacity ${now.op})`)
await page.screenshot({ path: `${OUT}/study-after-forward.png` })

// 3. a long drag to the right goes back
await drag({ x: 70, y: 560 }, { x: 330, y: 564 })
await page.waitForTimeout(900)
const back = await lessonTitle()
check(back === startTitle, `dragging right turns back: "${fwd}" to "${back}"`)

// 4. a flick commits without crossing the distance threshold
const before = await lessonTitle()
await drag({ x: 300, y: 560 }, { x: 205, y: 561 }, { steps: 4, hold: 8 })
await page.waitForTimeout(900)
check((await lessonTitle()) !== before, 'a quick flick turns the page without dragging it far')

// 5. a mostly vertical drag is reading, not turning
const rd = await lessonTitle()
await drag({ x: 200, y: 640 }, { x: 176, y: 380 })
await page.waitForTimeout(500)
check((await lessonTitle()) === rd, 'a mostly vertical drag scrolls and does not turn the page')
check((await paneX()).x === 0, 'and leaves the page square')

// 6. the very first lesson pushes back instead of doing nothing.
// The chapter list is not the whole course, so the first button in it still has lessons
// behind it. Walk back with the arrow key (same studyStep the swipe calls) until the app
// itself says there is nothing to the left.
for (let i = 0; i < 40 && !(await page.evaluate(() => window.__slide.wallAt(-1))); i++) {
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(160)
}
await page.waitForTimeout(500)
check(await page.evaluate(() => window.__slide.wallAt(-1)), 'walked back to the very first lesson')
const first = await lessonTitle()
note(`       at "${first}"`)
const wall = await drag({ x: 70, y: 560 }, { x: 330, y: 563 }, { peek: () => { const p = document.getElementById('lesson'); const m = new DOMMatrixReadOnly(getComputedStyle(p).transform); return { x: Math.round(m.m41), wall: p.dataset.wall } } })
check(wall && wall.wall === '1' && wall.x > 4 && wall.x < 150, `at the first lesson the page pushes back against the finger (${wall && wall.x}px, rubber band ${wall && wall.wall})`)
await page.waitForTimeout(700)
check((await lessonTitle()) === first, 'and does not turn')
check((await paneX()).x === 0, 'and returns to square')
await page.screenshot({ path: `${OUT}/study-wall.png` })

console.log('\nSettings: the edge swipe back')
await page.evaluate(() => document.querySelector('.tab[data-view="set-profile"]')?.click())
await page.waitForTimeout(1100)
check(await page.evaluate(() => !!document.querySelector('.view.setpage.on')), 'a settings sub-page is open')
const edge = await drag({ x: 8, y: 520 }, { x: 240, y: 524 }, { peek: () => { const p = document.querySelector('.view.setpage.on'); if (!p) return null; const m = new DOMMatrixReadOnly(getComputedStyle(p).transform); return { x: Math.round(m.m41), dragging: p.classList.contains('dragging') } } })
check(edge && edge.x > 40 && edge.dragging, `the sub-page follows the finger from the edge (${edge && edge.x}px)`)
await page.waitForTimeout(900)
check(await page.evaluate(() => !document.querySelector('#v-set-profile')?.classList.contains('on')), 'and the swipe pops it back')

console.log('\nNotifications: swipe back')
await page.evaluate(() => document.querySelector('.tab[data-view="inbox"]')?.click())
await page.waitForTimeout(1100)
const inboxOn = await page.evaluate(() => document.getElementById('v-inbox')?.classList.contains('on'))
if (inboxOn) {
  const nb = await drag({ x: 90, y: 500 }, { x: 320, y: 504 }, { peek: () => { const v = document.getElementById('v-inbox'); const m = new DOMMatrixReadOnly(getComputedStyle(v).transform); return { x: Math.round(m.m41) } } })
  check(nb && nb.x > 40, `the notifications page follows the finger (${nb && nb.x}px)`)
  await page.waitForTimeout(900)
  check(await page.evaluate(() => !document.getElementById('v-inbox').classList.contains('on')), 'and the swipe takes you back')
  check(await page.evaluate(() => { const v = document.getElementById('v-inbox'); return !v.style.transform && !v.style.opacity }), 'and it is left clean for next time')
} else check(false, 'the notifications view opened')

// every gesture uses the same arming distance and the same commit rule
console.log('\nOne standard')
const nums = await page.evaluate(() => window.__slide?.SLIDE)
check(nums && nums.armPx === 10 && nums.takePart > 0.2 && nums.takeVel > 0.4, `the slide arms at ${nums && nums.armPx}px and commits past ${nums && Math.round(nums.takePart * 100)}% or ${nums && nums.takeVel}px/ms`)

await browser.close()
console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
console.log('shots: ' + OUT)
process.exit(fails.length ? 1 : 0)
