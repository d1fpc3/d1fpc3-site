// The public D1 GEX page, /echelon/gex/ (manual, not a node:test). D1, 2026-09-27: "fix up the public D1 GEX
// indicator ... that public page".
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/gex-page-visual.mjs        (PAGE_URL / OUT env)
// At 2560, 1440, 390 (Chrome) and an iPhone (WebKit): no horizontal scroll, the live card fills from the real
// feed and says whether the levels are live or old (checked against the feed's own clocks), NQ / ES switch
// books, every reveal lands, no em dash anywhere on the page, the product shots load, the FAQ opens, and a
// buy button opens the checkout panel (create-checkout is stubbed, no live Stripe session is made).
// Also stubs the feed to a fresh in-session print to prove the "Live" state, and to Friday's close for "Old".
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "gex-page"); mkdirSync(OUT, { recursive: true });
const URL = process.env.PAGE_URL || "http://127.0.0.1:8123/echelon/gex/";
const fails = []; const ok = (c, w) => { console.log((c ? "  ok   " : "  FAIL ") + w); if (!c) fails.push(w); };
const real = await (await fetch("https://gex-worker.d1fpc3.workers.dev/gex.json")).json();

const VPS = [
  ["wide", chromium, { viewport: { width: 2560, height: 1300 } }],
  ["desk", chromium, { viewport: { width: 1440, height: 900 } }],
  ["phone", chromium, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["iphone", webkit, { ...devices["iPhone 13"] }],
];
async function open(name, eng, dev, feed) {
  const b = await (eng === chromium ? eng.launch({ channel: "chrome" }) : eng.launch());
  const ctx = await b.newContext({ ...dev, reducedMotion: "no-preference" }); const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.route(/functions\/v1\/create-checkout/, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "harness: checkout stubbed" }) }));
  if (feed) await page.route(/gex-worker\.d1fpc3\.workers\.dev\/gex\.json/, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(feed(r.request().url())) }));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  // live, Hostinger can show a few seconds of "Checking your browser" before the page itself
  await page.waitForSelector("#lv-state", { timeout: 45000 });
  await page.waitForFunction(() => !document.getElementById("live").classList.contains("skel"), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return { b, page, errs };
}
const state = (page) => page.evaluate(() => ({ state: document.getElementById("lv-state").textContent, cls: document.getElementById("lv-state").className, note: document.getElementById("lv-note").textContent, regime: document.getElementById("lv-regime").textContent, tag: document.getElementById("lv-tag").textContent, levels: [...document.querySelectorAll("#lv-levels b")].map((b) => b.textContent) }));

for (const [name, eng, dev] of VPS) {
  console.log(`\n${name}`);
  const { b, page, errs } = await open(name, eng, dev);
  await page.screenshot({ path: `${OUT}/${name}-top.png` });
  let s = await state(page);
  console.log("  " + JSON.stringify(s));
  // what the real feed should say right now, by the page's own rule (the feed on a weekend night is old)
  ok(/Positive gamma|Negative gamma/.test(s.regime) && s.levels.every((v) => /^[\d,]+$/.test(v)), `the card filled from the feed: ${s.regime}, ${s.levels.join(" / ")}`);
  ok(/^(Live|Pre-open|Closed|Old levels|Behind)/.test(s.state), `the card states its freshness: "${s.state}"`);   // Closed: after the bell (9/29; it used to say Pre-open)
  // ES
  await page.click('.seg button[data-book="es"]'); await page.waitForTimeout(1500);
  const es = await state(page);
  ok(/ES [\d,]+/.test(es.tag) && es.levels.join() !== s.levels.join(), `ES switches the book: ${es.tag}, ${es.levels.join(" / ")}`);
  await page.click('.seg button[data-book="nq"]'); await page.waitForTimeout(600);
  // scroll through, then check layout
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 500) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(110); }
  await page.waitForTimeout(1000);
  const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, hidden: [...document.querySelectorAll(".rv:not(.in)")].length, imgs: [...document.querySelectorAll(".shot img")].map((i) => i.complete && i.naturalWidth > 0), dash: /\u2014/.test(document.body.innerText) }));
  ok(lay.sw <= lay.iw, `no horizontal scroll (${lay.sw} in ${lay.iw})`);
  ok(lay.hidden === 0, `every reveal landed (${lay.hidden} hidden)`);
  ok(lay.imgs.length === 2 && lay.imgs.every(Boolean), `both product shots load (${JSON.stringify(lay.imgs)})`);
  ok(!lay.dash, "no em dash on the page");
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true, scale: "css" });
  // FAQ and checkout
  await page.locator("#faq summary").nth(1).click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelectorAll("#faq details")[1].open), "an FAQ answer opens");
  await page.locator('.plan [data-buy="one_time"]').click(); await page.waitForTimeout(2500);
  const co = await page.evaluate(() => ({ on: document.getElementById("co-scrim").classList.contains("on"), msg: document.getElementById("co-loading").textContent }));
  ok(co.on && /harness: checkout stubbed/.test(co.msg), `Buy once opens the checkout panel and calls create-checkout (${co.msg})`);
  if (name === "phone" || name === "iphone") {
    await page.keyboard.press("Escape").catch(() => {}); await page.evaluate(() => document.getElementById("co-x").click()); await page.waitForTimeout(300);
    await page.evaluate(() => scrollTo(0, 1400)); await page.waitForTimeout(900);
    ok(await page.evaluate(() => document.getElementById("mbar").classList.contains("on")), "the phone buy bar shows once the hero's buttons scroll away");
    await page.screenshot({ path: `${OUT}/${name}-mbar.png` });
  }
  ok(!errs.length, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
  await b.close();
}

// the two states on purpose: a fresh in-session print, and Friday's close seen on a Sunday
console.log("\nstates");
{
  const now = Date.now(), etParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {});
  const inSession = !["Sat", "Sun"].includes(etParts.weekday) && (+etParts.hour % 24) * 60 + +etParts.minute >= 590 && (+etParts.hour % 24) * 60 + +etParts.minute < 960;
  // Friday's close, always old unless it is still Friday
  const oldFeed = () => ({ ...real, generatedAt: "2026-09-27T20:27:00.000Z", chain: { ...(real.chain || {}), lastTrade: "2026-09-25T15:59:59" } });
  const o = await open("desk", chromium, VPS[1][2], oldFeed);
  const so = await state(o.page);
  ok(/^Old levels/.test(so.state) && /These are Friday's levels, from the Sep 25 close\./.test(so.note), `Friday's close reads old: "${so.note}"`);
  await o.page.locator("#live").screenshot({ path: `${OUT}/card-old.png` });
  await o.b.close();
  if (inSession) {
    const freshFeed = () => ({ ...real, generatedAt: new Date(now - 60000).toISOString(), chain: { ...(real.chain || {}), lastTrade: new Date(now - 15 * 60000).toISOString().slice(0, 19) } });
    const f = await open("desk", chromium, VPS[1][2], freshFeed);
    const sf = await state(f.page);
    ok(/^Live/.test(sf.state), `a fresh in-session print reads Live: "${sf.state}"`);
    await f.page.locator("#live").screenshot({ path: `${OUT}/card-live.png` });
    await f.b.close();
  } else console.log("  (outside the session: the Live state is only provable 9:50 AM to 4:00 PM ET, skipped)");
}

console.log(`\nscreenshots: ${OUT}`);
if (fails.length) { console.log(`\n${fails.length} FAILED:\n - ` + fails.join("\n - ")); process.exit(1); }
console.log("\nALL OK");
