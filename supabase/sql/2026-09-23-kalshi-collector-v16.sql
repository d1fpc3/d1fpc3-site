-- Kalshi collector v16: true fill prices on account rows.
--
-- price / exit_price are the limits live.mjs sent; Kalshi's flat create response has no
-- fill price. After a fill the executor reads /portfolio/fills by order id and writes
-- the count-weighted average the exchange actually gave, in the held side's dollars,
-- so paper exits (graded at the bid the evaluator saw) compare to account exits honestly.
-- Applied 2026-09-23 via supabase db query. (v15 is the signal bot's model_exits switch.)

alter table public.kalshi_live_orders
  add column if not exists fill_price numeric,
  add column if not exists exit_fill_price numeric;

comment on column public.kalshi_live_orders.fill_price is
  'count-weighted average entry fill from /portfolio/fills, held side dollars; null until the lookup lands';
comment on column public.kalshi_live_orders.exit_fill_price is
  'count-weighted average exit fill from /portfolio/fills, held side dollars; null until the lookup lands';
