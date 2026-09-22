-- Library audience: who a video is for. Applied 2026-09-22.
--
--   members  every member (the default, what every video was until now)
--   mods     moderators and the admin only
--   people   the people listed in library_video_access only
--
-- The row is the gate everywhere: the app lists what RLS lets it see, the
-- media-url function signs a URL only for a viewer the same rules admit, and
-- the Discord announcer only ever announces videos every member can watch.
-- The uploader always sees their own video; the admin sees everything.

alter table public.library_videos
  add column if not exists audience text not null default 'members';
alter table public.library_videos drop constraint if exists library_videos_audience_check;
alter table public.library_videos
  add constraint library_videos_audience_check check (audience in ('members', 'mods', 'people'));

create table if not exists public.library_video_access (
  video_id uuid        not null references public.library_videos(id) on delete cascade,
  user_id  uuid        not null,
  added_at timestamptz not null default now(),
  added_by uuid        default auth.uid(),
  primary key (video_id, user_id)
);
alter table public.library_video_access enable row level security;

drop policy if exists library_access_admin on public.library_video_access;
drop policy if exists library_access_own   on public.library_video_access;
drop policy if exists members_only         on public.library_video_access;
create policy library_access_admin on public.library_video_access
  for all to authenticated using (is_admin()) with check (is_admin());
create policy library_access_own on public.library_video_access
  for select to authenticated using (user_id = (select auth.uid()));
create policy members_only on public.library_video_access
  as restrictive for all to authenticated using ((select is_member()));
-- the uploader (a mod posting from the app) manages the list on their own videos.
-- Through a SECURITY DEFINER helper on purpose: library_read on library_videos looks
-- at this table, so a policy here that read library_videos under RLS would recurse
-- ("infinite recursion detected in policy") and break every library read.
create or replace function public.library_video_owner(v_id uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.library_videos v where v.id = v_id and v.created_by = auth.uid()); $$;
revoke all on function public.library_video_owner(uuid) from public, anon;
grant execute on function public.library_video_owner(uuid) to authenticated, service_role;
drop policy if exists library_access_owner on public.library_video_access;
create policy library_access_owner on public.library_video_access
  for all to authenticated
  using (public.library_video_owner(video_id))
  with check (public.library_video_owner(video_id));

revoke all on public.library_video_access from anon;
grant select, insert, delete on public.library_video_access to authenticated;
grant all on public.library_video_access to service_role;

-- who may read a video row (and so see it in the library at all)
drop policy if exists library_read on public.library_videos;
create policy library_read on public.library_videos
  for select to authenticated using (
    is_admin()
    or created_by = (select auth.uid())
    or (is_published and (
         audience = 'members'
      or (audience = 'mods' and (select is_staff()))
      or (audience = 'people' and exists (
            select 1 from public.library_video_access a
             where a.video_id = library_videos.id and a.user_id = (select auth.uid())))
    ))
  );

-- D1Bot announces in the members-only #updates: only videos every member can watch
create or replace function public.discord_video_claim(p_limit integer default 3)
 returns setof public.library_videos
 language plpgsql security definer
 set search_path to 'public'
as $function$
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
end $function$;

create or replace function public.discord_video_kick()
 returns void
 language plpgsql security definer
 set search_path to 'public', 'vault'
as $function$
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
end $function$;

-- a video opened up later (mods -> members) re-arms the quiet window like any other edit
drop trigger if exists trg_discord_ready on public.library_videos;
create trigger trg_discord_ready
  before update of title, summary, category, thumb_path, storage_path, is_published, audience
  on public.library_videos
  for each row when (old.discord_notified_at is null)
  execute function public.library_videos_discord_touch();
