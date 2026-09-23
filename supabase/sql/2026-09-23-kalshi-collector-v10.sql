-- Kalshi collector v10: the executor's heartbeat, one row, upserted every pass.
-- Applied 2026-09-23 on top of v9. Idempotent.
--
-- The desk could only show the switch state as of the newest processed intent, which
-- lags reality by however long the queue is quiet. This row is what the executor read
-- and decided on its last pass, every pass, so "switch on" on the page means the
-- executor saw it on, not that a file exists somewhere.

create table if not exists public.kalshi_executor_state (
  id              int         primary key default 1 check (id = 1),
  at              timestamptz not null,
  switch_signals  boolean     not null,
  switch_live     boolean     not null,
  gate_passed     boolean     not null,
  gate_trades     int         not null,
  halted          boolean     not null,
  realized_today  numeric     not null default 0,
  open            int         not null default 0,
  key_present     boolean     not null,
  cell_intents    int         not null default 0,
  queued          int         not null default 0,
  placed          int         not null default 0,
  settled         int         not null default 0
);
alter table public.kalshi_executor_state enable row level security;
drop policy if exists kalshi_executor_state_admin_read  on public.kalshi_executor_state;
drop policy if exists kalshi_executor_state_public_read on public.kalshi_executor_state;
create policy kalshi_executor_state_admin_read  on public.kalshi_executor_state for select to authenticated using ((select is_admin()));
create policy kalshi_executor_state_public_read on public.kalshi_executor_state for select to anon using (true);
revoke all on public.kalshi_executor_state from public;
grant select on public.kalshi_executor_state to authenticated, anon;
grant all on public.kalshi_executor_state to service_role;
