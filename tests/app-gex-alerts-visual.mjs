// Custom GEX alerts on the Notifications page (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-gex-alerts-visual.mjs        (ORIGIN / OUT / EMAIL / VIEWPORTS / THEME env)
// Signs in as a D1 GEX holder, opens Settings > Notifications, and builds alerts through the
// real form: NQ near the put wall, VXN above a number, vol LOW for its year. Checks each lands in
// public.gex_alerts with the right params, reads back as a sentence with a live "Now ..." line,
// that a duplicate is refused, that the switch and the delete reach the database, and that
// members cannot write the evaluator's memory. Deletes everything it made.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = [
  "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright",
  "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright",
];
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/app-gex-alerts`;
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.ORIGIN || "http://127.0.0.1:8123";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const tokenFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
const email = process.env.EMAIL || "appreview@d1fpc3.com", theme = process.env.THEME || "dark";
const sql = async (query) => (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) })).json();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const uid = session.user.id;
await sql(`delete from gex_alerts where user_id = '${uid}'`);

const fails = [], note = (s) => console.log("  " + s);
const check = (ok, what) => { note((ok ? "ok   " : "FAIL ") + what); if (!ok) fails.push(what); };
const browser = await chromium.launch();
const VP = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  wide: { viewport: { width: 2560, height: 1300 }, deviceScaleFactor: 1 },
  phone: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function run(vp) {
  console.log(`\n${vp} · ${theme} · ${email}`);
  const ctx = await browser.newContext({ ...VP[vp], permissions: ["notifications"] });
  await ctx.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", t); }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { note("PAGEERROR " + e.message); fails.push(`${vp} pageerror: ${e.message}`) });
  await page.goto(`${ORIGIN}/echelon/app/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 30000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open") } });
  await page.evaluate(() => document.querySelector('.set-row[data-go="notifs"]').click());
  await page.waitForFunction(() => { const b = document.getElementById("ga-block"); return b && !b.hidden && !!document.querySelector("#ga-list .ga-empty, #ga-list .ga-row") }, null, { timeout: 15000 });
  check(true, "the Custom GEX alerts block shows for a D1 GEX holder");
  const blk = await page.$("#ga-block"); await blk.scrollIntoViewIfNeeded();

  if (vp === "desk") {
    // 1. NQ within 25 pts of the put wall
    await page.click('#ga-kinds button[data-k="level"]');
    await page.fill("#ga-pts", "25"); await page.selectOption("#ga-target", "put_wall");
    await page.click("#ga-save"); await page.waitForFunction(() => document.querySelectorAll("#ga-list .ga-row").length === 1, null, { timeout: 10000 });
    // 2. VXN above 26.5 (prefilled with the year's 80th percentile; typed over)
    await page.click('#ga-kinds button[data-k="vxn_above"]');
    const pre = await page.inputValue("#ga-val");
    check(+pre > 10, `VXN above is prefilled with the year's high line (${pre})`);
    await page.fill("#ga-val", "26.5"); await page.click("#ga-save");
    await page.waitForFunction(() => document.querySelectorAll("#ga-list .ga-row").length === 2, null, { timeout: 10000 });
    // 3. vol goes LOW for its year
    await page.click('#ga-kinds button[data-k="vol_level"]'); await page.selectOption("#ga-to", "low"); await page.click("#ga-save");
    await page.waitForFunction(() => document.querySelectorAll("#ga-list .ga-row").length === 3, null, { timeout: 10000 });
    // a duplicate is refused
    await page.click("#ga-save"); await page.waitForTimeout(400);
    check(/already have that alert/.test(await page.textContent("#ga-msg")) && (await page.$$("#ga-list .ga-row")).length === 3, "a duplicate alert is refused");
    const rows = await sql(`select kind, params, enabled from gex_alerts where user_id = '${uid}' order by created_at`);
    check(rows.length === 3 && rows[0].kind === "level" && rows[0].params.target === "put_wall" && rows[0].params.pts === 25 && rows[1].params.value === 26.5 && rows[2].params.to === "low", `database rows: ${JSON.stringify(rows.map((r) => [r.kind, r.params]))}`);
    const txt = await page.$$eval("#ga-list .ga-row", (rs) => rs.map((r) => r.textContent.replace(/\s+/g, " ").trim()));
    check(/NQ within 25 pts of the put wall\s?Now [\d,]+ pts from [\d,]+/.test(txt[0]), `reads as a sentence with a live line: ${txt[0]}`);
    check(/VXN rises above 26.5\s?Now \d+\.\d\d/.test(txt[1]) && /Volatility goes LOW for its year\s?Now (low|normal|high|extreme), \d+ percentile/.test(txt[2]), `${txt[1]} | ${txt[2]}`);
    await page.screenshot({ path: `${OUT}/${vp}-${theme}-alerts.png`, fullPage: false });
    const box = await blk.boundingBox(); if (box) await page.screenshot({ path: `${OUT}/${vp}-${theme}-block.png`, clip: { x: box.x, y: Math.max(0, box.y), width: box.width, height: Math.min(box.height, 900) } });
    // the switch and the delete reach the database
    await page.click("#ga-list .ga-row:nth-child(2) .tgl"); await page.waitForTimeout(800);
    const en = await sql(`select enabled from gex_alerts where user_id = '${uid}' and kind = 'vxn_above'`);
    check(en[0]?.enabled === false && (await page.$("#ga-list .ga-row:nth-child(2).off")), "switching one off saves it and dims the row");
    await page.click("#ga-list .ga-row:nth-child(3) .ga-x"); await page.waitForTimeout(800);
    const left = await sql(`select kind from gex_alerts where user_id = '${uid}' order by created_at`);
    check(left.length === 2 && !left.some((r) => r.kind === "vol_level"), "deleting one removes the row");
    // a member cannot write the evaluator's memory through the API
    const r = await page.evaluate(async ([sb, key, tok]) => { const res = await fetch(`${sb}/rest/v1/gex_alerts?kind=eq.level`, { method: "PATCH", headers: { apikey: key, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ last_fired_at: "2020-01-01T00:00:00Z" }) }); return res.status }, [SB, anon, session.access_token]);
    check(r === 401 || r === 403, `PATCH last_fired_at as the member is refused (${r})`);
  } else {
    // the list the desk run left behind, at this width
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(sw <= 0, `no sideways scroll (${sw}px)`);
    const fit = await page.$$eval("#ga-kinds button", (bs) => bs.every((b) => b.getBoundingClientRect().right <= innerWidth));
    check(fit, "every alert type chip fits the screen");
    await page.click('#ga-kinds button[data-k="level"]');
    const box = await blk.boundingBox(); await page.screenshot({ path: `${OUT}/${vp}-${theme}-block.png`, clip: { x: 0, y: Math.max(0, box.y - 10), width: VP[vp].viewport.width, height: Math.min(box.height + 20, 1200) } });
  }
  await ctx.close();
}
try { for (const vp of (process.env.VIEWPORTS || "desk,wide,phone").split(",")) await run(vp); }
finally { await sql(`delete from gex_alerts where user_id = '${uid}'`); await browser.close(); }
const gone = await sql(`select count(*) n from gex_alerts where user_id = '${uid}'`);
check(+gone[0].n === 0, "everything the harness made is deleted");
console.log(`\nscreenshots: ${OUT}`);
if (fails.length) { console.log(`\n${fails.length} FAILED:\n - ` + fails.join("\n - ")); process.exit(1); }
console.log("\nall good");
