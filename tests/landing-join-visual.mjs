// Landing: joining without an application (D1, 9/29: "make echelon not application based anymore", "revert back to
// old pricing"); manual, not a node:test. Replaces landing-apply-visual.mjs.
//   node tests/landing-join-visual.mjs        (URL / OUT env; ONLY=desk,wide,iphone)
// Proves at 1440, 2560 and on an iPhone (WebKit): no Apply anywhere and no application pop-up; Join in the nav, the
// hero and the card; the card shows $500 with an X drawn over it, $400 once, and "Use code D1 at checkout" (the chip copies D1); Pricing in the nav and the footer; Join lands on
// /pricing/ with Echelon at $400 with code D1 (the $500 crossed out there too); "Use code D1" applies the code and the checkout
// request carries promo D1 (the request is answered locally: no live Stripe session is opened);
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
      x: (() => { const w = card.querySelector(".was"), r = w.getBoundingClientRect(); return [...w.querySelectorAll("i")].map((i) => { const b = i.getBoundingClientRect(); return { over: b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top, tall: Math.round(b.height) }; }); })(),
      fine: txt(".hero .fine")[0] || "",
      ref: localStorage.getItem("echelon-ref"),
      sw: document.documentElement.scrollWidth, vw: innerWidth,
    };
  });
  ok(!st.apply, `[${tag}] no Apply and no application pop-up anywhere`);
  ok(st.buys.length >= 3 && st.buys.every((b) => /^Join/.test(b)), `[${tag}] Join in the nav, the hero and the card (${st.buys.join(" | ")})`);
  ok(st.navPricing && st.footPricing, `[${tag}] Pricing in the nav and the footer`);
  ok(/\$500\s*With code D1:\s*\$400\s*once/.test(st.card) && /Use code\s*D1\s*(Copied\s*)?at checkout/.test(st.card) && !/\$320/.test(st.card), `[${tag}] the card: "${st.card.slice(0, 120)}"`);
  ok(/lifetime access/.test(st.fine) && !/application/.test(st.fine), `[${tag}] the hero line: "${st.fine}"`);
  ok(st.ref === "HARNESS1", `[${tag}] an invite link is kept (echelon-ref ${st.ref})`);
  ok(st.sw <= st.vw, `[${tag}] no sideways scroll (${st.sw} in ${st.vw})`);
  await page.evaluate(() => document.getElementById("access").scrollIntoView({ block: "center" }));
  await page.waitForTimeout(900);
  // the X draws in a beat after the card lands (two strokes, 0.75s and 1.05s in, 0.55s each)
  await page.waitForFunction(() => [...document.querySelectorAll("#access .was i")].every((i) => !/[1-9][0-9.]*%/.test(getComputedStyle(i).clipPath)), null, { timeout: 5000 }).catch(() => {});
  const x = await page.evaluate(() => [...document.querySelectorAll("#access .was i")].map((i) => getComputedStyle(i).clipPath));
  ok(st.x.length === 2 && st.x.every((l) => l.over && l.tall > 8) && x.every((c) => !/[1-9][0-9.]*%/.test(c)), `[${tag}] the X is drawn over $500 once the card is in (${x.join(" | ")})`);
  const chip = page.locator("#access .code-copy");
  if (tag === "iphone") await chip.tap(); else await chip.click();
  await page.waitForTimeout(250);
  ok(await chip.evaluate((b) => b.classList.contains("is-done")), `[${tag}] the D1 chip copies (shows Copied)`);
  await page.screenshot({ path: `${OUT}/${tag} 1 the card.png` });
  // Join -> the pricing page and its checkout button (no session opened)
  const heroJoin = page.locator(".hero [data-buy]").first();
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
  if (tag === "iphone") await heroJoin.tap(); else await heroJoin.click();
  await page.waitForURL(/\/pricing\/$/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const pr = await page.evaluate(() => ({ url: location.pathname, price: document.querySelector("#course .price")?.textContent.trim(), was: document.querySelector("#course .was")?.textContent.trim(), btn: document.getElementById("buy-course")?.textContent.trim() }));
  ok(pr.url === "/pricing/" && pr.price === "$400" && /\$500/.test(pr.was) && /^Join Echelon/.test(pr.btn), `[${tag}] Join lands on the pricing page: ${pr.was} crossed, Echelon ${pr.price}, "${pr.btn}"`);
  const use = page.locator("#use-d1");
  if (tag === "iphone") await use.tap(); else await use.click();
  await page.waitForTimeout(300);
  const u = await page.evaluate(() => ({ field: document.getElementById("promo-code").value, text: document.getElementById("use-d1").textContent.replace(/\s+/g, " ").trim(), on: document.getElementById("use-d1").classList.contains("on") }));
  ok(u.field === "D1" && u.on && /Applied/.test(u.text), `[${tag}] "Use code D1" applies it: field "${u.field}", "${u.text}"`);
  await page.screenshot({ path: `${OUT}/${tag} 2 pricing.png` });
  let body = null;
  await page.route("**/functions/v1/create-checkout", (r) => { if (r.request().method() === "POST") body = r.request().postDataJSON(); r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify({ error: "harness stop" }) }); });
  await page.evaluate(() => { window.Stripe = () => ({ initEmbeddedCheckout: async (o) => { await o.fetchClientSecret(); return { mount() {}, destroy() {} }; } }); });
  const buy = page.locator("#buy-course");
  if (tag === "iphone") await buy.tap(); else await buy.click();
  await page.waitForTimeout(1500);
  ok(body && body.product === "course" && body.promo === "D1", `[${tag}] the checkout request carries the code: ${JSON.stringify(body)}`);
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
