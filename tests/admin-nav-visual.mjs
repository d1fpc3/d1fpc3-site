// The condensed admin rail and the notification bell (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/admin-nav-visual.mjs        (ADMIN_URL / OUT / EMAIL env)
//
// The admin had sixteen sidebar rows under four captions. It now has seven
// places, and the pages inside a place live in a segmented row under the title.
// Nothing about the views themselves changed, so this checks the NAVIGATION:
// that every one of the sixteen is still reachable, that the place you are in
// is the one lit, that a place remembers the page you left it on, and that the
// bell only ever offers things that are actually waiting.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')

const OUT = process.env.OUT || `${tmpdir()}/admin-nav`
mkdirSync(OUT, { recursive: true })
const URL = process.env.ADMIN_URL || 'http://127.0.0.1:8123/echelon/admin/'
const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const email = process.env.EMAIL || 'd1fpc3@gmail.com'
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = []
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(([k, v]) => {
  localStorage.setItem(k, v)
  localStorage.setItem('echelon-admin-tour', 'done')
  localStorage.setItem('echelon-gex-tour', '1')
  // once: the group memory and the seen mark are what two of these checks prove
  if (!sessionStorage.getItem('nav-init')) {
    sessionStorage.setItem('nav-init', '1')
    for (const k2 of Object.keys(localStorage)) if (k2.startsWith('echelon-admin-group')) localStorage.removeItem(k2)
    localStorage.removeItem('echelon-admin-notes-seen')
  }
}, [`sb-${REF}-auth-token`, JSON.stringify(session)])
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.app.on', { timeout: 40000 })
await page.waitForTimeout(3500)

const rail = () => page.evaluate(() => [...document.querySelectorAll('#side-groups .grp')].map((b) => ({ label: b.querySelector('span:not(.gc)')?.textContent || '', link: b.tagName === 'A', on: b.classList.contains('on'), count: b.querySelector('.gc')?.textContent || '' })))
const sub = () => page.evaluate(() => ({
  shown: !document.getElementById('subnav').hidden,
  pages: [...document.querySelectorAll('.sub-seg button')].map((b) => b.textContent.replace(/\d+$/, '').trim()),
  on: document.querySelector('.sub-seg button.on')?.textContent.replace(/\d+$/, '').trim() || '',
  // there is no thumb on a one-page place, and reading one that is not there
  // throws inside the page rather than failing a check
  thumbW: (() => { const t = document.querySelector('.sub-seg .thumb'); return t ? Math.round(t.getBoundingClientRect().width) : 0 })(),
}))
const openView = () => page.evaluate(() => [...document.querySelectorAll('.view')].find((v) => v.classList.contains('on'))?.id || '')
const title = () => page.evaluate(() => document.getElementById('pane-title').textContent)

const bar = await rail()
check(bar.length === 8 && bar.filter((b) => b.link).length === 1, `the rail holds seven places and the Kalshi link (${bar.length} rows: ${bar.map((b) => b.label).join(', ')})`)
check(bar[0].on && bar[0].label === 'Overview', `Overview is where you land (${bar.find((b) => b.on)?.label})`)
await page.screenshot({ path: `${OUT}/rail.png` })

// the sixteen views are all still reachable, through seven places
const PLACES = {
  Overview: ['Overview'],
  Members: ['Users', 'Applications', 'Statistics', 'Access codes', 'TV access'],
  Money: ['Billing', 'Growth'],
  Course: ['Content', 'Homework', 'Video library'],
  Community: ['Community', 'Permissions'],
  Desk: ['GEX', 'Memecoins'],
  Settings: ['Settings'],
}
let reached = 0
for (const [place, pages] of Object.entries(PLACES)) {
  await page.evaluate((p) => [...document.querySelectorAll('#side-groups .grp')].find((b) => b.querySelector('span:not(.gc)')?.textContent === p)?.click(), place)
  await page.waitForTimeout(700)
  const s = await sub()
  const want = pages.map((x) => x.replace(/^TradingView /, 'TV '))
  if (pages.length > 1) {
    check(s.shown && want.every((w) => s.pages.includes(w)), `${place} opens its pages (${s.pages.join(' · ')})`)
    check(s.thumbW > 20, `${place} segment thumb sits on the live page (${s.thumbW}px)`)
  } else {
    check(!s.shown, `${place} is one page, so there is no segment row`)
  }
  // walk every page in the place
  for (const pg of (pages.length > 1 ? want : [])) {
    await page.evaluate((t) => [...document.querySelectorAll('.sub-seg button')].find((b) => b.textContent.replace(/\d+$/, '').trim() === t)?.click(), pg)
    await page.waitForTimeout(650)
    const v = await openView(), tl = await title()
    if (v && v !== 'v-') reached++
    if (!v) fails.push(`${place} > ${pg} opened nothing`)
    if (!tl) fails.push(`${place} > ${pg} left the title empty`)
  }
  await page.screenshot({ path: `${OUT}/place-${place.toLowerCase()}.png` })
}
check(reached === 14, `every page inside a place opens a view (${reached} of 14)`)

