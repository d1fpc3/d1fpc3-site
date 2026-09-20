#!/usr/bin/env node
// Score the daily memecoin catalyst digest against what the coins it named
// actually did. Reads memecoin_posts, parses every ticker out of every
// section, prices each call from CoinGecko, and mails a scorecard.
//
//   node scripts/memecoin-track.mjs            full run, writes and mails
//   node scripts/memecoin-track.mjs --dry      parse and report, no writes
//   node scripts/memecoin-track.mjs --no-email writes, skips the mail
//
// Spec: docs/superpowers/specs/2026-09-19-memecoin-scorecard-design.md
//
// The whole run is a full recompute from all posts, not an incremental pass.
// There are only a few hundred calls, dedup is deterministic, and every write
// is an upsert, so running it twice changes nothing and a missed day heals
// itself on the next run.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parsePost } from './lib/memecoin-parse.mjs'

const REF = 'cqdignbleethroyxxvzr'
const SB = `https://${REF}.supabase.co`
const CG = 'https://api.coingecko.com/api/v3'
const DRY = process.argv.includes('--dry')
const NO_EMAIL = process.argv.includes('--no-email') || DRY
const MAIL_TO = process.env.MEMECOIN_MAIL_TO || 'frankiepc3@gmail.com'
const MAIL_FROM = process.env.MEMECOIN_SMTP_USER || 'd1@seenrank.com'

// Tickers the digest uses that are ambiguous or unsearchable on CoinGecko.
// Ids match the ones the admin market strip already uses, so the two surfaces
// cannot disagree about which coin "TRUMP" means.
const SEED = {
  DOGE: 'dogecoin', SHIB: 'shiba-inu', PEPE: 'pepe', WIF: 'dogwifcoin',
  BONK: 'bonk', FARTCOIN: 'fartcoin', PENGU: 'pudgy-penguins', PUMP: 'pump-fun',
  SPX6900: 'spx6900', SPX: 'spx6900', TRUMP: 'official-trump', MELANIA: 'melania-meme',
  POPCAT: 'popcat', FLOKI: 'floki', M: 'memecore', BARD: 'lombard',
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (msg) => { console.error('FAIL ' + msg); process.exit(1) }

// ── supabase ────────────────────────────────────────────────────────────────
// CI hands us a service role key. Locally we borrow the Supabase CLI's
// management token and reveal the key, the same way nq-backfill.mjs does.
async function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const tokenFile = join(homedir(), '.supabase', 'access-token')
  const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')
  if (!mgmt) fail('no SUPABASE_SERVICE_ROLE_KEY and no Supabase access token')
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })
  if (!r.ok) fail(`management api ${r.status} revealing keys`)
  const keys = await r.json()
  const k = keys.find((x) => x.name === 'service_role')
  if (!k) fail('service_role key not returned by the management api')
  return k.api_key
}

