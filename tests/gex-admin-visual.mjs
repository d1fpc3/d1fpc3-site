// Visual harness for the Echelon admin GEX tab (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/gex-admin-visual.mjs        (ADMIN_URL / W / H / OUT env to override)
// It bypasses the login gate in-page (no Supabase session needed): the GEX tab
// only talks to the public gex-worker feed. Screenshots land in OUT (a temp dir by
// default) and the run prints tooltips, the readout, and any page/console errors.
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/gex-admin-shots`;
mkdirSync(OUT, { recursive: true });
const URL = process.env.ADMIN_URL || "http://127.0.0.1:8123/echelon/admin/";
const width = Number(process.env.W || 1380), height = Number(process.env.H || 1000);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("requestfailed", (r) => { if (!/esm\.sh|supabase/.test(r.url())) errors.push("reqfail: " + r.url()); });

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
// reveal the app shell without a session and open the GEX tab
await page.evaluate(() => {
  document.getElementById("gate").style.display = "none";
  document.getElementById("app").classList.add("on");
  document.querySelector('.tab[data-view="gex"]').click();
});
await page.waitForFunction(() => document.querySelectorAll("#gex-table tbody tr").length > 0, null, { timeout: 30000 });
await page.waitForTimeout(600);

const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }); console.log("shot", name); };
const setTheme = async (t) => { await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), t); await page.waitForTimeout(250); };

await setTheme("dark");
await shot("gex-surface-dark");
// hover a bar: move over the canvas centre-ish and see if the tooltip appears
const box = await page.locator("#gex-canvas").boundingBox();
await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
await page.waitForTimeout(200);
const tipTxt = await page.evaluate(() => { const t = document.getElementById("gex-tip"); return t.hidden ? "(hidden)" : t.innerText.replace(/\n/g, " | "); });
console.log("surface tooltip:", tipTxt);
// rotate by dragging
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.5 + 160, box.y + box.height * 0.5 - 40, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(200);
await shot("gex-surface-rotated");
await page.dblclick("#gex-canvas");
// sqrt scale
await page.click('#gex-scale button[data-z="sqrt"]'); await page.waitForTimeout(200);
await shot("gex-surface-sqrt");
await page.click('#gex-scale button[data-z="linear"]');
// marks input
await page.fill("#gex-marks", "30250, 735"); await page.waitForTimeout(250);
await shot("gex-surface-marks");
// profile
await page.click('#gex-view button[data-v="profile"]'); await page.waitForTimeout(300);
await shot("gex-profile-0dte");
const pbox = await page.locator("#gex-canvas").boundingBox();
await page.mouse.move(pbox.x + pbox.width * 0.5, pbox.y + pbox.height * 0.5); await page.waitForTimeout(200);
console.log("profile tooltip:", await page.evaluate(() => { const t = document.getElementById("gex-tip"); return t.hidden ? "(hidden)" : t.innerText.replace(/\n/g, " | "); }));
await page.click('#gex-set button[data-s="swing"]'); await page.waitForTimeout(250);
await shot("gex-profile-swing");
await page.click('#gex-set button[data-s="all"]'); await page.waitForTimeout(250);
await shot("gex-profile-all");
// light theme
await setTheme("light");
await shot("gex-profile-all-light");
await page.click('#gex-view button[data-v="surface"]'); await page.waitForTimeout(300);
await shot("gex-surface-light");
// narrow viewport
await page.setViewportSize({ width: 430, height: 900 }); await page.waitForTimeout(400);
await setTheme("dark");
await shot("gex-surface-mobile");
await page.click('#gex-view button[data-v="profile"]'); await page.waitForTimeout(300);
await shot("gex-profile-mobile");
// scroll to the table for a look
await page.evaluate(() => document.getElementById("gex-table").scrollIntoView());
await page.waitForTimeout(200);
await shot("gex-table-mobile");

console.log("readout:", await page.evaluate(() => [...document.querySelectorAll("#gex-read > div")].map((d) => d.innerText.replace(/\n/g, " · ")).join("  ||  ")));
console.log("stamp:", await page.evaluate(() => document.getElementById("gex-stamp").textContent));
console.log("table rows:", await page.evaluate(() => document.querySelectorAll("#gex-table tbody tr").length));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
