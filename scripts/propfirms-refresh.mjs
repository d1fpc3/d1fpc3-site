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
//   MANUAL   Cloudflare turns scripts away (Apex, Tradeify): left to hand
//            checks, said so in the sheet footer.
// Discount codes are never touched here (the prop-deals bot owns codes).
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FILE = join(here, '..', 'echelon', 'propfirms', 'propfirms.json')
const DRY = process.argv.includes('--dry')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const today = new Date().toISOString().slice(0, 10)

// curl, not fetch: a couple of WAFs (Lucid's) 403 node's TLS fingerprint but let curl through
async function get(url, accept = 'text/html,*/*') {
  const out = execFileSync('curl', ['-sL', '--max-time', '60', '-A', UA, '-H', `Accept: ${accept}`, '-w', String.fromCharCode(10) + '@@%{http_code}', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const at = out.lastIndexOf(String.fromCharCode(10) + '@@'), status = Number(out.slice(at + 3)), body = out.slice(0, at)
  if (status < 200 || status >= 300) throw new Error(`${url} -> ${status}`)
  if (/<title>Just a moment|Performing security verification/i.test(body)) throw new Error(`${url} -> bot wall`)
  return body
}
const json = async (url) => JSON.parse(await get(url, 'application/json,*/*'))
// page text: tags become line breaks, entities decoded, one line per text node
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '-').replace(/&#36;/g, '$')
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
const lines = async (url) => text(await get(url))
const money = (s) => { const m = String(s).replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null }
const kSize = (s) => { const m = String(s).replace(/,/g, '').match(/\b(\d{1,3})(?:\.(\d))?\s*K\b/i) || String(s).match(/\$?\b(\d{2,3})000\b/); return m ? (m[2] ? Number(m[1] + '.' + m[2]) * 1000 : Number(m[1]) * (String(s).includes('000') && !/K/i.test(s) ? 1000 : 1000)) : null }

const PROBES = {
  // schema.org offers on the four plan pages; Builder 50K offer = the default ($2K max loss) row
  async mffu() {
    const rows = []
    for (const [path, plan] of Object.entries({ rapid: 'Rapid', pro: 'Pro', builder: 'Builder', 'rapid-eod': 'Rapid EOD' })) {
      const html = await get(`https://myfundedfutures.com/plans/${path}`)
      let n = 0
      for (const m of html.matchAll(/\{"@type":"Offer","name":"([^"]+Account)","price":"([\d.]+)"/g)) {
        const size = kSize(m[1].replace(/.*Plan\s*/i, '').replace(/,000/, 'K')); if (!size) continue
        rows.push({ plan: plan === 'Builder' && size === 50000 ? 'Builder 50K (Default, $2K max loss)' : plan, size, price: Number(m[2]) }); n++
      }
      if (!n) throw new Error(`mffu ${path}: no offers`)
    }
    return rows
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
  fundednext: 'https://fundednext.com/futures', tradeday: 'https://www.tradeday.com/', tpt: 'https://takeprofittrader.com/',
  bulenox: 'https://bulenox.com/accounts-pricing', earn2trade: 'https://www.earn2trade.com/gauntlet-mini', purdia: 'https://purdia.com/evaluation',
}
const MANUAL = { apex: 'Cloudflare bot wall', tradeify: 'Cloudflare bot wall on the help center' }   // Lucid joins this list at runtime when its WAF 403s the runner

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
      if (/-> 403|bot wall/.test(e.message)) { log(`blocked ${firm.slug}: ${e.message} (marked hand-checked for this run)`); if (!DRY) firm.verify = 'manual'; continue }
      failures++; log(`FAIL ${firm.slug}: ${e.message}`); continue
    }
    let matched = 0
    for (const r of rows) {
      const plan = firm.plans.find((p) => p.plan === r.plan && p.size === r.size)
      if (!plan) { log(`note ${firm.slug}: "${r.plan}" ${r.size} $${r.price} is on the site but not in the sheet`); continue }
      matched++
      if (plan.price !== r.price) { log(`${DRY ? 'would set' : 'set'} ${firm.slug} ${r.plan} ${r.size}: $${plan.price} -> $${r.price}`); if (!DRY) plan.price = r.price; changes++ }
      if (!DRY) { plan.price_checked = today; delete plan.price_stale; if (r.site_price != null) plan.site_price = r.site_price }
    }
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
if (!DRY) { if (changes || stale) data.checked = today; data.refreshed = today; writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n') }
log(`${changes} change(s), ${stale} stale, ${failures} probe failure(s)${DRY ? ' (dry run)' : ''}`)
process.exit(failures || stale ? 2 : 0)
