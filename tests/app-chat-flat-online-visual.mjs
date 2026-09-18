// Flat chat, ruled list, sidebar fit, and the Show when I am online switch seen from a second member.
//   APP_URL=... node tests/app-chat-flat-online-visual.mjs   (W / HGT / THEME env)
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-chat-flat-online"); mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
// leftovers first: a run that crashed must never leave fake members in the real Members list
{ const HS = { apikey: service, Authorization: `Bearer ${service}` }; const r = await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=500`, { headers: HS })).json();
  for (const u of r.users || []) if (/@d1fpc3.test$/.test(u.email || "") && Date.now() - new Date(u.created_at).getTime() > 5 * 60000) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: HS });
  await fetch(`${SB}/rest/v1/entitlements?email=like.*@d1fpc3.test&user_id=is.null`, { method: "DELETE", headers: HS }); }
const browser = await chromium.launch();
const CREATED = []; const bail = async (e) => { console.error(e); for (const id of CREATED) await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` } }).catch(() => {}); process.exit(1) };
process.on("uncaughtException", bail); process.on("unhandledRejection", bail);
const PHONE = process.env.PHONE === "1", PRE = PHONE ? "p-" : "d-"; const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: Number(process.env.W || 1440), height: Number(process.env.HGT || 900) } });
await ctx.addInitScript(([k, v, theme]) => { localStorage.setItem(k, v); if (theme) localStorage.setItem("echelon-theme", theme); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-chart-tf", "5m"); }, [`sb-${REF}-auth-token`, JSON.stringify(session), process.env.THEME || ""]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#td-h1", { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const go = async (p, v) => { await p.evaluate((v) => document.querySelector('.tab[data-view="' + v + '"]')?.click(), v); await p.waitForTimeout(2200) };
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" };
// two throwaway members: one flips the switch, the other watches. The shared review account
// cannot be the subject, it is often signed in somewhere else and so never looks offline.
const mkMember = async (tag) => {
  const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email: `harness-${tag}-${Date.now()}@d1fpc3.test`, password: "x-" + Math.random().toString(36).slice(2), email_confirm: true }) })).json();
  CREATED.push(u.id);
  await fetch(`${SB}/rest/v1/entitlements`, { method: "POST", headers: H, body: JSON.stringify({ user_id: u.id, email: u.email, status: "active", source: "comp", product: "course", interval: "one_time" }) });
  await fetch(`${SB}/rest/v1/member_onboarding`, { method: "POST", headers: H, body: JSON.stringify({ user_id: u.id, answers: {}, completed_at: new Date().toISOString() }) });
  const l = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email: u.email }) })).json();
  const s = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: l.hashed_token }) })).json();
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-theme", "dark"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1") }, [`sb-${REF}-auth-token`, JSON.stringify(s)]);
  const p = await c.newPage(); await p.goto(process.env.APP_URL, { waitUntil: "domcontentloaded" }); await p.waitForSelector("#td-h1", { timeout: 40000 }).catch(() => {}); await p.waitForTimeout(3000);
  return { id: u.id, page: p };
};
const subject = await mkMember("subject"), bot = await mkMember("watch");
const me = subject.id, watcher = bot.page, mine = subject.page;
await go(mine, "members"); await mine.waitForTimeout(1500);   // presence starts with the members list
const seesMe = () => watcher.evaluate((uid) => window.__online ? window.__online.has(uid) : null, me).catch(() => null);
const seenDom = async () => { await go(watcher, "members"); await watcher.waitForTimeout(1500); return watcher.evaluate((uid) => !!document.querySelector(`#member-grid .mcard[data-uid="${uid}"].online`), me) };

await go(page, "chat"); await page.waitForTimeout(1500);
const frame = await page.evaluate(() => { const c = getComputedStyle(document.querySelector(".chat")); const items = [...document.querySelectorAll(".cr-group .cr-item")]; const ruled = items.filter((n, i) => i > 0 && getComputedStyle(n, "::after").content !== "none" && getComputedStyle(n, "::after").position === "absolute" && n.previousElementSibling?.classList.contains("cr-item")).length; return { border: c.borderTopWidth, bg: c.backgroundColor, radius: c.borderRadius, items: items.length, ruled } });
ok(frame.border === "0px" && /rgba\(0, 0, 0, 0\)|transparent/.test(frame.bg), "the chat has no box around it: " + JSON.stringify(frame));
ok(frame.ruled >= frame.items - 3 && frame.ruled > 0, "channels and people are ruled off from each other: " + frame.ruled + " of " + frame.items);
await shot(PRE + "chat-flat");
ok(await page.evaluate(() => { const n = document.querySelector(".side-nav"), u = document.querySelector(".side-user"); const last = [...n.querySelectorAll(".tab")].filter((t) => !t.hidden && t.offsetParent).pop(); return n.getBoundingClientRect().bottom <= u.getBoundingClientRect().top + 1 }), "the sidebar list stops above the avatar");

ok(await seenDom() === true, "with the switch on, another member sees me online");
await go(mine, "set-appearance");
ok(await mine.isChecked("#show-online"), "Show when I'm online starts on");
await mine.locator("label.tgl:has(#show-online)").click(); await page.waitForTimeout(2500);
const saved = await (await fetch(`${SB}/rest/v1/profiles?user_id=eq.${me}&select=show_online`, { headers: H })).json();
ok(saved[0]?.show_online === false, "turning it off saves: " + JSON.stringify(saved));
await shot(PRE + "show-online-off");
await watcher.waitForTimeout(2500);
console.log("watcher set has me:", await seesMe(), "| my own presence keys:", await mine.evaluate(() => window.__online ? [...window.__online].length : null));
ok(await seenDom() === false, "the other member no longer sees me online");
await mine.reload({ waitUntil: "domcontentloaded" }); await mine.waitForSelector("#td-h1", { timeout: 30000 }); await mine.waitForTimeout(2500); await go(mine, "members"); await mine.waitForTimeout(2500);
ok(await seenDom() === false, "it holds after I reload: still hidden");
await go(mine, "set-appearance"); ok(!(await mine.isChecked("#show-online")), "the switch remembers it is off");
await mine.locator("label.tgl:has(#show-online)").click(); await page.waitForTimeout(3000);
ok(await seenDom() === true, "turning it back on shows me again");
for (const u of [subject.id, bot.id]) await fetch(`${SB}/auth/v1/admin/users/${u}`, { method: "DELETE", headers: H });

await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
