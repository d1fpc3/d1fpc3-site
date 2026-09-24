-- Kalshi collector v19: the adaptive size on each account order.
--
-- D1, 2026-09-24 00:45Z: "MAKE SURE ITS LEARNING TO ... IT NEEDS TO BE ADAPTIVE". The
-- executor scales the desk clip by each rule's own record (its last 30 graded paper calls
-- in desk_signals, the signal bot's mirror): size_mult is the factor it used on the row.
-- Applied 2026-09-24 via supabase db query.

alter table public.kalshi_live_orders
  add column if not exists size_mult numeric;

comment on column public.kalshi_live_orders.size_mult is
  'clip multiplier from the rule''s last 30 graded paper calls: 1 + (n/30) * 2 * return per dollar, clamped 0.5 to 2; 1 with no record';
