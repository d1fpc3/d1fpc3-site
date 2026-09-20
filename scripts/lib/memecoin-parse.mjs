// Parse a memecoin catalyst digest into scoreable calls.
//
// Pure and deterministic on purpose: no LLM in the loop, so it costs nothing
// to run and every rule is testable against the real posts in memecoin_posts.
// Spec: docs/superpowers/specs/2026-09-19-memecoin-scorecard-design.md
import { createHash } from 'node:crypto'

export const SECTIONS = ['UPCOMING (DATED)', 'JUST ANNOUNCED', 'META', 'BLUE CHIPS', 'RISK']

// The section name can carry a parenthetical qualifier before the colon, as on
// 2026-08-31: "JUST ANNOUNCED (most recent verified, not all within 24h):".
// Missing that swallowed the whole section into the one above it.
const HEAD_RE = /^(UPCOMING \(DATED\)|JUST ANNOUNCED|META|BLUE CHIPS|RISK)\s*(?:\([^)]*\))?\s*:\s*(.*)$/
const FOOTER_RE = /^Patterns, not promises/i
const EMPTY_RE = /^(nothing\b|no blue chip\b|no dated catalyst\b|none\b)/i

// Uppercase tokens that show up in this prose and are not tickers. CoinGecko
// happily matches most of them to some dead coin, which is exactly how a
// scraper starts producing confident garbage.
export const STOPWORDS = new Set([
  'ET', 'EST', 'EDT', 'UTC', 'KST', 'CET', 'PT', 'AM', 'PM',
  'SEC', 'CFTC', 'DOJ', 'FBI', 'IRS', 'FCA', 'ETF', 'ETFS', 'ETP', 'AUM',
  'DAO', 'CEO', 'CTO', 'CFO', 'COO', 'KOL', 'KOLS', 'NFT', 'NFTS',
  'NYSE', 'NASDAQ', 'FOMC', 'GDP', 'CPI', 'TGE', 'ICO', 'IPO', 'LP', 'LPS',
  'AMM', 'DEX', 'CEX', 'DEXS', 'CEXS', 'OTC', 'PERP', 'PERPS', 'FDMC', 'ATH', 'ATL',
  'KRW', 'USD', 'EUR', 'JPY', 'GBP', 'CNY',
  'US', 'USA', 'UK', 'EU', 'CA', 'NY', 'DC',
  'AI', 'API', 'APR', 'APY', 'TVL', 'PNL', 'ROI', 'RSI', 'MA', 'EMA',
  'A', 'I', 'THE', 'AND', 'OR', 'ON', 'IN', 'AT', 'TO', 'OF', 'BY', 'IT',
  'Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'RICO', 'CRA', 'CLARITY', 'GENIUS', 'PARITY',
  'HIP', 'BOOST', 'MELT', 'SOURCE', 'NOTE', 'RISK', 'META',
])

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }

// -- sections ---------------------------------------------------------------
// Headers can carry their first line of content inline ("META: Solana meme
// coins are leading..."), and some posts repeat the subject as a title line
// before the first header, which is dropped.
export function splitSections(body) {
  const out = []
  let cur = null
  for (const raw of String(body || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (FOOTER_RE.test(line)) break
    const head = line.match(HEAD_RE)
    if (head) {
      cur = { section: head[1], lines: [] }
      out.push(cur)
      if (head[2].trim()) cur.lines.push(head[2].trim())
      continue
    }
    if (cur) cur.lines.push(line)
  }
  return out
}

// -- dates ------------------------------------------------------------------
// Digests write dates six ways: "Oct 14, 2026", "Sep 17", "2026-09-15",
// "Sep 1-30 (ongoing)", "Sep 28 to Oct 2", "Aug 26, ~21:00 UTC". Take the
// first one and, when the year is implied, pick the one nearest the post.
export function parseDate(text, postAt) {
  if (!text) return null
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3]
  const m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:\s*,\s*(\d{4}))?/i)
  if (!m) return null
  const month = MONTHS[m[1].toLowerCase()]
  const day = Number(m[2])
  if (day < 1 || day > 31) return null
  const post = postAt ? new Date(postAt) : new Date()
  let year = m[3] ? Number(m[3]) : post.getUTCFullYear()
  if (!m[3]) {
    // implied year: a month far behind the post has rolled over (Dec -> Jan)
    const naive = Date.UTC(year, month, day)
    if (naive - post.getTime() < -150 * 864e5) year += 1
    else if (naive - post.getTime() > 250 * 864e5) year -= 1
  }
  const d = new Date(Date.UTC(year, month, day))
  if (d.getUTCMonth() !== month || d.getUTCDate() !== day) return null
  return d.toISOString().slice(0, 10)
}

