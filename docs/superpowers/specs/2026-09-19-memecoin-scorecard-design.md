# Memecoin scorecard: scoring the daily catalyst digest

Design, 2026-09-19. Status: approved, implementing.

## The problem

A routine posts a catalyst digest every morning (12:10 UTC) as a
`memecoin_posts` row and mails it to D1. Nothing measures whether the
coins it names go on to do anything. D1 wants the calls scored so the
digest can be judged instead of trusted.

## What counts as a call

Every ticker the digest names, per section. The unit is one row of
`memecoin_calls`: `(post, section, ticker, catalyst)`.

The digest is a catalyst report, not a buy list, so "was it right" needs
a trade rule bolted on. The digest states its own: *announcement is the
entry, event is the exit*. That is the rule we score against.

- Entry is the price at the post's `created_at`.
- Every call is marked at +1d, +3d, +7d and +30d.
- A call with a parsed event date also gets a `to_event` return, entry
  through the event date.
- Hit rate is sliced by section, so `JUST ANNOUNCED` can be judged apart
  from `BLUE CHIPS`, which mostly restates context.

No direction is inferred. A listing and a delisting both get a signed
return; reading the sign is D1's job, and pretending a classifier can do
it reliably would launder a guess into a statistic.

## Why not Gmail

First pass assumed the digests only existed as email and planned IMAP
ingest with a Gmail app password. They are already in Postgres:
`public.memecoin_posts`, 32 rows back to 2026-08-23, `kind` in
(`digest`, `alert`, `note`), with clean source domains rather than the
Gmail redirect URLs. Reading Postgres removes a credential, a library
and a whole class of failure. The generator is never touched; wherever
it runs, it keeps running.

## Data model

Three tables on the Echelon project (`cqdignbleethroyxxvzr`), all
`is_admin()` RLS, matching `memecoin_posts`.

`memecoin_calls`
: one row per (post, section, ticker, catalyst fingerprint).
  Carries `post_id`, `section`, `ticker`, `coin_id`, `catalyst`,
  `event_date`, `source`, `entry_at`, `entry_usd`, `ticker_confidence`,
  `ticker_rule`, `first_seen_at`, `last_seen_at`, `seen_count`.

`memecoin_scorecard`
: a `security_invoker` view over the calls that computes every mark and
  return. One definition shared by the admin tab and the email, so the
  two surfaces cannot drift apart. A mark is the nearest stored price
  within 36h of the target, and null when the horizon has not elapsed,
  so a thin series reads as "no mark" rather than borrowing a stale
  price.

`memecoin_prices`
: `(coin_id, ts, usd)`, one row per coin per day, plus exact entry
  timestamps. All marks are computed from this series, so adding a
  horizon later costs no API calls.

`memecoin_ticker_map`
: `(ticker, coin_id, confidence, note)`. Resolution is pinned once and
  reused. An unresolved ticker stays unresolved and visible; it is never
  guessed.

## Dedup

`BLUE CHIPS` names DOGE, TRUMP, BONK and PENGU most days, usually
restating the same catalyst. Naively that is four new calls a day that
are really one call counted twenty times, and they would drown the
stats.

A call is unique on `(ticker, section, catalyst_fingerprint)` where the
fingerprint is a normalised hash of the catalyst text (lowercased,
numbers and dates stripped, stopwords removed). A restatement bumps
`last_seen_at` on the existing row. Entry stays pinned to the first
sighting, which is the honest entry: that is when D1 first heard it.

## Parsing

Deterministic, no LLM. Cost is zero and every rule is testable against the
real posts. Ordered, first match wins:

1. **Explicit ticker segment.** ` - TICKERS - source` at end of line.
   This is authoritative. On 2026-08-30 the prose reads "Coinbase adds
   PENGU, POPCAT and MORPHO" while the segment reads `- PENGU, POPCAT -`;
   MORPHO was deliberately left out. The segment is the author's intent
   and beats anything scraped from prose.
2. **Trailing sentence tickers.** `... DOGE.` or `... PENGU, WIF.`
   immediately before a parenthesised source.
3. **Blue-chip bullet.** `- TICKER: text`.
4. **Meta leader.** `Leader: X` and `Derivatives: Y, Z`.
5. **Prose fallback.** Uppercase tokens minus a stoplist of finance and
   English abbreviations (ET, UTC, KST, SEC, CFTC, ETF, DAO, NYSE, TGE,
   AMM, DEX, CEX, KRW and the rest). This is what counts META lines like
   "DOGE, PEPE, BONK and PENGU are all up 37 to 94 percent", which carry
   no explicit ticker segment. It is the loosest rule and it more than
   doubles coverage: without it 43% of items yield no ticker at all.
   A prose candidate that does not resolve to a real coin is **discarded**,
   not recorded as unpriced, because a word like ERC or OG was never a
   ticker in the first place. An explicitly named ticker that fails to
   resolve is kept and reported, because that is a genuine gap.
