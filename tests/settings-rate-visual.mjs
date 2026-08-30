// Settings → "Rate Echelon" opens the review popup, sends stars to the
// reviews table, and prefills on reopen. Signs in as the App Review member.
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/settings-rate-visual.mjs        (APP_URL / OUT / EMAIL env)
// The account's prior review (or its absence) is restored afterwards.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/settings-rate-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
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
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const uid = session.user.id;

const prior = await sql(`select rating, comment from reviews where user_id = '${uid}'`);
const fails = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); sessionStorage.setItem("echelon-review-dismissed", "1"); localStorage.setItem("echelon-quotes-off", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.waitForTimeout(1200);

// wipe any prior review so the send is a real insert
await sql(`delete from reviews where user_id = '${uid}'`);

await page.evaluate(() => document.querySelector('.tab[data-view="settings"]').click());
await page.waitForTimeout(300);
const row = page.locator("#set-rate-row");
if (!(await row.isVisible())) fails.push("Rate Echelon row not visible in settings");
await page.screenshot({ path: `${OUT}/1-settings.png` });

await row.click();
await page.waitForTimeout(600);
if (await page.locator("#review-pop").isHidden()) fails.push("review popup did not open from the row");
await page.click('label[for="r4"]');
await page.fill("#review-text", "Harness check — ignore.");
await page.screenshot({ path: `${OUT}/2-popup.png` });
await page.click("#review-send");
await page.waitForFunction(() => { const t = document.getElementById("review-msg").textContent; return t.length > 0 && t !== "Sending…"; }, null, { timeout: 15000 });
const msg = await page.textContent("#review-msg");
if (msg !== "Thank you.") fails.push(`send message: "${msg}"`);

const saved = await sql(`select rating, comment from reviews where user_id = '${uid}'`);
if (!(saved[0]?.rating === 4 && /Harness check/.test(saved[0]?.comment ?? ""))) fails.push(`db row wrong: ${JSON.stringify(saved)}`);

// reopen: prefilled with what they sent
await page.waitForTimeout(1400); // popup auto-hides
await row.click();
await page.waitForTimeout(600);
const pre = await page.evaluate(() => ({ r4: document.getElementById("r4").checked, text: document.getElementById("review-text").value }));
if (!pre.r4 || !/Harness check/.test(pre.text)) fails.push(`reopen not prefilled: ${JSON.stringify(pre)}`);
await page.screenshot({ path: `${OUT}/3-reopen.png` });
await browser.close();

// restore the account's original state
await sql(`delete from reviews where user_id = '${uid}'`);
if (prior[0]) await sql(`insert into reviews (user_id, rating, comment) values ('${uid}', ${prior[0].rating}, ${prior[0].comment === null ? "null" : `'${String(prior[0].comment).replace(/'/g, "''")}'`})`);

if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log(`PASS — shots in ${OUT}`);