// -- tickers ----------------------------------------------------------------
const stripParens = (s) => s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
const TICKER_LIST_RE = /^[A-Z][A-Z0-9]{0,9}(\s*,\s*[A-Z][A-Z0-9]{0,9})*$/

function asTickerList(segment) {
  const s = stripParens(segment).replace(/\s+and\s+/gi, ', ').replace(/\.$/, '').trim()
  if (!s || !TICKER_LIST_RE.test(s)) return null
  const list = s.split(',').map((t) => t.trim()).filter(Boolean)
  if (!list.length || list.length > 12) return null
  return list
}

// Ordered rules, first match wins. The explicit trailing segment is
// authoritative: on 2026-08-30 the prose says "Coinbase adds PENGU, POPCAT and
// MORPHO" while the segment says "PENGU, POPCAT", and the segment is the
// author's intent. Never let prose override it.
export function extractTickers(line, section) {
  const body = line.replace(/^[-*•]\s*/, '').trim()

  if (section === 'META') {
    const out = []
    const lead = body.match(/\bLeader:\s*([A-Z][A-Z0-9]{0,9})/)
    if (lead) out.push(lead[1])
    const deriv = body.match(/\bDerivatives?:\s*([^.]+)/)
    if (deriv) {
      const l = asTickerList(deriv[1])
      if (l) out.push(...l)
    }
    if (out.length) return { tickers: [...new Set(out)], rule: 'meta' }
  }

  // "- TRUMP: largest September Solana unlock hit the market Sep 18"
  const bullet = body.match(/^([A-Z][A-Z0-9]{0,9})\s*:\s*\S/)
  if (bullet && !STOPWORDS.has(bullet[1])) return { tickers: [bullet[1]], rule: 'bullet' }

  // "... roadmap - PENGU, POPCAT - theblock.co"
  const parts = body.split(/\s+-\s+/)
  if (parts.length >= 3) {
    const list = asTickerList(parts[parts.length - 2])
    if (list) return { tickers: list, rule: 'segment' }
  }

  // "... last trading day on NYSE. DOGE. (theblock.co)"
  const sentence = body.match(/(?:^|[.\s])([A-Z][A-Z0-9]{1,9}(?:\s*,\s*[A-Z][A-Z0-9]{1,9})*)\.\s*(?:\(|Source:|$)/)
  if (sentence) {
    const list = asTickerList(sentence[1])
    if (list && list.some((t) => !STOPWORDS.has(t))) {
      return { tickers: list.filter((t) => !STOPWORDS.has(t)), rule: 'sentence' }
    }
  }

  return { tickers: [], rule: 'none' }
}

// Candidates for the low-confidence pass. Resolution and the market-cap floor
// happen in the tracker, which has the CoinGecko symbol list; anything that
// survives is tagged 'low' and shown for review rather than trusted.
export function proseCandidates(line) {
  const body = line
    .replace(/\([^)]*\)/g, ' ')
    // Quote currencies are not the subject of the sentence. "Upbit will open
    // BTC and USDT markets for ETHFI, RESOLV, INIT and SPK" is a call on the
    // four tokens, not on BTC and USDT, and scoring USDT is meaningless.
    .replace(/\b[A-Z][A-Z0-9]{1,9}(?:(?:,|\s+and)\s+[A-Z][A-Z0-9]{1,9})*\s+(?:markets?|pairs?|trading pairs?)\b/g, ' ')
    // the right half of a pair: "BONK/KRW", "BONK/USDT"
    .replace(/\b([A-Z][A-Z0-9]{1,9})\s*\/\s*[A-Z][A-Z0-9]{1,9}\b/g, '$1')
  const hits = body.match(/\b[A-Z][A-Z0-9]{1,9}\b/g) || []
  return [...new Set(hits.filter((t) => !STOPWORDS.has(t)))]
}

