-- captions: one-time database setup. Applied to prod 2026-09-16 via the
-- Management API. Kept here as the record; not a migration.
--
-- Same shape as tv-sync: a pg_net kick with the shared x-webhook-secret, a
-- trigger that fires it, and a cron backstop.

alter table public.library_videos
  add column if not exists captions_path text,
  add column if not exists captions_status text
    check (captions_status is null or captions_status in ('working', 'ready', 'failed')),
  add column if not exists captions_error text,
  add column if not exists captions_job text;

-- kick the function (pg_net, async, sends after commit)
create or replace function public.captions_kick(p_id uuid, p_action text default 'start')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://cqdignbleethroyxxvzr.supabase.co/functions/v1/captions',
    body    := jsonb_build_object('action', p_action, 'id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-webhook-secret', '825447c027f748392987d5242c5f883b7a913f463ff0bd2d'));
end $$;
revoke execute on function public.captions_kick(uuid, text) from public, anon, authenticated;

create or replace function public.library_videos_captions_kick()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.captions_kick(new.id, 'start');
  return null;
end $$;

drop trigger if exists trg_captions_kick on public.library_videos;
create trigger trg_captions_kick
  after insert on public.library_videos
  for each row execute function public.library_videos_captions_kick();

-- backstop every 10 minutes: finishes any job whose webhook never landed
select cron.unschedule('captions-poll') where exists (select 1 from cron.job where jobname = 'captions-poll');
select cron.schedule('captions-poll', '*/10 * * * *', $$select public.captions_kick(null, 'poll')$$);
