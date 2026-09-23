# Kalshi maker desk

Date: 2026-09-22. Status: awaiting D1's review.

## Problem

Two completed backtests in `apps/kalshi-bot` both came back negative, and both ended on the
same sentence: the only place an edge could still live is the **maker** side, and testing it
would need weeks of live order book capture.

Both halves of that conclusion turned out to be wrong in D1's favour.

1. The maker side is testable on **existing history**, keyless, today. No capture needed first.
2. The maker fee on the four target series is **zero**, confirmed from the published schedule.

D1 asked for a Kalshi bot built inside the Echelon site. This spec covers the whole system:
the backtest that decides whether it is worth building, the paper engine, and the admin desk.

## Verified facts this design rests on

Everything here was checked against production on 2026-09-22, not assumed.

| Fact | How it was verified | Consequence |
|---|---|---|
| Maker fee multiplier defaults to **0** | `kalshi-fee-schedule.pdf` p2, verbatim: `fees = round up(M x 0.0175 x C x P x (1-P))`, `M = the multiplier for each contract (default is 0 unless otherwise indicated)`. Effective July 7, 2026. | A resting order costs nothing to execute. |
| None of the four target series carry an override | Extracted all 12 pages. `KXBTC15M`, `KXETH15M`, `KXDOGE15M`, `KXGOLD15M` appear **nowhere** in the schedule, so defaults apply. The only crypto rows in the Non-Standard table (p6, columns `Series, Maker Multiplier, Taker Multiplier`) are `KXBTCMAX150` (1/1), `KXBTCY` (0/0), `KXETHY` (0/0). | Maker M=0, taker M=1. The 7% taker wall that killed both prior backtests does not exist on the resting side. |
| Full executed tape is public and keyless | `GET /markets/trades?ticker=X` returns HTTP 200 with microsecond `created_time`, `taker_side`, `yes_price_dollars`, `count_fp`. Pre-cutoff history via `GET /historical/trades?ticker=X` (**not** `/historical/markets/{ticker}/trades`, which 404s). | The maker side can be backtested on months of history. |
| Full resting depth is public and keyless | `GET /markets/{ticker}/orderbook?depth=N` returns HTTP 200, both sides. | The Worker needs no Kalshi credentials. |
| Market data WebSocket **requires** auth | Plain connect returns a non-101 status. | Streaming would force an RSA private key into Cloudflare. Avoided in this design. |
| All four series exist and are live | `GET /series?category=Crypto` and `GET /series/{ticker}`. All four report `fee_type: quadratic`, `fee_multiplier: 1`, `frequency: fifteen_min`. Crypto settles on CF Benchmarks, gold on Pyth. | Target set confirmed. |
| Maryland is a sports-only fight | Peer research doc, `apps/kalshi-bot/docs/research/2026-09-22-fees-and-eligibility.md`. The April 2025 MLGCC cease-and-desist is scoped to sporting events. Nothing touches weather or crypto price contracts. | Not a blocker for paper. D1 still confirms at account level before live. |

Research provenance: `apps/kalshi-bot/docs/research/2026-09-22-*.md` (three docs, commits 849f028
and 8d1f2f8).

## Target

Four series, 96 rounds per day each: `KXBTC15M`, `KXETH15M`, `KXDOGE15M`, `KXGOLD15M`.
"Will price be up in the next 15 minutes", strike is price at round open.

## Repo split

D1 deferred this call; the decision is to split rather than fork silently.

| Lives in | What |
|---|---|
| `apps/kalshi-bot` | Research, backtests, reports. Already holds the proven core math (55 tests), the Kalshi client, the historical cache, and the 15m rounds spike code in `src/spike/rounds/`. Phase 1 of this spec runs here. |
| `tools/d1fpc3-site` (Echelon) | The paper engine, the Supabase schema, and the admin desk. Phases 2 to 4. |

`src/core/fees.ts` currently exports `takerFee` only. It gains `makerFee(contracts, price,
multiplier = 0)` so the zero is explicit and testable rather than implied by absence.

## Phasing, and the kill criteria

The sequencing is deliberate: **do not build the Worker until the backtest says the strategy
is alive.** Each phase has an exit condition that can stop the project.

### Phase 1: the fill bracket (runs in `apps/kalshi-bot`)

Replay historical tape and compute maker P&L under **two** fill models on an identical
requote policy. This is the core methodological decision and it comes from
`2026-09-22-maker-adverse-selection-methodology.md`.

- **Pessimistic bound.** Strict trade-through: a resting order at `p` fills only when the tape
  prints through `p`. No queue assumption. This deliberately undercounts, because it fills you
  only in the adverse subset and excludes every benign fill where a taker crossed for liquidity
  and the price then went nowhere.
- **Optimistic bound.** Front of queue: fill on any volume at your price. This is what a naive
  maker backtest reports, and it looks good even when the strategy is dead.

The requote policy must be **byte identical** across both bounds or the bracket is meaningless.

