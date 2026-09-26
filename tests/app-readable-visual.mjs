// Nothing on a page may be hidden by the page itself (manual, not CI).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-readable-visual.mjs        (APP_URL / OUT / EMAIL / THEME / VIEWPORTS env)
//
// Two failures that look like polish and are not:
//   1. Text clipped by its own box with an ellipsis and no other way to read it. The prop
//      firm sheet did this to Split and Payouts on every firm, at 2560 as well as on a
//      phone, so the values the sheet exists to compare could not be read at all.
//   2. The floating "What's next" pill sitting on top of the last row of a page. It is
//      fixed above the dock on phones and the pane only reserved room for the dock.
// Both are measured, not eyeballed: scrollWidth against clientWidth for the clip, and
// rectangle intersection against real text nodes for the cover.
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

const OUT = process.env.OUT || `${tmpdir()}/app-readable`
mkdirSync(OUT, { recursive: true })
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8123/echelon/app/'
const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const tokenFile = join(homedir(), '.supabase', 'access-token')
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')
const email = process.env.EMAIL || 'appreview@d1fpc3.com'
const theme = process.env.THEME || 'dark'
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key
const anon = keys.find((k) => k.name === 'anon').api_key
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
if (!session.access_token) throw new Error('verify failed')

const fails = []
const note = (s) => console.log('  ' + s)
const check = (ok, what) => { note((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
const VP = {
  wide: { viewport: { width: 2560, height: 1300 }, deviceScaleFactor: 1 },
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

// every element whose own box clips its text with an ellipsis, with no title to recover it
const clipped = (page, root) => page.evaluate((root) => {
  const host = root ? document.querySelector(root) : document.body
  if (!host) return []
  const out = []
  for (const n of host.querySelectorAll('*')) {
    if (!n.offsetParent && n !== document.body) continue
    const cs = getComputedStyle(n)
    if (cs.textOverflow !== 'ellipsis' || cs.whiteSpace !== 'nowrap') continue
    if (n.scrollWidth <= n.clientWidth + 1) continue
    if (n.title) continue                       // recoverable: the full value is one hover away
    const t = (n.textContent || '').trim()
    if (t.length < 8) continue
    out.push({ text: t.slice(0, 70), cls: n.className?.toString?.().slice(0, 40) || n.tagName, lost: n.scrollWidth - n.clientWidth })
  }
  return out
}, root)

// real text covered by the floating pill
const covered = (page) => page.evaluate(() => {
  const n = document.getElementById('nextup')
  if (!n || n.hidden || getComputedStyle(n).display === 'none' || !n.offsetHeight) return { shown: false, hits: [] }
  const p = n.getBoundingClientRect()
  const hits = []
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    const s = (t.nodeValue || '').trim()
    if (s.length < 4) continue
    const el = t.parentElement
    if (!el || el.closest('#nextup, .bnav, #toast, .toast, script, style')) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue
    const r = t.getBoundingClientRect ? null : null
    const rng = document.createRange(); rng.selectNodeContents(t)
    const b = rng.getBoundingClientRect()
    if (!b.width || !b.height) continue
    const ox = Math.min(b.right, p.right) - Math.max(b.left, p.left)
    const oy = Math.min(b.bottom, p.bottom) - Math.max(b.top, p.top)
    if (ox > 2 && oy > 2) hits.push({ text: s.slice(0, 48), over: Math.round(oy) })
  }
  return { shown: true, hits, pill: Math.round(p.height) }
})

async function open(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#td-h1', { timeout: 30000 })
  await page.evaluate(() => { const o = document.getElementById('onb'); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove('onb-open') } })
  await page.waitForTimeout(1500)
}
const go = async (page, view) => {
  await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`)?.click(), view)
  await page.waitForTimeout(1400)
}

async function run(vpName) {
  console.log(`\n${vpName} · ${theme}`)
  const ctx = await browser.newContext(VP[vpName])
  await ctx.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem('echelon-gex-tour', '1'); localStorage.setItem('echelon-quotes-off', '1'); localStorage.setItem('echelon-splash-day', new Date().toDateString()); localStorage.setItem('echelon-theme', t) }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => { note('PAGEERROR ' + e.message); fails.push(`${vpName} pageerror: ${e.message}`) })
  await open(page)
  const tag = `${vpName}-${theme}`

  // 1. the prop firm sheet, inside its iframe
  await go(page, 'propfirms')
  // the app's own hash route is #propfirms, so a loose match picks the MAIN frame and every
  // check below then passes against a page that has no spec rows at all
  const frame = page.frames().find((f) => /\/echelon\/propfirms\//.test(f.url()))
  if (!frame) { check(false, 'the prop firms sheet loaded'); } else {
    await frame.waitForSelector('.specs li', { timeout: 25000 }).catch(() => {})
    await page.waitForTimeout(900)
    // Two ways a value can be cut, and the CSS one is the easier: the sheet ALSO shortens in
    // JS and appends a real ellipsis character, which fits its box perfectly and so passes
    // every overflow test while still hiding the number. A trimmed value is only acceptable
    // when the title carries more than the visible text.
    const cut = await frame.evaluate(() => {
      const css = [], data = []
      for (const b of document.querySelectorAll('.specs li b, .plans .row .l b')) {
        const t = (b.textContent || '').trim()
        if (b.scrollWidth > b.clientWidth + 1 && !b.title) css.push(t.slice(0, 60))
        if (/[…]$/.test(t) && (b.title || '').trim().length <= t.length) data.push(t.slice(0, 60))
      }
      return { css, data }
    })
    check(cut.css.length === 0, `no prop firm value is clipped by its box${cut.css.length ? ': ' + cut.css.slice(0, 3).join(' | ') : ''}`)
    check(cut.data.length === 0, `no prop firm value is shortened with nothing behind it${cut.data.length ? ': ' + cut.data.slice(0, 2).join(' | ') : ''}`)
    const recover = await frame.evaluate(() => {
      const t = [...document.querySelectorAll('.specs li b')].filter((b) => /[…]$/.test((b.textContent || '').trim()))
      return { n: t.length, allTitled: t.every((b) => (b.title || '').length > (b.textContent || '').trim().length) }
    })
    check(recover.n === 0 || recover.allTitled, `${recover.n} trimmed value(s), every one recoverable on hover`)
    const rows = await frame.evaluate(() => document.querySelectorAll('.specs li').length)
    check(rows > 10, `the sheet rendered ${rows} spec rows`)
    // the value still sits to the right of its label, i.e. wrapping did not break the layout
    const aligned = await frame.evaluate(() => {
      const li = [...document.querySelectorAll('.specs li')].slice(0, 12)
      return li.every((n) => { const s = n.querySelector('span'), b = n.querySelector('b'); if (!s || !b) return true; return b.getBoundingClientRect().right >= s.getBoundingClientRect().right })
    })
    check(aligned, 'the values still sit right of their labels')
    await page.screenshot({ path: `${OUT}/${tag}-propfirms.png` })
  }

  // 2. the floating pill covers nothing, on the pages where it shows
  for (const view of ['propfirms', 'journal', 'overview', 'news']) {
    await go(page, view)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(700)
    const c = await covered(page)
    if (!c.shown) { note(`skip   ${view}: the pill does not show here`); continue }
    check(c.hits.length === 0, `${view}: the What's next pill covers nothing at the foot of the page${c.hits.length ? ' (covers "' + c.hits[0].text + '")' : ''}`)
    if (c.hits.length) await page.screenshot({ path: `${OUT}/${tag}-${view}-covered.png` })
  }
  // and the room it reserves is real
  await go(page, 'overview')
  const reserve = await page.evaluate(() => ({
    nuh: getComputedStyle(document.documentElement).getPropertyValue('--nu-h').trim(),
    pad: getComputedStyle(document.querySelector('.pane')).paddingBottom,
    shown: !document.getElementById('nextup').hidden,
  }))
  if (vpName === 'phone' && reserve.shown) check(reserve.nuh && parseFloat(reserve.nuh) > 20, `the page reserves the pill's height (--nu-h ${reserve.nuh}, pane pad ${reserve.pad})`)
  else note(`       --nu-h ${reserve.nuh || 'unset'}, pane pad ${reserve.pad}`)

  // 3. nothing else on the main views clips text irrecoverably
  for (const view of ['overview', 'news', 'members', 'indicators']) {
    await go(page, view)
    const c = await clipped(page, `#v-${view}`)
    const bad = c.filter((x) => x.lost > 12)
    check(bad.length === 0, `${view}: no text is cut off with no way to read it${bad.length ? ': ' + bad.slice(0, 2).map((b) => `"${b.text}"`).join(', ') : ''}`)
  }

  await ctx.close()
}

for (const vp of (process.env.VIEWPORTS || 'wide,desk,phone').split(',')) await run(vp.trim())
await browser.close()
console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join('\n- ')}` : '\nall ok')
console.log('shots: ' + OUT)
process.exit(fails.length ? 1 : 0)
