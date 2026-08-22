// Visual harness for the Echelon admin MSNR tab (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/msnr-admin-visual.mjs     (ADMIN_URL / W / H / OUT env to override)
// Bypasses the login gate in-page (the tab only fetches the static msnr.html
// fragment). Screenshots land in OUT and the run prints section counts, chart
// figure counts, the active index entry after scrolling, and any page errors.
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/msnr-admin-shots`;
mkdirSync(OUT, { recursive: true });
const URL = process.env.ADMIN_URL || "http://127.0.0.1:8123/echelon/admin/";
const width = Number(process.env.W || 1380), height = Number(process.env.H || 1000);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("requestfailed", (r) => { if (!/esm\.sh|supabase|gex-worker/.test(r.url())) errors.push("reqfail: " + r.url()); });

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  document.getElementById("gate").style.display = "none";
  document.getElementById("app").classList.add("on");
  document.querySelector('.tab[data-view="msnr"]').click();
});
await page.waitForFunction(() => document.querySelectorAll("#msnr-body .pb h2").length > 5, null, { timeout: 15000 });
await page.waitForTimeout(400);

const shot = async (name, full = false) => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log("shot", name); };
const setTheme = async (t) => { await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), t); await page.waitForTimeout(250); };

await setTheme("dark");
await shot("msnr-top-dark");
console.log("sections:", await page.evaluate(() => document.querySelectorAll("#msnr-body .pb h2").length),
  "toc links:", await page.evaluate(() => document.querySelectorAll("#msnr-toc a").length),
  "charts:", await page.evaluate(() => document.querySelectorAll("#msnr-body .m-chart svg").length),
  "candles:", await page.evaluate(() => document.querySelectorAll("#msnr-body .m-chart rect.up, #msnr-body .m-chart rect.dn").length),
  "callouts:", await page.evaluate(() => document.querySelectorAll("#msnr-body .pb-call").length));
// the hero QM chart, dark then light shell (chart panels stay white in both)
await page.evaluate(() => document.querySelectorAll("#msnr-body .m-chart")[2].scrollIntoView({ block: "center" }));
await page.waitForTimeout(400);
await shot("msnr-qm-chart-dark");
await setTheme("light");
await shot("msnr-qm-chart-light");
// jump via the index and confirm the spy follows
await page.click('#msnr-toc a:nth-of-type(6)');
await page.waitForTimeout(700);
console.log("after click, active:", await page.evaluate(() => document.querySelector("#msnr-toc a.on")?.textContent));
await shot("msnr-section5-light");
// the Memecoins tab must still load through the shared loader
await page.evaluate(() => document.querySelector('.tab[data-view="memes"]').click());
await page.waitForFunction(() => document.querySelectorAll("#memes-body .pb h2").length > 5, null, { timeout: 15000 });
console.log("memes sections (shared loader):", await page.evaluate(() => document.querySelectorAll("#memes-body .pb h2").length));
await page.evaluate(() => document.querySelector('.tab[data-view="msnr"]').click());
// mobile
await page.setViewportSize({ width: 430, height: 900 }); await page.waitForTimeout(400);
await setTheme("dark");
await page.evaluate(() => window.scrollTo(0, 0));
await shot("msnr-mobile-top");
await page.evaluate(() => document.querySelectorAll("#msnr-body .m-chart")[2].scrollIntoView({ block: "start" }));
await page.waitForTimeout(300);
await shot("msnr-mobile-chart");
console.log("h-scroll on mobile:", await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