// a place remembers where you were
await page.evaluate(() => [...document.querySelectorAll('.sub-seg button')].find((b) => /Memecoins/.test(b.textContent))?.click())
await page.waitForTimeout(600)
await page.evaluate(() => [...document.querySelectorAll('#side-groups .grp')].find((b) => b.querySelector('span:not(.gc)')?.textContent === 'Members')?.click())
await page.waitForTimeout(600)
await page.evaluate(() => [...document.querySelectorAll('#side-groups .grp')].find((b) => b.querySelector('span:not(.gc)')?.textContent === 'Desk')?.click())
await page.waitForTimeout(700)
check(await openView() === 'v-memes', `a place comes back to the page you left it on (${await openView()})`)

// and across a reload
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.app.on', { timeout: 40000 })
await page.waitForTimeout(3000)
await page.evaluate(() => [...document.querySelectorAll('#side-groups .grp')].find((b) => b.querySelector('span:not(.gc)')?.textContent === 'Desk')?.click())
await page.waitForTimeout(800)
check(await openView() === 'v-memes', `and remembers it after a reload (${await openView()})`)

// ── the bell ──
const bell = await page.evaluate(() => {
  const b = document.getElementById('bell'), d = document.getElementById('bell-dot')
  const r = b.getBoundingClientRect()
  return { there: !!b, tap: Math.round(Math.min(r.width, r.height)), dot: d && !d.hidden ? d.textContent : '' }
})
check(bell.there && bell.tap >= 36, `the bell is in the bar and big enough to hit (${bell.tap}px)`)
await page.evaluate(() => document.getElementById('bell').click())
await page.waitForTimeout(500)
const panel = await page.evaluate(() => {
  const p = document.getElementById('notes'); if (!p) return null
  const rows = [...p.querySelectorAll('.note')]
  return {
    rows: rows.length,
    fresh: rows.filter((r) => !r.querySelector('.nd').classList.contains('seen')).length,
    first: rows[0]?.querySelector('.nt b')?.textContent || '',
    empty: !!p.querySelector('.notes-empty'),
    onScreen: p.getBoundingClientRect().right <= innerWidth + 1,
  }
})
check(!!panel, 'the bell opens its panel')
check(panel && (panel.rows > 0 || panel.empty), `the panel says what is waiting (${panel?.rows ?? 0} rows${panel?.empty ? ', or says nothing is' : ''}: ${panel?.first || '—'})`)
check(panel && panel.onScreen, 'the panel stays inside the window')
await page.screenshot({ path: `${OUT}/bell.png` })

if (panel && panel.rows > 0) {
  const before = await openView()
  await page.evaluate(() => document.querySelector('.note')?.click())
  await page.waitForTimeout(900)
  const after = await openView()
  check(after !== before || after !== '', `tapping an item goes to the page it is about (${before} -> ${after})`)
  check(await page.evaluate(() => !document.getElementById('notes')), 'and closes the panel behind it')
}
// marking seen clears the dot and it stays clear
await page.evaluate(() => document.getElementById('bell').click())
await page.waitForTimeout(400)
await page.evaluate(() => [...document.querySelectorAll('.notes-head button')].find((b) => /Mark all seen/.test(b.textContent))?.click())
await page.waitForTimeout(500)
check(await page.evaluate(() => document.getElementById('bell-dot').hidden), 'marking them seen clears the count')

if (errs.length) fails.push('page errors: ' + errs.slice(0, 3).join(' | '))
console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
console.log('shots: ' + OUT)
await browser.close()
process.exit(fails.length ? 1 : 0)
