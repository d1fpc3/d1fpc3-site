const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const cssPath = path.join(root, 'landing.css')
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : ''
const scriptPath = path.join(root, 'landing.js')
const script = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : ''
const context = {
  module: { exports: {} },
  exports: {},
  console,
  Intl,
}

vm.runInNewContext(script, context, { filename: 'landing.js' })
const Landing = context.module.exports

test('root page presents the complete Echelon purchase journey', () => {
  assert.match(html, /Trade NQ with a written standard\./)
  assert.match(html, /id="standard"/)
  assert.match(html, /id="inside"/)
  assert.match(html, /id="compare"/)
  assert.match(html, /id="access"/)
  assert.match(html, /Get Echelon <span aria-hidden="true">—<\/span> \$200/)
  assert.match(html, /href="\/echelon\/app\/"/)
})

test('root page keeps required metadata and integrations', () => {
  assert.match(html, /rel="canonical" href="https:\/\/d1fpc3\.com\/"/)
  assert.match(html, /data-sr-site="d19bf048-ec87-453a-aa7f-b264637a7360"/)
  assert.match(html, /application\/ld\+json/)
  assert.match(html, /href="\/landing\.css"/)
  assert.match(html, /src="\/landing\.js"/)
})

test('root page retains honest product and risk language', () => {
  assert.match(html, /one payment/i)
  assert.match(html, /lifetime access/i)
  assert.match(html, /not signals/i)
  assert.match(html, /substantial risk of loss/i)
  assert.doesNotMatch(html, /win rate|guaranteed profit|limited seats/i)
})

test('landing stylesheet implements the approved visual and responsive contract', () => {
  assert.match(css, /--night:\s*#081018/i)
  assert.match(css, /--gunmetal:\s*#14202a/i)
  assert.match(css, /--frost:\s*#f2f5f6/i)
  assert.match(css, /--brass:\s*#b98b46/i)
  assert.match(css, /\.session-spine/)
  assert.match(css, /\.product-stage/)
  assert.match(css, /@media\s*\(max-width:\s*900px\)/)
  assert.match(css, /@media\s*\(max-width:\s*700px\)/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.match(css, /:focus-visible/)
})

test('landing script parses Discord invite URLs', () => {
  assert.equal(typeof Landing.parseDiscordInvite, 'function')
  assert.equal(Landing.parseDiscordInvite('https://discord.gg/FAQD5Cr5p7'), 'FAQD5Cr5p7')
  assert.equal(Landing.parseDiscordInvite('https://discord.com/invite/abc-123'), 'abc-123')
  assert.equal(Landing.parseDiscordInvite(''), '')
  assert.equal(Landing.parseDiscordInvite('https://example.com/not-discord'), '')
})

test('landing script formats valid public member counts', () => {
  assert.equal(typeof Landing.formatMemberCount, 'function')
  assert.equal(Landing.formatMemberCount(1), '1 member')
  assert.equal(Landing.formatMemberCount(1284), '1,284 members')
  assert.equal(Landing.formatMemberCount(undefined), '')
  assert.equal(Landing.formatMemberCount(0), '')
  assert.equal(Landing.formatMemberCount(-2), '')
})

test('every local page anchor resolves to a unique id', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])
  assert.equal(new Set(ids).size, ids.length, 'duplicate id found')
  for (const anchor of anchors) {
    assert.ok(ids.includes(anchor), `missing target for #${anchor}`)
  }
})
