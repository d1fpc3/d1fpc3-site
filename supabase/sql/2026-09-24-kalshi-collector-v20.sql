-- Kalshi collector v20: the exchange is the P&L truth, and D1's exit rules.
--
-- D1, 2026-09-24 00:55Z: "you need to actually track my P&L ... I already closed that one
-- early because I was up $10 ... if I risk $10 to make $10 I'm taking that profit any day
-- of the week", "or trail to break even ... 50-50, half off ... limit orders".
--
-- kalshi_settlements mirrors GET /portfolio/settlements: every market the account settled,
-- bot or hand, with the exchange's own counts, costs and fee. pnl = payout - paid - fee.
-- The desk and The Printer read realized P&L from here, not from the bot's own rows.
-- Applied 2026-09-24 via supabase db query.

create table if not exists public.kalshi_settlements (
  ticker        text primary key,
  event_ticker  text,
  settled_time  timestamptz not null,
  result        text,
  yes_count     numeric not null default 0,
  no_count      numeric not null default 0,
  yes_cost      numeric not null default 0,
  no_cost       numeric not null default 0,
  fee           numeric not null default 0,
  payout        numeric not null default 0,
  pnl           numeric not null default 0,
  bot           boolean not null default false,
  updated_at    timestamptz not null default now()
);
create index if not exists kalshi_settlements_time on public.kalshi_settlements (settled_time desc);
alter table public.kalshi_settlements enable row level security;
drop policy if exists kalshi_settlements_anon_read on public.kalshi_settlements;
create policy kalshi_settlements_anon_read on public.kalshi_settlements for select to anon, authenticated using (true);
grant select on public.kalshi_settlements to anon, authenticated;

-- the exit rules on the risk row: rest half at +tp1, the rest at +tp2 (maker, no fee);
-- once the bid has been up be_arm % the position is sold at the bid if it falls back to entry
alter table public.kalshi_switch
  add column if not exists tp1_pct  numeric not null default 50,
  add column if not exists tp1_frac numeric not null default 0.5,
  add column if not exists tp2_pct  numeric not null default 100,
  add column if not exists be_arm_pct numeric not null default 50;

-- per order: the resting take-profit orders, the high-water bid, and whether a hand closed it
alter table public.kalshi_live_orders
  add column if not exists tp_orders jsonb,
  add column if not exists hwm numeric,
  add column if not exists hand_exit boolean;

comment on column public.kalshi_switch.tp1_pct is 'first take-profit, percent gain on the stake; a resting maker order at entry x (1 + pct/100)';
comment on column public.kalshi_switch.tp1_frac is 'fraction of the position the first take-profit sells (0.5 = half off)';
comment on column public.kalshi_switch.tp2_pct is 'second take-profit for the rest, percent gain on the stake';
comment on column public.kalshi_switch.be_arm_pct is 'once the bid has been this many percent above entry, the position is sold if the bid falls back to entry (trail to break even); 0 disables';
