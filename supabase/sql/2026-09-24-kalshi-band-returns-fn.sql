-- kalshi_band_returns(days): return per dollar risked by price band AND asset, plus the same
-- band with each asset held out. Both of us sliced the book by price and read the cheap band
-- as a leak; controlled for asset it dissolves, because one asset owned that band. A band,
-- hour or price finding has to hold ACROSS assets before either of us believes it, so the
-- control ships with the number instead of being remembered.
-- Applied 2026-09-24.

create or replace function public.kalshi_band_returns(days integer default 3)
returns table (band text, asset text, calls bigint, wins bigint, risked numeric, pnl numeric, ret_pct numeric)
language sql stable security definer set search_path = public as $$
  with calls as (
    select substring(s.ticker from 'KX([A-Z]+)15M') as asset,
           s.price::numeric as entry,
           (case when s.side='yes' then r.settlement_value=1 else r.settlement_value=0 end) as won,
           floor(10/s.price::numeric) as n,
           ceil(0.07*s.price::numeric*(1-s.price::numeric)*floor(10/s.price::numeric)*100)/100 as fee_in
    from desk_signals s join kalshi_rounds r on r.ticker = s.ticker
    where s.book = 'paper' and s.status in ('won','lost','exited')
      and r.settlement_value is not null and s.price::numeric between 0.03 and 0.97
      and s.called_at >= now() - make_interval(days => days)
      and floor(10/s.price::numeric) > 0
  ), tagged as (
    select case when entry < 0.30 then 'a 10-30c' when entry < 0.50 then 'b 30-50c'
                when entry < 0.70 then 'c 50-70c' when entry < 0.85 then 'd 70-85c'
                else 'e 85-98c' end as band,
           asset, won, n, entry, fee_in,
           n*(case when won then 1 else 0 end) - n*entry - fee_in as pnl, n*entry as risked
    from calls
  ), rows as (
    select band, asset from tagged group by 1,2
    union all select band, 'ALL' from tagged group by 1
    union all select band, 'ALL less DOGE' from tagged where asset <> 'DOGE' group by 1
  )
  select r.band, r.asset, count(t.*) as calls, count(t.*) filter (where t.won) as wins,
    round(sum(t.risked)::numeric, 0) as risked, round(sum(t.pnl)::numeric, 2) as pnl,
    round((100*sum(t.pnl)/nullif(sum(t.risked),0))::numeric, 1) as ret_pct
  from rows r join tagged t
    on t.band = r.band
   and (r.asset = 'ALL' or (r.asset = 'ALL less DOGE' and t.asset <> 'DOGE') or t.asset = r.asset)
  group by 1,2 having count(t.*) >= 5 order by 1, (r.asset in ('ALL','ALL less DOGE')) desc, 2
$$;

revoke all on function public.kalshi_band_returns(integer) from public;
grant execute on function public.kalshi_band_returns(integer) to anon, authenticated, service_role;
