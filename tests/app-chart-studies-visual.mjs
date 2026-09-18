// Compare overlay and indicator templates (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-studies-visual.mjs      (APP_URL / OUT / THEME env)
// Compare loads ES and paints it as an orange line over NQ with a legend row; an indicator set saves under a
// name, applies back, and can be removed.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-chart-studies"); mkdirSync(OUT, { recursive: true });
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
await go("chart"); await page.waitForFunction(() => /O\s?[\d,]/.test(document.getElementById("ch-legend").textContent), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500);
await page.evaluate(() => { window.__CH.s.lit = false; window.__CH.$.menu("ind:cmp") }); await page.waitForTimeout(300);
await page.click('#ch-menu .ch-row .tgl'); await page.waitForTimeout(8000);
const st = await page.evaluate(() => ({ on: window.__CH.s.cmp, peer: window.__CH.stores.ES?.base["1m"].length || 0, legend: document.querySelector('#ch-legend .ln[data-ind="cmp"]')?.textContent || "" }));
ok(st.on && st.peer > 1000 && /ES/.test(st.legend) && /\d/.test(st.legend), "Compare loads ES and reads it in the legend: " + JSON.stringify(st));
await page.evaluate(() => window.__CH.$.menu(null)); await page.waitForTimeout(400);
const px = await page.evaluate(() => { const cv = document.getElementById("ch-canvas"), d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 130 && d[i + 1] < 170 && d[i + 2] < 40) n++; return n });
ok(px > 200, "the orange comparison line is painted: " + px + " px");
await shot("d-compare");
await page.evaluate(() => { window.__CH.s.cmp = false; window.__CH.s.lit = true; window.__CH.$.paint() });
await go("chart"); await page.waitForFunction(() => /O\s?[\d,]/.test(document.getElementById("ch-legend").textContent), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500);
page.on("dialog", (d) => d.accept("Harness set"));
await page.evaluate(() => { const C = window.__CH; C.s.emaOn = true; C.s.vwap = true; C.s.lit = false; C.$.menu("ind") }); await page.waitForTimeout(400);
await page.click(".ch-tpl-b.add"); await page.waitForTimeout(400);
ok(await page.locator(".ch-tpl-b", { hasText: "Harness set" }).count() === 1, "the current set saves under a name");
await page.evaluate(() => { const C = window.__CH; C.s.emaOn = false; C.s.vwap = false; C.s.lit = true; C.$.menu("ind") }); await page.waitForTimeout(300);
await page.locator(".ch-tpl-b", { hasText: "Harness set" }).locator("span").click(); await page.waitForTimeout(600);
const st2 = await page.evaluate(() => ({ ema: window.__CH.s.emaOn, vwap: window.__CH.s.vwap, lit: window.__CH.s.lit }));
ok(st2.ema && st2.vwap && !st2.lit, "applying it restores that set: " + JSON.stringify(st2));
await shot("d-templates");
await page.locator(".ch-tpl-b", { hasText: "Harness set" }).locator("i").click(); await page.waitForTimeout(300);
ok(await page.locator(".ch-tpl-b", { hasText: "Harness set" }).count() === 0, "and it can be removed");
await page.evaluate(() => { const C = window.__CH; C.s.emaOn = false; C.s.vwap = false; C.s.lit = true; C.$.menu(null); C.$.paint() });
if (false) { await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK"); }

await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
