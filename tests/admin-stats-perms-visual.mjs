// Admin Statistics + Permissions harness (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080   (admin-api CORS allows :8080)
//   2. node tests/admin-stats-perms-visual.mjs        (ADMIN_URL / OUT env)
// Signs in as the owner, shoots Overview (room line), Statistics (five tallies
// + the sentence + the table) and Permissions (switch matrix + per-channel
// posting); flips one capability off and back on and one channel's posting to
// mods and back, asserting each write landed in the database.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/admin-stats-shots`;
mkdirSync(OUT, { recursive: true });
const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:8080/echelon/admin/";
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

const fails = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-admin-tour", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`${r.status()} ${r.url()}`); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const view = async (v) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`).click(), v); await page.waitForTimeout(600); };

await page.goto(ADMIN_URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("#cards .scard").length > 0, null, { timeout: 25000 });
await page.waitForTimeout(1500);
if (!(await page.locator("#ov-room").isVisible())) fails.push("Overview room line hidden");
await shot("01-overview");

await view("stats");
const answered = Number(await page.textContent("#st-answered"));
if (!(answered > 0)) fails.push(`answered ${answered}`);
const tallies = await page.locator("#st-grid .st-q").count();
if (tallies !== 5) fails.push(`tallies ${tallies}`);
const tops = await page.locator("#st-grid .st-row.top").count();
if (tops !== 5) fails.push(`top rows ${tops}`);
const read = await page.textContent("#st-read");
if (!/Most of the room/.test(read)) fails.push("read sentence: " + read);
const tableRows = await page.locator("#onb-table tbody tr").count();
if (!tableRows) fails.push("who-they-are table empty");
await shot("02-statistics");

await view("perms");
const sws = await page.locator("#perm-matrix .pm-sw").count();
if (sws !== 10) fails.push(`switches ${sws}`);
const chans = await page.locator("#perm-chan .pm-crow").count();
if (!chans) fails.push("no channel rows");
await shot("03-permissions");
// flip "Create polls" for members off, check DB, flip back
const sw = page.locator("#perm-matrix .pm-row", { hasText: "Create polls" }).locator(".pm-sw").first();
const before = (await sql("select can_create_polls from chat_role_perms where role='member'"))[0].can_create_polls;
await sw.click(); await page.waitForTimeout(1200);
const after = (await sql("select can_create_polls from chat_role_perms where role='member'"))[0].can_create_polls;
if (after === before) fails.push("perm_set did not flip can_create_polls");
if ((await sw.textContent()).trim() !== (after ? "On" : "Off")) fails.push("switch label out of sync");
await shot("04-permissions-flipped");
await sw.click(); await page.waitForTimeout(1200);
const back = (await sql("select can_create_polls from chat_role_perms where role='member'"))[0].can_create_polls;
if (back !== before) fails.push("perm_set did not restore can_create_polls");
// channel posting: General → Mods → Everyone
const gen = page.locator("#perm-chan .pm-crow", { hasText: "General" });
const genBefore = (await sql("select post_role from channels where name='General'"))[0].post_role;
await gen.locator(".seg button", { hasText: "Mods" }).click(); await page.waitForTimeout(1200);
const genAfter = (await sql("select post_role from channels where name='General'"))[0].post_role;
if (genAfter !== "mods") fails.push(`channel_post_role gave ${genAfter}`);
await gen.locator(".seg button", { hasText: genBefore === "all" ? "Everyone" : genBefore === "mods" ? "Mods" : "Owner" }).click(); await page.waitForTimeout(1200);
const genBack = (await sql("select post_role from channels where name='General'"))[0].post_role;
if (genBack !== genBefore) fails.push(`channel_post_role not restored: ${genBack}`);

await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
