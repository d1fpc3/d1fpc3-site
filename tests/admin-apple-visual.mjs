// The admin in Apple's clothes, and every place in it working (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/admin-apple-visual.mjs        (ADMIN_URL / OUT / ONLY=desk|wide|phone / THEMES=dark,light env)
//
// D1, 2026-09-28: "go into the entire admin ... put a whole bunch of Apple UI on that ... make that look
// insanely good and actually work correctly". Signs in as the owner and, on D1's 2560 monitor, a 1440
// laptop and an iPhone (WebKit), in dark and light, walks every place and every page inside it and checks:
// no page errors, nothing pushes the page sideways, the rail (a floating source list) moves with every way
// of switching pages (the overview's "Statistics" link used to leave it on Overview), the memecoin bot has
// a way in (its link lived only in the hidden list), on a phone the drawer is a floating glass tab bar with
// thumb-sized buttons and the desks ride Desk's segments, the Course page's "+ Lesson" reads (it was gold on
// gold), the browser's confirm() is an Apple alert that Cancel and Escape close without doing anything, and
// the place badges are one number, not people + applications + codes added up. Screens in OUT.
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const PW_PATHS = ['C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright', 'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright']
const PW = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const OUT = process.env.OUT || `${tmpdir()}/admin-apple`; mkdirSync(OUT, { recursive: true })
const URL = process.env.ADMIN_URL || 'http://127.0.0.1:8123/echelon/admin/'
const LOCAL = /127\.0\.0\.1|localhost/.test(URL)
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: process.env.EMAIL || 'd1fpc3@gmail.com' }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = [], ok = (c, w) => { console.log((c ? '  ok   ' : '  FAIL ') + w); if (!c) fails.push(w) }
const PLACES = ['overview', 'members', 'money', 'course', 'community', 'desk', 'settings']
const THEMES = (process.env.THEMES || 'dark,light').split(',')
const VPS = [['wide', PW.chromium, { viewport: { width: 2560, height: 1440 } }], ['desk', PW.chromium, { viewport: { width: 1440, height: 900 } }], ['phone', PW.webkit, { ...PW.devices['iPhone 15 Pro'] }]]
  .filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n))

// admin-api answers only https://d1fpc3.com, so from localhost its calls are re-issued from Node
async function proxy(ctx) {
  if (!LOCAL) return
  await ctx.route('**/functions/v1/admin-api', async (r) => {
    const req = r.request()
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } })
    const res = await fetch(req.url(), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: req.headers()['authorization'] || `Bearer ${session.access_token}` }, body: req.postData() })
    r.fulfill({ status: res.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await res.text() })
  })
}

