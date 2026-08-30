// Batch checks, App Review member at 390x844:
//   - like/follow churn only ever notifies once (SQL-level, trigger dedupe)
//   - feed: top bar fully transparent in light theme, bell is frosted glass
//   - post meta condensed (rv-ago 9.5px, rv-likes 12px)
//   - tapping the likes line opens the likers sheet with usernames
//   - a horizontal swipe on notifications returns to the prior view
//   - settings back buttons are underlined, no pill
//   - native flag hides the Windows download row (Affiliate is the bottom row)
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/social-polish-visual.mjs
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/social-polish-shots`;
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
const fails = [];

// ── trigger dedupe, pure SQL ──
const admin = (await sql("select user_id from admins order by added_at limit 1"))[0].user_id;
await sql(`delete from member_recaps where user_id = '${uid}' and title = 'Harness dedupe post'`);
const rec = (await sql(`insert into member_recaps (user_id, title) values ('${uid}', 'Harness dedupe post') returning id`))[0].id;
await sql(`delete from notifications where recap_id = '${rec}'`);
for (let i = 0; i < 3; i++) {
  await sql(`insert into post_likes (recap_id, user_id) values ('${rec}', '${admin}')`);
  if (i < 2) await sql(`delete from post_likes where recap_id = '${rec}' and user_id = '${admin}'`);
}
const likeN = (await sql(`select count(*)::int as n from notifications where user_id = '${uid}' and kind = 'like' and actor_id = '${admin}' and recap_id = '${rec}'`))[0].n;
if (likeN !== 1) fails.push(`re-like made ${likeN} notifications (want 1)`);
await sql(`delete from follows where follower_id = '${admin}' and followee_id = '${uid}'`);
await sql(`delete from notifications where user_id = '${uid}' and kind = 'follow' and actor_id = '${admin}'`);
for (let i = 0; i < 3; i++) {
  await sql(`insert into follows (follower_id, followee_id) values ('${admin}', '${uid}')`);
  if (i < 2) await sql(`delete from follows where follower_id = '${admin}' and followee_id = '${uid}'`);
}
const folN = (await sql(`select count(*)::int as n from notifications where user_id = '${uid}' and kind = 'follow' and actor_id = '${admin}'`))[0].n;
if (folN !== 1) fails.push(`re-follow made ${folN} notifications (want 1)`);

// ── UI ──
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); sessionStorage.setItem("echelon-review-dismissed", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-theme", "light"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.waitForTimeout(1500);

// settings back button: underline, no pill
await page.evaluate(() => document.querySelector('.tab[data-view="settings"]').click());
await page.evaluate(() => document.querySelector('.set-row[data-go="set-account"]').click());
await page.waitForTimeout(300);
const back = await page.evaluate(() => {
  const b = document.querySelector("#v-set-account .set-back"); const cs = getComputedStyle(b);
  return { underline: cs.textDecorationLine, bg: cs.backgroundColor, radius: cs.borderRadius };
});
if (!/underline/.test(back.underline)) fails.push(`set-back not underlined: ${JSON.stringify(back)}`);
if (back.bg !== "rgba(0, 0, 0, 0)" && back.bg !== "transparent") fails.push(`set-back has a background: ${back.bg}`);

// feed: transparent bar (light theme) + glass bell + condensed meta + likers sheet
await page.evaluate(() => document.querySelector('#bnav button[data-view="feed"]').click());
await page.waitForTimeout(1200);
const feed = await page.evaluate(() => {
  const tb = getComputedStyle(document.querySelector(".topbar"));
  const bell = getComputedStyle(document.getElementById("tb-bell"));
  const ago = document.querySelector(".rv-ago") ? getComputedStyle(document.querySelector(".rv-ago")).fontSize : null;
  const likes = document.querySelector(".rv-likes:not([style*='none'])") ? getComputedStyle(document.querySelector(".rv-likes:not([style*='none'])")).fontSize : null;
  return { tbBg: tb.backgroundColor, tbBorder: tb.borderBottomWidth, bellBlur: bell.backdropFilter || bell.webkitBackdropFilter, ago, likes };
});
if (feed.tbBg !== "rgba(0, 0, 0, 0)" && feed.tbBg !== "transparent") fails.push(`feed top bar paints in light theme: ${feed.tbBg}`);
if (feed.tbBorder !== "0px") fails.push(`feed top bar border: ${feed.tbBorder}`);
if (!/blur/.test(feed.bellBlur ?? "")) fails.push(`bell not glass: ${feed.bellBlur}`);
if (feed.ago && feed.ago !== "9px") fails.push(`rv-ago ${feed.ago}`);
if (feed.likes && feed.likes !== "12px") fails.push(`rv-likes ${feed.likes}`);
await page.screenshot({ path: `${OUT}/1-feed.png` });

// likers sheet on the harness post (admin liked it above)
const opened = await page.evaluate(() => {
  const posts = [...document.querySelectorAll(".rv-likes")].filter((d) => d.style.display !== "none" && d.textContent);
  if (!posts.length) return false;
  posts[0].click(); return true;
});
if (opened) {
  await page.waitForSelector("#likers-sheet b", { timeout: 8000 }).catch(() => fails.push("likers sheet did not open"));
  const names = await page.evaluate(() => [...document.querySelectorAll("#likers-sheet b")].map((b) => b.textContent));
  if (!names.length) fails.push("likers sheet empty");
  await page.screenshot({ path: `${OUT}/2-likers.png` });
  await page.evaluate(() => document.getElementById("likers-sheet")?.remove());
} else fails.push("no liked post visible in feed to test likers sheet");

// swipe on notifications goes back (enter inbox from feed)
await page.evaluate(() => document.getElementById("tb-bell").click());
await page.waitForTimeout(600);
await page.evaluate(() => {
  const v = document.getElementById("v-inbox");
  const touch = (x) => new Touch({ identifier: 1, target: v, clientX: x, clientY: 300 });
  v.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(300)], changedTouches: [touch(300)], bubbles: true }));
  for (const x of [280, 240, 190, 140]) v.dispatchEvent(new TouchEvent("touchmove", { touches: [touch(x)], changedTouches: [touch(x)], bubbles: true }));
  v.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [touch(120)], bubbles: true }));
});
await page.waitForTimeout(600);
const after = await page.evaluate(() => document.querySelector(".view.on").id);
if (after !== "v-feed") fails.push(`swipe from inbox landed on ${after} (want v-feed)`);
await browser.close();

// native flag: Windows row hidden, Affiliate bottom
const browser2 = await chromium.launch();
const c2 = await browser2.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await c2.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-native", "1"); sessionStorage.setItem("echelon-review-dismissed", "1"); localStorage.setItem("echelon-quotes-off", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const p2 = await c2.newPage();
await p2.goto(APP_URL, { waitUntil: "domcontentloaded" });
await p2.waitForSelector("#ov-hi", { timeout: 25000 });
await p2.waitForTimeout(800);
await p2.evaluate(() => document.querySelector('.tab[data-view="settings"]').click());
const rows = await p2.evaluate(() => [...document.querySelectorAll(".set-index .set-row")].filter((r) => !r.hidden && getComputedStyle(r).display !== "none").map((r) => r.querySelector("b").textContent));
if (rows.includes("Echelon for Windows")) fails.push("Windows row still in the native app");
if (rows[rows.length - 1] !== "Affiliate") fails.push(`bottom settings row is ${rows[rows.length - 1]} (want Affiliate)`);
await browser2.close();

// cleanup
await sql(`delete from post_likes where recap_id = '${rec}'`);
await sql(`delete from notifications where recap_id = '${rec}'`);
await sql(`delete from follows where follower_id = '${admin}' and followee_id = '${uid}'`);
await sql(`delete from notifications where user_id = '${uid}' and kind = 'follow' and actor_id = '${admin}'`);
await sql(`delete from member_recaps where id = '${rec}'`);

if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log(`PASS — shots in ${OUT}`);
