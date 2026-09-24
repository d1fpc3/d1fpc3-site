-- kalshi_fav_edge(days): everything the desk needs to show the one validated edge, computed
-- from the stored books rather than written down, so the page cannot drift from the evidence.
-- The rule: favourite side, 85-95c, 7 to 11 minutes to close, BTC/ETH/SOL/XRP/DOGE, bought at
-- the ask net of the taker fee, held to settlement.
-- Applied 2026-09-24.

create or replace function public.kalshi_fav_edge(days integer default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (
    select b.ticker, b.minute_utc, f.mtc, substring(b.ticker from 'KX([A-Z]+)15M') as asset,
           case when b.mid >= 0.5 then b.yes_ask else round(1 - b.yes_bid, 2) end as ask,
           case when b.mid >= 0.5 then r.settlement_value = 1 else r.settlement_value = 0 end as won
    from kalshi_book_snaps b
    join kalshi_features f on f.ticker = b.ticker and f.minute_utc = b.minute_utc
    join kalshi_rounds r on r.ticker = b.ticker
    where r.settlement_value is not null and b.yes_bid > 0 and b.yes_ask < 1
      and b.minute_utc >= now() - make_interval(days => days)
      and substring(b.ticker from 'KX([A-Z]+)15M') in ('BTC','ETH','SOL','XRP','DOGE')
  ), win as (select * from s where mtc between 7 and 11 and ask between 0.85 and 0.95),
  net as (
    select *, (case when won then 1 else 0 end) - ask - ceil(0.07*ask*(1-ask)*100)/100 as pnl from win
  )
  select jsonb_build_object(
    'as_of', now(),
    'rule', jsonb_build_object('lo', 0.85, 'hi', 0.95, 'mtc_lo', 7, 'mtc_hi', 11,
      'assets', array['BTC','ETH','SOL','XRP','DOGE']),
    'headline', (select jsonb_build_object(
        'rounds', count(distinct ticker), 'observations', count(*),
        'win_rate', round(avg(case when won then 1 else 0 end)::numeric, 4),
        'break_even', round(avg(ask + ceil(0.07*ask*(1-ask)*100)/100)::numeric, 4),
        'net_pct', round((100*sum(pnl)/nullif(sum(ask),0))::numeric, 2),
        'avg_price', round(avg(ask)::numeric, 3)) from net),
    'weeks', (select coalesce(jsonb_agg(w order by w->>'week'), '[]'::jsonb) from (
        select jsonb_build_object('week', to_char(date_trunc('week', minute_utc), 'MM-DD'),
          'n', count(*), 'win_rate', round(avg(case when won then 1 else 0 end)::numeric, 4),
          'net_pct', round((100*sum(pnl)/nullif(sum(ask),0))::numeric, 2)) as w
        from net group by date_trunc('week', minute_utc)) z),
    'clock', (select coalesce(jsonb_agg(c order by (c->>'mtc')::int), '[]'::jsonb) from (
        select jsonb_build_object('mtc', mtc, 'n', count(*),
          'win_rate', round(avg(case when won then 1 else 0 end)::numeric, 4),
          'net_pct', round((100*sum((case when won then 1 else 0 end) - ask - ceil(0.07*ask*(1-ask)*100)/100)
                            /nullif(sum(ask),0))::numeric, 2),
          'in_rule', bool_and(mtc between 7 and 11)) as c
        from s where ask between 0.85 and 0.95 and mtc between 3 and 14 group by mtc) z),
    'bands', (select coalesce(jsonb_agg(b2 order by b2->>'band'), '[]'::jsonb) from (
        select jsonb_build_object('band',
            case when ask < 0.85 then '80-85c' when ask < 0.90 then '85-90c' else '90-95c' end,
          'n', count(*), 'win_rate', round(avg(case when won then 1 else 0 end)::numeric, 4),
          'net_pct', round((100*sum((case when won then 1 else 0 end) - ask - ceil(0.07*ask*(1-ask)*100)/100)
                            /nullif(sum(ask),0))::numeric, 2),
          'in_rule', bool_and(ask >= 0.85)) as b2
        from s where mtc between 7 and 11 and ask between 0.80 and 0.95
        group by case when ask < 0.85 then '80-85c' when ask < 0.90 then '85-90c' else '90-95c' end) z),
    'supply', (select jsonb_build_object(
        'rounds_per_day', round(count(distinct ticker)::numeric / nullif(count(distinct minute_utc::date),0), 0),
        'per_hour', round(count(distinct ticker)::numeric / nullif(count(distinct minute_utc::date),0) / 24, 1))
      from win where minute_utc >= now() - interval '7 days'),
    'live', (select jsonb_build_object('orders', count(*), 'filled', count(*) filter (where filled > 0),
        'closed', count(*) filter (where pnl is not null), 'wins', count(*) filter (where pnl > 0),
        'pnl', round(coalesce(sum(pnl),0)::numeric, 2), 'cost', round(coalesce(sum(cost) filter (where filled > 0),0)::numeric, 2))
      from kalshi_live_orders where source = 'fav')
  )
$$;

revoke all on function public.kalshi_fav_edge(integer) from public;
grant execute on function public.kalshi_fav_edge(integer) to anon, authenticated, service_role;
