// Study map (manual): numbered chapter cards, a chapter shows only its lessons, back to the map.
//   node tests/app-study-map-visual.mjs   (APP_URL / OUT / THEME env, PHONE=1 for 390x844)
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-study-map"); mkdirSync(OUT, { recursive: true });
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
const go = async (v) => { await page.evaluate((v) => document.querySelector('.tab[data-view="' + v + '"]')?.click(), v); await page.waitForTimeout(2000) };
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };
const vis = (sel) => page.evaluate((s) => { const n = document.querySelector(s); return !!n && n.offsetParent !== null && n.getBoundingClientRect().height > 0 }, sel);
await go("course");
const m = await page.evaluate(() => ({ cards: [...document.querySelectorAll("#study-map .sm-card")].map((c) => c.querySelector(".sm-num").textContent), cur: document.querySelectorAll("#study-map .sm-card.cur").length, go: document.querySelector("#study-map .sm-go")?.textContent, text: document.getElementById("study-map").innerText }));
ok(m.cards.join() === "01,02,03,04,05,06,07", "Study opens on seven numbered chapters: " + m.cards.join(" "));
ok(!(await vis("#lesson-block")) && !(await vis("#index")), "no lesson list and no lesson on the map");
ok(m.cur === 1 && /Continue|Start/.test(m.go || ""), "one chapter is marked as where you are: " + m.go);
ok(!/BASICS|INTERMEDIATE|ADVANCED|The trap|The cycle|Sessions and timing|The daily playbook|Managing the trade/.test(m.text), "numbers only, no level or chapter names: ok");
await shot(PRE + "map");
// enter chapter 05
await page.locator("#study-map .sm-card").nth(4).click(); await page.waitForTimeout(1800);
if (PHONE) { await page.click("#toc-toggle"); await page.waitForTimeout(600) }
let c = await page.evaluate(() => ({ num: document.querySelector("#index .ch-big .sm-num")?.textContent, rows: [...document.querySelectorAll("#index .ch-list button .tx")].map((t) => t.textContent), on: document.querySelector("#index .ch-list button.on .tx")?.textContent, h1: document.querySelector("#lesson .lesson-h")?.textContent }));
ok(c.num === "05" && c.rows.length === 5 && c.rows[0] === "The 4-step process", "chapter 05 shows only its five lessons: " + c.rows.join(" | "));
ok(c.on === c.h1 && !!c.h1, "its first open lesson is on the page: " + c.h1);
await shot(PRE + "chapter");
await page.locator("#index .ch-list button").nth(2).click(); await page.waitForTimeout(1500);
ok((await page.textContent("#lesson .lesson-h")) === "Real and false breaks", "a lesson in the chapter opens");
if (PHONE) { await page.click("#toc-toggle"); await page.waitForTimeout(600); ok(/05 · 3 of 5/.test(await page.textContent("#tt-pos")), "the phone bar counts inside the chapter: " + (await page.textContent("#tt-pos"))) }
await page.click("#study-back"); await page.waitForTimeout(900);
ok(await vis("#study-map") && !(await vis("#lesson-block")), "All chapters goes back to the map");
ok(await page.evaluate(() => document.querySelectorAll("#study-map .sm-card")[4].classList.contains("cur")), "and the map now marks chapter 05 as where you are");
// leaving and coming back lands on the map; the palette lands on the lesson
await page.locator("#study-map .sm-card.cur").click(); await page.waitForTimeout(1200);
await go("overview"); await go("course");
ok(await vis("#study-map"), "coming back to Study lands on the map");
if (!PHONE) { await page.keyboard.press("Control+k"); await page.type("#pal-q", "liquid"); await page.waitForTimeout(700); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await page.waitForTimeout(2200);
  ok(await vis("#lesson-block") && !(await vis("#study-map")), "search drops you straight into the lesson, not the map"); }
// restore where the account was
await go("overview"); await go("course"); await page.locator("#study-map .sm-card").first().click(); await page.waitForTimeout(1200);
if (PHONE) { await page.click("#toc-toggle"); await page.waitForTimeout(500) }
await page.locator("#index .ch-list button").nth(3).click(); await page.waitForTimeout(1000);
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
