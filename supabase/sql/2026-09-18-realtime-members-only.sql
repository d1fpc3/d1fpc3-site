-- Live presence ("who is online") and typing signals ride on Realtime broadcast and
-- presence, which carried no authorization: any signed-in account could listen. The app
-- now joins these topics as PRIVATE channels, and these policies decide who may.
--   online          : members only
--   room:channel:*  : members only
--   room:dm:<id>    : only the two people in that DM
-- (realtime.messages already has row level security on; it is owned by Supabase)

drop policy if exists echelon_members_listen on realtime.messages;
create policy echelon_members_listen on realtime.messages for select to authenticated using (
  (select public.is_member()) and (
    realtime.topic() = 'online'
    or realtime.topic() like 'room:channel:%'
    or (realtime.topic() like 'room:dm:%' and exists (
          select 1 from public.dm_threads t
           where t.id::text = split_part(realtime.topic(), ':', 3)
             and (t.user_lo = (select auth.uid()) or t.user_hi = (select auth.uid()))))
  )
);
drop policy if exists echelon_members_send on realtime.messages;
create policy echelon_members_send on realtime.messages for insert to authenticated with check (
  (select public.is_member()) and (
    realtime.topic() = 'online'
    or realtime.topic() like 'room:channel:%'
    or (realtime.topic() like 'room:dm:%' and exists (
          select 1 from public.dm_threads t
           where t.id::text = split_part(realtime.topic(), ':', 3)
             and (t.user_lo = (select auth.uid()) or t.user_hi = (select auth.uid()))))
  )
);
