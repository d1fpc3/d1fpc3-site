-- 2026-09-30: the days each member opened Echelon (D1: "find out how we can get more people to consistently use it").
-- One row per member per New York day, written only through touch_member_day() when the app opens. It gives:
--   * the member their trading-day streak (weekdays in a row they opened it; weekends never break it),
--   * D1 an exact daily / weekly active count (read_state only moved when someone opened chat).
-- A member reads only their own rows; nobody writes the table directly.

create table if not exists public.member_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.member_days enable row level security;
drop policy if exists "member_days read own" on public.member_days;
create policy "member_days read own" on public.member_days for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.member_days from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.member_days from authenticated;   -- the project default grants them; RLS blocks them anyway
grant select on public.member_days to authenticated;

create or replace function public.touch_member_day()
returns table (streak integer, days_30 integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'America/New_York')::date;
  cur date;
  n integer := 0;
begin
  if me is null then return; end if;
  insert into public.member_days (user_id, day) values (me, today) on conflict do nothing;
  cur := today;
  loop
    if extract(isodow from cur) in (6, 7) then cur := cur - 1; continue; end if;   -- weekends never break it
    exit when not exists (select 1 from public.member_days d where d.user_id = me and d.day = cur);
    n := n + 1;
    cur := cur - 1;
    exit when n >= 500;
  end loop;
  return query select n, (select count(*)::integer from public.member_days d where d.user_id = me and d.day > today - 30);
end
$$;
revoke all on function public.touch_member_day() from public, anon;
grant execute on function public.touch_member_day() to authenticated;

-- The owner's read of it (admin Overview, "Active today"): members only, never the test or staff accounts.
create or replace function public.admin_member_activity()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
  out jsonb;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'not allowed'; end if;
  with d as (
    select md.user_id, md.day
    from public.member_days md
    join auth.users u on u.id = md.user_id
    where md.day > today - 30
      and u.email not ilike '%@d1fpc3.test' and u.email not ilike 'appreview%@d1fpc3.com'
      and not exists (select 1 from public.admins a where a.user_id = md.user_id)
      and not exists (select 1 from public.mods m where m.user_id = md.user_id)
  )
  select jsonb_build_object(
    'today', (select count(distinct user_id) from d where day = today),
    'week', (select count(distinct user_id) from d where day > today - 7),
    'month', (select count(distinct user_id) from d),
    'days', coalesce((select jsonb_agg(jsonb_build_object('d', day, 'n', n) order by day) from (select day, count(*)::int n from d group by day) x), '[]'::jsonb)
  ) into out;
  return out;
end
$$;
revoke all on function public.admin_member_activity() from public, anon;
grant execute on function public.admin_member_activity() to authenticated;
