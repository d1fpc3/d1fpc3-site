// Chat reactions (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-reactions-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account), opens the chat on desktop
// and on a phone, finds a message with reactions and checks: the pills are
// 26px rounded chips with an emoji and a count, a trailing "+" chip opens the
// quick picker, resting the mouse on a pill shows the who-reacted card (names
// plus avatars, positioned over the pill) and leaving hides it, and on a phone
// a half-second hold on a pill shows the same card without toggling the
// reaction. Nothing here writes a reaction. Screenshots in OUT.
// Needs SUPABASE_ACCESS_TOKEN (or ~/.supabase/access-token) for the magic link.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"].find(existsSync);
const { chromium, devices } = require(LOCAL_PW ?? "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-reactions-shots`;
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
async function ctxFor(phone) {
  const ctx = await browser.newContext(phone
    ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1380, height: 900 } });
  await ctx.addInitScript(([k, v]) => {
    localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1");
    localStorage.setItem("echelon-splash-day", new Date().toLocaleDateString("en-CA"));
  }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 25000 });
  await page.waitForTimeout(1200);
  await page.addStyleTag({ content: ".toast, #toast { display: none !important }" });
  return { ctx, page };
}
// open the chat and land on the first conversation that has a reaction pill
async function openReactedMessage(page, phone) {
  await page.evaluate(() => document.querySelector('.tab[data-view="chat"]').click());
  await page.waitForTimeout(2500);
  const items = await page.$$(".cr-item");
  for (let i = 0; i < Math.min(items.length, 6); i++) {
    const it = (await page.$$(".cr-item"))[i];
    if (phone) await it.tap(); else await it.click();
    await page.waitForTimeout(1800);
    if (await page.$(".rx-chip:not(.rx-add)")) return true;
    if (phone) { await page.evaluate(() => document.querySelector(".cv-back, .conv-back, [data-back]")?.click()); await page.waitForTimeout(500); }
  }
  return false;
}
const chipInfo = (page) => page.evaluate(() => {
  const c = document.querySelector(".rx-chip:not(.rx-add)"); if (!c) return null;
  const r = c.getBoundingClientRect(), cs = getComputedStyle(c);
  return { h: r.height, radius: cs.borderRadius, emoji: c.querySelector(".e")?.textContent, count: c.querySelector(".n")?.textContent, label: c.getAttribute("aria-label"), add: !!c.parentElement.querySelector(".rx-add") };
});

// ── desktop ──────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(false);
  if (!(await openReactedMessage(page, false))) { console.log("(no reacted message found on desktop)"); }
  else {
    const info = await chipInfo(page);
    if (Math.abs(info.h - 26) > 1) fails.push("desktop pill height: " + info.h);
    if (!/999|9999px/.test(info.radius) && parseFloat(info.radius) < 13) fails.push("pill not rounded: " + info.radius);
    if (!info.emoji || !/^\d+$/.test(info.count)) fails.push("pill content odd: " + JSON.stringify(info));
    if (!/reacted/.test(info.label || "")) fails.push("pill aria-label missing names: " + info.label);
    if (!info.add) fails.push("no + chip after the pills");
    // hover shows the who-reacted card
    const chip = page.locator(".rx-chip:not(.rx-add)").first();
    await chip.scrollIntoViewIfNeeded();
    await chip.hover(); await page.waitForTimeout(450);
    const tip = await page.evaluate(() => { const t = document.querySelector(".rx-tip"); if (!t) return null; const r = t.getBoundingClientRect(); const c = document.querySelector(".rx-chip:not(.rx-add)").getBoundingClientRect(); return { text: t.textContent.trim(), avatars: t.querySelectorAll(".stack .av").length, above: r.bottom <= c.top + 1 || r.top >= c.bottom - 1, inView: r.left >= 0 && r.right <= innerWidth }; });
    if (!tip) fails.push("no who-reacted card on hover");
    else {
      if (!/reacted/.test(tip.text) || tip.avatars < 1) fails.push("card content odd: " + JSON.stringify(tip));
      if (!tip.above || !tip.inView) fails.push("card misplaced: " + JSON.stringify(tip));
    }
    await page.screenshot({ path: `${OUT}/reactions-desktop-hover.png` });
    await page.mouse.move(10, 10); await page.waitForTimeout(250);
    if (await page.$(".rx-tip")) fails.push("card did not hide on leave");
    // + opens the picker
    await page.locator(".rx-add").first().click(); await page.waitForTimeout(300);
    if (!(await page.$(".rx-pop"))) fails.push("+ chip did not open the picker");
    await page.screenshot({ path: `${OUT}/reactions-desktop-picker.png` });
    await page.keyboard.press("Escape"); await page.mouse.click(10, 300); await page.waitForTimeout(200);
  }
  await ctx.close();
}

// ── phone ────────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(true);
  if (!(await openReactedMessage(page, true))) { console.log("(no reacted message found on phone)"); }
  else {
    const cdp = await ctx.newCDPSession(page);
    const chip = page.locator(".rx-chip:not(.rx-add)").first();
    await chip.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    const before = await chipInfo(page);
    const box = await chip.boundingBox();
    const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 3, radiusY: 3, force: 1, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
    await page.waitForTimeout(700);
    const held = await page.evaluate(() => !!document.querySelector(".rx-tip"));
    await page.screenshot({ path: `${OUT}/reactions-phone-hold.png` });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
    if (!held) fails.push("hold on a pill did not show the who-reacted card");
    const after = await chipInfo(page);
    if (after.count !== before.count) fails.push(`hold toggled the reaction: ${before.count} -> ${after.count}`);
    if (await page.evaluate(() => !!document.querySelector(".msg.acts-open"))) fails.push("hold on a pill opened the message actions");
  }
  await ctx.close();
}

await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
