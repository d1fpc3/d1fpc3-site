// The Join page, /pricing/ (rebuilt 9/29, D1: "when I hit join echelon, the join page looks terrible"); manual, not
// a node:test.   node tests/pricing-join-visual.mjs        (URL / OUT env; ONLY=desk,wide,iphone)
// Proves at 1440, 2560 and on an iPhone (WebKit), with create-checkout answered locally (no live Stripe session):
// the offer reads $500 crossed out and $400 once; the D1 ticket applies (Applied, $400 on the pay line) and a
// second tap takes it off ($500 again); another code typed in rides to the checkout; Join Echelon sends product
// course with the code; the sheet opens over the page and closes on Escape and on its X; the GEX buttons send
// d1-gex month / one_time; the live GEX card draws; on the phone the Join bar appears once the offer's button
// scrolls away, hides under the checkout, and its Join opens the course checkout; nothing scrolls sideways; no
// page errors.
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/pricing-join`; mkdirSync(OUT, { recursive: true });
const BASE = (process.env.URL || "http://127.0.0.1:8123/").replace(/\/?$/, "/");
const fails = []; const ok = (c, w) => { console.log((c ? "  ok   " : "  FAIL ") + w); if (!c) fails.push(w); };
const VPS = { desk: [chromium, { viewport: { width: 1440, height: 900 } }], wide: [chromium, { viewport: { width: 2560, height: 1300 } }], iphone: [webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }] };

for (const tag of (process.env.ONLY || "desk,wide,iphone").split(",")) {
  const [eng, opt] = VPS[tag];
  console.log(`== ${tag}`);
  const browser = await eng.launch();
  const ctx = await browser.newContext(opt);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const bodies = [];
  await page.route("**/functions/v1/create-checkout", (r) => { if (r.request().method() === "POST") bodies.push(r.request().postDataJSON()); r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify({ error: "harness stop" }) }); });
  await page.addInitScript(() => { window.Stripe = () => ({ initEmbeddedCheckout: async (o) => { await o.fetchClientSecret(); return { mount() {}, destroy() {} }; } }); });
  await page.goto(BASE + "pricing/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const tap = async (sel) => { const l = page.locator(sel).first(); if (tag === "iphone") await l.tap(); else await l.click(); await page.waitForTimeout(350); };
  const read = () => page.evaluate(() => ({
    price: document.querySelector("#course .price").textContent.trim(), was: document.querySelector("#course .was").textContent.trim(),
    coupon: document.getElementById("use-d1").textContent.replace(/\s+/g, " ").trim(), on: document.getElementById("use-d1").classList.contains("on"),
    pay: document.getElementById("pay-line").textContent.trim(), field: document.getElementById("promo-code").value,
    scrim: document.getElementById("co-scrim").classList.contains("on"), title: document.getElementById("co-title").textContent,
  }));
  let s = await read();
  ok(s.price === "$400" && /\$500/.test(s.was) && !s.on && /Without a code, checkout is \$500/.test(s.pay), `[${tag}] the offer: ${s.was} crossed, ${s.price}; "${s.pay}"`);
  await page.screenshot({ path: `${OUT}/${tag} 1 offer.png` });
  await tap("#use-d1"); s = await read();
  ok(s.on && s.field === "D1" && /Applied/.test(s.coupon) && /\$400/.test(s.pay), `[${tag}] the D1 ticket applies: "${s.coupon}" | "${s.pay}"`);
  await page.screenshot({ path: `${OUT}/${tag} 2 applied.png` });
  await tap("#use-d1"); s = await read();
  ok(!s.on && s.field === "" && /\$500/.test(s.pay), `[${tag}] a second tap takes it off: "${s.pay}"`);
  await tap("#use-d1");
  await tap("#buy-course"); s = await read();
  ok(s.scrim && s.title === "Join Echelon", `[${tag}] Join Echelon opens the checkout sheet ("${s.title}")`);
  const b1 = bodies.at(-1);
  ok(b1 && b1.product === "course" && b1.promo === "D1", `[${tag}] the course checkout carries D1: ${JSON.stringify(b1)}`);
  await page.keyboard.press("Escape"); await page.waitForTimeout(400); s = await read();
  ok(!s.scrim, `[${tag}] Escape closes the sheet`);
  // another code
  await tap("#use-d1");
  await tap("#code-toggle"); await page.fill("#promo-code", "abc12"); await page.waitForTimeout(200); s = await read();
  ok(/ABC12/.test(s.pay) && !s.on, `[${tag}] another code shows on the pay line: "${s.pay}"`);
  await tap("#buy-course");
  const b2 = bodies.at(-1);
  ok(b2 && b2.promo === "ABC12", `[${tag}] and rides to the checkout: ${JSON.stringify(b2)}`);
  await tap("#co-x"); s = await read();
  ok(!s.scrim, `[${tag}] the X closes the sheet`);
  await page.fill("#promo-code", "");
  // GEX
  await page.evaluate(() => document.getElementById("gex-card").scrollIntoView({ block: "center" })); await page.waitForTimeout(1200);
  const gx = await page.evaluate(() => { const c = document.getElementById("gp-canvas"), g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i]) n++; return { shown: !document.getElementById("gexprev").hidden, lit: n, levels: [...document.querySelectorAll("#gp-levels b")].map((b) => b.textContent) }; });
  ok(gx.shown && gx.lit > 100 && gx.levels.length === 4 && gx.levels.every((v) => /^\d{1,3}(,\d{3})+$/.test(v)), `[${tag}] the live GEX card draws (${gx.lit} painted; ${gx.levels.join(" / ")})`);
  await page.screenshot({ path: `${OUT}/${tag} 3 sold separately.png` });
  await tap("#buy-gex-month"); const g1 = bodies.at(-1); s = await read();
  ok(s.scrim && s.title === "D1 GEX" && g1.product === "d1-gex" && g1.interval === "month", `[${tag}] Subscribe sends d1-gex month (${JSON.stringify(g1)})`);
  await tap("#co-x");
  await tap("#buy-gex-once"); const g2 = bodies.at(-1);
  ok(g2.product === "d1-gex" && g2.interval === "one_time", `[${tag}] Buy once sends d1-gex one_time`);
  await tap("#co-x");
  // the phone's Join bar
  if (tag === "iphone") {
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(600);
    const before = await page.evaluate(() => document.getElementById("mbar").classList.contains("on"));
    await page.evaluate(() => document.getElementById("gex-card").scrollIntoView({ block: "center" })); await page.waitForTimeout(900);
    const after = await page.evaluate(() => { const b = document.getElementById("mbar"), r = b.getBoundingClientRect(); return { on: b.classList.contains("on"), inView: r.bottom <= innerHeight + 1 && r.top < innerHeight }; });
    ok(!before && after.on && after.inView, `[${tag}] the Join bar waits for the offer's button to scroll away, then shows`);
    await page.screenshot({ path: `${OUT}/${tag} 4 join bar.png` });
    await tap("#mbar-join"); s = await read();
    const hid = await page.evaluate(() => !document.getElementById("mbar").classList.contains("on"));
    ok(s.scrim && bodies.at(-1).product === "course" && hid, `[${tag}] its Join opens the course checkout, and the bar steps aside`);
    await tap("#co-x");
  }
  // FAQ opens
  await page.evaluate(() => document.querySelector(".faq").scrollIntoView({ block: "center" })); await page.waitForTimeout(900);
  await tap(".faq details:nth-child(2) summary");
  const faq = await page.evaluate(() => { const d = document.querySelector(".faq details:nth-child(2)"); return d.open && /20% off: \$400 instead of \$500/.test(d.textContent); });
  ok(faq, `[${tag}] the code question opens with the answer`);
  const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, dash: /\u2014/.test(document.documentElement.outerHTML) }));
  ok(lay.sw <= lay.vw, `[${tag}] no sideways scroll (${lay.sw} in ${lay.vw})`);
  ok(!lay.dash, `[${tag}] no long dashes`);
  ok(!errors.length, `[${tag}] no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
  await browser.close();
}
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
