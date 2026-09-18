-- Staff (admins and mods) see how each library video is doing: who watched, how many
-- plays, who liked. Members never get this; the function returns nothing for them.
create or replace function public.library_stats()
returns table (video_id uuid, viewers int, plays int, likes int, viewer_names text[], liker_names text[])
language sql stable security definer set search_path = public, pg_temp
as $$
  select v.id,
    coalesce((select count(*)::int from library_views w where w.video_id = v.id), 0),
    coalesce((select sum(w.view_count)::int from library_views w where w.video_id = v.id), 0),
    coalesce((select count(*)::int from library_likes k where k.video_id = v.id), 0),
    coalesce((select array_agg(coalesce(p.username, 'member') order by w.last_viewed_at desc)
              from library_views w left join profiles p on p.user_id = w.user_id where w.video_id = v.id), '{}'),
    coalesce((select array_agg(coalesce(p.username, 'member') order by k.created_at desc)
              from library_likes k left join profiles p on p.user_id = k.user_id where k.video_id = v.id), '{}')
  from library_videos v
  where public.is_staff();
$$;
revoke all on function public.library_stats() from public, anon;
grant execute on function public.library_stats() to authenticated;
