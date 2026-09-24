-- Kalshi collector v18: risk settings D1 edits on the desk, read by the executor each pass.
--
-- D1, 2026-09-24 00:25Z: "make me a risk setting on the kalshi dashboard". The five
-- numbers that were constants in live.mjs (CLIP, DAILY_STOP, DAILY_COST_CAP, MAX_OPEN,
-- ACCOUNT_MIN_PRICE) live on the one-row switch table; the desk's update policy for
-- admins covers them. Defaults are the constants they replace.
-- Applied 2026-09-24 via supabase db query.

alter table public.kalshi_switch
  add column if not exists clip numeric not null default 10,
  add column if not exists daily_stop numeric not null default -50,
  add column if not exists daily_cap numeric not null default 100,
  add column if not exists max_open integer not null default 5,
  add column if not exists min_price numeric not null default 0.85;

comment on column public.kalshi_switch.clip is 'dollars per call sent to the account';
comment on column public.kalshi_switch.daily_stop is 'realized P&L (negative) at which the day halts';
comment on column public.kalshi_switch.daily_cap is 'dollars actually bought per UTC day at which the day halts';
comment on column public.kalshi_switch.max_open is 'open positions at once';
comment on column public.kalshi_switch.min_price is 'lowest price (probability) a call may have to reach the account';
