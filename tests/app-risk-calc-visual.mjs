// Risk calculator instruments (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-risk-calc-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account), opens the Overview
// calculator on the phone, and for every instrument sets risk + stop and
// checks the contract count and the per-point dollars in the output line,
// plus that the stop field's step follows the instrument's tick.
// Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-risk-calc-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://localhost:8080/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.removeItem("echelon-risk-calc"); localStorage.setItem("echelon-calc-tab", "risk"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.waitForTimeout(1200);

await page.evaluate(() => document.getElementById("rc-open").click());
await page.waitForTimeout(400);
if (await page.evaluate(() => document.getElementById("rcmodal").hidden)) fails.push("calculator did not open");

// value → [name, $/pt, tick, stop to type, risk, expected contracts]
const CASES = [
  ["2",    "MNQ", 2,    0.25,  15,   300, 10],
  ["20",   "NQ",  20,   0.25,  15,   300, 1],
  ["10",   "MGC", 10,   0.1,   3,    300, 10],
  ["100",  "GC",  100,  0.1,   3,    300, 1],
  ["1000", "SIL", 1000, 0.005, 0.05, 300, 6],
  ["5000", "SI",  5000, 0.005, 0.05, 300, 1],
];
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
for (const [val, name, ppt, tick, stopV, riskV, want] of CASES) {
  const r = await page.evaluate(([val, stopV, riskV]) => {
    const inst = document.getElementById("rc-inst"), stop = document.getElementById("rc-stop"), risk = document.getElementById("rc-risk");
    inst.value = val; inst.dispatchEvent(new Event("input", { bubbles: true }));
    risk.value = String(riskV); risk.dispatchEvent(new Event("input", { bubbles: true }));
    stop.value = String(stopV); stop.dispatchEvent(new Event("input", { bubbles: true }));
    const out = document.getElementById("rc-out");
    return { selected: inst.selectedOptions[0]?.textContent, step: stop.step, min: stop.min, n: document.getElementById("rc-n").value, out: out.textContent, warn: out.classList.contains("warn") };
  }, [val, stopV, riskV]);
  console.log(`  ${name}: ${JSON.stringify(r)}`);
  if (r.step !== String(tick)) fails.push(`${name}: stop step ${r.step}, want ${tick}`);
  if (r.n !== String(want)) fails.push(`${name}: ${r.n} contracts, want ${want}`);
  if (!r.out.includes(`${usd(want * ppt)} per point`)) fails.push(`${name}: per-point dollars missing (${r.out})`);
  if (!r.out.includes(`${usd(want * ppt * stopV)} at the stop`)) fails.push(`${name}: at-the-stop dollars wrong (${r.out})`);
  if (r.warn) fails.push(`${name}: unexpected warning`);
  if (!r.selected.startsWith(name)) fails.push(`${name}: option label is "${r.selected}"`);
  await page.screenshot({ path: `${OUT}/calc-${name}.png` });
}
// oversized stop on the big contract warns and names it
const warn = await page.evaluate(() => {
  const inst = document.getElementById("rc-inst"), stop = document.getElementById("rc-stop");
  inst.value = "5000"; inst.dispatchEvent(new Event("input", { bubbles: true }));
  stop.value = "1"; stop.dispatchEvent(new Event("input", { bubbles: true }));
  const out = document.getElementById("rc-out");
  return { warn: out.classList.contains("warn"), out: out.textContent };
});
console.log("  SI warn: " + JSON.stringify(warn));
if (!warn.warn || !warn.out.includes("SI costs $5,000 per contract")) fails.push("SI oversized stop did not warn correctly");
await page.screenshot({ path: `${OUT}/calc-warn.png` });

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
