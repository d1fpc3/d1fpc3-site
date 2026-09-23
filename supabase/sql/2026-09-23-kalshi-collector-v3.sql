-- Kalshi collector v3: the edge hunt, and the paper trades that test it.
-- Applied 2026-09-23 on top of v1 and v2. Idempotent.
--
-- Four investigations found no edge because they tested strategies. This tests the
-- market: where, across 400k scored minutes, does the empirical hit rate beat the price
-- you would actually pay? Every night:
--
--   1. kalshi_edge_cells as of day D: every (series, minutes-to-close, cell) over the
--      trailing 30 days with 200+ rounds where the Wilson 99.9% lower bound of the hit
--      rate exceeds the mean ASK in that cell plus the taker fee. Strict on purpose:
--      1,000+ cells means dozens of false positives at 95%.
--   2. kalshi_paper_trades for day D+1: every round whose minutes land in a cell flagged
--      as of D gets ONE paper trade at that minute's real ask, $10 clip, fee charged,
--      settled by the exchange result. Out of sample by construction.
--   3. kalshi_daily carries the day's paper count and P&L.
--
-- The only number that counts is the cumulative paper P&L. Cells are hypotheses.

-- ─── tables ─────────────────────────────────────────────────────────────────

create table if not exists public.kalshi_edge_cells (
  as_of        date    not null,
  series       text    not null,
  key          text    not null,          -- 'band' (mid band) or 'dist' (bps from open)
  mtc_bucket   text    not null,
  cell         text    not null,
  side         text    not null,          -- 'yes' or 'no': what to buy
  n            int     not null,          -- rounds (one minute per round, the first in the cell)
  hit_rate     numeric not null,          -- of YES
  lo           numeric not null,          -- Wilson lower bound (z = 3.09) of the bought side's win rate
  mean_ask     numeric not null,          -- what you would pay for the bought side
  fee          numeric not null,          -- taker fee per contract at that ask
  ev_lo        numeric not null,          -- lo - mean_ask - fee: edge per contract at the lower bound
  ev_mean      numeric not null,
  window_days  int     not null,
  primary key (as_of, series, key, mtc_bucket, cell, side, window_days)
);

create table if not exists public.kalshi_paper_trades (
  ticker       text    not null references public.kalshi_rounds (ticker) on delete cascade,
  minute_utc   timestamptz not null,
  as_of        date    not null,          -- the day the round closed (scored day)
  cells_as_of  date    not null,          -- the edge table that triggered it
  series       text    not null,
  key          text    not null,
  mtc_bucket   text    not null,
  cell         text    not null,
  side         text    not null,
  price        numeric not null,          -- the real ask at that minute
  contracts    int     not null,
  cost         numeric not null,
  fee          numeric not null,
  won          boolean,
  pnl          numeric,                   -- net of fee, null until settled
  primary key (ticker)                    -- one trade per round
);
create index if not exists kalshi_paper_trades_as_of on public.kalshi_paper_trades (as_of);

alter table public.kalshi_daily add column if not exists paper_trades int;
alter table public.kalshi_daily add column if not exists paper_pnl    numeric;
alter table public.kalshi_daily add column if not exists paper_cost   numeric;
alter table public.kalshi_daily add column if not exists edge_cells   int;

alter table public.kalshi_edge_cells   enable row level security;
alter table public.kalshi_paper_trades enable row level security;
drop policy if exists kalshi_edge_cells_admin_read   on public.kalshi_edge_cells;
drop policy if exists kalshi_paper_trades_admin_read on public.kalshi_paper_trades;
create policy kalshi_edge_cells_admin_read   on public.kalshi_edge_cells   for select to authenticated using ((select is_admin()));
create policy kalshi_paper_trades_admin_read on public.kalshi_paper_trades for select to authenticated using ((select is_admin()));
revoke all on public.kalshi_edge_cells, public.kalshi_paper_trades from anon, public;
grant select on public.kalshi_edge_cells, public.kalshi_paper_trades to authenticated;
grant all on public.kalshi_edge_cells, public.kalshi_paper_trades to service_role;