for (const [vp, launcher, opts] of VPS) for (const theme of THEMES) {
  console.log(`\n${vp}, ${theme}`)
  const browser = await launcher.launch(launcher === PW.chromium ? { channel: 'chrome' } : {})
  const ctx = await browser.newContext({ ...opts, colorScheme: theme })
  await proxy(ctx)
  await ctx.addInitScript(([k, v, theme]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, v); localStorage.setItem('echelon-theme', theme); localStorage.setItem('echelon-admin-tour-done', '1'); localStorage.setItem('echelon-admin-tour', 'done') }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme])
  const page = await ctx.newPage(), errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app.on', { timeout: 60000 })
  await page.waitForTimeout(3500)
  await page.evaluate(() => { document.querySelectorAll('.tour-card, .tour-ring').forEach((n) => n.remove()) })
  const phone = vp === 'phone'

  // the shell
  const shell = await page.evaluate(() => {
    const side = document.querySelector('.side'), r = side.getBoundingClientRect(), cs = getComputedStyle(side)
    const places = [...document.querySelectorAll('.grp[data-grp]')], links = [...document.querySelectorAll('.side-groups a.grp')]
    const hit = (b) => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)] }
    return { r: [r.left, r.top, r.right, r.bottom].map(Math.round), vw: innerWidth, vh: innerHeight, radius: parseFloat(cs.borderTopLeftRadius), blur: cs.backdropFilter || cs.webkitBackdropFilter, places: places.length, links: links.map((a) => a.textContent.trim()), linksShown: links.filter((a) => a.offsetParent).length, hits: places.map(hit), menu: !!document.querySelector('.menu-btn')?.offsetParent, font: getComputedStyle(document.body).fontFamily }
  })
  ok(shell.places === 7, `seven places (${shell.places})`)
  if (!phone) {
    ok(shell.r[0] >= 8 && shell.r[1] >= 8 && shell.radius >= 20 && /blur/.test(shell.blur), `the sidebar floats, rounded and glass: at ${shell.r[0]},${shell.r[1]} radius ${shell.radius}, ${shell.blur}`)
    ok(shell.links.join() === 'Kalshi,Memecoin bot' && shell.linksShown === 2, `the rail leads to both desks: ${shell.links.join(', ')}`)
  } else {
    ok(shell.r[3] <= shell.vh - 8 && shell.r[1] > shell.vh - 90 && shell.r[0] > 0 && shell.r[2] < shell.vw, `a floating tab bar at the bottom: ${shell.r.join(',')} in ${shell.vw}x${shell.vh}`)
    ok(shell.hits.every(([w, h]) => w >= 40 && h >= 44), `every tab is thumb-sized: ${shell.hits.map((h) => h.join('x')).join(' ')}`)
    ok(!shell.menu && shell.linksShown === 0, 'no hamburger, no desk links squeezed into the bar')
  }

  // every place, every page
  for (const g of PLACES) {
    await page.evaluate((g) => document.querySelector(`.grp[data-grp="${g}"]`).click(), g)
    await page.waitForTimeout(900)
    const segs = await page.evaluate(() => [...document.querySelectorAll('#subnav .sub-seg button')].map((b) => b.dataset.view))
    for (const v of segs.length ? segs : [null]) {
      if (v) { await page.evaluate((v) => document.querySelector(`#subnav .sub-seg button[data-view="${v}"]`).click(), v); await page.waitForTimeout(1100) }
      const st = await page.evaluate((g) => {
        const on = document.querySelector('.grp.on')?.dataset.grp, view = document.querySelector('.view.on')?.id
        const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth
        return { on, view, doc }
      }, g)
      const name = v || g
      ok(st.on === g && st.doc <= 1, `${name}: the ${g} place is lit, ${st.view} shows, the page does not scroll sideways (${st.doc}px)`)
      if (theme === 'dark' || name === 'overview' || name === 'users') await page.screenshot({ path: `${OUT}/${vp}-${theme}-${name}.png` })
    }
  }
  const deskLinks = await page.evaluate(() => { document.querySelector('.grp[data-grp="desk"]').click(); return new Promise((f) => setTimeout(() => f([...document.querySelectorAll('#subnav .seg-link')].map((a) => [a.textContent.trim(), a.getAttribute('href'), !!a.offsetParent])), 600)) })
  ok(deskLinks.length === 2 && deskLinks.every((l) => l[2]) && deskLinks.some((l) => /memecoin-bot/.test(l[1])), `Desk's segments carry both desks: ${deskLinks.map((l) => l[0]).join(', ')}`)

  // the overview's "Statistics" link used to switch the page and leave the rail on Overview
  await page.evaluate(() => document.querySelector('.grp[data-grp="overview"]').click()); await page.waitForTimeout(700)
  const statsGo = await page.evaluate(() => { const b = document.querySelector('#ov-room button'); if (!b || !b.offsetParent) return null; b.click(); return new Promise((f) => setTimeout(() => f({ on: document.querySelector('.grp.on')?.dataset.grp, view: document.querySelector('.view.on')?.id, seg: document.querySelector('#subnav .sub-seg button.on')?.dataset.view }), 700)) })
  if (statsGo) ok(statsGo.on === 'members' && statsGo.view === 'v-stats' && statsGo.seg === 'stats', `the overview's Statistics link lands on Members, Statistics: ${JSON.stringify(statsGo)}`)

  // the badges: one number per place
  const badges = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.gc[data-gc]')].map((b) => [b.dataset.gc, b.textContent])))
  const cnt = await page.evaluate(() => ({ users: document.getElementById('c-users').textContent, apps: document.getElementById('c-apps').textContent, appsHot: document.getElementById('c-apps').classList.contains('hot') }))
  ok(cnt.appsHot ? badges.members === cnt.apps : badges.members === cnt.users, `the Members badge is one number: ${badges.members} (${cnt.appsHot ? `${cnt.apps} new applications waiting` : `${cnt.users} members`}), not people, applications, codes and grants added up`)

  // "+ Lesson" on the Course page reads: its text is not the colour of its own background
  await page.evaluate(() => document.querySelector('.grp[data-grp="course"]').click()); await page.waitForTimeout(1400)
  const plus = await page.evaluate(() => { const b = [...document.querySelectorAll('#course-tree .rowbtn.gold')][0]; if (!b) return null; const cs = getComputedStyle(b); return { text: b.textContent, color: cs.color, bg: cs.backgroundColor } })
  ok(plus && plus.color !== plus.bg, `"+ Lesson" reads: ${plus && `${plus.text} ${plus.color} on ${plus.bg}`}`)
  // Rename asks with a field (the browser's prompt() before), holding the current name; Escape leaves it
  const ren = await page.evaluate(() => { const b = [...document.querySelectorAll('#course-tree .rowbtn')].find((x) => x.textContent.trim() === 'Rename'); if (!b) return null; const name = b.closest('.intg')?.querySelector('.n')?.textContent; b.click(); return name })
  if (ren) {
    await page.waitForTimeout(500)
    const f = await page.evaluate(() => { const s = document.querySelector('.asheet'); return s && { title: s.querySelector('h4').textContent, value: s.querySelector('input')?.value, focused: document.activeElement === s.querySelector('input'), btns: [...s.querySelectorAll('.as-btns button')].map((b) => b.textContent) } })
    ok(f && f.value === ren && f.focused && f.btns.join() === 'Cancel,Save', `Rename opens a sheet with "${ren}" in a focused field: ${JSON.stringify(f)}`)
    await page.keyboard.press('Escape'); await page.waitForTimeout(700)
    const after = await page.evaluate(() => [...document.querySelectorAll('#course-tree .intg .n')][0]?.textContent)
    ok(await page.evaluate(() => !document.querySelector('.asheet')) && after === ren, `Escape closes it and the name stays "${after}"`)
  }

  // an Apple alert in place of confirm(): Cancel and Escape both leave everything as it was
  await page.evaluate(() => { document.querySelector('.grp[data-grp="community"]').click() }); await page.waitForTimeout(1500)
  const chanBefore = await page.evaluate(() => document.querySelectorAll('#chan-table tbody tr, #channels-table tbody tr').length)
  const opened = await page.evaluate(() => { const b = [...document.querySelectorAll('#v-community .rowbtn')].find((x) => /^Delete$/.test(x.textContent.trim())); if (!b) return false; b.click(); return true })
  if (opened) {
    await page.waitForTimeout(500)
    const sheet = await page.evaluate(() => { const s = document.querySelector('.asheet'); if (!s) return null; return { title: s.querySelector('h4')?.textContent, btns: [...s.querySelectorAll('.as-btns button')].map((b) => b.textContent + (b.classList.contains('danger') ? '!' : '')) } })
    ok(sheet && sheet.btns.join() === 'Cancel,Delete!', `Delete asks with an Apple alert, the destructive button red: ${JSON.stringify(sheet)}`)
    if (vp === 'desk' && theme === 'dark') await page.screenshot({ path: `${OUT}/${vp}-${theme}-alert.png` })
    await page.evaluate(() => [...document.querySelectorAll('.asheet .as-btns button')].find((b) => b.textContent === 'Cancel').click()); await page.waitForTimeout(500)
    ok(await page.evaluate(() => !document.querySelector('.asheet')), 'Cancel closes it')
    await page.evaluate(() => [...document.querySelectorAll('#v-community .rowbtn')].find((x) => /^Delete$/.test(x.textContent.trim())).click()); await page.waitForTimeout(400)
    await page.keyboard.press('Escape'); await page.waitForTimeout(500)
    const chanAfter = await page.evaluate(() => document.querySelectorAll('#chan-table tbody tr, #channels-table tbody tr').length)
    ok(await page.evaluate(() => !document.querySelector('.asheet')) && chanAfter === chanBefore, `Escape closes it too, and nothing was deleted (${chanBefore} to ${chanAfter} rows)`)
  } else console.log('  (no Delete button in Community to open an alert with)')

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + [...new Set(errs)].slice(0, 4).join(' | ') : ''))
  await browser.close()
}
console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nALL OK')
console.log('shots: ' + OUT)
process.exit(fails.length ? 1 : 0)
