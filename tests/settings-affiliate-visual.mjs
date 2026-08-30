// Settings → Affiliate: apply form inserts a pending application; once the
// row is approved (code minted) the page shows the code. App Review member.
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/settings-affiliate-visual.mjs        (APP_URL / OUT / EMAIL env)
// The account's application row is removed afterwards.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/settings-affiliate-shots`;
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
await sql(`delete from affiliate_applications where user_id = '${uid}'`);

const fails = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); sessionStorage.setItem("echelon-review-dismissed", "1"); localStorage.setItem("echelon-quotes-off", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.waitForTimeout(1200);

await page.evaluate(() => document.querySelector('.tab[data-view="settings"]').click());
await page.waitForTimeout(300);
const row = page.locator('.set-row[data-go="set-affiliate"]');
if (!(await row.isVisible())) fails.push("Affiliate row not visible in settings");
await row.click();
await page.waitForSelector("#aff-pitch", { timeout: 8000 }).catch(() => fails.push("apply form did not render"));
await page.screenshot({ path: `${OUT}/1-form.png` });
await page.fill("#aff-pitch", "Harness check — ignore. NQ Discord, 2k members.");
await page.fill("#aff-links", "https://example.com/harness");
await page.click("#aff-apply");
await page.waitForFunction(() => document.getElementById("aff-body")?.textContent.includes("Application in."), null, { timeout: 10000 }).catch(() => fails.push("pending state did not render after apply"));
await page.screenshot({ path: `${OUT}/2-pending.png` });

const saved = await sql(`select status, pitch from affiliate_applications where user_id = '${uid}'`);
if (!(saved[0]?.status === "pending" && /Harness check/.test(saved[0]?.pitch ?? ""))) fails.push(`db row wrong: ${JSON.stringify(saved)}`);

// approve (as the admin flow will) and confirm the member sees their code
await sql(`update affiliate_applications set status = 'approved', code = 'TEST42', decided_at = now() where user_id = '${uid}'`);
await page.evaluate(() => document.querySelector(".set-back").click());
await page.waitForTimeout(200);
await row.click();
await page.waitForFunction(() => document.getElementById("aff-code")?.textContent === "TEST42", null, { timeout: 8000 }).catch(() => fails.push("approved code not shown"));
await page.screenshot({ path: `${OUT}/3-approved.png` });
await browser.close();

await sql(`delete from affiliate_applications where user_id = '${uid}'`);
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log(`PASS — shots in ${OUT}`);
