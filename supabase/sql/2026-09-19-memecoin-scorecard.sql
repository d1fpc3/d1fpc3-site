-- Memecoin scorecard: score the daily catalyst digest against what the coins
-- it named actually did. Applied 2026-09-19.
-- Design: docs/superpowers/specs/2026-09-19-memecoin-scorecard-design.md
-- Filled by scripts/memecoin-track.mjs, read by the Scorecard tab in
-- echelon/admin/index.html.
--
-- Same posture as memecoin_posts: RLS on, one is_admin() read policy for
-- authenticated, anon revoked, all writes by the service role.

-- ── ticker -> coingecko id, pinned once so a match cannot drift ──────────
create table if not exists public.memecoin_ticker_map (
  ticker      text primary key,
  coin_id     text,
  confidence  text not null default 'high'
              check (confidence in ('high', 'low', 'unresolved')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── price series, one row per coin per point fetched ────────────────────
create table if not exists public.memecoin_prices (
  coin_id text not null,
  ts      timestamptz not null,
  usd     double precision not null,
  primary key (coin_id, ts)
);
create index if not exists memecoin_prices_coin_ts
  on public.memecoin_prices (coin_id, ts desc);

-- ── one row per (ticker, section, catalyst), deduped across restatements ─
create table if not exists public.memecoin_calls (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.memecoin_posts(id) on delete cascade,
  post_at           timestamptz not null,
  section           text not null,
  ticker            text,
  coin_id           text,
  ticker_confidence text not null default 'high',
  ticker_rule       text,
  catalyst          text not null,
  fingerprint       text not null,
  event_date        date,
  source            text,
  entry_at          timestamptz not null,
  entry_usd         double precision,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  seen_count        integer not null default 1,
  -- BLUE CHIPS restates the same catalyst most days; a restatement bumps
  -- last_seen_at on the existing row instead of minting a new call. NULLS
  -- NOT DISTINCT so broad-market lines (ticker is null) dedup too.
  constraint memecoin_calls_uniq unique nulls not distinct (ticker, section, fingerprint)
);
create index if not exists memecoin_calls_post  on public.memecoin_calls (post_id);
create index if not exists memecoin_calls_entry on public.memecoin_calls (entry_at desc);

alter table public.memecoin_ticker_map enable row level security;
alter table public.memecoin_prices     enable row level security;
alter table public.memecoin_calls      enable row level security;

drop policy if exists memecoin_ticker_map_admin_read on public.memecoin_ticker_map;
drop policy if exists memecoin_prices_admin_read     on public.memecoin_prices;
drop policy if exists memecoin_calls_admin_read      on public.memecoin_calls;

create policy memecoin_ticker_map_admin_read on public.memecoin_ticker_map
  for select to authenticated using (is_admin());
create policy memecoin_prices_admin_read on public.memecoin_prices
  for select to authenticated using (is_admin());
create policy memecoin_calls_admin_read on public.memecoin_calls
  for select to authenticated using (is_admin());

revoke all on public.memecoin_ticker_map from anon;
revoke all on public.memecoin_prices     from anon;
revoke all on public.memecoin_calls      from anon;
grant select on public.memecoin_ticker_map, public.memecoin_prices, public.memecoin_calls to authenticated;
grant all    on public.memecoin_ticker_map, public.memecoin_prices, public.memecoin_calls to service_role;

-- ── marks and returns ───────────────────────────────────────────────────
-- Nearest stored price to a target instant. Returns null when the horizon has
-- not elapsed, or when no price sits within 36h of the target, so a thin
-- series reads as "no mark" instead of quietly borrowing a stale price.
create or replace function public.memecoin_mark(p_coin text, p_target timestamptz)
returns double precision
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.usd
  from public.memecoin_prices p
  where p_coin is not null
    and p_target <= now()
    and p.coin_id = p_coin
    and p.ts between p_target - interval '36 hours' and p_target + interval '36 hours'
  order by abs(extract(epoch from (p.ts - p_target)))
  limit 1
$$;

-- One definition of "what did this call return", shared by the admin tab and
-- the daily email so the two can never disagree.
create or replace view public.memecoin_scorecard
with (security_invoker = on) as
with m as (
  select
    c.id, c.post_id, c.post_at, c.section, c.ticker, c.coin_id,
    c.ticker_confidence, c.ticker_rule, c.catalyst, c.event_date, c.source,
    c.entry_at, c.entry_usd, c.first_seen_at, c.last_seen_at, c.seen_count,
    public.memecoin_mark(c.coin_id, c.entry_at + interval '1 day')   as usd_1d,
    public.memecoin_mark(c.coin_id, c.entry_at + interval '3 days')  as usd_3d,
    public.memecoin_mark(c.coin_id, c.entry_at + interval '7 days')  as usd_7d,
    public.memecoin_mark(c.coin_id, c.entry_at + interval '30 days') as usd_30d,
    -- the digest's own rule: announcement is the entry, event is the exit
    public.memecoin_mark(c.coin_id, (c.event_date + time '23:59')::timestamptz) as usd_event
  from public.memecoin_calls c
)
select
  m.*,
  case when m.entry_usd > 0 and m.usd_1d    is not null then (m.usd_1d    / m.entry_usd - 1) * 100 end as ret_1d,
  case when m.entry_usd > 0 and m.usd_3d    is not null then (m.usd_3d    / m.entry_usd - 1) * 100 end as ret_3d,
  case when m.entry_usd > 0 and m.usd_7d    is not null then (m.usd_7d    / m.entry_usd - 1) * 100 end as ret_7d,
  case when m.entry_usd > 0 and m.usd_30d   is not null then (m.usd_30d   / m.entry_usd - 1) * 100 end as ret_30d,
  case when m.entry_usd > 0 and m.usd_event is not null then (m.usd_event / m.entry_usd - 1) * 100 end as ret_event
from m;

revoke all on public.memecoin_scorecard from anon;
grant select on public.memecoin_scorecard to authenticated, service_role;
revoke all on function public.memecoin_mark(text, timestamptz) from anon, public;
grant execute on function public.memecoin_mark(text, timestamptz) to authenticated, service_role;

-- ── helpers the tracker calls ───────────────────────────────────────────
-- What price history do we already hold? The tracker fetches only the gap,
-- which is what keeps it inside CoinGecko's free rate limit.
create or replace function public.memecoin_price_coverage()
returns table (coin_id text, min_ts timestamptz, max_ts timestamptz, n bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.coin_id, min(p.ts), max(p.ts), count(*)
  from public.memecoin_prices p
  group by p.coin_id
$$;

-- Fill entry prices for calls that have a coin but no entry mark yet, so a
-- call that could not be priced today gets priced on a later run instead of
-- being stuck at null forever.
create or replace function public.memecoin_set_entry_prices()
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare n integer;
begin
  update public.memecoin_calls c
     set entry_usd = public.memecoin_mark(c.coin_id, c.entry_at)
   where c.coin_id is not null
     and c.entry_usd is null
     and public.memecoin_mark(c.coin_id, c.entry_at) is not null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.memecoin_price_coverage() from anon, public;
grant execute on function public.memecoin_price_coverage() to authenticated, service_role;
revoke all on function public.memecoin_set_entry_prices() from anon, public;
grant execute on function public.memecoin_set_entry_prices() to service_role;
