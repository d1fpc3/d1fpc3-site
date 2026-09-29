// Phone dock + Today's chips (manual, not a node:test). Was the drawer harness until phones lost the drawer (09-27).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-drawer-spring-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account) at 390x844 and checks:
// the tab-bar pill sits under the lit slot and follows every tap; there is no
// hamburger and the old drawer stays shut; Today's chips reach every page the
// dock has no slot for (Chart, News, Journal, Indicators, Prop firms, GEX when
// owned) and a chip opens its page; the bar leaves the screen inside a chat
// conversation; light theme shots; the desk sidebar stays open with labels.
// Needs SUPABASE_ACCESS_TOKEN (or ~/.supabase/access-token) for the magic link.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"].find(existsSync);
const { chromium, devices } = require(LOCAL_PW ?? "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-drawer-spring-shots`;
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
    : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(([k, v, theme]) => {
    localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1");
    localStorage.setItem("echelon-splash-day", new Date().toLocaleDateString("en-CA"));
    localStorage.setItem("echelon-theme", theme);
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 25000 });
  await page.waitForTimeout(1500);
  // hide toasts / tour pill so shots are clean
  await page.addStyleTag({ content: ".toast, #toast, .nu-pill, .nextup { display: none !important }" });
  return { ctx, page };
}
const sideX = (page) => page.evaluate(() => { const m = new DOMMatrix(getComputedStyle(document.querySelector(".side")).transform); return m.m41; });
const scrimA = (page) => page.evaluate(() => +getComputedStyle(document.getElementById("scrim")).opacity);

// ── phone, dark ────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(true);
  const shot = (n) => page.screenshot({ path: `${OUT}/after-${n}.png` });
  await shot("01-overview");

  // pill sits under the lit slot
  const pill = await page.evaluate(() => { const i = document.querySelector(".bnav-ind"); const b = document.querySelector("#bnav button.on"); return { live: i.classList.contains("live"), ix: i.getBoundingClientRect().x, bx: b.getBoundingClientRect().x, iw: i.getBoundingClientRect().width, bw: b.getBoundingClientRect().width }; });
  if (!pill.live) fails.push("pill not live");
  if (Math.abs((pill.ix + pill.iw / 2) - (pill.bx + pill.bw / 2)) > 2) fails.push("pill not centred under overview: " + JSON.stringify(pill));

  // no hamburger: the dock and Today's chips are the navigation, and the old drawer stays shut
  if (await page.locator("#menu-btn").isVisible()) fails.push("hamburger visible on a phone");
  const shut = await sideX(page), w = await page.evaluate(() => document.querySelector(".side").getBoundingClientRect().width);
  if (shut > -w + 1) fails.push("the drawer is not shut: " + shut);
  const chips = await page.$$eval("#td-chips .td-chip", (cs) => cs.map((c) => c.dataset.view));
  for (const v of ["chart", "news", "journal", "indicators", "propfirms"]) if (!chips.includes(v)) fails.push("Today has no chip for " + v + ": " + chips);
  await shot("02-today-chips");
  await page.tap('#td-chips .td-chip[data-view="journal"]'); await page.waitForTimeout(700);
  if (await page.$eval(".view.on", (v) => v.id) !== "v-journal") fails.push("the Journal chip did not open the journal");
  await shot("03-journal-from-chip");
  await page.tap('#bnav button[data-view="overview"]'); await page.waitForTimeout(600);
  await page.tap('#td-chips .td-chip[data-view="indicators"]'); await page.waitForTimeout(700);
  if (await page.$eval(".view.on", (v) => v.id) !== "v-indicators") fails.push("the Indicators chip did not open Indicators");

  // pill slides across the bar
  for (const v of ["feed", "course", "chat", "set-profile"]) {
    await page.tap(`#bnav button[data-view="${v}"]`); await page.waitForTimeout(600);
    const p = await page.evaluate((v) => { const i = document.querySelector(".bnav-ind").getBoundingClientRect(); const b = document.querySelector(`#bnav button[data-view="${v}"]`).getBoundingClientRect(); return Math.abs((i.x + i.width / 2) - (b.x + b.width / 2)); }, v);
    if (p > 2) fails.push(`pill off-centre on ${v}: ${p}`);
  }
  await page.tap('#bnav button[data-view="course"]'); await page.waitForTimeout(220); await shot("07-pill-sliding");
  await page.waitForTimeout(500); await shot("08-study");
  // settings: press state on a row
  await page.evaluate(() => document.querySelector('.tab[data-view="settings"]').click()); await page.waitForTimeout(600);
  await shot("09-settings");
  // chat conversation hides the bar off-screen
  await page.tap('#bnav button[data-view="chat"]'); await page.waitForTimeout(1800);
  const first = page.locator(".cr-item").first();
  if (await first.count()) {
    await first.tap(); await page.waitForTimeout(700);
    const y = await page.evaluate(() => document.getElementById("bnav").getBoundingClientRect().y);
    if (y < 844) fails.push("tab bar still on screen inside a conversation: " + y);
    await shot("10-conversation");
  }
  await ctx.close();
}

// ── phone, light ───────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(true, "light");
  await page.screenshot({ path: `${OUT}/after-11-light-overview.png` });
  await page.evaluate(() => document.getElementById("td-chips").scrollIntoView({ block: "center" })); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/after-12-light-chips.png` });
  await ctx.close();
}

// ── desktop: rail unchanged ────────────────────────────────────
{
  const { ctx, page } = await ctxFor(false);
  const t = await page.evaluate(() => document.querySelector(".side").style.transform);
  if (t) fails.push("desktop .side has an inline transform: " + t);
  if (await page.locator("#bnav").isVisible()) fails.push("bottom nav visible on desktop");
  // the desk sidebar is always open with labels since 09-22 (it used to be a hover rail)
  const side = await page.evaluate(() => { const sd = document.querySelector(".side"); return { open: sd.classList.contains("open"), w: sd.getBoundingClientRect().width, label: getComputedStyle(document.querySelector('.side-nav .tab[data-view="chart"]')).display !== "none" }; });
  if (!side.open || side.w < 200 || !side.label) fails.push("desktop sidebar is not the open, labelled one: " + JSON.stringify(side));
  await page.mouse.move(700, 400); await page.waitForTimeout(400);
  if (!(await page.evaluate(() => document.querySelector(".side").classList.contains("open")))) fails.push("desktop sidebar folded when the mouse left");
  await page.screenshot({ path: `${OUT}/after-13-desktop-sidebar.png` });
  await ctx.close();
}

await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
