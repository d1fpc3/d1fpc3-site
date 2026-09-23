-- Kalshi collector v2: spot prices, the distance model, and rows that came from candles.
-- Applied 2026-09-23 on top of 2026-09-23-kalshi-collector.sql. Idempotent.
--
-- What changed and why:
--   * kalshi_spot: one price per asset per minute (Coinbase, PAXG-USD standing in for
--     gold). Distance from the round's open price is THE feature for "will price be up
--     in 15 minutes", and it was missing.
--   * kalshi_book_snaps.src: 'live' (the collector saw the book) or 'candle' (rebuilt
--     from Kalshi's 1-minute candles by the backfill). Candle rows carry bid/ask/mid but
--     no depth. Their minute_utc is the candle's END, which is the instant the live
--     collector reads the book, so the two line up with no skew.
--   * kalshi_calibration_dist: hit rate by (series, minutes-to-close, distance bucket).
--     A forecast built from nothing but accumulated outcomes. kalshi_daily scores it out
--     of sample as brier_dist, next to the market mid and the mid-calibrated line.
--   * Buckets with fewer than 30 rounds fall back rather than inject noise.

-- ─── spot ───────────────────────────────────────────────────────────────────

create table if not exists public.kalshi_spot (
  asset       text        not null,   -- BTC, ETH, DOGE, GOLD, SOL, XRP, BNB, HYPE, NEAR, ZEC
  minute_utc  timestamptz not null,
  price       numeric     not null,
  source      text        not null default 'coinbase',
  primary key (asset, minute_utc)
);
alter table public.kalshi_spot enable row level security;
drop policy if exists kalshi_spot_admin_read on public.kalshi_spot;
create policy kalshi_spot_admin_read on public.kalshi_spot for select to authenticated using ((select is_admin()));
revoke all on public.kalshi_spot from anon, public;
grant select on public.kalshi_spot to authenticated;
grant all on public.kalshi_spot to service_role;

alter table public.kalshi_book_snaps add column if not exists src text not null default 'live';
alter table public.kalshi_collector_ticks add column if not exists spots int;

-- ─── distance model ─────────────────────────────────────────────────────────

create table if not exists public.kalshi_calibration_dist (
  as_of        date    not null,
  series       text    not null,          -- or 'ALL'
  mtc_bucket   text    not null,
  dist_bucket  text    not null,          -- basis points from the round's open price
  n            int     not null,
  mean_bps     numeric not null,
  mean_mid     numeric,
  hit_rate     numeric not null,
  brier_mid    numeric,
  window_days  int     not null,
  primary key (as_of, series, mtc_bucket, dist_bucket, window_days)
);
alter table public.kalshi_calibration_dist enable row level security;
drop policy if exists kalshi_calibration_dist_admin_read on public.kalshi_calibration_dist;
create policy kalshi_calibration_dist_admin_read on public.kalshi_calibration_dist for select to authenticated using ((select is_admin()));
revoke all on public.kalshi_calibration_dist from anon, public;
grant select on public.kalshi_calibration_dist to authenticated;
grant all on public.kalshi_calibration_dist to service_role;

alter table public.kalshi_daily add column if not exists brier_dist    numeric;
alter table public.kalshi_daily add column if not exists logloss_dist  numeric;
alter table public.kalshi_daily add column if not exists spot_coverage numeric;   -- share of scored minutes that had a spot price
alter table public.kalshi_daily add column if not exists mean_abs_bps  numeric;

create or replace function public.kalshi_asset(series text)
returns text language sql immutable as $$
  select regexp_replace(series, '^KX(.*)15M$', '\1')
$$;

-- Symmetric buckets in basis points. A 15-minute crypto move is usually 5 to 30 bps.
create or replace function public.kalshi_dist_bucket(bps numeric)
returns text language sql immutable as $$
  select case
    when bps is null then null
    when bps < -50 then '<-50'
    when bps < -20 then '-50..-20'
    when bps < -10 then '-20..-10'
    when bps <  -5 then '-10..-5'
    when bps <   0 then '-5..0'
    when bps <   5 then '0..5'
    when bps <  10 then '5..10'
    when bps <  20 then '10..20'
    when bps <  50 then '20..50'
    else '>50' end
$$;

-- ─── the daily job, v2 ──────────────────────────────────────────────────────

drop function if exists public.kalshi_calibrate(date);
create or replace function public.kalshi_calibrate(p_as_of date default null)
returns table (series text, rounds_settled int, brier_mid numeric, brier_calibrated numeric, brier_dist numeric)
language plpgsql security definer set search_path = public as $$
-- RETURNS TABLE names double as variables and collide with same-named columns inside
-- the INSERTs ("series is ambiguous"), at first execution, not at CREATE. Columns win.
#variable_conflict use_column
declare
  v_day date := coalesce(p_as_of, ((now() at time zone 'utc')::date - 1));
begin
  -- Every scored minute of every round that closed on v_day and has a result. Distance
  -- is measured from the same feed's price at the round's open minute, not from the
  -- exchange strike, so a feed's basis to the settlement index cancels within a round.
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

  -- Three forecasts per minute, two of them out of sample by construction (they use the
  -- tables as they stood the day BEFORE). Thin buckets (< 30 rounds) fall back: the
  -- distance model to its pooled row, then to the mid; the mid table to the mid.
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
    and c.series = x.series
    and c.mtc_bucket = kalshi_mtc_bucket(x.mtc)
    and c.band = kalshi_band(x.mid)
  left join kalshi_calibration_dist d
    on  d.as_of = v_day - 1 and d.window_days = 30 and d.n >= 30
    and d.series = x.series
    and d.mtc_bucket = kalshi_mtc_bucket(x.mtc)
    and d.dist_bucket = kalshi_dist_bucket(x.bps)
  left join kalshi_calibration_dist da
    on  da.as_of = v_day - 1 and da.window_days = 30 and da.n >= 30
    and da.series = 'ALL'
    and da.mtc_bucket = kalshi_mtc_bucket(x.mtc)
    and da.dist_bucket = kalshi_dist_bucket(x.bps);

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

  -- Rebuild both 30-day tables as of v_day.
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

  return query
    select d.series, d.rounds_settled, d.brier_mid, d.brier_calibrated, d.brier_dist
    from kalshi_daily d where d.as_of = v_day order by d.series;
end $$;

revoke all on function public.kalshi_calibrate(date) from public, anon;
grant execute on function public.kalshi_calibrate(date) to service_role;

-- ─── live view gains the spot and the open price ────────────────────────────

create or replace view public.kalshi_live
with (security_invoker = true) as
select distinct on (r.series)
       r.series, r.ticker, r.open_time, r.close_time, r.strike, r.result,
       s.minute_utc, s.yes_bid, s.yes_ask, s.mid, s.spread, s.top5_yes, s.top5_no,
       s.last_price, s.volume,
       sp.price as spot,
       so.price as spot_open,
       case when sp.price is not null and so.price > 0 then (sp.price - so.price) / so.price * 10000 end as bps
from kalshi_rounds r
left join lateral (
  select * from kalshi_book_snaps b where b.ticker = r.ticker order by b.minute_utc desc limit 1
) s on true
left join lateral (
  select price from kalshi_spot z where z.asset = kalshi_asset(r.series) order by z.minute_utc desc limit 1
) sp on true
left join kalshi_spot so on so.asset = kalshi_asset(r.series) and so.minute_utc = r.open_time
where r.close_time > now() - interval '20 minutes'
order by r.series, r.close_time desc;
grant select on public.kalshi_live to authenticated, service_role;
revoke all on public.kalshi_live from anon, public;
