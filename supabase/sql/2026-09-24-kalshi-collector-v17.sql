-- Kalshi collector v17: why an intent did not go to the account.
--
-- D1, 2026-09-24 00:10Z: "why are we entering at 50% percentage? We should be taking
-- like 89%". The executor now sends only intents priced >= 0.85 to the account; the
-- rest are skipped with the reason here, so the desk can show it.
-- Applied 2026-09-24 via supabase db query.

alter table public.kalshi_live_orders
  add column if not exists reason text;

comment on column public.kalshi_live_orders.reason is
  'why the executor skipped, halted or expired an intent (e.g. under account floor 0.85); null when it was sent';
