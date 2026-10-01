-- 2026-10-01 (D1: "implement all of that"): the engagement loop from the 09-30 research.
--   1. A daily "Bias today?" poll in General at 9:15 New York on trading days, posted as d1, with its own push.
--   2. Live sessions: the admin schedules them, Today counts down, members get a reminder 15 minutes out and at the start.
--   3. Study plan reminders: Wednesday evening, to members behind the weekly pace they picked.
--   4. Member email (weekly digest, a nudge when study stalls): a send log and the schedule. The sender (Gmail SMTP)
--      is the member-mail edge function; it does nothing until its SMTP secrets exist.
-- Every push and email honors notify_prefs (alerts.bias / live / study / email_digest / email_nudge, absent = on).

-- ── 1. the daily bias poll ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bias_poll_post(p_force boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ny timestamp := now() at time zone 'America/New_York';
  d date := (now() at time zone 'America/New_York')::date;
  -- full US market closures (the app's US_MARKET_DAYS); half days still get a poll
  closed constant date[] := array['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26',
                                  '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']::date[];
  ch uuid; author uuid; mid uuid; s text;
begin
  if not p_force then
    if extract(isodow from d) > 5 or d = any (closed) then return null; end if;
    -- both UTC crons fire; only the one that lands at 9:15 New York posts
    if ny::time < time '09:05' or ny::time > time '09:40' then return null; end if;
  end if;
  select id into ch from channels where kind = 'channel' and is_active and lower(name) = 'general' limit 1;
  select id into author from auth.users where email = 'd1fpc3@gmail.com';
  if ch is null or author is null then return null; end if;
  -- once a day, whatever re-fires
  select id into mid from messages
   where channel_id = ch and poll ->> 'kind' = 'bias' and poll ->> 'day' = d::text and deleted_at is null
   limit 1;
  if mid is not null then return mid; end if;
  insert into messages (channel_id, user_id, body, poll)
  values (ch, author, null, jsonb_build_object('q', 'Bias today?', 'opts', jsonb_build_array('Long', 'Short', 'Flat'),
                                               'kind', 'bias', 'day', d::text))
  returning id into mid;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'push_webhook_secret';
  if s is not null then
    perform net.http_post(
      url     := 'https://cqdignbleethroyxxvzr.supabase.co/functions/v1/send-push',
      body    := jsonb_build_object('bias_poll', mid),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', s));
  end if;
  return mid;
end
$$;
revoke all on function public.bias_poll_post(boolean) from public, anon, authenticated;

-- ── 2. live sessions ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.live_sessions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(title) between 2 and 80),
  starts_at     timestamptz not null,
  duration_min  int not null default 60 check (duration_min between 10 and 360),
  url           text check (url is null or url ~ '^https://'),
  notes         text check (notes is null or length(notes) <= 400),
  repeat_weekly boolean not null default false,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  canceled_at   timestamptz
);
alter table public.live_sessions enable row level security;
drop policy if exists live_sessions_read on public.live_sessions;
create policy live_sessions_read on public.live_sessions for select to authenticated using ((select public.is_member()));
drop policy if exists live_sessions_admin on public.live_sessions;
create policy live_sessions_admin on public.live_sessions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.live_sessions to authenticated;

-- the next time a session happens (a weekly one rolls forward a week once it has ended)
create or replace function public.live_next_at(p_starts timestamptz, p_minutes int, p_weekly boolean, p_now timestamptz default now())
returns timestamptz
language sql
immutable
as $$
  select case
    when not p_weekly or p_starts + make_interval(mins => p_minutes) > p_now then p_starts
    else p_starts + make_interval(days => 7 * ceil(extract(epoch from (p_now - p_starts - make_interval(mins => p_minutes))) / (7 * 86400))::int)
  end
$$;

create table if not exists public.live_reminders (
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  occurs_at  timestamptz not null,
  kind       text not null check (kind in ('soon', 'now')),
  sent_at    timestamptz not null default now(),
  primary key (session_id, occurs_at, kind)
);
alter table public.live_reminders enable row level security;   -- service role only

create or replace function public.live_kick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s text;
begin
  -- nothing to do unless a session starts within the next 20 minutes or started in the last 5
  if not exists (
    select 1 from live_sessions l
     where l.canceled_at is null
       and public.live_next_at(l.starts_at, l.duration_min, l.repeat_weekly) between now() - interval '5 minutes' and now() + interval '20 minutes'
  ) then return; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'push_webhook_secret';
  if s is null then return; end if;
  perform net.http_post(
    url     := 'https://cqdignbleethroyxxvzr.supabase.co/functions/v1/send-push',
    body    := jsonb_build_object('live_check', true),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', s));
end
$$;
revoke all on function public.live_kick() from public, anon, authenticated;

-- ── 3 + 4. study reminders and member email ────────────────────────────────────────────────────────────
create table if not exists public.mail_log (
  id      bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  email   text not null,
  kind    text not null check (kind in ('digest', 'nudge', 'test')),
  sent_at timestamptz not null default now(),
  ok      boolean not null,
  error   text
);
create index if not exists mail_log_user_kind on public.mail_log (user_id, kind, sent_at desc);
alter table public.mail_log enable row level security;   -- service role only

create or replace function public.engage_kick(p_fn text, p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s text;
begin
  if p_fn not in ('send-push', 'member-mail') then return; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'push_webhook_secret';
  if s is null then return; end if;
  perform net.http_post(
    url     := 'https://cqdignbleethroyxxvzr.supabase.co/functions/v1/' || p_fn,
    body    := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', s));
end
$$;
revoke all on function public.engage_kick(text, jsonb) from public, anon, authenticated;

-- ── schedules (UTC; each target checks its own New York time where it matters) ──
select cron.unschedule(jobname) from cron.job
 where jobname in ('bias-poll-edt', 'bias-poll-est', 'live-check', 'study-check', 'member-mail-digest', 'member-mail-nudge');
select cron.schedule('bias-poll-edt', '15 13 * * 1-5', $c$select public.bias_poll_post()$c$);
select cron.schedule('bias-poll-est', '15 14 * * 1-5', $c$select public.bias_poll_post()$c$);
select cron.schedule('live-check', '*/5 * * * *', $c$select public.live_kick()$c$);
-- Wednesday 23:00 UTC = 7 PM New York in summer, 6 PM in winter
select cron.schedule('study-check', '0 23 * * 3', $c$select public.engage_kick('send-push', '{"study_check": true}'::jsonb)$c$);
-- Sunday 22:00 UTC = 6 PM New York in summer: the week ahead lands before Sunday's open
select cron.schedule('member-mail-digest', '0 22 * * 0', $c$select public.engage_kick('member-mail', '{"digest": true}'::jsonb)$c$);
-- weekdays 15:00 UTC = 11 AM New York: a stalled member hears about their next lesson
select cron.schedule('member-mail-nudge', '0 15 * * 1-5', $c$select public.engage_kick('member-mail', '{"nudge": true}'::jsonb)$c$);
