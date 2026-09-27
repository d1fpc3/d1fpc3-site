-- Echelon | custom GEX alerts (2026-09-27)
--
-- A D1 GEX holder builds their own pushes: gamma regime flips, NQ near a wall or the
-- flip, VXN above / below a number, VXN going high or low for its year, vol turning,
-- the VIX curve inverting. send-push { gex_alerts: true } evaluates every enabled row
-- once a minute in cash hours and pushes on the edge (the condition turning true),
-- never while it stays true. last_state is the evaluator's memory; the member only
-- ever writes kind, params and enabled.

create table if not exists public.gex_alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind          text not null check (kind in ('regime', 'level', 'vxn_above', 'vxn_below', 'vol_level', 'vol_rising', 'curve')),
  params        jsonb not null default '{}'::jsonb,
  enabled       boolean not null default true,
  last_state    text,
  last_fired_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists gex_alerts_user on public.gex_alerts (user_id);
create index if not exists gex_alerts_enabled on public.gex_alerts (enabled) where enabled;

alter table public.gex_alerts enable row level security;

-- own rows only; creating one needs an active D1 GEX entitlement (or staff)
drop policy if exists gex_alerts_select on public.gex_alerts;
create policy gex_alerts_select on public.gex_alerts for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists gex_alerts_insert on public.gex_alerts;
create policy gex_alerts_insert on public.gex_alerts for insert to authenticated with check (
  user_id = (select auth.uid())
  and (exists (select 1 from public.entitlements e where e.user_id = (select auth.uid()) and e.product = 'd1-gex' and e.status = 'active')
       or (select public.is_admin()))
);
drop policy if exists gex_alerts_update on public.gex_alerts;
create policy gex_alerts_update on public.gex_alerts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists gex_alerts_delete on public.gex_alerts;
create policy gex_alerts_delete on public.gex_alerts for delete to authenticated using (user_id = (select auth.uid()));

-- at most 20 per member. A trigger, not a policy: a policy that counts its own table recurses
create or replace function public.gex_alerts_cap() returns trigger language plpgsql security definer set search_path to 'public' as $cap$
begin
  if (select count(*) from public.gex_alerts where user_id = new.user_id) >= 20 then
    raise exception 'gex alert limit reached (20)' using errcode = 'check_violation';
  end if;
  return new;
end $cap$;
revoke all on function public.gex_alerts_cap() from public, anon, authenticated;
drop trigger if exists gex_alerts_cap on public.gex_alerts;
create trigger gex_alerts_cap before insert on public.gex_alerts for each row execute function public.gex_alerts_cap();

-- members may not write the evaluator's memory
revoke update on public.gex_alerts from authenticated;
grant select, insert, delete on public.gex_alerts to authenticated;
grant update (kind, params, enabled) on public.gex_alerts to authenticated;

-- the kick: reads the push secret from Vault (not a literal in the function body)
create or replace function public.gex_alerts_kick()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare s text;
begin
  if not exists (select 1 from public.gex_alerts where enabled) then return; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'push_webhook_secret';
  if s is null then return; end if;
  perform net.http_post(
    url     := 'https://cqdignbleethroyxxvzr.supabase.co/functions/v1/send-push',
    body    := jsonb_build_object('gex_alerts', true),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', s)
  );
end; $function$;
revoke all on function public.gex_alerts_kick() from public, anon, authenticated;

-- every minute, 13:00 to 21:59 UTC on weekdays (covers 09:30 to 16:15 New York across DST;
-- send-push itself no-ops outside the cash session)
select cron.unschedule('gex-alerts') where exists (select 1 from cron.job where jobname = 'gex-alerts');
select cron.schedule('gex-alerts', '* 13-21 * * 1-5', 'select public.gex_alerts_kick()');
