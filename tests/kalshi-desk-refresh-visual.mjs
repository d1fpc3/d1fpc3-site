// Kalshi desk refresh harness (manual, not CI).
//   node tests/kalshi-desk-refresh-visual.mjs        (THEME, VPS=desk,phone, OUT, PORT env)
//
// Proves the desk can be told to refresh: the button in the bar re-reads every panel and
// spins while it does, the age label counts up and turns gold when the numbers are stale,
// the R key does the same, coming back to a backgrounded tab re-reads on its own (a phone
// suspends its timers the moment it locks), and on a touch device a pull from the top
// refreshes while a sideways drag inside a wide table still scrolls it. Counts the network
// reads each path makes, so "it refreshed" is not taken on the word of a spinner.
// Same session recipe as tests/kalshi-desk-visual.mjs.

import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const PW_PATHS = [
  'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright',
  'C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright',
]
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || 'playwright')
const ROOT = join(import.meta.dirname, '..')
const OUT = process.env.OUT || join(tmpdir(), 'kalshi-desk-refresh')
const PORT = Number(process.env.PORT || 8131)
const THEME = process.env.THEME || 'dark'
const VPS = (process.env.VPS || 'desk,phone').split(',')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const file = join(ROOT, normalize(p).replace(/^([/\\])+/, ''))
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
const URL = process.env.URL || `http://127.0.0.1:${PORT}/echelon/admin/kalshi-desk/`

const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const tokenFile = join(homedir(), '.supabase', 'access-token')
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')
const email = process.env.EMAIL || 'd1fpc3@gmail.com'
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed: ' + JSON.stringify(session).slice(0, 200))

