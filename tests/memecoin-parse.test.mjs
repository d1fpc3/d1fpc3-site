// node --test tests/memecoin-parse.test.mjs
//
// Fixtures are verbatim lines from real memecoin_posts rows, so these tests
// fail if the digest's wording drifts away from what the parser expects.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitSections, parseDate, extractTickers, parseLine, fingerprint, parsePost } from '../scripts/lib/memecoin-parse.mjs'

const AT = '2026-09-19T12:09:32.596872+00:00'

// -- sections ---------------------------------------------------------------

test('splits the five sections and keeps inline header content', () => {
  const body = [
    'UPCOMING (DATED):',
    '- Oct 14, 2026: Bitwise closes its spot Dogecoin ETF. DOGE. (theblock.co)',
    '',
    'META: Solana meme coins are leading. Leader: PENGU (up 47%). Derivatives: WIF, BONK.',
    '',
    'Patterns, not promises. Announcement is the entry, event is the exit.',
  ].join('\n')
  const secs = splitSections(body)
  assert.deepEqual(secs.map((s) => s.section), ['UPCOMING (DATED)', 'META'])
  assert.equal(secs[1].lines.length, 1, 'inline META content becomes its first line')
})

test('drops a repeated subject line before the first header', () => {
  const secs = splitSections('Memecoin catalysts - Aug 30\n\nUPCOMING (DATED):\nNothing dated on the calendar today.')
  assert.deepEqual(secs.map((s) => s.section), ['UPCOMING (DATED)'])
})

test('accepts a section header with a parenthetical qualifier', () => {
  // real Aug 31 header; without this the whole section folds into the one above
  const body = [
    'UPCOMING (DATED):',
    '- Sep 2, 2026 - MemeCore unlock - M - cryptoticker.io',
    'JUST ANNOUNCED (most recent verified, not all within 24h):',
    '- Aug 29 - Upbit lists NEXO - NEXO - cryptonews.com',
  ].join('\n')
  const secs = splitSections(body)
  assert.deepEqual(secs.map((s) => s.section), ['UPCOMING (DATED)', 'JUST ANNOUNCED'])
  assert.equal(secs[0].lines.length, 1)
  assert.equal(secs[1].lines.length, 1)
})

test('drops the footer so it never becomes a call', () => {
  const secs = splitSections('RISK:\nSomething real happened - theblock.co\nPatterns, not promises. Rules card applies.')
  assert.equal(secs[0].lines.length, 1)
})

// -- dates ------------------------------------------------------------------

test('parses every date shape the digest uses', () => {
  assert.equal(parseDate('Oct 14, 2026', AT), '2026-10-14')
  assert.equal(parseDate('Sep 17', AT), '2026-09-17')
  assert.equal(parseDate('2026-09-15, 2:15pm ET', AT), '2026-09-15')
  assert.equal(parseDate('Sep 1-30 (ongoing)', AT), '2026-09-01')
  assert.equal(parseDate('Aug 26, ~21:00 UTC', AT), '2026-08-26')
  assert.equal(parseDate('Sep 28 to Oct 2', AT), '2026-09-28')
  assert.equal(parseDate('Dec 4, 2026 (approx, 240 day SEC review deadline)', AT), '2026-12-04')
  assert.equal(parseDate('no date here', AT), null)
})

test('rolls an implied year forward across the new year', () => {
  assert.equal(parseDate('Jan 9', '2026-12-20T12:00:00Z'), '2027-01-09')
})

// -- ticker rules -----------------------------------------------------------

test('the explicit segment wins over tickers named in prose', () => {
  // real Aug 30 line: MORPHO is in the prose but deliberately not in the segment
  const line = 'Aug 21 - Coinbase adds PENGU, POPCAT and MORPHO to its listing roadmap - PENGU, POPCAT - theblock.co'
  const { tickers, rule } = extractTickers(line, 'JUST ANNOUNCED')
  assert.equal(rule, 'segment')
  assert.deepEqual(tickers, ['PENGU', 'POPCAT'])
  assert.ok(!tickers.includes('MORPHO'), 'must not pick up the excluded ticker')
})

