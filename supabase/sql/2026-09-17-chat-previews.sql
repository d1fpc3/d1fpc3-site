-- Chat rail: the newest message of every conversation the caller can read, in one call (2026-09-17).
-- SECURITY INVOKER on purpose: row level security on channels, dm_threads and messages decides what comes back.
create or replace function public.chat_previews()
returns table (scope text, user_id uuid, body text, has_image boolean, has_poll boolean, created_at timestamptz)
language sql stable security invoker set search_path to 'public' as $fn$
  select 'channel:' || c.id, m.user_id, left(m.body, 120), m.image_url is not null, m.poll is not null, m.created_at
  from channels c
  join lateral (select * from messages x where x.channel_id = c.id and x.deleted_at is null order by x.created_at desc limit 1) m on true
  union all
  select 'dm:' || d.id, m.user_id, left(m.body, 120), m.image_url is not null, m.poll is not null, m.created_at
  from dm_threads d
  join lateral (select * from messages x where x.dm_id = d.id and x.deleted_at is null order by x.created_at desc limit 1) m on true;
$fn$;
revoke all on function public.chat_previews() from public, anon;
grant execute on function public.chat_previews() to authenticated;
