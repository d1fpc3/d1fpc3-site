// CSP dry run for the public pages (manual). Injects the policy from pricing/.htaccess as a
// header on every public page, exercises each one, and prints anything it blocked.
//   BASE=http://127.0.0.1:8124 node tests/security-csp-public-probe.mjs
// It loads Stripe's script but never starts a checkout, so no Stripe object is created.
import { createRequire } from "module"; import { existsSync, readFileSync } from "fs";
const require = createRequire(import.meta.url);
const PW = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"].find((p) => existsSync(p)) || "playwright";
const { chromium } = require(PW);
const ht = readFileSync(new URL("../pricing/.htaccess", import.meta.url), "utf8");
const CSP = (ht.match(/Content-Security-Policy "([^"]+)"/) || [])[1]; if (!CSP) throw new Error("no policy in pricing/.htaccess");
const BASE = (process.env.BASE || "http://127.0.0.1:8124").replace(/\/$/, ""); const INJECT = process.env.INJECT !== "0";
const browser = await chromium.launch(); const blocked = new Set(), errs = [];
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: vp }); const page = await ctx.newPage();
  if (INJECT) await page.route((u) => u.origin === BASE && !/\.(png|jpe?g|webp|svg|css|js|ico|woff2?)$/i.test(u.pathname), async (route) => { const r = await route.fetch(); const h = r.headers(); if (/text\/html/.test(h["content-type"] || "")) h["content-security-policy"] = CSP; await route.fulfill({ response: r, headers: h }) });
  page.on("console", (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) blocked.add(t.replace(/\s+/g, " ").slice(0, 240)) });
  page.on("pageerror", (e) => errs.push(e.message));
  for (const path of ["/", "/pricing/", "/reviews/", "/echelon/gex/", "/echelon/welcome/", "/echelon/apply/", "/echelon/propfirms/", "/terms/", "/privacy/"]) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" }).catch((e) => errs.push(path + ": " + e.message)); await page.waitForTimeout(2500);
    if (path === "/") { await page.locator(".hero [data-apply]").click().catch(() => {}); await page.waitForTimeout(900); await page.keyboard.press("Escape"); await page.mouse.wheel(0, 2500); await page.waitForTimeout(1500) }
    if (path === "/pricing/" || path === "/echelon/gex/") { await page.evaluate(() => new Promise((res) => { const s = document.createElement("script"); s.src = "https://js.stripe.com/v3/"; s.onload = () => res("ok"); s.onerror = () => res("fail"); document.head.appendChild(s); setTimeout(() => res("timeout"), 8000) })).then((r) => { if (r !== "ok") blocked.add("stripe script did not load on " + path + ": " + r) }); await page.mouse.wheel(0, 3000); await page.waitForTimeout(1200) }
  }
  await ctx.close();
}
console.log("policy:", CSP.slice(0, 110) + "…", INJECT ? "(injected)" : "(as served)"); console.log("page errors:", errs.length ? errs.join(" | ") : "none");
if (blocked.size) { console.log("BLOCKED (" + blocked.size + "):"); for (const b of blocked) console.log(" - " + b); await browser.close(); process.exit(1) } else { console.log("NOTHING BLOCKED"); await browser.close() }
