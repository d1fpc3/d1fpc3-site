// Profile page + member trades + round-4 nav checks (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-profile-visual.mjs        (APP_URL / OUT / EMAIL env)
// Phone: bottom nav ≤ 50px tall with a home icon and a gold count bubble slot
// on Chat; Study has no "Your path" bar; Profile shows avatar / @name / stats /
// gear (→ Settings) / Edit profile (folds the form) / trades grid or empty
// line; a member with posted trades opens from Members with a tiles grid, and
// a tile opens the recap viewer. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-profile-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://localhost:8080/echelon/app/";
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
// someone who has posted trades, to view from the outside
const poster = (await sql("select p.username, count(*) n from member_recaps r join profiles p on p.user_id = r.user_id group by p.username order by n desc limit 1"))[0];

const fails = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`${r.status()} ${r.url()}`); });
await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.waitForTimeout(1200);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const view = async (v) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`).click(), v); await page.waitForTimeout(500); };

// nav
const navBox = await page.locator("#bnav").boundingBox();
if (!navBox || navBox.height > 50) fails.push(`nav height ${navBox?.height}`);
if (!(await page.locator('#bnav button[data-view="overview"] svg path[d^="M3 10.5"]').count())) fails.push("home icon missing");
if (!(await page.locator('#bnav button[data-view="chat"] .bcount').count())) fails.push("chat count bubble slot missing");
// fake an unread count and check the bubble mirrors it
await page.evaluate(() => { const n = document.getElementById("n-chat"); n.textContent = "3"; n.hidden = false; });
await page.waitForTimeout(150);
const bub = await page.$eval('#bnav button[data-view="chat"] .bcount', (b) => ({ hidden: b.hidden, t: b.textContent }));
if (bub.hidden || bub.t !== "3") fails.push("chat bubble did not mirror the count: " + JSON.stringify(bub));
await shot("01-nav-bubble");
await page.evaluate(() => { const n = document.getElementById("n-chat"); n.hidden = true; });

// study
await view("course");
if (await page.locator("#course-head").count()) fails.push("course-head still in the DOM");
if (/Your path|Straight into the setups/.test(await page.textContent("#v-course"))) fails.push('"Your path" copy still on Study');
await shot("02-study");

// profile
await page.click('#bnav button[data-view="set-profile"]'); await page.waitForTimeout(600);
for (const id of ["pro-av", "pro-name", "pro-stats", "pro-settings", "pro-edit", "pro-grid"]) if (!(await page.locator("#" + id).count())) fails.push("profile missing #" + id);
if (await page.locator("#v-set-profile .set-back").count()) fails.push("profile still has the Settings back link");
if (!(await page.locator("#pro-edit-wrap").isHidden())) fails.push("edit form open by default");
const name = await page.textContent("#pro-name");
if (!/^@\w/.test(name.trim())) fails.push("profile name: " + name);
const statsText = await page.textContent("#pro-stats");
if (!/trades?/.test(statsText) || !/win rate/.test(statsText) || !/net R/.test(statsText)) fails.push("stats row: " + statsText);
await shot("03-profile");
await page.click("#pro-edit"); await page.waitForTimeout(300);
if (await page.locator("#pro-edit-wrap").isHidden()) fails.push("Edit profile did not open the form");
await shot("04-profile-edit");
await page.click("#pro-edit-done"); await page.waitForTimeout(200);
await page.click("#pro-settings"); await page.waitForTimeout(400);
if (!(await page.locator("#v-settings").evaluate((e) => e.classList.contains("on")))) fails.push("gear did not open Settings");

// someone else's profile with trades
if (poster) {
  await view("members"); await page.waitForTimeout(1200);
  const card = page.locator(".member-grid button, .member-grid [role=button], .member-grid .member", { hasText: poster.username }).first();
  if (!(await card.count())) fails.push("member card not found for " + poster.username);
  else {
    await card.click(); await page.waitForTimeout(1500);
    if (!(await page.evaluate(() => document.getElementById("mm-scrim").classList.contains("on")))) fails.push("member modal did not open");
    const tiles = await page.locator("#mm-grid .pro-tile").count();
    if (tiles < 1) fails.push(`no tiles for ${poster.username} (has ${poster.n})`);
    if (!/trades?/.test(await page.textContent("#mm-stats"))) fails.push("member stats missing");
    await shot("05-member-profile");
    if (tiles) {
      await page.locator("#mm-grid .pro-tile").first().click(); await page.waitForTimeout(600);
      if (!(await page.locator("#rvmodal").isVisible())) fails.push("recap viewer did not open");
      if (!(await page.locator("#rv-body .mr-item").count())) fails.push("recap viewer empty");
      await shot("06-recap-view");
    }
  }
} else console.log("(no member has posted trades yet)");

await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
