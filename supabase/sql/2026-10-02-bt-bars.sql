-- Backtest bars straight from PostgREST (D1, 10/02: "it's laggy"). A session took 6 s to open: four archive reads
-- through the tape edge function, each paying the function hop (400 to 800 ms) on top of the query, all racing the
-- live chart's own loads. bt_bars is the same read (nq_bars_json), members only, one round trip from the browser.
create or replace function public.bt_bars(p_sym text, p_interval text, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_member() then
    raise exception 'members only' using errcode = '42501';
  end if;
  if p_interval not in ('1m', '5m', '60m', '1d') then
    raise exception 'interval must be 1m, 5m, 60m or 1d' using errcode = '22023';
  end if;
  if p_to <= p_from or p_to - p_from > interval '3700 days' then
    raise exception 'window out of range' using errcode = '22023';
  end if;
  return public.nq_bars_json(p_interval, p_from, p_to, 60000, case when p_sym = 'ES' then 'ES' else 'NQ' end);
end
$$;

revoke all on function public.bt_bars(text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.bt_bars(text, text, timestamptz, timestamptz) to authenticated;
