// Phone bottom nav + round-2/3 UI checks (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-phone-nav-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account, a plain member), then at
// 390x844: bottom nav present with Overview left / Profile right, tapping each
// slot switches the view, the library tab is visible, the chat rail dot has no
// glow, the settings sub-page back link is text-only, the store card reads
// "D1 LIT indicator" with no blurb, the Overview has no "The room" / "Pick up
// where you left off", and the library modal mounts the custom player (.vp)
// with its control bar. Also checks the desktop sidebar brand no longer says
// "Members" and the pull-to-refresh dial markup exists. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-phone-nav-shots`;
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

const fails = [];
const browser = await chromium.launch();
async function ctxFor(phone) {
  const ctx = await browser.newContext(phone
    ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`${r.status()} ${r.url()}`); });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 25000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const noOverflow = async (page, label) => {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (m.sw > m.iw) fails.push(`${label} overflow ${m.sw}/${m.iw}`);
};

// ── phone ───────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(true);
  const shot = (n) => page.screenshot({ path: `${OUT}/phone-${n}.png` });
  const view = async (v) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`).click(), v); await page.waitForTimeout(500); };

  // onboarding must not be up (this account completed it)
  if (!(await page.locator("#onb").isHidden())) fails.push("onboarding showing for a completed member");
  const nav = page.locator("#bnav");
  if (!(await nav.isVisible())) fails.push("bottom nav hidden on phone");
  const slots = await page.$$eval("#bnav button:not([hidden])", (bs) => bs.map((b) => b.dataset.view));
  if (slots[0] !== "overview") fails.push("first slot is not overview: " + slots);
  if (slots[slots.length - 1] !== "set-profile") fails.push("last slot is not profile: " + slots);
  if (!slots.includes("feed")) fails.push("feed slot missing: " + slots);
  const navBox = await nav.boundingBox();
  if (!navBox || navBox.y + navBox.height < 800) fails.push("bottom nav not at the bottom: " + JSON.stringify(navBox));
  if (await page.locator("#ptr .rf-arrows").count() !== 1) fails.push("ptr refresh glyph missing");
  // overview copy
  const ov = await page.textContent("#v-overview");
  if (/The room/.test(ov)) fails.push('"The room" still on Overview');
  if (/Pick up where you left off/.test(ov)) fails.push('"Pick up where you left off" still on Overview');
  await shot("01-overview"); await noOverflow(page, "overview");

  // tap through the slots
  for (const v of slots) {
    await page.click(`#bnav button[data-view="${v}"]`); await page.waitForTimeout(450);
    const on = await page.$eval(".view.on", (el) => el.id.replace(/^v-/, ""));
    if (on !== v) fails.push(`slot ${v} opened ${on}`);
    const lit = await page.$eval(`#bnav button[data-view="${v}"]`, (b) => b.classList.contains("on"));
    if (!lit) fails.push(`slot ${v} not marked active`);
  }
  // library: visible + custom player
  await view("library");
  if (await page.locator('.tab[data-view="library"]').isHidden()) fails.push("library tab hidden");
  await page.waitForTimeout(1200);
  await shot("02-library"); await noOverflow(page, "library");
  const cards = await page.locator("#lib-grid .lib-card, .lib-card").count();
  if (cards) {
    await page.locator(".lib-card").first().click();
    await page.waitForSelector("#lib-player .vp", { timeout: 8000 }).catch(() => fails.push("custom player did not mount"));
    await page.waitForTimeout(800);
    const bar = await page.locator("#lib-player .vp .vp-bar").count();
    if (!bar) fails.push("player control bar missing");
    const btns = await page.$$eval("#lib-player .vp .vp-row button:not([hidden])", (bs) => bs.map((b) => b.title));
    for (const t of ["Play", "Back 10 seconds", "Forward 10 seconds", "Playback speed", "Mute", "Fullscreen"]) if (!btns.includes(t)) fails.push("player button missing: " + t);
    await shot("03-player");
    await page.click("#lib-x"); await page.waitForTimeout(300);
  } else console.log("(no library videos to open)");

  // chat: unread dot has no glow
  await view("chat"); await page.waitForTimeout(1500);
  const glow = await page.evaluate(() => { const d = document.querySelector(".cr-item .unread-dot"); return d ? getComputedStyle(d).boxShadow : "none"; });
  if (glow !== "none") fails.push("unread dot still glows: " + glow);
  const navHidden = await page.evaluate(() => getComputedStyle(document.getElementById("bnav")).transform);
  await shot("04-chat");
  // open a conversation → nav slides away
  const first = page.locator(".cr-item").first();
  if (await first.count()) {
    await first.click(); await page.waitForTimeout(600);
    const t = await page.evaluate(() => getComputedStyle(document.getElementById("bnav")).transform);
    if (t === "none" || t === navHidden) fails.push("bottom nav still up inside a conversation");
    await shot("05-conversation");
  }

  // indicators: name only
  await view("indicators"); await page.waitForTimeout(600);
  const heads = await page.$$eval(".st-row h3", (hs) => hs.map((h) => h.textContent.trim()));
  if (!heads.some((h) => h === "D1 LIT indicator")) fails.push("LIT card title: " + heads.join(" | "));
  if (await page.locator(".st-blurb").count()) fails.push("store blurbs still rendered");
  await shot("06-indicators");

  // settings: no group headers; sub-page back is plain text; discord state
  await view("settings"); await page.waitForTimeout(400);
  if (/Your account|How you use Echelon/.test(await page.textContent("#v-settings"))) fails.push("settings group headers still present");
  await shot("07-settings");
  await view("set-account"); await page.waitForTimeout(400);
  const backBg = await page.evaluate(() => { const b = document.querySelector("#v-set-account .set-back"); const cs = getComputedStyle(b); return cs.backgroundColor + " / " + cs.borderTopWidth; });
  if (!/rgba\(0, 0, 0, 0\) \/ 0px/.test(backBg)) fails.push("back link still a button: " + backBg);
  const delHint = await page.textContent("#v-set-account");
  if (/For good\./.test(delHint)) fails.push('"For good." still present');
  await shot("08-account");
  await view("set-discord"); await page.waitForTimeout(600);
  await shot("09-discord");
  await ctx.close();
}

// ── desktop ─────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(false);
  const brand = await page.textContent(".side-brand");
  if (/Members/.test(brand)) fails.push('sidebar brand still says "Members"');
  if (await page.locator("#bnav").isVisible()) fails.push("bottom nav visible on desktop");
  await page.hover(".side"); await page.waitForTimeout(400);
  await page.click("#u-name"); await page.waitForTimeout(500);
  if (!(await page.evaluate(() => document.getElementById("mm-scrim").classList.contains("on")))) fails.push("clicking your name did not open the profile card");
  await page.screenshot({ path: `${OUT}/desk-01-profile.png` });
  await ctx.close();
}

await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
