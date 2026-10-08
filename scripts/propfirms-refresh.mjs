#!/usr/bin/env node
// Keep prop-firm list prices in echelon/propfirms/propfirms.json honest by
// reading the firms' own pages every weekday (D1, 9/6/26: "make sure this
// doesn't happen and that it updates").
//
//   node scripts/propfirms-refresh.mjs            report + write changes
//   node scripts/propfirms-refresh.mjs --dry      report only
//
// Three tiers, per firm slug:
//   PROBES   read an official source (schema.org offers, a store/products
//            API, an embedded plan JSON, or a plain pricing page) and return
//            { plan, size, price } rows; matched onto the sheet by
//            (plan, size), the list `price` is replaced when it differs.
//   VERIFY   the page cannot be parsed into rows, but every stored price is
//            checked to still appear on it ("$145"); a price that used to be
//            there and is gone is stamped `price_stale` so the sheet shows a
//            "check" marker and this run goes red.
//   MANUAL   nothing readable at all: left to hand checks, said so in the
//            sheet footer.
// A 403 or a Cloudflare wall on curl falls back to headless Chrome through
// Playwright (CI installs it; locally the ORC client's copy), which is how
// Apex and Lucid are read since 10/8/26.
//
// CODES (10/8/26, D1: "the prop firm prices aren't accurate"): the code each
// firm shows on its own site today replaces the sheet's, so a lapsed promo
// (Tradeify SEP 50% after Sept 14, MFFU 50% when the banner says 40%) cannot
// sit on the sheet. The page trusts a code checked here within the week over
// the prop-deals bot.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FILE = join(here, '..', 'echelon', 'propfirms', 'propfirms.json')
const DRY = process.argv.includes('--dry')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
// headless Chrome says "HeadlessChrome" in its own UA, which is what Cloudflare turns away; this one does not
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const today = new Date().toISOString().slice(0, 10)
const WALL = /<title>(Just a moment|Attention Required)|Performing security verification/i

// curl, not fetch: a couple of WAFs (Lucid's) 403 node's TLS fingerprint but let curl through
function curlGet(url, accept) {
  const out = execFileSync('curl', ['-sL', '--max-time', '60', '-A', UA, '-H', `Accept: ${accept}`, '-w', String.fromCharCode(10) + '@@%{http_code}', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const at = out.lastIndexOf(String.fromCharCode(10) + '@@'), status = Number(out.slice(at + 3)), body = out.slice(0, at)
  if (status < 200 || status >= 300) throw new Error(`${url} -> ${status}`)
  if (WALL.test(body)) throw new Error(`${url} -> bot wall`)
  return body
}

let browserP = null
async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const require = createRequire(import.meta.url)
  const at = ['C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright', 'C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright'].find((p) => existsSync(p))
  return at ? require(at) : null
}
function browser() {
  browserP ??= (async () => {
    const pw = await loadPlaywright(); if (!pw) return null
    const b = await pw.chromium.launch({ channel: 'chrome', headless: true }).catch(() => pw.chromium.launch({ headless: true }))
    return b.newContext({ userAgent: BROWSER_UA, locale: 'en-US', viewport: { width: 1440, height: 1000 } })
  })()
  return browserP
}
async function browserGet(url, accept) {
  const ctx = await browser(); if (!ctx) return null
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    // the Cloudflare check clears itself in a few seconds when it is going to
    let body = ''
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(1000)
      body = /json/.test(accept) ? await page.evaluate(() => document.body.innerText) : await page.content()
      if (!WALL.test(body) && i >= 3) break
    }
    if (WALL.test(body)) throw new Error(`${url} -> bot wall (browser too)`)
    return body
  } finally { await page.close() }
}