test('reads a trailing sentence ticker before a parenthesised source', () => {
  const line = '- Oct 14, 2026: Bitwise closes its spot Dogecoin ETF (ticker BWOW), last trading day on NYSE. DOGE. (theblock.co)'
  const { tickers, rule } = extractTickers(line, 'UPCOMING (DATED)')
  assert.equal(rule, 'sentence')
  assert.deepEqual(tickers, ['DOGE'])
})

test('reads a trailing sentence ticker before a bare Source:', () => {
  const line = '- Sep 18, 2026: TRUMP unlock, 28.7M tokens hits the market today. TRUMP. Source: news.bitcoin.com'
  assert.deepEqual(extractTickers(line, 'UPCOMING (DATED)').tickers, ['TRUMP'])
})

test('reads a blue-chip bullet', () => {
  const line = '- BONK: Upbit delisted BONK pairs Sep 7 over unresolved security issues.'
  const { tickers, rule } = extractTickers(line, 'BLUE CHIPS')
  assert.equal(rule, 'bullet')
  assert.deepEqual(tickers, ['BONK'])
})

test('reads the meta leader and its derivatives', () => {
  const line = 'Solana meme coins are leading the 7 day tape. Leader: PENGU (up 47% over 7 days). Derivatives: WIF, BONK.'
  const { tickers, rule } = extractTickers(line, 'META')
  assert.equal(rule, 'meta')
  assert.deepEqual(tickers, ['PENGU', 'WIF', 'BONK'])
})

test('strips a parenthetical gloss off a one-letter ticker', () => {
  const line = '- Sep 2, 2026 - MemeCore token unlock (~56.1M M, monthly vesting) - M (MemeCore) - cryptoticker.io'
  assert.deepEqual(extractTickers(line, 'UPCOMING (DATED)').tickers, ['M'])
})

test('treats broad-market and multi-asset segments as untickered', () => {
  const broad = '- Sep 15, 2026 - Senate cloture vote on the CLARITY Act, needs 60 votes - broad market - crypto.news'
  assert.deepEqual(extractTickers(broad, 'UPCOMING (DATED)').tickers, [])
  const multi = '- Sep 11 - Kraken delists 21 tokens, trading ends - multiple assets - cryptoticker.io'
  assert.deepEqual(extractTickers(multi, 'UPCOMING (DATED)').tickers, [])
})

test('a line with no ticker segment at all yields none', () => {
  const line = "Sep 26 - Bithumb's 6 month partial suspension on new customer coin transfers is set to expire - cryptotimes.io"
  assert.deepEqual(extractTickers(line, 'UPCOMING (DATED)').tickers, [])
})

// -- line parsing -----------------------------------------------------------

test('skips the empty-section markers', () => {
  assert.equal(parseLine('Nothing dated on the calendar today.', 'UPCOMING (DATED)', AT), null)
  assert.equal(parseLine('Nothing verified in the last 24h.', 'JUST ANNOUNCED', AT), null)
  assert.equal(parseLine('No blue chip on the watch list has a verified, dated catalyst.', 'BLUE CHIPS', AT), null)
})

test('keeps a future date as the event date and pulls the source', () => {
  const item = parseLine('- Oct 14, 2026: Bitwise closes its spot Dogecoin ETF. DOGE. (theblock.co)', 'UPCOMING (DATED)', AT)
  assert.equal(item.eventDate, '2026-10-14')
  assert.equal(item.source, 'theblock.co')
})

test('a past date is not an event date, because the exit cannot precede the entry', () => {
  const item = parseLine('Aug 21 - Coinbase adds PENGU to its roadmap - PENGU - theblock.co', 'JUST ANNOUNCED', AT)
  assert.equal(item.announcedDate, '2026-08-21')
  assert.equal(item.eventDate, null)
})

// -- dedup ------------------------------------------------------------------

