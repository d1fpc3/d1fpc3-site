#!/usr/bin/env node
// Refresh prop-firm list prices in echelon/propfirms/propfirms.json from the
// firms' own pages, so the sheet cannot drift the way MFFU did (9/6/26).
//
//   node scripts/propfirms-refresh.mjs            report + write changes
//   node scripts/propfirms-refresh.mjs --dry      report only
//
// Each PROBE reads a firm's official plan pages and returns
// { plan, size, price } rows; rows are matched onto the data file by
// (slug, plan, size) and the list `price` is replaced when it differs.
// Discount codes are NOT touched here (the prop-deals bot owns codes).
// Prints one line per change and exits 0; exits 2 when a probe fails so the
// Action goes red and someone looks, instead of silently going stale.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FILE = join(here, '..', 'echelon', 'propfirms', 'propfirms.json')
const DRY = process.argv.includes('--dry')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function page(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.text()
}
// schema.org Offer rows embedded in a page: [{ name, price, sku }]
function offers(html) {
  const out = []
  for (const m of html.matchAll(/\{"@type":"Offer","name":"([^"]+)","price":"([\d.]+)"[^}]*?(?:"sku":"([^"]*)")?[^}]*\}/g)) out.push({ name: m[1], price: Number(m[2]), sku: m[3] || '' })
  return out
}
const sizeOf = (s) => { const m = String(s).replace(/,/g, '').match(/(\d{2,3})(?:,?000|K)\b/i) || String(s).match(/\b(\d{5,6})\b/); return m ? (m[1].length <= 3 ? Number(m[1]) * 1000 : Number(m[1])) : null }

const PROBES = {
  // My Funded Futures: every plan page carries schema.org offers with the
  // official one-time price per size (verified 9/6/26 against the page hero).
  async mffu() {
    const rows = []
    const pages = { rapid: 'Rapid', pro: 'Pro', builder: 'Builder', 'rapid-eod': 'Rapid EOD' }
    for (const [path, plan] of Object.entries(pages)) {
      const html = await page(`https://myfundedfutures.com/plans/${path}`)
      const os = offers(html).filter((o) => /Account/i.test(o.name))
      if (!os.length) throw new Error(`mffu ${path}: no offers found`)
      for (const o of os) {
        const size = sizeOf(o.name.replace(/.*Plan\s*/i, ''))
        if (!size) continue
        // Builder 50K has two variants in the sheet; the offer is the default ($2K max loss) one.
        const name = plan === 'Builder' && size === 50000 ? 'Builder 50K (Default, $2K max loss)' : plan
        rows.push({ plan: name, size, price: o.price })
      }
    }
    return rows
  },
}

const data = JSON.parse(readFileSync(FILE, 'utf8'))
const today = new Date().toISOString().slice(0, 10)
let changes = 0, failures = 0
for (const firm of data.firms) {
  const probe = PROBES[firm.slug]
  if (!probe) continue
  let rows
  try { rows = await probe() } catch (e) { failures++; console.log(`FAIL ${firm.slug}: ${e.message}`); continue }
  const seen = new Set()
  for (const r of rows) {
    const plan = firm.plans.find((p) => p.plan === r.plan && p.size === r.size)
    if (!plan) { console.log(`note ${firm.slug}: ${r.plan} ${r.size} $${r.price} is on the site but not in the sheet`); continue }
    seen.add(plan)
    if (plan.price !== r.price) {
      console.log(`${DRY ? 'would set' : 'set'} ${firm.slug} ${r.plan} ${r.size}: $${plan.price} -> $${r.price}`)
      if (!DRY) plan.price = r.price
      changes++
    }
    if (!DRY) plan.price_checked = today
  }
  console.log(`ok ${firm.slug}: ${rows.length} official prices, ${seen.size} matched`)
}
if (!DRY && changes) { data.checked = today; writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n') }
console.log(`${changes} change(s), ${failures} probe failure(s)${DRY ? ' (dry run)' : ''}`)
process.exit(failures ? 2 : 0)
