-- Kalshi v11: the switch moves into the database, and the signal bot's paper book gets a
-- table the desk can read. Applied 2026-09-23 on top of v10. Idempotent.
--
-- kalshi_switch: ONE row. D1 flips it from the desk (signed in as admin; the page is public
-- but the update policy is not). The executor reads it every pass; the row is the source of
-- truth once the executor reads it (the ~/.kalshi/live.json file stays as the fallback).
--   signals  true = every call shown in Discord is sent to the account at $10
--   live     true = the cell book may send once its paper gate has passed
create table if not exists public.kalshi_switch (
  id          int         primary key default 1 check (id = 1),
  signals     boolean     not null default false,
  live        boolean     not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
insert into public.kalshi_switch (id, signals, live) values (1, true, false) on conflict (id) do nothing;
alter table public.kalshi_switch enable row level security;
drop policy if exists kalshi_switch_public_read  on public.kalshi_switch;
drop policy if exists kalshi_switch_admin_read   on public.kalshi_switch;
drop policy if exists kalshi_switch_admin_update on public.kalshi_switch;
create policy kalshi_switch_public_read  on public.kalshi_switch for select to anon using (true);
create policy kalshi_switch_admin_read   on public.kalshi_switch for select to authenticated using (true);
create policy kalshi_switch_admin_update on public.kalshi_switch for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));
revoke all on public.kalshi_switch from public;
grant select on public.kalshi_switch to anon;
grant select, update on public.kalshi_switch to authenticated;
grant all on public.kalshi_switch to service_role;

-- kalshi_signal_paper: the signal bot's paper book by UTC day, every rule at $10 a call,
-- written by the bot (service role) after each grading pass. Two P&Ls per day:
--   pnl       hold every call to settlement (the pre-registered scoreboard)
--   pnl_exit  the "first green" exit: sell the moment the held side can be sold above
--             entry plus both taker fees, otherwise hold to settlement (D1, 2026-09-23:
--             "if it goes up in percent we're still green")
-- Never summed with kalshi_live_daily (the real book) or kalshi_paper_daily (the cell book).
create table if not exists public.kalshi_signal_paper (
  day         date        primary key,
  calls       int         not null default 0,
  graded      int         not null default 0,
  wins        int         not null default 0,
  pnl         numeric     not null default 0,
  cost        numeric     not null default 0,
  fees        numeric     not null default 0,
  pnl_exit    numeric,
  exits       int         not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.kalshi_signal_paper enable row level security;
drop policy if exists kalshi_signal_paper_public_read on public.kalshi_signal_paper;
drop policy if exists kalshi_signal_paper_admin_read  on public.kalshi_signal_paper;
create policy kalshi_signal_paper_public_read on public.kalshi_signal_paper for select to anon using (true);
create policy kalshi_signal_paper_admin_read  on public.kalshi_signal_paper for select to authenticated using (true);
revoke all on public.kalshi_signal_paper from public;
grant select on public.kalshi_signal_paper to anon, authenticated;
grant all on public.kalshi_signal_paper to service_role;
