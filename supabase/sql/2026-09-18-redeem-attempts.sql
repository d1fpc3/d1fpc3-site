-- Guessing access codes had no cost. Every redeem attempt is logged (hashed address, never
-- the code) so the function can refuse an address after a handful of misses and refuse
-- everyone for a while if misses pile up site-wide. Service role only.
create table if not exists public.redeem_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists redeem_attempts_ip_at on public.redeem_attempts (ip_hash, at desc);
create index if not exists redeem_attempts_at on public.redeem_attempts (at desc);
alter table public.redeem_attempts enable row level security;
revoke all on public.redeem_attempts from anon, authenticated;
