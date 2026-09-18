-- Members only (2026-09-18). Before this, anyone who called the public sign-up endpoint got an
-- authenticated session and could read chat, the feed, comments, profiles and the library list
-- without owning anything. Sign-ups are now off in Auth, and these RESTRICTIVE policies make the
-- database say the same thing: reading or writing member content needs an active entitlement or
-- staff. Restrictive policies AND with the existing ones, so rolling back is dropping them.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path to 'public' as $fn$
  select public.has_access() or public.is_staff();
$fn$;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated, service_role;

do $$ declare t text; begin
  foreach t in array array['messages','channels','dm_threads','member_recaps','post_comments','post_likes','comment_likes','follows','poll_votes','message_reactions','mods','library_videos','library_views','chat_role_perms','lesson_notes','lesson_views','journal_entries','homework_submissions'] loop
    execute format('drop policy if exists members_only on public.%I', t);
    execute format('create policy members_only on public.%I as restrictive for all to authenticated using ((select public.is_member())) with check ((select public.is_member()))', t);
  end loop;
end $$;

-- profiles: your own row is always yours (the gate and onboarding need it); everyone else's is for members
drop policy if exists members_only_read on public.profiles;
create policy members_only_read on public.profiles as restrictive for select to authenticated
  using ((select public.is_member()) or user_id = (select auth.uid()));

-- the two definer views carried the same data past RLS: gate them the same way
create or replace view public.member_directory as
  select user_id, username, bio, avatar_url, created_at,
    ((exists (select 1 from entitlements e where e.user_id = p.user_id and e.status = 'active')) or (exists (select 1 from admins a where a.user_id = p.user_id))) as is_premium,
    (exists (select 1 from admins a where a.user_id = p.user_id)) as is_admin,
    (exists (select 1 from mods m where m.user_id = p.user_id)) as is_mod
  from profiles p
  where (select public.is_member()) or p.user_id = (select auth.uid());
create or replace view public.chat_staff as
  select s.user_id, s.role from (
    select admins.user_id, 'owner'::text as role from admins
    union
    select m.user_id, 'mod'::text as role from mods m where not exists (select 1 from admins a where a.user_id = m.user_id)
  ) s where (select public.is_member());

-- trigger functions are not callable, but nothing outside the database needs execute on them
revoke all on function public.messages_mentions() from public, anon, authenticated;
revoke all on function public.post_comments_mentions() from public, anon, authenticated;
