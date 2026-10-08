// Edge lab (echelon/admin/edge-lab/), driven like D1 would (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/edge-lab-visual.mjs      (LAB_URL / OUT / ONLY=wide|desk|phone / THEMES=dark,light env)
//
// Signs in as the owner and on 2560, 1440 and an iPhone (WebKit), dark and light, checks: no page errors,
// no sideways scroll, the hero counts every test, the running-now cards fill, the ledger filters (verdict,
// family, search) and expands a row into its samples table, Show all lists every row, the curve switches,
// the signal log has rows, the admin rail links here. Then the security probe: anonymously the page is a
// sign-in card and the API returns zero rows from all three tables. Screens in OUT.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/edge-lab`; mkdirSync(OUT, { recursive: true })
const URL = process.env.LAB_URL || 'http://127.0.0.1:8123/echelon/admin/edge-lab/'
const ADMIN = URL.replace(/edge-lab\/?$/, '')
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: process.env.EMAIL || 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
const total = (await (await fetch(`${SB}/rest/v1/edge_lab_tests?select=id`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })).json()).length
const gammaRows = (await (await fetch(`${SB}/rest/v1/edge_lab_tests?select=id&family=eq.Dealer%20gamma`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })).json()).length

const fails = [], ok = (c, w) => { console.log((c ? '  ok   ' : '  FAIL ') + w); if (!c) fails.push(w) }
const THEMES = (process.env.THEMES || 'dark,light').split(',')
const VPS = [['wide', PW.chromium, { viewport: { width: 2560, height: 1440 } }], ['desk', PW.chromium, { viewport: { width: 1440, height: 900 } }], ['phone', PW.webkit, { ...PW.devices['iPhone 15 Pro'] }]]
  .filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n))

for (const [vp, launcher, opts] of VPS) for (const theme of THEMES) {
  console.log(`\n${vp}, ${theme}`)
  const browser = await launcher.launch(launcher === PW.chromium ? { channel: 'chrome' } : {})
  const ctx = await browser.newContext({ ...opts, colorScheme: theme })
  await ctx.addInitScript(([k, v, theme]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, v); localStorage.setItem('echelon-theme', theme) }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme])
  const page = await ctx.newPage(), errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app:not([hidden])', { timeout: 45000 })
  await page.waitForFunction(() => document.querySelectorAll('#ledger tr.t').length > 0, null, { timeout: 30000 })
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${OUT}/${vp}-${theme}-top.png` })
  const big = await page.textContent('#hero-big')
  ok(big.includes(`of ${total} tested`), `hero counts all ${total} tests ("${big.trim()}")`)
  ok((await page.locator('#cards .card').count()) >= 5, 'running-now cards filled')
  const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)
  ok(over <= 1, `no sideways scroll (${over}px)`)
  // curve switch
  const lbl0 = await page.textContent('#cv-lbl')
  await page.locator('#cv-seg button').nth(1).click(); await page.waitForTimeout(400)
  ok((await page.textContent('#cv-lbl')) !== lbl0, 'curve segment switches the curve')
  // ledger: show all, filters, search, expand
  if (await page.locator('#more').isVisible()) await page.click('#more')
  ok((await page.locator('#ledger tr.t').count()) === total, 'Show all lists every test')
  await page.locator('#st-seg button', { hasText: 'Failed' }).click(); await page.waitForTimeout(300)
  const pills = await page.locator('#ledger tr.t .pill').allTextContents()
  ok(pills.length > 20 && pills.every((p) => p.includes('Failed')), `Failed filter shows only failures (${pills.length})`)
  await page.locator('#st-seg button').first().click()
  await page.locator('#fam-seg button', { hasText: 'Dealer gamma' }).click(); await page.waitForTimeout(300)
  const fams = await page.locator('#ledger tr.t').count()
  ok(fams === gammaRows, `family filter (Dealer gamma ${fams} of ${gammaRows})`)
  await page.locator('#fam-seg button').first().click()
  await page.fill('#q', 'resweep'); await page.waitForTimeout(300)
  ok((await page.locator('#ledger tr.t').count()) >= 2, 'search finds the resweep tests')
  await page.fill('#q', ''); await page.waitForTimeout(200)
  // tap the C4 card: it opens its row
  await page.locator('#cards .card[data-id="C4"]').click(); await page.waitForTimeout(900)
  ok(await page.locator('tr.t[data-id="C4"][aria-expanded="true"]').count() === 1, 'C4 card opens its ledger row')
  const sampleRows = await page.locator('tr.t[data-id="C4"] + tr .samples tbody tr').count()
  ok(sampleRows >= 5, `C4 drawer shows its samples (${sampleRows})`)
  await page.screenshot({ path: `${OUT}/${vp}-${theme}-c4.png` })
  ok((await page.locator('#signals tr').count()) >= 1 && !(await page.textContent('#signals')).includes('No signals yet'), 'signal log has rows')
  await page.locator('#signals').scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${vp}-${theme}-signals.png` })
  // with every row shown the phone page passes Chromium/WebKit's 32767 px screenshot limit; keep the run going
  await page.screenshot({ path: `${OUT}/${vp}-${theme}-full.png`, fullPage: true }).catch(() => console.log('  (full-page shot skipped: page taller than 32767 px)'))
  ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`)
  await browser.close()
}

// the Echelon app links here for the owner (the admin rail dropped its trading links on 2026-10-07 with the Desk)
{
  const browser = await PW.chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v) }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
  const page = await ctx.newPage()
  await page.goto(ADMIN.replace(/admin\/?$/, 'app/'), { waitUntil: 'domcontentloaded' })
  const shown = await page.waitForSelector('#edge-link:not([hidden])', { state: 'attached', timeout: 60000 }).then(() => true).catch(() => false)
  ok(shown && (await page.locator('#edge-link').getAttribute('href')) === '/echelon/admin/edge-lab/', 'Echelon app shows the owner an Edge lab link')
  await browser.close()
}

// security: anonymous visitor
{
  const browser = await PW.chromium.launch({ channel: 'chrome' })
  const page = await (await browser.newContext()).newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#gate:not([hidden])', { timeout: 30000 })
  ok(await page.locator('#app').isHidden(), 'anonymous visitor gets the sign-in card')
  await browser.close()
  for (const t of ['edge_lab_tests', 'edge_lab_signals', 'edge_lab_series']) {
    const r = await fetch(`${SB}/rest/v1/${t}?select=*`, { headers: { apikey: 'sb_publishable_bUU5exrU1uS4FKw_Dxnp-w_-dNjAo8x' } })
    const body = await r.text()
    ok(r.status === 401 || body === '[]' || /permission denied/.test(body), `anon API reads nothing from ${t} (${r.status} ${body.slice(0, 40)})`)
  }
}

console.log(`\n${fails.length ? fails.length + ' FAILED' : 'all passed'}; screens in ${OUT}`)
process.exit(fails.length ? 1 : 0)