6. **No ticker.** Recorded with `ticker = null` as a broad-market line.
   Counted, never priced.

Which rule produced a call is stored in `ticker_rule`, so the scorecard
can ask whether an explicitly tagged ticker behaves differently from one
merely named in prose instead of blending the two.

Sections recognised: `UPCOMING (DATED)`, `JUST ANNOUNCED`, `META`,
`BLUE CHIPS`, `RISK`, plus `ALERT` for the one-off alert posts, whose
tickers come from the title and the parenthetical glosses. `Nothing
dated on the calendar today` parses to an empty section, not an error.

A section header can carry a qualifier before its colon, as on
2026-08-31: `JUST ANNOUNCED (most recent verified, not all within 24h):`.
Missing that folded the whole section into the one above it and
mislabelled its calls, which is exactly the kind of silent error the
fixture tests exist to catch.

## Pricing

Two sources, no keys, no cost. A coin is priced from one venue only,
recorded in `memecoin_prices.src`, so a series is never stitched together
from two conventions.

**Coinbase Exchange is primary** for history: free, no key, reachable from
US addresses, effectively unthrottled at our volume, and it lists most of
the liquid names the digest talks about. One `products/<TICKER>-USD/candles`
call at 6h granularity returns 300 candles, or 75 days, which covers every
horizon we score. A 404 just means the coin is not listed there.

Binance was the obvious first choice and is unusable: it answers **451** to
US addresses, including GitHub Actions runners.

**CoinGecko is the fallback** for the long tail, under a call budget:

- Ticker resolution reads the top 1000 coins by market cap in four
  `coins/markets` calls. `coins/list` was the first choice and is wrong:
  5MB, and it carries no market caps, so it cannot answer "which of the
  six coins with this symbol is meant".
- A coin's history is fetched once with `market_chart/range` and then only
  topped up, because the database is the cache. The second run used 12
  calls where the first used 36.

**The keyless tier rate limits hard and unpredictably.** This was not a
theoretical risk: the first implementation hung for ten minutes in
backoff, and a later run was cut off mid-resolution after 250 coins. So
the run carries a call budget and degrades instead of lying:

- Prices are written per coin as they arrive, so a run cut short keeps
  everything it fetched and the next run resumes from the gap.
- If the top-1000 map is incomplete, tickers that were never checked are
  **held back entirely** rather than recorded as unresolved. Otherwise a
  transient rate limit would drop real tickers and cache a false verdict
  about them. SAND, HEMI, SPK, REZ and ARC all got mislabelled this way
  before the guard existed.
- `COINGECKO_API_KEY` (a free Demo key: 30 calls/min, 10k/month) removes
  the problem and lets the first backfill finish in one pass. Worth
  getting; not required.

## The job

`scripts/memecoin-track.mjs`, run by `.github/workflows/memecoin-track.yml`
on a daily cron at 13:00 UTC, an hour after the digest posts. The repo
is public, so Actions minutes are free.

Steps: read new `memecoin_posts` rows, parse, resolve tickers, upsert
calls, backfill any new coin's price series, append today's prices,
recompute marks, send the scorecard email, exit non-zero on a parse or
price failure so a silent drift cannot set in.

`--dry` reports without writing. `--backfill` walks all 32 existing
posts, which is the first run.

## Surfaces

**Admin tab.** A third `.mm-tab` next to Desk and Playbook in
`echelon/admin/index.html`, so the scorecard sits beside the wire that
shows the digests. The CSP in `echelon/admin/.htaccess` already allows
CoinGecko and this Supabase project, so no CSP change and no new host to
probe. Table of calls with returns per horizon, hit rate by section, and
an explicit unresolved-tickers list.

**Email.** A `SCORECARD` block mailed daily: every still-open call, plus
running hit rate by section. Sent with nodemailer over Gmail SMTP as
`d1@seenrank.com`, matching the existing sender. One secret pair,
`MEMECOIN_SMTP_USER` and `MEMECOIN_SMTP_PASS`. This is the only
credential the system needs beyond the Supabase service role key.

## Failure modes, named

- **Wrong ticker match.** The worst case, because it produces confident
  garbage. Mitigated by pinning resolutions, the market-cap floor, and
  showing unresolved rather than guessing. `M` (MemeCore), `APM`, `BARD`
  and `MRX` are the known-hard ones and get seeded by hand.
- **Survivorship in BLUE CHIPS.** Handled by dedup, and by reporting
  per-section hit rates rather than one blended number.
- **Thin sample.** Twenty-eight days is not a verdict. The dashboard
  shows n alongside every hit rate and says so.
- **CoinGecko rate limit.** Batched reads keep usage two orders of
  magnitude under the cap; a 429 fails the run loudly rather than
  writing partial data.

## Out of scope

Position sizing, alerts, automatic direction classification, anything
that places a trade. This measures the digest. That is all it does.
