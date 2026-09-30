// Round two of "make it easier and get people using it" (D1, 9/30: "keep going"). Manual, not a node:test.
//   node tests/app-round2-visual.mjs        (APP_URL / OUT env; ONLY=iphone,webkit,desk)
// Proves, signed in as the review account:
//   the streak: opening the app writes today's member_days row and the streak comes back (>= 1); Today shows the
//     streak chip from 2 days on; the profile shows posts, followers, following and the streak side by side, then
//     Edit profile and Share profile, and the empty-posts card whose New post opens the sheet;
//   Get started (forced on: the review account is older than a month): first on Today, five steps, the alerts card
//     standing down; Start lesson one opens Study; Say hi in General opens General with the words started (nothing
//     is sent: the box is cleared); Hide stores the flag (restored at the end);
//   double-tap a message (in a DM between the two review accounts, made and deleted here): a heart lands on it, a
//     second double-tap takes it off; reaction and notification rows are cleaned up;
//   the Journal keeps its title on a phone and the day reads on one line; no page errors.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/app-round2`; mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = async (q) => { const r = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) })).json(); if (!Array.isArray(r)) throw new Error("sql: " + JSON.stringify(r).slice(0, 300)); return r; };
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
async function mint(email) {
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
  const s = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
  if (!s.access_token) throw new Error("verify failed " + email); return s;
}
const me = await mint("appreview@d1fpc3.com"), other = await mint("appreview.new@d1fpc3.com");
const A = me.user.id, B = other.user.id;
const flagsBefore = (await sql(`select flags from member_onboarding where user_id = '${A}'`))?.[0]?.flags ?? null;
const fails = [];
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };
const VPS = { iphone: [chromium, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }], webkit: [webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }], desk: [chromium, { viewport: { width: 1440, height: 900 } }] };
async function open(tag) {
  const [eng, opt] = VPS[tag];
  const browser = await eng.launch(); const ctx = await browser.newContext(opt);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); try { if (window.Notification) Notification.requestPermission = () => Promise.resolve("default"); } catch (e) {} }, [`sb-${REF}-auth-token`, JSON.stringify(me)]);
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { state: "attached", timeout: 30000 }); await page.waitForTimeout(3000);
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open"); } });
  return { browser, page, errors };
}
const view = (page) => page.evaluate(() => document.querySelector(".view.on")?.id.replace(/^v-/, ""));
let thread = null, msgId = null;
try {
  for (const tag of (process.env.ONLY || "iphone,webkit,desk").split(",")) {
    console.log(`== ${tag}`);
    const { browser, page, errors } = await open(tag);
    const phone = tag !== "desk";
    // 1. the streak
    const today = (await sql(`select to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD') d`))[0].d;
    const row = (await sql(`select count(*)::int n from member_days where user_id = '${A}' and day = '${today}'`))[0].n;
    const streak = await page.evaluate(() => globalThis.__streak?.get());
    check(row === 1 && (streak ?? 0) >= 1, `opening the app wrote today's day (${today}, ${row} row) and the streak came back (${streak})`);
    const chip = await page.evaluate(() => { globalThis.__streak.set(3); const t = document.getElementById("td-streak"); return { shown: !t.hidden, text: t.textContent.replace(/\s+/g, " ").trim() }; });
    check(chip.shown && /^3 trading days in a row$/.test(chip.text), `Today shows the streak from 2 days on ("${chip.text}")`);
    await page.screenshot({ path: `${OUT}/${tag} 1 Today with the streak.png` });
    // 2. Get started, forced on
    await page.evaluate(async () => { globalThis.__gsForce = true; await globalThis.__gsPaint(); await globalThis.__tdPush?.(); });
    await page.waitForTimeout(500);
    const gs = await page.evaluate(() => { const s = document.getElementById("td-start-sec"), g = document.querySelector("#v-overview .td-grid > .td-sec:not([hidden])"); return { shown: !s.hidden, first: g?.id, rows: [...document.querySelectorAll("#gs-list .gs-row")].map((r) => r.dataset.k + (r.classList.contains("done") ? "+" : "")), count: document.getElementById("gs-count").textContent, push: !document.getElementById("td-push-sec").hidden }; });
    check(gs.shown && gs.first === "td-start-sec" && gs.rows.length === 5 && /of 5|All done/.test(gs.count) && !gs.push, `Get started comes first on Today: ${gs.count}, ${gs.rows.join(" ")}; the alerts card stands down`);
    await page.evaluate(() => document.getElementById("td-start-sec").scrollIntoView({ block: "center" })); await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${tag} 2 Get started.png` });
    await page.click('#gs-list .gs-row[data-k="lesson"]'); await page.waitForTimeout(1200);
    check(await view(page) === "course", `Start lesson one opens Study (${await view(page)})`);
    await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click()); await page.waitForTimeout(1200);
    await page.evaluate(async () => { globalThis.__gsForce = true; await globalThis.__gsPaint(); });
    await page.click('#gs-list .gs-row[data-k="hi"]'); await page.waitForTimeout(3500);
    const hi = await page.evaluate(() => ({ v: document.querySelector(".view.on")?.id, title: document.querySelector("#chat .ch-title h3, #chat-name")?.textContent || "", val: document.getElementById("chat-input")?.value }));
    check(hi.v === "v-chat" && /General/i.test(hi.title) && hi.val === "Hey everyone, ", `Say hi in General opens General with the words started ("${hi.val}", ${hi.title.trim()})`);
    await page.evaluate(() => { const i = document.getElementById("chat-input"); i.value = ""; i.dispatchEvent(new Event("input")); });
    if (phone) await page.evaluate(() => document.getElementById("chat-back")?.click());
    await page.waitForTimeout(600);
    // 3. the profile
    await page.evaluate(() => { const b = document.querySelector('#bnav button[data-view="set-profile"]'); if (b && b.offsetParent) b.click(); else document.getElementById("u-hit").click(); });
    await page.waitForTimeout(1800);
    const pro = await page.evaluate(() => ({ counts: [...document.querySelectorAll("#pro-follow > span")].map((s) => s.textContent.replace(/\s+/g, " ").trim()), btns: [...document.querySelectorAll("#v-set-profile .pro-btns .pro-btn")].map((b) => (b.offsetWidth > 0 ? b.textContent : "")), plus: !!document.getElementById("pro-post")?.offsetWidth, empty: !document.getElementById("pro-empty").hidden, go: document.getElementById("pro-empty-go")?.textContent }));
    check(pro.counts.length === 4 && /posts?$/.test(pro.counts[0]) && /followers?$/.test(pro.counts[1]) && /following$/.test(pro.counts[2]) && /day streak$/.test(pro.counts[3]), `the profile counts: ${pro.counts.join(" | ")}`);
    check(pro.btns.join() === "Edit profile,Share profile" && pro.plus, `then Edit profile and Share profile, and the gold + stays`);
    check(pro.empty && pro.go === "New post", "no posts yet: the card asks for the first one");
    await page.screenshot({ path: `${OUT}/${tag} 3 profile.png` });
    await page.click("#pro-empty-go"); await page.waitForTimeout(700);
    check(await page.evaluate(() => !document.getElementById("post-sheet").hidden), "its New post opens the post sheet");
    await page.click("#ps-x"); await page.waitForTimeout(600);
    // 4. the journal on a phone
    if (phone) {
      await page.evaluate(() => document.querySelector('.tab[data-view="journal"]').click()); await page.waitForTimeout(1200);
      const j = await page.evaluate(() => { const t = document.getElementById("pane-title"), h = document.getElementById("j-title"); return { title: t.offsetWidth > 0 ? t.textContent : "", h: Math.round(h.getBoundingClientRect().height) }; });
      check(j.title === "Journal" && j.h < 30, `the Journal keeps its title (${j.title}) and the day sits on one line (${j.h}px)`);
      await page.screenshot({ path: `${OUT}/${tag} 4 journal.png` });
    }
    // 5. double-tap a message (touch only)
    if (tag === "iphone") {
      const [lo, hi2] = [A, B].sort();
      thread = (await sql(`insert into dm_threads (user_lo, user_hi, last_at) values ('${lo}', '${hi2}', now()) on conflict (user_lo, user_hi) do update set last_at = now() returning id`))[0].id;
      msgId = (await sql(`insert into messages (dm_id, user_id, body, created_at) values ('${thread}', '${B}', 'Harness: double-tap this one', now()) returning id`))[0].id;
      await page.evaluate(() => document.querySelector('.tab[data-view="chat"]').click()); await page.waitForTimeout(1200);
      await page.evaluate((t) => globalThis.__chatOpen("dm", t), thread); await page.waitForTimeout(2500);
      const box = await page.evaluate((id) => { const r = document.querySelector(`#chat-log .msg[data-mid="${id}"] .m-text`)?.getBoundingClientRect(); return r ? { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 } : null; }, msgId);
      if (!box) check(false, "the test message is on screen");
      else {
        await page.touchscreen.tap(box.x, box.y); await page.waitForTimeout(120); await page.touchscreen.tap(box.x, box.y);
        await page.waitForTimeout(250);
        const pop = await page.evaluate(() => !!document.querySelector(".m-heart"));
        await page.waitForTimeout(1500);
        const n1 = (await sql(`select count(*)::int n from message_reactions where message_id = '${msgId}' and user_id = '${A}'`))[0].n;
        check(pop && n1 === 1, `a double-tap puts a heart on it (${n1} reaction, the heart popped: ${pop})`);
        await page.screenshot({ path: `${OUT}/${tag} 5 double-tap heart.png` });
        await page.touchscreen.tap(box.x, box.y); await page.waitForTimeout(120); await page.touchscreen.tap(box.x, box.y);
        await page.waitForTimeout(1800);
        const n2 = (await sql(`select count(*)::int n from message_reactions where message_id = '${msgId}' and user_id = '${A}'`))[0].n;
        check(n2 === 0, `a second double-tap takes it off (${n2})`);
        await page.touchscreen.tap(box.x, box.y); await page.waitForTimeout(700);
        const n3 = (await sql(`select count(*)::int n from message_reactions where message_id = '${msgId}' and user_id = '${A}'`))[0].n;
        check(n3 === 0, "a single tap does nothing");
      }
      await page.evaluate(() => document.getElementById("chat-back")?.click()); await page.waitForTimeout(600);
    }
    // 6. Hide stores the flag
    if (tag === "desk") {
      await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click()); await page.waitForTimeout(1200);
      await page.evaluate(async () => { globalThis.__gsForce = true; await globalThis.__gsPaint(); globalThis.__gsForce = false; });
      await page.click("#gs-hide"); await page.waitForTimeout(1500);
      const f = (await sql(`select flags->>'get_started' g from member_onboarding where user_id = '${A}'`))?.[0]?.g;
      check(f === "hidden" && await page.evaluate(() => document.getElementById("td-start-sec").hidden), `Hide puts it away for good (flag ${f})`);
    }
    check(!errors.length, `[${tag}] no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
    await browser.close();
  }
} finally {
  if (msgId) { await sql(`delete from message_reactions where message_id = '${msgId}'`); await sql(`delete from notifications where user_id in ('${A}', '${B}') and created_at > now() - interval '30 minutes' and kind = 'reaction'`); }
  if (thread) { await sql(`delete from messages where dm_id = '${thread}'`); await sql(`delete from dm_threads where id = '${thread}'`); }
  await sql(flagsBefore === null ? `update member_onboarding set flags = coalesce(flags, '{}'::jsonb) - 'get_started' where user_id = '${A}'` : `update member_onboarding set flags = '${JSON.stringify(flagsBefore).replace(/'/g, "''")}'::jsonb where user_id = '${A}'`);
  const left = await sql(`select (select count(*) from dm_threads where id = '${thread || "00000000-0000-0000-0000-000000000000"}')::int t, (select flags->>'get_started' from member_onboarding where user_id = '${A}') g`);
  console.log(`  cleanup: thread rows ${left[0].t}, get_started flag ${left[0].g ?? "(none)"}`);
}
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