// -- one line -> one parsed item --------------------------------------------
export function parseLine(line, section, postAt) {
  const body = line.replace(/^[-*•]\s*/, '').trim()
  if (!body || EMPTY_RE.test(body)) return null

  const parts = body.split(/\s+-\s+/)
  let { tickers, rule } = extractTickers(line, section)

  // Nothing explicit, so fall back to uppercase tokens in the prose. This is
  // how META lines like "DOGE, PEPE, BONK and PENGU are all up 37 to 94
  // percent" get counted at all. It is the loosest rule, so the tracker still
  // has to resolve each candidate against the top 1000 by market cap before
  // anything here is ever priced.
  if (!tickers.length) {
    const cands = proseCandidates(body)
    if (cands.length && cands.length <= 12) { tickers = cands; rule = 'prose' }
  }

  // trailing source: "theblock.co", "source: decrypt.co", "(theblock.co)"
  let source = null
  const tail = parts[parts.length - 1].trim()
  const srcMatch = tail.match(/(?:source:\s*)?\(?\b((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)\)?\.?$/i)
  if (srcMatch) source = srcMatch[1].replace(/^https?:\/\//, '')

  // a date still ahead of the post is a tradeable event date; a date behind it
  // is just when the news broke, and scoring "entry to exit" against it would
  // run time backwards
  const head = parts[0]
  const dateStr = parseDate(head, postAt) || parseDate(body.slice(0, 60), postAt)
  const postDay = new Date(postAt).toISOString().slice(0, 10)
  const eventDate = dateStr && dateStr >= postDay ? dateStr : null

  let catalyst = body
  if (rule === 'segment' && parts.length >= 3) catalyst = parts.slice(1, -2).join(' - ') || parts[1]
  catalyst = catalyst.replace(/\s+/g, ' ').trim()

  return { section, tickers, tickerRule: rule, catalyst, eventDate, announcedDate: dateStr, source, raw: body }
}

// -- dedup key --------------------------------------------------------------
// A dated event restated on five consecutive mornings is one call, so dated
// items key on the event date. Undated ones fall back to a bag-of-words hash
// of the catalyst, which survives light rewording.
const FP_STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'by', 'its', 'it', 'is', 'are', 'with', 'from', 'as', 'that', 'this', 'will', 'has', 'have', 'been', 'after', 'over', 'about', 'into', 'per'])

export function fingerprint({ section, eventDate, catalyst }) {
  if (eventDate) return 'd:' + eventDate
  const tokens = String(catalyst || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !FP_STOP.has(t))
  const bag = [...new Set(tokens)].sort().join(' ')
  return 'f:' + createHash('sha1').update(bag).digest('hex').slice(0, 16)
}

// -- alerts -----------------------------------------------------------------
// An alert is free prose with no sections, but its title is a clean ticker
// list ("Upbit lists ETHFI, RESOLV, INIT, SPK, Sept 19") and the body glosses
// each one in parentheses ("Ether.fi (ETHFI)"). Anything junk that slips
// through still has to survive resolution before it is ever priced.
export function parseAlert(post) {
  const title = String(post.title || '')
  const body = String(post.body || '')
  const fromTitle = (title.match(/\b[A-Z][A-Z0-9]{1,9}\b/g) || []).filter((t) => !STOPWORDS.has(t))
  const glosses = [...body.matchAll(/\(([A-Z][A-Z0-9]{1,9})\)/g)].map((m) => m[1]).filter((t) => !STOPWORDS.has(t))
  const tickers = [...new Set([...fromTitle, ...glosses])]
  const src = body.match(/Source:\s*\(?((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)/i)
  const catalyst = (title || body.split(/\r?\n/)[0] || '').trim()
  const eventDate = null // alerts report something that already happened
  const fp = fingerprint({ section: 'ALERT', eventDate, catalyst })
  const base = {
    post_id: post.id,
    post_at: post.created_at,
    section: 'ALERT',
    catalyst,
    event_date: eventDate,
    source: src ? src[1].replace(/^https?:\/\//, '') : null,
    entry_at: post.created_at,
    fingerprint: fp,
    raw: catalyst,
    ticker_rule: 'alert',
  }
  if (!tickers.length) return [{ ...base, ticker: null }]
  return tickers.map((ticker) => ({ ...base, ticker }))
}

// -- whole post -------------------------------------------------------------
export function parsePost(post) {
  if (post.kind === 'alert') return parseAlert(post)
  const postAt = post.created_at
  const calls = []
  for (const { section, lines } of splitSections(post.body)) {
    for (const line of lines) {
      const item = parseLine(line, section, postAt)
      if (!item) continue
      const fp = fingerprint({ section, eventDate: item.eventDate, catalyst: item.catalyst })
      const base = {
        post_id: post.id,
        post_at: postAt,
        section,
        catalyst: item.catalyst,
        event_date: item.eventDate,
        source: item.source,
        entry_at: postAt,
        fingerprint: fp,
        raw: item.raw,
        ticker_rule: item.tickerRule,
      }
      // a line with no ticker is a broad-market note: counted, never priced
      if (!item.tickers.length) calls.push({ ...base, ticker: null })
      else for (const ticker of item.tickers) calls.push({ ...base, ticker })
    }
  }
  return calls
}
