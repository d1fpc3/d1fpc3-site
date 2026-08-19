// Visual harness for the members-app hover sidebar (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/sidebar-hover-visual.mjs        (APP_URL / OUT env to override)
// Bypasses the login gate in-page, then: rail at rest -> hover -> leave ->
// keyboard focus -> blur, asserting the .open class and aside width at each
// step, and checks the main column does NOT move when the rail opens.
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/sidebar-hover-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  document.getElementById("gate").style.display = "none";
  document.getElementById("app").classList.add("on");
  document.documentElement.setAttribute("data-theme", "dark");
});
await page.mouse.move(900, 400);
await page.waitForTimeout(300);

const state = () => page.evaluate(() => {
  const s = document.querySelector(".side"), m = document.querySelector(".main");
  return { open: s.classList.contains("open"), w: Math.round(s.getBoundingClientRect().width), mainX: Math.round(m.getBoundingClientRect().left) };
});
const fails = [];
const expect = (label, cond, got) => { console.log(`${cond ? "ok " : "BAD"} ${label}  ${JSON.stringify(got)}`); if (!cond) fails.push(label); };

let s = await state();
expect("rest: rail closed at 68px", !s.open && s.w === 68, s);
const restMainX = s.mainX;
await page.screenshot({ path: `${OUT}/1-rest.png` });

await page.mouse.move(30, 300);
await page.waitForTimeout(400);
s = await state();
expect("hover: open at 244px, main column unmoved", s.open && s.w === 244 && s.mainX === restMainX, s);
await page.screenshot({ path: `${OUT}/2-hover.png` });

await page.mouse.move(900, 400);
await page.waitForTimeout(450);
s = await state();
expect("leave: closed again", !s.open && s.w === 68, s);

await page.focus('.tab[data-view="course"]');
await page.waitForTimeout(300);
s = await state();
expect("keyboard focus: open", s.open && s.w === 244, s);
await page.screenshot({ path: `${OUT}/3-focus.png` });

await page.evaluate(() => document.activeElement.blur());
await page.waitForTimeout(450);
s = await state();
expect("blur: closed", !s.open && s.w === 68, s);

await browser.close();
console.log(`\n${fails.length ? fails.length + " FAILED" : "all good"}, shots in ${OUT}`);
if (errors.length) { console.log("errors:\n  " + errors.join("\n  ")); process.exit(1); }
if (fails.length) process.exit(1);
