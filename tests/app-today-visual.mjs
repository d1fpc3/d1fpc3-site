// The Today home (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-today-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account) on a phone and on desktop
// and checks: the tab reads "Today", the headline matches the ET session state
// (Open in / Live / Reopens / Opens Monday / Closed for), the Context card shows
// the regime pill, three levels and an "Updated" stamp, refetches gex.json when
// the briefing refreshes (the gamma must never read stale), and becomes the
// locked hard sell (blurred board, price line, Unlock -> store) when forced
// through the QA hook; the calendar, announcement and community cards render;
// nothing on the home says "room"; the old tape / lane / fresh-trades blocks
// and the daily quote are gone; desktop lays the cards out in two columns; no
// page errors. Screenshots in OUT. Needs SUPABASE_ACCESS_TOKEN (or
// ~/.supabase/access-token) for the magic link.
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
      gex: vis("td-gex-sec"), pill: document.querySelector("#td-gex .td-pill")?.textContent.trim(),
      gexLevels: [...document.querySelectorAll("#td-gex .td-gx-levels .v")].map((s) => s.textContent.trim()),
      stamp: document.querySelector("#td-gex .td-gx-stamp")?.textContent.trim(),
      news: vis("td-news-sec"), newsRows: document.querySelectorAll("#td-news .row").length, newsEmpty: !!document.querySelector("#td-news .td-empty"),
      ann: vis("td-ann-sec"),
      community: vis("td-room-sec"), communityLabel: document.querySelector("#td-room-sec .label")?.textContent.trim(), communityText: q("td-room")?.textContent.trim().slice(0, 80),
      gone: ["td-tape", "td-lv", "td-lane-sec", "td-fresh-sec", "quotemodal", "set-quotes"].filter((id) => !!q(id)),
      anim: (() => { for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) if (r.selectorText === "#v-overview.on.fresh .td-in") return "td-in"; } catch {} } return "none"; })(),
      gridCols: +getComputedStyle(document.querySelector(".td-grid")).columnCount || 1,
      overviewText: q("v-overview")?.textContent,
    };
  });
  console.log(label, JSON.stringify({ h1: t.h1, sub: t.sub, pill: t.pill, gexLevels: t.gexLevels, stamp: t.stamp, newsRows: t.newsRows, ann: t.ann, community: t.communityText }));
  if (t.title !== "Today") fails.push(`${label}: pane title is ${t.title}`);
  if (!/^(Open in .+\.|Live, .+ in\.|Reopens 6:00 PM\.|Opens Monday 9:30\.|Closed for .+\.)$/.test(t.h1)) fails.push(`${label}: headline not a session state: ${t.h1}`);
  if (!t.gex) fails.push(`${label}: context section hidden`);
  if (!/(NEGATIVE|POSITIVE|MIXED) GAMMA/.test(t.pill || "")) fails.push(`${label}: regime pill: ${t.pill}`);
  if (t.gexLevels.length < 2 || t.gexLevels.length > 3 || t.gexLevels.some((v) => !/^\d{1,3}(,\d{3})*$/.test(v))) fails.push(`${label}: gex levels odd: ${t.gexLevels}`);
  if (!/^Updated \d{1,2}:\d{2}/.test(t.stamp || "")) fails.push(`${label}: no updated stamp on the gamma card: ${t.stamp}`);
  if (!t.news && !t.h1.startsWith("Opens Monday")) fails.push(`${label}: calendar section hidden on a trading day`);
  if (t.news && !t.newsRows && !t.newsEmpty) fails.push(`${label}: calendar empty without the empty line`);
  if (!t.ann) fails.push(`${label}: announcement card hidden`);
  if (!t.community || t.communityLabel !== "Community" || !/member/.test(t.communityText)) fails.push(`${label}: community card off: ${t.communityLabel} / ${t.communityText}`);
  if (/\broom\b/i.test(t.overviewText)) fails.push(`${label}: the home says "room"`);
  if (t.gone.length) fails.push(`${label}: removed blocks still in the DOM: ${t.gone}`);
  if (t.anim !== "td-in") fails.push(`${label}: entrance animation not applied: ${t.anim}`);
  if (/Welcome back|Recaps logged|Win rate|Net R|PDH|Fresh trades|Your lane/.test(t.overviewText)) fails.push(`${label}: old copy still present`);

  // the gamma refetches when the briefing refreshes
  const req = page.waitForRequest((r) => /gex\.json/.test(r.url()), { timeout: 5000 }).then(() => true).catch(() => false);
  await page.evaluate(() => window.__TD.refresh());
  if (!(await req)) fails.push(`${label}: refresh did not refetch gex.json`);

  // the hard sell: force the locked state through the QA hook and read the pitch
  const lock = await page.evaluate(() => { window.__TD.lock(true); const h = document.querySelector("#td-gex"); return { locked: h.classList.contains("locked"), price: h.querySelector(".td-lock small")?.textContent.trim(), btn: !!h.querySelector(".td-lock .btn"), blur: getComputedStyle(h.querySelector(".td-gx-body")).filter }; });
  if (!lock.locked || !lock.btn) fails.push(`${label}: locked hard sell did not render: ${JSON.stringify(lock)}`);
  if (!/\$35 a month, or \$147 once\./.test(lock.price || "")) fails.push(`${label}: lock price line: ${lock.price}`);
  if (!/blur/.test(lock.blur)) fails.push(`${label}: board not blurred behind the pitch`);
  await page.evaluate(() => document.getElementById("td-gex-sec").scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${OUT}/today-${label}-locked.png` });
  await page.evaluate(() => { window.__TD.lock(false); window.scrollTo(0, 0); });
  await page.waitForTimeout(300);
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
  await page.evaluate(() => { window.__TD.lock(true); document.getElementById("td-gex-sec").scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(200);
  await page.tap("#td-gex .td-lock .btn"); await page.waitForTimeout(600);
  if (await page.evaluate(() => document.querySelector(".view.on")?.id) !== "v-indicators") fails.push("unlock did not open the store");
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

  // no lag on a reload: the snapshot paints every block in the same frame as the headline
  await page.reload({ waitUntil: "domcontentloaded" });
  const lag = await page.evaluate(() => new Promise((resolve) => {
    let ids = ["td-gex-sec", "td-news-sec", "td-ann-sec", "td-room-sec"];
    const vis = (id) => { const n = document.getElementById(id); return !!n && !n.hidden && n.offsetHeight > 0; };
    let t0 = 0, weekend = false; const seen = {};
    const tick = () => {
      const h1 = document.getElementById("td-h1");
      if (h1 && h1.offsetHeight > 0 && !/Welcome back/.test(h1.textContent) && !t0) { t0 = performance.now(); weekend = /Opens Monday/.test(h1.textContent); if (weekend) ids = ids.filter((i) => i !== "td-news-sec"); }
      if (t0) for (const id of ids) if (!(id in seen) && vis(id)) seen[id] = Math.round(performance.now() - t0);
      if (t0 && Object.keys(seen).length === ids.length) return resolve({ seen, weekend });
      if (performance.now() > 30000) return resolve({ seen, weekend, timeout: true });
      requestAnimationFrame(tick);
    };
    tick();
  }));
  console.log("reload lag (ms after the headline):", JSON.stringify(lag));
  for (const id of ["td-gex-sec", "td-ann-sec", "td-room-sec"]) if (!(id in lag.seen)) fails.push(`reload: ${id} never appeared`); else if (lag.seen[id] > 250) fails.push(`reload: ${id} landed ${lag.seen[id]}ms after the headline (snapshot should paint it at once)`);
  if (!lag.weekend && !("td-news-sec" in lag.seen)) fails.push("reload: calendar never appeared");
  // the entrance stagger runs on the first open only
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('.tab[data-view="settings"]').click()); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click()); await page.waitForTimeout(100);
  const again = await page.evaluate(() => ({ fresh: document.getElementById("v-overview").classList.contains("fresh"), anim: getComputedStyle(document.getElementById("td-h1")).animationName }));
  if (again.fresh || again.anim === "td-in") fails.push("entrance stagger re-ran on a second open: " + JSON.stringify(again));
  await ctx.close();
}

await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
