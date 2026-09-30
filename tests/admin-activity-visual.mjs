// The owner's Overview: "Active today" (member_days via admin_member_activity; D1, 9/30: get more people using it).
// Manual, not a node:test.   node tests/admin-activity-visual.mjs        (ADMIN_URL / OUT env)
// Proves: the card sits in the Overview row beside Members, Revenue, Course, Indicators; its numbers match the database
// (members only: test and staff accounts left out); the row stays one line wide on a desk and two across on a phone;
// a member (not the owner) calling admin_member_activity is refused.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/admin-activity`; mkdirSync(OUT, { recursive: true })
const URL = process.env.ADMIN_URL || 'http://127.0.0.1:8123/echelon/admin/'
const LOCAL = /127\.0\.0\.1|localhost/.test(URL)
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const sql = async (q) => (await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${mgmt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })).json())
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
async function mint(email) {
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
  const s = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
  if (!s.access_token) throw new Error('verify failed ' + email); return s
}
const owner = await mint('d1fpc3@gmail.com'), member = await mint('appreview@d1fpc3.com')
const fails = [], ok = (c, w) => { console.log((c ? '  ok   ' : '  FAIL ') + w); if (!c) fails.push(w) }
// the truth, straight from the table
const truth = (await sql(`with d as (select md.user_id, md.day from member_days md join auth.users u on u.id = md.user_id where md.day > (now() at time zone 'America/New_York')::date - 30 and u.email not ilike '%@d1fpc3.test' and u.email not ilike 'appreview%@d1fpc3.com' and not exists (select 1 from admins a where a.user_id = md.user_id) and not exists (select 1 from mods m where m.user_id = md.user_id)) select (select count(distinct user_id) from d where day = (now() at time zone 'America/New_York')::date)::int t, (select count(distinct user_id) from d where day > (now() at time zone 'America/New_York')::date - 7)::int w, (select count(distinct user_id) from d)::int m`))[0]
// a member is refused
const refused = await (await fetch(`${SB}/rest/v1/rpc/admin_member_activity`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${member.access_token}`, 'Content-Type': 'application/json' }, body: '{}' })).json()
ok(refused?.message && /not allowed/.test(refused.message), `a member calling it is refused (${refused?.message})`)
for (const [vp, launcher, opts] of [['desk', PW.chromium, { viewport: { width: 1440, height: 900 } }], ['phone', PW.webkit, { ...PW.devices['iPhone 13'] }]]) {
  console.log(`== ${vp}`)
  const browser = await launcher.launch(); const ctx = await browser.newContext(opts)
  if (LOCAL) await ctx.route('**/functions/v1/admin-api', async (r) => {
    const req = r.request()
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } })
    const res = await fetch(req.url(), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: req.headers()['authorization'] || `Bearer ${owner.access_token}` }, body: req.postData() })
    r.fulfill({ status: res.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await res.text() })
  })
  await ctx.addInitScript(([k, v]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, v); localStorage.setItem('echelon-theme', 'dark'); localStorage.setItem('echelon-admin-tour-done', '1') }, [`sb-${REF}-auth-token`, JSON.stringify(owner)])
  const page = await ctx.newPage(), errs = []; page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app.on', { timeout: 60000 }); await page.waitForTimeout(4500)
  await page.evaluate(() => { document.querySelectorAll('.tour-card, .tour-ring').forEach((n) => n.remove()) })
  const cards = await page.evaluate(() => [...document.querySelectorAll('#cards .scard')].map((c) => { const r = c.getBoundingClientRect(); return { k: c.querySelector('.k')?.textContent, v: c.querySelector('.v')?.textContent, d: c.querySelector('.d')?.textContent, top: Math.round(r.top), spark: !!c.querySelector('.spark') } }))
  const act = cards.find((c) => c.k === 'Active today')
  ok(!!act && Number(act.v) === truth.t && act.d === `${truth.w} this week · ${truth.m} in 30 days`, `Active today: ${act?.v} (${act?.d}); the table says ${truth.t} / ${truth.w} / ${truth.m}`)
  const rows = new Set(cards.map((c) => c.top)).size
  ok(vp === 'desk' ? rows === 1 && cards.length === 5 : rows === 3, `${cards.length} cards in ${rows} row${rows === 1 ? '' : 's'} (${cards.map((c) => c.k).join(', ')})`)
  await page.screenshot({ path: `${OUT}/${vp} overview.png` })
  ok(!errs.length, `[${vp}] no page errors${errs.length ? ': ' + errs.join('; ') : ''}`)
  await browser.close()
}
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join('\n  ')}` : 'ALL OK')
process.exit(fails.length ? 1 : 0)
