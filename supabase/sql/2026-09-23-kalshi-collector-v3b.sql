-- v3b: the edge pass reports its denominator, and the scoring path cannot time out.
-- Applied 2026-09-23 on top of v3. Idempotent.
--
-- * kalshi_daily.cells_tested: how many (series, key, minutes-to-close, cell) candidates
--   met the n floor that night, both sides counted. A reader can then see that ~1,000
--   candidates at z = 3.09 still yields about one false flag per pass by chance, and that
--   daily re-scans over overlapping 30-day windows let a chance flag persist for weeks.
--   The next-day paper trade is the answer to that; this just shows the denominator.
-- * service_role statement_timeout: PostgREST connects as `authenticator` (8s) and
--   supautils applies the target role's own settings on SET ROLE, so a role with no
--   setting inherits the 8s. kalshi_calibrate() over a full month runs far longer than
--   that through the backfill's RPC path. Verified: a 12s pg_sleep through PostgREST
--   as service_role died at 8.2s before, and passes after. The nightly pg_cron job runs
--   as postgres and was never affected.

alter role service_role set statement_timeout = '900s';

alter table public.kalshi_daily add column if not exists cells_tested int;

-- the return row gains cells_tested, and Postgres will not change a function's row
-- type in place; kalshi_calibrate() resolves the name at run time, so the drop is safe
drop function if exists public.kalshi_edge(date);
create or replace function public.kalshi_edge(p_as_of date)
returns table (edge_cells int, paper_trades int, paper_pnl numeric, cells_tested int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_day date := p_as_of;
  v_clip numeric := 10;                    -- dollars per round
  v_min_n int := 200;
  v_z numeric := 3.09;                     -- one-sided 99.9%
  v_cells int := 0; v_trades int := 0; v_pnl numeric := 0; v_tested int := 0;
begin
  -- One row per round per (key, mtc bucket, cell): the FIRST minute of the round that
  -- landed there, with the asks at that minute. Both keys, all series, v_day only.
  create temp table _m on commit drop as
  select * from (
    select r.series, r.ticker, r.close_time, r.settlement_value as y,
           s.minute_utc, s.mid, s.yes_ask, s.yes_bid,
           k.key, kalshi_mtc_bucket(floor(extract(epoch from (r.close_time - s.minute_utc)) / 60)::int) as mtcb,
           k.cell,
           row_number() over (partition by r.ticker, k.key, kalshi_mtc_bucket(floor(extract(epoch from (r.close_time - s.minute_utc)) / 60)::int), k.cell order by s.minute_utc) as rn
    from kalshi_rounds r
    join kalshi_book_snaps s using (ticker)
    left join kalshi_spot sp on sp.asset = kalshi_asset(r.series) and sp.minute_utc = s.minute_utc
    left join kalshi_spot so on so.asset = kalshi_asset(r.series) and so.minute_utc = r.open_time and so.price > 0
    cross join lateral (
      values ('band', kalshi_band(s.mid)),
             ('dist', case when sp.price is not null and so.price is not null then kalshi_dist_bucket((sp.price - so.price) / so.price * 10000) end)
    ) as k(key, cell)
    where r.result is not null and r.settlement_value is not null
      and s.mid is not null and s.yes_ask is not null and s.yes_bid is not null
      and s.yes_ask > 0 and s.yes_ask < 1 and s.yes_bid > 0 and s.yes_bid < 1
      and k.cell is not null
      and (r.close_time at time zone 'utc')::date = v_day
      and s.minute_utc >= r.close_time - interval '15 minutes'
      and s.minute_utc <  r.close_time
  ) q where rn = 1;

  -- 1. Paper-trade v_day with the cells as of the day before. One trade per round: the
  --    earliest minute that lands in any flagged cell, at that minute's real ask.
  delete from kalshi_paper_trades where as_of = v_day;
  insert into kalshi_paper_trades
    (ticker, minute_utc, as_of, cells_as_of, series, key, mtc_bucket, cell, side, price, contracts, cost, fee, won, pnl)
  select ticker, minute_utc, v_day, v_day - 1, series, key, mtcb, cell, side, price, contracts,
         contracts * price, contracts * kalshi_taker_fee(price), won,
         contracts * (case when won then 1 - price else -price end) - contracts * kalshi_taker_fee(price)
  from (
    select distinct on (m.ticker)
           m.ticker, m.minute_utc, m.series, m.key, m.mtcb, m.cell, e.side,
           case when e.side = 'yes' then m.yes_ask else 1 - m.yes_bid end as price,
           floor(v_clip / (case when e.side = 'yes' then m.yes_ask else 1 - m.yes_bid end))::int as contracts,
           case when e.side = 'yes' then m.y = 1 else m.y = 0 end as won
    from _m m
    join kalshi_edge_cells e
      on  e.as_of = v_day - 1 and e.window_days = 30
      and e.series = m.series and e.key = m.key and e.mtc_bucket = m.mtcb and e.cell = m.cell
    order by m.ticker, m.minute_utc
  ) t
  where contracts > 0;
  get diagnostics v_trades = row_count;
  select coalesce(sum(pnl), 0) into v_pnl from kalshi_paper_trades where as_of = v_day;

  -- 2. Candidates over the trailing 30 days: every cell that meets the n floor.
  create temp table _cand on commit drop as
  select series, key, mtcb, cell,
         count(*)::numeric as n, sum(y)::numeric as hits,
         avg(yes_ask) as mean_yes_ask, avg(1 - yes_bid) as mean_no_ask
  from (
    select * from (
      select r.series, r.ticker, r.settlement_value as y, s.minute_utc, s.yes_ask, s.yes_bid,
             k.key, kalshi_mtc_bucket(floor(extract(epoch from (r.close_time - s.minute_utc)) / 60)::int) as mtcb, k.cell,
             row_number() over (partition by r.ticker, k.key, kalshi_mtc_bucket(floor(extract(epoch from (r.close_time - s.minute_utc)) / 60)::int), k.cell order by s.minute_utc) as rn
      from kalshi_rounds r
      join kalshi_book_snaps s using (ticker)
      left join kalshi_spot sp on sp.asset = kalshi_asset(r.series) and sp.minute_utc = s.minute_utc
      left join kalshi_spot so on so.asset = kalshi_asset(r.series) and so.minute_utc = r.open_time and so.price > 0
      cross join lateral (
        values ('band', kalshi_band(s.mid)),
               ('dist', case when sp.price is not null and so.price is not null then kalshi_dist_bucket((sp.price - so.price) / so.price * 10000) end)
      ) as k(key, cell)
      where r.result is not null and r.settlement_value is not null
        and s.mid is not null and s.yes_ask is not null and s.yes_bid is not null
        and s.yes_ask > 0 and s.yes_ask < 1 and s.yes_bid > 0 and s.yes_bid < 1
        and k.cell is not null
        and (r.close_time at time zone 'utc')::date between v_day - 29 and v_day
        and s.minute_utc >= r.close_time - interval '15 minutes'
        and s.minute_utc <  r.close_time
    ) z where rn = 1
  ) f
  group by series, key, mtcb, cell
  having count(*) >= v_min_n;
  select count(*) * 2 into v_tested from _cand;    -- both sides are tested per candidate

  -- 3. Flag the ones where the bought side's win rate, at its lower bound, beats the ask
  --    plus the fee. Both sides: buy YES at the yes ask, or buy NO at (1 - yes bid).
  delete from kalshi_edge_cells where as_of = v_day and window_days = 30;
  insert into kalshi_edge_cells
    (as_of, series, key, mtc_bucket, cell, side, n, hit_rate, lo, mean_ask, fee, ev_lo, ev_mean, window_days)
  select v_day, series, key, mtcb, cell, side, n, hit_rate, lo, mean_ask, fee,
         lo - mean_ask - fee, win_mean - mean_ask - fee, 30
  from (
    select w.*,
           case when side = 'yes' then kalshi_wilson_lo(hits, n, v_z) else 1 - kalshi_wilson_hi(hits, n, v_z) end as lo,
           case when side = 'yes' then hit_rate else 1 - hit_rate end as win_mean,
           case when side = 'yes' then mean_yes_ask else mean_no_ask end as mean_ask,
           kalshi_taker_fee(case when side = 'yes' then mean_yes_ask else mean_no_ask end) as fee
    from (
      select c.*, c.hits / c.n as hit_rate, sd.side
      from _cand c
      cross join (values ('yes'), ('no')) as sd(side)
    ) w
  ) g
  where lo - mean_ask - fee > 0;
  get diagnostics v_cells = row_count;

  update kalshi_daily d set paper_trades = v_trades, paper_pnl = v_pnl, edge_cells = v_cells, cells_tested = v_tested,
         paper_cost = (select coalesce(sum(cost), 0) from kalshi_paper_trades where as_of = v_day)
  where d.as_of = v_day and d.series = 'ALL';

  return query select v_cells, v_trades, v_pnl, v_tested;
end $$;

revoke all on function public.kalshi_edge(date) from public, anon;
grant execute on function public.kalshi_edge(date) to service_role;
