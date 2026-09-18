// Study chapters (manual): levels basics to advanced, one chapter open at a time, search across all.
//   node tests/app-study-chapters-visual.mjs   (APP_URL / OUT / THEME env, PHONE=1 for 390x844)
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-study-chapters"); mkdirSync(OUT, { recursive: true });
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
await go("course");
if (PHONE) { await page.click("#toc-toggle"); await page.waitForTimeout(600) }
const st = () => page.evaluate(() => ({
  levels: [...document.querySelectorAll("#toc-list .lvl")].map((l) => l.textContent),
  chapters: document.querySelectorAll("#toc-list .chap").length,
  open: [...document.querySelectorAll("#toc-list .chap.open .tt")].map((t) => t.textContent),
  visibleLessons: [...document.querySelectorAll("#toc-list .chap-body button")].filter((b) => { const r = b.getBoundingClientRect(); return r.height > 4 && getComputedStyle(b.closest(".chap-body")).visibility !== "hidden" }).length,
  current: document.querySelector("#toc-list .chap.open button.on")?.firstChild?.textContent || null,
  nums: [...document.querySelectorAll("#toc-list .chap-head .n")].map((n) => n.textContent).join(" "),
}));
let s = await st(); console.log(JSON.stringify(s));
ok(s.levels.join() === "Basics,Intermediate,Advanced", "levels run basics to advanced: " + s.levels.join(" > "));
ok(s.chapters === 7 && s.open.length === 1, "seven chapters, exactly one open: " + s.open.join());
ok(!!s.current, "the open chapter is the one holding the current lesson: " + s.current);
ok(s.visibleLessons > 0 && s.visibleLessons <= 6, "only that chapter's lessons show: " + s.visibleLessons + " of 27");
await shot(PRE + "chapters");
// open another chapter: the first closes
await page.locator("#toc-list .chap-head", { hasText: "Entries" }).click(); await page.waitForTimeout(700);
s = await st();
ok(s.open.join() === "Entries" && s.visibleLessons === 5, "tapping a chapter opens it and closes the other: " + s.open.join() + ", " + s.visibleLessons + " lessons");
await shot(PRE + "chapters-entries");
// pick a lesson there: it opens, and the chapter stays open after the list re-renders
await page.locator("#toc-list .chap.open .chap-body button").nth(1).click(); await page.waitForTimeout(1800);
if (PHONE) { await page.click("#toc-toggle"); await page.waitForTimeout(600) }
s = await st();
ok(s.open.join() === "Entries" && s.current === "The mitigation entry", "choosing a lesson keeps its chapter open: " + s.current);
// tap the open chapter: it folds, nothing is open
await page.locator("#toc-list .chap.open .chap-head").click(); await page.waitForTimeout(700);
s = await st(); ok(s.open.length === 0 && s.visibleLessons === 0, "tapping the open chapter folds it");
// search still reaches every chapter
await page.fill("#toc-q", "divergence"); await page.waitForTimeout(600);
ok(await page.locator("#toc-list .hit").count() >= 1, "search still finds lessons across chapters");
await page.fill("#toc-q", ""); await page.waitForTimeout(400);
// put the account back on the lesson it started on
await page.locator("#toc-list .chap-head").first().click(); await page.waitForTimeout(500);
await page.locator("#toc-list .chap.open .chap-body button").nth(3).click(); await page.waitForTimeout(1200);
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
