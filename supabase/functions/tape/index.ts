// tape: index futures bars (NQ, MNQ, ES, MES) for the members app and the archive.
// Every route takes ?symbol= (or "symbol" in the store body); absent means NQ.
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

const SYMBOLS: Record<string, string> = { NQ: "NQ=F", MNQ: "MNQ=F", ES: "ES=F", MES: "MES=F", VIX: "^VIX" };   // VIX is read live only (the sigma bands), never stored
const sym = (v: unknown) => (typeof v === "string" && SYMBOLS[v.toUpperCase()] ? v.toUpperCase() : "NQ");
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

async function yahoo(symbol: string, params: string, keepForming = false) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOLS[symbol])}?${params}&includePrePost=true`;
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
  // coarser intervals: Yahoo stamps the bar still forming with the clock time; it is not a real bar yet, so it never reaches the archive
  if (bars.length && !keepForming && !params.includes("interval=1m")) { const step = params.includes("interval=60m") ? 3600 : 300; if (bars[bars.length - 1][0] % step) bars.pop(); }
  if (!params.includes("interval=1d")) {
    // After the 17:00 close Yahoo appends one more "bar" at 17:00 carrying the settlement price with a
    // volume of 1 (2026-09-25: a wick from the 30,921.75 last trade down to the 30,889.25 settle). It is
    // not a trade, and as the week's last bar it moved Friday's close, which the NWOG is drawn from.
    for (let i = bars.length - 1; i >= 0; i--) if (bars[i][5] <= 1 && etMin(bars[i][0]) === 17 * 60) bars.splice(i, 1);
    await repairSessionOpens(symbol, bars, params.includes("interval=60m") ? 3600 : params.includes("interval=5m") ? 300 : 60, params);
  }
  return { meta: res.meta ?? {}, bars };
}

/* Yahoo's intraday bars never carry the first ten minutes of the week: Sunday 18:00 to 18:09 ET is missing
   from 1m, 2m and 5m for good, and the 60m 18:00 bar is built from 18:10 onward. The daily bar still has the
   true session open (and a high or low made in those minutes). Without this the weekly open was the 18:10
   price, 30,844.50 instead of 30,870 on 2026-09-27, the NWOG was drawn down to it, and the 30,920.75 high
   of the first minutes was nowhere on the chart (D1: "NWOG isn't correct and the weekly open isn't correct").
   A session start is the first bar after a weekend or holiday gap (or the first bar of the answer, on a
   Sunday) that lands between 18:01 and 18:59 ET. It gets the missing 18:00 bar back from the daily bar:
   open = the session open, close = the first real bar's open, high and low stretched to the daily extremes
   only when no later bar of that session reached them. */
const ET_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit" });
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
function etMin(t: number) { const p: Record<string, string> = {}; for (const x of ET_PARTS.formatToParts(new Date(t * 1000))) p[x.type] = x.value; return (+p.hour % 24) * 60 + +p.minute; }
function etWd(t: number) { return ET_PARTS.formatToParts(new Date(t * 1000)).find((x) => x.type === "weekday")?.value ?? ""; }
const tradeDate = (t: number) => ET_DAY.format(new Date((t + 6 * 3600) * 1000));   // the session opening 18:00 belongs to the next day
const dailyCache = new Map<string, { at: number; bars: Bar[] }>();
async function dailyBars(symbol: string, range: string) {
  const k = `${symbol}|${range}`, hit = dailyCache.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit.bars;
  const { bars } = await yahoo(symbol, `interval=1d&range=${range}`, true);   // the live session's daily bar is the one this week needs
  dailyCache.set(k, { at: Date.now(), bars });
  return bars;
}
async function repairSessionOpens(symbol: string, bars: Bar[], step: number, params: string) {
  const starts: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const gap = i === 0 ? etWd(bars[0][0]) === "Sun" : bars[i][0] - bars[i - 1][0] >= 20 * 3600;
    if (!gap) continue;
    const m = etMin(bars[i][0]);
    if (m > 18 * 60 && m < 19 * 60) starts.push(i);
    else if (m === 18 * 60 && step >= 3600) starts.push(i);   // the 60m bar is there, its open is not
  }
  if (!starts.length) return;
  let daily: Bar[] = [];
  const wide = /range=(60d|1y|2y|5y|max)|period1=/.test(params);
  try { daily = await dailyBars(symbol, wide ? "2y" : "3mo"); } catch { return; }
  const byDate = new Map(daily.map((d) => [tradeDate(d[0]), d]));
  for (let s = starts.length - 1; s >= 0; s--) {
    const i = starts[s], first = bars[i];
    const sessionStart = first[0] - (etMin(first[0]) - 18 * 60) * 60;
    const d = byDate.get(tradeDate(sessionStart)); if (!d) continue;
    let hi = -Infinity, lo = Infinity, lastT = 0;
    for (let j = i; j < bars.length && bars[j][0] < sessionStart + 23 * 3600; j++) { lastT = bars[j][0]; if (j > i || first[0] !== sessionStart) { hi = Math.max(hi, bars[j][2]); lo = Math.min(lo, bars[j][3]); } }
    // the daily extremes only prove something about the missing minutes when every other bar of the session is
    // in hand: the session ran to its last hour, or it is still running and the bars reach now. A 7-day backfill
    // slice that stops mid-session would otherwise hand the day's later high to the 18:00 bar.
    const whole = lastT >= sessionStart + 22 * 3600 || lastT >= Date.now() / 1000 - 3600;
    const o = d[1], c = first[1];
    const h = Math.max(o, c, whole && d[2] > hi ? d[2] : -Infinity), l = Math.min(o, c, whole && d[3] < lo ? d[3] : Infinity);
    if (first[0] === sessionStart) { first[1] = o; first[2] = Math.max(first[2], h); first[3] = Math.min(first[3], l); }
    else bars.splice(i, 0, [sessionStart, o, h, l, c, 0]);
  }
}

async function fetchTape(symbol: string, range: string) {
  const { meta: m, bars } = await yahoo(symbol, `interval=1m&range=${range}`);
  return {
    symbol,
    last: m.regularMarketPrice ?? (bars.length ? bars[bars.length - 1][4] : null),
    prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
    gmtoffset: m.gmtoffset ?? -14400,
    fetchedAt: new Date().toISOString(),
    bars,
  };
}

// one window of bars in one round trip: nq_bars_json builds the array in SQL,
// so PostgREST's 1000-row page never applies
async function readBars(symbol: string, interval: string, from: Date, to: Date, cap = 60000) {
  const sb = admin();
  const { data, error } = await sb.rpc("nq_bars_json", { p_interval: interval, p_from: from.toISOString(), p_to: to.toISOString(), p_cap: cap, p_symbol: symbol });
  if (error) throw new Error(error.message);
  return (data ?? []) as number[][];
}

const memberCache = new Map<string, { at: number; ok: boolean }>();
async function isMember(authorization: string) {
  if (!authorization) return false;
  const hit = memberCache.get(authorization);
  if (hit && Date.now() - hit.at < 300_000) return hit.ok;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await sb.rpc("is_member");
  const ok = !error && data === true;
  if (memberCache.size > 2000) memberCache.clear();
  memberCache.set(authorization, { at: Date.now(), ok });
  return ok;
}

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

// upsert in slices; the (symbol, interval, t) key makes overlapping pulls harmless
async function store(symbol: string, interval: string, bars: Bar[]) {
  const sb = admin();
  let n = 0;
  for (let i = 0; i < bars.length; i += 1000) {
    const rows = bars.slice(i, i + 1000).map((b) => ({ symbol, interval, t: new Date(b[0] * 1000).toISOString(), o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
    const { error } = await sb.from("nq_bars").upsert(rows, { onConflict: "symbol,interval,t" });
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
    const symbol = sym(body.symbol);
    let params = `interval=${interval}&range=${body.range ?? (interval === "1m" ? "2d" : interval === "5m" ? "60d" : interval === "60m" ? "2y" : "max")}`;
    if (body.period1 && body.period2) params = `interval=${interval}&period1=${+body.period1}&period2=${+body.period2}`;
    try {
      const { bars } = await yahoo(symbol, params);
      const n = await store(symbol, interval, bars);
      return json(200, { ok: true, symbol, interval, pulled: bars.length, stored: n, first: bars[0]?.[0], last: bars.at(-1)?.[0] });
    } catch (err) {
      return json(502, { error: String((err as Error)?.message ?? err) });
    }
  }

  if (req.method !== "GET") return json(405, { error: "GET only" });
  // members only: the platform has already verified the JWT, this asks the database whether its owner
  // holds an entitlement (or is staff). Answers are remembered per token for five minutes.
  if (!(await isMember(req.headers.get("authorization") ?? ""))) return json(403, { error: "members only" });
  const symbol = sym(p.get("symbol"));

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
    try { bars = await readBars(symbol, "1m", start, end, 3000); } catch (err) { return json(500, { error: String((err as Error).message) }); }
    return json(200, { symbol, day, bars, last: bars.at(-1)?.[4] ?? null, prevClose: null, gmtoffset: -14400, fetchedAt: new Date().toISOString() }, { "Cache-Control": "public, max-age=3600" });
  }
  if (p.get("interval")) {
    const interval = p.get("interval")!;
    if (!INTERVALS.has(interval)) return json(400, { error: "interval=1m|5m|60m|1d" });
    const from = p.get("from") ? new Date(p.get("from")!) : new Date(Date.now() - 7 * 864e5);
    const to = p.get("to") ? new Date(p.get("to")!) : new Date();
    if (isNaN(+from) || isNaN(+to)) return json(400, { error: "from/to must be dates" });
    let bars: number[][];
    try { bars = await readBars(symbol, interval, from, new Date(+to + 1), 60000); } catch (err) { return json(500, { error: String((err as Error).message) }); }
    return json(200, { symbol, interval, from: from.toISOString(), to: to.toISOString(), bars, capped: bars.length >= 60000 }, { "Cache-Control": "public, max-age=300" });
  }

  /* ── the live tape ── */
  const range = p.get("range") === "5d" ? "5d" : "1d";
  const tailRaw = p.get("tail");   // absent = the whole range; a number = the last N minutes
  const tailN = tailRaw == null ? 0 : Math.min(60, Math.max(1, +tailRaw || 1));
  const slim = (body: string) => { if (!tailN) return body; const j = JSON.parse(body); j.bars = j.bars.slice(-tailN); return JSON.stringify(j); };
  const ck = `${symbol}|${range}`;
  const hit = cache.get(ck);
  const now = Date.now();
  if (hit && now - hit.at < TTL[range]) return json(200, slim(hit.body), { "Cache-Control": "no-store", "X-Tape-Cache": "hit" });
  try {
    const body = JSON.stringify(await fetchTape(symbol, range));
    cache.set(ck, { at: now, body });
    return json(200, slim(body), { "Cache-Control": "no-store", "X-Tape-Cache": "miss" });
  } catch (err) {
    if (hit) return json(200, slim(hit.body), { "Cache-Control": "no-store", "X-Tape-Cache": "stale" });
    return json(502, { error: String((err as Error)?.message ?? err) });
  }
});