const cache = new Map()
function get(url, accept = 'text/html,*/*') {
  const key = accept + ' ' + url
  if (!cache.has(key)) cache.set(key, (async () => {
    try { return curlGet(url, accept) } catch (e) {
      if (!/-> 403|bot wall/.test(e.message)) throw e
      const b = await browserGet(url, accept)
      if (b == null) throw e
      return b
    }
  })())
  return cache.get(key)
}
// the JSON value that opens at s[i] ('[' or '{'), string-aware, so a config can be read without running it
function balanced(s, i) {
  let depth = 0, str = false
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (str) { if (c === '\\') j++; else if (c === '"') str = false; continue }
    if (c === '"') str = true
    else if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') { if (--depth === 0) return s.slice(i, j + 1) }
  }
  throw new Error('unbalanced JSON')
}
const usd = (n) => '$' + Number(n).toLocaleString('en-US')
const json = async (url) => JSON.parse(await get(url, 'application/json,*/*'))
// page text: tags become line breaks, entities decoded, one line per text node
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '-').replace(/&#36;/g, '$')
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
const lines = async (url) => text(await get(url))
const money = (s) => { const m = String(s).replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null }
const kSize = (s) => { const m = String(s).replace(/,/g, '').match(/\b(\d{1,3})(?:\.(\d))?\s*K\b/i) || String(s).match(/\$?\b(\d{2,3})000\b/); return m ? (m[2] ? Number(m[1] + '.' + m[2]) * 1000 : Number(m[1]) * (String(s).includes('000') && !/K/i.test(s) ? 1000 : 1000)) : null }

const PROBES = {
  // schema.org offers on the four plan pages; Builder 50K offer = the default ($2K max loss) row.
  // Since early Oct the pages bail out to client rendering and the offers only ride in the
  // escaped RSC payload (\"@type\":\"Offer\"), so the quotes are unescaped first. That payload is streamed in
  // chunks that can split a value ("price":"1 | 53.00"), which once read Builder 50K as $1: the chunk seams go first.
  async mffu() {
    const rows = []
    for (const [path, plan] of Object.entries({ rapid: 'Rapid', pro: 'Pro', builder: 'Builder', 'rapid-eod': 'Rapid EOD' })) {
      const html = (await get(`https://myfundedfutures.com/plans/${path}`)).replace(/"\]\)<\/script><script>self\.__next_f\.push\(\[\d+,"/g, '').replace(/\\"/g, '"')
      let n = 0
      for (const m of html.matchAll(/\{"@type":"Offer","name":"([^"]+Account)","price":"([\d.]+)"/g)) {
        const size = kSize(m[1].replace(/.*Plan\s*/i, '').replace(/,000/, 'K')); if (!size) continue
        rows.push({ plan: plan === 'Builder' && size === 50000 ? 'Builder 50K (Default, $2K max loss)' : plan, size, price: Number(m[2]) }); n++
      }
      if (!n) console.log(`note mffu: no offers on /plans/${path} (plan retired?)`)
    }
    if (rows.length < 8) throw new Error(`mffu: only ${rows.length} offers`)
    return Object.assign(rows, { complete: true })   // all four plan pages: a sheet row missing here is not for sale
  },
  // WooCommerce Store API: "LucidFlex 25K TDV/NT", "LucidDaily 150K TDV/NT | EOD Drawdown"; Reset and Rithmic twins skipped
  async lucid() {
    const items = await json('https://lucidtrading.com/wp-json/wc/store/v1/products?per_page=100')
    const rows = []
    for (const it of items) {
      const m = it.name.match(/^(LucidFlex|LucidPro|LucidDaily|LucidDirect)\s+(\d+)K\s+TDV\/NT(\s*\|\s*EOD Drawdown)?$/i)
      if (!m) continue
      const unit = Math.pow(10, it.prices.currency_minor_unit ?? 2)
      const plan = /LucidDaily/i.test(m[1]) ? (m[3] ? 'LucidDaily (EOD eval drawdown)' : 'LucidDaily (Intraday eval drawdown)') : m[1]
      rows.push({ plan, size: Number(m[2]) * 1000, price: Number(it.prices.regular_price) / unit })
    }
    if (rows.length < 8) throw new Error(`lucid: only ${rows.length} products matched`)
    return rows
  },
  // help-center article: "50K" then "$49/month" (Standard) and "$95/month" (No Activation Fee)
  async topstep() {
    const ls = await lines('https://help.topstep.com/en/articles/14289835-topstep-pricing-and-payment-questions')
    const rows = []
    for (let i = 0; i < ls.length - 2; i++) {
      const m = ls[i].match(/^(\d{2,3})K$/); if (!m) continue
      const a = ls[i + 1].match(/^\$(\d+)\/month$/), b = ls[i + 2].match(/^\$(\d+)\/month$/)
      if (a && b) { rows.push({ plan: `${m[1]}K Trading Combine (Standard path)`, size: +m[1] * 1000, price: +a[1] }, { plan: `${m[1]}K Trading Combine (No Activation Fee path)`, size: +m[1] * 1000, price: +b[1] }); i += 2 }
    }
    if (rows.length < 6) throw new Error(`topstep: ${rows.length} rows`)
    return rows
  },
  // "$25K Evaluation" blocks: "Daily Payouts" = Elite Daily (monthly), "1 Day to Pass" = Elite Access (one-time); first $ after the block head is the list price
  async toponefutures() {
    const ls = await lines('https://toponefutures.com/')
    const rows = []
    for (let i = 0; i < ls.length; i++) {
      const m = ls[i].match(/^\$(\d{2,3})K Evaluation$/); if (!m) continue
      const kind = ls[i + 1] === 'Daily Payouts' ? 'Elite Daily' : ls[i + 1] === '1 Day to Pass' ? 'Elite Access' : null
      if (!kind) continue
      for (let j = i + 2; j < i + 8; j++) { const p = ls[j].match(/^\$(\d{2,4})$/); if (p) { rows.push({ plan: `${kind} ${m[1]}K`, size: +m[1] * 1000, price: +p[1] }); break } }
    }
    if (rows.length < 6) throw new Error(`toponefutures: ${rows.length} rows`)
    return rows
  },
  // "$25,000" card then "Get For $65/mo"
  async oneup() {
    const ls = await lines('https://www.oneuptrader.com/')
    const rows = []; let size = null
    for (const l of ls) {
      const s = l.match(/^\$(\d{2,3}),000$/); if (s) { size = +s[1] * 1000; continue }
      const p = l.match(/^Get For \$(\d+)\/mo$/i); if (p && size) { rows.push({ plan: `$${size.toLocaleString('en-US')} Evaluation`, size, price: +p[1] }); size = null }
    }
    if (rows.length < 4) throw new Error(`oneup: ${rows.length} rows`)
    // the page carries every card twice, the sale price and the list price ($65 and $100 at 25K), and the
    // sheet used to flip between them inside one run: the higher is the list, the lower the site price
    const by = new Map()
    for (const r of rows) {
      const k = r.size, o = by.get(k)
      by.set(k, o ? { ...o, price: Math.max(o.price, r.price), site_price: Math.min(o.site_price ?? o.price, r.price) } : r)
    }
    return [...by.values()].map((r) => (r.site_price != null && r.site_price >= r.price ? { ...r, site_price: undefined } : r))
  },
  // the picker's own catalogue (window.productPickerConfig) behind Cloudflare; headless Chrome reads it. Apex
  // 4.0 rules ride along (target, drawdown, PA activation), since the sheet's were aggregator guesses.
  async apex() {
    const html = await get('https://apextraderfunding.com/')
    const cfg = html.indexOf('window.productPickerConfig'); if (cfg < 0) throw new Error('apex: no productPickerConfig')
    const list = JSON.parse(balanced(html, html.indexOf('[', html.indexOf('products:', cfg))))
    const rows = []
    for (const p of list) {
      const m = String(p.title).match(/^(\d+)k Tradovate (No Activation Fee )?(EOD|Intraday) Trail$/i)
      if (!m || p.enabled === false || p.is_visible === false) continue
      const nofee = !!m[2], eod = /EOD/i.test(m[3]), pa = p.pa_features || {}
      rows.push({ plan: `${m[1]}K ${eod ? 'EOD' : 'Intraday'} Trail (${nofee ? 'No Activation Fee' : 'Standard'})`, size: +p.balance, price: Number(p.price), set: {
        target: p.passed - p.balance, drawdown: p.trailing_threshold, dd_type: eod ? 'trailing-eod' : 'trailing-intraday',
        daily_loss: p.dailyLossLimitAmount || null, min_days: p.trading_days_til_eligible ?? null, reset: null,
        contracts: `${p.contracts} minis / ${p.contracts * 10} micros`,
        activation: nofee ? 'none' : pa.price ? `$${pa.price} one-time PA activation` : null,
        consistency: `none (evaluation) / ${pa.consistency_rule_percentage ?? 50}% (PA)`,
        payout: `every ${pa.trading_days_til_eligible ?? 5} trading days, up to ${usd(p.maxpayout)} each, ${pa.max_payout_requests ?? 6} payouts per PA`,
        note: 'From the Apex product picker catalogue.', net: false,
      } })
    }
    if (rows.length < 16) throw new Error(`apex: ${rows.length} rows`)
    return Object.assign(rows, { complete: true })
  },
  // the account picker's own API (the cards render from it)
  async tpt() {
    const j = await json('https://takeprofittrader.com/accounts/api/subscriptions')
    const rows = []
    for (const it of j.result?.items ?? []) {
      const m = String(it.name).match(/^\$\s*(\d+)k$/i); if (!m || !it.price) continue
      rows.push({ plan: `${m[1]}K Test`, size: +it.balance, price: Number(it.price), site_price: it.discountPrice ?? undefined,
        set: { target: it.profitTarget, drawdown: it.eodTrailingDrawdown, daily_loss: it.dailyLossLimit || null } })
    }
    if (rows.length < 4) throw new Error(`tpt: ${rows.length} rows`)
    return Object.assign(rows, { complete: true })
  },
  // the checkout's public plan list (Growth; Select and its 50% consistency add-on); Lightning is not listed for Tradovate
  async tradeify() {
    const rows = []
    for (const t of ['growth', 'select']) {
      const j = await json(`https://app-f.tradeify.co/api/dashboard/plan-list?plan_type=${t}&broker_type=tradovate`)
      for (const p of j.data?.data ?? []) {
        const m = String(p.account_type).match(/^(Growth|Select) \$(\d+)k$/i); if (!m) continue
        const size = +m[2] * 1000, i = p.additional_info || {}
        const set = { target: +i.profit_target || null, drawdown: +i.max_loss_limit || null, reset: +i.reset_fee || null, daily_loss: +i.daily_loss_limit || null }
        rows.push({ plan: t === 'growth' ? 'Growth Evaluation' : `Select Evaluation (${i.consistency_percentage}% consistency)`, size, price: Number(p.price), set })
        const add = t === 'select' && (p.planaddon || []).find((a) => a.is_active)
        if (add) rows.push({ plan: 'Select Evaluation (50% consistency add-on)', size, price: Number(add.final_price) })
      }
    }
    if (rows.length < 10) throw new Error(`tradeify: ${rows.length} rows`)
    return rows
  },
  // "50K Standard Eval" / "$129/month" and "25K Direct Qualified" / "$349"
  async alpha() {
    const ls = await lines('https://alpha-futures.com/')
    const rows = []
    for (let i = 0; i < ls.length - 1; i++) {
      const m = ls[i].match(/^(\d{2,3})K (Standard|Zero|Advanced) Eval$/) || ls[i].match(/^(\d{2,3})K (Direct) Qualified$/)
      if (!m) continue
      const p = ls[i + 1].match(/^\$(\d+)(?:\/month)?$/); if (!p) continue
      rows.push({ plan: m[2] === 'Direct' ? `${m[1]}K Direct Qualified` : `${m[1]}K ${m[2]}`, size: +m[1] * 1000, price: +p[1] })
    }
    if (rows.length < 8) throw new Error(`alpha: ${rows.length} rows`)
    return rows
  },
  // embedded Sanity JSON: phases[].title ("Day Soft") -> programs[].cap (50) -> platforms[].oldCost (list; cost = current sale)
  async uprofit() {
    const html = await get('https://uprofit.com/day-programs')
    const rows = [], seen = new Set()
    const heads = [...html.matchAll(/"title":"\s*(Day Soft|Day Flex)"/g)]
    for (let i = 0; i < heads.length; i++) {
      const seg = html.slice(heads[i].index, heads[i + 1] ? heads[i + 1].index : heads[i].index + 20000)
      for (const pr of seg.matchAll(/"cap":(\d+)[\s\S]{0,300}?"cost":(\d+),"oldCost":(\d+)/g)) {
        const key = `${heads[i][1].trim()} ${pr[1]}K`; if (seen.has(key)) continue; seen.add(key)
        rows.push({ plan: key, size: +pr[1] * 1000, price: +pr[3], site_price: +pr[2] })
      }
    }
    if (rows.length < 4) throw new Error(`uprofit: ${rows.length} rows`)
    return rows
  },
  // checkout products API: challenge_type + variant account_size/price
  async blusky() {
    const groups = await json('https://blusky-f.tradetechsolutions.app/checkout/list/products_v2/')
    const NAME = { Launch: { 50000: 'Launch 50K', 100000: 'Launch+ 100K', 200000: 'Static Launch+ 200K' },
      PROPEL: { 25000: 'Propel Premium - Advanced 25K', 50000: 'Propel Premium 50K', 100000: 'Propel Premium+ 100K', 150000: 'Propel Static - Static Growth 150K', 200000: 'Propel Static - Static Growth+ 200K', 300000: 'Propel Static - Static Blu+ 300K' },
      ORBIT: { 50000: 'Orbit 50K', 100000: 'Orbit 100K', 150000: 'Orbit 150K', 200000: 'Orbit 200K' },
      'Instant Funded': { 50000: 'Instant Sim Funded 50K' }, 'Direct 2 Funded': { 3500: 'Direct 2 Funded ($3,500 sim-funded start)' } }
    const rows = []
    for (const g of groups) {
      const map = NAME[g.challenge_type]; if (!map) continue
      for (const p of g.products) {
        const v = p.variants?.[0]; if (!v) continue
        const size = kSize(String(v.account_size).replace(/K5$/, '.5K')); if (!size || !map[size]) continue
        rows.push({ plan: map[size], size, price: Number(v.price) })
      }
    }
    if (rows.length < 10) throw new Error(`blusky: ${rows.length} rows`)
    return rows
  },
  // homepage: "Aspire, $250" (LL Foundation monthly) and "LB Bundle Aspire" ... "$520"
  async leeloo() {
    const ls = await lines('https://www.leelootrading.com/')
    const SIZE = { Aspire: 25000, Launch: 50000, Climb: 100000, Cruise: 150000, Burst: 250000, Explode: 300000 }
    const rows = [], seen = new Set()
    for (let i = 0; i < ls.length; i++) {
      const a = ls[i].match(/^(Aspire|Launch|Climb|Cruise|Burst|Explode), \$(\d+)$/)
      if (a && !seen.has('LL' + a[1])) { seen.add('LL' + a[1]); rows.push({ plan: `LL Foundation - ${a[1]}`, size: SIZE[a[1]], price: +a[2] }); continue }
      const b = ls[i].match(/^LB Bundle (Aspire|Launch|Climb|Cruise|Burst|Explode)$/)
      if (b && !seen.has('LB' + b[1])) for (let j = i + 1; j < i + 8; j++) { const p = ls[j].match(/^\$(\d{3,4})$/); if (p) { seen.add('LB' + b[1]); rows.push({ plan: `LB Bundle ${b[1]} (3 accounts)`, size: SIZE[b[1]], price: +p[1] }); break } }
    }
    if (rows.length < 8) throw new Error(`leeloo: ${rows.length} rows`)
    return rows
  },
}
// pages that carry (some of) the prices as plain text but no structure worth parsing
const VERIFY = {
  fundednext: 'https://fundednext.com/futures', tradeday: 'https://www.tradeday.com/',
  bulenox: 'https://bulenox.com/accounts-pricing', earn2trade: 'https://www.earn2trade.com/gauntlet-mini', purdia: 'https://purdia.com/evaluation',
}
const MANUAL = {}   // Lucid lands here at runtime when its WAF turns away curl AND the browser

// ── the code each featured firm advertises on its own site today ──
// returns { code, pct, applies_to?, expires?, plans?(plan) -> discount override | undefined }; pct null = the site
// names the code but not the rate, so the sheet's rate stands when the code is unchanged; a throw = parse failure
const firstLine = (ls, rx) => { for (const l of ls) { const m = l.match(rx); if (m) return m } return null }
const CODES = {
  async apex() {
    const html = await get('https://apextraderfunding.com/')
    const cfg = html.indexOf('window.productPickerConfig'), prod = html.indexOf('[', html.indexOf('products:', cfg))
    const d = JSON.parse(balanced(html, html.indexOf('{', html.indexOf('promoData:', prod + balanced(html, prod).length))))
    if (!d || !d.active) return null
    return { code: String(d.title_code).replace(/COUPON|["“”]/gi, '').trim(), pct: Number(d.first_month_code), expires: (d.expiration || '').slice(0, 10) || null,
      applies_to: 'One-time evaluation fee on every size, Standard or No Activation Fee (Apex promo banner).' }
  },
  async mffu() {
    const m = firstLine(text(await get('https://myfundedfutures.com/')), /Save (\d{1,2})% On Any Plan With Code ([A-Z0-9]+)/i)
    if (!m) throw new Error('mffu: no banner code')
    return { code: m[2], pct: +m[1], applies_to: 'Evaluation fee on every plan (MFFU site banner); traders new to MFFU get 50% off their first evaluation instead.' }
  },
  async tradeify() {
    const j = await json('https://app-f.tradeify.co/api/dashboard/plan-list?plan_type=select&broker_type=tradovate')
    const p = (j.data?.data ?? []).find((x) => x.coupon_code)
    if (!p) return null
    return { code: p.coupon_code, pct: Number(p.coupon_discount_value), applies_to: 'Growth and Select evaluation fees (Tradeify checkout).',
      plans: (pl) => (pl.type === 'instant' ? false : undefined) }   // Lightning: the checkout does not say, so no code is applied
  },
  // banner: "ALPHA40 40% off Zero · ALPHA50 50% off Standard, Advanced & Direct"
  async alpha() {
    const parts = []
    for (const l of text(await get('https://alpha-futures.com/'))) for (const s of l.split('·')) {
      const m = s.trim().match(/^([A-Z0-9]{4,})\s+(\d{1,2})% off (.+)$/); if (m) parts.push({ code: m[1], pct: +m[2], scope: m[3] })
    }
    if (!parts.length) throw new Error('alpha: no banner codes')
    const main = parts.find((p) => /Standard/i.test(p.scope)) || parts.reduce((a, b) => (b.pct > a.pct ? b : a))
    return { code: main.code, pct: main.pct, applies_to: parts.map((p) => `${p.code} ${p.pct}% off ${p.scope}`).join('; ') + ' (Alpha site banner).',
      plans: (pl) => { const fam = (pl.plan.match(/Zero|Standard|Advanced|Direct/i) || [])[0]; const hit = fam && parts.find((p) => new RegExp(fam, 'i').test(p.scope)); return hit ? { code: hit.code, pct: hit.pct } : undefined } }
  },
  async tpt() {
    const ls = text(await get('https://takeprofittrader.com/'))
    const c = firstLine(ls, /Use Code:\s*([A-Z0-9]+)/i), p = firstLine(ls, /Get (\d{1,2})% Off/i)
    if (!c) throw new Error('tpt: no banner code')
    return { code: c[1], pct: p ? +p[1] : null }
  },
  async lucid() {
    const ls = text(await get('https://lucidtrading.com/'))
    const i = ls.findIndex((l) => /USE CODE\s*:?\s*$/i.test(l) || /USE CODE\s*:\s*[A-Z0-9]+/i.test(l))
    if (i < 0) throw new Error('lucid: no code line')
    const code = (ls[i].match(/USE CODE\s*:\s*([A-Z0-9]+)/i) || [])[1] || ls[i + 1]
    if (!/^[A-Z0-9]{3,}$/.test(code || '')) throw new Error(`lucid: odd code "${code}"`)
    return { code, pct: null }
  },
  async fundednext() {
    const html = await get('https://fundednext.com/futures')
    const c = html.match(/Copy promo code ([A-Z0-9]+)/), p = html.match(/>(\d{1,2})% OFF</)
    if (!c) throw new Error('fundednext: no promo code button')
    return { code: c[1], pct: p ? +p[1] : null }
  },
}

const data = JSON.parse(readFileSync(FILE, 'utf8'))
let changes = 0, failures = 0, stale = 0
const log = (s) => console.log(s)
for (const firm of data.firms) {
  if (!firm.active) continue
  if (PROBES[firm.slug]) {
    let rows
    try { rows = await PROBES[firm.slug]() } catch (e) {
      // Lucid's WAF lets a home connection through but 403s cloud runners: not a
      // parser failure, so the run stays green and the sheet says hand-checked.
      if (/-> 403|bot wall/.test(e.message)) { log(`blocked ${firm.slug}: ${e.message} (hand-check it)`); if (!DRY) firm.verify = 'manual'; continue }
      failures++; log(`FAIL ${firm.slug}: ${e.message}`); continue
    }
    let matched = 0
    for (const r of rows) {
      const plan = firm.plans.find((p) => p.plan === r.plan && p.size === r.size)
      if (!plan) { log(`note ${firm.slug}: "${r.plan}" ${r.size} $${r.price} is on the site but not in the sheet`); continue }
      matched++
      // a parse that lands on a fragment ($1 for a $153 plan) must not reach the sheet
      if (!(r.price >= 5) || (plan.price && (r.price / plan.price > 25 || plan.price / r.price > 25))) { failures++; log(`FAIL ${firm.slug} ${r.plan} ${r.size}: implausible $${r.price} (sheet $${plan.price}), skipped`); continue }
      if (plan.price !== r.price) { log(`${DRY ? 'would set' : 'set'} ${firm.slug} ${r.plan} ${r.size}: $${plan.price} -> $${r.price}`); if (!DRY) plan.price = r.price; changes++ }
      // rule fields the firm publishes beside the price (Apex, TPT, Tradeify)
      for (const [k, v] of Object.entries(r.set || {})) {
        if (JSON.stringify(plan[k] ?? null) === JSON.stringify(v ?? null)) continue
        if (k !== 'note') { log(`${DRY ? 'would set' : 'set'} ${firm.slug} ${r.plan} ${r.size} ${k}: ${JSON.stringify(plan[k] ?? null)} -> ${JSON.stringify(v)}`); changes++ }
        if (!DRY) plan[k] = v
      }
      if (!DRY) { plan.price_checked = today; delete plan.price_stale; if (r.site_price != null) plan.site_price = r.site_price }
    }
    // a row this probe used to confirm and no longer sees (MFFU Rapid EOD, 10/8/26) keeps its old price under a
    // "check" marker; rows a partial probe never covered (Lightning, LucidDaily 25K) have no price_checked and are left
    // alone, but a probe that reads the whole catalogue (complete) marks every row it does not list (MFFU's Builder add-on)
    const gone = firm.plans.filter((p) => p.price != null && (rows.complete || p.price_checked) && !rows.some((r) => r.plan === p.plan && r.size === p.size))
    for (const p of gone) { if (!DRY && !p.price_stale) p.price_stale = today; log(`note ${firm.slug}: "${p.plan}" ${p.size} is no longer on the site (marked check)`) }
    if (!DRY) firm.verify = 'auto'
    log(`ok ${firm.slug}: ${rows.length} official prices, ${matched} matched`)
  } else if (VERIFY[firm.slug]) {
    let ls
    try { ls = await lines(VERIFY[firm.slug]) } catch (e) { failures++; log(`FAIL ${firm.slug}: ${e.message}`); continue }
    const body = ls.join(' ')
    let found = 0, gone = []
    for (const p of firm.plans) {
      if (p.price == null) continue
      const hit = new RegExp('\\$\\s?' + String(p.price).replace('.', '\\.') + '(?![\\d])').test(body)
      if (hit) { found++; if (!DRY) { p.price_checked = today; delete p.price_stale } }
      else if (p.price_checked) { gone.push(`${p.plan} ${p.size} $${p.price}`); if (!DRY) p.price_stale = today }
    }
    stale += gone.length
    if (!DRY) firm.verify = 'presence'
    log(`ok ${firm.slug}: ${found}/${firm.plans.length} prices still on the page${gone.length ? `; GONE: ${gone.join(', ')}` : ''}`)
  } else if (MANUAL[firm.slug]) {
    if (!DRY) firm.verify = 'manual'
    log(`manual ${firm.slug}: ${MANUAL[firm.slug]}`)
  } else log(`skip ${firm.slug}: no probe`)
}
// codes second, so a firm's page is already in the cache
for (const firm of data.firms) {
  if (!firm.active || !CODES[firm.slug]) continue
  let c
  try { c = await CODES[firm.slug](firm) } catch (e) {
    if (/-> 403|bot wall/.test(e.message)) { log(`blocked code ${firm.slug}: ${e.message}`); continue }
    failures++; log(`FAIL code ${firm.slug}: ${e.message}`); continue
  }
  const old = firm.discount || {}
  if (!c) {
    if (old.code) { log(`${DRY ? 'would drop' : 'drop'} code ${firm.slug}: ${old.code} (no promo on the site)`); changes++ }
    if (!DRY) firm.discount = null
    continue
  }
  const pct = c.pct ?? (old.code === c.code ? old.pct : null)
  if (old.code !== c.code || old.pct !== pct) { log(`${DRY ? 'would set' : 'set'} code ${firm.slug}: ${old.code ?? '-'} ${old.pct ?? '-'}% -> ${c.code} ${pct ?? '?'}%`); changes++ }
  else log(`ok code ${firm.slug}: ${c.code} ${pct}%`)
  if (DRY) continue
  firm.discount = { code: c.code, pct, applies_to: c.applies_to ?? (old.code === c.code ? old.applies_to : null) ?? null,
    expires: c.expires ?? null, source: 'firm site', checked: today }
  if (c.plans) for (const p of firm.plans) { const o = c.plans(p); if (o === undefined) delete p.discount; else p.discount = o }
}
if (browserP) { const ctx = await browserP; await ctx?.browser()?.close() }
// the checked stamp moves every run so the sheet says today; refreshed moves only when a price did
if (!DRY) { data.checked = today; if (changes || stale) data.refreshed = today; writeFileSync(FILE, JSON.stringify(data, null, 1) + String.fromCharCode(10)) }
log(`${changes} change(s), ${stale} stale, ${failures} probe failure(s)${DRY ? ' (dry run)' : ''}`)
process.exit(failures || stale ? 2 : 0)
