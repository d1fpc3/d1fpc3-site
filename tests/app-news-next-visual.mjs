// News tab next-week preview (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-news-next-visual.mjs        (APP_URL / OUT env)
// Forex Factory only publishes the current week; the worker's
// /calendar.json?week=next serves TradingView's calendar for the week after.
// Checks: (1) on a live week with a preview available › is enabled and opens
// "next week" (rows, note, no Today header, ‹ enabled, › disabled), ‹ returns
// to "this week"; (2) with the clock set to Saturday (this week all played
// out) the tab auto-advances to next week on load, and ‹ pins this week so
// the 5-minute poll does not bounce back. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-news-next`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const note = (s) => console.log("  " + s);
const WORKER = /forex-factory-discord\.frankiepc3\.workers\.dev\/(weeks\.json|calendar\.json.*)/;
const json = (body, status = 200) => ({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
// Fixed calendar so the run does not depend on the real week: live week Sun 8/30 – Sat 9/5, preview 9/6 – 9/12.
const CURRENT = "2026-08-30";
const LIVE = [
  { title: "ISM Manufacturing PMI", country: "USD", date: "2026-09-01T14:00:00Z", impact: "High", forecast: "55.2", previous: "55.6" },
  { title: "Non-Farm Employment Change", country: "USD", date: "2026-09-04T12:30:00Z", impact: "High", forecast: "55K", previous: "-23K" },
  { title: "Unemployment Rate", country: "USD", date: "2026-09-04T12:30:00Z", impact: "High", forecast: "4.1%", previous: "4.1%" },
];
const NEXT = [
  { title: "Labor Day", country: "USD", date: "2026-09-07T00:00:00.000Z", impact: "Holiday", forecast: "", previous: "", actual: "", source: "tradingview" },
  { title: "Initial Jobless Claims", country: "USD", date: "2026-09-10T12:30:00.000Z", impact: "Medium", forecast: "205K", previous: "206K", actual: "", source: "tradingview" },
  { title: "PPI MoM", country: "USD", date: "2026-09-10T12:30:00.000Z", impact: "High", forecast: "0.3%", previous: "0%", actual: "", source: "tradingview" },
  { title: "Inflation Rate MoM", country: "USD", date: "2026-09-11T12:30:00.000Z", impact: "High", forecast: "0.4%", previous: "0.1%", actual: "", source: "tradingview" },
  { title: "Michigan Consumer Sentiment Prel", country: "USD", date: "2026-09-11T14:00:00.000Z", impact: "High", forecast: "", previous: "51.7", actual: "", source: "tradingview" },
];
async function stubWorker(page, current = CURRENT, live = LIVE) {
  await page.route(WORKER, (route) => {
    const u = route.request().url();
    if (u.endsWith("weeks.json")) return route.fulfill(json({ weeks: [current], current }));
    if (u.includes("week=next")) return route.fulfill(json(current === CURRENT ? NEXT : []));
    if (u.includes("week=")) return route.fulfill(json({ error: "no record" }, 404));
    return route.fulfill(json(live));
  });
}
const state = (page) => page.evaluate(() => ({
  label: document.getElementById("news-week").textContent,
  prev: document.getElementById("news-prev").disabled,
  next: document.getElementById("news-next").disabled,
  rows: document.querySelectorAll("#news-list .news-row").length,
  gold: document.querySelectorAll("#news-list .news-row.major").length,
  dimmed: document.querySelectorAll("#news-list .news-row.past").length,
  note: !document.getElementById("news-note").hidden,
  days: [...document.querySelectorAll("#news-list .news-day")].map((d) => d.textContent),
}));

const browser = await chromium.launch();
async function open(clockAt, current = CURRENT, live = LIVE) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  if (clockAt) { await page.clock.install({ time: clockAt }); await page.clock.setFixedTime(clockAt); }
  await stubWorker(page, current, live);
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 25000 });
  await page.evaluate(() => document.querySelector('.tab[data-view="news"]').click());
  await page.waitForSelector("#news-list .news-row", { timeout: 20000 });
  await page.waitForTimeout(900);
  return { ctx, page };
}

