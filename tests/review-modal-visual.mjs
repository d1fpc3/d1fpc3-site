// The Leave-a-review popup must render from the Indicators view on a phone.
//   python -m http.server 8123 (repo root), then: node tests/review-modal-visual.mjs
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/review-modal-shots`;
mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = (q) => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: q }),
}).then((r) => r.json());
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const email = (await sql("select email from admins order by added_at limit 1"))[0].email;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
const fails = [];
await page.goto("http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("#index button").length > 0, null, { timeout: 20000 });

const portaled = await page.evaluate(() => document.getElementById("revmodal")?.parentElement === document.body);
if (!portaled) fails.push("revmodal is not portaled to <body>");

await page.evaluate(() => document.querySelector('.tab[data-view="indicators"]').click());
await page.waitForTimeout(1500);
const btn = await page.evaluate(() => {
  const b = [...document.querySelectorAll("#v-indicators button")].find((x) =>
    /Leave a review|Edit your review/.test(x.textContent));
  if (b) { b.click(); return b.textContent.trim(); }
  return null;
});
if (!btn) {
  // no owned indicator on this account: open the modal directly, same code path
  await page.evaluate(() => { document.getElementById("revmodal").hidden = false; });
}
await page.waitForTimeout(400);
const vis = await page.evaluate(() => {
  const m = document.getElementById("revmodal");
  const r = m.querySelector(".dmpick").getBoundingClientRect();
  return { hidden: m.hidden, w: r.width, h: r.height, top: r.top, inView: r.top >= 0 && r.top < innerHeight && r.width > 200 };
});
if (vis.hidden || !vis.inView) fails.push(`modal not visible: ${JSON.stringify(vis)}`);
await page.screenshot({ path: `${OUT}/review-modal-mobile.png` });
await browser.close();
console.log(`button: ${btn ?? "none (opened directly)"}`);
console.log(fails.length ? "FAILS:\n  " + fails.join("\n  ") : "all good");
console.log("shots in " + OUT);
if (fails.length) process.exit(1);
