"""Load the rest of the Databento NQ 1-minute history into public.nq_bars (2026-10-01, for the backtester).

The first load (nq-load-databento.py, 2026-09-10) kept 1m from 2026-05-01 only, because the chart reads 32 days of
minutes. The backtester replays any session minute by minute, so every minute from 2019-01-01 to 2026-04-30 goes in
too (2.56M rows). Same source: tools/lit-engine/data/nq_1m_unadj.parquet, GLBX.MDP3 NQ.c.0 unadjusted.

  python scripts/nq-load-1m-history.py            (SUPABASE_ACCESS_TOKEN env)
  python scripts/nq-load-1m-history.py --dry      (count only)
  python scripts/nq-load-1m-history.py --from 2023-01-01   (resume from a date)

Batches of 8,000 rows through the Management API, ON CONFLICT (symbol, interval, t) DO NOTHING, newest first so the
recent years are usable soonest. Repeatable.
"""
import json
import os
import pathlib
import sys
import time
import urllib.request

import pandas as pd

REF = "cqdignbleethroyxxvzr"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not TOKEN:
    sys.exit("SUPABASE_ACCESS_TOKEN is not set")
DATA = pathlib.Path(__file__).resolve().parents[2] / "lit-engine" / "data"
DRY = "--dry" in sys.argv
FROM = sys.argv[sys.argv.index("--from") + 1] if "--from" in sys.argv else "2019-01-01"
BATCH = 8000


def query(sql: str):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode() or "null")
        except Exception as e:  # noqa: BLE001
            if attempt == 5:
                raise
            time.sleep(5 * (attempt + 1))
            print(f"  retry {attempt + 1}: {e}", flush=True)


m1 = pd.read_parquet(DATA / "nq_1m_unadj.parquet", columns=["open", "high", "low", "close", "volume"])
m1 = m1[~m1.index.duplicated(keep="first")].sort_index().dropna()
m1 = m1[(m1.index >= FROM) & (m1.index < "2026-05-01")]
n = len(m1)
print(f"1m: {n} rows, {m1.index[0]} to {m1.index[-1]}", flush=True)
if DRY:
    sys.exit(0)
t0 = time.time()
done = 0
# newest first: the last two years are the ones members replay most
for end in range(n, 0, -BATCH):
    chunk = m1.iloc[max(0, end - BATCH):end]
    values = ",".join(
        f"('NQ','1m','{ts.isoformat()}',{o},{h},{l},{c},{int(v)})"
        for ts, o, h, l, c, v in zip(chunk.index, chunk.open, chunk.high, chunk.low, chunk.close, chunk.volume)
    )
    query(f"insert into public.nq_bars (symbol, interval, t, o, h, l, c, v) values {values} on conflict (symbol, interval, t) do nothing")
    done += len(chunk)
    if (done // BATCH) % 10 == 0:
        print(f"  {done}/{n} ({time.time() - t0:.0f}s) down to {chunk.index[0]}", flush=True)
print(f"1m: done in {time.time() - t0:.0f}s", flush=True)
