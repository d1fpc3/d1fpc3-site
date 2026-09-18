-- Command palette: search messages across every conversation the caller can read (2026-09-18).
-- SECURITY INVOKER so row level security on messages decides what comes back.
create or replace function public.search_messages(p_q text, p_limit int default 20)
returns table (id uuid, channel_id uuid, dm_id uuid, user_id uuid, body text, created_at timestamptz)
language sql stable security invoker set search_path to 'public' as $fn$
  select m.id, m.channel_id, m.dm_id, m.user_id, left(m.body, 200), m.created_at
  from messages m
  where m.deleted_at is null and m.body is not null and length(trim(p_q)) >= 2
    and m.body ilike '%' || replace(replace(replace(trim(p_q), '\', '\'), '%', '\%'), '_', '\_') || '%'
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$fn$;
revoke all on function public.search_messages(text, int) from public, anon;
grant execute on function public.search_messages(text, int) to authenticated;
