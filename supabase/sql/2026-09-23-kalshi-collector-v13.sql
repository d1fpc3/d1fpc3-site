-- Kalshi collector v13: the exit leg gets its own switch, default OFF.
--
-- Paper result 2026-09-23 (674 graded signal calls): held to close -$442.68,
-- sold at the first cent of green -$1,337.74. The rule keeps every loser and
-- cuts every winner to a cent, so the executor only runs it when D1 flips this.
-- Applied 2026-09-23 via supabase db query.

alter table public.kalshi_switch
  add column if not exists exit_green boolean not null default false;

comment on column public.kalshi_switch.exit_green is
  'true lets live.mjs sell a held position at the first cent of green. Off by default: three times worse than holding on paper (2026-09-23).';

-- the heartbeat row mirrors it so the desk shows the switch as the executor read it
alter table public.kalshi_executor_state
  add column if not exists switch_exit_green boolean not null default false;
