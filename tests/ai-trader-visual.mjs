// AI trader (echelon/admin/ai-trader/), driven like D1 would (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/ai-trader-visual.mjs      (AI_URL / OUT / ONLY=wide|desk|phone / THEMES=dark,light env)
//
// Signs in as the owner and on 2560, 1440 and an iPhone (WebKit), dark and light, checks: no page errors, no sideways
// scroll, the running version (LD12) opens first with its live count, the curve and its LD11 line, the lessons switch by
// LIT piece and by wins / losses, the playbook streams and versions, the trades filter and a trade opens into its candle
// chart with its read and lessons, the month chart, picking LD11 and LD1 from the ladder, the Edge lab links here. Then
// the security probe: anonymously the page is a sign-in card and the API returns zero rows from all four tables.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/ai-trader`; mkdirSync(OUT, { recursive: true })
const URL = process.env.AI_URL || 'http://127.0.0.1:8123/echelon/admin/ai-trader/'
const LAB = URL.replace(/ai-trader\/?$/, 'edge-lab/')
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: process.env.EMAIL || 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
const svc = async (q) => (await (await fetch(`${SB}/rest/v1/${q}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })).json())
const runs = await svc('ai_runs?select=id,status,stats')
const ld11Trades = (await svc('ai_trades?select=id&run=eq.LD11')).length

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
  await page.waitForFunction(() => document.querySelectorAll('#trades tr.t').length > 0, null, { timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${vp}-${theme}-top.png` })
  const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)
  ok(over <= 1, `no sideways scroll (${over}px)`)
  const running = runs.find((r) => r.status === 'running')
  if (running) {
    ok((await page.textContent('#h-name')).includes(running.id), `opens on the running version ${running.id}`)
    ok((await page.textContent('#tally')).includes('of 751'), 'live session count shows "of 751"')
    ok((await page.textContent('#legend')).includes('LD11'), 'curve carries the LD11 line')
  }
  ok((await page.locator('#ladder .card').count()) === runs.length, `ladder shows all ${runs.length} versions`)
  ok((await page.locator('#cv path.ln').count()) === 1, 'cumulative curve drawn')
  // lessons
  if (await page.locator('#learn-sec').isVisible()) {
    await page.locator('#learn-sec').scrollIntoViewIfNeeded()
    const a = await page.textContent('#lessons')
    await page.locator('#piece-seg button', { hasText: 'Inducement' }).click(); await page.waitForTimeout(300)
    ok((await page.textContent('#lessons')) !== a, 'piece switch changes the lessons')
    await page.locator('#wl-seg button', { hasText: 'Wins' }).click(); await page.waitForTimeout(300)
    const tags = await page.locator('#lessons .tag').allTextContents()
    ok(tags.length > 0 && tags.every((t) => t.startsWith('Win')), `Wins shows only wins (${tags.length})`)
    await page.locator('#wl-seg button', { hasText: 'Losses' }).click(); await page.waitForTimeout(300)
    const lt = await page.locator('#lessons .tag').allTextContents()
    ok(lt.length > 0 && lt.every((t) => t.startsWith('Loss')), `Losses shows only losses (${lt.length})`)
    await page.screenshot({ path: `${OUT}/${vp}-${theme}-lessons.png` })
  } else ok(!running, 'lessons section present for the running version')
  // playbooks
  if (await page.locator('#pb-sec').isVisible()) {
    await page.locator('#pb-sec').scrollIntoViewIfNeeded()
    const rows = await page.locator('#streams tr.s').count()
    ok(rows === 9, `nine streams listed (${rows})`)
    const best = await page.evaluate(() => [...document.querySelectorAll('#streams tr.s')].map((r) => +r.cells[3].textContent.slice(1)).reduce((m, v, i, a) => (v > a[m] ? i : m), 0))
    await page.locator('#streams tr.s').nth(best).click(); await page.waitForTimeout(300)
    const vers = await page.locator('#ver-seg button').count()
    ok(vers >= 1, `stream versions listed (${vers})`)
    ok((await page.locator('#pb-body h4').count()) >= 3, 'playbook text renders its headings')
    if (vers > 1) { await page.locator('#ver-seg button').first().click(); await page.waitForTimeout(250); ok((await page.textContent('#pb-t')).includes('started'), 'Start shows the starting playbook') }
    await page.screenshot({ path: `${OUT}/${vp}-${theme}-playbook.png` })
  }
  // trades
  await page.locator('#trades').scrollIntoViewIfNeeded()
  await page.locator('#res-seg button', { hasText: 'Winners' }).click(); await page.waitForTimeout(300)
  const wp = await page.locator('#trades tr.t td:nth-child(7)').allTextContents()
  ok(wp.length > 0 && wp.every((t) => t.trim().startsWith('+')), `Winners filter (${wp.length} rows, all positive)`)
  await page.locator('#res-seg button').first().click(); await page.waitForTimeout(250)
  await page.locator('#trades tr.t').first().click()
  await page.waitForFunction(() => document.querySelectorAll('.cc rect.up, .cc rect.dn').length > 20, null, { timeout: 15000 })
  ok(await page.locator('#trades .drawer.open').count() === 1, 'trade opens its drawer')
  ok((await page.locator('.cc .sl').count()) === 1 && (await page.locator('.cc .en').count()) === 1, 'chart draws entry and stop')
  if (running) ok((await page.textContent('#trades .drawer.open')).includes('What it learned'), 'drawer shows what it learned')
  await page.waitForTimeout(500)
  await page.locator('#trades .drawer.open').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${OUT}/${vp}-${theme}-trade.png` })
  ok((await page.locator('#months rect.ba').count()) >= 1, 'month chart drawn')
  // LD11 from the ladder
  await page.locator('#ladder .card[data-id="LD11"]').click()
  await page.waitForFunction(() => document.getElementById('h-name').textContent.includes('LD11') && document.querySelectorAll('#trades tr.t').length > 0, null, { timeout: 20000 })
  await page.waitForTimeout(900)
  ok((await page.textContent('#tally')).includes('19%'), 'LD11 shows its 19% coin-flip result')
  ok((await page.textContent('#tr-say')).includes(ld11Trades.toLocaleString('en-US')), `LD11 counts all ${ld11Trades} trades`)
  await page.screenshot({ path: `${OUT}/${vp}-${theme}-ld11.png` })
  await page.click('#more'); await page.waitForTimeout(300)
  ok((await page.locator('#trades tr.t').count()) === 100, 'Show more adds 60 rows')
  // a setups version
  await page.locator('#ladder .card[data-id="LD1"]').click(); await page.waitForTimeout(1200)
  ok((await page.locator('#cv .samp div, .samp div').count()) >= 1 && (await page.textContent('#trades')).includes('single setups'), 'LD1 shows its samples, no session trades')
  ok(errs.length === 0, `no page errors (${errs.join(' | ').slice(0, 200)})`)
  await browser.close()
}

// the Edge lab links here
{
  const browser = await PW.chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(([k, v]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, v) }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
  const page = await ctx.newPage()
  await page.goto(LAB, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app:not([hidden])', { timeout: 45000 })
  await page.click('.top a.xl'); await page.waitForURL(/ai-trader/, { timeout: 15000 })
  ok(true, 'Edge lab "AI trader" link opens this page')
  await browser.close()
}

// security: anonymous
{
  for (const t of ['ai_runs', 'ai_sessions', 'ai_trades', 'ai_playbooks']) {
    const r = await fetch(`${SB}/rest/v1/${t}?select=*&limit=5`, { headers: { apikey: anon } })
    const j = await r.json().catch(() => null)
    ok(!Array.isArray(j) || j.length === 0, `anon reads 0 rows from ${t} (${r.status})`)
  }
  const browser = await PW.chromium.launch({ channel: 'chrome' })
  const page = await (await browser.newContext()).newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#gate:not([hidden])', { timeout: 20000 })
  ok(await page.locator('#app').isHidden(), 'signed out: sign-in card, no data')
  await browser.close()
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed'); process.exit(fails.length ? 1 : 0)
