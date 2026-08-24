// Regenerate og.png (2400x1260) from the live-rendered hero.
//   python -m http.server 8123   then   node scripts/make-og.mjs
// Waits for the hero chart to finish its reveal (the hold frame with the
// delivery drawn) so the card never ships a half-drawn chart.
import { createRequire } from "module";
import { existsSync } from "fs";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const URL = process.env.URL || "http://127.0.0.1:8123/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle" }).catch(() => {});
// the reveal takes ~3.6s, then holds the finished frame for 3s
await page.waitForTimeout(4300);
await page.evaluate(() => { document.querySelector(".top").style.visibility = "hidden"; scrollTo(0, 0); });
await page.screenshot({ path: new globalThis.URL("../og.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), });
await browser.close();
console.log("og.png regenerated");
