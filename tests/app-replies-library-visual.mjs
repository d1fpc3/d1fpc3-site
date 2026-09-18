// Chat reply quotes, the New messages line, library resume (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-replies-library-visual.mjs      (APP_URL / OUT / THEME env, PHONE=1 for 390x844)
// Makes a throwaway auth user, opens a DM with it and seeds a message plus a reply that quotes it: the quote
// renders, the New messages line sits above the unread ones, replying from the composer sends reply_to and
// clears the bar, a quote jumps to its message. Then a library video is left part-way and shows Resume
// (skipped where the signed video cannot load, e.g. from localhost). Deletes the throwaway user afterwards.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-replies-library"); mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const browser = await chromium.launch();
const PHONE = process.env.PHONE === "1", PRE = PHONE ? "p-" : "d-"; const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([k, v, theme]) => { localStorage.setItem(k, v); if (theme) localStorage.setItem("echelon-theme", theme); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-chart-tf", "5m"); }, [`sb-${REF}-auth-token`, JSON.stringify(session), process.env.THEME || ""]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#td-h1", { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const go = async (v) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`)?.click(), v); await page.waitForTimeout(2500) };
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" };
const me = session.user.id;
// a throwaway member to talk to, so no real member gets pinged
const bot = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email: `harness-bot-${Date.now()}@d1fpc3.test`, password: "x-" + Math.random().toString(36).slice(2), email_confirm: true }) })).json();
const botId = bot.id; ok(!!botId, "a throwaway user exists for the test");
const lo = me < botId ? me : botId, hi = me < botId ? botId : me;
const thread = (await (await fetch(`${SB}/rest/v1/dm_threads`, { method: "POST", headers: H, body: JSON.stringify({ user_lo: lo, user_hi: hi }) })).json())[0];
const first = (await (await fetch(`${SB}/rest/v1/messages`, { method: "POST", headers: H, body: JSON.stringify({ dm_id: thread.id, user_id: botId, body: "harness: the original message" }) })).json())[0];
await (await fetch(`${SB}/rest/v1/messages`, { method: "POST", headers: H, body: JSON.stringify({ dm_id: thread.id, user_id: botId, body: "harness: this one quotes the first", reply_to: first.id }) })).json();
await go("chat"); await page.waitForTimeout(1200);
const row = page.locator(".cr-item", { hasText: "member" }).first();
if (PHONE) await row.click(); else await row.click(); await page.waitForTimeout(2000);
ok(await page.locator(".m-quote").count() === 1 && /original message/.test(await page.locator(".m-quote").textContent()), "a reply shows the quote of what it answers");
ok(await page.locator(".chat-new").count() === 1, "the New messages line marks the unread ones");
await shot(PRE + "chat-quote");
// reply from here: hover, the arrow, the bar, send
const target = page.locator(".msg", { hasText: "the original message" }).first(); await target.hover(); await page.waitForTimeout(300);
await target.locator(".m-reply").click({ force: true }); await page.waitForTimeout(300);
ok(await page.locator("#chat-replying").isVisible() && /Replying to/.test(await page.locator("#chat-replying").textContent()), "the reply bar names what you answer");
await page.fill("#chat-input", "harness: my reply"); await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
const sent = await (await fetch(`${SB}/rest/v1/messages?dm_id=eq.${thread.id}&user_id=eq.${me}&select=id,reply_to,body`, { headers: H })).json();
ok(sent.length === 1 && sent[0].reply_to === first.id, "the sent message carries reply_to: " + JSON.stringify(sent));
ok(await page.locator(".m-quote").count() === 2 && !(await page.locator("#chat-replying").isVisible()), "it renders with its quote and the bar clears");
await shot(PRE + "chat-reply-sent");
await page.locator(".m-quote").last().click(); await page.waitForTimeout(500);
ok(await page.locator(".msg.flash").count() === 1, "tapping a quote jumps to the message");
// library: a resume badge and a watched mark
await go("library"); await page.waitForTimeout(1200);
const vid = await page.evaluate(() => { const b = document.querySelector(".lib-card"); return b ? b.querySelector(".t")?.textContent : null });
await page.locator(".lib-card").first().click(); await page.waitForTimeout(6000);
const pos = await page.evaluate(() => { const v = document.querySelector("#lib-player video"); if (!v || !v.duration) return null; v.currentTime = Math.min(v.duration * 0.4, 30); v.pause(); return { d: v.duration } }).catch(() => null);
await page.waitForTimeout(300); await page.evaluate(() => { const v = document.querySelector("#lib-player video"); v?.dispatchEvent(new Event("timeupdate")) });
await page.waitForTimeout(400); await page.click("#lib-x"); await page.waitForTimeout(600);
if (pos) { ok(await page.locator(".lib-card .resume").count() >= 1, "leaving a video part-way shows Resume with the time left: " + (await page.locator(".lib-card .resume").first().textContent().catch(() => ""))); await shot(PRE + "library-resume") } else console.log("skip library (no playable video in the harness)");
// cleanup: the throwaway user takes its thread and messages with it
await fetch(`${SB}/auth/v1/admin/users/${botId}`, { method: "DELETE", headers: H });
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
