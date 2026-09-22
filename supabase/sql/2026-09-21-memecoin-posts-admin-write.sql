-- The admin can post notes and alerts to the memecoin wire from the dashboard
-- (echelon/admin, Memecoins > Desk > Write). Applied 2026-09-21.
--
-- Digests stay the tracker's alone: the browser may insert, edit or delete
-- notes and alerts only, and only when Postgres says the caller is an admin.
-- Reads were already admin-only (memecoin_posts_admin_read). anon keeps nothing.

drop policy if exists memecoin_posts_admin_insert on public.memecoin_posts;
drop policy if exists memecoin_posts_admin_update on public.memecoin_posts;
drop policy if exists memecoin_posts_admin_delete on public.memecoin_posts;

create policy memecoin_posts_admin_insert on public.memecoin_posts
  for insert to authenticated
  with check (is_admin() and kind in ('note', 'alert'));

create policy memecoin_posts_admin_update on public.memecoin_posts
  for update to authenticated
  using (is_admin() and kind in ('note', 'alert'))
  with check (is_admin() and kind in ('note', 'alert'));

create policy memecoin_posts_admin_delete on public.memecoin_posts
  for delete to authenticated
  using (is_admin() and kind in ('note', 'alert'));

revoke all on public.memecoin_posts from anon;
