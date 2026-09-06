// GEX tab, back in time (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-gex-history-visual.mjs        (APP_URL / OUT env)
// The worker archives every RTH print (/history.json, /gex.json?day=&t=).
// Stubs a history with one archived day (two prints) and two trail-only days,
// then: ‹ opens the archived day (surface drawn from that print, picker shows
// both prints, stamp says "Viewing", Refresh hidden); picking the other print
// reloads; ‹ again shows a trail-only day (grid hidden, summary figures, note);
// › walks back to today (live board restored, Refresh back). Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-gex-history`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "d1fpc3@gmail.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const note = (s) => console.log("  " + s);
const json = (body, status = 200) => ({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
const live = await (await fetch("https://gex-worker.frankiepc3.workers.dev/gex.json")).json();
const liveDay = live.generatedAt.slice(0, 10);
const dayBefore = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };
const ARCH = dayBefore(liveDay, 1), TRAIL1 = dayBefore(liveDay, 2), TRAIL2 = dayBefore(liveDay, 3);
const HISTORY = { archivedFrom: ARCH, days: [
  { date: liveDay, times: ["1615"], summary: { date: liveDay, net0: 828, flipOpen: 717, flipClose: 719, mwOpen: 700, mwClose: 700, spotClose: 717.9 } },
  { date: ARCH, times: ["1000", "1615"], summary: { date: ARCH, net0: 149, flipOpen: 715, flipClose: 716, mwOpen: 700, mwClose: 700, spotClose: 716.4 } },
  { date: TRAIL1, times: [], summary: { date: TRAIL1, net0: -122, flipOpen: 714.5, flipClose: 716, mwOpen: 700, mwClose: 710, spotClose: 715.2 } },
  { date: TRAIL2, times: [], summary: { date: TRAIL2, net0: 203, flipOpen: 712, flipClose: 713, mwOpen: 700, mwClose: 700, spotClose: 714.8 } },
] };
const archived = (t) => ({ ...live, generatedAt: `${ARCH}T${t === "1000" ? "14:00" : "20:15"}:00.000Z`, spot: t === "1000" ? 711.11 : 716.44, archived: { day: ARCH, t, times: ["1000", "1615"] } });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.route(/gex-worker\.frankiepc3\.workers\.dev\/(history\.json|gex\.json\?day=.*)/, (route) => {
  const u = route.request().url();
  if (u.includes("history.json")) return route.fulfill(json(HISTORY));
  const m = u.match(/day=([\d-]+)(?:&t=(\d+))?/);
  if (m && m[1] === ARCH) return route.fulfill(json(archived(m[2] || "1615")));
  return route.fulfill(json({ error: "no archived print for that day" }, 404));
});
await page.goto(APP_URL + "?start=gex", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.evaluate(() => { localStorage.setItem("echelon-gex-tour", "1"); document.querySelector('.tab[data-view="gex"]').click(); });
await page.waitForFunction(() => document.querySelectorAll("#gex-read .v").length >= 4 && !document.getElementById("gex-prev").disabled, null, { timeout: 30000 }).catch(() => fails.push("live board or day index never came up"));
const state = () => page.evaluate(() => ({
  day: document.getElementById("gex-day").textContent, prev: document.getElementById("gex-prev").disabled, next: document.getElementById("gex-next").disabled,
  title: document.getElementById("gex-read-title").textContent, stamp: document.getElementById("gex-stamp").textContent,
  picker: !document.getElementById("gex-time").hidden, options: [...document.querySelectorAll("#gex-time option")].map((o) => o.textContent),
  grid: !document.getElementById("gex-grid").hidden, refresh: !document.getElementById("gex-refresh").hidden, note: document.getElementById("gex-histnote").hidden ? "" : document.getElementById("gex-histnote").textContent,
  figs: [...document.querySelectorAll("#gex-read .v")].map((v) => v.textContent), regime: document.getElementById("gex-regime").textContent.slice(0, 40),
  canvas: (() => { const c = document.getElementById("gex-canvas"); return c ? c.width > 0 : false; })(),
}));
let st = await state(); note("live: " + JSON.stringify(st));
if (st.day !== "today" || st.prev || !st.next || !st.refresh || !st.grid) fails.push("live state wrong " + JSON.stringify(st));
await page.screenshot({ path: `${OUT}/1-live.png` });

await page.click("#gex-prev"); await page.waitForTimeout(1200);
st = await state(); note("archived: " + JSON.stringify(st));
if (!st.title.endsWith(" read") || st.title.startsWith("Today") || !st.picker || st.options.length !== 2 || !/^Viewing/.test(st.stamp) || st.refresh || !st.grid || !st.canvas || st.figs[2] !== "716.44") fails.push("archived day wrong " + JSON.stringify(st));
await page.screenshot({ path: `${OUT}/2-archived.png` });
await page.selectOption("#gex-time", "1000"); await page.waitForTimeout(1000);
st = await state(); note("earlier print: " + JSON.stringify({ stamp: st.stamp, spot: st.figs[2] }));
if (st.figs[2] !== "711.11" || !/10:00/.test(st.stamp)) fails.push("print picker did not reload " + JSON.stringify(st));

await page.click("#gex-prev"); await page.waitForTimeout(800);
st = await state(); note("trail: " + JSON.stringify(st));
if (st.grid || !st.note || st.figs[0] !== "−122M" || !/Negative gamma/.test(st.regime) || st.picker) fails.push("trail-only day wrong " + JSON.stringify(st));
await page.screenshot({ path: `${OUT}/3-trail.png` });
await page.click("#gex-prev"); await page.waitForTimeout(600);
st = await state();
if (st.figs[0] !== "+203M" || !st.prev) fails.push("oldest trail day wrong " + JSON.stringify(st));

await page.click("#gex-next"); await page.waitForTimeout(600);
await page.click("#gex-next"); await page.waitForTimeout(1000);
await page.click("#gex-next"); await page.waitForTimeout(1000);
st = await state(); note("back to today: " + JSON.stringify(st));
if (st.day !== "today" || !st.next || !st.refresh || !st.grid || st.note || !/^Updated/.test(st.stamp)) fails.push("did not return to live " + JSON.stringify(st));

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
