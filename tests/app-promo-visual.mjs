// Stay close popup (manual, not a node:test): python -m http.server 8123, then OUT=<dir> node tests/app-promo-visual.mjs
// Opens on the Overview after boot (Instagram / free Discord / BackTrader), 3 rows, inside the viewport, Not now rests it and it stays away on reload.
import { createRequire } from "module";
import { readFileSync, mkdirSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright");
const OUT = process.env.OUT; mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
const b = await chromium.launch();
const fails = [];
for (const [name, vp, theme] of [["phone-light", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "light"], ["desk-dark", { viewport: { width: 1280, height: 800 } }, "dark"]]) {
  const ctx = await b.newContext(vp);
  await ctx.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", t); if (!sessionStorage.getItem("promo-reset")) { localStorage.removeItem("echelon-promo-until"); sessionStorage.setItem("promo-reset", "1"); } }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#ov-hi", { timeout: 25000 });
  await p.waitForFunction(() => document.getElementById("promomodal")?.classList.contains("on"), null, { timeout: 8000 }).catch(() => fails.push(name + ": popup never opened"));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  const st = await p.evaluate(() => ({ rows: document.querySelectorAll("#promomodal .pm-row").length, ig: document.getElementById("promo-ig").href, dc: document.getElementById("promo-dc").href, bt: document.getElementById("promo-bt").href, inside: (() => { const r = document.getElementById("promomodal").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; })() }));
  console.log(name, JSON.stringify(st), errs);
  if (st.rows !== 3 || !st.inside) fails.push(name + " layout " + JSON.stringify(st));
  await p.click("#promo-later"); await p.waitForTimeout(400);
  const closed = await p.evaluate(() => document.getElementById("promomodal").hidden && Number(localStorage.getItem("echelon-promo-until")) > Date.now());
  if (!closed) fails.push(name + ": Not now did not close and rest the popup");
  // reload: must not come back
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector("#ov-hi", { timeout: 25000 }); await p.waitForTimeout(3500);
  if (await p.evaluate(() => !document.getElementById("promomodal").hidden)) fails.push(name + ": came back after Not now");
  await ctx.close();
}
await b.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
process.exit(fails.length ? 1 : 0);
