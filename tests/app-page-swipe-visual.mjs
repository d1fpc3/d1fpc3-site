// Swiping between pages on a phone, and the conversation's swipes (D1, 9/30: "swipe left, swipe right, easy to use
// pages, just like Discord and Instagram", "chat easier to use"). Manual, not a node:test.
//   node tests/app-page-swipe-visual.mjs        (APP_URL / OUT / EMAIL env)
// Drives REAL CDP touch sequences on an iPhone-sized Chromium (headless WebKit has no touch input):
//   the page follows the finger and the dock pill rides along; a swipe left walks Today > Posts > Chat > Members
//   (the segment pill follows inside Chat) and a swipe right walks back; a short drag springs back; a flick
//   commits on speed; a mostly vertical drag scrolls and never turns the page; Today and the profile rubber-band
//   at the ends; a drag that starts in the Today chips row scrolls the row, not the page; News (pushed from Today)
//   goes back with a swipe from the left edge; in a conversation a swipe
//   right shows the inbox underneath and goes back to it; a message swiped left arms a reply (nothing is sent:
//   the reply bar is cleared at the end). Page titles say Posts. No page errors.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/app-page-swipe`; mkdirSync(OUT, { recursive: true })
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const email = process.env.EMAIL || 'appreview@d1fpc3.com'
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')
const fails = []
const check = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1'); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', 'dark'); try { if (window.Notification) Notification.requestPermission = () => Promise.resolve('default') } catch (e) {} }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
const page = await ctx.newPage()
page.on('pageerror', (e) => { console.log('  PAGEERROR ' + e.message); fails.push('pageerror: ' + e.message) })
const cdp = await ctx.newCDPSession(page)
const pt = (p) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
async function drag(from, to, { steps = 12, hold = 18, peek = null, at = 0.75 } = {}) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) })
  let seen = null
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p) })
    await page.waitForTimeout(hold)
    if (peek && i === Math.ceil(steps * at)) seen = await page.evaluate(peek)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  return seen
}
const cur = () => page.evaluate(() => document.querySelector('.view.on')?.id.replace(/^v-/, ''))
const settle = () => page.waitForTimeout(700)
const peekPage = () => { const v = document.querySelector('.view.on'), m = new DOMMatrixReadOnly(getComputedStyle(v).transform), ind = document.querySelector('#bnav .bnav-ind'); const pk = document.querySelector('.view.pg-peek'), pm = pk ? new DOMMatrixReadOnly(getComputedStyle(pk).transform) : null; return { x: Math.round(m.m41), op: Number(getComputedStyle(v).opacity), ind: ind?.style.getPropertyValue('--x') || '', peek: pk?.id || '', px: pm ? Math.round(pm.m41) : null } }
const L = { x: 330, y: 520 }, Rt = { x: 50, y: 520 }

await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#td-h1', { state: 'attached', timeout: 30000 })
await page.waitForTimeout(2500)
await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
const order = await page.evaluate(() => globalThis.__pager?.order())
check(Array.isArray(order) && order[0] === 'overview' && order.includes('feed') && order.indexOf('members') === order.indexOf('chat') + 1 && order.at(-1) === 'set-profile', `the page order: ${order?.join(' > ')}`)
check(await cur() === 'overview', 'starts on Today')
// Today's GEX card talks in sentence case now
const pill = await page.evaluate(() => document.querySelector('.td-pill')?.textContent || '')
check(!pill || /^[A-Z][a-z]/.test(pill), `the Today GEX pill is not shouting ("${pill}")`)

