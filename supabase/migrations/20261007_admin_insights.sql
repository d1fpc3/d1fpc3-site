-- Admin insights (D1, 10-07: "add some more insights based on who's using the pages, who's using the
-- videos, statistics like that").
--
-- app_usage        one row per member, New York day and hour, and app page: how often it was opened and how
--                  many seconds it was on screen. Written by the members app through track_usage(), read by
--                  the admin only.
-- library_views    gains seconds_watched and max_frac (furthest point reached, 0..1), written by
--                  record_library_watch() while a library video plays.
-- house_accounts   the owner's other logins and the App Review account. Together with admins and the
--                  @d1fpc3.test harness users they are left out of every member figure (is_house()).
--                  Rows are added by hand, by user id.
-- admin_insights() everything the Insights pages draw, aggregated here so no read hits PostgREST's
--                  1000-row cap.

create table if not exists public.house_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null default 'house',
  created_at timestamptz not null default now()
);
alter table public.house_accounts enable row level security;
revoke all on public.house_accounts from anon, authenticated;
grant select on public.house_accounts to authenticated;
drop policy if exists house_accounts_admin_read on public.house_accounts;
create policy house_accounts_admin_read on public.house_accounts for select to authenticated using ((select public.is_admin()));

create or replace function public.is_house(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.admins a where a.user_id = p_user)
      or exists (select 1 from public.house_accounts h where h.user_id = p_user)
      or exists (select 1 from auth.users u where u.id = p_user and (u.email ilike '%@d1fpc3.test' or u.email ilike 'appreview%@d1fpc3.com'));
$function$;
revoke all on function public.is_house(uuid) from public, anon, authenticated;

-- ── page time ──
create table if not exists public.app_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  view text not null check (view ~ '^[a-z0-9-]{1,24}$'),
  opens integer not null default 0,
  secs integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, hour, view)
);
create index if not exists app_usage_day_idx on public.app_usage (day);
alter table public.app_usage enable row level security;
revoke all on public.app_usage from anon, authenticated;
grant select on public.app_usage to authenticated;
drop policy if exists app_usage_admin_read on public.app_usage;
create policy app_usage_admin_read on public.app_usage for select to authenticated using ((select public.is_admin()));

-- p_rows: [{ "v": "chart", "o": 1, "s": 184 }, ...]  (v = page, o = opens, s = seconds on screen)
create or replace function public.track_usage(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  ny timestamp := now() at time zone 'America/New_York';
  r jsonb;
  v text;
  o integer;
  s integer;
begin
  if me is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 40 then return; end if;
  if not public.is_member() then return; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) <> 'object' then continue; end if;
    v := r->>'v';
    if v is null or v !~ '^[a-z0-9-]{1,24}$' then continue; end if;
    o := case when (r->>'o') ~ '^\d{1,6}$' then least((r->>'o')::integer, 50) else 0 end;
    s := case when (r->>'s') ~ '^\d{1,7}$' then least((r->>'s')::integer, 3600) else 0 end;
    if o = 0 and s = 0 then continue; end if;
    insert into public.app_usage as u (user_id, day, hour, view, opens, secs)
    values (me, ny::date, extract(hour from ny)::smallint, v, o, s)
    on conflict (user_id, day, hour, view)
      do update set opens = u.opens + excluded.opens, secs = u.secs + excluded.secs, updated_at = now();
  end loop;
end
$function$;
revoke all on function public.track_usage(jsonb) from public, anon;
grant execute on function public.track_usage(jsonb) to authenticated;

-- ── video watch time ──
alter table public.library_views add column if not exists seconds_watched integer not null default 0;
alter table public.library_views add column if not exists max_frac real;

create or replace function public.record_library_watch(p_video uuid, p_secs integer, p_frac real)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.library_views as lv (user_id, video_id, seconds_watched, max_frac)
  select auth.uid(), p_video, least(greatest(coalesce(p_secs, 0), 0), 900), case when p_frac >= 0 and p_frac <= 1 then p_frac end
   where auth.uid() is not null
     and public.is_member()
     and exists (select 1 from public.library_videos v where v.id = p_video)
  on conflict (user_id, video_id) do update
    set seconds_watched = lv.seconds_watched + excluded.seconds_watched,
        max_frac = nullif(greatest(coalesce(lv.max_frac, 0), coalesce(excluded.max_frac, 0)), 0),
        last_viewed_at = now();
