-- Make the Kalshi desk readable without a login. Paper data and calibration only; the
-- publishable key is already public by design; nothing else on Echelon opens.
-- Reverse with kalshi-public-off.sql. The page itself also needs PUBLIC = true.
--
-- Views are security_invoker, so anon needs SELECT on the tables beneath them.

do $$
declare t text;
begin
  foreach t in array array[
    'kalshi_rounds', 'kalshi_book_snaps', 'kalshi_tape_minutes', 'kalshi_spot',
    'kalshi_collector_ticks', 'kalshi_daily', 'kalshi_calibration', 'kalshi_calibration_dist',
    'kalshi_edge_cells', 'kalshi_paper_trades', 'kalshi_models'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('create policy %I on public.%I for select to anon using (true)', t || '_public_read', t);
    execute format('grant select on public.%I to anon', t);
  end loop;
end $$;
grant select on public.kalshi_coverage, public.kalshi_live, public.kalshi_paper_daily, public.kalshi_candle_cover to anon;
grant execute on function public.kalshi_asset(text) to anon;
