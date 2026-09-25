// Zoom-lock harness (manual). Serves the site root locally, opens every Echelon page in a
// touch-enabled phone context, and tries to zoom it: a CDP pinch (scale 2.5) and a synthetic
// double-tap. Passes only if visualViewport.scale stays 1 on every page and the meta and the
// gesture guard are present. The pinch path is what WKWebView (the iOS shell) and Chromium
// honour; the gesture guard is Safari's path and cannot be simulated here, so its presence is
// asserted instead.
//   node tests/echelon-zoom-lock.mjs        (PORT env; URL env to run against the live site)
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, normalize, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const PW = ['C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright', 'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright']
const { chromium, devices } = require(PW.find((p) => existsSync(p)) || 'playwright')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT || 8137)
// admin/memecoins.html is a fragment the admin desk loads, not a page, so it is not listed
const PAGES = ['echelon/admin/', 'echelon/admin/kalshi-desk/', 'echelon/admin/kalshi-desk/terminal.html', 'echelon/admin/kalshi-desk/weather.html', 'echelon/app/', 'echelon/apply/', 'echelon/gex/', 'echelon/mod/', 'echelon/propfirms/', 'echelon/weather/', 'echelon/welcome/']

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
let server = null
let base = process.env.URL
if (!base) {
  server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'
    const file = join(ROOT, normalize(p).replace(/^([/\\])+/, ''))
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file))
  })
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
  base = `http://127.0.0.1:${PORT}/`
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
const findings = []
for (const path of PAGES) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => findings.push(`${path}: pageerror ${e.message.slice(0, 120)}`))
  try {
    await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const meta = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.content ?? '')
    const guard = await page.evaluate(() => window.__zoomLock === true && getComputedStyle(document.documentElement).touchAction === 'manipulation')
    if (!/user-scalable=no/.test(meta) || !/maximum-scale=1\b/.test(meta)) findings.push(`${path}: viewport meta is "${meta}"`)
    if (!guard) findings.push(`${path}: gesture guard or touch-action missing`)
    const cdp = await ctx.newCDPSession(page)
    const vp = page.viewportSize()
    await cdp.send('Input.synthesizePinchGesture', { x: vp.width / 2, y: vp.height / 2, scaleFactor: 2.5, relativeSpeed: 400, gestureSourceType: 'touch' })
    await page.waitForTimeout(300)
    const afterPinch = await page.evaluate(() => window.visualViewport.scale)
    // double tap: two taps 120 ms apart at the same point
    const x = vp.width / 2, y = Math.min(vp.height - 40, 200)
    for (let i = 0; i < 2; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(120)
    }
    await page.waitForTimeout(400)
    const afterTap = await page.evaluate(() => window.visualViewport.scale)
    if (Math.abs(afterPinch - 1) > 0.001) findings.push(`${path}: pinch zoomed to ${afterPinch.toFixed(2)}`)
    if (Math.abs(afterTap - 1) > 0.001) findings.push(`${path}: double-tap zoomed to ${afterTap.toFixed(2)}`)
    console.log(`${path.padEnd(42)} meta ok=${/user-scalable=no/.test(meta)}  guard=${guard}  pinch->${afterPinch.toFixed(2)}  dbltap->${afterTap.toFixed(2)}`)
    await cdp.detach()
  } catch (e) { findings.push(`${path}: ${e.message.slice(0, 140)}`) }
  await page.close()
}
await browser.close(); if (server) server.close()
if (findings.length) { console.log('\nFINDINGS'); findings.forEach((f) => console.log(' - ' + f)); process.exit(1) }
console.log('\nclean: no page zooms')
