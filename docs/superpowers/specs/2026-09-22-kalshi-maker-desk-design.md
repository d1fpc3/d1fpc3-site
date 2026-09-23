# Kalshi maker desk

Date: 2026-09-22. **Status: SUPERSEDED before implementation. No code was written.**

## Why this was not built

The thesis was measured directly and did not survive. Doc:
`apps/kalshi-bot/docs/research/2026-09-22-maker-pool-measurement.md`, commit a54f2f4.

The whole design rests on the resting side collecting the favorite-longshot bias. That pool can
be computed from the tape as arithmetic, with no fill model and no counterfactual: every trade
has a maker on the other side, settlement is 0 or 1, and the maker fee is zero.

| Series | Rounds | Notional | Pool | bps | 95% CI |
|---|---|---|---|---|---|
| `KXBTC15M` | 30 | $41.5M | -$46,957 | -11.3 | -$19,510 to +$16,380 |
| `KXETH15M` | 20 | $1.32M | +$47,380 | +358.0 | -$1,755 to +$6,493 |

Both CIs straddle zero widely and the two series disagree in sign. Over 50 rounds and $42.9M of
notional, **the pool this design was built to harvest does not appear.** Phase 1's bracket would
have measured D1's share of it, and the numerator is not there.

**A prediction in an earlier revision of this spec was backwards, and it matters.** I argued a
positive pool was near guaranteed because the rounds report showed takers losing. Follow the
arithmetic: maker and taker sum to zero *before* fees, and takers were slightly negative *after*
fees, which makes them slightly positive before fees, which forces the aggregate maker slightly
negative. The correct prior was a pool at or just below zero. BTC at -11.3 bps is roughly what
"minus the fee take" looks like. That arithmetic should have been run before a thesis was built
on top of it.

**This is not a clean kill, and should not be recorded as one.** Three limits, all real:

- Underpowered at n=30 and n=20 against a fat tail. BTC's mean is negative while its median is
  +$10,526, per-round range -$133,679 to +$77,270. The resting side wins most rounds and
  occasionally gets destroyed.
- Roughly two days per series, one regime.
- **The aggregate includes every careless resting order on the book, so a selective maker could
  beat the aggregate.** This is the strongest argument against treating the measurement as
  decisive.

What the number does establish, combined with the rest: a cron Worker is last in queue, and the
competition is subsidised through the Liquidity **Provider** Program (executed Market Maker
Agreement, allocated by auction, 50+ series including crypto, not available to D1). The position
on offer is the worst share of a pool measuring zero, against counterparties who do not need
trading P&L to justify their quotes.

## The one thread that survives, and it is a different project

Kalshi's Liquidity **Incentive** Program is a separate program from the Provider Program above.
Open to most regular US members, no Market Maker Agreement, no application, no designation. It
pays $1 to $1,000 per market per day for resting orders **whether or not they fill**, and all
markets are potentially eligible.

That is a subsidy, not an edge. It does not depend on the pool being positive, and it inverts the
central risk of this spec: the danger of resting is adverse selection on fills, and LIP pays for
resting regardless. It needs sizing before it justifies anything, because the reward is a
proportional share of a pot against all participants including the funded pros, so at a $250
bankroll D1's slice may round to nothing.

**LIP is deliberately not folded into this document.** It has a different objective function
(maximise resting score while not getting run over), and quietly morphing a bias-harvesting spec
into an LIP design would erase the fact that the original thesis was tested and failed. If D1
wants it, it gets its own spec.

Everything below is the superseded design, kept for the record.

---

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

**The strategy under test is bias harvesting, not spot-model quoting.** This has to be stated
before anything else, because an earlier revision of this spec tested one and built the other.

The thesis inherited from the rounds report is narrow: the favorite-longshot bias is visible at
the mid (longshots 0.4 to 1.8 points rich), and spread plus the 7% taker fee ate it, so only a
maker paying zero fee could collect it. So the quoting rule is **an offset from the prevailing
market mid**, and it is the same rule in Phase 1 and Phase 2.

Reference spot (Coinbase for BTC/ETH/DOGE, Pyth for gold) is **not in the quoting path**. A
log-normal model on trailing realized vol is exactly what the rounds backtest already killed:
it lost at every threshold on BTC and ETH holdout with CIs below zero, and the Kalshi mid out
forecast it at every horizon with the gap widening into the close. Reference spot stays as a
diagnostic column so the reports can show what it would have said, and nothing quotes off it.

