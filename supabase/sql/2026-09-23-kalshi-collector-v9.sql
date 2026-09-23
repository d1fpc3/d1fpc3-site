-- Kalshi collector v9: kalshi_live_orders becomes the intent queue for every source.
-- Applied 2026-09-23 on top of v8. Idempotent.
--
-- One account, one signer. Any producer (the cell book, the signal bot's rules) writes an
-- INTENT row; the executor (worker/live.mjs) is the only thing that turns an intent into
-- an order, under one clip, one per-round rule, one open cap, one daily stop.
--
-- Contract for a producer's insert (PostgREST, service role, on_conflict=ticker,tag with
-- Prefer: resolution=ignore-duplicates so a retry is a no-op):
--   ticker      the market ticker, e.g. KXBTC15M-26SEP232345-45
--   created_at  when the call was made (the row's time; the primary key with ticker)
--   series      KXBTC15M etc.
--   key         'signal' for the signal bot; the cell book uses 'band' | 'dist' | 'mom'
--   mtc_bucket  minutes-to-close bucket at call time ('00-02' .. '12-14'), or 'n/a'
--   cell        the rule id for a signal (e.g. 'fair-fixed'); the cell for the cell book
--   side        'yes' or 'no': the side being BOUGHT
--   price       price of that side in dollars, 0.01 .. 0.99 (a NO at 0.15 is 0.15)
--   contracts   integer; the executor does not resize, it caps: cost must be <= the clip
--   cost        contracts * price, dollars
--   source      'cells' | 'signals'
--   tag         'signals:<rule-id>' or 'cells:<key>:<cell>'; unique with ticker
--   close_time  the round's close, so a stale intent can be expired instead of sent
--   status      'intent'   (the producer writes this and nothing else about outcome)
--   mode, gate_passed, gate_trades, live_switch, halted: write mode 'armed', false, 0,
--               false, false; the executor overwrites them when it processes the row
-- The executor processes each new intent ONCE, at its next pass, and sets status to one of
--   placed | rejected | armed (switch off at that moment; never re-sent later)
--   skipped (the round already has an order from any source) | expired | halted
-- then, once the round settles, filled/won/pnl and status 'settled' (or 'unfilled').

alter table public.kalshi_live_orders add column if not exists source     text not null default 'cells';
alter table public.kalshi_live_orders add column if not exists tag        text;
alter table public.kalshi_live_orders add column if not exists close_time timestamptz;
alter table public.kalshi_live_orders add column if not exists filled     int;
alter table public.kalshi_live_orders add column if not exists fee        numeric;
alter table public.kalshi_live_orders add column if not exists processed_at timestamptz;

update public.kalshi_live_orders set tag = 'cells:' || key || ':' || cell where tag is null;

create unique index if not exists kalshi_live_orders_ticker_tag on public.kalshi_live_orders (ticker, tag);
create index if not exists kalshi_live_orders_status on public.kalshi_live_orders (status) where status in ('intent', 'placed');

-- The realized book: settled live orders by day, the number the daily stop reads and the
-- desk shows. Separate from the paper book by construction.
create or replace view public.kalshi_live_daily
with (security_invoker = true) as
select (created_at at time zone 'utc')::date as day,
       source,
       count(*)::int                                   as orders,
       count(*) filter (where status = 'placed')::int  as open,
       count(*) filter (where status = 'settled')::int as settled,
       count(*) filter (where won)::int                as wins,
       sum(cost) filter (where status in ('placed', 'settled')) as cost,
       sum(pnl)                                        as pnl
from public.kalshi_live_orders
group by 1, 2;
grant select on public.kalshi_live_daily to anon, authenticated, service_role;
revoke all on public.kalshi_live_daily from public;
