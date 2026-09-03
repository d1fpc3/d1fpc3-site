// Daily splash intro frames (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-splash-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account) with the splash-day key
// cleared so the intro plays, holds the splash open by pinning __splashT0 into
// the future, then pauses every animation and steps it to fixed times to
// capture frames: black, the E arriving, the blade mid-cut, the cut landed,
// the name rising, the finished lockup. Then on desktop: the fade must not
// start before the intro lands (measured against the page's own stamp), and
// a same-day reopen must have no splash at all. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-splash-shots`;
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
const note = (s) => console.log("  " + s);
const settled = (tf) => tf === "none" || tf === "matrix(1, 0, 0, 1, 0, 0)";   // a held final frame reports the identity matrix
const browser = await chromium.launch();

async function open(phone, { hold, sameDay }) {
  const ctx = await browser.newContext(phone
    ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([k, v, hold, sameDay]) => {
    localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1");
    if (sameDay) localStorage.setItem("echelon-splash-day", new Date().toDateString()); else localStorage.removeItem("echelon-splash-day");
    // keep the splash up: hideSplash waits on __splashT0, so pin it into the future
    if (hold) Object.defineProperty(window, "__splashT0", { get: () => performance.now() + 1e6, set() {} });
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), hold, sameDay]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

// ── intro frames on the phone ──
{
  const { ctx, page } = await open(true, { hold: true });
  await page.waitForSelector("#splash .sp-e", { timeout: 10000 });
  const anims = await page.evaluate(() => { const a = document.getAnimations(); a.forEach((x) => x.pause()); return a.length; });
  note(`animations on the splash: ${anims}`);
  if (anims < 10) fails.push(`expected the E, slash, blade and 7 letters animating; got ${anims}`);
  const at = async (t, name) => {
    await page.evaluate((t) => document.getAnimations().forEach((a) => { a.currentTime = t; }), t);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${OUT}/phone-${name}.png` });
    return page.evaluate(() => {
      const cs = (sel) => { const e = document.querySelector(sel); const s = getComputedStyle(e); return { op: +s.opacity, tf: s.transform }; };
      return { e: cs("#splash .sp-e"), slash: cs("#splash .sp-slash"), blade: cs("#splash .sp-blade"), l0: cs('#splash .sp-l[style*="--i:0"]'), l6: cs('#splash .sp-l[style*="--i:6"]') };
    });
  };
  const f0 = await at(0, "0-black");
  if (f0.e.op > 0.01 || f0.l0.op > 0.01) fails.push("t=0: something is already visible");
  const f1 = await at(420, "1-e-arrives");
  if (!(f1.e.op > 0.5)) fails.push("t=420: E not arriving");
  const f2 = await at(760, "2-blade-mid-cut");
  if (!(f2.blade.op > 0.5)) fails.push("t=760: blade not visible mid-cut");
  const f3 = await at(1010, "3-cut-landed");
  if (f3.blade.op > 0.05 || !settled(f3.slash.tf)) fails.push("t=1010: cut not landed (" + JSON.stringify(f3.slash) + JSON.stringify(f3.blade) + ")");
  const f4 = await at(1100, "4-name-rising");
  if (!(f4.l0.op > 0.3 && f4.l6.op < f4.l0.op)) fails.push("t=1100: letters not rising in order (" + JSON.stringify([f4.l0, f4.l6]) + ")");
  const f5 = await at(1700, "5-lockup");
  if (!(f5.e.op === 1 && f5.l6.op === 1 && f5.blade.op <= 0.01 && settled(f5.e.tf) && settled(f5.l6.tf))) fails.push("t=1700: lockup not settled " + JSON.stringify(f5));
  const box = await page.evaluate(() => { const r = document.querySelector("#splash .lockup").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), vw: innerWidth, vh: innerHeight, bg: getComputedStyle(document.getElementById("splash")).backgroundColor }; });
  note("lockup box: " + JSON.stringify(box));
  if (Math.abs(box.cx - box.vw / 2) > 2 || Math.abs(box.cy - box.vh / 2) > 40) fails.push("lockup not centred");
  await ctx.close();
}

// ── desktop: the fade waits for the intro, then the node goes ──
{
  const { ctx, page } = await open(false, { hold: false });
  await page.waitForSelector("#splash .sp-e", { timeout: 10000 });
  await page.waitForFunction(() => { const s = document.getElementById("splash"); return !s || s.classList.contains("off"); }, null, { timeout: 15000 }).catch(() => fails.push("desktop: splash never dismissed"));
  const shown = await page.evaluate(() => Math.round(performance.now() - window.__splashT0));
  note(`desktop: fade began ${shown}ms after the splash's own stamp`);
  if (shown < 1690) fails.push(`desktop: splash faded before the intro landed (${shown}ms)`);
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/desk-6-exit-mid.png` });
  await page.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 5000 }).catch(() => fails.push("desktop: splash node not removed"));
  await page.waitForSelector("#ov-hi", { timeout: 25000 });
  await ctx.close();
}

// ── same day again: no splash at all ──
{
  const { ctx, page } = await open(true, { hold: false, sameDay: true });
  const has = await page.evaluate(() => !!document.getElementById("splash"));
  note("same-day reopen has splash: " + has);
  if (has) fails.push("same-day reopen still shows the splash");
  await ctx.close();
}

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
