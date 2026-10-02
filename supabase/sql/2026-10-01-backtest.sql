-- 2026-10-01 (D1: "make the best backtesting platform and so easy to use that people rely on it within Echelon").
-- The backtester replays a past session on the chart and simulates the member's orders on the 1-minute bars. This is
-- its storage: the sessions and trades a member keeps, the list of replayable days, the daily drill (the same mystery
-- session for every member each day) and its board.

-- ── replayable days: a full session of 1-minute bars (holidays and half days left out) ──
create table if not exists public.bt_days (
  fam  text not null check (fam in ('NQ', 'ES')),
  day  date not null,
  bars int not null,
  primary key (fam, day)
);
alter table public.bt_days enable row level security;
drop policy if exists bt_days_read on public.bt_days;
create policy bt_days_read on public.bt_days for select to authenticated using ((select public.is_member()));
grant select on public.bt_days to authenticated;

-- (re)builds the list from the archive; the nightly cron adds the newest day
create or replace function public.bt_days_refresh(p_since date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  insert into bt_days (fam, day, bars)
  select fam, d, c from (
    select case when symbol = 'NQ' then 'NQ' else 'ES' end fam,
           case when (t at time zone 'America/New_York')::time >= time '18:00'
                then (t at time zone 'America/New_York')::date + 1
                else (t at time zone 'America/New_York')::date end d,
           count(*)::int c
      from nq_bars
     where symbol in ('NQ', 'ES') and "interval" = '1m'
       and (p_since is null or t >= p_since::timestamptz - interval '1 day')
     group by 1, 2
  ) x
  where c >= 1000 and extract(isodow from d) <= 5
  on conflict (fam, day) do update set bars = excluded.bars;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.bt_days_refresh(date) from public, anon, authenticated;

-- ── sessions and trades: a member's own, nobody else's ──
create table if not exists public.bt_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sym         text not null check (sym in ('NQ', 'MNQ', 'ES', 'MES')),
  day         date not null,
  kind        text not null default 'pick' check (kind in ('pick', 'random', 'drill')),
  start_at    timestamptz not null,
  at          timestamptz,
  balance0    numeric not null default 50000 check (balance0 > 0),
  settings    jsonb not null default '{}'::jsonb,
  state       jsonb,
  stats       jsonb,
  finished_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bt_sessions_user on public.bt_sessions (user_id, created_at desc);
create index if not exists bt_sessions_drill on public.bt_sessions (day) where kind = 'drill' and finished_at is not null;
alter table public.bt_sessions enable row level security;
drop policy if exists bt_sessions_own on public.bt_sessions;
create policy bt_sessions_own on public.bt_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select public.is_member()));
grant select, insert, update, delete on public.bt_sessions to authenticated;

create table if not exists public.bt_trades (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.bt_sessions (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sym        text not null,
  side       smallint not null check (side in (1, -1)),
  qty        int not null check (qty > 0),
  entry_t    timestamptz not null,
  entry_p    numeric not null,
  exit_t     timestamptz not null,
  exit_p     numeric not null,
  sl         numeric,
  tp         numeric,
  pnl        numeric not null,
  fees       numeric not null default 0,
  r          numeric,
  mae        numeric,
  mfe        numeric,
  reason     text,
  tags       text[] not null default '{}',
  note       text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists bt_trades_user on public.bt_trades (user_id, exit_t desc);
create index if not exists bt_trades_session on public.bt_trades (session_id);
alter table public.bt_trades enable row level security;
drop policy if exists bt_trades_own on public.bt_trades;
create policy bt_trades_own on public.bt_trades for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.bt_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
grant select, insert, update, delete on public.bt_trades to authenticated;

-- ── the daily drill: one mystery NQ session per New York day, the same for every member ──
-- a full day at least 60 days back (so nobody remembers it from last month), picked by a hash of the date
create or replace function public.bt_drill_day(p_date date default null)
returns date
language sql
stable
security definer
set search_path = public
as $$
  with d as (select coalesce(p_date, (now() at time zone 'America/New_York')::date) dd),
  pool as (
    select b.day, row_number() over (order by b.day) rn, count(*) over () n
      from bt_days b, d where b.fam = 'NQ' and b.day <= d.dd - 60 and b.bars >= 1200
  )
  select pool.day from pool, d
   where pool.rn = 1 + (abs(hashtext('echelon-drill-' || d.dd::text)) % greatest(pool.n, 1))
$$;
grant execute on function public.bt_drill_day(date) to authenticated;

-- the board for one drill day: finished drill sessions only, best total R first. A member's name shows only when they
-- opted into the leaderboard (profiles.leaderboard_opt_in); everyone else reads "A member".
create or replace function public.bt_drill_board(p_date date default null)
returns table (pos int, name text, r numeric, pnl numeric, trades int, win_rate numeric, me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with dd as (select public.bt_drill_day(p_date) as day),
  s as (
    select distinct on (bs.user_id) bs.user_id, bs.stats
      from bt_sessions bs, dd
     where public.is_member() and bs.kind = 'drill' and bs.day = dd.day and bs.finished_at is not null and bs.stats is not null
     order by bs.user_id, bs.finished_at
  )
  select (row_number() over (order by coalesce((s.stats ->> 'r')::numeric, 0) desc, coalesce((s.stats ->> 'net')::numeric, 0) desc))::int,
         case when p.leaderboard_opt_in and p.username is not null then p.username else 'A member' end,
         round(coalesce((s.stats ->> 'r')::numeric, 0), 2),
         round(coalesce((s.stats ->> 'net')::numeric, 0), 2),
         coalesce((s.stats ->> 'n')::int, 0),
         round(coalesce((s.stats ->> 'win')::numeric, 0), 3),
         s.user_id = auth.uid()
    from s left join profiles p on p.user_id = s.user_id
   order by 1
   limit 50
$$;
grant execute on function public.bt_drill_board(date) to authenticated;

-- nightly: the session that just closed joins the list (after nq_store files its minutes)
select cron.unschedule(jobname) from cron.job where jobname = 'bt-days';
select cron.schedule('bt-days', '50 22 * * 1-5', $c$select public.bt_days_refresh((now() - interval '3 days')::date)$c$);