-- ─── helpers ────────────────────────────────────────────────────────────────

-- Taker fee per contract: 0.07 x P x (1 - P), the published general schedule.
create or replace function public.kalshi_taker_fee(p numeric)
returns numeric language sql immutable as $$
  select 0.07 * p * (1 - p)
$$;

-- Wilson score interval bounds for k successes in n trials at z (one number each).
create or replace function public.kalshi_wilson_lo(k numeric, n numeric, z numeric default 3.09)
returns numeric language sql immutable as $$
  select case when n <= 0 then 0 else
    ((k / n) + z * z / (2 * n) - z * sqrt((k / n) * (1 - k / n) / n + z * z / (4 * n * n))) / (1 + z * z / n) end
$$;
create or replace function public.kalshi_wilson_hi(k numeric, n numeric, z numeric default 3.09)
returns numeric language sql immutable as $$
  select case when n <= 0 then 1 else
    ((k / n) + z * z / (2 * n) + z * sqrt((k / n) * (1 - k / n) / n + z * z / (4 * n * n))) / (1 + z * z / n) end
$$;

-- ─── the nightly edge pass ──────────────────────────────────────────────────

-- Runs after kalshi_calibrate(v_day) has scored the day. Two steps in this order:
-- paper-trade v_day with the cells as of v_day - 1, then rebuild the cells as of v_day.
create or replace function public.kalshi_edge(p_as_of date)
returns table (edge_cells int, paper_trades int, paper_pnl numeric)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_day date := p_as_of;
  v_clip numeric := 10;                    -- dollars per round
  v_min_n int := 200;
  v_z numeric := 3.09;                     -- one-sided 99.9%
  v_cells int := 0; v_trades int := 0; v_pnl numeric := 0;
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

  -- 2. Rebuild the cells as of v_day over the trailing 30 days.
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
      select c.series, c.key, c.mtcb, c.cell, c.n, c.hits, c.hits / c.n as hit_rate, c.mean_yes_ask, c.mean_no_ask, sd.side
      from (
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
        having count(*) >= v_min_n
      ) c
      cross join (values ('yes'), ('no')) as sd(side)
    ) w
  ) g
  where lo - mean_ask - fee > 0;
  get diagnostics v_cells = row_count;

  update kalshi_daily d set paper_trades = v_trades, paper_pnl = v_pnl, edge_cells = v_cells,
         paper_cost = (select coalesce(sum(cost), 0) from kalshi_paper_trades where as_of = v_day)
  where d.as_of = v_day and d.series = 'ALL';

  return query select v_cells, v_trades, v_pnl;
end $$;

revoke all on function public.kalshi_edge(date) from public, anon;
grant execute on function public.kalshi_edge(date) to service_role;

-- ─── calibrate calls edge ───────────────────────────────────────────────────