Replay historical tape and compute maker P&L under **two** fill models on an identical
requote policy. This is the core methodological decision and it comes from
`2026-09-22-maker-adverse-selection-methodology.md`.

- **Pessimistic bound.** Strict trade-through: a resting order at `p` fills only when the tape
  prints through `p`. No queue assumption. This deliberately undercounts, because it fills you
  only in the adverse subset and excludes every benign fill where a taker crossed for liquidity
  and the price then went nowhere.
- **Optimistic bound.** Front of queue: fill on any volume at your price. This is what a naive
  maker backtest reports, and it looks good even when the strategy is dead.

The requote policy must be **byte identical** across both bounds, or the bracket stops bracketing
anything and the decision rule below is void. Both runs assert they consumed the same policy
object. This is checked, not trusted.

| Bracket result | Decision |
|---|---|
| Both bounds clear the economics floor | Real **and** worth building. Proceed to Phase 2. |
| Both bounds positive but under the floor | Statistically real, economically pointless. Write the report and stop. A Worker, five tables and an admin page are not worth pocket change per month. |
| Both bounds negative | Dead. Stop. No queue modelling rescues it. Write the report and close the project. |
| Straddles zero | For D1 specifically, read this as **stop**, not as a green light. See below. |

**The economics floor, fixed before the run.** Significance and worth-doing are different tests
and only the first was in the earlier revision of this spec. A bracket can come back technically
positive at 2% on cost and trigger Phases 2 to 4 for pocket change. So the floor is pre-registered
and cannot be rationalised after the number is seen.

Proposed defaults, **D1's to move, but only before the run**: at least **0.5 points net per
contract traded**, and at least **$50 per month** projected at his actual $250 bankroll and $10
per market sizing. Below either, the project stops regardless of how good the p-value looks.

**Why "straddles zero" is not a continue path here.** The methodology doc frames it as the case
that justifies building live capture, which is correct in general and misleading for D1. A cron
Worker polling a public REST API is last in queue against colocated market makers: it loses every
race to a new price level and joins the back of every existing one. That makes the strict
trade-through bound close to his realistic expected result rather than a floor beneath it. So if
the bracket straddles, the honest reading is "this works for someone with better infrastructure
than D1", and the choice is to stop or to consciously enter an infrastructure race he will not
win. Capture gets built only if he decides to enter that race with his eyes open.

Two honesty constraints carried forward from the prior reports:

- Both halves and the holdout of the 15m rounds data **have already been seen**. A maker result
  on that data is not clean out of sample even though the fill model is new information.
  Forward paper is the confirmation, not this.
- Pre-registered parameter grid and confidence intervals, same standard as the earlier reports.
  No threshold tuning after seeing the result, and **every cell gets reported**, not just the
  survivors. The cautionary case is the gold 92 to 96c +1.7% in the rounds report, which was only
  read correctly as noise because the report was honest that 10 bands by 5 time buckets per asset
  produces winners by chance. A maker bracket has more knobs than that, so the temptation is
  larger.

**Cost control.** One 15 minute BTC round is roughly 34,000 trades (34 pages at `limit=1000`).
Pulling four assets whole is about 200k requests per asset-month. Phase 1 samples: one round
per hour, or only the final N minutes of each round. Sampling design is fixed before the run.

**The sign convention guard.** `taker_side` semantics get re-derived from the data on every run
by joining prints to the prevailing quote, and asserted. They are never read off a field name.

Why this needs a guard at all: `taker_book_side` describes the **taker's own order**, not the
resting order it consumed. A taker buying YES submits a marketable bid, which crosses and
consumes a resting yes ask, so `taker_side=yes` pairs with `taker_book_side=bid`. The field is
named from the opposite perspective to the one a maker backtest cares about, which is exactly
why it reads backwards to anyone thinking about resting orders. Measured independently twice and
agreed: 86% of `taker_side=yes` prints sit at or above the ask, and the pairing counts are
`(yes,bid) 551 / (no,ask) 449`. **Key off `taker_side`, never off `taker_book_side`.**

The assertion **fails the run**. It does not warn. If the convention ever flips, every P&L number
in the report inverts silently, and a line in a log is not protection against that.

