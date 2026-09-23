-- Put the Kalshi desk back behind the admin login. Exact reverse of kalshi-public-on.sql.
-- The page also needs PUBLIC = false.

do $$
declare t text;
begin
  foreach t in array array[
    'kalshi_rounds', 'kalshi_book_snaps', 'kalshi_tape_minutes', 'kalshi_spot',
    'kalshi_collector_ticks', 'kalshi_daily', 'kalshi_calibration', 'kalshi_calibration_dist',
    'kalshi_edge_cells', 'kalshi_paper_trades', 'kalshi_models'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('revoke select on public.%I from anon', t);
  end loop;
end $$;
revoke select on public.kalshi_coverage, public.kalshi_live, public.kalshi_paper_daily, public.kalshi_candle_cover from anon;
revoke execute on function public.kalshi_asset(text) from anon;