-- Same body as v2 plus the edge pass at the end. The return gains the paper numbers.
drop function if exists public.kalshi_calibrate(date);
create or replace function public.kalshi_calibrate(p_as_of date default null)
returns table (series text, rounds_settled int, brier_mid numeric, brier_calibrated numeric, brier_dist numeric, paper_trades int, paper_pnl numeric, edge_cells int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_day date := coalesce(p_as_of, ((now() at time zone 'utc')::date - 1));
begin
  create temp table _snaps on commit drop as
  select r.series, r.ticker, s.minute_utc, s.mid, s.spread,
         least(s.top5_yes, s.top5_no) as depth,
         r.settlement_value as y,
         floor(extract(epoch from (r.close_time - s.minute_utc)) / 60)::int as mtc,
         case when sp.price is not null and so.price is not null and so.price > 0
              then (sp.price - so.price) / so.price * 10000 end as bps
  from kalshi_rounds r
  join kalshi_book_snaps s using (ticker)
  left join kalshi_spot sp on sp.asset = kalshi_asset(r.series) and sp.minute_utc = s.minute_utc
  left join kalshi_spot so on so.asset = kalshi_asset(r.series) and so.minute_utc = r.open_time
  where r.result is not null and r.settlement_value is not null and s.mid is not null
    and (r.close_time at time zone 'utc')::date = v_day
    and s.minute_utc >= r.close_time - interval '15 minutes'
    and s.minute_utc <  r.close_time;

  if not exists (select 1 from _snaps) then
    return;
  end if;

  create temp table _scored on commit drop as
  select x.*,
         kalshi_mtc_bucket(x.mtc)  as mtcb,
         kalshi_band(x.mid)        as band,
         kalshi_dist_bucket(x.bps) as distb,
         coalesce(c.hit_rate, x.mid) as p_cal,
         coalesce(d.hit_rate, da.hit_rate, x.mid) as p_dist
  from _snaps x
  left join kalshi_calibration c
    on  c.as_of = v_day - 1 and c.window_days = 30 and c.n >= 30
    and c.series = x.series and c.mtc_bucket = kalshi_mtc_bucket(x.mtc) and c.band = kalshi_band(x.mid)
  left join kalshi_calibration_dist d
    on  d.as_of = v_day - 1 and d.window_days = 30 and d.n >= 30
    and d.series = x.series and d.mtc_bucket = kalshi_mtc_bucket(x.mtc) and d.dist_bucket = kalshi_dist_bucket(x.bps)
  left join kalshi_calibration_dist da
    on  da.as_of = v_day - 1 and da.window_days = 30 and da.n >= 30
    and da.series = 'ALL' and da.mtc_bucket = kalshi_mtc_bucket(x.mtc) and da.dist_bucket = kalshi_dist_bucket(x.bps);

  insert into kalshi_daily
    (as_of, series, rounds_settled, snaps, tape_minutes, coverage,
     brier_mid, brier_calibrated, brier_dist,
     logloss_mid, logloss_calibrated, logloss_dist,
     mean_spread, mean_depth, spot_coverage, mean_abs_bps, computed_at)
  select v_day, coalesce(g.series, 'ALL'),
         count(distinct g.ticker), count(*),
         (select count(*) from kalshi_tape_minutes t where t.ticker in (select distinct ticker from _scored z where g.series is null or z.series = g.series)),
         count(*)::numeric / nullif(count(distinct g.ticker) * 15, 0),
         avg((g.mid    - g.y) ^ 2),
         avg((g.p_cal  - g.y) ^ 2),
         avg((g.p_dist - g.y) ^ 2),
         avg(-(g.y * ln(greatest(g.mid,    1e-6)) + (1 - g.y) * ln(greatest(1 - g.mid,    1e-6)))),
         avg(-(g.y * ln(greatest(g.p_cal,  1e-6)) + (1 - g.y) * ln(greatest(1 - g.p_cal,  1e-6)))),
         avg(-(g.y * ln(greatest(g.p_dist, 1e-6)) + (1 - g.y) * ln(greatest(1 - g.p_dist, 1e-6)))),
         avg(g.spread), avg(g.depth),
         count(g.bps)::numeric / nullif(count(*), 0),
         avg(abs(g.bps)),
         now()
  from _scored g
  group by grouping sets ((g.series), ())
  on conflict (as_of, series) do update set
    rounds_settled = excluded.rounds_settled, snaps = excluded.snaps,
    tape_minutes = excluded.tape_minutes, coverage = excluded.coverage,
    brier_mid = excluded.brier_mid, brier_calibrated = excluded.brier_calibrated, brier_dist = excluded.brier_dist,
    logloss_mid = excluded.logloss_mid, logloss_calibrated = excluded.logloss_calibrated, logloss_dist = excluded.logloss_dist,
    mean_spread = excluded.mean_spread, mean_depth = excluded.mean_depth,
    spot_coverage = excluded.spot_coverage, mean_abs_bps = excluded.mean_abs_bps,
    computed_at = now();

  delete from kalshi_calibration where as_of = v_day and window_days = 30;
  insert into kalshi_calibration
    (as_of, series, mtc_bucket, band, n, mean_mid, hit_rate, brier_mid, mean_spread, mean_depth, window_days)
  select v_day, coalesce(w.series, 'ALL'), w.mtcb, w.band,
         count(*), avg(w.mid), avg(w.y), avg((w.mid - w.y) ^ 2), avg(w.spread), avg(w.depth), 30
  from (
    select r.series, s.mid, s.spread, least(s.top5_yes, s.top5_no) as depth, r.settlement_value as y,
           kalshi_mtc_bucket(floor(extract(epoch from (r.close_time - s.minute_utc)) / 60)::int) as mtcb,
           kalshi_band(s.mid) as band
    from kalshi_rounds r
    join kalshi_book_snaps s using (ticker)
    where r.result is not null and r.settlement_value is not null and s.mid is not null
      and (r.close_time at time zone 'utc')::date between v_day - 29 and v_day
      and s.minute_utc >= r.close_time - interval '15 minutes'
      and s.minute_utc <  r.close_time
  ) w
  group by grouping sets ((w.series, w.mtcb, w.band), (w.mtcb, w.band));

  delete from kalshi_calibration_dist where as_of = v_day and window_days = 30;
  insert into kalshi_calibration_dist
    (as_of, series, mtc_bucket, dist_bucket, n, mean_bps, mean_mid, hit_rate, brier_mid, window_days)
  select v_day, coalesce(w.series, 'ALL'), w.mtcb, w.distb,
         count(*), avg(w.bps), avg(w.mid), avg(w.y), avg((w.mid - w.y) ^ 2), 30
  from (
    select r.series, s.mid, r.settlement_value as y,
           kalshi_mtc_bucket(floor(extract(epoch from (r.close_time - s.minute_utc)) / 60)::int) as mtcb,
           (sp.price - so.price) / so.price * 10000 as bps,
           kalshi_dist_bucket((sp.price - so.price) / so.price * 10000) as distb
    from kalshi_rounds r
    join kalshi_book_snaps s using (ticker)
    join kalshi_spot sp on sp.asset = kalshi_asset(r.series) and sp.minute_utc = s.minute_utc
    join kalshi_spot so on so.asset = kalshi_asset(r.series) and so.minute_utc = r.open_time and so.price > 0
    where r.result is not null and r.settlement_value is not null
      and (r.close_time at time zone 'utc')::date between v_day - 29 and v_day
      and s.minute_utc >= r.close_time - interval '15 minutes'
      and s.minute_utc <  r.close_time
  ) w
  group by grouping sets ((w.series, w.mtcb, w.distb), (w.mtcb, w.distb));

  -- the edge pass: paper-trade today with yesterday's cells, then rebuild the cells
  perform public.kalshi_edge(v_day);

  return query
    select d.series, d.rounds_settled, d.brier_mid, d.brier_calibrated, d.brier_dist, d.paper_trades, d.paper_pnl, d.edge_cells
    from kalshi_daily d where d.as_of = v_day order by d.series;
end $$;

revoke all on function public.kalshi_calibrate(date) from public, anon;
grant execute on function public.kalshi_calibrate(date) to service_role;

-- ─── desk views ─────────────────────────────────────────────────────────────

-- The paper book, cumulative by day, with the running total the desk plots.
create or replace view public.kalshi_paper_daily
with (security_invoker = true) as
select as_of,
       count(*)::int                         as trades,
       count(*) filter (where won)::int      as wins,
       sum(cost)                             as cost,
       sum(fee)                              as fees,
       sum(pnl)                              as pnl,
       sum(sum(pnl)) over (order by as_of)   as pnl_cum
from public.kalshi_paper_trades
where pnl is not null
group by as_of;
grant select on public.kalshi_paper_daily to authenticated, service_role;
revoke all on public.kalshi_paper_daily from anon, public;
