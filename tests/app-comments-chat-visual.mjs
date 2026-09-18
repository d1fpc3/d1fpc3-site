// Feed comments and chat (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-comments-chat-visual.mjs      (APP_URL / OUT env, PHONE=1 for 390x844)
// As the App Review account: the feed post shows its time and a blurred backdrop; comments open as a
// split dialog on wide screens and a sheet on phones; a comment posts (Enter on desktop), can be liked,
// replied to (nested, parent_id in the database) and deleted; the chat rail shows the last message and
// its time; a typing broadcast from someone else shows and fades; the inbox groups by day with no long
// dashes. Cleans up its own rows. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-comments-chat"); mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const browser = await chromium.launch();
const PHONE = process.env.PHONE === "1", PRE = PHONE ? "p-" : "d-"; const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: Number(process.env.W || 1440), height: Number(process.env.HGT || 900) } });
await ctx.addInitScript(([k, v, theme]) => { localStorage.setItem(k, v); if (theme) localStorage.setItem("echelon-theme", theme); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-chart-tf", "5m"); }, [`sb-${REF}-auth-token`, JSON.stringify(session), process.env.THEME || ""]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#td-h1", { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const go = async (v) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`)?.click(), v); await page.waitForTimeout(2500) };
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };
await page.evaluate(() => { document.querySelectorAll('.pm-stack').forEach((x) => x.remove()) });
await go("feed"); await shot(PRE + "feed");
ok(await page.locator(".rv-post .rv-when").count() > 0, "post header carries the time");
ok(await page.evaluate(() => getComputedStyle(document.querySelector(".rv-media .item"), "::before").backgroundImage.includes("url(")), "media has its blurred backdrop");
await page.locator('.rv-post .rv-act button[title="Comment"]').first().click(); await page.waitForTimeout(1500);
ok(await page.evaluate(() => document.getElementById("cmsheet").classList.contains("split")) === !PHONE, PHONE ? "phone keeps the bottom sheet" : "desktop opens the split dialog");
ok(await page.locator("#cm-post").isDisabled(), "Post is disabled while the box is empty");
const stamp = "harness " + Date.now();
await page.fill("#cm-input", stamp);
if (PHONE) await page.click("#cm-post"); else await page.keyboard.press("Enter");
await page.waitForFunction((t) => [...document.querySelectorAll("#cm-list .cm-row:not(.pending) .cm-body")].some((b) => b.textContent.includes(t)), stamp, { timeout: 10000 }).catch(() => {});
ok(await page.locator("#cm-list .cm-row:not(.pending)", { hasText: stamp }).count() === 1, "a comment posts (Enter on desktop) and settles once");
const mine = page.locator("#cm-list .cm-row", { hasText: stamp }).first();
await mine.locator(".cm-like").click(); await page.waitForTimeout(900);
ok(await mine.locator(".cm-like.on i").textContent().catch(() => "") === "1", "liking a comment counts 1");
await mine.locator(".cm-meta button", { hasText: "Reply" }).click(); await page.waitForTimeout(200);
ok(await page.locator("#cm-replying").isVisible(), "the replying bar shows");
await page.fill("#cm-input", stamp + " reply"); await page.click("#cm-post");
await page.waitForFunction(() => document.querySelectorAll("#cm-list .cm-row.reply:not(.pending)").length > 0, null, { timeout: 10000 }).catch(() => {});
ok(await page.locator("#cm-list .cm-row.reply", { hasText: stamp + " reply" }).count() === 1, "the reply nests under its comment");
await shot(PRE + "comments-thread");
const db = await (await fetch(`${SB}/rest/v1/post_comments?body=like.${encodeURIComponent(stamp)}*&select=id,parent_id,body`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })).json();
ok(db.length === 2 && db.some((c) => c.parent_id), "both rows are in the database, the reply carries parent_id: " + JSON.stringify(db.map((c) => !!c.parent_id)));
// delete both through the UI (reply first)
await page.locator("#cm-list .cm-row.reply", { hasText: stamp }).locator(".cm-meta button.danger").click(); await page.waitForTimeout(900);
await page.locator("#cm-list .cm-row", { hasText: stamp }).first().locator(".cm-meta button.danger").click(); await page.waitForTimeout(900);
ok(await page.locator("#cm-list .cm-row", { hasText: stamp }).count() === 0, "delete removes them");
await fetch(`${SB}/rest/v1/post_comments?body=like.${encodeURIComponent(stamp)}*`, { method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` } });
await page.keyboard.press("Escape"); await page.evaluate(() => document.getElementById("cm-x")?.click()); await page.waitForTimeout(600);
await go("chat"); await page.waitForTimeout(1200);
ok(await page.locator(".cr-item.rich .cr-pv").count() > 0, "the rail shows the last message of a conversation: " + (await page.locator(".cr-item.rich .cr-pv").first().textContent().catch(() => "")));
ok(await page.locator(".cr-item.rich .cr-time").count() > 0, "and when it was said");
await shot(PRE + "chat-rail");
if (PHONE) { await page.locator(".cr-item", { hasText: "General" }).first().click(); await page.waitForTimeout(1500) }
// someone else typing: a broadcast on the room's channel, sent from the server side
const chans = await (await fetch(`${SB}/rest/v1/channels?select=id,slug`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })).json();
const general = chans.find((c) => c.slug === "general") || chans[0];
const bc = await fetch(`${SB}/realtime/v1/api/broadcast`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ topic: `room:channel:${general.id}`, private: true, event: "typing", payload: { uid: "00000000-0000-4000-8000-000000000001", name: "Harness" } }] }) });
await page.waitForTimeout(1200);
ok(await page.locator("#chat-typing").isVisible().catch(() => false), `typing indicator appears for someone else (broadcast ${bc.status}): ` + (await page.locator("#chat-typing .t").textContent().catch(() => "")));
await shot(PRE + "chat-typing");
await page.waitForTimeout(4500);
ok(!(await page.locator("#chat-typing").isVisible().catch(() => false)), "and fades four seconds later");
await go("inbox");
ok(await page.locator(".nb-day").count() > 0, "inbox groups by day: " + (await page.locator(".nb-day").allTextContents()).join(", "));
ok(!(await page.locator("#inbox").textContent()).includes(String.fromCharCode(8212)), "no long dashes in notification copy");
await shot(PRE + "inbox");
await go("feed"); await page.locator(".rv-post .rv-user .av").first().click(); await page.waitForTimeout(1500); await shot(PRE + "profile");
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK, shots: " + OUT);
