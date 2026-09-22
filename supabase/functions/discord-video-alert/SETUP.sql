-- discord-video-alert: one-time database setup. Applied to prod 2026-09-19 via the
-- Management API. Kept here as the record; not a migration. Re-runnable.

-- Bookkeeping on the video row. discord_notified_at is the one idempotency key:
-- null it (with discord_attempts = 0) and the video is announced again.
-- discord_ready_at is the quiet-window clock, bumped by trg_discord_ready below.
alter table public.library_videos
  add column if not exists discord_notified_at timestamptz,
  add column if not exists discord_claimed_at  timestamptz,
  add column if not exists discord_attempts    smallint not null default 0,
  add column if not exists discord_error       text,
  add column if not exists discord_message_id  text,
  add column if not exists discord_ready_at    timestamptz not null default now();

comment on column public.library_videos.discord_notified_at is
  'Stamped by the discord-video-alert edge function only after Discord answers 200. Null it together with discord_attempts = 0 to re-announce.';

create index if not exists library_videos_discord_pending_idx
  on public.library_videos (created_at) where discord_notified_at is null;

-- The first minutes after a post are when D1 swaps the poster or fixes the title,
-- so any edit that changes what the announcement would SAY restarts the quiet
-- window. Caption writes and view counts deliberately do not. Once a video has
-- been announced, edits stop touching it.
create or replace function public.library_videos_discord_touch() returns trigger
language plpgsql as $$
begin
  new.discord_ready_at := now();
  return new;
end $$;

drop trigger if exists trg_discord_ready on public.library_videos;
create trigger trg_discord_ready
  before update of title, summary, category, thumb_path, storage_path, is_published
  on public.library_videos
  for each row when (old.discord_notified_at is null)
  execute function public.library_videos_discord_touch();

-- One row of operator state. Service role only: no policies on purpose.
-- enabled = false is the kill switch, and needs no deploy.
create table if not exists public.discord_alert_health (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  quiet_minutes smallint not null default 15,
  go_live_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  last_result jsonb
);
alter table public.discord_alert_health enable row level security;
revoke all on public.discord_alert_health from anon, authenticated;

-- go_live_at is a hard floor, independent of the backfill below: nothing posted
-- before the bot existed can ever be announced, however the flags are reset.
insert into public.discord_alert_health (id, go_live_at)
values (1, '2026-09-19 00:00:00+00') on conflict (id) do nothing;

-- Backfill: everything already in the library counts as announced, so switching
-- the bot on does not replay the back catalogue into #updates. The video posted
-- on 2026-09-19 is deliberately left unstamped as the live end-to-end test.
update public.library_videos
   set discord_notified_at = created_at
 where discord_notified_at is null
   and created_at < '2026-09-19 00:00:00+00';

-- Lease up to p_limit eligible rows and hand them to the edge function. This
-- single statement is where double posting is prevented: FOR UPDATE SKIP LOCKED
-- means a second caller (a cron tick landing on a cold start, or a hand-run
-- invoke) claims nothing rather than the same row. A claim that is never
-- stamped goes back in the queue after five minutes; five failed attempts and
-- the row is left alone for a human.
create or replace function public.discord_video_claim(p_limit int default 3)
returns setof public.library_videos
language plpgsql security definer set search_path to 'public' as $$
declare h public.discord_alert_health;
begin
  select * into h from public.discord_alert_health where id = 1;
  if not found or not h.enabled then return; end if;

  return query
  update public.library_videos v
     set discord_claimed_at = now(),
         discord_attempts   = v.discord_attempts + 1
   where v.id in (
     select c.id from public.library_videos c
      where c.is_published
        and c.audience = 'members'
        and c.discord_notified_at is null
        and c.discord_attempts < 5
        and c.created_at > h.go_live_at
        and c.discord_ready_at < now() - make_interval(mins => h.quiet_minutes)
        and (c.discord_claimed_at is null or c.discord_claimed_at < now() - interval '5 minutes')
      order by c.created_at
      for update skip locked
      limit least(greatest(p_limit, 1), 5))
  returning v.*;
end $$;

create or replace function public.discord_alert_health_note(p_ok boolean, p_result jsonb, p_error text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.discord_alert_health set
    last_attempt_at      = now(),
    last_result          = p_result,
    last_ok_at           = case when p_ok then now() else last_ok_at end,
    last_error           = case when p_ok then null else p_error end,
    consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end
  where id = 1;
end $$;

-- The cron tick. It checks for work in Postgres and returns without calling
-- pg_net when there is none, so net._http_response stays readable for tv-sync
-- debugging instead of filling with 1440 empty rows a day.
-- The service-role key is read from Vault: this file is in a public repo, so no
-- credential may ever be written into it. Create the secret once, out of band:
--   select vault.create_secret('<service_role_key>', 'service_role_key', 'discord-video-alert kick');
create or replace function public.discord_video_kick() returns void
language plpgsql security definer set search_path to 'public', 'vault' as $$
declare k text; n int;
begin
  select count(*) into n
    from public.discord_alert_health h
    join public.library_videos v on true
   where h.id = 1 and h.enabled
     and v.is_published
     and v.audience = 'members'
     and v.discord_notified_at is null
     and v.discord_attempts < 5
     and v.created_at > h.go_live_at
     and v.discord_ready_at < now() - make_interval(mins => h.quiet_minutes)
     and (v.discord_claimed_at is null or v.discord_claimed_at < now() - interval '5 minutes');
  if coalesce(n, 0) = 0 then return; end if;

  select decrypted_secret into k from vault.decrypted_secrets where name = 'service_role_key';
  if k is null then return; end if;

  perform net.http_post(
    url     := 'https://cqdignbleethroyxxvzr.supabase.co/functions/v1/discord-video-alert',
    body    := jsonb_build_object('mode', 'live'),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'apikey', k,
                                  'Authorization', 'Bearer ' || k));
end $$;

revoke all on function public.discord_video_kick()            from public, anon, authenticated;
revoke all on function public.discord_video_claim(int)        from public, anon, authenticated;
revoke all on function public.discord_alert_health_note(boolean, jsonb, text) from public, anon, authenticated;

-- Schedule last, after the backfill has been eyeballed:
--   select cron.schedule('discord-video-alert', '* * * * *', $$select public.discord_video_kick()$$);
