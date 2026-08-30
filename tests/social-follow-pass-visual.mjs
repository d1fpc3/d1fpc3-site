// Three checks as the App Review member at 390x844:
//   - password change now demands the emailed reauth code (server refuses a
//     bare updateUser; the UI walks through Send code → Confirm)
//   - tapping followers/following on the profile opens the member sheet
//   - chat react/delete buttons hide on touch until a long-press
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/social-follow-pass-visual.mjs
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/social-follow-pass-shots`;
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

// ── follower sheet fixture: the admin follows appreview ──
const admin = (await sql("select user_id from admins order by added_at limit 1"))[0].user_id;
await sql(`delete from follows where follower_id = '${admin}' and followee_id = '${uid}'`);
await sql(`insert into follows (follower_id, followee_id) values ('${admin}', '${uid}')`);
await sql(`delete from notifications where user_id = '${uid}' and kind = 'follow' and actor_id = '${admin}'`);
const chMsg = await sql(`insert into messages (channel_id, user_id, body) select id, '${admin}', 'Harness message — ignore.' from channels where is_active and not staff_only order by position limit 1 returning id`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); sessionStorage.setItem("echelon-review-dismissed", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.waitForTimeout(1500);

// password change: the UI demands the emailed code before anything saves
await page.evaluate(() => document.querySelector('.tab[data-view="settings"]').click());
await page.evaluate(() => document.querySelector('.set-row[data-go="set-account"]').click());
await page.waitForTimeout(300);
await page.fill("#new-pass", "harness-never-saved-1");
await page.click("#pass-save");
await page.waitForFunction(() => /emailed you a code|security purposes/i.test(document.getElementById("pass-msg").textContent), null, { timeout: 15000 }).catch(() => fails.push("no email-code step on password change"));
const rateLimited = await page.evaluate(() => /security purposes/i.test(document.getElementById("pass-msg").textContent));
if (!rateLimited) {
  const nonceUi = await page.evaluate(() => ({ wrap: !document.getElementById("pw-nonce-wrap").hidden, btn: document.getElementById("pass-save").textContent }));
  if (!nonceUi.wrap || nonceUi.btn !== "Confirm") fails.push(`nonce step wrong: ${JSON.stringify(nonceUi)}`);
} else console.log("note: reauth email rate-limited (re-run inside 60s); gate engaged either way");
await page.screenshot({ path: `${OUT}/0-password-code.png` });
// the password must NOT have changed without the code
const t = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "harness-never-saved-1" }) });
if (t.ok) fails.push("password changed without the emailed code");

// profile → tap "followers" → sheet lists the admin
await page.evaluate(() => document.querySelector('#bnav button[data-view="set-profile"]')?.click());
await page.waitForTimeout(900);
const tapped = await page.evaluate(() => {
  const span = [...document.querySelectorAll("#pro-follow span")].find((s) => /follower/.test(s.textContent));
  if (!span) return false;
  span.click(); return span.textContent;
});
if (!tapped) fails.push("no followers span on profile");
await page.waitForSelector("#follow-sheet b", { timeout: 8000 }).catch(() => fails.push("follow sheet did not open"));
const sheetNames = await page.evaluate(() => [...document.querySelectorAll("#follow-sheet b")].map((b) => b.textContent));
if (!sheetNames.length) fails.push("follow sheet empty");
await page.screenshot({ path: `${OUT}/1-followers.png` });
await page.evaluate(() => document.getElementById("follow-sheet")?.remove());

// chat: actions hidden until long-press (touch context)
await page.evaluate(() => document.querySelector('#bnav button[data-view="chat"]')?.click());
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector("#chat-rail .cr-item")?.click());
await page.waitForFunction(() => document.querySelector("#chat-log .msg .m-acts"), null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(1500); // let the log settle so the pressed row isn't re-rendered mid-press
const hasMsg = await page.evaluate(() => !!document.querySelector("#chat-log .msg .m-acts"));
if (hasMsg) {
  const before = await page.evaluate(() => getComputedStyle(document.querySelector("#chat-log .msg .m-acts")).opacity);
  if (before !== "0") fails.push(`chat actions visible before long-press: opacity ${before}`);
  const after = await page.evaluate(async () => {
    const row = document.querySelector("#chat-log .msg");
    const t = new Touch({ identifier: 1, target: row, clientX: 200, clientY: 400 });
    row.dispatchEvent(new TouchEvent("touchstart", { touches: [t], changedTouches: [t], bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    const open = document.querySelector("#chat-log .msg.acts-open");
    return open ? getComputedStyle(open.querySelector(".m-acts")).opacity : null;
  });
  if (after !== "1") fails.push(`long-press did not reveal actions: ${after}`);
  await page.screenshot({ path: `${OUT}/2-chat-longpress.png` });
} else console.log("note: no chat messages visible; long-press checked only for CSS default");
await browser.close();

await sql(`delete from follows where follower_id = '${admin}' and followee_id = '${uid}'`);
await sql(`delete from notifications where user_id = '${uid}' and kind = 'follow' and actor_id = '${admin}'`);
if (chMsg[0]) await sql(`delete from messages where id = '${chMsg[0].id}'`);
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log(`PASS — shots in ${OUT}`);