let KEY = ''
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
  if (body) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  if (!r.ok) fail(`${method} ${path} -> ${r.status} ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : null
}

// ── coingecko ───────────────────────────────────────────────────────────────
// The keyless public API rate limits hard and unpredictably, so this run has a
// call budget. When the budget or the limiter is hit we stop fetching, write
// what we have and say what is still missing; the next run picks up the gap,
// because the database is the cache. A free Demo key (COINGECKO_API_KEY)
// raises the ceiling to 30/min and makes the first backfill finish in one go.
const CG_KEY = process.env.COINGECKO_API_KEY || ''
const CG_GAP = Number(process.env.COINGECKO_GAP_MS || (CG_KEY ? 2200 : 7000))
const CG_BUDGET = Number(process.env.COINGECKO_BUDGET || (CG_KEY ? 200 : 40))
let cgCalls = 0, lastCall = 0, cgLimited = false

class Budget extends Error {}

async function cg(path, tries = 3) {
  if (cgCalls >= CG_BUDGET) { cgLimited = true; throw new Budget(`coingecko budget of ${CG_BUDGET} calls used`) }
  for (let i = 0; i < tries; i++) {
    const gap = Date.now() - lastCall
    if (gap < CG_GAP) await sleep(CG_GAP - gap)
    lastCall = Date.now()
    cgCalls++
    const headers = { accept: 'application/json' }
    if (CG_KEY) headers['x-cg-demo-api-key'] = CG_KEY
    const r = await fetch(`${CG}${path}`, { headers })
    if (r.status === 429) { await sleep(15000 * (i + 1)); continue }
    if (!r.ok) throw new Error(`coingecko ${path} -> ${r.status}`)
    return r.json()
  }
  cgLimited = true
  throw new Budget(`coingecko rate limited on ${path}`)
}

// ── ticker resolution ───────────────────────────────────────────────────────
// A wrong match is the worst failure this system has: it produces confident
// numbers about the wrong coin. So an ambiguous ticker resolves to the largest
// coin by market cap only if it clears $1M, and anything still unclear is
// stored as unresolved and shown in the report rather than priced.
// /coins/list is a 5MB payload and gives no market caps, so the top-1000 by
// market cap costs four calls instead and answers "which coin is this symbol"
// and "is it big enough to be the one meant" at the same time. Anything the
// digest names that is not in the top 1000 is small enough that guessing would
// be the dangerous move.
async function resolveTickers(tickers, existing) {
  const out = new Map(existing.filter((r) => r.confidence !== 'unresolved').map((r) => [r.ticker, r]))
  for (const [ticker, coin_id] of Object.entries(SEED)) {
    if (tickers.includes(ticker) && !out.has(ticker)) out.set(ticker, { ticker, coin_id, confidence: 'high', note: 'seeded' })
  }
  const todo = tickers.filter((t) => !out.has(t))
  if (!todo.length) return out

  const bySymbol = new Map()
  let complete = true
  try {
    for (let page = 1; page <= 4; page++) {
      const rows = await cg(`/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`)
      if (!Array.isArray(rows) || !rows.length) break
      for (const c of rows) {
        const s = String(c.symbol || '').toUpperCase()
        if (!bySymbol.has(s)) bySymbol.set(s, [])
        bySymbol.get(s).push({ id: c.id, cap: c.market_cap || 0 })
      }
    }
  } catch (e) {
    if (!(e instanceof Budget)) throw e
    complete = false
    console.log(`  resolution incomplete: ${e.message}`)
  }

  const pending = []
  for (const t of todo) {
    const hits = (bySymbol.get(t) || []).filter((h) => h.cap > 1e6).sort((a, b) => b.cap - a.cap)
    if (hits.length === 1) {
      out.set(t, { ticker: t, coin_id: hits[0].id, confidence: 'high', note: 'unique symbol in the top 1000' })
    } else if (hits.length > 1) {
      // several live coins share the symbol: take the largest, but flag it so
      // the dashboard shows CHECK rather than presenting a guess as a fact
      out.set(t, { ticker: t, coin_id: hits[0].id, confidence: 'low', note: `${hits.length} symbol matches, took ${hits[0].id} at $${Math.round(hits[0].cap / 1e6)}M` })
    } else if (complete) {
      out.set(t, { ticker: t, coin_id: null, confidence: 'unresolved', note: 'not in the top 1000 by market cap' })
    } else {
      // We never loaded the full list, so "no match" here means "not checked".
      // Calling it unresolved would drop real tickers and cache a lie, so the
      // ticker is held back and the next run decides.
      pending.push(t)
    }
  }
  return { map: out, complete, pending }
}

// ── prices ──────────────────────────────────────────────────────────────────
// Coinbase Exchange is the primary history source: free, no key, US reachable
// and effectively unthrottled for our volume, and it carries most of the
// liquid names the digest talks about. CoinGecko is the fallback for the long
// tail, under the call budget. Binance was the obvious first choice and is
// unusable here: it answers 451 to US addresses, including Actions runners.
// A coin is priced from one venue only, recorded in memecoin_prices.src, so a
// series is never stitched together from two conventions.
async function coinbaseSeries(ticker, fromMs) {
  if (!ticker) return null
  const gran = 21600 // 6h candles; 300 of them is 75 days, more than we need
  const start = new Date(Math.max(fromMs, Date.now() - 295 * gran * 1000)).toISOString()
  const end = new Date().toISOString()
  const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(ticker)}-USD/candles?granularity=${gran}&start=${start}&end=${end}`
  const r = await fetch(url, { headers: { 'User-Agent': 'd1-memecoin-tracker', accept: 'application/json' } })
  if (r.status === 404) return null // not listed on Coinbase
  if (!r.ok) return null
  const rows = await r.json()
  if (!Array.isArray(rows) || !rows.length) return null
  // [ time, low, high, open, close, volume ], time in seconds
  return rows.map((k) => [k[0] * 1000, k[4]]).filter((p) => p[1] > 0).sort((a, b) => a[0] - b[0])
}

