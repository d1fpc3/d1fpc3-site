// Pinned messages (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-pins-visual.mjs      (APP_URL / OUT / THEME env, PHONE=1 for 390x844)
// A plain member is refused by pin_message; a message pinned by staff shows in the strip under the header
// and carries a mark; tapping the strip jumps to it; unpinning clears the strip live. Leaves the room as found.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-pins"); mkdirSync(OUT, { recursive: true });
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
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" };
const gen = (await (await fetch(`${SB}/rest/v1/channels?slug=eq.general&select=id`, { headers: H })).json())[0].id;
const target = (await (await fetch(`${SB}/rest/v1/messages?channel_id=eq.${gen}&deleted_at=is.null&body=not.is.null&order=created_at.desc&limit=1&select=id,body`, { headers: H })).json())[0];
// a plain member cannot pin
const deny = await fetch(`${SB}/rest/v1/rpc/pin_message`, { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_id: target.id, p_on: true }) });
ok(!deny.ok, "a plain member is refused when pinning (" + deny.status + ")");
// staff pinned it (set directly), and the room shows it
await fetch(`${SB}/rest/v1/messages?id=eq.${target.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ pinned_at: new Date().toISOString() }) });
await go("chat"); if (PHONE) { await page.locator(".cr-item", { hasText: "General" }).first().click() } await page.waitForTimeout(2500);
ok(await page.locator("#chat-pins").isVisible() && (await page.locator("#chat-pins .tx span").textContent()).includes(target.body.slice(0, 20)), "the pinned strip shows the message: " + (await page.locator("#chat-pins .tx span").textContent().catch(() => "")));
ok(await page.locator(".msg.pinned").count() === 1, "the message carries the pin mark");
await shot(PRE + "pinned");
await page.locator("#chat-pins .tx").click(); await page.waitForTimeout(500);
ok(await page.locator(".msg.flash").count() === 1, "tapping the strip jumps to it");
await fetch(`${SB}/rest/v1/messages?id=eq.${target.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ pinned_at: null, pinned_by: null }) });
await page.waitForTimeout(2000);
ok(!(await page.locator("#chat-pins").isVisible()), "unpinning clears the strip live");

await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
