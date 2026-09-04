// Statistics page performance charts (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-stats-perf-visual.mjs        (APP_URL / OUT / EMAIL env)
// Settings → Statistics shows "Your R over time" (30/90/All switch), "R per trade"
// and "By weekday" built from the member's R-tagged recaps. Real account first
// (empty state or real data), then a second page where the perf query is
// answered with synthetic rows via page.route (nothing is written to the DB)
// so every chart renders; desktop + phone screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-stats-perf-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://localhost:8080/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

// 70 synthetic trades over ~120 days with a mild positive edge, oldest first
let seed = 5; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const SYNTH = [];
for (let i = 0; i < 70; i++) {
  const win = rnd() < 0.56;
  const r = win ? Math.round((0.5 + rnd() * 3) * 10) / 10 : -Math.round((0.3 + rnd() * 1.5) * 10) / 10;
  const t = new Date(Date.now() - (70 - i) * 1.7 * 864e5); t.setHours(9 + Math.floor(rnd() * 6), 30, 0, 0);
  SYNTH.push({ outcome: win ? "win" : "loss", r, created_at: t.toISOString() });
}
const isPerfQuery = (u) => u.includes("/rest/v1/member_recaps") && u.includes("limit=2000");

const fails = [];
const browser = await chromium.launch();

async function openStats(page) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 25000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('.tab[data-view="settings"]').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.set-row[data-go="set-stats"]').click());
  await page.waitForTimeout(1800);
}
const readStats = (page) => page.evaluate(() => ({
  range: [...document.querySelectorAll("#pf-range button")].map((b) => b.textContent + (b.classList.contains("on") ? "*" : "")),
  equity: document.querySelector("#pf-equity svg") ? "chart" : document.querySelector("#pf-equity .pf-empty")?.textContent,
  hist: document.querySelector("#pf-hist svg") ? "chart" : document.querySelector("#pf-hist .pf-empty")?.textContent,
  week: document.querySelectorAll("#pf-week .pf-row").length || document.querySelector("#pf-week .pf-empty")?.textContent,
  caps: [...document.querySelectorAll("#v-set-stats .pf-cap .label")].map((l) => l.textContent),
  hits: document.querySelectorAll("#pf-equity svg circle").length,
  endLabel: [...document.querySelectorAll("#pf-equity svg text")].map((t) => t.textContent).find((t) => /R$/.test(t)),
  note: document.querySelector("#pf-equity .pf-note")?.textContent,
  bars: document.querySelectorAll("#pf-hist svg rect").length,
  barLabel: [...document.querySelectorAll("#pf-hist svg text")].map((t) => t.textContent).filter((t) => /^\d+$/.test(t)),
  median: document.getElementById("pf-hist-n").textContent,
  weekVals: [...document.querySelectorAll("#pf-week .pf-row b")].map((b) => b.textContent),
  // only the new performance copy: the app's own stats line uses an em dash as an
  // empty-value placeholder, which the no-em-dash rule exempts
  emDash: [...document.querySelectorAll("#v-set-stats .pf-cap, #v-set-stats .pf-chart, #v-set-stats .pf-note, #v-set-stats .pf-empty, #pf-week")].some((n) => n.textContent.includes("\u2014")),
  fontSerif: getComputedStyle(document.getElementById("v-set-stats")).fontFamily.toLowerCase().includes("georgia"),
  visible: !!document.getElementById("v-set-stats")?.classList.contains("on"),
}));

async function run(label, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.removeItem("echelon-perf-range"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const wire = (page) => {
    page.on("pageerror", (e) => fails.push(`${label} pageerror: ${e.message}`));
    page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`${label} ${r.status()} ${r.url()}`); });
  };

  // 1. the real account, whatever it has
  let page = await ctx.newPage(); wire(page);
  await openStats(page);
  const real = await readStats(page);
  console.log(label, "real:", JSON.stringify({ range: real.range, equity: real.equity, hist: real.hist, week: real.week, caps: real.caps }));
  if (!real.visible) fails.push(`${label} statistics view not shown`);
  if (!real.range.includes("90 days*")) fails.push(`${label} default range is not 90 days: ${real.range}`);
  if (!real.equity || !real.hist || !real.week) fails.push(`${label} a section did not render: ${JSON.stringify(real)}`);
  if (real.caps.some((t) => /[A-Z]{3,}/.test(t))) fails.push(`${label} uppercase micro-label: ${real.caps}`);
  await page.screenshot({ path: `${OUT}/${label}-01-real.png`, fullPage: true });
  await page.close();

  // 2. synthetic rows answered by the network layer
  page = await ctx.newPage(); wire(page);
  let served = 0;
  await page.route((u) => isPerfQuery(u.toString()), (route) => { served++; route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SYNTH) }); });
  await openStats(page);
  const s = await readStats(page);
  console.log(label, "synthetic:", JSON.stringify({ served, hits: s.hits, endLabel: s.endLabel, note: s.note, bars: s.bars, barLabel: s.barLabel, median: s.median, weekVals: s.weekVals }));
  if (!served) fails.push(`${label} perf query was not intercepted`);
  if (s.hits < 40) fails.push(`${label} equity curve missing or too few points in 90 days: ${s.hits}`);
  if (!s.endLabel) fails.push(`${label} equity end label missing`);
  if (!/best run .*R, biggest pullback .*R\./.test(s.note || "")) fails.push(`${label} equity note wrong: ${s.note}`);
  if (s.bars < 4) fails.push(`${label} histogram bars: ${s.bars}`);
  if (s.barLabel.length !== 1) fails.push(`${label} histogram should label exactly the tallest bin: ${s.barLabel}`);
  if (!/^median [+\u2212]?[\d.]+R$/.test(s.median)) fails.push(`${label} median label: ${s.median}`);
  if (s.weekVals.length < 5) fails.push(`${label} weekday rows: ${s.weekVals.length}`);
  if (s.emDash) fails.push(`${label} em dash in copy`);
  if (s.fontSerif) fails.push(`${label} serif font leaked in`);
  await page.screenshot({ path: `${OUT}/${label}-02-synthetic-90.png`, fullPage: true });

  // 3. range switch: 30 days narrows, All widens, choice persists
  await page.click('#pf-range button[data-d="30"]'); await page.waitForTimeout(400);
  const n30 = await page.evaluate(() => ({ on: document.querySelector("#pf-range button.on")?.textContent, note: document.querySelector("#pf-equity .pf-note")?.textContent, stored: localStorage.getItem("echelon-perf-range") }));
  if (n30.on !== "30 days" || !/in the last 30 days/.test(n30.note || "") || n30.stored !== "30") fails.push(`${label} 30-day switch: ${JSON.stringify(n30)}`);
  await page.click('#pf-range button[data-d="0"]'); await page.waitForTimeout(400);
  const nAll = await page.evaluate(() => ({ on: document.querySelector("#pf-range button.on")?.textContent, hits: document.querySelectorAll("#pf-equity svg circle").length, note: document.querySelector("#pf-equity .pf-note")?.textContent }));
  if (nAll.on !== "All" || nAll.hits < 70 || /in the last/.test(nAll.note || "")) fails.push(`${label} All switch: ${JSON.stringify(nAll)}`);
  if (served !== 1) fails.push(`${label} range switch should not refetch (served ${served})`);
  await page.screenshot({ path: `${OUT}/${label}-03-synthetic-all.png`, fullPage: true });
  await page.close();
  await ctx.close();
}

await run("desktop", { viewport: { width: 1280, height: 900 } });
await run("phone", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await browser.close();

if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log("PASS · shots in", OUT);
