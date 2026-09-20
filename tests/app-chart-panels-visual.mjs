// D1 LIT label lane + the two panel indicators (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-panels-visual.mjs      (APP_URL / OUT / PHONE / W / HGT env)
// The lane: with all twenty LIT parts on, no two labels may share pixels. The panels:
// HTF reads five timeframes and News reads the live calendar, each in its own corner,
// and neither may overflow its card (the app-wide `table { min-width: 480px }` used to).
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-chart-panels"); mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const browser = await chromium.launch();
const PHONE = process.env.PHONE === "1", PRE = PHONE ? "p-" : "d-";
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: Number(process.env.W || 2560), height: Number(process.env.HGT || 1320) } });
await ctx.addInitScript(([k, v]) => {
  localStorage.setItem(k, v);
  localStorage.setItem("echelon-gex-tour", "1");
  localStorage.setItem("echelon-quotes-off", "1");
  localStorage.setItem("echelon-splash-day", new Date().toDateString());
  localStorage.setItem("echelon-chart-tf", "1h");
}, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => { errs.push(e.message); console.log("PAGEERROR", e.message) });
await page.goto(process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#td-h1", { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${OUT}/${PRE}${n}.png` });
const fails = [], ok = (c, w) => { console.log((c ? "  ok   " : "  FAIL ") + w); if (!c) fails.push(w) };

await page.evaluate(() => document.querySelector('.tab[data-view="chart"]')?.click());
await page.waitForFunction(() => /[\d,]{4}/.test(document.getElementById("ch-legend")?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);

console.log(`\nD1 LIT: the curated set and the label lane`);
const LOUD = ["litMarks", "litKo", "litPo3", "litEighths", "litPm", "litNwog", "litDr", "litSig", "litOpen22", "litLdn"];
const curated = await page.evaluate((loud) => ({ v: window.__CH.s.litV, on: loud.filter((k) => window.__CH.s[k]) }), LOUD);
ok(curated.v === 2 && !curated.on.length, "the ten busy parts ship off, litV stamped: " + JSON.stringify(curated));

// every part on is the worst case the lane has to survive
await page.evaluate((loud) => { const C = window.__CH; C.s.lit = true; for (const k of loud) C.s[k] = true; C.$.paint() }, LOUD);
await page.waitForTimeout(1200);
const lane = await page.evaluate(() => {
  const r = window.__CH.lbl || [];
  const hits = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i], b = r[j];
    if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) hits.push([i, j]);
  }
  return { n: r.length, hits: hits.length };
});
ok(lane.n > 12, "the lane placed a full board of labels: " + lane.n);
ok(lane.hits === 0, "no two labels share pixels: " + lane.hits + " overlaps");
await shot("lit-all-on");
await page.evaluate((loud) => { const C = window.__CH; for (const k of loud) C.s[k] = false; C.$.paint() }, LOUD);
await page.waitForTimeout(600);
await shot("lit-curated");

console.log(`\nD1 HTF Dashboard`);
await page.evaluate(() => { const C = window.__CH; C.s.htf = true; C.$.htfWarm(); C.$.paint() });
await page.waitForTimeout(9000);
const htf = await page.evaluate(() => {
  const card = document.querySelector('.ch-panel[data-ind="htf"]'), tbl = card?.querySelector("table");
  const rows = [...(tbl?.querySelectorAll("tbody tr") || [])].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
  return { corner: card?.parentElement.dataset.c, rows, over: Math.round(tbl.getBoundingClientRect().right - card.getBoundingClientRect().right), legend: document.querySelector('#ch-legend .ln[data-ind="htf"]')?.textContent || "" };
});
ok(htf.corner === "tr", "it sits top right by default: " + htf.corner);
ok(htf.rows.length === 5, "five timeframe rows: " + htf.rows.length);
// a 1h chart makes 5m and 15m finer than the interval, so those read n/a and the rest carry numbers
const numeric = htf.rows.filter((r) => r.length === 5 && /^\d+\.\d$/.test(r[2]));
ok(numeric.length >= 3, "1H, 4H and D carry live readings: " + JSON.stringify(numeric));
ok(htf.rows.filter((r) => r.length === 2).length === 2, "5m and 15m read n/a under a 1h chart");
ok(htf.over <= 0, "the table stays inside its card (overflow " + htf.over + "px)");
// the phone legend collapses to chips and renders no indicator rows at all, so the bias line is desktop only
if (!PHONE) ok(/Bullish|Bearish|Neutral/.test(htf.legend) && /up/.test(htf.legend), "the legend carries the bias: " + htf.legend);
else ok(!htf.legend, "the phone legend stays collapsed, the panel is the readout");

console.log(`\nD1 News`);
await page.evaluate(() => { const C = window.__CH; C.s.news = true; C.$.paint() });
await page.waitForTimeout(1200);
const news = await page.evaluate(() => {
  const card = document.querySelector('.ch-panel[data-ind="news"]');
  return { corner: card?.parentElement.dataset.c, head: card?.querySelector(".ch-ph b")?.textContent || "", text: card?.innerText.replace(/\n/g, " | ") || "", fed: (window.__CH.s.news && card && !/feed unavailable/i.test(card.innerText)) };
});
ok(news.corner === "br", "it sits bottom right by default: " + news.corner);
ok(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2} \w{3}$/.test(news.head), "the header names the day it speaks for: " + news.head);
ok(news.fed, "the live calendar answered (never reads an empty feed as a quiet day): " + news.text);
// the panel must never claim a quiet day when it has nothing to say for that day
ok(!/No USD news today/.test(news.text) || /Next up/.test(news.text), "a clear day still names the next release: " + news.text);

console.log(`\nboth corners at once`);
const both = await page.evaluate(() => [...document.querySelectorAll(".ch-panel")].map((p) => p.dataset.ind + "@" + p.parentElement.dataset.c));
ok(both.length === 2, "both panels live together: " + both.join(", "));
await page.evaluate(() => { const C = window.__CH; C.s.htfPos = "br"; C.panelSig = null; C.$.paint() });
await page.waitForTimeout(500);
const stacked = await page.evaluate(() => { const w = document.querySelector('.ch-pw[data-c="br"]'); return { n: w?.children.length || 0, overlap: (() => { const k = [...(w?.children || [])].map((c) => c.getBoundingClientRect()); return k.length === 2 && k[0].bottom > k[1].top && k[0].top < k[1].bottom } )() } });
ok(stacked.n === 2 && !stacked.overlap, "two panels in one corner stack instead of covering each other: " + JSON.stringify(stacked));
await page.evaluate(() => { const C = window.__CH; C.s.htfPos = "tr"; C.panelSig = null; C.$.paint() });
await page.waitForTimeout(400);
await shot("panels");

ok(!errs.length, "no page errors: " + errs.join(" / "));
await browser.close();
console.log(`\nscreenshots: ${OUT}`);
if (fails.length) { console.log(["FAILS", ...fails].join("\n - ")); process.exit(1) } else console.log("\nall good");
