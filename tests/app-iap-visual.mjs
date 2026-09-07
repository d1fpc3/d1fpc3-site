// Apple IAP surfaces in the iOS shell (manual, not a node:test): python -m http.server 8123, then OUT=<dir> node tests/app-iap-visual.mjs
// Stubs window.Capacitor with a fake NativePurchases plugin (getPlatform ios). Temporarily revokes the review
// account's d1-gex comp (store tab shows Apple buttons) and then all comps (gate shows Get Echelon); restores both.
// A tap on Subscribe drives the real apple-iap function with a fake JWS, which must come back rejected, not crash.
import { createRequire } from "module"; import { readFileSync, mkdirSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const { chromium, devices } = createRequire(import.meta.url)("C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright");
const OUT = process.env.OUT; mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" };
const EMAIL = "appreview@d1fpc3.com";
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email: EMAIL }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
const setStatus = (products, status) => fetch(`${SB}/rest/v1/entitlements?email=eq.${EMAIL}&product=in.(${products.join(",")})`, { method: "PATCH", headers: H, body: JSON.stringify({ status }) });
const STUB = `
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { NativePurchases: {
    calls: [],
    async getProducts({ productIdentifiers, productType }) { this.calls.push(['getProducts', productType]); const all = { 'com.d1fpc3.echelon.course': { identifier: 'com.d1fpc3.echelon.course', priceString: '$499.99' }, 'com.d1fpc3.echelon.gex.monthly': { identifier: 'com.d1fpc3.echelon.gex.monthly', priceString: '$34.99' }, 'com.d1fpc3.echelon.gex.once': { identifier: 'com.d1fpc3.echelon.gex.once', priceString: '$149.99' } }; return { products: productIdentifiers.map((i) => all[i]).filter(Boolean) } },
    async purchaseProduct(o) { this.calls.push(['purchaseProduct', o.productIdentifier, o.productType, o.appAccountToken]); return { transactionId: 't1', productIdentifier: o.productIdentifier, jwsRepresentation: 'eyJhbGciOiJFUzI1NiJ9.e30.AAAA' } },
    async getPurchases() { this.calls.push(['getPurchases']); return { purchases: [] } },
    async restorePurchases() { this.calls.push(['restorePurchases']) },
    async manageSubscriptions() { this.calls.push(['manageSubscriptions']) },
  } } };`;
const b = await chromium.launch(); const fails = [];
try {
  await setStatus(["d1-gex"], "revoked");
  const ctx = await b.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([k, v, stub]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); for (const id of ["ig", "dc", "bt"]) localStorage.setItem("echelon-promo-until:" + id, String(Date.now() + 864e5)); sessionStorage.removeItem("echelon-iap-synced"); new Function(stub)(); }, [`sb-${REF}-auth-token`, JSON.stringify(session), STUB]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.getElementById("app")?.classList.contains("on"), null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { document.getElementById("nextup")?.remove(); document.querySelector('.tab[data-view="indicators"]').click() });
  await p.waitForTimeout(1200);
  const st = await p.evaluate(() => ({ tabHidden: document.querySelector('.tab[data-view="indicators"]').hidden, buttons: [...document.querySelectorAll(".iap-buy button")].map((b) => b.textContent + (b.disabled ? " (disabled)" : "")), terms: !!document.querySelector(".iap-terms"), links: [...document.querySelectorAll(".iap-links button")].map((b) => b.textContent), stripe: document.querySelectorAll(".p-buy:not(.iap-buy) button").length }));
  console.log("store", JSON.stringify(st));
  if (st.tabHidden || !st.buttons.some((t) => /Subscribe · \$34\.99 \/ month/.test(t)) || !st.buttons.some((t) => /Buy once · \$149\.99/.test(t)) || !st.terms || !st.links.includes("Restore purchases") || st.stripe) fails.push("store surface " + JSON.stringify(st));
  await p.locator(".iap-buy").scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/1-store.png` });
  // tap Subscribe: fake JWS goes to the real function and must be rejected cleanly
  await p.locator(".iap-buy .btn").click(); await p.waitForTimeout(3500);
  const after = await p.evaluate(() => ({ calls: window.Capacitor.Plugins.NativePurchases.calls, toast: document.getElementById("co-toast")?.textContent }));
  console.log("purchase", JSON.stringify(after));
  const pc = after.calls.find((c) => c[0] === "purchaseProduct");
  if (!pc || pc[1] !== "com.d1fpc3.echelon.gex.monthly" || pc[2] !== "subs" || !/^[0-9a-f-]{36}$/.test(pc[3] || "")) fails.push("purchaseProduct call " + JSON.stringify(pc));
  if (!/Could not unlock/.test(after.toast || "")) fails.push("expected the fake JWS to be rejected, toast: " + after.toast);
  await p.screenshot({ path: `${OUT}/2-after-buy.png` });
  // restore path
  await p.locator(".iap-links button", { hasText: "Restore purchases" }).click(); await p.waitForTimeout(1200);
  const rs = await p.evaluate(() => document.getElementById("co-toast")?.textContent);
  console.log("restore toast", JSON.stringify(rs)); if (!/Nothing to restore/.test(rs || "")) fails.push("restore toast " + rs);
  await ctx.close();
  // the gate: nothing owned
  await setStatus(["course", "d1-lit"], "revoked");
  const ctx2 = await b.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx2.addInitScript(([k, v, stub]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); new Function(stub)(); }, [`sb-${REF}-auth-token`, JSON.stringify(session), STUB]);
  const p2 = await ctx2.newPage(); p2.on("pageerror", (e) => errs.push(e.message));
  await p2.goto("http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
  await p2.waitForSelector("#gate-actions .iap-gate", { timeout: 30000 }).catch(() => fails.push("gate iap block missing"));
  await p2.waitForTimeout(800);
  const g = await p2.evaluate(() => ({ title: document.getElementById("gate-title")?.textContent, buy: document.querySelector(".iap-gate .go")?.textContent, disabled: document.querySelector(".iap-gate .go")?.disabled, links: [...document.querySelectorAll(".iap-gate .iap-links button")].map((b) => b.textContent) }));
  console.log("gate", JSON.stringify(g));
  if (!/Get Echelon · \$499\.99/.test(g.buy || "") || g.disabled || !g.links.includes("Restore purchases")) fails.push("gate " + JSON.stringify(g));
  await p2.screenshot({ path: `${OUT}/3-gate.png` });
  await ctx2.close();
  if (errs.length) fails.push("page errors: " + errs.join(" | "));
} finally {
  await b.close();
  await setStatus(["course", "d1-gex", "d1-lit"], "active");
  const back = await (await fetch(`${SB}/rest/v1/entitlements?email=eq.${EMAIL}&select=product,status`, { headers: H })).json();
  console.log("restored:", JSON.stringify(back));
}
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK"); process.exit(fails.length ? 1 : 0);
