// Owner view of the trade feed (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-owner-feed.mjs
// Signs in as the owner, opens their first trade from Profile, checks the ≡
// menu offers Edit / Add photo / Delete, edits the title (round-trips to the
// DB and repaints), then restores the original title.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const APP_URL = process.env.APP_URL || "http://localhost:8080/echelon/app/";
const OUT = process.env.OUT || `${tmpdir()}/app-profile-shots`; mkdirSync(OUT, { recursive: true });
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = (q) => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) }).then((r) => r.json());
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const email = (await sql("select email from admins order by added_at limit 1"))[0].email;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-gex-tour", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage(); page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.goto(APP_URL, { waitUntil: "domcontentloaded" }); await page.waitForSelector("#ov-hi", { timeout: 25000 }); await page.waitForTimeout(1200);
await page.click('#bnav button[data-view="set-profile"]'); await page.waitForTimeout(700);
const tiles = await page.locator("#pro-grid .pro-tile").count();
if (!tiles) { console.log("owner has no trades; skipping"); await browser.close(); process.exit(0); }
await page.locator("#pro-grid .pro-tile").first().click(); await page.waitForTimeout(800);
if (!(await page.locator("#rv-body .rv-menu-btn").count())) fails.push("owner has no menu button");
await page.locator("#rv-body .rv-menu-btn").first().click(); await page.waitForTimeout(200);
const items = await page.$$eval(".rv-menu button", (bs) => bs.map((b) => b.textContent.trim()));
if (items.join() !== "Edit,Add photo,Delete") fails.push("menu items: " + items.join());
await page.screenshot({ path: `${OUT}/07-owner-menu.png` });
const id = await page.$eval("#rv-body .rv-post", (p) => p.dataset.id);
const beforeRow = (await sql(`select title, outcome from member_recaps where id = '${id}'`))[0] ?? {};
const before = beforeRow.title ?? null, beforeOutcome = beforeRow.outcome ?? null;
await page.locator(".rv-menu button", { hasText: "Edit" }).click(); await page.waitForTimeout(400);
// the editor is its own screen, full size on the phone, with media strip + add tile
if (!(await page.locator("#pedit").isVisible())) fails.push("editor page did not open");
const ped = await page.locator(".pedit-sheet").boundingBox();
if (!ped || ped.height < 800) fails.push("editor not full screen: " + JSON.stringify(ped));
if (!(await page.locator("#pedit-media .pedit-tile").count())) fails.push("editor shows no media tiles");
if (!(await page.locator("#pedit-media .pedit-tile .rm").count())) fails.push("no remove control on a media tile");
if (!(await page.locator("#pedit-media .pedit-add").count())) fails.push("no Add tile");
for (const id of ["pedit-title", "pedit-body", "pedit-outcome", "pedit-r", "pedit-done", "pedit-cancel", "pedit-delete"]) if (!(await page.locator("#" + id).count())) fails.push("editor missing #" + id);
await page.screenshot({ path: `${OUT}/08-owner-edit.png` });
// Back closes the editor and leaves the feed open
await page.goBack(); await page.waitForTimeout(800);
if (await page.locator("#pedit").isVisible()) fails.push("Back did not close the editor");
if (!(await page.locator("#rvmodal").isVisible())) fails.push("Back closed the feed too");
// reopen, change the title, Done
await page.locator("#rv-body .rv-menu-btn").first().click(); await page.waitForTimeout(200);
await page.locator(".rv-menu button", { hasText: "Edit" }).click(); await page.waitForTimeout(400);
const stamp = "Harness edit " + Date.now();
await page.fill("#pedit-title", stamp); await page.locator("#pedit-outcome button", { hasText: "Win" }).click(); await page.click("#pedit-done"); await page.waitForTimeout(1500);
if (await page.locator("#pedit").isVisible()) fails.push("editor still open after Done");
const row = (await sql(`select title, outcome from member_recaps where id = '${id}'`))[0];
if (row?.title !== stamp) fails.push("edit did not persist: " + row?.title);
if (row?.outcome !== "win") fails.push("outcome did not persist: " + row?.outcome);
if (!(await page.textContent("#rv-body")).includes(stamp)) fails.push("post did not repaint with the new title");
await sql(`update member_recaps set title = ${before === null ? "null" : "'" + before.replace(/'/g, "''") + "'"}, outcome = ${beforeOutcome === null ? "null" : "'" + beforeOutcome + "'"} where id = '${id}'`);
// toast: pointer-swipe down dismisses it
await page.evaluate(() => { const t = document.getElementById("co-toast"); t.textContent = "swipe me"; t.classList.add("on"); });
await page.waitForTimeout(300);
const tb = await page.locator("#co-toast").boundingBox();
if (tb) { await page.mouse.move(tb.x + tb.width / 2, tb.y + 10); await page.mouse.down(); await page.mouse.move(tb.x + tb.width / 2, tb.y + 80, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(400); }
if (await page.evaluate(() => document.getElementById("co-toast").classList.contains("on"))) fails.push("toast did not dismiss on swipe");
await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log("owner ok");
