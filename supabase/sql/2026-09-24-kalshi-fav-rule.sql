-- The favourite window, as a rule the executor runs itself.
--
-- Validated 2026-09-24 over a month of stored books: favourite side, 85-95c, 7 to 11 minutes
-- to close, BTC/ETH/SOL/XRP/DOGE, bought at the ask net of the taker fee and held to
-- settlement. Positive in all five weeks (+2.12, +1.46, +1.12, +0.14, +2.21 percent on cost),
-- positive in both halves of the month at mtc 7, 9 and 11, and NEGATIVE in both halves at
-- mtc 5, which is why the window stops at 7. By band: 85-90c +1.57%, 90-95c +1.77%; the
-- 80-85c band is +0.60% and is excluded by D1's own 85c floor.
--
-- Resting a bid to collect it instead loses: -$271 over 4,770 passive fills, 10 of 10 assets.
-- It is a taker's trade. Applied 2026-09-24.

alter table public.kalshi_switch
  add column if not exists fav_rule boolean not null default true;

comment on column public.kalshi_switch.fav_rule is
  'the executor own favourite-window rule: buy the favourite at the ask when it is 85-95c with 7 to 11 minutes left';