$function$;
revoke all on function public.record_library_watch(uuid, integer, real) from public, anon;
grant execute on function public.record_library_watch(uuid, integer, real) to authenticated;

-- ── Overview's "Active today": same population as Insights (mods count, house accounts do not) ──
create or replace function public.admin_member_activity()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  today date := (now() at time zone 'America/New_York')::date;
  out jsonb;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'not allowed'; end if;
  with d as (
    select md.user_id, md.day
      from public.member_days md
     where md.day > today - 30
       and not public.is_house(md.user_id)
  )
  select jsonb_build_object(
    'today', (select count(distinct user_id) from d where day = today),
    'week', (select count(distinct user_id) from d where day > today - 7),
    'month', (select count(distinct user_id) from d),
    'days', coalesce((select jsonb_agg(jsonb_build_object('d', day, 'n', n) order by day) from (select day, count(*)::int n from d group by day) x), '[]'::jsonb)
  ) into out;
  return out;
end
$function$;

-- ── everything the Insights pages draw ──
create or replace function public.admin_insights(p_days integer default 30, p_include_house boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  today date := (now() at time zone 'America/New_York')::date;
  d0 date;
  t0 timestamptz;
  out jsonb;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'not allowed'; end if;
  p_days := least(greatest(coalesce(p_days, 30), 1), 365);
  d0 := today - (p_days - 1);
  t0 := d0::timestamp at time zone 'America/New_York';

  with pop as (
    select u.id as user_id, u.email
      from auth.users u
     where p_include_house or not public.is_house(u.id)
  ),
  usg as (
    select a.* from public.app_usage a join pop using (user_id) where a.day >= d0
  ),
  act as (
    select md.user_id, md.day from public.member_days md join pop using (user_id) where md.day >= d0
    union
    select user_id, day from usg
  ),
  series as (
    select g::date as d,
           (select count(distinct a.user_id) from act a where a.day = g::date) as n,
           coalesce((select sum(u.secs) from usg u where u.day = g::date), 0) as s
      from generate_series(d0, today, interval '1 day') g
  ),
  pages as (
    select view as v, sum(opens)::int as o, sum(secs)::int as s, count(distinct user_id)::int as p, max(updated_at) as at
      from usg group by view
  ),
  hours as (
    select extract(isodow from day)::int as dw, hour::int as h, sum(secs)::int as s, count(distinct user_id)::int as p
      from usg group by 1, 2
  ),
  pp as (
    select view as v, user_id as u, sum(opens)::int as o, sum(secs)::int as s
      from usg group by view, user_id
  ),
  act30 as (
    select md.user_id, md.day from public.member_days md join pop using (user_id) where md.day > today - 30
    union
    select a.user_id, a.day from public.app_usage a join pop using (user_id) where a.day > today - 30
  ),
  lv as (
    select v.* from public.library_views v join pop using (user_id)
  ),
  people as (
    select p.user_id, p.email, pr.username,
           exists (select 1 from public.mods m where m.user_id = p.user_id) as mod,
           exists (select 1 from public.entitlements e where e.user_id = p.user_id and e.status = 'active') as active,
           (select min(e.granted_at) from public.entitlements e where e.user_id = p.user_id) as joined,
           greatest(
             (select max(md.created_at) from public.member_days md where md.user_id = p.user_id),
             (select max(a.updated_at) from public.app_usage a where a.user_id = p.user_id),
             (select max(x.last_viewed_at) from public.library_views x where x.user_id = p.user_id),
             (select max(x.last_viewed_at) from public.lesson_views x where x.user_id = p.user_id)
           ) as seen,
           (select count(distinct a.day) from act a where a.user_id = p.user_id)::int as days,
           coalesce((select jsonb_agg(distinct a.day) from act a where a.user_id = p.user_id), '[]'::jsonb) as dl,
           coalesce((select sum(u.secs) from usg u where u.user_id = p.user_id), 0)::int as secs,
           coalesce((select sum(u.opens) from usg u where u.user_id = p.user_id), 0)::int as opens,
           coalesce((select jsonb_agg(jsonb_build_object('v', t.view, 's', t.s) order by t.s desc)
                       from (select u.view, sum(u.secs)::int s from usg u where u.user_id = p.user_id group by u.view order by 2 desc limit 6) t), '[]'::jsonb) as top,
           (select count(*) from lv x where x.user_id = p.user_id)::int as vids,
           coalesce((select sum(x.seconds_watched) from lv x where x.user_id = p.user_id), 0)::int as vsecs,
           (select count(*) from lv x where x.user_id = p.user_id and x.last_viewed_at >= t0)::int as vids_r,
           (select count(*) from public.lesson_views x where x.user_id = p.user_id)::int as les,
           (select count(*) from public.progress x where x.user_id = p.user_id and x.completed_at is not null)::int as done,
           (select count(*) from public.messages x where x.user_id = p.user_id and x.created_at >= t0 and x.deleted_at is null)::int as msgs,
           (select count(*) from public.member_recaps x where x.user_id = p.user_id and x.created_at >= t0)::int as posts,
           (select count(*) from public.journal_entries x where x.user_id = p.user_id and x.entry_date >= d0)::int as journal,
           (select count(*) from public.bt_sessions x where x.user_id = p.user_id and x.created_at >= t0)::int as bts
      from pop p
      left join public.profiles pr on pr.user_id = p.user_id
  ),
  vids as (
    select v.id, v.title, v.category, v.created_at, v.thumb_path, v.audience, v.is_published,
           coalesce(sum(x.view_count), 0)::int as opens,
           count(x.user_id)::int as viewers,
           count(x.user_id) filter (where x.last_viewed_at >= t0)::int as viewers_r,
           coalesce(sum(x.seconds_watched), 0)::int as secs,
           avg(x.max_frac) filter (where x.max_frac is not null) as frac,
           max(x.last_viewed_at) as at,
           coalesce(jsonb_agg(jsonb_build_object('u', x.user_id, 'n', x.view_count, 's', x.seconds_watched, 'f', x.max_frac, 'at', x.last_viewed_at) order by x.last_viewed_at desc)
                      filter (where x.user_id is not null), '[]'::jsonb) as who
      from public.library_videos v
      left join lv x on x.video_id = v.id
     group by v.id
  ),
  les as (
    select l.id, l.title, m.title as module, m.position as mpos, l.position as lpos,
           (select count(*) from public.lesson_views x join pop using (user_id) where x.lesson_id = l.id)::int as viewers,
           (select coalesce(sum(x.view_count), 0) from public.lesson_views x join pop using (user_id) where x.lesson_id = l.id)::int as opens,
           (select count(*) from public.progress x join pop using (user_id) where x.lesson_id = l.id and x.completed_at is not null)::int as done,
           (select max(x.last_viewed_at) from public.lesson_views x join pop using (user_id) where x.lesson_id = l.id) as at
      from public.lessons l
      join public.modules m on m.id = l.module_id
     where l.is_published
  )
  select jsonb_build_object(
    'days', p_days,
    'from', d0,
    'to', today,
    'since', (select min(day) from public.app_usage),
    'seen_from', (select min(day) from public.member_days),
    'members', (select count(*) from people where active),
    'a1', (select count(distinct user_id) from act30 where day = today),
    'a7', (select count(distinct user_id) from act30 where day > today - 7),
    'a30', (select count(distinct user_id) from act30),
    'page_people', coalesce((select jsonb_agg(to_jsonb(pp) order by s desc) from pp), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'n', n, 's', s) order by d) from series), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(to_jsonb(pages) order by s desc) from pages), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(to_jsonb(hours)) from hours), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(to_jsonb(people) order by seen desc nulls last) from people where active or seen is not null), '[]'::jsonb),
    'videos', coalesce((select jsonb_agg(to_jsonb(vids) order by created_at desc) from vids), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(to_jsonb(les) order by mpos, lpos) from les), '[]'::jsonb)
  ) into out;
  return out;
end
$function$;
revoke all on function public.admin_insights(integer, boolean) from public, anon;
grant execute on function public.admin_insights(integer, boolean) to authenticated;

-- harness leftovers: TradingView rows for throwaway @d1fpc3.test users that never got a username
delete from public.tv_access where email ilike '%@d1fpc3.test' and state = 'needs_username';
