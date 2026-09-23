-- Kalshi collector: a continuous dataset of the 15-minute crypto rounds, plus a
-- daily calibration that sharpens as the data accumulates.
--
-- Applied 2026-09-23 to Echelon (cqdignbleethroyxxvzr). Writer is the Cloudflare
-- Worker `kalshi-collector` (source: apps/kalshi-bot/worker, private repo) using the
-- service role. Readers are admins in the Echelon desk.
--
-- Same posture as memecoin_*: RLS on, one is_admin() read policy for authenticated,
-- service_role gets everything. Nothing here is reachable by anon.
--
-- Why a calibration table and not a strategy: four investigations found no taker or
-- maker edge in these rounds. What nobody had was the data. This records, every minute,
-- what the market said and what then happened, and once a day asks how well the market
-- mid predicted the outcome by price band and minutes-to-close. That table is the thing
-- every future question about these markets gets asked against, and it gets better on
-- its own.

-- ─── raw tables ─────────────────────────────────────────────────────────────

create table if not exists public.kalshi_rounds (
  ticker            text primary key,
  series            text not null,
  open_time         timestamptz,
  close_time        timestamptz not null,
  strike            numeric,
  result            text,                 -- 'yes' | 'no' once settled, else null
  settlement_value  numeric,              -- 1 or 0 once settled
  settled_at        timestamptz,
  first_seen        timestamptz not null default now(),
  last_seen         timestamptz not null default now()
);
create index if not exists kalshi_rounds_series_close on public.kalshi_rounds (series, close_time desc);
create index if not exists kalshi_rounds_unsettled    on public.kalshi_rounds (close_time) where result is null;

-- One row per round per minute: the top of book as the collector saw it.
create table if not exists public.kalshi_book_snaps (
  ticker        text not null references public.kalshi_rounds (ticker) on delete cascade,
  minute_utc    timestamptz not null,
  yes_bid       numeric,
  yes_ask       numeric,
  mid           numeric,
  spread        numeric,
  top5_yes      numeric,                  -- contracts resting in the five best yes-bid levels
  top5_no       numeric,
  yes_levels    jsonb,                    -- [[price, qty], ...] five best, ascending
  no_levels     jsonb,
  last_price    numeric,
  volume        numeric,
  open_interest numeric,
  primary key (ticker, minute_utc)
);
create index if not exists kalshi_book_snaps_minute on public.kalshi_book_snaps (minute_utc desc);

-- One row per round per minute: the executed tape for the minute [minute_utc, +1min).
create table if not exists public.kalshi_tape_minutes (
  ticker               text not null references public.kalshi_rounds (ticker) on delete cascade,
  minute_utc           timestamptz not null,
  trades               int     not null,
  contracts            numeric not null,
  taker_yes_contracts  numeric not null,  -- contracts where the taker bought YES
  vwap                 numeric,
  first_price          numeric,
  last_price           numeric,
  low                  numeric,
  high                 numeric,
  pages                int     not null default 1,
  truncated            boolean not null default false,   -- hit the page cap; counts are a floor
  primary key (ticker, minute_utc)
);

-- One row per collector run. Coverage and health come from here.
create table if not exists public.kalshi_collector_ticks (
  ran_at        timestamptz primary key,
  series_count  int,
  rounds        int,
  snaps         int,
  tape_rows     int,
  settled       int,
  ms            int,
  errors        jsonb
);

-- ─── derived tables ─────────────────────────────────────────────────────────

-- 30-day calibration as of a day: for (series, minutes-to-close bucket, mid band),
-- how often did YES actually happen. series 'ALL' pools every series.
create table if not exists public.kalshi_calibration (
  as_of        date    not null,
  series       text    not null,
  mtc_bucket   text    not null,          -- '00-02' | '03-05' | '06-08' | '09-11' | '12-14'
  band         text    not null,          -- '0.0' .. '0.9', floor(mid * 10) / 10
  n            int     not null,
  mean_mid     numeric not null,
  hit_rate     numeric not null,          -- mean(settlement_value): the calibrated probability
  brier_mid    numeric not null,
  mean_spread  numeric,                   -- book thins toward close, so near-close buckets carry wider spreads
  mean_depth   numeric,                   -- least(top5_yes, top5_no): the binding side; spread and depth diverge on one-sided books
  window_days  int     not null,
  primary key (as_of, series, mtc_bucket, band, window_days)
);
alter table public.kalshi_calibration add column if not exists mean_spread numeric;
alter table public.kalshi_calibration add column if not exists mean_depth  numeric;

