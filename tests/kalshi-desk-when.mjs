// The desk's "When it trades" panel against the LIVE switch (2026-10-01): the hero card is the next real-money
// timed order (computed here on its own, from the bot's windows), the rule's rows are the risk table's trading
// segments with their sizes, the filters split live / metals / paper, the countdowns tick, the day-line labels
// never overlap, nothing scrolls sideways, nothing throws. Screenshots at 2560, 1440 and a phone.
//   node tests/kalshi-desk-when.mjs
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const PW = ['C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright'].find((p) => existsSync(p))
const { chromium } = require(PW || 'playwright')
const ROOT = join(import.meta.dirname, '..'), OUT = join(tmpdir(), 'kalshi-when'); mkdirSync(OUT, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = join(ROOT, normalize(p).replace(/^([/\\])+/, '')); if (!f.startsWith(ROOT) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return } res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)) })
await new Promise((r) => server.listen(8132, '127.0.0.1', r))
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`, mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = (keys.find((k) => typeof k.api_key === 'string' && k.api_key.startsWith('sb_secret_')) ?? keys.find((k) => k.name === 'service_role')).api_key
const anon = (keys.find((k) => typeof k.api_key === 'string' && k.api_key.startsWith('sb_publishable_')) ?? keys.find((k) => k.name === 'anon')).api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
const sql = async (query) => (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${mgmt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })).json()
const [sw] = await sql('select fav_rule, seg_off, open_dog, open_dog_bell, metal_drift, hourly_rule from kalshi_switch where id = 1')
const rt = await sql('select segment, fraction from kalshi_risk_table')
const OFF = new Set(String(sw.seg_off ?? '').split(',').map((x) => x.trim()).filter(Boolean))
const tradingSegs = rt.filter((r) => !OFF.has(r.segment) && Number(r.fraction) > 0)

// the next real-money timed order, worked out here without the page's code: walk forward minute by minute
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short', year: 'numeric', month: '2-digit', day: '2-digit' })
const HOL = new Set(['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26'])
const timed = [
  sw.metal_drift === 'live' && { hm: '5:15', d: 'wd' }, sw.metal_drift === 'live' && { hm: '16:0', d: 'wd' }, sw.metal_drift === 'live' && { hm: '17:0', d: 'wd' },
  sw.open_dog_bell === 'live' && { hm: '9:24', d: 'nyse' }, sw.open_dog === 'live' && { hm: '9:35', d: 'nyse' }, sw.open_dog === 'live' && { hm: '12:5', d: 'we', edt: true },
].filter(Boolean)
let expectHero = null
for (let t = Math.floor(Date.now() / 60e3) * 60e3; t < Date.now() + 8 * 864e5 && !expectHero; t += 60e3) {
  const p = Object.fromEntries(NY.formatToParts(new Date(t)).map((x) => [x.type, x.value])), we = p.weekday === 'Sat' || p.weekday === 'Sun'
  const hm = `${Number(p.hour) % 24}:${Number(p.minute)}`, key = `${p.year}-${p.month}-${p.day}`
  if (t + 20e3 + 60e3 <= Date.now()) continue
  for (const r of timed) if (r.hm === hm && (r.d === 'wd' ? !we : r.d === 'we' ? we : !we && !HOL.has(key)) && (!r.edt || p.timeZoneName === 'EDT')) { expectHero = new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }); break }
}

const browser = await chromium.launch(), findings = []
for (const [name, vp] of [['wide', { viewport: { width: 2560, height: 1300 } }], ['desk', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext({ ...vp, colorScheme: 'dark' }), page = await ctx.newPage(), errs = []
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); localStorage.removeItem('kd-when-filter') } catch {} }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
  await page.goto('http://127.0.0.1:8132/echelon/admin/kalshi-desk/', { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => document.querySelector('#wh-body tr:not(.wh-grp)'), null, { timeout: 60000 }).catch(() => findings.push(`${name}: the schedule never rendered`))
  await page.waitForTimeout(6000)   // the other panels load in long tasks; let them settle before clicking
  const read = () => page.evaluate(() => ({
    cards: [...document.querySelectorAll('#wh-next .wh-card')].map((c) => ({ k: c.querySelector('.wh-k')?.textContent, t: c.querySelector('.wh-t')?.textContent, d: c.querySelector('.wh-d')?.textContent, c: c.querySelector('.wh-c')?.textContent })),
    rows: [...document.querySelectorAll('#wh-body tr:not(.wh-grp)')].map((tr) => ({ cls: tr.className, cells: [...tr.children].map((td) => td.textContent.trim()) })),
    groups: [...document.querySelectorAll('#wh-body tr.wh-grp')].map((tr) => tr.textContent.trim()),
    marks: document.querySelectorAll('#wh-day .wh-mark').length, ticks: document.querySelectorAll('#wh-day .wh-tick').length,
    labels: [...document.querySelectorAll('#wh-day .wh-label')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => { const b = e.getBoundingClientRect(); return { t: e.textContent, l: b.left, r: b.right, top: b.top } }),
    day: document.querySelector('#wh-day').getBoundingClientRect(),
    note: document.querySelector('#wh-note')?.textContent, sub: document.querySelector('#wh-sub')?.textContent,
    overflow: document.documentElement.scrollWidth > innerWidth + 1, wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map((e) => e.tagName + '.' + String(e.className).slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().right)),
  }))
  const live = await read()
  // the hero is the next real-money timed order
  if (expectHero && live.cards[0]?.t !== expectHero) findings.push(`${name}: hero card says ${live.cards[0]?.t}, the bot's windows say ${expectHero}`)
  if (!/^(Today|Tomorrow|\w+day) · (in |going out now)/.test(live.cards[0]?.c ?? '')) findings.push(`${name}: hero countdown "${live.cards[0]?.c}"`)
  // every live metals window is on the table
  if (sw.metal_drift === 'live') for (const at of ['5:15 AM', '4:00 PM', '5:00 PM']) if (!live.rows.some((r) => r.cells[0].startsWith(at) && r.cells[2].startsWith('Gold and silver'))) findings.push(`${name}: no live gold and silver row at ${at}`)
  // the rule's rows are exactly the trading segments of the risk table
  const ruleRows = live.rows.filter((r) => r.cells[2].startsWith('The rule'))
  const wantRule = tradingSegs.map((r) => `${(+(100 * Number(r.fraction)).toFixed(1))}%`).sort()
  const gotRule = ruleRows.map((r) => r.cells[3].match(/^[\d.]+%/)?.[0]).sort()
  if (sw.fav_rule && JSON.stringify(gotRule) !== JSON.stringify(wantRule)) findings.push(`${name}: rule rows ${gotRule} vs risk table ${wantRule}`)
  if (OFF.has(':30/45 weekday') && ruleRows.some((r) => r.cells[0].includes(':21 and :36') && r.cells[1] === 'Mon to Fri')) findings.push(`${name}: a switched-off segment shows as trading`)
  if (live.rows.some((r) => r.cells[3] === 'paper')) findings.push(`${name}: a paper row in the Live view`)
  if (!live.marks) findings.push(`${name}: the day line has no timed dot`)
  // labels never collide
  for (let i = 0; i < live.labels.length; i++) for (let j = i + 1; j < live.labels.length; j++) { const a = live.labels[i], b = live.labels[j]; if (a.top === b.top && a.l < b.r && b.l < a.r) findings.push(`${name}: day-line labels overlap "${a.t}" / "${b.t}"`) }
  for (const l of live.labels) if (l.l < live.day.left - 1 || l.r > live.day.right + 1) findings.push(`${name}: label "${l.t}" runs off the line`)
  // the countdown moves
  const c1 = live.cards[0]?.c; await page.waitForTimeout(2300); const c2 = (await read()).cards[0]?.c
  if (c1 === c2 && !/going out now|\d+h|\dd/.test(c1 ?? '')) findings.push(`${name}: hero countdown did not move (${c1})`)
  await page.locator('#s-when').screenshot({ timeout: 90000, path: join(OUT, `when-live-${name}.png`) })
  // metals: live and paper metals only, tagged
  await page.click('#wh-filter button[data-v="metals"]', { timeout: 90000 }); await page.waitForTimeout(400)
  const met = await read()
  if (!met.rows.some((r) => r.cells[2].startsWith('Palladium') && r.cells[2].includes('paper'))) findings.push(`${name}: metals view has no palladium paper row`)
  if (met.rows.some((r) => /BTC|S&P|The rule|Natural gas/.test(r.cells[2]))) findings.push(`${name}: a non-metal row in the metals view`)
  if (sw.metal_drift === 'live' && !(met.cards[0]?.d ?? '').startsWith('Gold and silver')) findings.push(`${name}: metals hero "${met.cards[0]?.t} ${met.cards[0]?.d}"`)
  await page.locator('#s-when').screenshot({ timeout: 90000, path: join(OUT, `when-metals-${name}.png`) })
  // paper: nothing live
  await page.click('#wh-filter button[data-v="paper"]', { timeout: 90000 }); await page.waitForTimeout(400)
  const pap = await read()
  if (pap.rows.some((r) => /\blive\b/.test(r.cls))) findings.push(`${name}: a live row in the paper view`)
  if (!pap.rows.length) findings.push(`${name}: paper view empty`)
  await page.locator('#s-when').screenshot({ timeout: 90000, path: join(OUT, `when-paper-${name}.png`) })
  if (live.overflow || met.overflow || pap.overflow) findings.push(`${name}: page scrolls sideways: ${(live.wide.length ? live : met.wide.length ? met : pap).wide.join(', ')}`)
  if (errs.length) findings.push(`${name}: console ${errs.slice(0, 3).join(' | ')}`)
  console.log(`${name}: ${live.sub} | hero ${live.cards.map((c) => `[${c.k}: ${c.t} ${c.d} ${c.c}]`).join(' ')}`)
  if (name === 'desk') {
    for (const r of live.rows) console.log(`   ${r.cls.padEnd(14)} ${r.cells.join(' | ')}`)
    console.log(`   marks ${live.marks}, ticks ${live.ticks}, labels ${live.labels.map((l) => l.t).join(' / ')}`)
    console.log(`   note: ${live.note}`)
    console.log(`   metals: ${met.rows.map((r) => r.cells[0].replace(/the .*/, '') + ' ' + r.cells[2].slice(0, 22)).join(' | ')}`)
    console.log(`   paper: ${pap.rows.length} rows`)
  }
  await ctx.close()
}
await browser.close(); server.close()
console.log(`expected hero ${expectHero}; shots in ${OUT}`)
console.log(findings.length ? 'FINDINGS:\n- ' + findings.join('\n- ') : 'CLEAN')
