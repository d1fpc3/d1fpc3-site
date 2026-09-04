// News tab week paging (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-news-weeks-visual.mjs        (APP_URL / OUT env)
// Signs in as the App Review account, opens News, and checks the ‹ › arrows:
// with the real archive (this week only) ‹ is disabled; then, with the
// worker's weeks.json / week fetches stubbed to include an older week, ‹
// loads it (label "Week of …", no Today header, no dimmed rows, big-three
// still gold), › returns to the live week. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-news-weeks`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://localhost:8080/echelon/app/";
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
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));

// stub the archive: this week + one older week with a sample NFP day
let stub = false;
const older = "2026-08-23", current = "2026-08-30";
await page.route(/forex-factory-discord\.frankiepc3\.workers\.dev\/(weeks\.json|calendar\.json\?week=.*)/, async (route) => {
  if (!stub) return route.continue();
  const u = route.request().url();
  if (u.endsWith("weeks.json")) return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ weeks: [older, current], current }) });
  if (u.includes(`week=${older}`)) return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([
    { title: "Non-Farm Employment Change", country: "USD", date: "2026-08-28T12:30:00Z", impact: "High", forecast: "75K", previous: "73K" },
    { title: "Unemployment Rate", country: "USD", date: "2026-08-28T12:30:00Z", impact: "High", forecast: "4.3%", previous: "4.2%" },
    { title: "ISM Manufacturing PMI", country: "USD", date: "2026-08-25T14:00:00Z", impact: "High", forecast: "49.1", previous: "48.0" },
    { title: "Some EUR thing", country: "EUR", date: "2026-08-25T09:00:00Z", impact: "High" },
  ]) });
  return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "no record" }) });
});

await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.evaluate(() => document.querySelector('.tab[data-view="news"]').click());
await page.waitForSelector("#news-list .news-row", { timeout: 20000 });
await page.waitForTimeout(800);
const live = await page.evaluate(() => ({ label: document.getElementById("news-week").textContent, prev: document.getElementById("news-prev").disabled, next: document.getElementById("news-next").disabled, rows: document.querySelectorAll("#news-list .news-row").length, today: !!document.querySelector("#news-list .news-day") }));
note("live (real archive): " + JSON.stringify(live));
if (live.label !== "this week" || !live.next || !live.rows) fails.push("live week state wrong " + JSON.stringify(live));
await page.locator("#v-news .block-head").screenshot({ path: `${OUT}/1-live-head.png` });

// now with the stubbed archive: reload the week index, page back, page forward
stub = true;
await page.evaluate(() => { const e = new Event("input"); return true; });
await page.evaluate(async () => { const r = await fetch("https://forex-factory-discord.frankiepc3.workers.dev/weeks.json", { cache: "no-cache" }); return r.ok; });
// re-run the app's own index load by toggling the tab (loadNews only calls it when weeks are empty); call the loader directly via a second fetch-based path:
await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click());
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.evaluate(() => document.querySelector('.tab[data-view="news"]').click());
await page.waitForSelector("#news-list .news-row", { timeout: 20000 });
await page.waitForFunction(() => !document.getElementById("news-prev").disabled, null, { timeout: 8000 }).catch(() => fails.push("‹ never enabled with an older week available"));
await page.click("#news-prev");
await page.waitForFunction(() => document.getElementById("news-week").textContent.startsWith("Week of"), null, { timeout: 8000 }).catch(() => fails.push("older week never loaded"));
await page.waitForTimeout(300);
const old = await page.evaluate(() => ({ label: document.getElementById("news-week").textContent, prev: document.getElementById("news-prev").disabled, next: document.getElementById("news-next").disabled, rows: document.querySelectorAll("#news-list .news-row").length, dimmed: document.querySelectorAll("#news-list .news-row.past").length, gold: document.querySelectorAll("#news-list .news-row.major").length, days: [...document.querySelectorAll("#news-list .news-day")].map((d) => d.textContent) }));
note("older week: " + JSON.stringify(old));
if (!/^Week of Aug 24 – Aug 28$/.test(old.label) && !/^Week of Aug 24 – 28$/.test(old.label)) fails.push("older week label unexpected: " + old.label);
if (old.rows !== 3 || old.dimmed !== 0 || old.gold !== 1 || !old.prev || old.next || old.days.includes("Today")) fails.push("older week render wrong " + JSON.stringify(old));
await page.screenshot({ path: `${OUT}/2-older-week.png` });
await page.click("#news-next");
await page.waitForTimeout(400);
const back = await page.evaluate(() => ({ label: document.getElementById("news-week").textContent, next: document.getElementById("news-next").disabled, rows: document.querySelectorAll("#news-list .news-row").length }));
note("back to live: " + JSON.stringify(back));
if (back.label !== "this week" || !back.next || !back.rows) fails.push("› did not return to the live week " + JSON.stringify(back));

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
