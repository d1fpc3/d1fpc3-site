// Desk: the session instrument (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-desk-visual.mjs        (APP_URL / OUT / EMAIL / THEME env)
// Signs in (default: the App Review account), opens the Desk on desktop and
// phone, and checks the tape painted (non-blank canvas pixels), the ladder
// has rows with the "NQ now" marker, the read has sentences ending in an
// Intention paragraph, the scorecard rendered, the calendar rendered, the
// crosshair tooltip appears on hover, and a past-day chip replays that
// session (strip flips to Replay, the read re-dates). Live data throughout:
// the tape function, the gex-worker and the calendar worker. Screenshots in OUT.
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

const OUT = process.env.OUT || `${tmpdir()}/app-desk`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const tokenFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
if (!mgmt) throw new Error("no Supabase access token (SUPABASE_ACCESS_TOKEN or ~/.supabase/access-token)");
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed: " + JSON.stringify(session).slice(0, 200));

const fails = [];
const note = (s) => console.log("  " + s);
const check = (ok, what) => { note((ok ? "ok   " : "FAIL ") + what); if (!ok) fails.push(what); };

const browser = await chromium.launch();
const VP = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const theme = process.env.THEME || "dark";

async function run(vpName) {
  console.log(`\n${vpName} · ${theme} · ${email}`);
  const ctx = await browser.newContext(VP[vpName]);
  await ctx.addInitScript(([k, v, t]) => {
    localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1");
    localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", t); localStorage.setItem("echelon-desk-agg", "5");
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push(`${vpName} pageerror: ${e.message}`));
  const tapeCalls = []; page.on("response", (r) => { if (r.url().includes("/functions/v1/tape")) tapeCalls.push(r.status()); });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 30000 });
  await page.waitForTimeout(2500);
  // overview strip
  const strip = await page.evaluate(() => { const b = document.getElementById("ov-desk"); return { hidden: b.hidden, px: document.getElementById("od-px").textContent, read: document.getElementById("od-read").textContent, state: document.getElementById("od-state").textContent }; });
  check(!strip.hidden && /\d/.test(strip.px), `overview strip shows a price (${strip.px}, ${strip.state}): ${strip.read}`);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-overview.png` });
  // open the desk
  await page.evaluate(() => document.querySelector('.tab[data-view="desk"]').click());
  await page.waitForFunction(() => document.getElementById("dk-ladder").children.length > 0, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const sc = document.getElementById("scrim"); if (sc && getComputedStyle(sc).opacity !== "0") sc.click(); });
  const painted = await page.evaluate(() => {
    const cv = document.getElementById("dk-canvas"); const ctx = cv.getContext("2d");
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++;
    return { w: cv.width, h: cv.height, painted: n };
  });
  check(painted.painted > 50, `tape canvas painted (${painted.w}x${painted.h}, ${painted.painted} sampled pixels)`);
  const st = await page.evaluate(() => ({
    pill: document.getElementById("dk-pill").textContent, last: document.getElementById("dk-last").textContent, chg: document.getElementById("dk-chg").textContent,
    range: document.getElementById("dk-range").textContent, until: document.getElementById("dk-until").textContent,
    ladder: document.querySelectorAll("#dk-ladder .dk-lv").length, here: !!document.querySelector("#dk-ladder .dk-lv.here"), near: document.querySelectorAll("#dk-ladder .dk-lv.near").length,
    gamma: document.querySelectorAll("#dk-ladder .sw.good, #dk-ladder .sw.bad").length, lock: !!document.querySelector("#dk-ladder .dk-lv.lock"),
    read: [...document.querySelectorAll("#dk-read p")].map((p) => p.textContent), intent: !!document.querySelector("#dk-read p.intent"),
    score: document.querySelectorAll("#dk-score .dk-sc").length, verdict: document.getElementById("dk-verdict").textContent,
    news: document.querySelectorAll("#dk-news .news-row").length, newsNone: !document.getElementById("dk-news-none").hidden,
    days: [...document.querySelectorAll("#dk-days button")].map((b) => b.textContent), stamp: document.getElementById("dk-stamp").textContent,
  }));
  check(/\d/.test(st.last), `strip: ${st.pill} · last ${st.last} ${st.chg} · range ${st.range} · until ${st.until}`);
  check(st.ladder >= 3 && st.here, `ladder: ${st.ladder} rows, NQ-now marker ${st.here}, nearest ${st.near}, gamma rows ${st.gamma}, lock row ${st.lock}`);
  check(st.read.length >= 2 && st.intent, `read: ${st.read.length} paragraphs, intention ${st.intent}`);
  for (const p of st.read) note("    " + p.slice(0, 160));
  check(st.score >= 2 || /Fills in|No regular/.test(await page.evaluate(() => document.getElementById("dk-score").textContent)), `scorecard: ${st.score} figures · ${st.verdict.slice(0, 120)}`);
  check(st.news > 0 || st.newsNone, `calendar: ${st.news} rows (none-note ${st.newsNone})`);
  check(st.days.length >= 2, `day chips: ${st.days.join(" | ")}`);
  note(`tape stamp: ${st.stamp} · tape responses: ${tapeCalls.join(",")}`);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-desk.png` });
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-desk-full.png`, fullPage: true });
  // crosshair
  const cv = await page.$("#dk-canvas"); const box = await cv.boundingBox();
  if (vpName === "phone") await page.touchscreen.tap(box.x + box.width * 0.62, box.y + box.height * 0.5);
  else await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
  await page.waitForTimeout(300);
  const tip = await page.evaluate(() => { const t = document.getElementById("dk-tip"); return { hidden: t.hidden, text: t.textContent }; });
  check(!tip.hidden && /ET/.test(tip.text), `crosshair tooltip: ${tip.text.slice(0, 90)}`);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-desk-hover.png` });
  if (vpName === "phone") await page.touchscreen.tap(box.x + 2, box.y - 30); else await page.mouse.move(2, 2);
  // 1m aggregation
  await page.evaluate(() => document.querySelector('#dk-agg button[data-v="1"]').click());
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-desk-1m.png` });
  // replay a past day
  const past = await page.evaluate(() => { const b = [...document.querySelectorAll("#dk-days button")].find((x) => x.textContent !== "Today"); if (!b) return null; b.click(); return b.textContent; });
  if (past) {
    await page.waitForFunction(() => /Replay/.test(document.getElementById("dk-pill").textContent), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const rp = await page.evaluate(() => ({ pill: document.getElementById("dk-pill").textContent, title: document.getElementById("dk-tape-title").textContent, meta: document.getElementById("dk-read-meta").textContent, score: document.querySelectorAll("#dk-score .dk-sc").length, verdict: document.getElementById("dk-verdict").textContent, last: document.getElementById("dk-last").textContent }));
    check(/Replay/.test(rp.pill) && rp.score >= 2, `replay ${past}: ${rp.pill} · ${rp.title} · last ${rp.last} · ${rp.score} figures · ${rp.verdict.slice(0, 120)}`);
    await page.screenshot({ path: `${OUT}/${vpName}-${theme}-desk-replay.png` });
    await page.screenshot({ path: `${OUT}/${vpName}-${theme}-desk-replay-full.png`, fullPage: true });
    await page.evaluate(() => [...document.querySelectorAll("#dk-days button")].find((x) => x.textContent === "Today").click());
    await page.waitForTimeout(1500);
    check(!/Replay/.test(await page.evaluate(() => document.getElementById("dk-pill").textContent)), "back to today");
  } else note("no past day to replay");
  // leaving the view stops the poll
  await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click());
  await ctx.close();
}

for (const vp of (process.env.VIEWPORTS || "desk,phone").split(",")) await run(vp);
await browser.close();
console.log(fails.length ? "\nFAILS\n - " + fails.join("\n - ") : "\nALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
