-- tv-sync: one-time database setup. Applied to prod 2026-09-13 via the
-- Management API. Kept here as the record; not a migration.

-- D1's TradingView session, one row. Service role only: no policies on purpose.
create table if not exists public.tv_session (
  id smallint primary key default 1 check (id = 1),
  sessionid text,
  sessionid_sign text,
  tv_username text,
  ok boolean not null default false,
  checked_at timestamptz,
  last_error text,
  last_sync_at timestamptz,
  last_sync jsonb,
  sync_lock_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.tv_session enable row level security;
revoke all on public.tv_session from anon, authenticated;
insert into public.tv_session (id) values (1) on conflict (id) do nothing;

-- one runner at a time
create or replace function public.tv_sync_claim(p_seconds integer default 90)
returns boolean language sql security definer set search_path = public as $$
  with c as (
    update public.tv_session
       set sync_lock_until = now() + make_interval(secs => p_seconds)
     where id = 1 and (sync_lock_until is null or sync_lock_until < now())
    returning id)
  select exists (select 1 from c);
$$;
revoke execute on function public.tv_sync_claim(integer) from public, anon, authenticated;

-- kick the function (pg_net, async, sends after commit)
create or replace function public.tv_sync_kick(p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://cqdignbleethroyxxvzr.supabase.co/functions/v1/tv-sync',
    body    := jsonb_build_object('action', 'sync', 'reason', p_reason),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-webhook-secret', '825447c027f748392987d5242c5f883b7a913f463ff0bd2d'));
end $$;

create or replace function public.tv_access_kick()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.tv_sync_kick(lower(tg_op));
  return null;
end $$;

drop trigger if exists trg_tv_sync_kick on public.tv_access;
create trigger trg_tv_sync_kick
  after insert or update of state, tv_username on public.tv_access
  for each row when (new.state in ('pending_grant', 'pending_revoke'))
  execute function public.tv_access_kick();

-- backstop every 10 minutes (retries after a TradingView hiccup or fresh cookies)
select cron.unschedule('tv-sync') where exists (select 1 from cron.job where jobname = 'tv-sync');
select cron.schedule('tv-sync', '*/10 * * * *', $$select public.tv_sync_kick('cron')$$);