// 1. the page follows the finger, the pill rides along, then Posts
const before = await page.evaluate(() => document.querySelector('#bnav .bnav-ind')?.style.getPropertyValue('--x'))
const mid = await drag(L, Rt, { peek: peekPage })
check(mid && mid.x < -100 && mid.peek === 'v-feed' && Math.abs(mid.px - (mid.x + 390)) <= 2 && mid.ind && mid.ind !== before, `mid-swipe Today is at ${mid?.x}px with Posts riding beside it at ${mid?.px}px (${mid?.peek}), the dock pill moved ${before} to ${mid?.ind}`)
await settle()
check(await cur() === 'feed', `a swipe left from Today lands on Posts (${await cur()})`)
const title = await page.evaluate(() => document.getElementById('pane-title').textContent)
check(title === 'Posts', `the page is called Posts ("${title}")`)
const clean = await page.evaluate(() => { const v = document.querySelector('.view.on'); return !v.style.transform && !v.style.opacity && !v.style.position && !document.querySelector('.view.pg-peek') && document.querySelectorAll('.view.on').length === 1 })
check(clean, 'the arriving page settles with no transform left on it')
await page.screenshot({ path: `${OUT}/1 Posts after a swipe.png` })
// 2. on to Chat, then Members inside the family, the segment pill following
await drag(L, Rt); await settle()
check(await cur() === 'chat', `then Chat (${await cur()})`)
const segBefore = await page.evaluate(() => document.querySelector('#tb-seg .tbseg-ind')?.style.transform)
const segMid = await drag(L, Rt, { peek: () => document.querySelector('#tb-seg .tbseg-ind')?.style.transform })
await settle()
check(await cur() === 'members' && segMid && segMid !== segBefore, `then Members, the segment pill sliding with it (${segBefore} > ${segMid})`)
await drag(Rt, L); await settle()
check(await cur() === 'chat', `a swipe right goes back to Channels (${await cur()})`)
// 3. a short drag springs back
await drag(L, { x: 270, y: 520 }, { steps: 6 }); await settle()
const back = await page.evaluate(() => ({ v: document.querySelector('.view.on').id, t: document.querySelector('.view.on').style.transform }))
check(back.v === 'v-chat' && !back.t, `a short drag springs back and stays on Chat (${back.v})`)
// 4. a flick commits on speed, not distance
await drag({ x: 300, y: 520 }, { x: 205, y: 520 }, { steps: 3, hold: 8 }); await settle()
check(await cur() === 'members', `a quick flick of ~95px turns the page (${await cur()})`)
await drag(Rt, L); await settle()
// 5. a vertical drag scrolls, never turns
await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click()); await page.waitForTimeout(900)
const y0 = await page.evaluate(() => scrollY)
await drag({ x: 200, y: 700 }, { x: 240, y: 300 }, { steps: 10 }); await settle()
check(await cur() === 'overview', `a mostly vertical drag keeps Today (scrolled ${y0} to ${await page.evaluate(() => Math.round(scrollY))})`)
await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300)
// 6. the ends rubber-band
const wall = await drag(Rt, L, { peek: peekPage }); await settle()
check(await cur() === 'overview' && wall && wall.x > 0 && wall.x < 130, `Today rubber-bands on a swipe right (pulled ${wall?.x}px for 280px of finger)`)
// 7. a drag in the chips row scrolls the row
const chips = await page.evaluate(() => { const h = document.getElementById('td-chips'); if (!h || !h.offsetParent) return null; const r = h.getBoundingClientRect(); return { y: r.top + r.height / 2, sw: h.scrollWidth, cw: h.clientWidth } })
if (chips && chips.sw > chips.cw + 2) {
  await drag({ x: 330, y: chips.y }, { x: 80, y: chips.y }); await settle()
  const sl = await page.evaluate(() => document.getElementById('td-chips').scrollLeft)
  check(await cur() === 'overview' && sl > 0, `a drag on the chips row scrolls the row (scrollLeft ${sl}), the page stays`)
} else console.log('  (the chips row fits: no sideways scroll to test)')
// 7b. a page pushed from Today (News) goes back with a swipe from the left edge
await page.evaluate(() => document.querySelector('#td-chips .td-chip[data-view="news"]')?.click()); await page.waitForTimeout(1200)
const onNews = await cur()
const eb = await drag({ x: 8, y: 560 }, { x: 250, y: 562 }, { peek: () => { const v = document.querySelector('.view.on'); return Math.round(new DOMMatrixReadOnly(getComputedStyle(v).transform).m41) } }); await settle()
check(onNews === 'news' && eb > 40 && await cur() === 'overview', `News follows the finger from the left edge (${eb}px) and goes back to Today (${await cur()})`)
// 8. the profile is the last page
await page.evaluate(() => document.querySelector('#bnav button[data-view="set-profile"]').click()); await page.waitForTimeout(900)
await drag(L, Rt); await settle()
check(await cur() === 'set-profile', `the profile rubber-bands on a swipe left (${await cur()})`)
await drag(Rt, L); await settle()
const fromPro = await cur()
check(fromPro !== 'set-profile' && fromPro !== 'settings', `and a swipe right walks back into Study (${fromPro}), not into Settings`)
// 9. a conversation: swipe right to the inbox
await page.evaluate(() => document.querySelector('.tab[data-view="chat"]').click()); await page.waitForTimeout(1500)
const opened = await page.evaluate(() => { const r = document.querySelector('#v-chat .cr-item'); if (!r) return false; r.click(); return true })
await page.waitForTimeout(2200)
const isOpen = () => page.evaluate(() => document.getElementById('chat').classList.contains('open-convo'))
check(opened && await isOpen(), 'a channel opens full screen')
await page.screenshot({ path: `${OUT}/2 conversation.png` })
const pk = await drag({ x: 60, y: 420 }, { x: 330, y: 420 }, { peek: () => ({ under: !!document.querySelector('#chat > .cv-under .chat-rail'), cvx: parseFloat(getComputedStyle(document.getElementById('chat')).getPropertyValue('--cvx')) || 0 }) })
check(pk && pk.under && pk.cvx > 100, `mid-swipe the conversation is ${Math.round(pk?.cvx || 0)}px over with the inbox underneath`)
await page.waitForTimeout(900)
check(!(await isOpen()) && await cur() === 'chat', 'a swipe right goes back to the inbox')
const leftover = await page.evaluate(() => ({ under: !!document.querySelector('#chat > .cv-under'), peek: document.getElementById('chat').classList.contains('cv-peek') }))
check(!leftover.under && !leftover.peek, 'and leaves nothing of the swipe behind')
// 10. swipe a message left to reply (nothing is sent). Announcements first: only the team posts there, so nothing arms
await page.evaluate(() => [...document.querySelectorAll('#v-chat .cr-item')].find((r) => /Announcements/.test(r.textContent))?.click()); await page.waitForTimeout(2200)
const annArm = await drag({ x: 300, y: 560 }, { x: 120, y: 560 }, { peek: () => !!document.querySelector('#chat-log .m-sw') })
check(!annArm && await isOpen(), 'in Announcements (only the team posts) a message swiped left does not arm a reply')
await page.evaluate(() => document.getElementById('chat-back').click()); await page.waitForTimeout(900)
await page.evaluate(() => [...document.querySelectorAll('#v-chat .cr-item')].find((r) => /General/.test(r.textContent))?.click()); await page.waitForTimeout(2400)
const row = await page.evaluate(() => { const rows = [...document.querySelectorAll('#chat-log .msg[data-mid]')].filter((r) => { const b = r.getBoundingClientRect(); return b.top > 120 && b.bottom < innerHeight - 140 }); const r = rows.at(-1); if (!r) return null; const b = r.getBoundingClientRect(); return { y: b.top + Math.min(24, b.height / 2), mid: r.dataset.mid } })
if (row) {
  const arm = await drag({ x: 300, y: row.y }, { x: 120, y: row.y }, { peek: () => !!document.querySelector('#chat-log .m-sw.on') })
  await page.waitForTimeout(500)
  const rp = await page.evaluate(() => { const b = document.getElementById('chat-replying'); return { shown: !!b && !b.hidden, text: b?.textContent || '', open: document.getElementById('chat').classList.contains('open-convo') } })
  check(arm && rp.shown && rp.open && /Replying to/.test(rp.text), `a message swiped left arms a reply ("${rp.text.trim().slice(0, 50)}"), the conversation stays open`)
  await page.screenshot({ path: `${OUT}/3 swipe to reply.png` })
  await page.evaluate(() => document.querySelector('#chat-replying button')?.click())
  const gone = await page.evaluate(() => document.getElementById('chat-replying')?.hidden !== false)
  check(gone, 'the reply is cleared again (nothing sent)')
} else console.log('  (no message on screen to reply to)')
await page.evaluate(() => document.getElementById('chat-back').click()); await page.waitForTimeout(700)
await browser.close()
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join('\n  ')}` : 'ALL OK')
process.exit(fails.length ? 1 : 0)