-- One row per day per series: how well the market mid forecast that day's rounds,
-- and how well the PRIOR day's calibration table would have corrected it. The gap
-- between those two columns over time is the learning curve.
create table if not exists public.kalshi_daily (
  as_of              date    not null,
  series             text    not null,   -- or 'ALL'
  rounds_settled     int,
  snaps              int,
  tape_minutes       int,
  coverage           numeric,            -- snaps / (rounds_settled * 15)
  brier_mid          numeric,
  brier_calibrated   numeric,            -- out of sample: uses the table as of the day before
  logloss_mid        numeric,
  logloss_calibrated numeric,
  mean_spread        numeric,            -- so a worse near-close Brier can be read against the book, not blamed on calibration
  mean_depth         numeric,
  computed_at        timestamptz not null default now(),
  primary key (as_of, series)
);
alter table public.kalshi_daily add column if not exists mean_spread numeric;
alter table public.kalshi_daily add column if not exists mean_depth  numeric;

-- ─── helpers ────────────────────────────────────────────────────────────────

create or replace function public.kalshi_band(p numeric)
returns text language sql immutable as $$
  select to_char(least(greatest(floor(p * 10), 0), 9) / 10.0, 'FM0.0')
$$;

create or replace function public.kalshi_mtc_bucket(m int)
returns text language sql immutable as $$
  select case when m <= 2 then '00-02'
              when m <= 5 then '03-05'
              when m <= 8 then '06-08'
              when m <= 11 then '09-11'
              else '12-14' end
$$;

-- ─── the daily job ──────────────────────────────────────────────────────────

-- Scores the rounds that closed on p_as_of (default: yesterday UTC) and rebuilds the
-- 30-day calibration table as of that day. Idempotent: re-running a day overwrites it.
create or replace function public.kalshi_calibrate(p_as_of date default null)
returns table (series text, rounds_settled int, brier_mid numeric, brier_calibrated numeric)
language plpgsql security definer set search_path = public as $$
-- The RETURNS TABLE names double as PL/pgSQL variables and collide with the same-named
-- columns inside the INSERT below ("series" is ambiguous). Columns win; v_day is not a
-- column anywhere, so it still resolves to the variable. Found by a dry run, which is
-- the only way this would have been found before the first 00:10 UTC cron.
#variable_conflict use_column
declare
  v_day date := coalesce(p_as_of, ((now() at time zone 'utc')::date - 1));
begin
  -- Every scored minute of every round that closed on v_day and has a result.
  create temp table _snaps on commit drop as
  select r.series, r.ticker, s.minute_utc, s.mid, s.spread,
         least(s.top5_yes, s.top5_no) as depth,
         r.settlement_value as y,
         floor(extract(epoch from (r.close_time - s.minute_utc)) / 60)::int as mtc
  from kalshi_rounds r
  join kalshi_book_snaps s using (ticker)
  where r.result is not null and r.settlement_value is not null and s.mid is not null
    and (r.close_time at time zone 'utc')::date = v_day
    and s.minute_utc >= r.close_time - interval '15 minutes'
    and s.minute_utc <  r.close_time;

  -- A day with nothing scorable writes nothing, rather than a zero-count row.
  if not exists (select 1 from _snaps) then
    return;
  end if;

  -- Correct each mid with the calibration table as it stood the day BEFORE, so the
  -- corrected score is out of sample. Buckets with no prior row fall back to the mid.
  create temp table _scored on commit drop as
  select x.*,
         kalshi_mtc_bucket(x.mtc) as mtcb,
         kalshi_band(x.mid)       as band,
         coalesce(c.hit_rate, x.mid) as p_cal
  from _snaps x
  left join kalshi_calibration c
    on  c.as_of = v_day - 1 and c.window_days = 30
    and c.series = x.series
    and c.mtc_bucket = kalshi_mtc_bucket(x.mtc)
    and c.band = kalshi_band(x.mid);

  insert into kalshi_daily
    (as_of, series, rounds_settled, snaps, tape_minutes, coverage,
     brier_mid, brier_calibrated, logloss_mid, logloss_calibrated, mean_spread, mean_depth, computed_at)
  select v_day, coalesce(g.series, 'ALL'),
         count(distinct g.ticker), count(*),
         (select count(*) from kalshi_tape_minutes t where t.ticker in (select distinct ticker from _scored z where g.series is null or z.series = g.series)),
         count(*)::numeric / nullif(count(distinct g.ticker) * 15, 0),
         avg((g.mid   - g.y) ^ 2),
         avg((g.p_cal - g.y) ^ 2),
         avg(-(g.y * ln(greatest(g.mid,   1e-6)) + (1 - g.y) * ln(greatest(1 - g.mid,   1e-6)))),
         avg(-(g.y * ln(greatest(g.p_cal, 1e-6)) + (1 - g.y) * ln(greatest(1 - g.p_cal, 1e-6)))),
         avg(g.spread),
         avg(g.depth),
         now()
  from _scored g
  group by grouping sets ((g.series), ())
  on conflict (as_of, series) do update set
    rounds_settled = excluded.rounds_settled, snaps = excluded.snaps,
    tape_minutes = excluded.tape_minutes, coverage = excluded.coverage,
    brier_mid = excluded.brier_mid, brier_calibrated = excluded.brier_calibrated,
    logloss_mid = excluded.logloss_mid, logloss_calibrated = excluded.logloss_calibrated,
    mean_spread = excluded.mean_spread, mean_depth = excluded.mean_depth,
    computed_at = now();

  -- Rebuild the 30-day table as of v_day.
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

  return query
    select d.series, d.rounds_settled, d.brier_mid, d.brier_calibrated
    from kalshi_daily d where d.as_of = v_day order by d.series;
