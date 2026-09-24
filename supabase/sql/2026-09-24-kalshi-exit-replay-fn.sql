-- kalshi_exit_replay(days): every exit configuration, replayed against the minute books the
-- collector already stores, over every graded paper call that has a settlement. Returns one
-- row per (price floor x scope) with held and trailed P&L, so the desk, The Printer and the
-- nightly job all read the same numbers instead of each re-deriving them.
--
-- The trail arms at +25% and sells at the bid that actually existed in the trigger minute,
-- which is the conservative end: the replay samples once a minute, the executor every 5 s.
-- Applied 2026-09-24.

create or replace function public.kalshi_exit_replay(days integer default 2)
returns table (floor_p numeric, scope text, calls bigint, win_rate numeric, pnl_held numeric, pnl_trail numeric, risked numeric)
language sql stable security definer set search_path = public as $$
  with calls as (
    select s.id, s.ticker, s.price::numeric as entry, s.called_at, s.close_time,
           substring(s.ticker from 'KX([A-Z]+)15M') as asset,
           (case when s.side='yes' then r.settlement_value=1 else r.settlement_value=0 end) as won,
           (case when s.side='yes' then true else false end) as is_yes,
           floor(10/s.price::numeric) as n,
           ceil(0.07*s.price::numeric*(1-s.price::numeric)*floor(10/s.price::numeric)*100)/100 as fee_in
    from desk_signals s join kalshi_rounds r on r.ticker = s.ticker
    where s.book = 'paper' and s.status in ('won','lost','exited')
      and r.settlement_value is not null and s.price::numeric between 0.03 and 0.97
      and s.called_at >= greatest(now() - make_interval(days => days), (select min(minute_utc) from kalshi_book_snaps))
      and floor(10/s.price::numeric) > 0
  ), path as (
    select c.id, c.entry, b.minute_utc,
           (case when c.is_yes then b.yes_bid else round(1-b.yes_ask,2) end) as bid,
           max(case when c.is_yes then b.yes_bid else round(1-b.yes_ask,2) end)
             over (partition by c.id order by b.minute_utc rows between unbounded preceding and current row) as run_max
    from calls c join kalshi_book_snaps b
      on b.ticker = c.ticker and b.minute_utc >= c.called_at and b.minute_utc < c.close_time
  ), fired as (
    select distinct on (id) id, bid as exit_bid from path
    where run_max >= entry*1.25 and bid <= entry order by id, minute_utc
  ), g as (
    select f.floor_p, sc.scope
    from unnest(array[0.01,0.25,0.35,0.45,0.55,0.65,0.80]) as f(floor_p)
    cross join unnest(array['all','gated']) as sc(scope)
  )
  select g.floor_p, g.scope, count(*) as calls,
    round(100.0*count(*) filter (where c.won)/nullif(count(*),0), 1) as win_rate,
    round(sum(c.n*(case when c.won then 1 else 0 end) - c.n*c.entry - c.fee_in)::numeric, 2) as pnl_held,
    round(sum(case when f.id is not null
         then c.n*f.exit_bid - c.n*c.entry - c.fee_in - ceil(0.07*f.exit_bid*(1-f.exit_bid)*c.n*100)/100
         else c.n*(case when c.won then 1 else 0 end) - c.n*c.entry - c.fee_in end)::numeric, 2) as pnl_trail,
    round(sum(c.n*c.entry)::numeric, 0) as risked
  from g join calls c on c.entry >= g.floor_p and (g.scope = 'all' or c.asset in ('BTC','SOL','XRP','NEAR'))
  left join fired f on f.id = c.id
  group by 1,2 order by 2,1
$$;

revoke all on function public.kalshi_exit_replay(integer) from public;
grant execute on function public.kalshi_exit_replay(integer) to anon, authenticated, service_role;
