-- Library captions: one-time database setup. Applied to prod 2026-09-16 via
-- the Management API. Kept here as the record; not a migration.
--
-- A posted video queues itself; the GitHub job (.github/workflows/captions.yml,
-- scripts/captions.py) works the queue every 15 minutes. No pg_net, no edge
-- function: the first cut (AssemblyAI) was dropped the same day, D1 wants no
-- third-party account for this.

alter table public.library_videos
  add column if not exists captions_path text,
  add column if not exists captions_status text,
  add column if not exists captions_error text;
alter table public.library_videos drop column if exists captions_job;
alter table public.library_videos drop constraint if exists library_videos_captions_status_check;
alter table public.library_videos add constraint library_videos_captions_status_check
  check (captions_status is null or captions_status in ('queued', 'working', 'ready', 'failed'));

-- the AssemblyAI-era kick, gone
drop trigger if exists trg_captions_kick on public.library_videos;
drop function if exists public.library_videos_captions_kick();
drop function if exists public.captions_kick(uuid, text);
select cron.unschedule('captions-poll') where exists (select 1 from cron.job where jobname = 'captions-poll');

-- every new video starts queued
create or replace function public.library_videos_captions_queue()
returns trigger language plpgsql as $$
begin
  if new.captions_status is null then new.captions_status := 'queued'; end if;
  return new;
end $$;
drop trigger if exists trg_captions_queue on public.library_videos;
create trigger trg_captions_queue
  before insert on public.library_videos
  for each row execute function public.library_videos_captions_queue();

-- backfill: everything already posted joins the queue
update public.library_videos set captions_status = 'queued', captions_error = null
 where captions_status is distinct from 'ready';
