// tape: E-mini Nasdaq-100 (NQ=F) bars for the members app and the archive.
//
// Yahoo Finance's chart endpoint has no CORS headers, so the browser cannot
// read it directly. This function fetches it server-side, normalises the
// bars, and caches the answer per isolate so a room full of open tabs costs
// Yahoo one request every 15 seconds, not one per member.
//
// Yahoo keeps 1-minute bars for 30 days, 5-minute for 60, hourly for two
// years. The nq_bars table keeps whatever this function stores, for good.
//
// GET ?range=1d|5d                       live tape (JWT: members)
// GET ?tail=N                            the last N minutes only, for the live poll (JWT: members)
// GET ?interval=1m|5m|60m|1d&from=&to=   the archive, ISO dates (JWT: members)
// GET ?day=YYYY-MM-DD                    one session from the archive, 18:00 ET the
//                                        evening before to 17:00 ET (JWT: members)
// GET ?days=1                            the session days the archive holds (JWT: members)
// POST ?store=1  { interval?, range? }   pull from Yahoo and upsert into nq_bars
//                                        (x-webhook-secret: the cron's key)

import { createClient } from "npm:@supabase/supabase-js@2";

const SYMBOL = "NQ=F";
const TTL: Record<string, number> = { "1d": 2_000, "5d": 300_000 };
const cache = new Map<string, { at: number; body: string }>();
const INTERVALS = new Set(["1m", "5m", "60m", "1d"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

type Bar = [number, number, number, number, number, number];

async function yahoo(params: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOL)}?${params}&includePrePost=true`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Echelon tape)", Accept: "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.chart?.error?.description ?? `yahoo ${r.status}`);
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(j?.chart?.error?.description ?? "empty chart");
  const ts: number[] = res.timestamp ?? [];
  const q = res.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    bars.push([ts[i], o, h, l, c, q.volume?.[i] ?? 0]);
  }
  if (bars.length && params.includes("interval=1m")) {
    const last = bars[bars.length - 1], aligned = Math.floor(last[0] / 60) * 60;
    if (aligned !== last[0]) {
      const prev = bars.length > 1 ? bars[bars.length - 2] : null;
      if (prev && prev[0] === aligned) { prev[2] = Math.max(prev[2], last[2]); prev[3] = Math.min(prev[3], last[3]); prev[4] = last[4]; prev[5] += last[5]; bars.pop(); }
      else last[0] = aligned;
    }
  }
  return { meta: res.meta ?? {}, bars };
}

async function fetchTape(range: string) {
  const { meta: m, bars } = await yahoo(`interval=1m&range=${range}`);
  return {
    symbol: m.symbol ?? SYMBOL,
    last: m.regularMarketPrice ?? (bars.length ? bars[bars.length - 1][4] : null),
    prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
    gmtoffset: m.gmtoffset ?? -14400,
    fetchedAt: new Date().toISOString(),
    bars,
  };
}

// one window of bars in one round trip: nq_bars_json builds the array in SQL,
// so PostgREST's 1000-row page never applies
async function readBars(interval: string, from: Date, to: Date, cap = 60000) {
  const sb = admin();
  const { data, error } = await sb.rpc("nq_bars_json", { p_interval: interval, p_from: from.toISOString(), p_to: to.toISOString(), p_cap: cap });
  if (error) throw new Error(error.message);
  return (data ?? []) as number[][];
}

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

// upsert in slices; the (interval, t) key makes overlapping pulls harmless
async function store(interval: string, bars: Bar[]) {
  const sb = admin();
  let n = 0;
  for (let i = 0; i < bars.length; i += 1000) {
    const rows = bars.slice(i, i + 1000).map((b) => ({ interval, t: new Date(b[0] * 1000).toISOString(), o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
    const { error } = await sb.from("nq_bars").upsert(rows, { onConflict: "interval,t" });
    if (error) throw new Error(error.message);
    n += rows.length;
  }
  return n;
}

// ET session window for a calendar day: 18:00 the evening before to 17:00
function sessionWindow(day: string) {
  const offset = (d: Date) => { // minutes east of UTC for New York on that date
    const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT-4";
    const m = /GMT([+-]\d+)/.exec(s);
    return (m ? +m[1] : -4) * 60;
  };
  const noon = new Date(`${day}T12:00:00Z`);
  const off = offset(noon);
  const start = new Date(noon.getTime() - 24 * 3600e3); start.setUTCHours(18, 0, 0, 0); start.setTime(start.getTime() - off * 60e3);
  const end = new Date(noon); end.setUTCHours(17, 0, 0, 0); end.setTime(end.getTime() - off * 60e3);
  return { start, end };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const p = url.searchParams;

  /* ── store: the cron (or a backfill) pulls from Yahoo into nq_bars ── */
  if (p.get("store") === "1") {
    if (req.method !== "POST") return json(405, { error: "POST" });
    const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
    if (!secret || req.headers.get("x-webhook-secret") !== secret) return json(401, { error: "bad secret" });
    const body = await req.json().catch(() => ({}));
    const interval = INTERVALS.has(body.interval) ? body.interval : "1m";
    let params = `interval=${interval}&range=${body.range ?? (interval === "1m" ? "2d" : interval === "5m" ? "60d" : interval === "60m" ? "2y" : "max")}`;
    if (body.period1 && body.period2) params = `interval=${interval}&period1=${+body.period1}&period2=${+body.period2}`;
    try {
      const { bars } = await yahoo(params);
      const n = await store(interval, bars);
      return json(200, { ok: true, interval, pulled: bars.length, stored: n, first: bars[0]?.[0], last: bars.at(-1)?.[0] });
    } catch (err) {
      return json(502, { error: String((err as Error)?.message ?? err) });
    }
  }

  if (req.method !== "GET") return json(405, { error: "GET only" });

  /* ── the archive ── */
  if (p.get("days") === "1") {
    const sb = admin();
    const { data, error } = await sb.rpc("nq_session_days");
    if (error) return json(500, { error: error.message });
    return json(200, { days: data ?? [] }, { "Cache-Control": "public, max-age=300" });
  }
  if (p.get("day")) {
    const day = p.get("day")!;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { error: "day=YYYY-MM-DD" });
    const { start, end } = sessionWindow(day);
    let bars: number[][];
    try { bars = await readBars("1m", start, end, 3000); } catch (err) { return json(500, { error: String((err as Error).message) }); }
    return json(200, { symbol: SYMBOL, day, bars, last: bars.at(-1)?.[4] ?? null, prevClose: null, gmtoffset: -14400, fetchedAt: new Date().toISOString() }, { "Cache-Control": "public, max-age=3600" });
  }
  if (p.get("interval")) {
    const interval = p.get("interval")!;
    if (!INTERVALS.has(interval)) return json(400, { error: "interval=1m|5m|60m|1d" });
    const from = p.get("from") ? new Date(p.get("from")!) : new Date(Date.now() - 7 * 864e5);
    const to = p.get("to") ? new Date(p.get("to")!) : new Date();
    if (isNaN(+from) || isNaN(+to)) return json(400, { error: "from/to must be dates" });
    let bars: number[][];
    try { bars = await readBars(interval, from, new Date(+to + 1), 60000); } catch (err) { return json(500, { error: String((err as Error).message) }); }
    return json(200, { symbol: SYMBOL, interval, from: from.toISOString(), to: to.toISOString(), bars, capped: bars.length >= 60000 }, { "Cache-Control": "public, max-age=300" });
  }

  /* ── the live tape ── */
  const range = p.get("range") === "5d" ? "5d" : "1d";
  const tailN = Math.min(60, Math.max(1, +(p.get("tail") ?? 0) || 0));
  const slim = (body: string) => { if (!tailN) return body; const j = JSON.parse(body); j.bars = j.bars.slice(-tailN); return JSON.stringify(j); };
  const hit = cache.get(range);
  const now = Date.now();
  if (hit && now - hit.at < TTL[range]) return json(200, slim(hit.body), { "Cache-Control": "no-store", "X-Tape-Cache": "hit" });
  try {
    const body = JSON.stringify(await fetchTape(range));
    cache.set(range, { at: now, body });
    return json(200, slim(body), { "Cache-Control": "no-store", "X-Tape-Cache": "miss" });
  } catch (err) {
    if (hit) return json(200, slim(hit.body), { "Cache-Control": "no-store", "X-Tape-Cache": "stale" });
    return json(502, { error: String((err as Error)?.message ?? err) });
  }
});
