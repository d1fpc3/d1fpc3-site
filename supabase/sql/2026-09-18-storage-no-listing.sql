-- Storage (2026-09-18): the public buckets stay public BY URL (unguessable paths, the way every image in chat
-- and the feed is already addressed), but nobody outside the membership can LIST them any more. Before this,
-- an anonymous request could enumerate every folder (= every member's user id) and every file in chat-media,
-- recap-media and avatars. Public object URLs do not need a SELECT policy; listing does.
drop policy if exists chat_media_read on storage.objects;
drop policy if exists recap_media_read on storage.objects;
drop policy if exists avatars_public_read on storage.objects;
create policy chat_media_read on storage.objects for select to authenticated using (bucket_id = 'chat-media' and (select public.is_member()));
create policy recap_media_read on storage.objects for select to authenticated using (bucket_id = 'recap-media' and (select public.is_member()));
create policy avatars_member_read on storage.objects for select to authenticated using (bucket_id = 'avatars' and ((select public.is_member()) or (storage.foldername(name))[1] = (select auth.uid())::text));
-- uploads: members only, and only into your own folder
drop policy if exists chat_media_write on storage.objects;
create policy chat_media_write on storage.objects for insert to authenticated with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_member()));
drop policy if exists recap_media_insert on storage.objects;
create policy recap_media_insert on storage.objects for insert to authenticated with check (bucket_id = 'recap-media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_member()));