async function priceSeries(coinId, fromMs) {
  const from = Math.floor(Math.max(fromMs, Date.now() - 95 * 864e5) / 1000)
  const to = Math.floor(Date.now() / 1000)
  if (to - from < 3600) return []
  const j = await cg(`/coins/${coinId}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`)
  const pts = Array.isArray(j?.prices) ? j.prices : []
  // cap the row count on long windows; the 36h mark tolerance means 6-hourly
  // is plenty of resolution for every horizon we score
  if (pts.length <= 1200) return pts
  const step = Math.ceil(pts.length / 1200)
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1)
}

// ── report helpers ──────────────────────────────────────────────────────────
const pct = (v) => v == null ? '  --  ' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`.padStart(7)
const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n)

function hitRates(rows, horizon) {
  const by = new Map()
  for (const r of rows) {
    const v = r[horizon]
    if (v == null) continue
    if (!by.has(r.section)) by.set(r.section, [])
    by.get(r.section).push(v)
  }
  return [...by.entries()].map(([section, vals]) => ({
    section,
    n: vals.length,
    up: vals.filter((v) => v > 0).length,
    rate: (vals.filter((v) => v > 0).length / vals.length) * 100,
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    median: vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)],
  })).sort((a, b) => b.n - a.n)
}

function buildReport(rows, unresolved) {
  const today = new Date().toISOString().slice(0, 10)
  const L = []
  L.push(`SCORECARD - ${today}`)
  L.push('')
  L.push('Scored on the digest\'s own rule: announcement is the entry, event is the exit.')
  L.push('No direction is inferred, so "up" means the price rose, not that the call was')
  L.push('bullish. Read the sign yourself.')
  L.push('')

  for (const horizon of ['ret_1d', 'ret_7d', 'ret_30d', 'ret_event']) {
    const label = horizon === 'ret_event' ? 'the event date' : horizon.replace('ret_', '')
    const hr = hitRates(rows, horizon)
    if (!hr.length) continue
    L.push(`UP AT ${label.toUpperCase()} (by section):`)
    for (const h of hr) {
      L.push(`  ${pad(h.section, 17)} ${String(Math.round(h.rate)).padStart(3)}% up   n=${String(h.n).padStart(3)}   avg ${pct(h.avg)}   median ${pct(h.median)}`)
    }
    L.push('')
  }

  const scored = rows.filter((r) => r.ticker && r.entry_usd != null)
  const recent = scored.slice().sort((a, b) => new Date(b.entry_at) - new Date(a.entry_at)).slice(0, 25)
  L.push('MOST RECENT CALLS (entry date, ticker, section, 1d / 7d / 30d / to event):')
  for (const r of recent) {
    L.push(`  ${r.entry_at.slice(0, 10)}  ${pad(r.ticker, 9)} ${pad(r.section, 16)} ${pct(r.ret_1d)} ${pct(r.ret_7d)} ${pct(r.ret_30d)} ${pct(r.ret_event)}  ${pad(r.catalyst, 46)}`)
  }
  L.push('')

  // the digest's own rule, reported on its own terms
  const ev = rows.filter((r) => r.ret_event != null)
  if (ev.length) {
    const evUp = ev.filter((r) => r.ret_event > 0).length
    const evAvg = ev.reduce((a, b) => a + b.ret_event, 0) / ev.length
    L.push(`ANNOUNCEMENT TO EVENT: ${ev.length} calls reached their event date, ${Math.round((evUp / ev.length) * 100)}% rose, average ${pct(evAvg).trim()}.`)
    L.push('')
  }

  const best = scored.filter((r) => r.ret_7d != null).sort((a, b) => b.ret_7d - a.ret_7d)
  if (best.length >= 2) {
    L.push('BEST AND WORST AT 7D:')
    for (const r of best.slice(0, 3)) L.push(`  ${pct(r.ret_7d)}  ${pad(r.ticker, 9)} ${r.entry_at.slice(0, 10)}  ${pad(r.catalyst, 60)}`)
    for (const r of best.slice(-3).reverse()) L.push(`  ${pct(r.ret_7d)}  ${pad(r.ticker, 9)} ${r.entry_at.slice(0, 10)}  ${pad(r.catalyst, 60)}`)
    L.push('')
  }

  if (unresolved.length) {
    L.push(`UNPRICED TICKERS (${unresolved.length}): ${unresolved.map((u) => u.ticker).join(', ')}`)
    L.push('  These are counted but not scored. Pin them in memecoin_ticker_map to fix.')
    L.push('')
  }

  const n7 = rows.filter((r) => r.ret_7d != null).length
  L.push(`${rows.length} calls tracked, ${n7} with a 7d mark. That is a thin sample; it is a`)
  L.push('running tally, not a verdict.')
  return L.join('\n')
}

// ── mail ────────────────────────────────────────────────────────────────────
async function mail(subject, text) {
  const user = process.env.MEMECOIN_SMTP_USER
  const pass = process.env.MEMECOIN_SMTP_PASS
  if (!user || !pass) { console.log('no SMTP creds, skipping the email'); return false }
  let nodemailer
  try { nodemailer = (await import('nodemailer')).default } catch { console.log('nodemailer not installed, skipping the email'); return false }
  const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
  await t.sendMail({ from: MAIL_FROM, to: MAIL_TO, subject, text })
  return true
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  KEY = await serviceKey()

  const posts = await rest('memecoin_posts?select=id,created_at,kind,title,body&kind=in.(digest,alert)&order=created_at.asc')
  if (!posts.length) fail('no digest or alert posts found')

  // parse everything, then collapse restatements onto one call each
  const parsed = posts.flatMap(parsePost)
  const groups = new Map()
  for (const c of parsed) {
    const key = `${c.ticker ?? ''}|${c.section}|${c.fingerprint}`
    const g = groups.get(key)
    if (!g) groups.set(key, { ...c, seen_count: 1, first_seen_at: c.post_at, last_seen_at: c.post_at })
    else {
      g.seen_count += 1
      if (c.post_at < g.first_seen_at) { g.first_seen_at = c.post_at; g.entry_at = c.post_at; g.post_id = c.post_id; g.post_at = c.post_at; g.catalyst = c.catalyst; g.source = c.source }
      if (c.post_at > g.last_seen_at) g.last_seen_at = c.post_at
    }
  }
  const calls = [...groups.values()]
  const withTicker = calls.filter((c) => c.ticker)
  console.log(`${posts.length} posts -> ${parsed.length} raw items -> ${calls.length} calls after dedup (${withTicker.length} tickered, ${calls.length - withTicker.length} broad-market)`)

  const tickers = [...new Set(withTicker.map((c) => c.ticker))].sort()
  const existingMap = DRY ? [] : await rest('memecoin_ticker_map?select=ticker,coin_id,confidence,note')
  const { map: resolved, complete: resolutionComplete, pending: notChecked } = await resolveTickers(tickers, existingMap)
  const held = new Set(notChecked)

  for (const c of calls) {
    c.coin_id = c.ticker ? (resolved.get(c.ticker)?.coin_id ?? null) : null
    c.ticker_confidence = c.ticker ? (resolved.get(c.ticker)?.confidence ?? 'unresolved') : 'high'
  }

  // A word scraped out of prose that resolves to no coin was almost certainly
  // never a ticker ("ERC", "OG", "LONG"), so it is dropped rather than kept as
  // an unpriced call. A ticker the digest named explicitly and we still cannot
  // price is a genuine gap, so that one is kept and reported. Tickers we never
  // got to check are held back entirely so a rate limit cannot rewrite history.
  const kept = calls.filter((c) => !(c.ticker && held.has(c.ticker)) && !(c.ticker_rule === 'prose' && !c.coin_id))
  const droppedProse = calls.filter((c) => c.ticker_rule === 'prose' && !c.coin_id && !held.has(c.ticker)).length
  if (!resolutionComplete) console.log(`  holding back ${calls.length - kept.length - droppedProse} calls on ${held.size} unchecked tickers until a run finishes resolution`)
  calls.length = 0
  calls.push(...kept)

  const live = new Set(calls.filter((c) => c.ticker).map((c) => c.ticker))
  const unresolved = [...resolved.values()].filter((r) => !r.coin_id && live.has(r.ticker))
  const low = [...resolved.values()].filter((r) => r.coin_id && r.confidence === 'low' && live.has(r.ticker))
  console.log(`tickers: ${live.size} kept, ${live.size - unresolved.length} priceable, ${unresolved.length} unresolved, ${low.length} low confidence, ${droppedProse} prose guesses dropped`)
  if (unresolved.length) console.log('  unresolved: ' + unresolved.map((u) => `${u.ticker} (${u.note})`).join(', '))
  if (low.length) console.log('  low: ' + low.map((u) => `${u.ticker} -> ${u.coin_id}`).join(', '))

  // coin_id -> { earliest call, ticker } (the ticker is what Coinbase keys on)
  const coins = new Map()
  for (const c of calls) {
    if (!c.coin_id) continue
    const t = new Date(c.entry_at).getTime()
    const prev = coins.get(c.coin_id)
    if (!prev) coins.set(c.coin_id, { earliest: t, ticker: c.ticker })
    else if (t < prev.earliest) prev.earliest = t
  }

  if (DRY) {
    const bySection = new Map()
    for (const c of calls) bySection.set(c.section, (bySection.get(c.section) ?? 0) + 1)
    console.log('\nby section: ' + [...bySection].map(([s, n]) => `${s}=${n}`).join('  '))
    const byRule = new Map()
    for (const c of parsed) byRule.set(c.ticker_rule, (byRule.get(c.ticker_rule) ?? 0) + 1)
    console.log('by ticker rule: ' + [...byRule].map(([s, n]) => `${s}=${n}`).join('  '))
    console.log('\nDRY: nothing written')
    return
  }

  // ── writes ────────────────────────────────────────────────────────────────
  const mapRows = [...resolved.values()].map((r) => ({ ticker: r.ticker, coin_id: r.coin_id, confidence: r.confidence, note: r.note, updated_at: new Date().toISOString() }))
  if (mapRows.length) await rest('memecoin_ticker_map?on_conflict=ticker', { method: 'POST', body: mapRows, prefer: 'resolution=merge-duplicates,return=minimal' })

  // entry_usd is deliberately absent from the payload: PostgREST only writes
  // the columns it is given, so an already-priced call keeps its entry price
  // instead of being reset to null on every run.
  const callRows = calls.map((c) => ({
    post_id: c.post_id, post_at: c.post_at, section: c.section, ticker: c.ticker,
    coin_id: c.coin_id, ticker_confidence: c.ticker_confidence, catalyst: c.catalyst,
    fingerprint: c.fingerprint, event_date: c.event_date, source: c.source,
    ticker_rule: c.ticker_rule, entry_at: c.entry_at,
    first_seen_at: c.first_seen_at, last_seen_at: c.last_seen_at, seen_count: c.seen_count,
  }))
  for (let i = 0; i < callRows.length; i += 500) {
    await rest('memecoin_calls?on_conflict=ticker,section,fingerprint', { method: 'POST', body: callRows.slice(i, i + 500), prefer: 'resolution=merge-duplicates,return=minimal' })
  }
  console.log(`wrote ${callRows.length} calls`)

  // Drop calls the current parse no longer produces, so a parser fix actually
  // removes what it was fixing instead of leaving it behind forever. Only safe
  // when resolution finished: otherwise the held-back tickers would look like
  // calls that had disappeared.
  if (resolutionComplete) {
    const existing = await rest('memecoin_calls?select=id,ticker,section,fingerprint')
    const live = new Set(calls.map((c) => `${c.ticker ?? ''}|${c.section}|${c.fingerprint}`))
    const stale = existing.filter((r) => !live.has(`${r.ticker ?? ''}|${r.section}|${r.fingerprint}`))
    for (let i = 0; i < stale.length; i += 100) {
      const ids = stale.slice(i, i + 100).map((r) => r.id).join(',')
      await rest(`memecoin_calls?id=in.(${ids})`, { method: 'DELETE', prefer: 'return=minimal' })
    }
    if (stale.length) console.log(`removed ${stale.length} calls the parser no longer produces`)
  }

  // ── prices ────────────────────────────────────────────────────────────────
  // Written per coin, not at the end: a run cut short by a rate limit or a
  // timeout keeps everything it already fetched, and the next run resumes from
  // the gap instead of starting over.
  const writePoints = async (rows) => {
    for (let i = 0; i < rows.length; i += 1000) {
      await rest('memecoin_prices?on_conflict=coin_id,ts', { method: 'POST', body: rows.slice(i, i + 1000), prefer: 'resolution=merge-duplicates,return=minimal' })
    }
  }

  const coverage = (await rest('rpc/memecoin_price_coverage', { method: 'POST', body: {} })) || []
  const have = new Map(coverage.map((r) => [r.coin_id, r]))
  const needCg = []
  let written = 0, fromCb = 0
  for (const [coinId, info] of coins) {
    const want = info.earliest - 2 * 864e5
    const cov = have.get(coinId)
    let from = want
    if (cov && new Date(cov.min_ts).getTime() <= want + 36 * 3600e3) {
      from = new Date(cov.max_ts).getTime()
      if (Date.now() - from < 6 * 3600e3) continue // already current
    }
    let pts = null
    try { pts = await coinbaseSeries(info.ticker, from) } catch { pts = null }
    if (pts && pts.length) {
      await writePoints(pts.map(([ms, usd]) => ({ coin_id: coinId, ts: new Date(ms).toISOString(), usd, src: 'coinbase' })))
      written += pts.length
      fromCb++
    } else {
      needCg.push([coinId, from])
    }
  }
  console.log(`coinbase: ${fromCb} coins, ${written} points; ${needCg.length} coins need coingecko`)

  const pending = []
  let fromCg = 0
  if (needCg.length) {
    try {
      const spot = await cg(`/simple/price?ids=${needCg.map(([id]) => id).join(',')}&vs_currencies=usd`)
      const ts = new Date().toISOString()
      const rows = Object.entries(spot || {}).filter(([, v]) => v?.usd != null).map(([id, v]) => ({ coin_id: id, ts, usd: v.usd, src: 'coingecko' }))
      if (rows.length) { await writePoints(rows); written += rows.length }
    } catch (e) { if (!(e instanceof Budget)) throw e }
    for (const [coinId, from] of needCg) {
      try {
        const pts = await priceSeries(coinId, from)
        if (pts.length) {
          await writePoints(pts.map(([ms, usd]) => ({ coin_id: coinId, ts: new Date(ms).toISOString(), usd, src: 'coingecko' })))
          written += pts.length
          fromCg++
        }
      } catch (e) {
        if (!(e instanceof Budget)) throw e
        pending.push(coinId)
      }
    }
  }
  console.log(`wrote ${written} price points (${fromCb} from coinbase, ${fromCg} from coingecko, ${cgCalls} coingecko calls)`)
  if (pending.length) console.log(`  ${pending.length} coins still need history, next run will pick them up: ${pending.slice(0, 12).join(', ')}`)

  const filled = await rest('rpc/memecoin_set_entry_prices', { method: 'POST', body: {} })
  console.log(`entry prices filled: ${filled}`)

  // ── report ────────────────────────────────────────────────────────────────
  const rows = await rest('memecoin_scorecard?select=*&order=entry_at.desc')
  const report = buildReport(rows, unresolved)
  console.log('\n' + report)

  if (!NO_EMAIL) {
    const subject = `Scorecard - ${new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' })}`
    const sent = await mail(subject, report)
    console.log(sent ? `emailed ${MAIL_TO}` : 'email not sent')
  }
}

main().catch((e) => fail(e.stack || e.message))
