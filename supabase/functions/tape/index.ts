// tape: 1-minute NQ bars for the members app's Desk.
//
// Yahoo Finance's chart endpoint has no CORS headers, so the browser cannot
// read it directly. This function fetches it server-side, normalises the
// bars, and caches the answer per isolate so a room full of open Desks
// costs Yahoo one request every 15 seconds, not one per member.
//
// GET ?range=1d|5d   (JWT required: the gateway verifies it before we run)
// -> { symbol, last, prevClose, gmtoffset, fetchedAt, bars: [[t, o, h, l, c, v], ...] }

const SYMBOL = "NQ=F";
const TTL: Record<string, number> = { "1d": 15_000, "5d": 300_000 };
const cache = new Map<string, { at: number; body: string }>();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

async function fetchTape(range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOL)}?interval=1m&range=${range}&includePrePost=true`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Echelon Desk)", Accept: "application/json" } });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(j?.chart?.error?.description ?? "empty chart");
  const ts: number[] = res.timestamp ?? [];
  const q = res.indicators?.quote?.[0] ?? {};
  const bars: number[][] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    bars.push([ts[i], o, h, l, c, q.volume?.[i] ?? 0]);
  }
  const m = res.meta ?? {};
  return {
    symbol: m.symbol ?? SYMBOL,
    last: m.regularMarketPrice ?? (bars.length ? bars[bars.length - 1][4] : null),
    prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
    gmtoffset: m.gmtoffset ?? -14400,
    fetchedAt: new Date().toISOString(),
    bars,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json(405, { error: "GET only" });
  const range = new URL(req.url).searchParams.get("range") === "5d" ? "5d" : "1d";
  const hit = cache.get(range);
  const now = Date.now();
  if (hit && now - hit.at < TTL[range]) return json(200, hit.body, { "Cache-Control": "public, max-age=15", "X-Tape-Cache": "hit" });
  try {
    const body = JSON.stringify(await fetchTape(range));
    cache.set(range, { at: now, body });
    return json(200, body, { "Cache-Control": "public, max-age=15", "X-Tape-Cache": "miss" });
  } catch (err) {
    // a stale tape beats no tape
    if (hit) return json(200, hit.body, { "Cache-Control": "no-store", "X-Tape-Cache": "stale" });
    return json(502, { error: String((err as Error)?.message ?? err) });
  }
});
