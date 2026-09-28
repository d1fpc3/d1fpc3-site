// Chart: the weekly open and the NWOG (manual, not a node:test). D1, 2026-09-27: "NWOG isn't correct and the
// weekly open isn't correct".
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-week-open-visual.mjs        (APP_URL / OUT env)
// Yahoo never delivers Sunday 18:00 to 18:09 ET, so the week used to open at the 18:10 price; the tape function
// now puts the 18:00 bar back from the daily bar. On NQ, MNQ and ES at 1m, 5m and 1h this checks: the chart's
// weekly open is the daily bar's session open, the week's first bar is at 18:00, the NWOG runs from Friday's
// last trade to that open, and Friday's last bar is a trade (no 17:00 settlement print).
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-chart-week-open"); mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
const fails = []; const ok = (c, w) => { console.log((c ? "  ok   " : "  FAIL ") + w); if (!c) fails.push(w); };
const YH = { NQ: "NQ=F", MNQ: "MNQ=F", ES: "ES=F" };
const et = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const browser = await chromium.launch();
for (const sym of ["NQ", "MNQ", "ES"]) {
  // the truth: Yahoo's daily bar for the session that is on the chart now
  const dj = await (await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(YH[sym])}?interval=1d&range=5d`, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
  const dr = dj.chart.result[0], dOpen = dr.indicators.quote[0].open.at(-1);
  for (const tf of ["1m", "5m", "1h"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(([k, v, s, t]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-chart-sym", s); localStorage.setItem("echelon-chart-tf", t); localStorage.setItem("echelon-chart-settings", JSON.stringify({ lit: true, litV: 4, litWo: true, litNwog: true })); }, [`sb-${REF}-auth-token`, JSON.stringify(session), sym, tf]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fails.push(`${sym} ${tf} pageerror: ${e.message}`));
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#td-h1", { state: "attached", timeout: 30000 }); await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click());
    await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open") } });
    await page.waitForFunction(() => window.__CH?.$?.lit && window.__CH.$.lit().wo, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const L = window.__CH.$.lit(), bars = window.__CH.vis || [];
      const wo = L.wo, first = wo ? bars[wo.i0] : null, fri = wo && wo.i0 > 0 ? bars[wo.i0 - 1] : null;
      const g = (L.nwog || []).find((x) => x.i0 === wo?.i0) || null;
      const o18Late = (L.open18 || []).filter((o) => wo && o.i0 < wo.i0 && o.i1 >= wo.i0).map((o) => o.p);
      return { o18Late, wo: wo?.p, firstT: first?.t, friT: fri?.t, friC: fri?.c, friV: fri?.v, nwog: g ? { top: g.top, bottom: g.bottom, o: g.o, c: g.c } : null, tf: window.__CH.tf };
    });
    const firstEt = r.firstT ? et.format(new Date(r.firstT * 1000)) : "none", friEt = r.friT ? et.format(new Date(r.friT * 1000)) : "none";
    console.log(`\n${sym} ${tf}: weekly open ${r.wo} (daily ${dOpen}), first bar ${firstEt}, Friday's last ${friEt} close ${r.friC}, NWOG ${JSON.stringify(r.nwog)}`);
    ok(Math.abs(r.wo - dOpen) < 0.01, `${sym} ${tf}: the weekly open is the session's real open, ${r.wo}`);
    ok(/^Sun 18:00$/.test(firstEt), `${sym} ${tf}: the week's first bar is Sunday 18:00 (${firstEt})`);
    ok(!/17:00/.test(friEt) || tf === "1h", `${sym} ${tf}: Friday's last bar is a trade, not a 17:00 settlement print (${friEt})`);
    ok(!r.o18Late.length, `${sym} ${tf}: no earlier 18:00 open runs on into the new week (${JSON.stringify(r.o18Late)})`);
    // the void is Friday's close to the Sunday open; what is drawn is the slice price has not eaten yet (Pine 8d)
    if (r.nwog) ok(Math.abs(r.nwog.c - r.friC) < 0.01 && Math.abs(r.nwog.o - dOpen) < 0.01 && Math.min(r.nwog.top, r.nwog.bottom) >= Math.min(r.friC, dOpen) - 0.01 && Math.max(r.nwog.top, r.nwog.bottom) <= Math.max(r.friC, dOpen) + 0.01, `${sym} ${tf}: the NWOG runs from Friday's close ${r.friC} to the open ${dOpen}, ${r.nwog.bottom} to ${r.nwog.top} still open`);
    else console.log("  (no NWOG box: the gap is under 4 ticks, or price has traded through it)");
    if (tf === "1m" && sym === "NQ") await page.screenshot({ path: `${OUT}/nq-1m.png` });
    await ctx.close();
  }
}
await browser.close();
console.log(`\nscreenshots: ${OUT}`);
if (fails.length) { console.log(`\n${fails.length} FAILED:\n - ` + fails.join("\n - ")); process.exit(1); }
console.log("\nALL OK");
