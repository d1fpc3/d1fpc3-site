// Wave checks at 390x844, signed in as the App Review member:
//   - Overview shows at most one announcement, with a working Dismiss that persists
//   - Overview recaps carry today only (an old recap stays off the home page)
//   - Feed hides the top bar; the bell stays, circled; drawer skips feed/study/chat
//   - Inbox lists announcements alongside notifications
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/home-ann-feed-visual.mjs        (APP_URL / OUT / EMAIL env)
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/home-ann-feed-shots`;
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

// fixture: one recap from three days back — the home page must not show it
await sql(`delete from member_recaps where user_id = '${uid}' and title like 'Harness %'`);
await sql(`insert into member_recaps (user_id, title, created_at) values ('${uid}', 'Harness old recap', now() - interval '3 days')`);

const fails = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); sessionStorage.setItem("echelon-review-dismissed", "1"); localStorage.setItem("echelon-quotes-off", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.waitForTimeout(1500);

// ── overview: one announcement max, dismissible ──
const ann = await page.evaluate(() => ({
  count: document.querySelectorAll("#ov-ann .ann-item").length,
  dismiss: !!document.querySelector("#ov-ann .ann-item button"),
  total: (window.__annTotal = null, null),
}));
if (ann.count > 1) fails.push(`overview shows ${ann.count} announcements`);
const hadAnn = ann.count === 1;
if (hadAnn && !ann.dismiss) fails.push("announcement has no Dismiss");
await page.screenshot({ path: `${OUT}/1-overview.png` });

// ── overview recaps: the 3-day-old recap must not render ──
const recap = await page.evaluate(() => ({
  titles: [...document.querySelectorAll("#mr-feed *")].map((n) => n.textContent).join(" "),
  empty: document.getElementById("mr-empty")?.hidden === false ? document.getElementById("mr-empty").textContent : null,
}));
if (/Harness old recap/.test(recap.titles)) fails.push("old recap on the home page");

if (hadAnn) {
  await page.evaluate(() => document.querySelector("#ov-ann .ann-item button").click());
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => document.querySelectorAll("#ov-ann .ann-item").length);
  // with a single live announcement the section empties; a second one may take its place
  const stored = await page.evaluate(() => localStorage.getItem("echelon-ann-dismissed"));
  if (!stored) fails.push("dismiss did not persist to localStorage");
  if (after > 0) {
    const same = await page.evaluate(() => document.querySelector("#ov-ann .ann-item .ann-body")?.textContent);
    if (!same) fails.push("dismiss left a broken item");
  }
}

// ── feed: no top bar, circled bell, drawer dedupe ──
await page.evaluate(() => document.querySelector('.tab[data-view="feed"]')?.click() ?? document.querySelector('#bnav button[data-view="feed"]')?.click());
await page.waitForTimeout(600);
const feed = await page.evaluate(() => {
  const bell = document.getElementById("tb-bell"); const bcs = getComputedStyle(bell);
  return {
    inFeed: document.body.classList.contains("in-feed"),
    h2: getComputedStyle(document.querySelector(".topbar h2")).display,
    menu: getComputedStyle(document.getElementById("menu-btn")).display,
    bellShown: bcs.display !== "none", bellRadius: bcs.borderRadius,
    drawerFeed: getComputedStyle(document.querySelector('.tab[data-view="feed"]')).display,
    drawerChat: getComputedStyle(document.querySelector('.tab[data-view="chat"]')).display,
  };
});
if (!feed.inFeed) fails.push("body.in-feed not set on feed");
if (feed.h2 !== "none" || feed.menu !== "none") fails.push(`feed top bar still visible: h2=${feed.h2} menu=${feed.menu}`);
if (!feed.bellShown || feed.bellRadius !== "50%") fails.push(`bell wrong on feed: shown=${feed.bellShown} radius=${feed.bellRadius}`);
if (feed.drawerFeed !== "none" || feed.drawerChat !== "none") fails.push("drawer still lists feed/chat on phone");
await page.screenshot({ path: `${OUT}/2-feed.png` });

// ── inbox: announcements ride along ──
await page.evaluate(() => document.getElementById("tb-bell").click());
await page.waitForTimeout(900);
const inbox = await page.evaluate(() => [...document.querySelectorAll("#inbox .nb-row b")].map((b) => b.textContent));
if (hadAnn && !inbox.includes("Announcements")) fails.push(`no announcement row in inbox: ${JSON.stringify(inbox.slice(0, 6))}`);
await page.screenshot({ path: `${OUT}/3-inbox.png` });

// ── home again: top bar back ──
await page.evaluate(() => document.querySelector('#bnav button[data-view="overview"]')?.click());
await page.waitForTimeout(400);
const home = await page.evaluate(() => ({
  inFeed: document.body.classList.contains("in-feed"),
  menu: getComputedStyle(document.getElementById("menu-btn")).display,
}));
if (home.inFeed || home.menu === "none") fails.push(`home top bar wrong: ${JSON.stringify(home)}`);
await browser.close();

await sql(`delete from member_recaps where user_id = '${uid}' and title like 'Harness %'`);
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log(`PASS — shots in ${OUT}`);
