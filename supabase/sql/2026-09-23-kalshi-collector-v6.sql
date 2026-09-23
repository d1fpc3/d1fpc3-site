-- Kalshi collector v6: the learner's rows in one response.
-- Applied 2026-09-23 on top of v5. Idempotent.
--
-- PostgREST caps a page at 1,000 rows, so the learner paged 380,681 rows in 1,645 seconds
-- for one nightly fit. A function returning jsonb is one row, so the cap does not apply:
-- the whole window comes back in one call (about 40 MB) built in seconds. service_role's
-- statement ceiling is 900s (v3b). Only the service role may call it.

create or replace function public.kalshi_learn_rows_json(p_from date, p_to date)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'series', series, 'ticker', ticker, 'day', day, 'mtc', mtc, 'mid', mid,
    'bps', bps, 'range_bps', range_bps, 'mom_bps', mom_bps, 'hour_utc', hour_utc, 'y', y
  ) order by ticker, minute_utc), '[]'::jsonb)
  from public.kalshi_learn_rows
  where day between p_from and p_to
$$;
revoke all on function public.kalshi_learn_rows_json(date, date) from public, anon, authenticated;
grant execute on function public.kalshi_learn_rows_json(date, date) to service_role;
