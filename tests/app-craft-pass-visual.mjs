// Craft pass checks (manual): settings rows, members columns, top bar pill, phone pill on scroll, GEX sublines.
//   node tests/app-craft-pass-visual.mjs   (APP_URL / OUT / THEME env, PHONE=1 for 390x844)
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-craft-pass"); mkdirSync(OUT, { recursive: true });
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
const go = async (v) => { await page.evaluate((v) => document.querySelector('.tab[data-view="' + v + '"]')?.click(), v); await page.waitForTimeout(2200) };
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };
const pillVisible = () => page.evaluate(() => { const n = document.getElementById("nextup"); if (!n || n.hidden) return null; return getComputedStyle(n).opacity !== "0" });
await go("notifs");
const row = await page.evaluate(() => { const l = document.querySelector("#v-notifs .setgrid .filters .label"); const cs = getComputedStyle(l); return { size: parseFloat(cs.fontSize), h3: getComputedStyle(document.querySelector("#v-notifs .block-head h3")).display, back: getComputedStyle(document.querySelector("#notifs-back")).textDecorationLine, svg: !!document.querySelector("#notifs-back svg") } });
ok(row.size >= 14 && row.h3 === "none" && row.back === "none" && row.svg, "switch rows read at 14px, the title is not repeated, back is a chevron: " + JSON.stringify(row));
await shot(PRE + "notifs");
await page.click("#notifs-back"); await page.waitForTimeout(900);
ok(await page.evaluate(() => document.getElementById("v-settings").classList.contains("on")), "the back control returns to Settings");
await go("members");
const cols = await page.evaluate(() => new Set([...document.querySelectorAll("#member-grid .mcard")].map((c) => Math.round(c.getBoundingClientRect().left))).size);
const firstStaff = await page.evaluate(() => !!document.querySelector("#member-grid .mcard .mtag") && document.querySelector("#member-grid .mcard").querySelector(".mtag") !== null);
ok(PHONE ? cols === 1 : cols >= 2, "members columns: " + cols); ok(firstStaff, "staff lead the list");
await shot(PRE + "members");
await go("set-profile");
if (!PHONE) { const gap = await page.evaluate(() => { const n = document.getElementById("nextup"); if (!n || n.hidden) return null; return Math.round(document.getElementById("tb-search").getBoundingClientRect().left - n.getBoundingClientRect().right) }); ok(gap === null || gap >= 8, "the pill clears the search button on Profile: gap " + gap) }
await go("gex"); await page.waitForTimeout(1500);
if (PHONE) {
  const clipped = await page.evaluate(() => [...document.querySelectorAll("#gex-read .d")].filter((d) => d.scrollWidth > d.clientWidth + 1).length);
  ok(clipped === 0, "no GEX subline is cut off: " + clipped);
  const before = await pillVisible();
  if (before !== null) {
    await page.mouse.wheel(0, 600); await page.waitForTimeout(700); const down = await pillVisible(); await shot(PRE + "gex-scrolled");
    await page.mouse.wheel(0, -200); await page.waitForTimeout(700); const up = await pillVisible();
    ok(before === true && down === false && up === true, "the pill steps aside scrolling down and returns scrolling up: " + [before, down, up].join(","));
  } else console.log("skip pill (not shown for this account)");
}
await go("library");
const tags = await page.evaluate(() => [...document.querySelectorAll(".lib-thumb .tag")].map((t) => Math.round(t.getBoundingClientRect().top - t.parentElement.getBoundingClientRect().top)));
ok(tags.length > 0 && tags.every((t) => t < 14), "every library tag sits top-left: " + tags.join(","));
await shot(PRE + "library");
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