// ── 1. mid-week (Wed 9/2 10:00 ET): live week stays, › opens the preview ──
{
  const { ctx, page } = await open(new Date("2026-09-02T14:00:00Z"));
  const live = await state(page); note("live: " + JSON.stringify(live));
  if (live.label !== "this week" || live.next || live.rows !== 3 || live.note) fails.push("live week state wrong " + JSON.stringify(live));
  await page.screenshot({ path: `${OUT}/1-live.png` });
  await page.click("#news-next");
  await page.waitForFunction(() => document.getElementById("news-week").textContent === "next week", null, { timeout: 5000 }).catch(() => fails.push("› did not open next week"));
  await page.waitForTimeout(300);
  const nx = await state(page); note("next: " + JSON.stringify(nx));
  if (nx.rows !== 5 || nx.gold !== 1 || nx.dimmed !== 0 || !nx.note || nx.prev || !nx.next || nx.days.includes("Today")) fails.push("next week render wrong " + JSON.stringify(nx));
  // Labor Day (Mon 9/7) comes from the built-in market calendar, on its own day, with the futures halt time
  const hol = await page.evaluate(() => { const r = document.querySelector("#news-list .news-row.hol"); return r ? { day: r.previousElementSibling?.textContent, text: r.textContent, when: r.querySelector(".news-when").textContent } : null; });
  note("holiday: " + JSON.stringify(hol));
  if (!hol || !/Monday, Sep 7/.test(hol.day) || !/Labor Day · markets closed/.test(hol.text) || !/1:00pm ET/.test(hol.text) || hol.when !== "All day") fails.push("Labor Day row wrong " + JSON.stringify(hol));
  await page.screenshot({ path: `${OUT}/2-next.png` });
  await page.click("#news-prev");
  await page.waitForTimeout(300);
  const back = await state(page); note("back: " + JSON.stringify(back));
  if (back.label !== "this week" || back.rows !== 3 || back.next || back.note) fails.push("‹ did not return to this week " + JSON.stringify(back));
  await ctx.close();
}

// ── 2. Saturday 9/5 11:00 ET: the week has played out, so it opens on next week ──
{
  const { ctx, page } = await open(new Date("2026-09-05T15:00:00Z"));
  await page.waitForFunction(() => document.getElementById("news-week").textContent === "next week", null, { timeout: 6000 }).catch(() => fails.push("did not auto-advance to next week on Saturday"));
  await page.waitForTimeout(300);
  const auto = await state(page); note("saturday: " + JSON.stringify(auto));
  if (auto.rows !== 5 || !auto.note || auto.prev) fails.push("auto next week wrong " + JSON.stringify(auto));
  await page.screenshot({ path: `${OUT}/3-saturday-auto.png` });
  await page.click("#news-prev");
  await page.waitForTimeout(300);
  // the 5-minute poll must not bounce back once the member chose this week
  await page.clock.runFor(5 * 60 * 1000 + 50);
  await page.waitForTimeout(1200);
  const pinned = await state(page); note("pinned: " + JSON.stringify(pinned));
  if (pinned.label !== "this week" || pinned.rows !== 3 || pinned.next) fails.push("this week did not stay pinned after a poll " + JSON.stringify(pinned));
  await ctx.close();
}

// ── 3. Thanksgiving week (Wed 11/25/26): closure Thursday, shortened Friday with the close time ──
{
  const { ctx, page } = await open(new Date("2026-11-25T15:00:00Z"), "2026-11-22", [
    { title: "Unemployment Claims", country: "USD", date: "2026-11-25T13:30:00Z", impact: "Medium", forecast: "215K", previous: "213K" },
    { title: "Bank Holiday", country: "USD", date: "2026-11-26T00:00:00-05:00", impact: "Holiday" },
  ]);
  const tg = await page.evaluate(() => [...document.querySelectorAll("#news-list .news-row.hol")].map((r) => ({ day: r.previousElementSibling?.classList.contains("news-day") ? r.previousElementSibling.textContent : "", when: r.querySelector(".news-when").textContent, text: r.querySelector(".news-title").textContent })));
  note("thanksgiving: " + JSON.stringify(tg));
  if (tg.length !== 2 || !/Thanksgiving · markets closed/.test(tg[0].text) || !/1:00pm ET/.test(tg[0].text) || tg[0].when !== "All day") fails.push("Thanksgiving row wrong " + JSON.stringify(tg));
  if (tg.length !== 2 || !/shortened day/.test(tg[1].text) || !/1:00pm ET/.test(tg[1].text) || !/1:15pm ET/.test(tg[1].text) || tg[1].when !== "1:00 PM") fails.push("day-after row wrong " + JSON.stringify(tg));
  if ((await page.locator("#news-list .news-row").count()) !== 3) fails.push("feed Bank Holiday row should be replaced by the calendar entry");
  await page.screenshot({ path: `${OUT}/4-thanksgiving.png` });
  await ctx.close();
}

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
