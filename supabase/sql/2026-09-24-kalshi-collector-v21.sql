-- Kalshi collector v21: the stop, off by default.
--
-- Replay 2026-09-24 over every graded paper call bought at 0.80 or better (n=38, 26 won):
--   hold -$80.39 | stop -5c -$26.13 | stop -10c -$22.92 | -15c -$27.77 | -20c -$46.10
-- The aggregate win is real, but all of it comes from model rules that happened to buy a
-- favourite; the two rules built for favourites (late-favorite, late-favorite-2, n=5) say
-- hold wins. One day, samples too small. The column exists so D1 can flip it from the desk;
-- the nightly replay re-runs it and reports when the favourites pass 20 graded calls.
-- Applied 2026-09-24 via supabase db query.

alter table public.kalshi_switch
  add column if not exists stop_cents numeric not null default 0;

comment on column public.kalshi_switch.stop_cents is
  'sell a held position at the bid once the bid is this many cents under the entry fill; 0 = off (the default: -10c wins on all 0.80+ calls but loses on the favourite rules own sample)';
