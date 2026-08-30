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
await page.fill("#aff-yt", "@harnessyt");
await page.fill("#aff-ig", "@harnessig");
await page.fill("#aff-followers", "12k");
await page.fill("#aff-pitch", "Harness check — ignore. NQ Discord, 2k members.");
await page.fill("#aff-code-want", "harness1");
await page.click("#aff-apply");
await page.waitForFunction(() => document.getElementById("aff-body")?.textContent.includes("Application in."), null, { timeout: 10000 }).catch(() => fails.push("pending state did not render after apply"));
await page.screenshot({ path: `${OUT}/2-pending.png` });

const saved = await sql(`select status, pitch, socials, followers, requested_code from affiliate_applications where user_id = '${uid}'`);
if (!(saved[0]?.status === "pending" && /Harness check/.test(saved[0]?.pitch ?? ""))) fails.push(`db row wrong: ${JSON.stringify(saved)}`);
if (saved[0]?.socials?.youtube !== "@harnessyt" || saved[0]?.socials?.instagram !== "@harnessig") fails.push(`socials wrong: ${JSON.stringify(saved[0]?.socials)}`);
if (saved[0]?.followers !== "12k") fails.push(`followers wrong: ${saved[0]?.followers}`);
if (saved[0]?.requested_code !== "HARNESS1") fails.push(`requested_code wrong: ${saved[0]?.requested_code}`);

// approve honoring the requested code (mirrors approve_affiliate) and confirm the member sees it
await sql(`update affiliate_applications set status = 'approved', code = requested_code, decided_at = now() where user_id = '${uid}'`);
await page.evaluate(() => document.querySelector(".set-back").click());
await page.waitForTimeout(200);
await row.click();
await page.waitForFunction(() => document.getElementById("aff-code")?.textContent === "HARNESS1", null, { timeout: 8000 }).catch(() => fails.push("approved code not shown"));
await page.screenshot({ path: `${OUT}/3-approved.png` });

// statistics page: a member sees no "Everyone" table; the heat fills the width
await page.evaluate(() => document.querySelector(".set-back").click());
await page.evaluate(() => document.querySelector('.set-row[data-go="set-stats"]').click());
await page.waitForTimeout(400);
const stx = await page.evaluate(() => {
  const everyone = document.getElementById("stx-everyone");
  const heat = document.getElementById("stx-heat");
  const wrap = heat.parentElement.getBoundingClientRect();
  const hr = heat.getBoundingClientRect();
  return { everyoneHidden: !everyone || everyone.hidden, heatW: hr.width, wrapW: wrap.width, cells: heat.children.length };
});
if (!stx.everyoneHidden) fails.push("member can still see Everyone stats");
if (stx.cells > 0 && stx.heatW < stx.wrapW * 0.95) fails.push(`heat not full width: ${stx.heatW}/${stx.wrapW}`);
await page.screenshot({ path: `${OUT}/4-stats.png` });
await browser.close();

await sql(`delete from affiliate_applications where user_id = '${uid}'`);
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log(`PASS — shots in ${OUT}`);
