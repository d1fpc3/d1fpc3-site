-- The weather maker desk: its own tables, its own page, nothing shared with the Kalshi desk.
--
-- The weather bot (apps/kalshi-bot src/weather) is PAPER. It rests model-priced quotes on the 24
-- US daily-high and 24 low temperature ladders, reads the real tape to see which the exchange
-- would have filled, and grades at settlement. It signs nothing and places no orders. These
-- tables exist so that record can be looked at on a page instead of in a SQLite file on one PC.
--
-- Naming is deliberately weather_* so nothing here can collide with the peer session's kalshi_*
-- tables or be picked up by the Kalshi desk's queries.

-- The current book, one row per (policy, fill model). Replaced on every sync.
create table if not exists weather_policy_book (
  policy       text        not null,
  fill_model   text        not null check (fill_model in ('strict','foq')),
  fills        integer     not null default 0,
  graded       integer     not null default 0,
  wins         integer     not null default 0,
  pnl          numeric     not null default 0,
  open_fills   integer     not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (policy, fill_model)
);

-- The same, by measurement day, so the forward record has a shape over time.
create table if not exists weather_paper_daily (
  day          date        not null,
  policy       text        not null,
  fill_model   text        not null check (fill_model in ('strict','foq')),
  fills        integer     not null default 0,
  graded       integer     not null default 0,
  wins         integer     not null default 0,
  pnl          numeric     not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (day, policy, fill_model)
);

-- What is resting right now. Truncated and rewritten each sync, so it is a snapshot not a log.
-- queue_pos is the one number that decides whether any of this is harvestable: 'inside' means we
-- beat the touch and are first in line, 'behind' means someone else is filled before us.
create table if not exists weather_quote_snapshot (
  ticker       text        not null,
  policy       text        not null,
  city         text        not null,
  series       text        not null,
  bucket       text        not null,
  side         text        not null check (side in ('bid','ask')),
  price        numeric     not null,
  contracts    integer     not null,
  at_risk      numeric     not null,
  book_bid     numeric,
  book_ask     numeric,
  queue_pos    text        not null check (queue_pos in ('inside','at-touch','behind')),
  placed_at    timestamptz not null,
  primary key (policy, ticker, side)
);

-- Every graded paper fill, so the page can show them arriving rather than only a total.
create table if not exists weather_fill (
  id           bigint      primary key,
  policy       text        not null,
  fill_model   text        not null,
  ticker       text        not null,
  city         text        not null,
  bucket       text        not null,
  side         text        not null,
  price        numeric     not null,
  contracts    integer     not null,
  filled_at    timestamptz not null,
  settled_yes  boolean,
  pnl          numeric,
  graded_at    timestamptz
);
create index if not exists weather_fill_recent on weather_fill (filled_at desc);

-- The map the whole strategy is built on: what EVERY maker in these markets earned, by the price
-- the contract traded at, computed from the exchange's own record of 115,503,669 contracts with
-- no model and no fill assumption (apps/kalshi-bot scripts/weather-maker-pool.ts). Static
-- reference data, rewritten only when that measurement is re-run.
create table if not exists weather_pool_band (
  band         text        primary key,
  sort_order   integer     not null,
  contracts    bigint      not null,
  maker_pnl    numeric     not null,
  cents_each   numeric     not null,
  measured_at  timestamptz not null default now()
);

-- One row of free-text state, so the page can say what the bot is doing without guessing.
create table if not exists weather_status (
  id           integer     primary key default 1,
  policies     text        not null default '',
  cities       integer     not null default 0,
  resting      integer     not null default 0,
  last_tick_at timestamptz,
  tick_seconds integer,
  note         text,
  updated_at   timestamptz not null default now()
);

alter table weather_policy_book   enable row level security;
alter table weather_paper_daily   enable row level security;
alter table weather_quote_snapshot enable row level security;
alter table weather_fill          enable row level security;
alter table weather_pool_band     enable row level security;
alter table weather_status        enable row level security;

-- Read-only to anyone. There is nothing private here: it is a paper record of public markets,
-- and the page is meant to be openable without a login like the Kalshi desk. Writes are the
-- service key only, which is what the bot on D1's PC holds; no policy grants insert or update,
-- so the service role's bypass is the only write path.
do $$
declare t text;
begin
  foreach t in array array['weather_policy_book','weather_paper_daily','weather_quote_snapshot','weather_fill','weather_pool_band','weather_status']
  loop
    execute format('drop policy if exists %I on %I', t || '_anon_read', t);
    execute format('create policy %I on %I for select to anon, authenticated using (true)', t || '_anon_read', t);
  end loop;
end $$;

grant select on weather_policy_book, weather_paper_daily, weather_quote_snapshot, weather_fill, weather_pool_band, weather_status to anon, authenticated;
