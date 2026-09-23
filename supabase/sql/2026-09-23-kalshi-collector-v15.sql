-- Kalshi v15: the model-exit gate. Applied 2026-09-23 on top of v14. Idempotent.
-- kalshi_switch.model_exits: true = the signal bot's evaluator may mark a placed position
-- for exit (exit_wanted_at / exit_wanted_price on kalshi_live_orders) when its model says
-- the market pays more than holding is worth; the executor sells only marked rows. Only
-- the bot reads it; the desk flips it as the admin. Default on: D1 asked for the rule.
alter table public.kalshi_switch add column if not exists model_exits boolean not null default true;
