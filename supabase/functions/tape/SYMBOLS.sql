-- nq_bars holds more than NQ (2026-09-17): a symbol column, keyed (symbol, interval, t).
-- NQ, MNQ, ES, MES. Existing rows are NQ. Run once; every statement is idempotent.
alter table public.nq_bars add column if not exists symbol text not null default 'NQ';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'nq_bars_symbol_check') then
    alter table public.nq_bars add constraint nq_bars_symbol_check check (symbol in ('NQ','MNQ','ES','MES'));
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'nq_bars_pkey') not like '%symbol%' then
    alter table public.nq_bars drop constraint nq_bars_pkey;
    alter table public.nq_bars add constraint nq_bars_pkey primary key (symbol, "interval", t);
  end if;
end $$;
drop index if exists public.nq_bars_interval_t_desc;
create index if not exists nq_bars_symbol_interval_t_desc on public.nq_bars (symbol, "interval", t desc);

drop function if exists public.nq_bars_json(text, timestamptz, timestamptz, integer);
create or replace function public.nq_bars_json(p_interval text, p_from timestamptz, p_to timestamptz, p_cap integer default 60000, p_symbol text default 'NQ')
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(jsonb_agg(jsonb_build_array(extract(epoch from t)::bigint, o, h, l, c, v) order by t), '[]'::jsonb)
  from (select t, o, h, l, c, v from public.nq_bars where symbol = p_symbol and "interval" = p_interval and t >= p_from and t < p_to order by t desc limit p_cap) b;
$fn$;
revoke all on function public.nq_bars_json(text, timestamptz, timestamptz, integer, text) from public, anon, authenticated;
grant execute on function public.nq_bars_json(text, timestamptz, timestamptz, integer, text) to service_role;

create or replace function public.nq_session_days() returns setof date language sql stable security definer set search_path to 'public' as $fn$
  select d from (
    select distinct case when (t at time zone 'America/New_York')::time >= time '18:00'
                         then (t at time zone 'America/New_York')::date + 1
                         else (t at time zone 'America/New_York')::date end as d
    from public.nq_bars where symbol = 'NQ' and "interval" = '1m'
  ) x order by d desc;
$fn$;

-- the nightly store loops every symbol; the secrets stay inside the function, so patch its text in place
do $$ declare d text; begin
  d := pg_get_functiondef('public.nq_store'::regproc);
  if d not like '%unnest(array[%' then
    d := replace(d, 'select * from jsonb_array_elements(', 'select e || jsonb_build_object(''symbol'', sym) from unnest(array[''NQ'',''MNQ'',''ES'',''MES'']) sym, jsonb_array_elements(');
    d := replace(d, '::jsonb) loop', '::jsonb) e loop');
    execute d;
  end if;
end $$;
