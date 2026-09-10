"""Load the Databento NQ history (tools/lit-engine/data/*.parquet, GLBX.MDP3
ohlcv, NQ.c.0 unadjusted continuous, 2019-01-01 to 2026-07-28) into
public.nq_bars, the chart's archive.

  python scripts/nq-load-databento.py            (SUPABASE_ACCESS_TOKEN env)
  python scripts/nq-load-databento.py --dry      (count only)

What lands:
  60m  aggregated from the 1m file by UTC hour, the whole span
  5m   the 5m file, the whole span
  1m   the 1m file from 2026-05-01 (the chart reads 32 days of minutes; the
       rest of the 1m history stays in the parquet for the engine)
Rows go through the Management API in batches of 5,000 with
ON CONFLICT (interval, t) DO NOTHING, so the rows the nightly Yahoo store
already wrote are kept and the run can be repeated.
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
BATCH = 5000


def query(sql: str):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode() or "null")
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))
            print(f"  retry {attempt + 1}: {e}")


def load(interval: str, df: pd.DataFrame):
    df = df[["open", "high", "low", "close", "volume"]].dropna()
    n = len(df)
    print(f"{interval}: {n} rows, {df.index[0]} to {df.index[-1]}")
    if DRY:
        return
    done = 0
    t0 = time.time()
    for start in range(0, n, BATCH):
        chunk = df.iloc[start:start + BATCH]
        values = ",".join(
            f"('{interval}','{ts.isoformat()}',{o},{h},{l},{c},{int(v)})"
            for ts, o, h, l, c, v in zip(chunk.index, chunk.open, chunk.high, chunk.low, chunk.close, chunk.volume)
        )
        query(f"insert into public.nq_bars (interval, t, o, h, l, c, v) values {values} on conflict (interval, t) do nothing")
        done += len(chunk)
        if (start // BATCH) % 10 == 0:
            print(f"  {interval} {done}/{n} ({time.time() - t0:.0f}s)")
    print(f"{interval}: done in {time.time() - t0:.0f}s")


m1 = pd.read_parquet(DATA / "nq_1m_unadj.parquet", columns=["open", "high", "low", "close", "volume"])
m1 = m1[~m1.index.duplicated(keep="first")].sort_index()
h60 = m1.resample("60min").agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna(subset=["open"])
h60 = h60[h60.volume > 0]
load("60m", h60)

m5 = pd.read_parquet(DATA / "nq_5m_unadj.parquet")
m5 = m5[~m5.index.duplicated(keep="first")].sort_index()
load("5m", m5)

load("1m", m1[m1.index >= pd.Timestamp("2026-05-01", tz="UTC")])

print(query("select interval, min(t)::date as first, max(t)::date as last, count(*) as n from public.nq_bars group by 1 order by 1"))
