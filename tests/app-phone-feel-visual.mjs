// Phone app-feel pass (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-phone-feel-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account) at 390x844 and checks:
// scroll position survives a tab round-trip (Study -> Overview -> Study),
// a settings sub-page pops on an edge swipe (view returns to Settings with
// the .back slide) and a short edge drag settles back, the next-up pill sits
// above the tab bar instead of over the title, the promo chips are docked
// inside the Overview on phones (and back in the body on desktop), the
// overlay enter animations + button press rules exist, a pull-down on the
// comments sheet dismisses it, and with a stubbed Capacitor Haptics plugin a
// tab-bar tap fires a light impact. Screenshots in OUT.
// Needs SUPABASE_ACCESS_TOKEN (or ~/.supabase/access-token) for the magic link.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"].find(existsSync);
const { chromium, devices } = require(LOCAL_PW ?? "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-phone-feel-shots`;
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
async function ctxFor(phone, extraInit) {
  const ctx = await browser.newContext(phone
    ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(([k, v]) => {
    localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1");
    localStorage.setItem("echelon-splash-day", new Date().toLocaleDateString("en-CA"));
  }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  if (extraInit) await ctx.addInitScript(extraInit);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 25000 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: ".toast, #toast { display: none !important }" });
  return { ctx, page };
}
const view = (page, v) => page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`).click(), v);
const onView = (page) => page.evaluate(() => document.querySelector(".view.on")?.id);
const pts = (x, y) => [{ x, y, radiusX: 3, radiusY: 3, force: 1, id: 1 }];
async function swipe(cdp, page, from, to, steps, ms) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(from[0], from[1]) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps) });
    await page.waitForTimeout(ms);
  }
}
const lift = (cdp) => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

// ── phone ────────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(true);
  const cdp = await ctx.newCDPSession(page);
  const shot = (n) => page.screenshot({ path: `${OUT}/feel-${n}.png` });

  // CSS rules landed
  const rules = await page.evaluate(() => {
    const all = []; for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) all.push(r.cssText); } catch {} }
    return { ga: all.some((t) => t.startsWith(".ga-scrim.on .gex-about")), btn: all.some((t) => t.startsWith(".btn:active:not(:disabled)")), back: all.some((t) => t.startsWith(".view.on.back")) };
  });
  for (const [k, v] of Object.entries(rules)) if (!v) fails.push(`css rule missing: ${k}`);

  // next-up pill above the tab bar (only if this account still has steps)
  const nu = await page.evaluate(() => { const n = document.getElementById("nextup"); if (!n || n.hidden) return null; const r = n.getBoundingClientRect(), b = document.getElementById("bnav").getBoundingClientRect(); return { top: r.top, bottom: r.bottom, barTop: b.top }; });
  if (nu) { if (nu.top < 500 || nu.bottom > nu.barTop) fails.push("next-up pill not docked above the tab bar: " + JSON.stringify(nu)); }
  else console.log("(next-up pill hidden for this account)");

  // promo chips docked in the Overview
  const promoParent = await page.evaluate(() => document.getElementById("promostack")?.parentNode?.id);
  if (promoParent !== "v-overview") fails.push("promo stack not docked in the Overview: " + promoParent);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(400);
  await shot("01-overview-foot");

  // scroll restore across a tab round-trip (the Overview is sitting at its foot from the shot above)
  const ovY = await page.evaluate(() => scrollY);
  await view(page, "course"); await page.waitForTimeout(900);
  const canScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const target = Math.min(500, canScroll - 40);
  if (canScroll > 200) {
    await page.evaluate((t) => window.scrollTo(0, t), target); await page.waitForTimeout(150);
    await page.tap('#bnav button[data-view="overview"]'); await page.waitForTimeout(500);
    const back = await page.evaluate(() => scrollY);
    if (Math.abs(back - ovY) > 4) fails.push("overview did not resume its own offset: " + back + " vs " + ovY);
    await page.tap('#bnav button[data-view="course"]'); await page.waitForTimeout(500);
    const y = await page.evaluate(() => scrollY);
    if (Math.abs(y - target) > 4) fails.push("study scroll not restored: " + y + " vs " + target);
  } else console.log("(study view too short to test scroll restore: " + canScroll + ")");

  // settings sub-page: push, then edge-swipe pop
  await view(page, "settings"); await page.waitForTimeout(500);
  await view(page, "set-account"); await page.waitForTimeout(600);
  if (await onView(page) !== "v-set-account") fails.push("account page did not open");
  // a short drag settles back
  await swipe(cdp, page, [6, 420], [70, 420], 5, 30); await lift(cdp); await page.waitForTimeout(500);
  if (await onView(page) !== "v-set-account") fails.push("short edge drag popped the page");
  const tf = await page.evaluate(() => document.getElementById("v-set-account").style.transform);
  if (tf) fails.push("transform left on the page after settling: " + tf);
  // a real swipe pops
  await swipe(cdp, page, [6, 420], [150, 420], 6, 30);
  await shot("02-edge-swipe-mid");
  await swipe(cdp, page, [150, 420], [280, 420], 4, 30); await lift(cdp); await page.waitForTimeout(700);
  if (await onView(page) !== "v-settings") fails.push("edge swipe did not pop to settings: " + await onView(page));
  if (!(await page.evaluate(() => document.getElementById("v-settings").classList.contains("back")))) fails.push("settings did not get the .back pop slide");
  await shot("03-settings-after-pop");
  // and a push (settings -> profile) must not carry .back
  await view(page, "set-profile"); await page.waitForTimeout(400);
  await view(page, "settings"); await page.waitForTimeout(100);
  if (!(await page.evaluate(() => document.getElementById("v-settings").classList.contains("back")))) fails.push("back from profile via link did not slide");
  await view(page, "overview"); await page.waitForTimeout(200);
  await view(page, "settings"); await page.waitForTimeout(100);
  if (await page.evaluate(() => document.getElementById("v-settings").classList.contains("back"))) fails.push("settings from overview wrongly marked .back");

  // comments sheet: open one from the feed, pull it down
  await page.tap('#bnav button[data-view="feed"]'); await page.waitForTimeout(2500);
  const cmBtn = page.locator('.rv-act button[title="Comment"]').first();
  if (await cmBtn.count()) {
    await cmBtn.scrollIntoViewIfNeeded();
    await cmBtn.tap(); await page.waitForTimeout(900);
    const box = await page.evaluate(() => { const b = document.querySelector("#cmsheet .cm-box"); if (!b) return null; const r = b.getBoundingClientRect(); return { top: r.top, h: r.height }; });
    if (!box) fails.push("comments sheet did not open");
    else {
      const y0 = box.top + 14;
      await swipe(cdp, page, [195, y0], [195, y0 + 40], 4, 30); await lift(cdp); await page.waitForTimeout(500);
      if (await page.evaluate(() => document.getElementById("cmsheet").hidden)) fails.push("short pull closed the comments sheet");
      await swipe(cdp, page, [195, y0], [195, y0 + 160], 6, 25);
      await shot("04-sheet-pull-mid");
      const mid = await page.evaluate(() => document.querySelector("#cmsheet .cm-box").style.transform);
      if (!/translate3d\(0px, \d/.test(mid)) fails.push("sheet did not follow the pull: " + mid);
      await swipe(cdp, page, [195, y0 + 160], [195, y0 + 330], 5, 25); await lift(cdp); await page.waitForTimeout(700);
      if (!(await page.evaluate(() => document.getElementById("cmsheet").hidden))) fails.push("pull-down did not dismiss the comments sheet");
    }
  } else console.log("(no feed post with a comment button)");

  await ctx.close();
}

// ── phone with a stubbed native Haptics plugin ───────────────────
{
  const { ctx, page } = await ctxFor(true, () => {
    window.__haps = [];
    globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { Haptics: { impact: (o) => window.__haps.push("impact:" + o.style), notification: (o) => window.__haps.push("notify:" + o.type) } } };
  });
  await page.tap('#bnav button[data-view="course"]'); await page.waitForTimeout(300);
  await page.tap("#menu-btn"); await page.waitForTimeout(700);
  const haps = await page.evaluate(() => window.__haps);
  if (!haps.includes("impact:LIGHT")) fails.push("no light impact on a tab-bar tap: " + JSON.stringify(haps));
  if (haps.length < 2) fails.push("drawer open did not tick: " + JSON.stringify(haps));
  await ctx.close();
}

// ── desktop: promo stack back in the body, no gesture side effects ─
{
  const { ctx, page } = await ctxFor(false);
  const parent = await page.evaluate(() => document.getElementById("promostack")?.parentNode?.tagName);
  if (parent !== "BODY") fails.push("desktop promo stack parent: " + parent);
  await ctx.close();
}

await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
