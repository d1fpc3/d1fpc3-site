// The Today home (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-today-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account, no GEX) on a phone and
// on desktop and checks: the tab reads "Today", the headline matches the ET
// session state (Open in / Live / Closed), the tape shows a price with PDH and
// PDL pills and a sparkline, the Context card is the locked hard sell for a
// member without GEX (blurred board, price line, Unlock button that opens the
// store), the calendar / announcement / room / lane / fresh-trades blocks
// render, the entrance animation is declared, the daily quote node and its
// settings toggle are gone, desktop lays the grid out in two columns, and no
// page errors fire. Set EMAIL to a GEX owner to see the live Context card.
// Screenshots in OUT. Needs SUPABASE_ACCESS_TOKEN (or ~/.supabase/access-token).
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"].find(existsSync);
const { chromium, devices } = require(LOCAL_PW ?? "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-today-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://localhost:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const tokenFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
if (!mgmt) throw new Error("SUPABASE_ACCESS_TOKEN missing");
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
process.on("exit", () => { if (fails.length) console.error("fails so far:\n - " + fails.join("\n - ")); });
const browser = await chromium.launch();
async function ctxFor(phone, theme = "dark") {
  const ctx = await browser.newContext(phone
    ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1380, height: 900 } });
  await ctx.addInitScript(([k, v, theme]) => {
    localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1");
    localStorage.setItem("echelon-splash-day", new Date().toLocaleDateString("en-CA"));
    localStorage.setItem("echelon-theme", theme);
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 25000 });
  // let the tape, gex, news and room land
  await page.waitForTimeout(4500);
  await page.addStyleTag({ content: ".toast, #toast { display: none !important }" });
  return { ctx, page };
}

