-- Kalshi collector v5: the edge hunt gets an economics floor.
-- Applied 2026-09-23 on top of v4b. Idempotent. Only kalshi_edge() changes.
--
-- The month's single flag (BTC, 10..20 bps, 6 to 8 minutes, buy YES at 0.85) cleared the
-- statistical bar with a floor edge of +0.02 cents per contract and lost $3.53 on paper the
-- next day. Significance and worth-doing are different tests. A cell now needs at least
-- half a cent of edge per contract AT THE LOWER BOUND, on top of the 99.9% bar and the
-- 200-round floor. Fixed here, before seeing the ten-series month, and not to be moved.

create or replace function public.kalshi_edge(p_as_of date)
returns table (edge_cells int, paper_trades int, paper_pnl numeric, cells_tested int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_day date := p_as_of;
  v_clip numeric := 10;
  v_min_n int := 200;
  v_z numeric := 3.09;
  v_min_ev numeric := 0.005;             -- half a cent per contract at the lower bound: an economics floor, not just significance
  v_cells int := 0; v_trades int := 0; v_pnl numeric := 0; v_tested int := 0;
begin
  drop table if exists _m; drop table if exists _cand;
  create temp table _m on commit drop as
  select * from (
    select r.series, r.ticker, r.close_time, r.settlement_value as y,
           s.minute_utc, s.mid, s.yes_ask, s.yes_bid,
           k.key, kalshi_mtc_bucket(f.mtc) as mtcb, k.cell,
           row_number() over (partition by r.ticker, k.key, kalshi_mtc_bucket(f.mtc), k.cell order by s.minute_utc) as rn
    from kalshi_rounds r
    join kalshi_book_snaps s using (ticker)
    join kalshi_features f on f.ticker = s.ticker and f.minute_utc = s.minute_utc
    cross join lateral (
      values ('band', kalshi_band(s.mid)), ('dist', kalshi_dist_bucket(f.bps)), ('mom', kalshi_mom_bucket(f.mom_bps))
    ) as k(key, cell)
    where r.result is not null and r.settlement_value is not null
      and s.mid is not null and s.yes_ask is not null and s.yes_bid is not null
      and s.yes_ask > 0 and s.yes_ask < 1 and s.yes_bid > 0 and s.yes_bid < 1
      and k.cell is not null
      and (r.close_time at time zone 'utc')::date = v_day
  ) q where rn = 1;

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

  create temp table _cand on commit drop as
  select series, key, mtcb, cell,
         count(*)::numeric as n, sum(y)::numeric as hits,
         avg(yes_ask) as mean_yes_ask, avg(1 - yes_bid) as mean_no_ask
  from (
    select * from (
      select r.series, r.ticker, r.settlement_value as y, s.minute_utc, s.yes_ask, s.yes_bid,
             k.key, kalshi_mtc_bucket(f.mtc) as mtcb, k.cell,
             row_number() over (partition by r.ticker, k.key, kalshi_mtc_bucket(f.mtc), k.cell order by s.minute_utc) as rn
      from kalshi_rounds r
      join kalshi_book_snaps s using (ticker)
      join kalshi_features f on f.ticker = s.ticker and f.minute_utc = s.minute_utc
      cross join lateral (
        values ('band', kalshi_band(s.mid)), ('dist', kalshi_dist_bucket(f.bps)), ('mom', kalshi_mom_bucket(f.mom_bps))
      ) as k(key, cell)
      where r.result is not null and r.settlement_value is not null
        and s.mid is not null and s.yes_ask is not null and s.yes_bid is not null
        and s.yes_ask > 0 and s.yes_ask < 1 and s.yes_bid > 0 and s.yes_bid < 1
        and k.cell is not null
        and (r.close_time at time zone 'utc')::date between v_day - 29 and v_day
    ) z where rn = 1
  ) f2
  group by series, key, mtcb, cell
  having count(*) >= v_min_n;
  select count(*) * 2 into v_tested from _cand;

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
  where lo - mean_ask - fee >= v_min_ev;
  get diagnostics v_cells = row_count;

  update kalshi_daily d set paper_trades = v_trades, paper_pnl = v_pnl, edge_cells = v_cells, cells_tested = v_tested,
         paper_cost = (select coalesce(sum(cost), 0) from kalshi_paper_trades where as_of = v_day)
  where d.as_of = v_day and d.series = 'ALL';

  return query select v_cells, v_trades, v_pnl, v_tested;
end $$;
revoke all on function public.kalshi_edge(date) from public, anon;
grant execute on function public.kalshi_edge(date) to service_role;
