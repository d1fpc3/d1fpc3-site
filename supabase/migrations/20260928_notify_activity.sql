-- Notifications you set per kind (D1, 09-28: "fully customizable notifications for everything like follows likes
-- comments all that").
--
-- notify_prefs.activity: one rule per social kind, absent = the default.
--   like, comment, reply, mention   'off' | 'following' | 'everyone'   (default 'everyone')
--   follow, post, reaction          'off' | 'on'                         (default 'on')
-- notify_prefs.paused_until: nothing is pushed to this member before then (Pause all).
-- send-push reads both; the inbox still lists everything.
alter table public.notify_prefs add column if not exists activity jsonb not null default '{}'::jsonb;
alter table public.notify_prefs add column if not exists paused_until timestamptz;

-- The two new kinds (without this a trigger insert fails and takes the post or the reaction down with it).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['like', 'comment', 'follow', 'gex', 'system', 'news', 'sweep', 'post', 'reaction']));

-- Anyone who had the old single "Likes, comments, follows" switch off keeps every social kind quiet.
update public.notify_prefs
   set activity = '{"like":"off","comment":"off","reply":"off","mention":"off","follow":"off","post":"off","reaction":"off"}'::jsonb,
       social = true
 where social = false;

-- A new trade post reaches the author's followers (not the ones who turned "post" off, not anyone who blocked them).
create or replace function public.member_recaps_notify_followers()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform notify(f.follower_id, 'post', new.user_id, new.id, null,
                 left(coalesce(nullif(btrim(new.title), ''), nullif(btrim(new.body), ''), 'New trade'), 140))
     from follows f
    where f.followee_id = new.user_id
      and f.follower_id <> new.user_id
      and coalesce((select np.activity ->> 'post' from notify_prefs np where np.user_id = f.follower_id), 'on') <> 'off'
      and not exists (select 1 from user_blocks b where b.blocker = f.follower_id and b.blocked = new.user_id);
  return new;
end $function$;

drop trigger if exists member_recaps_notify on public.member_recaps;
create trigger member_recaps_notify after insert on public.member_recaps
  for each row execute function public.member_recaps_notify_followers();

-- A reaction on your chat message. Body is "<emoji> <the message>", once per person, emoji and message.
create or replace function public.message_reactions_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_author uuid;
  v_text text;
  v_body text;
begin
  select m.user_id, coalesce(nullif(btrim(regexp_replace(m.body, '\s+', ' ', 'g')), ''), case when m.image_url is not null then 'your chart' else 'your message' end)
    into v_author, v_text
    from messages m where m.id = new.message_id and m.deleted_at is null;
  if v_author is null or v_author = new.user_id then return new; end if;
  if coalesce((select np.activity ->> 'reaction' from notify_prefs np where np.user_id = v_author), 'on') = 'off' then return new; end if;
  if exists (select 1 from user_blocks b where b.blocker = v_author and b.blocked = new.user_id) then return new; end if;
  v_body := left(new.emoji || ' ' || v_text, 140);
  if exists (select 1 from notifications n where n.user_id = v_author and n.kind = 'reaction' and n.actor_id = new.user_id and n.body = v_body) then
    return new;
  end if;
  perform notify(v_author, 'reaction', new.user_id, null, null, v_body);
  return new;
end $function$;

drop trigger if exists message_reactions_notify on public.message_reactions;
create trigger message_reactions_notify after insert on public.message_reactions
  for each row execute function public.message_reactions_notify();
