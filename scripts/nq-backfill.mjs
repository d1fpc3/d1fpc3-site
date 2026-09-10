// Backfill the NQ archive from everything Yahoo Finance still serves.
//   node scripts/nq-backfill.mjs            (SUPABASE_ACCESS_TOKEN env, or ~/.supabase/access-token)
// Yahoo keeps 1-minute bars for the last 30 days in 7-day slices, 5-minute
// for 60 days, hourly for two years, daily since 2000. Each pull goes through
// the tape function's store path, which upserts into nq_bars on (interval, t),
// so running this twice is harmless. The nightly nq_store cron keeps the
// 1-minute archive growing after the backfill.
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const tokenFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
if (!mgmt) throw new Error("no Supabase access token");
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const anon = keys.find((k) => k.name === "anon").api_key;
// the cron key lives in the database's nq_store function (the Management API only
// returns a digest of the secret), so read it from there: nothing to commit
const def = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: "select pg_get_functiondef('public.nq_store'::regproc) as d" }) })).json();
const secret = process.env.TAPE_STORE_SECRET || /x-webhook-secret', '([0-9a-f]+)'/.exec(def[0]?.d ?? "")?.[1];
if (!secret) throw new Error("cron secret not found in nq_store()");

async function pull(body) {
  const r = await fetch(`${SB}/functions/v1/tape?store=1`, { method: "POST", headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}`, "x-webhook-secret": secret }, body: JSON.stringify(body) });
  const j = await r.json();
  const tag = body.period1 ? `${body.interval} ${new Date(body.period1 * 1000).toISOString().slice(0, 10)}..${new Date(body.period2 * 1000).toISOString().slice(0, 10)}` : `${body.interval} ${body.range}`;
  console.log(r.status, tag, j.error ? "ERROR " + j.error : `pulled ${j.pulled} stored ${j.stored} (${new Date(j.first * 1000).toISOString().slice(0, 16)} to ${new Date(j.last * 1000).toISOString().slice(0, 16)})`);
  return j;
}

const day = 86400, now = Math.floor(Date.now() / 1000);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;   // e.g. ONLY=1d to refresh one interval
const want = (i) => !ONLY || ONLY.includes(i);
// 1-minute: four 7-day slices back to Yahoo's 30-day wall, newest first
if (want("1m")) for (let k = 0; k < 4; k++) await pull({ interval: "1m", period1: now - (k + 1) * 7 * day, period2: now - k * 7 * day });
if (want("5m")) await pull({ interval: "5m", range: "60d" });
if (want("60m")) await pull({ interval: "60m", range: "2y" });
// daily: Yahoo downsamples range=max to one bar a month, so pull it in 5-year slices
if (want("1d")) for (let y = new Date().getUTCFullYear(); y >= 2000; y -= 5) await pull({ interval: "1d", period1: Math.floor(Date.UTC(y - 4, 0, 1) / 1000), period2: Math.min(now, Math.floor(Date.UTC(y + 1, 0, 1) / 1000)) });

// what the archive holds now
const q = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: "select interval, count(*) as bars, min(t) as first, max(t) as last from public.nq_bars group by interval order by 1" }) })).json();
console.table(q.map((r) => ({ interval: r.interval, bars: +r.bars, first: r.first.slice(0, 16), last: r.last.slice(0, 16) })));
const days = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: "select count(*) as n, min(d) as first, max(d) as last from public.nq_session_days() d" }) })).json();
console.log("1-minute session days:", days[0]);
