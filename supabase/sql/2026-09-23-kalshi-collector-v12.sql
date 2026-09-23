-- Kalshi collector v12: the exit leg's columns, and the realized book counts exits.
-- Applied 2026-09-23 on top of v11 (the peer's switch and signal-paper tables). Idempotent.
--
-- D1: "we can hold trades with the percentages, it doesn't have to be at close". A placed
-- order with a fill is checked every pass against the live book: if the bid for the held
-- side clears entry + entry fee + exit fee + 1 cent per contract, the executor sells the
-- held contracts IOC, reduce-only. A full exit closes the row as 'exited'; a partial exit
-- records the sold part and the remainder rides to settlement, where pnl = exit_pnl +
-- settlement pnl on the remainder - entry fee.

alter table public.kalshi_live_orders add column if not exists exit_price  numeric;
alter table public.kalshi_live_orders add column if not exists exit_at     timestamptz;
alter table public.kalshi_live_orders add column if not exists exit_filled int;
alter table public.kalshi_live_orders add column if not exists exit_pnl    numeric;
alter table public.kalshi_live_orders add column if not exists exit_order_id text;

-- a view cannot gain a column in the middle in place; the desk reads columns by name
drop view if exists public.kalshi_live_daily;
create view public.kalshi_live_daily
with (security_invoker = true) as
select (created_at at time zone 'utc')::date as day,
       source,
       count(*)::int                                              as orders,
       count(*) filter (where status = 'placed')::int             as open,
       count(*) filter (where status in ('settled', 'exited'))::int as settled,
       count(*) filter (where status = 'exited')::int             as exited,
       count(*) filter (where won)::int                           as wins,
       sum(cost) filter (where status in ('placed', 'settled', 'exited', 'unfilled')) as cost,
       sum(pnl)                                                   as pnl
from public.kalshi_live_orders
group by 1, 2;
grant select on public.kalshi_live_daily to anon, authenticated, service_role;
revoke all on public.kalshi_live_daily from public;
