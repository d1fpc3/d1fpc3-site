// Library watch screen and player (manual): fits the window, Up next, speed menu, volume, time left,
// fullscreen, end screen rolling into the next video. Player checks only run against production
// (the media function refuses localhost).  APP_URL=https://d1fpc3.com/echelon/app/ node tests/app-watch-visual.mjs
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-watch"); mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const browser = await chromium.launch();
const PHONE = process.env.PHONE === "1", PRE = PHONE ? "p-" : "d-"; const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: Number(process.env.W || 1440), height: Number(process.env.HGT || 900) } });
await ctx.addInitScript(([k, v, theme]) => { localStorage.setItem(k, v); if (theme) localStorage.setItem("echelon-theme", theme); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-chart-tf", "5m"); }, [`sb-${REF}-auth-token`, JSON.stringify(session), process.env.THEME || ""]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#td-h1", { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const go = async (v) => { await page.evaluate((v) => document.querySelector('.tab[data-view="' + v + '"]')?.click(), v); await page.waitForTimeout(2200) };
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };
const LIVE = /^https:\/\/d1fpc3\.com/.test(process.env.APP_URL || "");
await go("library"); await page.waitForTimeout(1200);
await page.locator(".lib-card").first().click(); await page.waitForTimeout(LIVE ? 6000 : 2500);
const lay = await page.evaluate(() => { const w = document.getElementById("libmodal"), p = document.getElementById("lib-player").getBoundingClientRect(), n = document.getElementById("lib-next"); return { open: !w.hidden, playerBottom: Math.round(p.bottom), vh: innerHeight, playerW: Math.round(p.width), ratio: +(p.width / p.height).toFixed(2), next: n.querySelectorAll(".wn").length, nextRight: Math.round(n.getBoundingClientRect().left) > Math.round(p.left), title: document.getElementById("lib-title").textContent, meta: document.getElementById("lib-meta").textContent, locked: getComputedStyle(document.body).overflow } });
console.log(JSON.stringify(lay));
ok(lay.open && lay.playerBottom <= lay.vh, "the whole video fits on screen, nothing cut off: bottom " + lay.playerBottom + " of " + lay.vh);
ok(Math.abs(lay.ratio - 1.78) < 0.03, "it keeps 16:9: " + lay.ratio);
ok(lay.next >= 1, "Up next lists the other videos: " + lay.next);
if (!PHONE) ok(lay.nextRight, "on desktop the list sits beside the video");
ok(/·/.test(lay.meta), "the header says what it is and when: " + lay.meta);
await shot(PRE + "watch");
if (LIVE) {
  const ctl = await page.evaluate(() => { const v = document.querySelector("#lib-player video"); return { ready: v?.readyState, dur: Math.round(v?.duration || 0), vol: !!document.querySelector("#lib-player .vp-vol input"), knob: !!document.querySelector("#lib-player .knob") } });
  ok(ctl.ready >= 1 && ctl.dur > 0, "the video loads: " + JSON.stringify(ctl)); ok(ctl.vol && ctl.knob, "volume slider and scrub knob are there");
  await page.locator('#lib-player button[title="Playback speed"]').click(); await page.waitForTimeout(300);
  ok(await page.locator("#lib-player .vp-menu button").count() === 7, "speed opens as a menu of seven");
  await page.locator("#lib-player .vp-menu button", { hasText: "1.5×" }).click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector("#lib-player video").playbackRate) === 1.5, "picking 1.5× sets it");
  await page.locator("#lib-player .vp").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.waitForTimeout(200);
  ok(await page.evaluate(() => Math.round(document.querySelector("#lib-player video").volume * 10)) === 8, "arrow down lowers the volume");
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp");
  await page.locator("#lib-player .vp-time").click(); await page.waitForTimeout(200);
  ok(/^-/.test(await page.textContent("#lib-player .vp-time")), "clicking the time shows time remaining");
  await page.locator("#lib-player .vp-time").click();
  if (!PHONE) {
    await page.locator('#lib-player button[title="Fullscreen"]').click(); await page.waitForTimeout(1200);
    const fs = await page.evaluate(() => { const e = document.fullscreenElement; if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), iw: innerWidth, ih: innerHeight } });
    ok(!!fs && Math.abs(fs.w - fs.iw) <= 2 && Math.abs(fs.h - fs.ih) <= 2, "fullscreen fills the screen exactly: " + JSON.stringify(fs));
    await shot(PRE + "watch-full");
    await page.keyboard.press("f"); await page.waitForTimeout(800);
    ok(await page.evaluate(() => !document.fullscreenElement), "F leaves fullscreen");
  }
  // the end screen rolls into the next video
  await page.evaluate(() => { const v = document.querySelector("#lib-player video"); v.muted = true; v.currentTime = Math.max(0, v.duration - 0.4); return v.play() }).catch(() => {}); await page.waitForTimeout(2500);
  const end = await page.evaluate(() => { const e = document.querySelector("#lib-player .vp-end"); return e ? { k: e.querySelector(".k").textContent, t: e.querySelector(".t").textContent, btns: [...e.querySelectorAll("button")].map((b) => b.textContent) } : null });
  ok(!!end && /Up next in \d/.test(end.k) && end.btns.includes("Play now"), "when it ends it offers the next video with a countdown: " + JSON.stringify(end));
  await shot(PRE + "watch-end");
  const before = await page.textContent("#lib-title");
  await page.locator("#lib-player .vp-end button.vp-go").click(); await page.waitForTimeout(5000);
  const after = await page.textContent("#lib-title");
  ok(after !== before && after === end.t, "Play now opens it: " + before + " -> " + after);
  await page.evaluate(() => { try { localStorage.setItem("echelon-vp-rate", "1") } catch {} });
}
await page.keyboard.press("Escape"); await page.waitForTimeout(600);
ok(await page.evaluate(() => document.getElementById("libmodal").hidden && !document.body.classList.contains("watching")), "Escape goes back to the library");
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
