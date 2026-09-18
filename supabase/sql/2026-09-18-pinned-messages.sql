-- Chat: staff pin a message to the top of a conversation (2026-09-18). Idempotent.
alter table public.messages add column if not exists pinned_at timestamptz;
alter table public.messages add column if not exists pinned_by uuid references auth.users(id) on delete set null;
create index if not exists messages_pinned on public.messages (channel_id, pinned_at desc) where pinned_at is not null;
create or replace function public.pin_message(p_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not is_staff() then raise exception 'staff only'; end if;
  update messages set pinned_at = case when p_on then now() else null end, pinned_by = case when p_on then auth.uid() else null end
  where id = p_id and deleted_at is null and channel_id is not null;
end; $fn$;
revoke all on function public.pin_message(uuid, boolean) from public, anon;
grant execute on function public.pin_message(uuid, boolean) to authenticated;
