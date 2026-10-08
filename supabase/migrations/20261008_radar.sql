-- Radar (D1, 10-08: "alerts when events happen near me ... special deals ... amazon deals walmart deals").
-- Spec: docs/superpowers/specs/2026-10-08-radar-deals-events-design.md
--
-- radar_items   every deal and event the radar function has seen (one row per source + id)
-- radar_watch   D1's deal watchlist
-- radar_prefs   one row: push switches, the daily deal cap, the hot-deal bar, digest stamps
--
-- Owner-only, like owner_money: D1's login reads and edits, nobody else (not even another admin).
-- The radar function writes with the service role. Anon gets nothing.

create table if not exists public.radar_items (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('deal', 'event')),
  source text not null,
  ext_id text not null,
  title text not null,
  url text not null,
  store text,
  price numeric,
  was_price numeric,
  pct_off numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean not null default false,
  venue text,
  town text,
  category text,
  free boolean,
  score int not null default 0,
  reason text,
  image text,
  pushed_at timestamptz,
  dismissed_at timestamptz,
  saved boolean not null default false,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (source, ext_id)
);
create index if not exists radar_items_kind_seen on public.radar_items (kind, first_seen desc);
create index if not exists radar_items_events_at on public.radar_items (starts_at) where kind = 'event';

create table if not exists public.radar_watch (
  id bigint generated always as identity primary key,
  term text not null,
  query text,
  match text,
  category boolean not null default false,
  max_price numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.radar_prefs (
  id int primary key default 1 check (id = 1),
  deals_push boolean not null default true,
  events_push boolean not null default true,
  deal_cap int not null default 3,
  min_pct int not null default 40,
  sent jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.radar_prefs (id) values (1) on conflict (id) do nothing;

alter table public.radar_items enable row level security;
alter table public.radar_watch enable row level security;
alter table public.radar_prefs enable row level security;

revoke all on public.radar_items, public.radar_watch, public.radar_prefs from anon, authenticated;
grant select, update (dismissed_at, saved) on public.radar_items to authenticated;
grant select, insert, update, delete on public.radar_watch to authenticated;
grant select, update (deals_push, events_push, deal_cap, min_pct, updated_at) on public.radar_prefs to authenticated;

-- d1fpc3@gmail.com, the owner login (same uid as owner_money)
do $$
declare t text;
begin
  foreach t in array array['radar_items', 'radar_watch', 'radar_prefs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (auth.uid() = '4d6829d5-c685-404b-9dbd-d5f3e1f7be3f'::uuid)
      with check (auth.uid() = '4d6829d5-c685-404b-9dbd-d5f3e1f7be3f'::uuid)$p$, t || '_owner', t);
  end loop;
end $$;

-- the seed watchlist D1 gave (10-08): food, gatorade, monster, bloom, alani, bagels
insert into public.radar_watch (term, query, match, category)
select * from (values
  ('Food', null, '\b(snacks?|chips|cereal|coffee|k-cups?|candy|chocolate|jerky|protein|granola|nuts|almonds|cashews|pistachios|pasta|sauce|soup|oatmeal|crackers|cookies|popcorn|pretzels?|olive oil|seasoning|spices?|rice|beans|tuna|bread|bagels?|m&m|oreo|doritos|pringles|cheez|lay''s|cheetos|goldfish|ramen|honey|peanut butter|syrup|creamer|tea|drink mix|energy drinks?|sparkling water|soda)\b', true),
  ('Gatorade', 'gatorade', '\bgatorade\b', false),
  ('Monster Energy', 'monster energy', '\bmonster\b.*\b(energy|ultra|zero|drink|rehab|java|juice|cans?)\b|\bmonster energy\b', false),
  ('Bloom', 'bloom nutrition', '\bbloom\b', false),
  ('Alani Nu', 'alani nu', '\balani\b', false),
  ('Bagels', 'bagels', '\bbagels?\b', false)
) v(term, query, match, category)
where not exists (select 1 from public.radar_watch);

-- the cron caller: posts to the radar function with the shared webhook secret (Vault)
create or replace function public.radar_kick(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'push_webhook_secret';
  if s is null then return; end if;
  perform net.http_post(
    url     := 'https://cqdignbleethroyxxvzr.supabase.co/functions/v1/radar',
    body    := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', s),
    timeout_milliseconds := 120000);
end
$$;
revoke all on function public.radar_kick(jsonb) from public, anon, authenticated;

-- deals every 30 min; events twice a day; the digests at 8:00 and Friday 16:00 New York (two UTC slots
-- each for EDT/EST, the function acts only inside the right New York hour, once a day)
select cron.schedule('radar-deals', '*/30 * * * *', $c$select public.radar_kick('{"scan":"deals"}'::jsonb)$c$);
select cron.schedule('radar-events', '20 11,23 * * *', $c$select public.radar_kick('{"scan":"events"}'::jsonb)$c$);
select cron.schedule('radar-morning', '2 12,13 * * *', $c$select public.radar_kick('{"digest":"morning"}'::jsonb)$c$);
select cron.schedule('radar-weekend', '2 20,21 * * 5', $c$select public.radar_kick('{"digest":"weekend"}'::jsonb)$c$);