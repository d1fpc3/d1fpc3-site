-- Kalshi collector v14: model-driven exits on the account.
--
-- The signal bot's evaluator (its log-normal fair value, every minute) marks a placed
-- row it wants out of; live.mjs sells that row's remaining fill IOC, reduce-only, at
-- max(wanted, live bid). Rows it never marks ride to settlement. Replay 2026-09-23
-- over 686 graded calls with historic Coinbase spot: held -$565.07, model exits
-- -$122.37, first-green exits -$1,370.23. The first-green switch from v13 goes:
-- nothing reads it.
-- Applied 2026-09-23 via supabase db query.

alter table public.kalshi_live_orders
  add column if not exists exit_wanted_at timestamptz,
  add column if not exists exit_wanted_price numeric;

comment on column public.kalshi_live_orders.exit_wanted_at is
  'set by the signal bot evaluator on a placed, filled signals row it wants sold; live.mjs sends the exit and never writes this';
comment on column public.kalshi_live_orders.exit_wanted_price is
  'the held side bid the evaluator saw, in that side''s dollars; the exit goes at max(this, live bid); re-patched every minute while the model still says sell';

alter table public.kalshi_switch drop column if exists exit_green;
alter table public.kalshi_executor_state drop column if exists switch_exit_green;
