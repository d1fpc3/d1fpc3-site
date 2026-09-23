-- Kalshi collector v7: the execution log.
-- Applied 2026-09-23 on top of v6. Idempotent.
--
-- Every order the executor (worker/live.mjs) intended or placed, one row per round per
-- pass. mode 'armed' means logged and not sent; 'live' means sent to the account. The
-- two gates are recorded on every row so a reader can see exactly why an order did or
-- did not go out. Public-read like the rest of the desk; nothing here identifies the
-- account beyond the exchange's own order id.

create table if not exists public.kalshi_live_orders (
  ticker          text        not null,
  created_at      timestamptz not null,
  series          text        not null,
  key             text        not null,
  mtc_bucket      text        not null,
  cell            text        not null,
  side            text        not null,          -- 'yes' or 'no', the side bought
  price           numeric     not null,          -- the real ask at that minute, dollars
  contracts       int         not null,
  cost            numeric     not null,
  mode            text        not null,          -- 'armed' | 'live'
  gate_passed     boolean     not null,
  gate_trades     int         not null,
  live_switch     boolean     not null,
  halted          boolean     not null default false,
  status          text        not null,          -- 'intent' | 'placed' | 'rejected' | 'filled' | 'settled'
  kalshi_order_id text,
  response        text,
  won             boolean,
  pnl             numeric,
  primary key (ticker, created_at)
);
create index if not exists kalshi_live_orders_created on public.kalshi_live_orders (created_at desc);

alter table public.kalshi_live_orders enable row level security;
drop policy if exists kalshi_live_orders_admin_read  on public.kalshi_live_orders;
drop policy if exists kalshi_live_orders_public_read on public.kalshi_live_orders;
create policy kalshi_live_orders_admin_read  on public.kalshi_live_orders for select to authenticated using ((select is_admin()));
create policy kalshi_live_orders_public_read on public.kalshi_live_orders for select to anon using (true);
revoke all on public.kalshi_live_orders from public;
grant select on public.kalshi_live_orders to authenticated, anon;
grant all on public.kalshi_live_orders to service_role;
