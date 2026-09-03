// Pull-to-refresh checks (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-refresh-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account, a plain member) at
// 390x844 and drives the pull gesture over CDP touch: the disc's arrows turn
// with the finger, go gold when a full pull arms it, the What's next pill
// fades out of the way, release spins the arrows while the view refetches,
// the gold tick follows, and the page settles. Also asserts there is NO
// refresh button in the topbar (D1, 9/3/26: "I don't want refresh buttons").
// Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-refresh-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://localhost:8080/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const note = (s) => console.log("  " + s);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`${r.status()} ${r.url()}`); });
await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ov-hi", { timeout: 25000 });
await page.waitForTimeout(1500);

// no refresh button, anywhere
const buttons = await page.evaluate(() => ({ tb: !!document.getElementById("tb-refresh"), cls: document.querySelectorAll(".tb-refresh").length, topbar: [...document.querySelectorAll(".topbar button")].map((b) => b.id || b.className) }));
note("topbar buttons: " + JSON.stringify(buttons.topbar));
if (buttons.tb || buttons.cls) fails.push("a refresh button is back in the topbar");
await page.locator(".topbar").screenshot({ path: `${OUT}/phone-1-topbar.png` });

// pull to refresh: the disc's arrows turn with the finger and go gold when armed
await page.evaluate(() => window.scrollTo(0, 0));
const cdp = await ctx.newCDPSession(page);
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 200 }] });
for (let y = 210; y <= 260; y += 10) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y }] }); await page.waitForTimeout(16); }
const half = await page.evaluate(() => { const p = document.getElementById("ptr"); return { p: p.style.getPropertyValue("--p"), rot: getComputedStyle(p.querySelector(".rf-arrows")).transform, armed: document.body.classList.contains("ptr-armed") }; });
note("ptr half: " + JSON.stringify(half));
if (half.armed || !(parseFloat(half.p) > 0.1 && parseFloat(half.p) < 1)) fails.push("ptr: half pull not tracking (" + JSON.stringify(half) + ")");
if (half.rot === "none") fails.push("ptr: arrows not turning with the pull");
await page.screenshot({ path: `${OUT}/phone-7-pull-half.png` });
for (let y = 270; y <= 360; y += 10) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y }] }); await page.waitForTimeout(16); }
await page.waitForTimeout(200);
const armed = await page.evaluate(() => { const p = document.getElementById("ptr"); const gold = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim(); const probe = document.createElement("i"); probe.style.color = gold; document.body.appendChild(probe); const g = getComputedStyle(probe).color; probe.remove(); return { armed: document.body.classList.contains("ptr-armed"), p: p.style.getPropertyValue("--p"), color: getComputedStyle(p).color, gold: g, opacity: getComputedStyle(p).opacity }; });
note("ptr armed: " + JSON.stringify(armed));
if (!armed.armed || armed.p !== "1.000") fails.push("ptr: full pull did not arm");
if (armed.color !== armed.gold) fails.push(`ptr: armed disc is not gold (${armed.color} vs ${armed.gold})`);
const pill = await page.evaluate(() => { const n = document.getElementById("nextup"); return n && !n.hidden ? getComputedStyle(n).opacity : "n/a"; });
note("nextup during pull: " + pill);
if (pill !== "n/a" && pill !== "0") fails.push("ptr: What's next pill still covering the disc during the pull");
await page.screenshot({ path: `${OUT}/phone-8-pull-armed.png` });
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(160);
const busy = await page.evaluate(() => ({ busy: document.body.classList.contains("ptr-busy"), skel: document.querySelectorAll(".view.on .skel").length, anim: document.querySelector("#ptr .rf-arrows").getAnimations().length }));
note("ptr released: " + JSON.stringify(busy));
if (!busy.busy) fails.push("ptr: release did not fire the refresh");
if (busy.anim < 1) fails.push("ptr: arrows not spinning while busy");
await page.screenshot({ path: `${OUT}/phone-9-pull-busy.png` });
// iOS geometry: the header stays put, the content drops, the glyph rests in the gap between them
await page.waitForTimeout(320);
const geo = await page.evaluate(() => { const tb = document.querySelector(".topbar").getBoundingClientRect(), g = document.getElementById("ptr").getBoundingClientRect(); return { headerTop: Math.round(tb.top), headerBottom: Math.round(tb.bottom), glyphTop: Math.round(g.top), glyphBottom: Math.round(g.bottom), pane: document.querySelector(".pane").style.transform, main: document.querySelector(".main").style.transform }; });
note("ptr geometry while busy: " + JSON.stringify(geo));
if (geo.headerTop !== 0 || geo.main) fails.push("ptr: header moved during refresh");
if (!/translate3d\(0px, 54px/.test(geo.pane)) fails.push("ptr: content did not drop 54px (" + geo.pane + ")");
if (!(geo.glyphTop >= geo.headerBottom && geo.glyphBottom <= geo.headerBottom + 54)) fails.push("ptr: glyph is not resting in the gap below the header");
await page.screenshot({ path: `${OUT}/phone-9b-pull-busy-rest.png` });
await page.waitForFunction(() => document.getElementById("ptr").classList.contains("done"), null, { timeout: 20000 }).catch(() => fails.push("ptr: never showed the tick"));
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/phone-10-pull-tick.png` });
await page.waitForFunction(() => !document.body.classList.contains("ptr-busy") && !document.getElementById("ptr").classList.contains("done"), null, { timeout: 10000 }).catch(() => fails.push("ptr: did not settle"));
const settled = await page.evaluate(() => ({ skel: document.querySelectorAll(".view.on .skel").length, mainT: document.querySelector(".pane").style.transform + document.querySelector(".main").style.transform, op: getComputedStyle(document.getElementById("ptr")).opacity }));
note("ptr settled: " + JSON.stringify(settled));
if (settled.skel > 0 || settled.mainT) fails.push("ptr: page did not settle after refresh " + JSON.stringify(settled));
await page.screenshot({ path: `${OUT}/phone-11-settled.png` });

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
