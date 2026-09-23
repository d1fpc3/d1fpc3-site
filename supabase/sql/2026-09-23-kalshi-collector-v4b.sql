-- v4b: the scoring functions are re-entrant within one transaction.
-- Applied 2026-09-23. Idempotent.
--
-- Their temp tables are ON COMMIT DROP, which is fine when each day is its own call
-- (pg_cron, the backfill's RPC path) and fails on the second day of a DO-loop that
-- scores a month in one transaction: "relation _snaps already exists". Dropping first
-- makes both paths work.

create or replace function public.kalshi_calibrate_prep()
returns void language plpgsql as $$
begin
  drop table if exists _snaps; drop table if exists _scored;
  drop table if exists _m; drop table if exists _cand;
end $$;
revoke all on function public.kalshi_calibrate_prep() from public, anon;
grant execute on function public.kalshi_calibrate_prep() to service_role;

-- Wrap: the bodies stay as v4; only the first statement changes. Re-created in full so
-- this file stands alone if v4 is ever re-applied after it.
create or replace function public.kalshi_edge(p_as_of date)
returns table (edge_cells int, paper_trades int, paper_pnl numeric, cells_tested int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_day date := p_as_of;
  v_clip numeric := 10;
  v_min_n int := 200;
  v_z numeric := 3.09;
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
  where lo - mean_ask - fee > 0;
  get diagnostics v_cells = row_count;

  update kalshi_daily d set paper_trades = v_trades, paper_pnl = v_pnl, edge_cells = v_cells, cells_tested = v_tested,
         paper_cost = (select coalesce(sum(cost), 0) from kalshi_paper_trades where as_of = v_day)
  where d.as_of = v_day and d.series = 'ALL';

  return query select v_cells, v_trades, v_pnl, v_tested;
end $$;
revoke all on function public.kalshi_edge(date) from public, anon;
grant execute on function public.kalshi_edge(date) to service_role;

create or replace function public.kalshi_calibrate(p_as_of date default null)
returns table (series text, rounds_settled int, brier_mid numeric, brier_calibrated numeric, brier_dist numeric, paper_trades int, paper_pnl numeric, edge_cells int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_day date := coalesce(p_as_of, ((now() at time zone 'utc')::date - 1));
begin
  drop table if exists _snaps; drop table if exists _scored;
  perform public.kalshi_features_build(v_day);

  create temp table _snaps on commit drop as
  select r.series, r.ticker, s.minute_utc, s.mid, s.spread,
         least(s.top5_yes, s.top5_no) as depth,
         r.settlement_value as y,
         f.mtc, f.bps
  from kalshi_rounds r
  join kalshi_book_snaps s using (ticker)
  join kalshi_features f on f.ticker = s.ticker and f.minute_utc = s.minute_utc
  where r.result is not null and r.settlement_value is not null and s.mid is not null
    and (r.close_time at time zone 'utc')::date = v_day;

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
           kalshi_mtc_bucket(f.mtc) as mtcb, kalshi_band(s.mid) as band
    from kalshi_rounds r
    join kalshi_book_snaps s using (ticker)
    join kalshi_features f on f.ticker = s.ticker and f.minute_utc = s.minute_utc
    where r.result is not null and r.settlement_value is not null and s.mid is not null
      and (r.close_time at time zone 'utc')::date between v_day - 29 and v_day
  ) w
  group by grouping sets ((w.series, w.mtcb, w.band), (w.mtcb, w.band));

  delete from kalshi_calibration_dist where as_of = v_day and window_days = 30;
  insert into kalshi_calibration_dist
    (as_of, series, mtc_bucket, dist_bucket, n, mean_bps, mean_mid, hit_rate, brier_mid, window_days)
  select v_day, coalesce(w.series, 'ALL'), w.mtcb, w.distb,
         count(*), avg(w.bps), avg(w.mid), avg(w.y), avg((w.mid - w.y) ^ 2), 30
  from (
    select r.series, s.mid, r.settlement_value as y,
           kalshi_mtc_bucket(f.mtc) as mtcb, f.bps, kalshi_dist_bucket(f.bps) as distb
    from kalshi_rounds r
    join kalshi_book_snaps s using (ticker)
    join kalshi_features f on f.ticker = s.ticker and f.minute_utc = s.minute_utc
    where r.result is not null and r.settlement_value is not null and s.mid is not null and f.bps is not null
      and (r.close_time at time zone 'utc')::date between v_day - 29 and v_day
  ) w
  group by grouping sets ((w.series, w.mtcb, w.distb), (w.mtcb, w.distb));

  perform public.kalshi_edge(v_day);

  return query
    select d.series, d.rounds_settled, d.brier_mid, d.brier_calibrated, d.brier_dist, d.paper_trades, d.paper_pnl, d.edge_cells
    from kalshi_daily d where d.as_of = v_day order by d.series;
end $$;
revoke all on function public.kalshi_calibrate(date) from public, anon;
grant execute on function public.kalshi_calibrate(date) to service_role;