async function checkToday(page, label) {
  const t = await page.evaluate(() => {
    const q = (id) => document.getElementById(id);
    const vis = (id) => { const n = q(id); return !!n && !n.hidden && n.offsetHeight > 0; };
    return {
      title: q("pane-title")?.textContent.trim(),
      h1: q("td-h1")?.textContent.trim(),
      sub: q("td-sub")?.textContent.trim(),
      tape: vis("td-tape"), last: q("td-last")?.textContent.trim(), pills: [...document.querySelectorAll("#td-lv span")].map((s) => s.textContent.trim()),
      spark: !!document.querySelector("#td-spark path.ln"),
      gex: vis("td-gex-sec"), locked: !!document.querySelector("#td-gex.locked"), lockPrice: document.querySelector("#td-gex .td-lock small")?.textContent.trim(),
      gexLevels: [...document.querySelectorAll("#td-gex .td-gx-levels .v")].map((s) => s.textContent.trim()),
      news: vis("td-news-sec"), newsRows: document.querySelectorAll("#td-news .row").length, newsEmpty: !!document.querySelector("#td-news .td-empty"),
      ann: vis("td-ann-sec"), annText: q("td-ann")?.textContent.trim().slice(0, 60),
      room: vis("td-room-sec"), roomText: q("td-room")?.textContent.trim().slice(0, 80),
      laneRows: document.querySelectorAll("#td-lane .row").length,
      fresh: vis("td-fresh-sec"), posts: document.querySelectorAll("#td-fresh .td-post").length,
      quote: !!q("quotemodal"), quoteToggle: !!q("set-quotes"),
      anim: getComputedStyle(q("td-h1")).animationName,
      gridCols: +getComputedStyle(document.querySelector(".td-grid")).columnCount || 1,
      overviewText: q("v-overview")?.textContent,
    };
  });
  console.log(label, JSON.stringify({ h1: t.h1, sub: t.sub, last: t.last, pills: t.pills, locked: t.locked, gexLevels: t.gexLevels, newsRows: t.newsRows, ann: t.ann, room: t.roomText, lane: t.laneRows, posts: t.posts }));
  if (t.title !== "Today") fails.push(`${label}: pane title is ${t.title}`);
  if (!/^(Open in .+\.|Live, .+ in\.|Reopens 6:00 PM\.|Opens Monday 9:30\.|Closed for .+\.)$/.test(t.h1)) fails.push(`${label}: headline not a session state: ${t.h1}`);
  if (!t.tape) fails.push(`${label}: tape hidden`);
  if (!/^\d{1,3}(,\d{3})*\.\d{2}$/.test(t.last)) fails.push(`${label}: last price not a price: ${t.last}`);
  if (!t.pills.some((p) => p.startsWith("PDH")) || !t.pills.some((p) => p.startsWith("PDL"))) fails.push(`${label}: PDH/PDL pills missing: ${t.pills}`);
  if (t.pills.some((p) => /VWAP/.test(p))) fails.push(`${label}: VWAP pill present`);
  if (!t.spark) fails.push(`${label}: sparkline missing`);
  if (!t.gex) fails.push(`${label}: context section hidden`);
  if (t.gexLevels.length !== 3 || t.gexLevels.some((v) => !/^\d{1,3}(,\d{3})*$/.test(v))) fails.push(`${label}: gex levels odd: ${t.gexLevels}`);
  // the hard sell: force the locked state through the QA hook and read the pitch
  const lock = await page.evaluate(() => { window.__TD.lock(true); const h = document.querySelector("#td-gex"); return { locked: h.classList.contains("locked"), price: h.querySelector(".td-lock small")?.textContent.trim(), btn: !!h.querySelector(".td-lock .btn"), blur: getComputedStyle(h.querySelector(".td-gx-body")).filter }; });
  if (!lock.locked || !lock.btn) fails.push(`${label}: locked hard sell did not render: ${JSON.stringify(lock)}`);
  if (!/\$35 a month, or \$147 once\./.test(lock.price || "")) fails.push(`${label}: lock price line: ${lock.price}`);
  if (!/blur/.test(lock.blur)) fails.push(`${label}: board not blurred behind the pitch`);
  await page.evaluate(() => document.getElementById("td-gex-sec").scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${OUT}/today-${label}-locked.png` });
  await page.evaluate(() => { window.__TD.lock(false); window.scrollTo(0, 0); });
  await page.waitForTimeout(300);
  t.locked = lock.locked;
  if (!t.news && !t.h1.startsWith("Opens Monday")) fails.push(`${label}: calendar section hidden on a trading day`);
  if (t.news && !t.newsRows && !t.newsEmpty) fails.push(`${label}: calendar empty without the empty line`);
  if (!t.ann) fails.push(`${label}: announcement card hidden`);
  if (!t.room || !/member/.test(t.roomText)) fails.push(`${label}: room card off: ${t.roomText}`);
  if (t.laneRows < 1) fails.push(`${label}: lane has no rows`);
  if (!t.fresh || t.posts < 1) fails.push(`${label}: fresh trades missing`);
  if (t.quote || t.quoteToggle) fails.push(`${label}: daily quote still in the DOM`);
  if (t.anim !== "td-in") fails.push(`${label}: entrance animation not applied: ${t.anim}`);
  if (/Welcome back|Recaps logged|Win rate|Net R/.test(t.overviewText)) fails.push(`${label}: old dashboard copy still present`);
  return t;
}

// ── phone ────────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(true);
  const t = await checkToday(page, "phone");
  if (t.gridCols !== 1) fails.push("phone grid not single column: " + t.gridCols);
  await page.screenshot({ path: `${OUT}/today-phone-fold.png` });
  await page.addStyleTag({ content: ".bnav{display:none}" });
  await page.screenshot({ path: `${OUT}/today-phone-full.png`, fullPage: true });
  // unlock button opens the store
  if (t.locked) {
    await page.evaluate(() => { window.__TD.lock(true); document.getElementById("td-gex-sec").scrollIntoView({ block: "center" }); });
    await page.waitForTimeout(200);
    await page.tap("#td-gex .td-lock .btn"); await page.waitForTimeout(600);
    if (await page.evaluate(() => document.querySelector(".view.on")?.id) !== "v-indicators") fails.push("unlock did not open the store");
    await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click()); await page.waitForTimeout(300);
  }
  // settings no longer offers the quote toggle
  await page.evaluate(() => document.querySelector('.tab[data-view="set-appearance"]').click()); await page.waitForTimeout(400);
  if (/Daily quote/.test(await page.textContent("#v-set-appearance"))) fails.push("Daily quote toggle still in Appearance");
  await ctx.close();
}
// ── phone, light ─────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(true, "light");
  await page.screenshot({ path: `${OUT}/today-phone-light.png` });
  await ctx.close();
}
// ── desktop ──────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(false);
  const t = await checkToday(page, "desktop");
  if (t.gridCols !== 2) fails.push("desktop grid not two columns: " + t.gridCols);
  await page.screenshot({ path: `${OUT}/today-desktop.png` });
  await page.screenshot({ path: `${OUT}/today-desktop-full.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
