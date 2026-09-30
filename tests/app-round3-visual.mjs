// Round three (D1, 9/30: "keep going"). Manual, not a node:test.
//   node tests/app-round3-visual.mjs        (APP_URL / OUT env; ONLY=iphone,desk)
// Proves, signed in as the review account:
//   Today's "Your study" card names the lesson you are on (or the first not done), where it sits in its chapter and
//   how much of the course is done, and one tap opens that lesson in Study;
//   while Get started shows (forced on), the What's next pill stands down: one onboarding at a time;
//   chat's "Online now" row: empty with nobody else around; with someone online (the owner, put into the presence
//   set by hand, since only members can join presence) it shows them first in the list, and a tap opens the DM
//   (an existing thread: nothing is created, nothing is sent). No page errors.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/app-round3`; mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = async (q) => { const r = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) })).json(); if (!Array.isArray(r)) throw new Error("sql: " + JSON.stringify(r).slice(0, 200)); return r; };
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const me = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!me.access_token) throw new Error("verify failed");
const A = me.user.id;
const owner = (await sql(`select id from auth.users where email = 'd1fpc3@gmail.com'`))[0].id;
const [lo, hi] = [A, owner].sort();
const hadThread = (await sql(`select count(*)::int n from dm_threads where user_lo = '${lo}' and user_hi = '${hi}'`))[0].n > 0;
const flagsBefore = (await sql(`select flags from member_onboarding where user_id = '${A}'`))?.[0]?.flags ?? null;
const fails = [];
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };
const VPS = { iphone: [webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }], desk: [chromium, { viewport: { width: 1440, height: 900 } }] };
try {
  for (const tag of (process.env.ONLY || "iphone,desk").split(",")) {
    console.log(`== ${tag}`);
    const [eng, opt] = VPS[tag];
    const browser = await eng.launch(); const ctx = await browser.newContext(opt);
    await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); try { if (window.Notification) Notification.requestPermission = () => Promise.resolve("default"); } catch (e) {} }, [`sb-${REF}-auth-token`, JSON.stringify(me)]);
    const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#td-h1", { state: "attached", timeout: 30000 }); await page.waitForTimeout(3500);
    await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open"); } });
    // 1. Your study
    const st = await page.evaluate(() => { const s = document.getElementById("td-study-sec"); return { shown: !s.hidden, num: document.getElementById("ts-num").textContent, title: document.getElementById("ts-title").textContent, meta: document.getElementById("ts-meta").textContent, go: document.getElementById("ts-go").textContent }; });
    check(st.shown && /^\d{2}$/.test(st.num) && st.title && /^Lesson \d+ of \d+ · \d+% done$/.test(st.meta) && /^(Start|Continue)$/.test(st.go), `Your study: ${st.num} "${st.title}", ${st.meta}, ${st.go}`);
    await page.evaluate(() => document.getElementById("td-study-sec").scrollIntoView({ block: "center" })); await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${tag} 1 your study.png` });
    await page.click("#td-study"); await page.waitForTimeout(2200);
    const lesson = await page.evaluate(() => ({ view: document.querySelector(".view.on")?.id, map: document.getElementById("v-course").classList.contains("map-mode"), h: document.querySelector("#lesson h1, #lesson h2, .lesson-title")?.textContent?.trim() || "" }));
    check(lesson.view === "v-course" && !lesson.map, `one tap opens the lesson in Study (${lesson.view}, map ${lesson.map}, "${lesson.h.slice(0, 40)}")`);
    await page.screenshot({ path: `${OUT}/${tag} 2 the lesson.png` });
    // 2. one onboarding at a time
    await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click()); await page.waitForTimeout(1200);
    await page.evaluate(async () => { globalThis.__gsForce = true; await globalThis.__gsPaint(); });
    await page.waitForTimeout(300);
    const one = await page.evaluate(() => ({ gs: !document.getElementById("td-start-sec").hidden, pill: !document.getElementById("nextup")?.hidden }));
    check(one.gs && !one.pill, `while Get started shows, the What's next pill stands down (pill shown: ${one.pill})`);
    await page.evaluate(() => { globalThis.__gsForce = false; });
    // 3. Online now
    await page.evaluate(() => document.querySelector('.tab[data-view="chat"]').click()); await page.waitForTimeout(2500);
    if (tag === "iphone") await page.evaluate(() => { if (document.getElementById("chat").classList.contains("open-convo")) document.getElementById("chat-back").click(); });
    await page.waitForTimeout(500);
    const empty = await page.evaluate((me) => { globalThis.__online.clear(); globalThis.__online.add(me); globalThis.__presencePaint(); return document.getElementById("cr-online").hidden; }, A);
    check(empty, "with only you online, there is no Online now row");
    const row = await page.evaluate((o) => { globalThis.__online.add(o); globalThis.__presencePaint(); const box = document.getElementById("cr-online"), r = box.getBoundingClientRect(), first = document.querySelector("#chat-rail > *:not([hidden])"); return { shown: !box.hidden, first: first?.id, people: [...box.querySelectorAll(".cr-on .crn")].map((n) => n.textContent), top: Math.round(r.top) }; }, owner);
    check(row.shown && row.first === "cr-online" && row.people.length === 1, `someone online shows first in the list: ${row.people.join(", ")}`);
    await page.screenshot({ path: `${OUT}/${tag} 3 online now.png` });
    await page.click(`#cr-online .cr-on[data-uid="${owner}"]`); await page.waitForTimeout(2500);
    const dm = await page.evaluate(() => ({ open: document.getElementById("chat").classList.contains("open-convo") || !!document.querySelector("#chat-main .chat-head h3"), title: document.querySelector("#chat .ch-title h3, #chat-name")?.textContent || "" }));
    check(/d1fpc3/.test(dm.title), `a tap opens the DM (${dm.title.trim()})`);
    check(!errors.length, `[${tag}] no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
    await browser.close();
  }
} finally {
  if (!hadThread) { const t = await sql(`select id from dm_threads where user_lo = '${lo}' and user_hi = '${hi}'`); for (const r of t) { await sql(`delete from messages where dm_id = '${r.id}'`); await sql(`delete from dm_threads where id = '${r.id}'`); } }
  await sql(flagsBefore === null ? `update member_onboarding set flags = coalesce(flags, '{}'::jsonb) - 'get_started' - 'nextup_hidden' where user_id = '${A}'` : `update member_onboarding set flags = '${JSON.stringify(flagsBefore).replace(/'/g, "''")}'::jsonb where user_id = '${A}'`);
  const left = await sql(`select (select count(*) from dm_threads where user_lo = '${lo}' and user_hi = '${hi}')::int t`);
  console.log(`  cleanup: DM threads with the owner ${left[0].t} (had one before: ${hadThread})`);
}
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
