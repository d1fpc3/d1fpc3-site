// What every view shows while it is still loading (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-skeletons-visual.mjs        (APP_URL / OUT / EMAIL / THEME / HOLD env)
//
// Holds every Supabase read and every worker fetch for HOLD ms, then walks each view and
// records what is on screen BEFORE the data lands, and again after. A view passes when the
// wait is furnished: a skeleton that mirrors the real surface, or at minimum real chrome and
// a stated empty state. It fails when the pane is blank, or when the skeleton is so much
// shorter than the loaded page that the layout jumps when data arrives.
//
// Per D1's standing rule a skeleton must mirror the surface it stands in for, so this also
// measures the height it reserves against the height the real content takes.
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

const OUT = process.env.OUT || `${tmpdir()}/app-skeletons`
mkdirSync(OUT, { recursive: true })
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const HOLD = Number(process.env.HOLD || 2600)
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

const findings = []
const rows = []
const browser = await chromium.launch()
const VIEWS = (process.env.VIEWS || 'overview,gex,news,feed,chat,course,journal,members,library,indicators,inbox,set-stats').split(',')
const VPS = (process.env.VIEWPORTS || 'phone,desk').split(',')
const VP = {
  phone: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
}

// what a member sees right now, in the pane only
const LOOK = () => {
  const pane = document.querySelector('.pane') || document.body
  const view = document.querySelector('.view.on') || pane
  const r = view.getBoundingClientRect()
  const skels = view.querySelectorAll('.skel, [class*="skel"], .shimmer, [aria-busy="true"]')
  // text a person can actually read in this view
  const words = (view.innerText || '').replace(/\s+/g, ' ').trim()
  // ink: how much of the view is not the page background, as a rough "is anything there"
  const painted = [...view.querySelectorAll('*')].filter((n) => {
    if (!n.offsetParent) return false
    const b = n.getBoundingClientRect()
    return b.width > 24 && b.height > 8 && b.top < innerHeight && b.bottom > 0
  }).length
  return { skels: skels.length, chars: words.length, head: words.slice(0, 64), painted, h: Math.round(r.height), spinner: !!view.querySelector('.spin, .spinner, [class*="spin"]') }
}

for (const vpName of VPS) {
  const ctx = await browser.newContext(VP[vpName])
  await ctx.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1'); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', t) }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme])

  // The hold is switched at runtime so boot can complete normally; only the per-view reads
  // that happen AFTER we arm it are delayed. Holding boot too just shows the splash.
  let holding = false
  await ctx.route(/supabase\.co\/(rest|functions|auth)\//, async (route) => {
    if (holding) await new Promise((r) => setTimeout(r, HOLD))
    await route.continue()
  })
  await ctx.route(/workers\.dev\//, async (route) => {
    if (holding) await new Promise((r) => setTimeout(r, HOLD))
    await route.continue()
  })

  const page = await ctx.newPage()
  page.on('pageerror', (e) => findings.push(`${vpName} pageerror: ${e.message}`))
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#td-h1', { timeout: 40000 })
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  await page.waitForTimeout(2500)

  console.log(`\n${vpName} · holding every read ${HOLD}ms`)
  for (const v of VIEWS) {
    // leave, arm the hold, come back cold
    await page.evaluate(() => document.querySelector('.tab[data-view="overview"]')?.click())
    await page.waitForTimeout(350)
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/cache|gex-days|news-week/.test(k)) localStorage.removeItem(k) })
    holding = true
    await page.evaluate((x) => document.querySelector(`.tab[data-view="${x}"]`)?.click(), v)
    await page.waitForTimeout(600)
    const loading = await page.evaluate(LOOK)
    await page.screenshot({ path: `${OUT}/${vpName}-${v}-loading.png` })
    holding = false
    await page.waitForTimeout(HOLD + 1600)
    const loaded = await page.evaluate(LOOK)
    await page.screenshot({ path: `${OUT}/${vpName}-${v}-loaded.png` })

    // A furnished wait is a skeleton, or real chrome with words in it. A blank pane is not.
    const furnished = loading.skels > 0 || loading.chars > 24
    const jump = loaded.h > 0 && loading.h > 0 ? Math.round(((loaded.h - loading.h) / Math.max(1, loaded.h)) * 100) : 0
    rows.push({ vpName, v, ...loading, loadedChars: loaded.chars, jump })
    const tag = `${vpName} ${v}`.padEnd(22)
    if (!furnished) findings.push(`${tag} shows nothing while it loads (${loading.painted} boxes, ${loading.chars} chars, ${loading.skels} skeletons)`)
    else if (loading.skels === 0 && loaded.chars > loading.chars * 3 && loaded.chars > 200) findings.push(`${tag} has chrome but no skeleton, and the body arrives late (${loading.chars} chars to ${loaded.chars})`)
    console.log(`  ${tag} loading: ${String(loading.skels).padStart(2)} skel, ${String(loading.chars).padStart(4)} chars, ${String(loading.painted).padStart(3)} boxes${loading.spinner ? ', spinner' : ''}  ->  loaded ${loaded.chars} chars, height ${jump >= 0 ? '+' : ''}${jump}%`)
  }
  await ctx.close()
}
await browser.close()
console.log('\nshots: ' + OUT)
if (findings.length) { console.log(`\n${findings.length} FINDINGS`); for (const f of findings) console.log(' - ' + f) } else console.log('\nevery view furnishes its own wait')
process.exit(findings.length ? 1 : 0)
