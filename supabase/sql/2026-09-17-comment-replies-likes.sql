-- Feed comments: one level of replies, likes on a comment, and live updates (2026-09-17).
-- Idempotent. Run through the Management API.
alter table public.post_comments add column if not exists parent_id uuid references public.post_comments(id) on delete cascade;
create index if not exists post_comments_recap_created on public.post_comments (recap_id, created_at);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists comment_likes_user on public.comment_likes (user_id);
alter table public.comment_likes enable row level security;
revoke all on public.comment_likes from anon, public;
grant select, insert, delete on public.comment_likes to authenticated;
drop policy if exists comment_likes_read on public.comment_likes;
drop policy if exists comment_likes_insert on public.comment_likes;
drop policy if exists comment_likes_delete on public.comment_likes;
create policy comment_likes_read   on public.comment_likes for select to authenticated using (true);
create policy comment_likes_insert on public.comment_likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy comment_likes_delete on public.comment_likes for delete to authenticated using (user_id = (select auth.uid()));

-- a reply also reaches the person it answers
create or replace function public.post_comments_notify() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
declare v_owner uuid; v_parent uuid;
begin
  select user_id into v_owner from member_recaps where id = new.recap_id;
  if new.parent_id is not null then
    select user_id into v_parent from post_comments where id = new.parent_id;
    if v_parent is not null and v_parent <> v_owner then
      perform notify(v_parent, 'comment', new.user_id, new.recap_id, new.id, left('replied: ' || new.body, 140));
    end if;
  end if;
  perform notify(v_owner, 'comment', new.user_id, new.recap_id, new.id, left(new.body, 140));
  return new;
end; $fn$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'post_comments') then
    alter publication supabase_realtime add table public.post_comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'comment_likes') then
    alter publication supabase_realtime add table public.comment_likes;
  end if;
end $$;
