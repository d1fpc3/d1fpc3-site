// What every admin tab shows while it is still loading (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/admin-skeletons-visual.mjs        (ADMIN_URL / OUT / HOLD / VIEWS env)
//
// Same idea as tests/app-skeletons-visual.mjs, pointed at /echelon/admin/. Holds every read
// for HOLD ms, walks each tab, and records what is on screen before the data lands and
// again after. A tab passes when the wait is furnished: a skeleton that mirrors the surface,
// or at minimum real chrome with words in it. It fails when the pane is blank.
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
const OUT = process.env.OUT || `${tmpdir()}/admin-skeletons`
mkdirSync(OUT, { recursive: true })
const ADMIN_URL = process.env.ADMIN_URL || 'http://127.0.0.1:8123/echelon/admin/'
const HOLD = Number(process.env.HOLD || 2600)
const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const tokenFile = join(homedir(), '.supabase', 'access-token')
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')
const email = process.env.EMAIL || 'd1fpc3@gmail.com'   // the admin
const theme = process.env.THEME || 'dark'
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed: ' + JSON.stringify(session).slice(0, 160))

const findings = []
const browser = await chromium.launch()
const VIEWS = (process.env.VIEWS || 'overview,stats,growth,users,access,applications,billing,content,homework,library,codes,community,perms,gex').split(',')
const VPS = (process.env.VIEWPORTS || 'desk,phone').split(',')
const VP = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
const LOOK = () => {
  const view = document.querySelector('.view.on') || document.body
  const words = (view.innerText || '').replace(/\s+/g, ' ').trim()
  return {
    skels: view.querySelectorAll('.skel, [class*="skel"], [aria-busy="true"]').length,
    chars: words.length,
    painted: [...view.querySelectorAll('*')].filter((n) => { if (!n.offsetParent) return false; const b = n.getBoundingClientRect(); return b.width > 24 && b.height > 8 && b.top < innerHeight && b.bottom > 0 }).length,
    h: Math.round((view.getBoundingClientRect ? view.getBoundingClientRect().height : 0)),
  }
}

for (const vpName of VPS) {
  const ctx = await browser.newContext(VP[vpName])
  await ctx.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem('echelon-theme', t) }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme])
  let holding = false
  await ctx.route(/supabase\.co\/(rest|functions|auth)\//, async (r) => { if (holding) await new Promise((f) => setTimeout(f, HOLD)); await r.continue() })
  await ctx.route(/workers\.dev\//, async (r) => { if (holding) await new Promise((f) => setTimeout(f, HOLD)); await r.continue() })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => findings.push(`${vpName} pageerror: ${e.message}`))
  await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.view.on, #v-overview', { timeout: 40000 }).catch(() => {})
  await page.waitForTimeout(4000)

  console.log(`\n${vpName} · holding every read ${HOLD}ms`)
  for (const v of VIEWS) {
    const there = await page.evaluate((x) => !!document.querySelector(`[data-view="${x}"]`), v)
    if (!there) { console.log(`  ${v.padEnd(14)} (no tab here)`); continue }
    await page.evaluate(() => document.querySelector('[data-view="overview"]')?.click())
    await page.waitForTimeout(300)
    holding = true
    await page.evaluate((x) => document.querySelector(`[data-view="${x}"]`)?.click(), v)
    await page.waitForTimeout(650)
    const loading = await page.evaluate(LOOK)
    await page.screenshot({ path: `${OUT}/${vpName}-${v}-loading.png` })
    holding = false
    await page.waitForTimeout(HOLD + 1800)
    const loaded = await page.evaluate(LOOK)
    await page.screenshot({ path: `${OUT}/${vpName}-${v}-loaded.png` })
    const furnished = loading.skels > 0 || loading.chars > 24
    const tag = `${vpName} ${v}`.padEnd(20)
    if (!furnished) findings.push(`${tag} shows nothing while it loads (${loading.painted} boxes, ${loading.chars} chars)`)
    else if (loading.skels === 0 && loaded.chars > loading.chars * 3 && loaded.chars > 250) findings.push(`${tag} has chrome but no skeleton, and the body arrives late (${loading.chars} chars to ${loaded.chars})`)
    console.log(`  ${tag} loading: ${String(loading.skels).padStart(2)} skel, ${String(loading.chars).padStart(4)} chars, ${String(loading.painted).padStart(3)} boxes  ->  loaded ${loaded.chars} chars`)
  }
  await ctx.close()
}
await browser.close()
console.log('\nshots: ' + OUT)
if (findings.length) { console.log(`\n${findings.length} FINDINGS`); for (const f of findings) console.log(' - ' + f) } else console.log('\nevery admin tab furnishes its own wait')
process.exit(findings.length ? 1 : 0)
