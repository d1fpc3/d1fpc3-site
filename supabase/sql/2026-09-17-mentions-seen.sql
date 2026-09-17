-- @mentions reach the inbox, and a DM shows when the other person has read it (2026-09-17). Idempotent.

-- everyone named with @username in a channel message or a feed comment gets a notification
-- (kind 'system', which the inbox and send-push already know). DMs already notify on their own.
create or replace function public.notify_mentions(p_actor uuid, p_text text, p_where text, p_recap uuid, p_comment uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_name text; v_user uuid; v_seen uuid[] := '{}';
begin
  if p_text is null or position('@' in p_text) = 0 then return; end if;
  for v_name in select distinct lower(m[1]) from regexp_matches(p_text, '(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_.]{2,32})', 'g') m limit 10 loop
    select user_id into v_user from profiles where lower(username) = trim(trailing '.' from v_name);
    if v_user is not null and v_user <> p_actor and not (v_user = any(v_seen)) then
      v_seen := v_seen || v_user;
      perform notify(v_user, 'system', p_actor, p_recap, p_comment, left('mentioned you in ' || p_where || ': ' || p_text, 140));
    end if;
  end loop;
end; $fn$;
revoke all on function public.notify_mentions(uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.notify_mentions(uuid, text, text, uuid, uuid) to service_role;

create or replace function public.messages_mentions() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
declare v_chan text;
begin
  if new.channel_id is null or new.body is null then return new; end if;
  select '#' || slug into v_chan from channels where id = new.channel_id;
  perform notify_mentions(new.user_id, new.body, coalesce(v_chan, 'chat'), null, null);
  return new;
end; $fn$;
drop trigger if exists messages_mentions on public.messages;
create trigger messages_mentions after insert on public.messages for each row execute function public.messages_mentions();

create or replace function public.post_comments_mentions() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  perform notify_mentions(new.user_id, new.body, 'a comment', new.recap_id, new.id);
  return new;
end; $fn$;
drop trigger if exists post_comments_mentions on public.post_comments;
create trigger post_comments_mentions after insert on public.post_comments for each row execute function public.post_comments_mentions();

-- when the other person in a DM last read it; only a participant may ask
create or replace function public.dm_seen(p_dm uuid) returns timestamptz
language sql stable security definer set search_path to 'public' as $fn$
  select rs.last_read_at
  from dm_threads d
  join read_state rs on rs.scope = 'dm:' || d.id and rs.user_id = case when d.user_lo = auth.uid() then d.user_hi else d.user_lo end
  where d.id = p_dm and auth.uid() in (d.user_lo, d.user_hi);
$fn$;
revoke all on function public.dm_seen(uuid) from public, anon;
grant execute on function public.dm_seen(uuid) to authenticated;