end $$;

revoke all on function public.kalshi_calibrate(date) from public, anon;
grant execute on function public.kalshi_calibrate(date) to service_role;

-- Yesterday's rounds, scored every day at 00:10 UTC. Idempotent, so a missed day
-- is healed by calling kalshi_calibrate('<date>') by hand.
select cron.unschedule('kalshi-calibrate')
 where exists (select 1 from cron.job where jobname = 'kalshi-calibrate');
select cron.schedule('kalshi-calibrate', '10 0 * * *', $$select public.kalshi_calibrate()$$);

-- ─── desk views ─────────────────────────────────────────────────────────────

-- Per series per UTC day: what was captured. security_invoker so RLS applies.
create or replace view public.kalshi_coverage
with (security_invoker = true) as
select r.series,
       (r.close_time at time zone 'utc')::date as day,
       count(distinct r.ticker)                                   as rounds,
       count(distinct r.ticker) filter (where r.result is not null) as settled,
       count(distinct (s.ticker, s.minute_utc))                    as snaps,
       count(distinct (t.ticker, t.minute_utc))                    as tape_minutes
from kalshi_rounds r
left join kalshi_book_snaps   s on s.ticker = r.ticker
left join kalshi_tape_minutes t on t.ticker = r.ticker
group by 1, 2;

-- The current round of every series with its latest snapshot, for the live board.
create or replace view public.kalshi_live
with (security_invoker = true) as
select distinct on (r.series)
       r.series, r.ticker, r.open_time, r.close_time, r.strike, r.result,
       s.minute_utc, s.yes_bid, s.yes_ask, s.mid, s.spread, s.top5_yes, s.top5_no,
       s.last_price, s.volume
from kalshi_rounds r
left join lateral (
  select * from kalshi_book_snaps b where b.ticker = r.ticker order by b.minute_utc desc limit 1
) s on true
where r.close_time > now() - interval '20 minutes'
order by r.series, r.close_time desc;

-- ─── access ─────────────────────────────────────────────────────────────────

alter table public.kalshi_rounds          enable row level security;
alter table public.kalshi_book_snaps      enable row level security;
alter table public.kalshi_tape_minutes    enable row level security;
alter table public.kalshi_collector_ticks enable row level security;
alter table public.kalshi_calibration     enable row level security;
alter table public.kalshi_daily           enable row level security;

drop policy if exists kalshi_rounds_admin_read          on public.kalshi_rounds;
drop policy if exists kalshi_book_snaps_admin_read      on public.kalshi_book_snaps;
drop policy if exists kalshi_tape_minutes_admin_read    on public.kalshi_tape_minutes;
drop policy if exists kalshi_collector_ticks_admin_read on public.kalshi_collector_ticks;
drop policy if exists kalshi_calibration_admin_read     on public.kalshi_calibration;
drop policy if exists kalshi_daily_admin_read           on public.kalshi_daily;

create policy kalshi_rounds_admin_read          on public.kalshi_rounds          for select to authenticated using ((select is_admin()));
create policy kalshi_book_snaps_admin_read      on public.kalshi_book_snaps      for select to authenticated using ((select is_admin()));
create policy kalshi_tape_minutes_admin_read    on public.kalshi_tape_minutes    for select to authenticated using ((select is_admin()));
create policy kalshi_collector_ticks_admin_read on public.kalshi_collector_ticks for select to authenticated using ((select is_admin()));
create policy kalshi_calibration_admin_read     on public.kalshi_calibration     for select to authenticated using ((select is_admin()));
create policy kalshi_daily_admin_read           on public.kalshi_daily           for select to authenticated using ((select is_admin()));

revoke all on public.kalshi_rounds, public.kalshi_book_snaps, public.kalshi_tape_minutes,
              public.kalshi_collector_ticks, public.kalshi_calibration, public.kalshi_daily,
              public.kalshi_coverage, public.kalshi_live
  from anon, public;
grant select on public.kalshi_rounds, public.kalshi_book_snaps, public.kalshi_tape_minutes,
                public.kalshi_collector_ticks, public.kalshi_calibration, public.kalshi_daily,
                public.kalshi_coverage, public.kalshi_live
  to authenticated;
grant all on public.kalshi_rounds, public.kalshi_book_snaps, public.kalshi_tape_minutes,
             public.kalshi_collector_ticks, public.kalshi_calibration, public.kalshi_daily
  to service_role;
grant select on public.kalshi_coverage, public.kalshi_live to service_role;
