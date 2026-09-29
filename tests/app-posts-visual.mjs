// Posting from the profile (manual, not a node:test).
//   node tests/app-posts-visual.mjs        (APP_URL / OUT / EMAIL / ONLY=desk,iphone env)
// Proves: Today carries no composer; the profile has a gold + that opens the New post sheet with the cursor in
// it; Post stays off until there is something to share; a draft survives Esc/close; a line plus a chart posts,
// closes the sheet, says Posted and lands first in the profile grid; the member-facing words say "posts".
// The test post (row + uploaded image) is deleted at the end so it never reaches a feed or a scoreboard.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { deflateSync } from "zlib";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/app-posts`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = (q) => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) }).then((r) => r.json());
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const uid = session.user.id;
// a small solid PNG, made here so the test needs no fixture file
function png(w, h, [r, g, b]) {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array(h).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
}
const fails = [], made = [];
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };
const VPS = { desk: [chromium, { viewport: { width: 1440, height: 900 } }], iphone: [webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }] };
for (const tag of (process.env.ONLY || "desk,iphone").split(",")) {
  const [eng, opt] = VPS[tag];
  console.log(`== ${tag}`);
  const browser = await eng.launch();
  const ctx = await browser.newContext(opt);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("PAGEERROR " + e.message); fails.push(`${tag} pageerror ${e.message}`); });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open"); } });
  // 1. Today has no composer
  const today = await page.evaluate(() => ({ sec: document.getElementById("mr-sec")?.hidden, visible: [...document.querySelectorAll("#v-overview input, #v-overview textarea")].some((n) => n.offsetParent && /session|post/i.test(n.placeholder || "")), log: /Log today's session/.test(document.getElementById("v-overview").innerText) }));
  check(today.sec && !today.visible && !today.log, `[${tag}] Today carries no composer`);
  await page.screenshot({ path: `${OUT}/${tag} 1 Today.png` });
  // 2. the profile's +
  await page.evaluate(() => { const b = document.querySelector('#bnav button[data-view="set-profile"]'); if (b && b.offsetParent) b.click(); else document.getElementById("u-hit").click(); });
  await page.waitForTimeout(1200);
  const plus = await page.evaluate(() => { const b = document.getElementById("pro-post"), r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { view: document.querySelector(".view.on").id, w: r.width, h: r.height, bg: cs.backgroundColor, title: b.title }; });
  check(plus.view === "v-set-profile" && plus.w >= 34 && plus.h >= 34 && plus.title === "New post", `[${tag}] the profile has a + (${Math.round(plus.w)}x${Math.round(plus.h)}, ${plus.bg})`);
  await page.screenshot({ path: `${OUT}/${tag} 2 profile with the +.png` });
  await page.locator("#pro-post").click();
  await page.waitForTimeout(700);
  const open = await page.evaluate(() => ({ shown: !document.getElementById("post-sheet").hidden && document.getElementById("post-sheet").classList.contains("on"), focus: document.activeElement?.id, off: document.getElementById("mr-post").disabled, who: document.getElementById("ps-who").textContent }));
  check(open.shown && open.focus === "mr-body" && open.off, `[${tag}] + opens New post with the cursor in it and Post off (${open.who}, focus ${open.focus})`);
  await page.screenshot({ path: `${OUT}/${tag} 3 New post.png` });
  // 3. a draft survives closing
  const words = `Harness post ${Date.now()}: NQ held the put wall into the close.`;
  await page.locator("#mr-body").fill(words);
  check(await page.evaluate(() => !document.getElementById("mr-post").disabled), `[${tag}] a line lights Post up`);
  if (tag === "iphone") await page.locator("#ps-x").click(); else await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  check(await page.evaluate(() => document.getElementById("post-sheet").hidden), `[${tag}] ${tag === "iphone" ? "the close button" : "Esc"} closes it`);
  await page.locator("#pro-post").click();
  await page.waitForTimeout(600);
  check(await page.evaluate((w) => document.getElementById("mr-body").value === w, words), `[${tag}] the draft is still there on reopening`);
  // 4. attach a chart and post
  await page.setInputFiles("#mr-file", { name: "harness-chart.png", mimeType: "image/png", buffer: png(64, 40, [201, 162, 74]) });
  await page.waitForFunction(() => document.querySelector("#mr-pending .dz-file.done"), null, { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/${tag} 4 a line and a chart.png` });
  await page.locator("#mr-post").click();
  await page.waitForFunction(() => document.getElementById("post-sheet").hidden, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(900);
  const row = (await sql(`select id, body, media from member_recaps where user_id = '${uid}' order by created_at desc limit 1`))?.[0];
  if (row?.body === words) made.push(row);
  const after = await page.evaluate(() => ({ hidden: document.getElementById("post-sheet").hidden, toast: document.querySelector(".toast, #toast")?.textContent || "", first: document.querySelector("#pro-grid .pro-tile img")?.src || "", empty: document.getElementById("pro-empty").hidden, body: document.getElementById("mr-body").value }));
  check(row?.body === words && (row?.media ?? []).length === 1, `[${tag}] the post landed: one row with the line and the chart`);
  check(after.hidden && after.body === "" && /recap-media/.test(after.first), `[${tag}] the sheet closes, the fields clear, the post is first in the grid`);
  await page.screenshot({ path: `${OUT}/${tag} 5 posted.png` });
  // 5. the words
  const words2 = await page.evaluate(() => ({ likes: document.querySelector("#v-notifs")?.innerText.includes("likes one of your posts"), trades: /trades posted|your first trade|posted a trade/i.test(document.body.innerText) }));
  check(words2.likes && !words2.trades, `[${tag}] members read "posts", not "trades"`);
  await browser.close();
}
// clean up every harness post: the row and its image
for (const r of made) {
  for (const m of r.media ?? []) {
    const path = decodeURIComponent((m.url || "").split("/recap-media/")[1] || "");
    if (path) await fetch(`${SB}/storage/v1/object/recap-media/${path}`, { method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` } });
  }
  await sql(`delete from member_recaps where id = '${r.id}'`);
}
const left = await sql(`select count(*)::int n from member_recaps where user_id = '${uid}' and body like 'Harness post %'`);
check(left?.[0]?.n === 0, `harness posts cleaned up (${made.length} deleted, ${left?.[0]?.n} left)`);
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
