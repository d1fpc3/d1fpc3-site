// The desk's "The rule" panel against the LIVE bot (2026-09-27): the pill says the risk model, the
// sizing table is the walk-forward risk table row for row (fractions match the database), the skips row
// names the open-hour skip and the paper shadows, and nothing throws. Screenshots desk + phone.
//   node tests/kalshi-desk-rule-panel.mjs
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const PW = ['C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright'].find((p) => existsSync(p))
const { chromium } = require(PW || 'playwright')
const ROOT = join(import.meta.dirname, '..'), OUT = join(tmpdir(), 'kalshi-rule-panel'); mkdirSync(OUT, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = join(ROOT, normalize(p).replace(/^([/\\])+/, '')); if (!f.startsWith(ROOT) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return } res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)) })
await new Promise((r) => server.listen(8131, '127.0.0.1', r))
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`, mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = (keys.find((k) => typeof k.api_key === 'string' && k.api_key.startsWith('sb_secret_')) ?? keys.find((k) => k.name === 'service_role')).api_key
const anon = (keys.find((k) => typeof k.api_key === 'string' && k.api_key.startsWith('sb_publishable_')) ?? keys.find((k) => k.name === 'anon')).api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
// the truth, straight from the database
const truth = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${mgmt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'select segment, fraction from kalshi_risk_table' }) })).json()
const sql = async (query) => (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${mgmt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })).json()
// kalshi_switch.seg_off (09-28): a segment named there never trades whatever its fraction, so its row reads "switched off"
const [so] = await sql('select seg_off from kalshi_switch where id = 1'), OFF = new Set(String(so?.seg_off ?? '').split(',').map((x) => x.trim()).filter(Boolean))
const want = Object.fromEntries(truth.map((r) => [r.segment, OFF.has(r.segment) ? 'switched off' : Number(r.fraction) > 0 ? (100 * Number(r.fraction)).toFixed(1) + '%' : 'not traded']))
const [hsw] = await sql('select hourly_rule, hourly_frac from kalshi_switch where id = 1'), [hp] = await sql("select count(*)::int n from kalshi_hourly_paper where won is not null and mode = 'paper'")
const SAY = { ':00 weekend': 'Sat/Sun, top of the hour', ':30/45 weekend': 'Sat/Sun, :30 and :45', ':15 weekend': 'Sat/Sun, :15', ':00 weekday': 'Mon-Fri, top of the hour', ':30/45 weekday': 'Mon-Fri, :30 and :45', ':15 weekday': 'Mon-Fri, :15' }
const browser = await chromium.launch(), findings = []
for (const [name, vp] of [['desk', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext({ ...vp, colorScheme: 'dark' }), page = await ctx.newPage(), errs = []
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v) } catch {} }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
  await page.goto('http://127.0.0.1:8131/echelon/admin/kalshi-desk/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('#sz-body tr[data-seg]'), null, { timeout: 30000 }).catch(() => findings.push(`${name}: the risk table never rendered`))
  const got = await page.evaluate(() => ({ pill: document.querySelector('#rl-mode')?.textContent, skips: document.querySelector('#rl-skips')?.textContent, hourly: document.querySelector('#rl-hourly')?.textContent, now: document.querySelector('#sz-now')?.textContent, desc: document.querySelector('#sz-desc')?.textContent,
    rows: [...document.querySelectorAll('#sz-body tr[data-seg]')].map((tr) => ({ seg: tr.dataset.seg, cells: [...tr.children].map((td) => td.textContent.trim()), subVisible: getComputedStyle(tr.querySelector('.sz-sub')).display !== 'none', col4Visible: getComputedStyle(tr.children[3]).display !== 'none', on: tr.classList.contains('on') })), overflow: document.documentElement.scrollWidth > innerWidth + 1, sw: document.documentElement.scrollWidth, iw: innerWidth, wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((e) => e.tagName + '.' + String(e.className).slice(0, 30) + '#' + e.id + ' ' + Math.round(e.getBoundingClientRect().right)) }))
  if (!/risk model/.test(got.pill ?? '')) findings.push(`${name}: pill says "${got.pill}"`)
  if (!/9:45, 10:15 and 10:30/.test(got.skips ?? '')) findings.push(`${name}: skips row "${got.skips}"`)
  // the hourly row: the switch's mode and size, and the paper count straight from the table
  await page.waitForFunction(() => (document.querySelector('#rl-hourly')?.textContent ?? '').endsWith('.'), null, { timeout: 30000 }).catch(() => findings.push(`${name}: the hourly row never rendered`))
  got.hourly = await page.evaluate(() => document.querySelector('#rl-hourly')?.textContent)
  if (hsw.hourly_rule === 'live' && !got.hourly?.includes(`live on weekends: 20 minutes before each top of the hour`)) findings.push(`${name}: hourly row "${got.hourly}" but the switch is live`)
  if (hsw.hourly_rule === 'live' && !got.hourly?.includes(`${(100 * Number(hsw.hourly_frac)).toFixed(0)}% of the account`)) findings.push(`${name}: hourly size is not ${hsw.hourly_frac}`)
  if (hp.n > 0 && !got.hourly?.includes(`${new Intl.NumberFormat('en-US').format(Math.min(hp.n, 5000))} legs graded`)) findings.push(`${name}: hourly paper count, database ${hp.n}: "${got.hourly}"`)
  // the sizing note states the table's own Kelly share and cap
  const [km] = await sql('select kelly_mult, cap from kalshi_risk_table limit 1'), note = await page.evaluate(() => document.querySelector('#sz-note')?.textContent ?? '')
  if (!note.includes(`capped at ${Math.round(100 * km.cap)}%`) || (Number(km.kelly_mult) === 0.75 && !note.includes('three-quarter Kelly'))) findings.push(`${name}: sizing note "${note.slice(0, 140)}" vs table ${km.kelly_mult} Kelly, cap ${km.cap}`)
  if (!note.includes("only one coin qualifies bets half")) findings.push(`${name}: the sizing note does not say a lone coin bets half`)
  console.log(`${name}: note "${note.slice(0, 120)}..."`)
  if (got.rows.length !== 6) findings.push(`${name}: ${got.rows.length} sizing rows`)
  for (const r of got.rows) { r.cells[0] = r.cells[0].replace(/[+-]\d.*$/, '').trim(); if (r.cells[1] !== want[r.seg]) findings.push(`${name}: ${r.seg} shows ${r.cells[1]}, database says ${want[r.seg]}`); if (r.cells[0] !== SAY[r.seg]) findings.push(`${name}: ${r.seg} label ${r.cells[0]}`) }
  if (got.rows.filter((r) => r.on).length !== 1) findings.push(`${name}: ${got.rows.filter((r) => r.on).length} rows highlighted as the next close`)
  for (const r of got.rows) if (OFF.has(r.seg) && r.cells[2] !== '–') findings.push(`${name}: ${r.seg} is switched off but shows a stake ${r.cells[2]}`)
  const nextSeg = got.rows.find((r) => r.on)?.seg
  if (nextSeg && OFF.has(nextSeg) && got.now !== 'switched off') findings.push(`${name}: the next close is in ${nextSeg}, switched off, but "right now" says "${got.now}"`)
  if (nextSeg && !OFF.has(nextSeg) && got.now === 'switched off') findings.push(`${name}: "right now" says switched off for ${nextSeg}`)
  if (got.overflow) findings.push(`${name}: page scrolls sideways (${got.sw} > ${got.iw}): ${got.wide.join(', ')}`)
  if (name === 'phone' && got.rows.some((r) => !r.subVisible || r.col4Visible)) findings.push('phone: the 90-day figure is not under the round')
  if (name === 'desk' && got.rows.some((r) => r.subVisible || !r.col4Visible)) findings.push('desk: the 90-day column is not a column')
  if (errs.length) findings.push(`${name}: console ${errs.slice(0, 3).join(' | ')}`)
  console.log(`${name}: hourly "${got.hourly}"`)
  console.log(`${name}: pill "${got.pill}" | now "${got.now}" ${got.desc} | skips "${got.skips?.slice(0, 90)}..."`)
  for (const r of got.rows) console.log(`   ${r.on ? '>' : ' '} ${r.cells.join(' | ')}`)
  await page.locator('#s-rule').screenshot({ path: join(OUT, `rule-${name}.png`) })
  await ctx.close()
}
await browser.close(); server.close()
console.log(findings.length ? `FINDINGS:\n  ${findings.join('\n  ')}` : 'CLEAN'); console.log(`screenshots: ${OUT}`)
process.exit(findings.length ? 1 : 0)