test('the same dated event reworded on another morning is one call', () => {
  const a = fingerprint({ section: 'UPCOMING (DATED)', eventDate: '2026-09-07', catalyst: 'Upbit delists BONK trading pairs (BONK/KRW, BONK/USDT)' })
  const b = fingerprint({ section: 'UPCOMING (DATED)', eventDate: '2026-09-07', catalyst: 'Upbit delists BONK from KRW and BTC markets' })
  assert.equal(a, b)
})

test('different dated events stay separate', () => {
  const a = fingerprint({ section: 'UPCOMING (DATED)', eventDate: '2026-09-07', catalyst: 'Upbit delists BONK' })
  const b = fingerprint({ section: 'UPCOMING (DATED)', eventDate: '2026-09-12', catalyst: 'PUMP token unlock' })
  assert.notEqual(a, b)
})

test('an undated catalyst dedups on its wording, order-insensitively', () => {
  const a = fingerprint({ section: 'BLUE CHIPS', eventDate: null, catalyst: 'Bitwise is winding down its spot DOGE ETF' })
  const b = fingerprint({ section: 'BLUE CHIPS', eventDate: null, catalyst: 'winding down the spot DOGE ETF, Bitwise' })
  assert.equal(a, b)
})

// -- whole post -------------------------------------------------------------

test('fans one line out to one call per ticker', () => {
  const post = {
    id: 'p1',
    created_at: AT,
    body: 'JUST ANNOUNCED:\nAug 21 - Coinbase adds PENGU, POPCAT and MORPHO to its listing roadmap - PENGU, POPCAT - theblock.co',
  }
  const calls = parsePost(post)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map((c) => c.ticker), ['PENGU', 'POPCAT'])
  assert.equal(calls[0].fingerprint, calls[1].fingerprint, 'same catalyst, so the same dedup key')
  assert.equal(calls[0].entry_at, AT)
})

test('quote currencies are not scored as calls', () => {
  // real Sep 16 line: the call is on the four tokens, not on BTC and USDT
  const line = 'Sep 19 (announced today) - Upbit will open BTC and USDT markets for ETHFI, RESOLV, INIT, and SPK at 3pm KST - crypto.news'
  const item = parseLine(line, 'JUST ANNOUNCED', AT)
  assert.equal(item.tickerRule, 'prose')
  assert.ok(!item.tickers.includes('USDT'), 'USDT is the quote, not the subject')
  assert.ok(!item.tickers.includes('BTC'), 'BTC is the quote, not the subject')
  assert.deepEqual(item.tickers.sort(), ['ETHFI', 'INIT', 'RESOLV', 'SPK'])
})

test('the left side of a trading pair survives, the quote half does not', () => {
  const line = 'Sep 7 - Upbit delists BONK trading pairs BONK/KRW and BONK/USDT, withdrawals through Oct 7'
  const item = parseLine(line, 'UPCOMING (DATED)', AT)
  assert.ok(item.tickers.includes('BONK'))
  assert.ok(!item.tickers.includes('USDT'))
  assert.ok(!item.tickers.includes('KRW'))
})

test('an alert takes its tickers from the title and the parenthetical glosses', () => {
  // real Sep 19 alert row
  const post = {
    id: 'a1',
    kind: 'alert',
    created_at: '2026-09-19T05:24:52Z',
    title: 'Upbit lists ETHFI, RESOLV, INIT, SPK, Sept 19',
    body: 'Upbit announced new trading support for Ether.fi (ETHFI), Resolv (RESOLV), Initia (INIT), and Spark (SPK) against BTC and USDT markets (KRW access).\nSource: upbit.com',
  }
  const calls = parsePost(post)
  assert.deepEqual(calls.map((c) => c.ticker).sort(), ['ETHFI', 'INIT', 'RESOLV', 'SPK'])
  assert.equal(calls[0].section, 'ALERT')
  assert.equal(calls[0].source, 'upbit.com')
  assert.equal(calls[0].event_date, null)
})

test('an untickered line is still recorded, with a null ticker', () => {
  const post = {
    id: 'p2',
    created_at: AT,
    body: 'UPCOMING (DATED):\n- Sep 29, 2026 - CoinEx halts spot trading ahead of a full shutdown - source: decrypt.co',
  }
  const calls = parsePost(post)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].ticker, null)
})