### Phase 2: schema and paper engine

Cloudflare Worker `kalshi-desk`, source **outside** `d1fpc3-site` (that repo is public; same
reason `gex-worker` lives apart). Cron trigger every minute.

Per tick, for each series: resolve the open round, pull orderbook plus new trades by cursor,
apply **the same mid-offset quoting rule Phase 1 validated**, record intended resting quotes,
and on round close apply the Phase 1 fill rule and book P&L.

The quoting rule is shared code with Phase 1, not a reimplementation. If Phase 2 quotes off
anything Phase 1 did not test, Phase 1 proves nothing about what ships. Reference spot is
recorded as a diagnostic only.

Secrets held by the Worker: the Supabase service role key, plus the two Discord webhook URLs
below. **No Kalshi credentials at all**, because every Kalshi endpoint this design uses is
public. The Worker does hold Discord write access, which is worth stating plainly rather than
letting "keyless" imply it holds nothing.

### Notifications

D1 supplied two webhooks, stored in `C:\Users\clari\.kalshi\secrets.json` under
`discord.webhook_pnl` (daily P&L) and `discord.webhook_signals` (signals). Both verified live.
They never enter a repo, a spec, a committed `.env`, or chat. A Cloudflare Worker cannot read
that local file, so deploying Phase 2 means putting both in via `wrangler secret put`.

**Wire the transport, do not schedule the post.** Nothing has traded, and Phase 1 is a backtest,
so a recurring daily job today would post an empty message every day and train D1 to ignore the
channel before it ever carries a real number. The recurring P&L post turns on when there is a
P&L, which is Phase 4.

**Fetch trap.** A webhook POST with no `User-Agent` header returns 403 Forbidden even when the
webhook is perfectly valid, which is indistinguishable from a revoked token. Node, Deno and
Worker `fetch` all send their own UA and are fine. To tell the two apart, GET the webhook URL
with a real UA: a 200 carrying `channel_id` and `name` means the token is good and the UA was
the problem.

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
| Kalshi introduces a maker fee on the 15m series | The whole thesis dies. Scheduled guard: re-pull the fee PDF, extract the Non-Standard table, alert if any `*15M` row appears or the maker default stops being 0. Two traps for whoever automates this. First, the PDF returns 429 to plain fetchers; a browser User-Agent plus `Referer: https://kalshi.com/` gets it. Second, it is **image-based with CID-encoded glyphs**, so naive stream inflation extracts nothing at all: use `pdfjs-dist`. The guard must **assert it extracted the known page 2 formula text** before drawing any conclusion, because an empty extraction otherwise reads as "no maker fee found" and the guard passes forever while blind. |
| Sign convention inverted | Asserted per run, see Phase 1. |
| Overfitting already-seen data | Pre-registered grid, bracket rather than point estimate, forward paper as the only confirmation. |
| Request cost | Sampling design fixed before the run, at roughly 200k requests per asset-month if pulled whole. |
| Cancels are invisible to the tape | Size ahead of you in the queue disappears without printing. This is precisely why a REST snapshot model can only **bound** rather than measure, and it is the specific thing `orderbook_delta` would buy later. Framed as a known limit of the bracket, not a defect. |
| D1's account cannot trade these series | One minute check before Phase 4: log in, open `https://kalshi.com/markets/kxbtc15m`, see whether the order ticket accepts a quantity. |

## Security

- No Kalshi API key exists anywhere in this design. Every Kalshi endpoint used is public.
- The Worker is not credential-free. It holds the Supabase service role key and two Discord
  webhook URLs, which are write credentials for those two channels. It holds nothing that can
  place a trade.
- `d1fpc3-site` is a **public** repo. Worker source lives outside it. The only value in Echelon
  is the publishable Supabase key, which is already committed there by design. Webhook URLs and
  channel ids are kept out of it too, referenced only by secret name.
- Secrets live in `C:\Users\clari\.kalshi\secrets.json` (outside OneDrive, outside every repo)
  and reach the Worker only through `wrangler secret put`. If Phase 4 ever goes live, Kalshi
  keys join them there, never a repo and never chat.

## Out of scope

Weather series, the `weather-ai` Claude overlay, real order placement, the authenticated
WebSocket, and any **recurring** Discord post. Each is a separate decision after the bracket
reports.