| Bracket result | Decision |
|---|---|
| Both bounds positive | Real. Proceed to Phase 2. |
| Both bounds negative | Dead. Stop. No queue modelling rescues it. Write the report and close the project. |
| Straddles zero | This, and only this, justifies building live capture for queue position. |

Two honesty constraints carried forward from the prior reports:

- Both halves and the holdout of the 15m rounds data **have already been seen**. A maker result
  on that data is not clean out of sample even though the fill model is new information.
  Forward paper is the confirmation, not this.
- Pre-registered parameter grid and confidence intervals, same standard as the earlier reports.
  No threshold tuning after seeing the result.

**Cost control.** One 15 minute BTC round is roughly 34,000 trades (34 pages at `limit=1000`).
Pulling four assets whole is about 200k requests per asset-month. Phase 1 samples: one round
per hour, or only the final N minutes of each round. Sampling design is fixed before the run.

**The sign convention guard.** `taker_side` semantics get re-derived from the data on every
run by joining prints to the prevailing quote, and asserted. It is never read off the field
name. Peer research measured 86% of `taker_side=yes` at or above the ask; my own sample showed
`taker_side` and `taker_book_side` labelled in opposite senses. Getting this backwards silently
inverts every number in the report, so it is a test, not a comment.

### Phase 2: schema and paper engine

Cloudflare Worker `kalshi-desk`, source **outside** `d1fpc3-site` (that repo is public; same
reason `gex-worker` lives apart). Cron trigger every minute.

Per tick, for each series: resolve the open round, pull orderbook plus new trades by cursor,
compute fair value from reference spot (Coinbase Exchange for BTC/ETH/DOGE, Pyth for gold),
record intended resting quotes, and on round close apply the Phase 1 fill rule and book P&L.

Secrets held by the Worker: the Supabase service role key. **No Kalshi credentials at all.**

### Phase 3: the desk

New page under `echelon/admin/`, not another section inside `echelon/admin/index.html`, which
is already 6,846 lines and carries the whole memecoin desk. Reads Supabase with the existing
publishable key and the standard `is_admin()` gate.

The desk ships in Phase 3 but its first content is the **Phase 1 bracket output**, so D1 sees
something real in Echelon early and the components are not throwaway: the same tables later
render live paper results.

Surfaces: live board (four series, round countdown, our quote against market), the scoreboard
(net after fees, fill rate, markout decomposition, Brier against market mid), and a kill switch.

### Phase 4: forward paper, then the gate

No real money until D1's existing graduation gate is met: 100+ graded forecasts, positive P&L
after fees, Brier better than the market. The bot never promotes itself. D1 flips the mode by
hand.

## Data model

New tables in the Echelon Supabase project `cqdignbleethroyxxvzr`, all prefixed `kalshi_`,
service role write, `is_admin()` read, consistent with every other admin surface there.

| Table | Holds |
|---|---|
| `kalshi_rounds` | series, ticker, open/close time, strike, settlement value, outcome |
| `kalshi_book_snaps` | round, timestamp, yes bid/ask, depth both sides |
| `kalshi_paper_orders` | round, side, price, size, posted timestamp, requote generation |
| `kalshi_fills` | order, fill timestamp, fill model (pessimistic or optimistic), mid at fill, markout |
| `kalshi_scoreboard` | day, series, fills, gross, fees, net, Brier vs market, adverse selection term |

P&L per filled contract is `settle - p` with zero maker fee, decomposed into spread capture at
fill plus drift from fill mid to settlement. The second term is the adverse selection.

## Risks

| Risk | Mitigation |
|---|---|
| Kalshi introduces a maker fee on the 15m series | The whole thesis dies. Scheduled guard: re-pull the fee PDF, extract the Non-Standard table, alert if any `*15M` row appears or the maker default stops being 0. Note the PDF returns 429 to plain fetchers; a browser User-Agent plus `Referer: https://kalshi.com/` gets it. |
| Sign convention inverted | Asserted per run, see Phase 1. |
| Overfitting already-seen data | Pre-registered grid, bracket rather than point estimate, forward paper as the only confirmation. |
| Request cost | Sampling design fixed before the run, at roughly 200k requests per asset-month if pulled whole. |
| Cancels are invisible to the tape | Size ahead of you in the queue disappears without printing. This is precisely why a REST snapshot model can only **bound** rather than measure, and it is the specific thing `orderbook_delta` would buy later. Framed as a known limit of the bracket, not a defect. |
| D1's account cannot trade these series | One minute check before Phase 4: log in, open `https://kalshi.com/markets/kxbtc15m`, see whether the order ticket accepts a quantity. |

## Security

- No Kalshi API key exists anywhere in this design. Every endpoint used is public.
- `d1fpc3-site` is a **public** repo. Worker source lives outside it. The only value in Echelon
  is the publishable Supabase key, which is already committed there by design.
- If Phase 4 ever goes live, keys stay in `C:\Users\clari\.kalshi\`, never in a repo or chat.

## Out of scope

Weather series, the `weather-ai` Claude overlay, Discord notifications, real order placement,
and the authenticated WebSocket. Each is a separate decision after the bracket reports.
