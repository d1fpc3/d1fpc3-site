// The engagement loop (D1, 2026-10-01: "implement all of that"), end to end. Manual, not a node:test.
//   node tests/app-engage-loop-visual.mjs        (APP_URL / ADMIN_URL / SITE_URL / OUT / ONLY env)
// Real data, test accounts only, nothing in a real channel:
//  1. Bias today: a "Bias today?" poll is put in a DM between the two App Review accounts (members cannot see it,
//     and send-push skips bias polls on the message path), so appreview@ votes on Today for real: Long, then Short,
//     each landing in poll_votes; the tiles fill to the split. send-push { bias_poll, dry } counts its targets.
//  2. Study plan: appreview@ picks 3 a week on Today; member_onboarding.flags.study lands; the card keeps score.
//     The course-done card (harness flag) offers what is next.
//  3. Live: d1fpc3@ schedules a session in Admin, Community for a far-off New York evening (stored in UTC
//     correctly), Today shows a live card from a stubbed near session (countdown, Google link, .ics), then the
//     admin cancels the real one.
//  4. Settings: the five new switches, an email switch round-trips to notify_prefs.
//  5. Email: the unsubscribe page turns the digest off with a signed link.
// Everything the run changed on the two accounts is put back at the end.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { createHmac } from "crypto";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-engage-loop`; mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const ADMIN_URL = process.env.ADMIN_URL || "http://127.0.0.1:8123/echelon/admin/";
const SITE_URL = (process.env.SITE_URL || "http://127.0.0.1:8123/").replace(/\/?$/, "/");
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = async (q) => { const r = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) })).json(); if (!Array.isArray(r)) throw new Error("sql: " + JSON.stringify(r).slice(0, 300)); return r; };
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
async function mint(email) {
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
  const s = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
  if (!s.access_token) throw new Error("verify failed for " + email); return s;
}
const fails = []; const ok = (c, w) => { console.log((c ? "  ok   " : "  FAIL ") + w); if (!c) fails.push(w); };
const q = (s) => String(s).replace(/'/g, "''");

const [{ id: ME }] = await sql(`select id from auth.users where email = 'appreview@d1fpc3.com'`);
const [{ id: NEW }] = await sql(`select id from auth.users where email = 'appreview.new@d1fpc3.com'`);
const [orig] = await sql(`select (select flags from member_onboarding where user_id = '${ME}') flags, (select alerts from notify_prefs where user_id = '${ME}') alerts, exists (select 1 from notify_prefs where user_id = '${ME}') has_prefs`);
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const [lo, hi] = [ME, NEW].sort();
let threadMade = false, msgId = null, liveId = null;
const secret = (await sql(`select decrypted_secret s from vault.decrypted_secrets where name = 'push_webhook_secret'`))[0].s;

async function restore() {
  try {
    if (msgId) await sql(`delete from poll_votes where message_id = '${msgId}'; delete from messages where id = '${msgId}'`);
    if (threadMade) await sql(`delete from dm_threads where user_lo = '${lo}' and user_hi = '${hi}'`);
    if (liveId) await sql(`delete from live_reminders where session_id = '${liveId}'; delete from live_sessions where id = '${liveId}'`);
    await sql(`update member_onboarding set flags = ${orig.flags ? `'${q(JSON.stringify(orig.flags))}'::jsonb` : "flags - 'study'"} where user_id = '${ME}'`);
    if (orig.has_prefs) await sql(`update notify_prefs set alerts = ${orig.alerts ? `'${q(JSON.stringify(orig.alerts))}'::jsonb` : "null"} where user_id = '${ME}'`);
    else await sql(`delete from notify_prefs where user_id = '${ME}'`);
    console.log("restored the test accounts");
  } catch (e) { console.log("RESTORE FAILED: " + e.message); fails.push("restore"); }
}

const ONLY = (process.env.ONLY || "bias,study,live,settings,email").split(",");
try {
  // ── setup: the test poll lives in a DM between the two review accounts ──
  if (ONLY.includes("bias")) {
    const had = await sql(`select id from dm_threads where user_lo = '${lo}' and user_hi = '${hi}'`);
    let tid = had[0]?.id;
    if (!tid) { tid = (await sql(`insert into dm_threads (user_lo, user_hi) values ('${lo}', '${hi}') returning id`))[0].id; threadMade = true; }
    msgId = (await sql(`insert into messages (dm_id, user_id, body, poll) values ('${tid}', '${NEW}', null, '${q(JSON.stringify({ q: "Bias today?", opts: ["Long", "Short", "Flat"], kind: "bias", day }))}'::jsonb) returning id`))[0].id;
    // a second member's vote, so the split has two sides
    await sql(`insert into poll_votes (message_id, user_id, choice) values ('${msgId}', '${NEW}', 1)`);
    const dry = await (await fetch(`${SB}/functions/v1/send-push`, { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": secret }, body: JSON.stringify({ bias_poll: msgId, dry: true }) })).json();
    ok(dry.kind === "bias" && dry.members > 0 && dry.targets <= dry.members, `send-push bias_poll counts its targets without sending: ${JSON.stringify(dry)}`);
    const viaMsg = await (await fetch(`${SB}/functions/v1/send-push`, { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": secret }, body: JSON.stringify({ message_id: msgId }) })).json();
    ok(/bias poll pushes on its own/.test(viaMsg.skipped || ""), `the chat-message path leaves the bias poll alone: ${JSON.stringify(viaMsg)}`);
  }

  for (const [tag, eng, opt] of [["desk", chromium, { viewport: { width: 1440, height: 900 } }], ["iphone", webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }]]) {
    console.log(`== ${tag}`);
    const browser = await eng.launch();
    const ctx = await browser.newContext(opt);
    const session = await mint("appreview@d1fpc3.com");
    await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-push-ask", String(Date.now() + 9e11)); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    // the live card reads a stubbed session (the real one, far off, is the admin's test below)
    const soon = { id: "00000000-0000-4000-8000-00000000live", title: "Week-ahead levels", starts_at: new Date(Date.now() + 2 * 3600e3 + 5 * 60e3).toISOString(), duration_min: 60, url: "https://example.com/live", notes: "Bring your Sunday levels.", repeat_weekly: true };
    await page.route(/rest\/v1\/live_sessions\?/, (r) => r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([soon]) }) : r.continue());
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#td-h1", { timeout: 30000 });
    await page.waitForTimeout(2500);

    if (ONLY.includes("bias")) {
      await page.evaluate(() => globalThis.__engage.bias());
      await page.waitForSelector("#td-bias-sec:not([hidden]) .tb-opt", { timeout: 15000 }).catch(() => {});
      const before = await page.evaluate(() => ({ shown: !document.getElementById("td-bias-sec").hidden, tiles: [...document.querySelectorAll("#td-bias .tb-opt .tb-l")].map((n) => n.textContent), q: document.querySelector("#td-bias .tb-q")?.textContent }));
      ok(before.shown && before.tiles.join() === "Long,Short,Flat", `[${tag}] Bias today shows on Today: ${before.tiles.join(" / ")} · "${before.q}"`);
      await page.locator("#td-bias-sec").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}/${tag} 1 bias before.png` });
      const tile = (i) => page.locator(`#td-bias .tb-opt[data-i="${i}"]`);
      if (tag === "iphone") await tile(0).tap(); else await tile(0).click();
      await page.waitForTimeout(1300);
      let v = await sql(`select choice from poll_votes where message_id = '${msgId}' and user_id = '${ME}'`);
      const shown = await page.evaluate(() => ({ voted: document.querySelector("#td-bias .tb-opts")?.classList.contains("voted"), pct: [...document.querySelectorAll("#td-bias .tb-p")].map((n) => n.textContent), you: document.querySelector("#td-bias .tb-opt.mine .tb-l")?.textContent, fill: getComputedStyle(document.querySelector('#td-bias .tb-opt[data-i="0"] .tb-fill')).height }));
      ok(v[0]?.choice === 0 && shown.voted && shown.you === "Long" && shown.pct.join() === "50%,50%,0%", `[${tag}] a tap on Long votes for real (poll_votes choice ${v[0]?.choice}) and the split shows ${shown.pct.join(" ")} (fill ${shown.fill})`);
      await page.screenshot({ path: `${OUT}/${tag} 2 bias voted.png` });
      if (tag === "iphone") await tile(1).tap(); else await tile(1).click();
      await page.waitForTimeout(1300);
      v = await sql(`select choice from poll_votes where message_id = '${msgId}' and user_id = '${ME}'`);
      const sw = await page.evaluate(() => [...document.querySelectorAll("#td-bias .tb-p")].map((n) => n.textContent).join());
      ok(v.length === 1 && v[0].choice === 1 && sw === "0%,100%,0%", `[${tag}] changing to Short moves the one vote (choice ${v[0]?.choice}, split ${sw})`);
      await sql(`delete from poll_votes where message_id = '${msgId}' and user_id = '${ME}'`);
    }

    if (ONLY.includes("study")) {
      await page.evaluate(() => globalThis.__engage.study());
      const plan0 = await page.evaluate(() => ({ shown: !document.getElementById("ts-plan").hidden, text: document.getElementById("ts-plan").textContent.replace(/\s+/g, " ").trim() }));
      ok(plan0.shown && /Set a weekly pace/.test(plan0.text) && /2a week3a week5a week/.test(plan0.text.replace(/\s/g, "").replace(/aweek/g, "a week")), `[${tag}] the study card offers a pace: "${plan0.text.slice(0, 90)}"`);
      await page.locator("#ts-plan").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}/${tag} 3 plan pick.png` });
      const three = page.locator('#ts-plan .tp-seg button[data-n="3"]');
      if (tag === "iphone") await three.tap(); else await three.click();
      await page.waitForTimeout(1500);
      const f = await sql(`select flags -> 'study' st from member_onboarding where user_id = '${ME}'`);
      const plan1 = await page.evaluate(() => ({ text: document.getElementById("ts-plan").textContent.replace(/\s+/g, " ").trim(), dots: document.querySelectorAll("#ts-plan .tp-dots i").length, set: document.getElementById("ts-plan").classList.contains("set") }));
      ok(f[0]?.st?.pace === 3 && f[0]?.st?.since === day && plan1.set && plan1.dots === 3 && /This week \d of 3/.test(plan1.text), `[${tag}] 3 a week saves (${JSON.stringify(f[0]?.st)}) and keeps score: "${plan1.text}"`);
      await page.screenshot({ path: `${OUT}/${tag} 4 plan set.png` });
      await page.evaluate(() => globalThis.__engage.studyDone(true));
      const done = await page.evaluate(() => ({ card: !document.getElementById("ts-done").hidden, btn: document.getElementById("td-study").hidden, plan: document.getElementById("ts-plan").hidden, go: [...document.querySelectorAll("#ts-done .tsd-go b")].map((b) => b.textContent) }));
      ok(done.card && done.btn && done.plan && done.go.length === 3, `[${tag}] a finished course shows what is next: ${done.go.join(" / ")}`);
      await page.locator("#td-study-sec").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}/${tag} 5 course done.png` });
      await page.evaluate(() => globalThis.__engage.studyDone(false));
      // the next viewport starts from no plan again
      await sql(`update member_onboarding set flags = flags - 'study' where user_id = '${ME}'`);
    }

    if (ONLY.includes("live")) {
      await page.evaluate(() => globalThis.__engage.live());
      await page.waitForSelector("#td-live-sec:not([hidden]) .tl-date", { timeout: 15000 }).catch(() => {});
      const lv = await page.evaluate(() => ({ title: document.querySelector("#td-live .tl-tx b")?.textContent, cd: document.querySelector("#td-live .tl-cd")?.textContent, when: document.querySelector("#td-live .tl-when")?.textContent, g: document.querySelector("#td-live a.tl-cal")?.href, join: !!document.querySelector("#td-live .tl-join"), tile: document.querySelector("#td-live .tl-date")?.textContent }));
      ok(lv.title === "Week-ahead levels" && /^in 2h [45]m$/.test(lv.cd || "") && /ET · every week/.test(lv.when) && !lv.join, `[${tag}] the live card counts down: ${lv.cd} · ${lv.when} · tile ${lv.tile} · no join link yet`);
      ok(/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Week-ahead%20levels&dates=\d{8}T\d{6}Z\/\d{8}T\d{6}Z/.test(lv.g || "") && /recur=RRULE:FREQ%3DWEEKLY/.test(lv.g), `[${tag}] Google Calendar link carries the time and the weekly repeat`);
      const ics = await page.evaluate((s) => globalThis.__engage.ics({ ...s, at: Date.parse(s.starts_at) }), soon);
      ok(/BEGIN:VEVENT[\s\S]*DTSTART:\d{8}T\d{6}Z[\s\S]*RRULE:FREQ=WEEKLY[\s\S]*TRIGGER:-PT15M/.test(ics), "the .ics has the start, the weekly rule and a 15 minute alarm");
      await page.locator("#td-live-sec").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}/${tag} 6 live later.png` });
      // ten minutes out: the join link appears
      await page.evaluate((s) => globalThis.__engage.set("live", { ...s, at: Date.now() + 10 * 60e3 }), soon);
      const lj = await page.evaluate(() => ({ join: document.querySelector("#td-live .tl-join")?.textContent.trim(), href: document.querySelector("#td-live .tl-join")?.getAttribute("href") }));
      ok(/Join/.test(lj.join || "") && lj.href === "https://example.com/live", `[${tag}] 10 minutes out the join link shows: "${lj.join}"`);
      await page.evaluate((s) => globalThis.__engage.set("live", { ...s, at: Date.now() - 5 * 60e3 }), soon);
      const ln = await page.evaluate(() => ({ live: document.querySelector("#td-live .tl-live")?.textContent, join: document.querySelector("#td-live .tl-join")?.textContent.trim() }));
      ok(ln.live === "Live now" && /Join live/.test(ln.join || ""), `[${tag}] once started it says Live now with Join live`);
      await page.screenshot({ path: `${OUT}/${tag} 7 live now.png` });
    }

    if (ONLY.includes("settings")) {
      await page.evaluate(() => document.querySelector('.tab[data-view="overview"]')?.click());
      await page.goto(APP_URL + "?start=notifs", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#v-notifs.on #nt-bias", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const sw = await page.evaluate(() => Object.fromEntries(["nt-bias", "nt-live", "nt-study", "nt-email-digest", "nt-email-nudge"].map((id) => [id, document.getElementById(id)?.checked])));
      ok(Object.values(sw).every((v) => v === true), `[${tag}] ?start=notifs opens Notifications; the five new switches are on by default: ${JSON.stringify(sw)}`);
      await page.locator("#nt-email-digest").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}/${tag} 8 switches.png` });
      const tg = page.locator("#nt-email-digest + .track");
      if (tag === "iphone") await tg.tap(); else await tg.click();
      await page.waitForTimeout(1500);
      let a = await sql(`select alerts -> 'email_digest' v from notify_prefs where user_id = '${ME}'`);
      ok(a[0]?.v === false, `[${tag}] switching the Sunday email off lands in notify_prefs (${JSON.stringify(a[0]?.v)})`);
      if (tag === "iphone") await tg.tap(); else await tg.click();
      await page.waitForTimeout(1500);
      a = await sql(`select alerts -> 'email_digest' v from notify_prefs where user_id = '${ME}'`);
      ok(a[0]?.v === true, `[${tag}] and back on (${JSON.stringify(a[0]?.v)})`);
    }
    ok(!errors.length, `[${tag}] no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
    await browser.close();
  }

  // ── the admin schedules a real session (far off, so nobody's Today shows it) and cancels it ──
  if (ONLY.includes("live")) {
    console.log("== admin");
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const session = await mint("d1fpc3@gmail.com");
    // the admin walkthrough clicks through every tab on a first visit: mark it seen
    await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-admin-tour", "1"); localStorage.setItem("echelon-gex-tour", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(ADMIN_URL, { waitUntil: "domcontentloaded" });
    // the admin boots into its own view once its data is in; open Community after that, or boot flips it back
    await page.waitForFunction(() => /\d/.test(document.getElementById("c-users")?.textContent || ""), null, { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector('.tab[data-view="community"]').click());
    await page.waitForSelector("#v-community #live-save", { state: "visible", timeout: 20000 });
    // centred, so the sticky top bar never sits over the buttons
    const centre = (sel) => page.evaluate((q) => document.querySelector(q)?.scrollIntoView({ block: "center" }), sel);
    await centre("#live-save");
    await page.fill("#live-title", "zz harness live");
    await page.fill("#live-when", "2027-01-10T19:00");
    await page.fill("#live-url", "https://example.com/zz");
    await page.click("#live-save");
    await page.waitForFunction(() => /Scheduled for/.test(document.getElementById("live-msg").textContent), null, { timeout: 15000 }).catch(() => {});
    const row = await sql(`select id, starts_at, duration_min, repeat_weekly, url from live_sessions where title = 'zz harness live' and canceled_at is null`);
    liveId = row[0]?.id;
    ok(row.length === 1 && new Date(row[0].starts_at).toISOString() === "2027-01-11T00:00:00.000Z" && row[0].duration_min === 60, `admin: 7:00 PM New York on Jan 10 2027 is stored as ${row[0] && new Date(row[0].starts_at).toISOString()} (EST, UTC-5)`);
    const t = await page.evaluate(() => [...document.querySelectorAll("#live-table tbody tr")].map((r) => r.textContent.replace(/\s+/g, " ")).find((x) => /zz harness live/.test(x)));
    ok(/Sun, Jan 10, 7:00 PM · 60 min/.test(t || "") && /Once/.test(t || ""), `admin: the table lists it: "${t}"`);
    await page.locator("#live-block").screenshot({ path: `${OUT}/admin live.png` });
    const k = await sql(`select public.live_next_at(starts_at, duration_min, repeat_weekly) n from live_sessions where id = '${liveId}'`);
    ok(new Date(k[0].n).toISOString() === "2027-01-11T00:00:00.000Z", "live_next_at agrees");
    await centre("#live-table");
    const row2 = page.locator("#live-table tbody tr", { hasText: "zz harness live" });
    await row2.locator("button", { hasText: "Cancel" }).click();
    await page.getByRole("button", { name: "Cancel session" }).click().catch(async () => { await page.locator("button", { hasText: "Cancel session" }).click(); });
    await page.waitForTimeout(1500);
    const c = await sql(`select canceled_at is not null c from live_sessions where id = '${liveId}'`);
    ok(c[0]?.c === true, "admin: Cancel stamps canceled_at, and the row leaves the table");
    ok(!errors.length, `admin: no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
    await browser.close();
  }

  // ── the unsubscribe page, with a link signed the way member-mail signs it ──
  if (ONLY.includes("email")) {
    console.log("== email");
    const sig = createHmac("sha256", secret).update(`${ME}.digest`).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 32);
    const browser = await webkit.launch();
    const page = await (await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(`${SITE_URL}echelon/email/?u=${encodeURIComponent(`${ME}.digest.${sig}`)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => /Done|did not work/.test(document.getElementById("h").textContent), null, { timeout: 20000 }).catch(() => {});
    const h = await page.textContent("#h");
    const a = await sql(`select alerts -> 'email_digest' v from notify_prefs where user_id = '${ME}'`);
    ok(h === "Done. No more of these." && a[0]?.v === false, `the signed footer link turns the Sunday email off ("${h}", db ${JSON.stringify(a[0]?.v)})`);
    await page.screenshot({ path: `${OUT}/email unsubscribed.png` });
    await page.goto(`${SITE_URL}echelon/email/?u=${encodeURIComponent(`${ME}.digest.${"x".repeat(32)}`)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => /Done|did not work/.test(document.getElementById("h").textContent), null, { timeout: 20000 }).catch(() => {});
    ok((await page.textContent("#h")) === "That link did not work.", "a forged link changes nothing");
    await page.screenshot({ path: `${OUT}/email bad link.png` });
    await browser.close();
  }
} catch (e) { fails.push("crash: " + e.message); console.log(e); }
finally { await restore(); }
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
