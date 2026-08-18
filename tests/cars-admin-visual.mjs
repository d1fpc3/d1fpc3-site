// Visual harness for the Echelon admin Cars tab (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/cars-admin-visual.mjs        (ADMIN_URL / W / H / OUT env to override)
// Bypasses the login gate in-page (the tab only fetches the static playbook.html
// fragment). Screenshots land in OUT and the run prints section counts, the
// active index entry after scrolling, and any page/console errors.
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/cars-admin-shots`;
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
  document.querySelector('.tab[data-view="cars"]').click();
});
await page.waitForFunction(() => document.querySelectorAll("#cars-body .pb h2").length > 5, null, { timeout: 15000 });
await page.waitForTimeout(400);

const shot = async (name, full = false) => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log("shot", name); };
const setTheme = async (t) => { await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), t); await page.waitForTimeout(250); };

await setTheme("dark");
await shot("cars-top-dark");
console.log("sections:", await page.evaluate(() => document.querySelectorAll("#cars-body .pb h2").length),
  "toc links:", await page.evaluate(() => document.querySelectorAll("#cars-toc a").length),
  "tables:", await page.evaluate(() => document.querySelectorAll("#cars-body table").length),
  "sources:", await page.evaluate(() => document.querySelectorAll("#cars-body .pb-src a").length));
// jump via the index to section 3 and confirm the spy follows
await page.click('#cars-toc a:nth-of-type(4)');
await page.waitForTimeout(700);
console.log("after click, active:", await page.evaluate(() => document.querySelector("#cars-toc a.on")?.textContent));
await shot("cars-section3-dark");
// scroll to the money section (7) by hand
await page.evaluate(() => document.getElementById("pb-7-structuring-the-money").scrollIntoView());
await page.waitForTimeout(700);
console.log("after scroll, active:", await page.evaluate(() => document.querySelector("#cars-toc a.on")?.textContent));
await shot("cars-money-dark");
// a table + callout close-up
await page.evaluate(() => document.querySelector("#cars-body .pb-call.warn").scrollIntoView({ block: "center" }));
await page.waitForTimeout(400);
await shot("cars-montana-callout-dark");
await setTheme("light");
await shot("cars-montana-callout-light");
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await shot("cars-top-light");
// mobile
await page.setViewportSize({ width: 430, height: 900 }); await page.waitForTimeout(400);
await setTheme("dark");
await page.evaluate(() => window.scrollTo(0, 0));
await shot("cars-mobile-top");
await page.evaluate(() => document.querySelector("#cars-body table").scrollIntoView({ block: "start" }));
await page.waitForTimeout(300);
await shot("cars-mobile-table");
console.log("h-scroll on mobile:", await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
