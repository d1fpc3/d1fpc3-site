// The command palette (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-palette-visual.mjs      (APP_URL / OUT / THEME env, PHONE=1 for 390x844)
// Ctrl+K opens it focused; an empty query lists places; a word finds messages across conversations and
// choosing one opens the conversation and flashes the message; lessons, videos and people match; Escape
// closes; the top-bar button opens it.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-palette"); mkdirSync(OUT, { recursive: true });
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
await go("overview");
await page.keyboard.press("Control+k"); await page.waitForTimeout(500);
ok(await page.locator("#palette.on").count() === 1 && await page.evaluate(() => document.activeElement?.id === "pal-q"), "Ctrl+K opens the palette with the box focused");
ok(await page.locator(".pal-it").count() >= 10, "empty query lists the places to go: " + (await page.locator(".pal-it").count()));
await shot(PRE + "palette-empty");
await page.type("#pal-q", "patient"); await page.waitForTimeout(1500);
ok(await page.locator('.pal-h', { hasText: "Messages" }).count() === 1 && await page.locator(".pal-it mark").count() >= 1, "typing finds messages across conversations with the match marked");
await shot(PRE + "palette-messages");
await page.locator(".pal-it", { hasText: "patient" }).first().click(); await page.waitForTimeout(3000);
ok(await page.evaluate(() => document.getElementById("v-chat").classList.contains("on") && document.querySelectorAll("#chat-log .msg.flash").length === 1), "choosing a message opens its conversation and flashes it");
await page.keyboard.press("Control+k"); await page.type("#pal-q", "liquid"); await page.waitForTimeout(600);
ok(await page.locator('.pal-h', { hasText: "Lessons" }).count() === 1, "a lesson title matches: " + (await page.locator(".pal-it", { hasText: "Liquidity" }).first().textContent().catch(() => "")));
await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
ok(await page.evaluate(() => document.getElementById("v-course").classList.contains("on")), "Enter on a lesson opens Study");
await page.keyboard.press("Control+k"); await page.type("#pal-q", "d1fp"); await page.waitForTimeout(500);
ok(await page.locator('.pal-h', { hasText: "People" }).count() === 1, "a member matches under People");
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
ok(await page.locator("#palette").isHidden(), "Escape closes it");
await page.click("#tb-search"); await page.waitForTimeout(400);
ok(await page.locator("#palette.on").count() === 1, "the top-bar button opens it too");
await shot(PRE + "palette-button");
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
