// Landing: joining without an application (D1, 9/29: "make echelon not application based anymore", "revert back to
// old pricing"); manual, not a node:test. Replaces landing-apply-visual.mjs.
//   node tests/landing-join-visual.mjs        (URL / OUT env; ONLY=desk,wide,iphone)
// Proves at 1440, 2560 and on an iPhone (WebKit): no Apply anywhere and no application pop-up; Join in the nav, the
// hero and the card; the card shows $500 once and the D1 code; Pricing in the nav and the footer; Join lands on
// /pricing/ with Echelon at $500 and its Get Echelon button (it stops there: no live Stripe session is opened);
// an invite link (?ref=) is kept; the old /echelon/apply/ page sends people to /pricing/ with the invite kept.
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/landing-join`; mkdirSync(OUT, { recursive: true });
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
  await page.goto(BASE + "?ref=HARNESS1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const st = await page.evaluate(() => {
    const txt = (sel) => [...document.querySelectorAll(sel)].map((n) => n.textContent.replace(/\s+/g, " ").trim());
    const card = document.getElementById("access");
    return {
      apply: /\bApply\b/.test(document.body.innerText) || !!document.querySelector("[data-apply], #apply-modal, #apply-form"),
      buys: txt("[data-buy]"),
      navPricing: !!document.querySelector('header a[href="/pricing/"]'),
      footPricing: !!document.querySelector('footer a[href="/pricing/"]'),
      card: card ? card.innerText.replace(/\s+/g, " ").trim() : "",
      fine: txt(".hero .fine")[0] || "",
      ref: localStorage.getItem("echelon-ref"),
      sw: document.documentElement.scrollWidth, vw: innerWidth,
    };
  });
  ok(!st.apply, `[${tag}] no Apply and no application pop-up anywhere`);
  ok(st.buys.length >= 3 && st.buys.every((b) => /^Join/.test(b)), `[${tag}] Join in the nav, the hero and the card (${st.buys.join(" | ")})`);
  ok(st.navPricing && st.footPricing, `[${tag}] Pricing in the nav and the footer`);
  ok(/\$500\s*once/.test(st.card) && /Code D1 takes 20% off at checkout: \$400/.test(st.card), `[${tag}] the card: "${st.card.slice(0, 120)}"`);
  ok(/lifetime access/.test(st.fine) && !/application/.test(st.fine), `[${tag}] the hero line: "${st.fine}"`);
  ok(st.ref === "HARNESS1", `[${tag}] an invite link is kept (echelon-ref ${st.ref})`);
  ok(st.sw <= st.vw, `[${tag}] no sideways scroll (${st.sw} in ${st.vw})`);
  await page.evaluate(() => document.getElementById("access").scrollIntoView({ block: "center" }));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${tag} 1 the card.png` });
  // Join -> the pricing page and its checkout button (no session opened)
  const heroJoin = page.locator(".hero [data-buy]").first();
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
  if (tag === "iphone") await heroJoin.tap(); else await heroJoin.click();
  await page.waitForURL(/\/pricing\/$/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const pr = await page.evaluate(() => ({ url: location.pathname, price: document.querySelector("#course .price")?.textContent.trim(), btn: document.getElementById("buy-course")?.textContent.trim() }));
  ok(pr.url === "/pricing/" && pr.price === "$500" && pr.btn === "Get Echelon", `[${tag}] Join lands on the pricing page: Echelon ${pr.price}, "${pr.btn}"`);
  await page.screenshot({ path: `${OUT}/${tag} 2 pricing.png` });
  // the old join page
  await page.goto(BASE + "echelon/apply/?ref=HARNESS2", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/pricing\/$/, { timeout: 15000 }).catch(() => {});
  const ap = await page.evaluate(() => ({ url: location.pathname, origin: location.origin, ref: localStorage.getItem("echelon-ref") }));
  // the redirect is absolute (https://d1fpc3.com/pricing/): run locally, the invite is kept on the local origin
  const sameOrigin = ap.origin === new URL(BASE).origin
  ok(ap.url === "/pricing/" && (!sameOrigin || ap.ref === "HARNESS2"), `[${tag}] /echelon/apply/ sends people to ${ap.origin}${ap.url}${sameOrigin ? ` and keeps the invite (${ap.ref})` : ""}`);
  ok(!errors.length, `[${tag}] no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
  await browser.close();
}
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
