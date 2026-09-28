-- Report and block (App Review 1.2, user-generated content): any member can
-- report a chat message, a post, a comment or a member, and can block a member.
-- Reports land in content_reports (admins read and resolve them) and ping every
-- admin's bell. A block hides the blocked member's content from the blocker
-- (client side) and stops them opening or writing in a DM with the blocker
-- (server side, below). Idempotent: safe to run twice.

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_user uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('message', 'post', 'comment', 'member')),
  target_id text,
  excerpt text check (char_length(excerpt) <= 500),
  reason text not null check (reason in ('spam', 'harassment', 'explicit', 'other')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create index if not exists content_reports_open_idx on public.content_reports (created_at desc) where resolved_at is null;
alter table public.content_reports enable row level security;

drop policy if exists content_reports_insert on public.content_reports;
create policy content_reports_insert on public.content_reports
  for insert to authenticated
  with check (reporter = (select auth.uid()) and resolved_at is null and resolved_by is null);
drop policy if exists content_reports_admin_read on public.content_reports;
create policy content_reports_admin_read on public.content_reports
  for select to authenticated using ((select public.is_admin()));
drop policy if exists content_reports_admin_update on public.content_reports;
create policy content_reports_admin_update on public.content_reports
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.user_blocks (
  blocker uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.user_blocks enable row level security;
drop policy if exists user_blocks_own_read on public.user_blocks;
create policy user_blocks_own_read on public.user_blocks
  for select to authenticated using (blocker = (select auth.uid()));
drop policy if exists user_blocks_own_insert on public.user_blocks;
create policy user_blocks_own_insert on public.user_blocks
  for insert to authenticated with check (blocker = (select auth.uid()));
drop policy if exists user_blocks_own_delete on public.user_blocks;
create policy user_blocks_own_delete on public.user_blocks
  for delete to authenticated using (blocker = (select auth.uid()));

-- Every admin hears about a report in the bell ('system' notification). The
-- reporter stays anonymous in the note; admins see who in the Reports list.
create or replace function public.content_report_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text;
  what text;
begin
  select username into who from profiles where user_id = new.target_user;
  what := case new.kind
    when 'message' then 'a chat message'
    when 'post' then 'a post'
    when 'comment' then 'a comment'
    else 'a member' end;
  insert into notifications (user_id, kind, body)
  select a.user_id, 'system',
         'New report: ' || what || coalesce(' by @' || who, '') || ' (' || new.reason || '). Open Admin, Reports.'
    from admins a
   where a.user_id is not null;
  return new;
end $$;
revoke execute on function public.content_report_alert() from public, anon, authenticated;
drop trigger if exists trg_content_report_alert on public.content_reports;
create trigger trg_content_report_alert after insert on public.content_reports
  for each row execute function public.content_report_alert();

-- True when the other person in DM p_dm has blocked the caller. Definer so the
-- check can see the other member's block row (RLS only shows your own).
create or replace function public.dm_blocked(p_dm uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from dm_threads t
      join user_blocks b
        on b.blocked = auth.uid()
       and b.blocker = case when t.user_lo = auth.uid() then t.user_hi else t.user_lo end
     where t.id = p_dm
  )
$$;
revoke execute on function public.dm_blocked(uuid) from public, anon;
grant execute on function public.dm_blocked(uuid) to authenticated;

drop policy if exists messages_dm_not_blocked on public.messages;
create policy messages_dm_not_blocked on public.messages
  as restrictive for insert to authenticated
  with check (dm_id is null or not public.dm_blocked(dm_id));
