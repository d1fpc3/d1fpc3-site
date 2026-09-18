-- Members can like a library video. One like per member per video; everyone in the
-- membership sees the counts; nobody outside it sees anything (same restrictive rule
-- as every other member table).
create table if not exists public.library_likes (
  video_id uuid not null references public.library_videos(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);
create index if not exists library_likes_user_idx on public.library_likes (user_id);

alter table public.library_likes enable row level security;
revoke all on public.library_likes from anon, authenticated;
grant select, insert, delete on public.library_likes to authenticated;

drop policy if exists library_likes_read on public.library_likes;
create policy library_likes_read on public.library_likes for select to authenticated using (true);
drop policy if exists library_likes_add on public.library_likes;
create policy library_likes_add on public.library_likes for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists library_likes_remove on public.library_likes;
create policy library_likes_remove on public.library_likes for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists members_only on public.library_likes;
create policy members_only on public.library_likes as restrictive for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
