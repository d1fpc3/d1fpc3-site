// Admin → Community → Affiliates: a pending application renders with reach,
// plan and the wanted code; Approve mints that code through approve_affiliate
// (real admin JWT); the row flips to approved.
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/admin-affiliates-visual.mjs
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/admin-affiliates-shots`;
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

// the member with a pending application
const member = (await sql(`select id from auth.users where email = 'appreview@d1fpc3.com'`))[0].id;
await sql(`delete from affiliate_applications where user_id = '${member}'`);
await sql(`insert into affiliate_applications (user_id, pitch, socials, followers, requested_code)
  values ('${member}', 'Harness plan — ignore.', '{"youtube":"@harness"}', '9k', 'HARNCODE')`);

// sign in as the admin
const adminEmail = (await sql(`select u.email from admins a join auth.users u on u.id = a.user_id order by a.added_at limit 1`))[0].email;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: adminEmail }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.goto("http://127.0.0.1:8123/echelon/admin/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('.tab[data-view="community"]', { timeout: 25000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('.tab[data-view="community"]').click());
await page.waitForFunction(() => document.querySelector("#aff-table tbody tr"), null, { timeout: 15000 }).catch(() => fails.push("affiliates table empty"));

const rowText = await page.evaluate(() => document.querySelector("#aff-table tbody tr")?.textContent ?? "");
if (!/appreview|@/.test(rowText)) fails.push(`member missing in row: ${rowText.slice(0, 80)}`);
if (!/youtube @harness/.test(rowText)) fails.push("socials not shown");
if (!/9k followers/.test(rowText)) fails.push("followers not shown");
if (!/wants HARNCODE/.test(rowText)) fails.push("requested code not shown");
await page.screenshot({ path: `${OUT}/1-pending.png` });

page.on("dialog", (d) => d.accept());
await page.evaluate(() => [...document.querySelectorAll("#aff-table tbody tr button")].find((b) => b.textContent === "Approve")?.click());
await page.waitForFunction(() => /approved/.test(document.querySelector("#aff-table tbody tr")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => fails.push("row did not flip to approved"));
await page.screenshot({ path: `${OUT}/2-approved.png` });
await browser.close();

const final = await sql(`select status, code from affiliate_applications where user_id = '${member}'`);
if (!(final[0]?.status === "approved" && final[0]?.code === "HARNCODE")) fails.push(`db wrong after approve: ${JSON.stringify(final)}`);

await sql(`delete from affiliate_applications where user_id = '${member}'`);
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log(`PASS — shots in ${OUT}`);
