// Landing-page visual harness (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/landing-visual.mjs
// Full-page desktop + mobile shots plus section crops land in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/landing-shots`;
mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || "http://127.0.0.1:8123/";

const browser = await chromium.launch();
const errors = [];
const fails = [];

async function run(label, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label} pageerror: ` + e.message));
  await page.goto(URL, { waitUntil: "networkidle" }).catch(() => page.goto(URL, { waitUntil: "domcontentloaded" }));
  await page.waitForTimeout(2500); // let hero chart run a few frames
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (m.sw > m.iw) fails.push(`${label} horizontal overflow ${m.sw}/${m.iw}`);
  await page.screenshot({ path: `${OUT}/${label}-full.png`, fullPage: true });
  // viewport crops at a few scroll depths
  const H = await page.evaluate(() => innerHeight);
  for (const [n, y] of [["hero", 0], ["mid", H * 1.2], ["buy", H * 2.6]]) {
    await page.evaluate((yy) => scrollTo(0, yy), y);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${label}-${n}.png` });
  }
  await ctx.close();
}

await run("desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await run("mobile", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await browser.close();
console.log(fails.length ? "FAILS:\n  " + fails.join("\n  ") : "no overflow");
if (errors.length) console.log("errors:\n  " + errors.join("\n  "));
console.log("shots in " + OUT);
