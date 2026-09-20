// D1 ICT, SD Zones, Pending Levels, Asia Mitigations and the LIT Engine (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-structure-visual.mjs     (APP_URL / OUT / TF / W / HGT env)
// These four are ports of Pine overlays, so the checks are about the port being faithful:
// a zone only exists where its rule says it can, the scan window is honoured, and the
// shared label lane still places every name without a collision once all six overlays
// are on at once. Defaults matter as much as the maths here: a busy session leaves a
// hundred swept pending levels, and drawing them buries the handful still standing.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-chart-structure"); mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const TF = process.env.TF || "15m";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W || 2560), height: Number(process.env.HGT || 1320) } });
await ctx.addInitScript(([k, v, tf]) => {
  localStorage.setItem(k, v);
  localStorage.setItem("echelon-gex-tour", "1");
  localStorage.setItem("echelon-quotes-off", "1");
  localStorage.setItem("echelon-splash-day", new Date().toDateString());
  localStorage.setItem("echelon-chart-tf", tf);
}, [`sb-${REF}-auth-token`, JSON.stringify(session), TF]);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => { errs.push(e.message); console.log("PAGEERROR", e.message) });
await page.goto(process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#td-h1", { timeout: 30000 });
await page.waitForTimeout(1500);
const fails = [], ok = (c, w) => { console.log((c ? "  ok   " : "  FAIL ") + w); if (!c) fails.push(w) };
await page.evaluate(() => document.querySelector('.tab[data-view="chart"]')?.click());
await page.waitForFunction(() => /[\d,]{4}/.test(document.getElementById("ch-legend")?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);

console.log(`\ndefaults: every one of the four is opt in`);
const off = await page.evaluate(() => ["ict", "sd", "pend", "amit"].filter((k) => window.__CH.s[k]));
ok(!off.length, "none of them turn themselves on: " + JSON.stringify(off));
const keepOff = await page.evaluate(() => window.__CH.s.pendKeep);
ok(keepOff === false, "swept pending levels are not drawn by default: pendKeep " + keepOff);

await page.evaluate(([tf]) => { const C = window.__CH; C.s.lit = true; for (const k of ["ict", "sd", "pend", "amit"]) C.s[k] = true; if (C.$.tf) C.$.tf(tf); C.$.paint() }, [TF]);
await page.waitForTimeout(3500);
await page.evaluate(() => window.__CH.$.paint());
await page.waitForTimeout(600);

console.log(`\nD1 ICT`);
const ict = await page.evaluate(() => { const v = window.__CH.$.ict(); return { mid: v.mid?.p ?? null, pc: v.pc?.p ?? null, rth: v.rth, macros: v.macros.map((m) => m.name), days: window.__CH.s.ictDays } });
ok(ict.mid != null && ict.pc != null, `midnight open ${ict.mid} and settlement close ${ict.pc} both found`);
ok(!!ict.rth && ict.rth.q25 < ict.rth.ce && ict.rth.ce < ict.rth.q75, "the RTH quadrants sit in order around CE: " + JSON.stringify(ict.rth && { q25: Math.round(ict.rth.q25), ce: Math.round(ict.rth.ce), q75: Math.round(ict.rth.q75) }));
// eight windows a day, and never a name the table does not define
const NAMES = ["02:50", "08:50", "09:50", "10:50", "11:50", "13:50", "14:50", "15:50"];
ok(ict.macros.length > 0 && ict.macros.every((m) => NAMES.includes(m)), `${ict.macros.length} macro windows over ${ict.days} days, all named`);
ok(ict.macros.length <= 8 * ict.days, "no more than eight a day: " + ict.macros.length);

console.log(`\nD1 SD Zones`);
const sd = await page.evaluate(() => { const z = window.__CH.$.sd(), S = window.__CH.s; return { n: z.length, expl: +S.sdExpl, maxBase: +S.sdBase, perSide: +S.sdMax, rows: z.map((x) => ({ cls: x.cls, score: +x.score.toFixed(2), side: x.side, state: x.state, span: x.born - x.i0 })) } });
ok(sd.n > 0, "zones found: " + sd.n);
ok(sd.rows.every((r) => ["RBR", "DBR", "RBD", "DBD"].includes(r.cls)), "every zone carries a real classification");
ok(sd.rows.every((r) => (r.side === 1) === (r.cls === "RBR" || r.cls === "DBR")), "demand zones are the RBR/DBR pair, supply the RBD/DBD pair");
ok(sd.rows.every((r) => r.score >= sd.expl), `every departure clears the ${sd.expl}x ATR bar: min ${Math.min(...sd.rows.map((r) => r.score))}`);
ok(sd.rows.every((r) => r.span >= 1 && r.span <= sd.maxBase), `every base is 1 to ${sd.maxBase} candles: ${JSON.stringify([...new Set(sd.rows.map((r) => r.span))].sort())}`);
for (const side of [1, -1]) ok(sd.rows.filter((r) => r.side === side && r.state < 2).length <= sd.perSide, `live ${side === 1 ? "demand" : "supply"} within the per-side cap of ${sd.perSide}`);

console.log(`\nD1 Pending Levels`);
const pend = await page.evaluate(() => { const l = window.__CH.$.pend(), S = window.__CH.s; return { n: l.length, tol: +S.pendTol, live: l.filter((x) => !x.swept).map((x) => ({ count: x.count, h: +(x.top - x.bottom).toFixed(2), isHigh: x.isHigh })), swept: l.filter((x) => x.swept).length } });
ok(pend.live.length > 0, `levels still standing: ${pend.live.length} (${pend.swept} already run)`);
ok(pend.live.every((l) => l.count >= 2), "a level needs at least two swings: " + JSON.stringify([...new Set(pend.live.map((l) => l.count))].sort()));
ok(pend.live.every((l) => l.h <= pend.tol * 2 + 0.001), `no level is wider than twice the ${pend.tol} point tolerance: max ${Math.max(...pend.live.map((l) => l.h))}`);
// the whole point of the default: the run levels are counted but stay off the canvas
const sweptDrawn = await page.evaluate(() => (window.__CH.lbl || []).filter((r) => /swept/.test(r.text || "")).length);
ok(sweptDrawn === 0 || pend.swept === 0, "no swept level is painted while pendKeep is off");

console.log(`\nAsia Mitigations`);
const amit = await page.evaluate(() => {
  const z = window.__CH.$.amit(), C = window.__CH, bars = C.vis || C.bars, S = C.s;
  const HM = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
  const mins = (t) => { const [h, m] = HM.format(new Date(t * 1000)).split(":"); return +h * 60 + +m };
  return { n: z.length, cap: +S.amitMax, rows: z.map((x) => ({ bull: x.bull, mit: !!x.mit, inAsia: [0, 1, 2].every((k) => { const m = mins(bars[x.i0 + k].t); return m >= 1080 || m < 60 }), gap: x.bull ? +(bars[x.i0 + 2].l - x.top).toFixed(2) : +(x.bottom - bars[x.i0 + 2].h).toFixed(2) })) };
});
ok(amit.n > 0, "mitigation zones found: " + amit.n);
ok(amit.rows.every((r) => r.inAsia), "every zone formed inside the 18:00 to 01:00 window");
ok(amit.rows.every((r) => r.gap > 0), "every one is a real three-candle gap: " + JSON.stringify(amit.rows.map((r) => r.gap)));
for (const b of [true, false]) ok(amit.rows.filter((r) => r.bull === b).length <= amit.cap, `${b ? "bullish" : "bearish"} zones within the cap of ${amit.cap}`);

console.log(`\nD1 LIT Engine`);
await page.evaluate(() => { const C = window.__CH; C.s.eng = true; C.$.paint() });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__CH.$.paint());
await page.waitForTimeout(500);
const eng = await page.evaluate(() => {
  const e = window.__CH.$.eng(), S = window.__CH.s, C = window.__CH, bars = C.vis || C.bars;
  const kinds = {}; for (const x of e.events) kinds[x.k] = (kinds[x.k] || 0) + 1;
  return {
    trend: e.trend, cyc: e.cyc, bos: e.bos, choch: e.choch, idm: e.idm, idmPend: e.idmPend, kinds,
    obs: e.obs.length, openIdm: e.idms.filter((d) => d.open).length,
    minRR: +S.engMinRR, pv: 20,
    trades: e.trades.map((t) => ({ dir: t.dir, entry: t.entry, sl: t.sl, tp: t.tp, qty: t.qty, risk: t.risk, rr: t.dir === 1 ? (t.tp - t.entry) / (t.entry - t.sl) : (t.entry - t.tp) / (t.sl - t.entry) })),
    edmAtLows: e.edm.filter((m) => m.bull).every((m) => m.p === bars[m.i].l),
    edmAtHighs: e.edm.filter((m) => !m.bull).every((m) => m.p === bars[m.i].h),
    edm: e.edm.length, lets: e.let.length,
    panel: document.querySelector('.ch-panel[data-ind="eng"]'),
    panelCorner: document.querySelector('.ch-panel[data-ind="eng"]')?.parentElement.dataset.c,
    panelText: document.querySelector('.ch-panel[data-ind="eng"]')?.innerText.replace(/\n/g, " | ") || "",
  };
});
ok([1, -1, 0].includes(eng.trend), "the trend is seeded or directional: " + eng.trend);
ok(eng.trend === 0 || (eng.bos != null && eng.choch != null), "a directional trend carries both levels");
// the protected level is always behind price relative to the structural extreme
ok(eng.trend === 0 || (eng.trend === 1 ? eng.bos > eng.choch : eng.bos < eng.choch), `the structural extreme sits beyond the protected level for a ${eng.trend === 1 ? "bullish" : "bearish"} trend: BoS ${eng.bos}, CHoCH ${eng.choch}`);
ok(eng.kinds.bos > 0 && eng.kinds.choch > 0, "it found structure: " + JSON.stringify(eng.kinds));
// the bug that put an IDM label on every row of the price scale: only the level still
// standing runs to the right edge, every superseded one is closed where it was replaced
ok(eng.openIdm <= 1, "at most one inducement line is left open: " + eng.openIdm);
ok(eng.openIdm === (eng.idmPend ? 1 : 0), "the open line matches the pending state: " + eng.openIdm + " vs " + eng.idmPend);
ok(eng.obs <= 24, "order blocks stay inside the Pine's cap of 24: " + eng.obs);
ok(eng.trades.length > 0, "entry signals fired: " + eng.trades.length);
ok(eng.trades.every((t) => (t.dir === 1 ? t.sl < t.entry && t.tp > t.entry : t.sl > t.entry && t.tp < t.entry)), "every trade has its stop and target on the right sides");
ok(eng.trades.every((t) => t.rr >= eng.minRR - 1e-9), `every trade clears the ${eng.minRR} R:R floor: min ${Math.min(...eng.trades.map((t) => +t.rr.toFixed(2)))}`);
ok(eng.trades.every((t) => t.qty >= 1 && Math.abs(t.risk - t.qty * Math.abs(t.entry - t.sl) * eng.pv) < 0.01), "contract count and dollar risk agree with the stop distance");
ok(eng.edmAtLows && eng.edmAtHighs, "EDM marks sit on the pivot they were found at");
ok(["Build Up", "Inducement", "Inducement + vector", "Expansion (BoS)", "Mitigation", "Complete"].includes(eng.cyc), "the cycle is a known state: " + eng.cyc);
ok(eng.panelCorner === "bl", "the dashboard sits bottom left, clear of the legend: " + eng.panelCorner);
ok(/LIT ENGINE/.test(eng.panelText) && /Cycle/.test(eng.panelText) && /Last signal/.test(eng.panelText), "the dashboard reads: " + eng.panelText);

console.log(`\nsix overlays at once`);
const lane = await page.evaluate(() => {
  const r = window.__CH.lbl || []; let hits = 0;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], b = r[j]; if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) hits++ }
  return { n: r.length, hits };
});
ok(lane.n > 20, "the shared lane placed labels from every overlay: " + lane.n);
ok(lane.hits === 0, "still no two labels sharing pixels: " + lane.hits + " overlaps");
const legend = await page.evaluate(() => document.getElementById("ch-legend").innerText.replace(/\n/g, " | "));
ok(/LIT Engine/.test(legend) && /D1 ICT/.test(legend) && /SD Zones/.test(legend) && /Pending/.test(legend) && /Asia MIT/.test(legend), "all five read in the legend: " + legend);
// a repaint must not cost a frame, or panning gets sticky
const ms = await page.evaluate(() => { const C = window.__CH, t = performance.now(); for (let i = 0; i < 30; i++) C.$.paint(); return +((performance.now() - t) / 30).toFixed(2) });
ok(ms < 16, `a warm repaint stays inside a frame: ${ms}ms`);
await page.screenshot({ path: `${OUT}/d-structure.png` });

ok(!errs.length, "no page errors: " + errs.join(" / "));
await browser.close();
console.log(`\nscreenshots: ${OUT}`);
if (fails.length) { console.log(["FAILS", ...fails].join("\n - ")); process.exit(1) } else console.log("\nall good");
