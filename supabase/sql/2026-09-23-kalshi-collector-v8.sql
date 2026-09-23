-- Kalshi collector v8: coverage as a materialized view, refreshed every five minutes.
-- Applied 2026-09-23 on top of v7. Idempotent.
--
-- The public desk loads as anon, which carries Supabase's 3-second statement timeout.
-- kalshi_coverage aggregated rounds x 424k snaps x tape on every page load and started
-- timing out for logged-out viewers once the month was in. Coverage does not need to be
-- fresher than a few minutes, so it is materialized and refreshed by pg_cron; the desk
-- reads the materialized copy and derives its headline counts from it rather than
-- counting the big tables live. The security_invoker view stays for ad hoc use.

drop materialized view if exists public.kalshi_coverage_mv;
create materialized view public.kalshi_coverage_mv as
select series, day, rounds, settled, snaps, tape_minutes, snaps_live
from public.kalshi_coverage
with data;
create unique index kalshi_coverage_mv_key on public.kalshi_coverage_mv (series, day);

revoke all on public.kalshi_coverage_mv from public;
grant select on public.kalshi_coverage_mv to anon, authenticated, service_role;

-- concurrently, so readers never block on the refresh (needs the unique index above)
select cron.unschedule('kalshi-coverage-refresh')
 where exists (select 1 from cron.job where jobname = 'kalshi-coverage-refresh');
select cron.schedule('kalshi-coverage-refresh', '*/5 * * * *',
  $$refresh materialized view concurrently public.kalshi_coverage_mv$$);
