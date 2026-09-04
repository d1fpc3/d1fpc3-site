// News tab "?" help popovers (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-news-help-visual.mjs        (APP_URL / OUT env)
// Every news row carries a circled ? beside the title. Desktop: hovering it
// shows the what-it-is / what-it-means popover, leaving hides it. Phone:
// tapping toggles it, tapping elsewhere closes it, and the popover stays
// inside the viewport. Checks the glossary matches the big prints by name.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-news-help`;
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
const json = (body, status = 200) => ({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
const LIVE = [
  { title: "ISM Manufacturing PMI", country: "USD", date: "2026-09-01T14:00:00Z", impact: "High", forecast: "55.2", previous: "55.6" },
  { title: "ADP Non-Farm Employment Change", country: "USD", date: "2026-09-02T12:15:00Z", impact: "Medium", forecast: "47K", previous: "44K" },
  { title: "Unemployment Claims", country: "USD", date: "2026-09-03T12:30:00Z", impact: "Medium", forecast: "205K", previous: "203K" },
  { title: "Non-Farm Employment Change", country: "USD", date: "2026-09-04T12:30:00Z", impact: "High", forecast: "55K", previous: "-23K" },
  { title: "Unemployment Rate", country: "USD", date: "2026-09-04T12:30:00Z", impact: "High", forecast: "4.1%", previous: "4.1%" },
  { title: "Some Brand New Release", country: "USD", date: "2026-09-04T14:00:00Z", impact: "Medium", forecast: "", previous: "1.0" },
];
const tipState = (page) => page.evaluate(() => {
  const t = document.getElementById("news-tip"); const r = t.getBoundingClientRect();
  return { hidden: t.hidden, name: t.querySelector("b")?.textContent, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, on: document.querySelectorAll(".news-q.on").length, text: t.textContent.length };
});

const browser = await chromium.launch();
async function open(vp) {
  const ctx = await browser.newContext(vp);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await page.clock.install({ time: new Date("2026-09-02T14:00:00Z") }); await page.clock.setFixedTime(new Date("2026-09-02T14:00:00Z"));
  await page.route(/forex-factory-discord\.frankiepc3\.workers\.dev\/(weeks\.json|calendar\.json.*)/, (route) => {
    const u = route.request().url();
    if (u.endsWith("weeks.json")) return route.fulfill(json({ weeks: ["2026-08-30"], current: "2026-08-30" }));
    if (u.includes("week=")) return route.fulfill(json({ error: "no record" }, 404));
    return route.fulfill(json(LIVE));
  });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 25000 });
  await page.evaluate(() => document.querySelector('.tab[data-view="news"]').click());
  await page.waitForSelector("#news-list .news-row", { timeout: 20000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

// ── desktop: hover ──
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 800 } });
  const qs = await page.locator("#news-list .news-q").count();
  if (qs !== LIVE.length) fails.push(`expected ${LIVE.length} ? buttons, got ${qs}`);
  const names = [];
  for (let i = 0; i < qs; i++) {
    await page.locator("#news-list .news-q").nth(i).hover();
    await page.waitForTimeout(150);
    const st = await tipState(page); names.push(st.name);
    if (st.hidden || !st.inside || st.on !== 1) fails.push(`hover ${i} wrong ` + JSON.stringify(st));
    if (i === 3) await page.screenshot({ path: `${OUT}/1-desktop-hover-nfp.png` });
  }
  note("desktop names: " + names.join(" | "));
  const want = ["ISM PMI", "ADP employment", "Jobless claims", "Non-farm payrolls", "Unemployment rate", "Scheduled release"];
  want.forEach((w, i) => { if (names[i] !== w) fails.push(`row ${i} glossary ${names[i]} != ${w}`); });
  await page.mouse.move(5, 5); await page.waitForTimeout(150);
  const gone = await tipState(page);
  if (!gone.hidden || gone.on) fails.push("popover did not hide on mouse leave " + JSON.stringify(gone));
  await ctx.close();
}

// ── phone: tap ──
{
  const { ctx, page } = await open({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const q = page.locator("#news-list .news-q").nth(3);
  await q.tap(); await page.waitForTimeout(200);
  const st = await tipState(page); note("phone tap: " + JSON.stringify(st));
  if (st.hidden || !st.inside || st.name !== "Non-farm payrolls") fails.push("phone tap wrong " + JSON.stringify(st));
  await page.screenshot({ path: `${OUT}/2-phone-tap-nfp.png` });
  await q.tap(); await page.waitForTimeout(200);
  if (!(await tipState(page)).hidden) fails.push("second tap did not close");
  await page.locator("#news-list .news-q").nth(0).tap(); await page.waitForTimeout(200);
  await page.tap("#news-list .news-day >> nth=0"); await page.waitForTimeout(200);
  if (!(await tipState(page)).hidden) fails.push("tap elsewhere did not close");
  await ctx.close();
}

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
