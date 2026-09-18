-- open_dm runs with the owner's rights, so the members_only policy on dm_threads never
-- applied to it: any signed-in account, even one that owns nothing, could open a thread
-- with any member. The caller now has to be a member, and so does the other side.
create or replace function public.open_dm(p_other uuid)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare me uuid := auth.uid(); a uuid; b uuid; tid uuid;
begin
  if me is null or p_other is null or me = p_other then raise exception 'bad_dm'; end if;
  if not public.is_member() then raise exception 'members_only'; end if;
  if not exists (select 1 from public.profiles where user_id = p_other) then raise exception 'no_such_member'; end if;
  if not exists (select 1 from public.entitlements e where e.user_id = p_other and e.status = 'active')
     and not exists (select 1 from public.admins where user_id = p_other)
     and not exists (select 1 from public.mods where user_id = p_other) then raise exception 'no_such_member'; end if;
  a := least(me, p_other); b := greatest(me, p_other);
  insert into public.dm_threads (user_lo, user_hi) values (a, b)
    on conflict (user_lo, user_hi) do update set last_at = public.dm_threads.last_at
    returning id into tid;
  return tid;
end $function$;
revoke all on function public.open_dm(uuid) from public, anon;
grant execute on function public.open_dm(uuid) to authenticated;
