// Admin "Play the intro" button (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/admin-intro-visual.mjs        (ADMIN_URL / OUT env)
// Bypasses the login gate in-page like the other admin harnesses (the button
// needs no data), opens Settings, checks the Members app block + button,
// clicks it: the splash mounts with the lockup and its animations, a frame is
// captured mid-intro, it fades out and unmounts on its own; a second run is
// ended early by a click. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/admin-intro-shots`;
mkdirSync(OUT, { recursive: true });
const URL = process.env.ADMIN_URL || "http://127.0.0.1:8080/echelon/admin/";
const fails = [];
const note = (s) => console.log("  " + s);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  document.getElementById("gate").style.display = "none";
  document.getElementById("app").classList.add("on");
  document.querySelector('.tab[data-view="settings"]').click();
});
await page.waitForTimeout(400);
const btn = await page.evaluate(() => { const b = document.getElementById("play-intro"); const r = b?.getBoundingClientRect(); return { present: !!b, text: b?.textContent.trim(), visible: !!r && r.width > 0 && r.height > 0, tpl: !!document.getElementById("splash-tpl"), splashNow: !!document.getElementById("splash") }; });
note("button: " + JSON.stringify(btn));
if (!btn.present || !btn.visible || btn.text !== "Play the intro" || !btn.tpl || btn.splashNow) fails.push("button/template not as expected " + JSON.stringify(btn));
await page.locator("#v-settings").screenshot({ path: `${OUT}/1-settings.png` });

// play: mounts, animates, unmounts by itself
await page.click("#play-intro");
await page.waitForTimeout(120);
const live = await page.evaluate(() => ({ splash: !!document.getElementById("splash"), e: !!document.querySelector("#splash .sp-e"), letters: document.querySelectorAll("#splash .sp-l").length, anims: document.getAnimations().length, z: getComputedStyle(document.getElementById("splash")).zIndex }));
note("playing: " + JSON.stringify(live));
if (!live.splash || !live.e || live.letters !== 7 || live.anims < 10) fails.push("intro did not mount/animate " + JSON.stringify(live));
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/2-mid-intro.png` });
await page.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 6000 }).catch(() => fails.push("intro never unmounted"));
const gone = await page.evaluate(() => !document.getElementById("splash"));
note("unmounted by itself: " + gone);

// early end by click
await page.click("#play-intro");
await page.waitForTimeout(300);
await page.mouse.click(640, 400);
await page.waitForTimeout(50);
const early = await page.evaluate(() => document.getElementById("splash")?.classList.contains("off"));
note("click ends early (.off): " + early);
if (!early) fails.push("click did not end the intro early");
await page.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 3000 }).catch(() => fails.push("early-ended intro never unmounted"));

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