const fails = []
const note = (s) => console.log('  ' + s)
const check = (ok, what) => { note((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
const VP = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  wide: { viewport: { width: 2560, height: 1300 }, deviceScaleFactor: 1 },
  phone: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

// every PostgREST/RPC read the page makes, counted per window so "it refreshed" is measured
const state = (page) => page.evaluate(() => ({
  age: document.getElementById('refresh-age')?.textContent,
  busy: document.getElementById('refresh')?.classList.contains('busy'),
  old: document.getElementById('refresh')?.classList.contains('old'),
  label: document.getElementById('refresh')?.getAttribute('aria-label'),
  at: window.__reads || 0,
}))

async function run(vpName) {
  console.log(`\n${vpName} · ${THEME} · ${email}`)
  const ctx = await browser.newContext(VP[vpName])
  await ctx.addInitScript(([k, v, t]) => {
    localStorage.setItem(k, v); localStorage.setItem('echelon-theme', t)
    // count the reads the desk makes, so a refresh is proved by traffic and not by a spinner
    window.__reads = 0
    const f = window.fetch
    window.fetch = function (...a) { const u = String(a[0]?.url || a[0] || ''); if (/\/rest\/v1\/|\/rpc\//.test(u)) window.__reads++; return f.apply(this, a) }
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), THEME])
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  // attached, not visible: on a touch screen the button is deliberately hidden
  await page.waitForSelector('#refresh', { state: 'attached', timeout: 30000 })
  // the boot is done when the desk has stamped its own clock, not when the label happens to
  // read "now": the markup must not claim the desk is current before a read has landed
  await page.waitForFunction(() => window.__desk?.RF?.at > 0, null, { timeout: 45000 })
  await page.waitForTimeout(1200)
  const tag = `${vpName}-${THEME}`

  // 1. the control is there and honest on first paint
  let s = await state(page)
  check(s.age === 'now' && !s.busy && !s.old, `the bar says the desk is current: "${s.age}"`)
  check(/updated just now/i.test(s.label || ''), `the button names its own state to a screen reader: "${s.label}"`)
  const reads0 = s.at
  check(reads0 > 5, `the first load read the database ${reads0} times`)
  await page.screenshot({ path: `${OUT}/${tag}-bar.png`, clip: { x: 0, y: 0, width: VP[vpName].viewport.width, height: 150 } })

  // 2. it actually re-reads, and says so while it is working. On a touch screen the button
  // is deliberately not there (the pull does it), so the phone calls the same path.
  if (vpName === 'phone') {
    check(await page.evaluate(() => getComputedStyle(document.getElementById('refresh')).display === 'none'), 'no refresh button on a touch screen: the pull is the way')
    check(await page.evaluate(() => { const p = document.getElementById('pulse'); return !!p && p.offsetHeight > 0 }), 'the collector clock stays in the bar')
    page.evaluate(() => window.__desk.refresh())
  } else {
    await page.click('#refresh')
  }
  await page.waitForTimeout(120)
  const mid = await state(page)
  check(mid.busy, 'it spins while it is reading')
  await page.waitForFunction(() => !document.getElementById('refresh').classList.contains('busy'), null, { timeout: 30000 })
  const after = await state(page)
  check(after.at - reads0 >= 10, `the click re-read every panel (${after.at - reads0} reads)`)
  check(after.age === 'now', 'and the age resets to now')

  // 3. the age is not decorative. The label repaints every 15s, too slow to sit through, so
  // the clock is moved forward under the page and the next repaint is triggered by a refresh
  // of nothing: the same paintAge the timer calls.
  const aged = await page.evaluate(() => {
    const at = window.__desk.RF.at
    window.__desk.RF.at = at - 6 * 60_000     // six minutes in a pocket
    window.__desk.paintAge()
    const b = document.getElementById('refresh')
    const out = { t: document.getElementById('refresh-age').textContent, old: b.classList.contains('old'), label: b.getAttribute('aria-label') }
    window.__desk.RF.at = at; window.__desk.paintAge()
    return out
  })
  check(aged.t === '6m ago' && aged.old, `six minutes later the bar says "${aged.t}" and marks itself stale`)
  check(/updated 6 minutes ago/i.test(aged.label || ''), `and says it in full to a screen reader: "${aged.label}"`)
  check((await state(page)).age === 'now' && !(await state(page)).old, 'a fresh read puts it back to now')
  const hour = await page.evaluate(() => {
    const at = window.__desk.RF.at
    window.__desk.RF.at = at - 70 * 60_000
    window.__desk.paintAge()
    const t = document.getElementById('refresh-age').textContent
    window.__desk.RF.at = at; window.__desk.paintAge()
    return t
  })
  check(hour === '1h ago', `an hour later it stops counting minutes ("${hour}")`)

  // 4. the keyboard does it too, and typing an r in a field does not
  const beforeKey = (await state(page)).at
  await page.keyboard.press('r')
  await page.waitForTimeout(150)
  check((await state(page)).busy || (await state(page)).at > beforeKey, 'R refreshes')
  await page.waitForFunction(() => !document.getElementById('refresh').classList.contains('busy'), null, { timeout: 30000 })
  const typed = await page.evaluate(async () => {
    const i = document.querySelector('input[type="number"], input[type="text"]')
    if (!i) return 'no input on the page'
    i.focus(); const n = window.__reads
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    await new Promise((r) => setTimeout(r, 200))
    return window.__reads === n ? 'quiet' : 'fired'
  })
  check(typed !== 'fired', `typing an r into a field does not refresh the page (${typed})`)

  // 5. a backgrounded tab re-reads when you come back to it
  const beforeHide = (await state(page)).at
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(80)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(250)
  const backShort = (await state(page)).at
  check(backShort === beforeHide, 'flicking away and straight back does not re-read (under 20s)')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(80)
  // a locked phone, twenty-five seconds later
  await page.evaluate(() => { const d = Date.now; Date.now = () => d() + 25_000 })
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(400)
  const backLong = (await state(page)).at
  check(backLong > beforeHide, `coming back to a desk left alone re-reads it (${backLong - beforeHide} reads)`)
  await page.waitForFunction(() => !document.getElementById('refresh').classList.contains('busy'), null, { timeout: 30000 })
  await page.evaluate(() => { const d = Date.now; Date.now = () => d() })

  // 6. pull to refresh, touch only
  if (vpName === 'phone') {
    const wired = await page.evaluate(() => !!document.getElementById('ptr'))
    check(wired, 'the pull indicator exists on a touch device')
    await page.evaluate(() => window.scrollTo(0, 0))
    const before = (await state(page)).at
    const cdp = await page.context().newCDPSession(page)
    const pt = (y) => ({ x: 195, y })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(220)] })
    for (const y of [235, 260, 295, 330, 365]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(y)] })
      await page.waitForTimeout(24)
    }
    const pulled = await page.evaluate(() => {
      const p = document.getElementById('ptr'), dot = p.querySelector('i')
      const r = dot.getBoundingClientRect()
      // opacity alone is not "visible": at top:0 it drew under the sticky bar and the whole
      // gesture was invisible while every style property still read correct
      // the indicator sets pointer-events: none so it can never be its own hit target; lift
      // that for the length of one probe, otherwise this always reads as covered
      const prev = p.style.pointerEvents; p.style.pointerEvents = 'auto'
      const hit = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2))
      p.style.pointerEvents = prev
      const bar = document.getElementById('topstick').getBoundingClientRect()
      return { op: getComputedStyle(p).opacity, ready: p.classList.contains('ready'), y: Math.round(r.y), clearsBar: r.y >= bar.bottom - 1, covered: !(hit === dot || dot.contains(hit)), onScreen: r.y > 0 && r.bottom < innerHeight }
    })
    check(Number(pulled.op) > 0.5 && pulled.ready, `the pull shows and arms (opacity ${pulled.op}, armed ${pulled.ready})`)
    check(!pulled.covered && pulled.onScreen && pulled.clearsBar, `and it is actually on screen, clear of the bar (top ${pulled.y}px, covered ${pulled.covered})`)
    await page.screenshot({ path: `${OUT}/${tag}-pull.png`, clip: { x: 0, y: 0, width: 390, height: 260 } })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(400)
    const afterPull = (await state(page)).at
    check(afterPull > before, `letting go refreshes (${afterPull - before} reads)`)
    await page.waitForFunction(() => !document.getElementById('refresh').classList.contains('busy'), null, { timeout: 30000 })
    await page.waitForTimeout(500)
    const settled = await page.evaluate(() => { const p = document.getElementById('ptr'); return { op: getComputedStyle(p).opacity, run: p.classList.contains('run') } })
    check(Number(settled.op) < 0.1 && !settled.run, 'and the indicator goes away after')

    // a sideways drag inside a wide table must still scroll it, not pull the page
    const side = await page.evaluate(() => {
      const t = document.querySelector('.tw, .scroller, [class*="scroll"], table')
      return t ? { found: true, sw: t.scrollWidth, cw: t.clientWidth } : { found: false }
    })
    if (side.found && side.sw > side.cw) {
      const beforeSide = (await state(page)).at
      const box = await page.evaluate(() => { const t = [...document.querySelectorAll('*')].find((n) => n.scrollWidth > n.clientWidth + 40 && n.clientHeight > 30); if (!t) return null; const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })
      if (box && box.y > 0 && box.y < 800) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] })
        for (const dx of [-20, -50, -90]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + dx, y: box.y + 3 }] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await page.waitForTimeout(300)
        check((await state(page)).at === beforeSide, 'a sideways drag in a wide table does not trigger a refresh')
      }
    }
  } else {
    check(await page.evaluate(() => getComputedStyle(document.getElementById('refresh')).display !== 'none'), 'the refresh button shows on desktop')
    const lbl = await page.evaluate(() => getComputedStyle(document.querySelector('#refresh .rt')).display)
    check(lbl !== 'none', 'the age label is spelled out on desktop')
  }
  if (vpName === 'phone') {
    // one row, not two: the bar used to wrap and spend 22% of the screen before a number
    const bar = await page.evaluate(() => {
      const t = document.querySelector('.topbar'), st = document.getElementById('topstick')
      // centres, not tops: the children are different heights on one centred row, so raw
      // tops differ by a few px even when nothing has wrapped
      const rows = new Set([...t.children].filter((c) => c.offsetParent).map((c) => { const r = c.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2 / 8) }))
      return { h: Math.round(t.getBoundingClientRect().height), top: Math.round(st.getBoundingClientRect().height), rows: rows.size }
    })
    check(bar.rows === 1 && bar.h <= 64, 'the header is one row, ' + bar.h + 'px tall (sticky region ' + bar.top + 'px)')
    const cut = await page.evaluate(() => [...document.querySelectorAll('.strip .m')].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent.trim().slice(0, 40)))
    check(cut.length === 0, 'no status cell cuts its own subtitle' + (cut.length ? ': ' + cut.slice(0, 2).join(' | ') : ''))
    const so = await page.evaluate(() => { const b = document.querySelector('.who .dsk-out'); if (!b) return null; const cs = getComputedStyle(b); return { txt: b.textContent.trim(), border: cs.borderTopWidth, w: Math.round(b.getBoundingClientRect().width) } })
    check(so && !/@/.test(so.txt) && so.border === '0px' && so.w < 110, 'sign out is plain text in the bar, not a box: "' + (so && so.txt) + '" ' + (so && so.w) + 'px')
  }

  await page.screenshot({ path: `${OUT}/${tag}-top.png`, fullPage: false })
  check(errs.length === 0, `no console or page errors${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`)
  await ctx.close()
}

for (const vp of VPS) await run(vp.trim())
await browser.close()
server.close()
console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
console.log('shots: ' + OUT)
process.exit(fails.length ? 1 : 0)
