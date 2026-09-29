// The chat refine (D1, 09-29: "refine to the max", "choose any emoji"); manual, not a node:test.
//   node tests/app-chat-refine-visual.mjs        (APP_URL / OUT / ONLY=desk,iphone env)
// Works ONLY in a DM between the two App Review accounts it sets up, so nobody real sees a reaction or gets a push.
// Proves: the composer is a pill with send inside that turns ready with text; a desk's hover bar and quick bar lead
// to the full emoji picker, a search finds any emoji and the reaction lands; the emoji button types into the field;
// on an iPhone the conversation owns the screen (no title bar, no dock, header at the top, composer at the
// bottom, 16px type), a hold opens the action sheet, its quick reaction lands, and "+" opens the picker as a sheet.
// Everything it made (thread, messages, reactions, their notifications, the temporary profile) is deleted.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/app-chat-refine`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = (q) => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) }).then((r) => r.json());
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const mint = async (email) => { const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json(); const s = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json(); if (!s.access_token) throw new Error("verify " + email); return s; };
const me = await mint("appreview@d1fpc3.com"), other = await mint("appreview.new@d1fpc3.com");
const A = me.user.id, B = other.user.id, [lo, hi] = A < B ? [A, B] : [B, A];
// the fixture: a DM between the two review accounts, with a few lines from the other one
const hadProfile = ((await sql(`select 1 from profiles where user_id = '${B}'`)) || []).length > 0;
if (!hadProfile) await sql(`insert into profiles (user_id, username) values ('${B}', 'harness_new')`);
const otherName = (await sql(`select username from profiles where user_id = '${B}'`))?.[0]?.username;
const thread = (await sql(`insert into dm_threads (user_lo, user_hi, last_at) values ('${lo}', '${hi}', now()) on conflict (user_lo, user_hi) do update set last_at = now() returning id`))?.[0]?.id;
const lines = ["Harness: NQ held the put wall into the close", "Harness: flip is 30,700, watching it", "Harness: what do you make of the 10:00 print?"];
const msgIds = [];
for (const [i, t] of lines.entries()) msgIds.push((await sql(`insert into messages (dm_id, user_id, body, created_at) values ('${thread}', '${B}', '${t.replace(/'/g, "''")}', now() - interval '${(lines.length - i) * 3} minutes') returning id`))?.[0]?.id);
const fails = [];
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };
const myRx = async () => (await sql(`select message_id, emoji from message_reactions where user_id = '${A}' and message_id in (${msgIds.map((x) => `'${x}'`).join(",")})`)) || [];
const VPS = { desk: [chromium, { viewport: { width: 1440, height: 900 } }], iphone: [webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }] };
// the picker: type into its search, take the emoji whose name is the query (else the first that starts with it)
const pickEmoji = async (page, query) => {
  await page.waitForSelector(".ep-pop .ep-search input", { timeout: 20000 });
  await page.locator(".ep-pop .ep-search input").fill(query);
  const find = `(() => { const all = [...document.querySelectorAll(".ep-pop .ep-e")]; return all.find((b) => b.getAttribute("aria-label") === ${JSON.stringify(query)}) || all.find((b) => (b.getAttribute("aria-label") || "").startsWith(${JSON.stringify(query)} + " ")); })()`;
  await page.waitForFunction(find, null, { timeout: 15000 });
  return page.evaluate(`(() => { const b = ${find}; b.click(); return b.textContent.trim(); })()`);
};
try {
  for (const tag of (process.env.ONLY || "desk,iphone").split(",")) {
    const [eng, opt] = VPS[tag];
    console.log(`== ${tag}`);
    const browser = await eng.launch();
    const ctx = await browser.newContext(opt);
    await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); try { if (window.Notification) Notification.requestPermission = () => Promise.resolve("denied"); } catch {} }, [`sb-${REF}-auth-token`, JSON.stringify(me)]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => { console.log("PAGEERROR " + e.message); fails.push(`${tag} pageerror ${e.message}`); });
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#td-h1", { state: "attached", timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open"); } });
    if (tag === "iphone") await page.locator('#bnav button[data-view="chat"]').tap(); else await page.locator('.side-nav .tab[data-view="chat"]').click();
    await page.waitForTimeout(2500);
    const row = page.locator("#chat-dms .cr-item", { hasText: otherName }).first();
    if (tag === "iphone") await row.tap(); else await row.click();
    await page.waitForFunction((t) => [...document.querySelectorAll("#chat-log .m-text")].some((n) => n.textContent.includes(t)), lines[2], { timeout: 20000 });
    await page.waitForTimeout(800);
    // the composer
    const c0 = await page.evaluate(() => { const t = document.getElementById("chat-input"), s = document.getElementById("chat-send"), f = t.getBoundingClientRect(), b = s.getBoundingClientRect(); return { radius: parseFloat(getComputedStyle(t).borderRadius), fs: getComputedStyle(t).fontSize, inside: b.left > f.left && b.right <= f.right + 1 && b.top >= f.top - 1 && b.bottom <= f.bottom + 1, ready: document.getElementById("chat-composer").classList.contains("ready") }; });
    check(c0.radius >= 18 && c0.inside && !c0.ready, `[${tag}] the composer is a pill with send inside it, not ready while empty (radius ${c0.radius}, font ${c0.fs})`);
    await page.locator("#chat-input").fill("typing a line");
    await page.waitForTimeout(250);
    const r1 = await page.evaluate(() => document.getElementById("chat-composer").classList.contains("ready"));
    await page.locator("#chat-input").fill("");
    await page.waitForTimeout(250);
    const r2 = await page.evaluate(() => document.getElementById("chat-composer").classList.contains("ready"));
    check(r1 && !r2, `[${tag}] send turns ready with text and back when it is cleared`);
    if (tag === "desk") {
      await page.screenshot({ path: `${OUT}/${tag} 1 conversation.png` });
      // hover bar -> quick bar -> any emoji
      const target = page.locator("#chat-log .msg", { hasText: lines[0] }).first();
      await target.hover(); await page.waitForTimeout(350);
      const bar = await target.evaluate((r) => { const a = r.querySelector(".m-acts"); return { op: getComputedStyle(a).opacity, n: a.querySelectorAll("button").length }; });
      check(+bar.op > 0.9 && bar.n >= 2, `[${tag}] hovering a message shows the floating action bar (${bar.n} actions)`);
      await page.screenshot({ path: `${OUT}/${tag} 2 hover bar.png` });
      await target.locator(".m-react").click(); await page.waitForTimeout(400);
      const qb = await page.evaluate(() => ({ n: document.querySelectorAll(".rx-pop button").length, more: !!document.querySelector(".rx-pop .rx-more") }));
      check(qb.n === 8 && qb.more, `[${tag}] the quick bar has the seven and a way to every emoji`);
      await page.screenshot({ path: `${OUT}/${tag} 3 quick bar.png` });
      await page.locator(".rx-pop .rx-more").click();
      const picked = await pickEmoji(page, "rocket");
      await page.screenshot({ path: `${OUT}/${tag} 4 emoji picker.png` }).catch(() => {});
      await page.waitForTimeout(1800);
      const rx = await myRx();
      check(picked === "🚀" && rx.some((r) => r.emoji === "🚀" && r.message_id === msgIds[0]), `[${tag}] a search for "rocket" finds ${picked} and the reaction lands on the message`);
      check(await page.evaluate(() => [...document.querySelectorAll(".rx-chip.mine .e")].some((e) => e.textContent === "🚀")), `[${tag}] the 🚀 pill shows as yours`);
      await page.screenshot({ path: `${OUT}/${tag} 5 reaction landed.png` });
      // the composer's emoji button types into the field
      await page.locator("#cc-emoji-btn").click();
      const typed = await pickEmoji(page, "fire");
      await page.waitForTimeout(400);
      const val = await page.evaluate(() => ({ v: document.getElementById("chat-input").value, ready: document.getElementById("chat-composer").classList.contains("ready") }));
      check(val.v.includes(typed) && typed === "🔥" && val.ready, `[${tag}] the emoji button types ${typed} into the field ("${val.v}")`);
      await page.locator("#chat-input").fill("");
    } else {
      const g = await page.evaluate(() => { const R = (s) => { const n = document.querySelector(s); if (!n || !n.offsetParent) return null; const r = n.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; }; const nav = document.getElementById("bnav"); return { topbar: R(".topbar"), head: R(".chat-head"), comp: R("#chat-composer"), vh: innerHeight, dock: nav ? nav.getBoundingClientRect().top >= innerHeight - 2 || getComputedStyle(nav).display === "none" : true, text: getComputedStyle(document.querySelector("#chat-log .m-text")).fontSize, sub: document.getElementById("chat-online")?.textContent }; });
      check(!g.topbar && g.head && g.head[0] <= 2 && g.comp && g.comp[1] >= g.vh - 2 && g.dock, `[${tag}] the conversation owns the screen: header at ${g.head?.[0]}, composer ending at ${g.comp?.[1]} of ${g.vh}, no title bar, no dock`);
      check(g.text === "16px", `[${tag}] messages read at ${g.text}`);
      await page.screenshot({ path: `${OUT}/${tag} 1 conversation.png` });
      // a hold opens the action sheet (through the page hook: headless WebKit has no Touch constructor)
      const held = await page.evaluate(async (t) => {
        const row = [...document.querySelectorAll("#chat-log .msg")].find((r) => r.textContent.includes(t)); const txt = row.querySelector(".m-text"); const r = txt.getBoundingClientRect();
        window.__chatSheet(row); await new Promise((ok) => setTimeout(ok, 400));
        const s = document.querySelector(".ms-sheet");
        return s ? { prev: s.querySelector(".ms-prev p")?.textContent, quick: s.querySelectorAll(".ms-rx button").length, items: [...s.querySelectorAll(".ms-item span")].map((x) => x.textContent) } : null;
      }, lines[1]);
      check(!!held && held.prev === lines[1] && held.quick === 7 && held.items.includes("Reply") && held.items.includes("Copy text"), `[${tag}] a hold opens the action sheet: ${JSON.stringify(held)}`);
      await page.screenshot({ path: `${OUT}/${tag} 2 action sheet.png` });
      await page.locator(".ms-rx button", { hasText: "🔥" }).tap();
      await page.waitForTimeout(1800);
      check((await myRx()).some((r) => r.emoji === "🔥" && r.message_id === msgIds[1]) && !(await page.$(".ms-sheet")), `[${tag}] its 🔥 lands on the message and the sheet closes`);
      await page.screenshot({ path: `${OUT}/${tag} 3 reaction landed.png` });
      // "+" in the sheet opens the picker as a sheet
      await page.evaluate(async (t) => { const row = [...document.querySelectorAll("#chat-log .msg")].find((r) => r.textContent.includes(t)); window.__chatSheet(row); await new Promise((ok) => setTimeout(ok, 400)); }, lines[2]);
      await page.locator(".ms-rx .rx-more").tap();
      const picked = await pickEmoji(page, "gem");
      await page.waitForTimeout(1800);
      check(!!picked && (await myRx()).some((r) => r.emoji === picked && r.message_id === msgIds[2]), `[${tag}] + opens every emoji as a sheet; "gem" gives ${picked} and it lands`);
      await page.screenshot({ path: `${OUT}/${tag} 4 after the picker.png` });
    }
    await browser.close();
  }
} finally {
  await sql(`delete from message_reactions where message_id in (${msgIds.map((x) => `'${x}'`).join(",")})`);
  await sql(`delete from notifications where user_id in ('${A}', '${B}') and created_at > now() - interval '30 minutes' and (kind = 'reaction' or body ilike '%Harness:%')`);
  await sql(`delete from messages where dm_id = '${thread}'`);
  await sql(`delete from dm_threads where id = '${thread}'`);
  if (!hadProfile) await sql(`delete from profiles where user_id = '${B}'`);
  const left = await sql(`select (select count(*) from dm_threads where id = '${thread}')::int t, (select count(*) from messages where dm_id = '${thread}')::int m`);
  check(left?.[0]?.t === 0 && left?.[0]?.m === 0, `cleaned up: the thread, its messages, reactions and notifications`);
}
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
