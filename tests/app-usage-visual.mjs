// Manual: python -m http.server 8123 from the repo root, then node tests/app-usage-visual.mjs (APP_URL env; writes as appreview, then deletes its rows).
// Drive the members app as appreview: switch pages, wait for the minute flush, play a library video, and
// read back app_usage + library_views. APP_URL=... node app-usage.mjs
import { createRequire } from 'module'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const URL = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const LOCAL = /127\.0\.0\.1|localhost/.test(URL)
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const EMAIL = 'appreview@d1fpc3.com', UID = '460ac26b-f710-4dc0-b21d-2834e86c23fc'
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: EMAIL }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
const sql = async (q) => (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${mgmt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })).json()
const fails = [], ok = (c, w) => { console.log((c ? '  ok   ' : '  FAIL ') + w); if (!c) fails.push(w) }

await sql(`delete from public.app_usage where user_id = '${UID}'`)
const before = await sql(`select video_id, seconds_watched, max_frac from public.library_views where user_id = '${UID}'`)

const browser = await PW.chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
if (LOCAL) await ctx.route('**/functions/v1/media-url', async (r) => {
  const req = r.request()
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } })
  const res = await fetch(req.url(), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: req.headers()['authorization'] || `Bearer ${session.access_token}`, Origin: 'https://d1fpc3.com' }, body: req.postData() })
  r.fulfill({ status: res.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await res.text() })
})
await ctx.addInitScript(([k, v]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, v); localStorage.setItem('echelon-splash-day', new Date().toDateString()) }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
const page = await ctx.newPage(), errs = [], rpcs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('request', (r) => { if (/rpc\/(track_usage|record_library_watch)/.test(r.url())) rpcs.push(r.url().split('/rpc/')[1] + ' ' + (r.postData() || '').slice(0, 300)) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#app.on', { timeout: 60000 })
await page.waitForTimeout(2500)
ok(await page.evaluate(() => typeof globalThis.__usageOpen === 'function' && typeof globalThis.__libWatch === 'function'), 'the tracker is wired')
// walk a few pages, a few seconds each
for (const v of ['news', 'chart', 'course', 'overview']) {
  await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`)?.click(), v)
  await page.waitForTimeout(4000)
  await page.mouse.move(700 + Math.random() * 50, 500)
}
console.log('  waiting for the minute flush...')
await page.waitForTimeout(62000)
const rows = await sql(`select view, opens, secs from public.app_usage where user_id = '${UID}' order by view`)
console.log('  app_usage:', JSON.stringify(rows))
const by = Object.fromEntries((Array.isArray(rows) ? rows : []).map((r) => [r.view, r]))
ok(['news', 'chart', 'course', 'overview'].every((v) => by[v]?.opens >= 1), 'each page I opened is counted as an open')
ok((by.news?.secs ?? 0) >= 3 && (by.news?.secs ?? 0) <= 8, `news has about 4 seconds on screen (${by.news?.secs})`)
ok((by.overview?.secs ?? 0) >= 20, `Today, where it sat through the wait, has the most (${by.overview?.secs})`)

// a library video: play ~35s, close the player
const vid = await page.evaluate(async () => {
  document.querySelector('.tab[data-view="library"]')?.click()
  await new Promise((f) => setTimeout(f, 2500))
  const card = document.querySelector('#v-library [data-id], #v-library .lib-card, #v-library .vcard, #v-library button.lib-item')
  return card ? (card.dataset.id || 'clicked') : null
})
console.log('  library card:', vid)
let played = false
if (vid) {
  await page.evaluate(() => (document.querySelector('#v-library [data-id], #v-library .lib-card, #v-library .vcard, #v-library button.lib-item')).click())
  await page.waitForTimeout(4000)
  played = await page.evaluate(async () => { const v = document.querySelector('#lib-player video'); if (!v) return false; v.muted = true; try { await v.play() } catch { return false } return true })
  console.log('  playing:', played)
  if (played) {
    await page.waitForTimeout(36000)
    await page.evaluate(() => document.getElementById('lib-x')?.click())
    await page.waitForTimeout(3000)
  }
}
const after = await sql(`select video_id, seconds_watched, max_frac from public.library_views where user_id = '${UID}' and seconds_watched > 0`)
console.log('  library_views with watch time:', JSON.stringify(after))
if (played) ok(Array.isArray(after) && after.some((r) => r.seconds_watched >= 25 && r.max_frac > 0), 'the video reports ~35s played and how far it got')
console.log('  rpc calls seen:', rpcs.length); rpcs.slice(0, 6).forEach((r) => console.log('   ', r))
ok(!errs.length, `no page errors ${errs.join(' | ')}`)
await browser.close()
// leave no trace on the review account
await sql(`delete from public.app_usage where user_id = '${UID}'`)
await sql(`update public.library_views set seconds_watched = 0, max_frac = null where user_id = '${UID}'`)
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed')
process.exit(fails.length ? 1 : 0)
