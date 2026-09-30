// Landing: the live GEX card (D1, 9/29: "add the gex somewhere on the landing page"); manual, not a node:test.
//   node tests/landing-gex-visual.mjs        (URL / OUT env; ONLY=desk,wide,iphone)
// Proves at 1440, 2560 and on an iPhone (WebKit): the GEX section sits on the landing with the real feed drawn
// (the bars are painted, the four levels are numbers, the regime is named); NQ / ES switches the book (the thumb
// slides, the tag and the levels change) and back; the link goes to /echelon/gex/; no sideways scroll, no page
// errors. Then, with the clock fixed and the feed replayed at chosen print times, the card's state tells the
// truth: Live in the session, Pre-open before 9:30, Closed after the bell (it used to say Pre-open), and Old
// levels the next morning.
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/landing-gex`; mkdirSync(OUT, { recursive: true });
const BASE = (process.env.URL || "http://127.0.0.1:8123/").replace(/\/?$/, "/");
const FEED = "https://gex-worker.d1fpc3.workers.dev/gex.json";
const fails = []; const ok = (c, w) => { console.log((c ? "  ok   " : "  FAIL ") + w); if (!c) fails.push(w); };
const VPS = { desk: [chromium, { viewport: { width: 1440, height: 900 } }], wide: [chromium, { viewport: { width: 2560, height: 1300 } }], iphone: [webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }] };

const readCard = (page) => page.evaluate(() => {
  const cv = document.getElementById("gx-canvas"), g = cv.getContext("2d");
  const px = g.getImageData(0, 0, cv.width, cv.height).data; let lit = 0;
  for (let i = 3; i < px.length; i += 16) if (px[i] > 0) lit++;
  const seg = document.getElementById("gx-seg");
  return {
    skel: document.getElementById("gx-card").classList.contains("skel"),
    lit, on: seg.getAttribute("data-on"), thumb: getComputedStyle(seg.querySelector(".gx-thumb")).transform,
    regime: document.getElementById("gx-regime").textContent, tag: document.getElementById("gx-tag").textContent,
    levels: [...document.querySelectorAll("#gx-levels b")].map((b) => b.textContent),
    state: document.getElementById("gx-state").textContent.replace(/\s+/g, " ").trim(),
    note: document.getElementById("gx-note").textContent.replace(/\s+/g, " ").trim(),
  };
});
const num = (v) => /^\d{1,3}(,\d{3})+$/.test(v);

for (const tag of (process.env.ONLY || "desk,wide,iphone").split(",")) {
  const [eng, opt] = VPS[tag];
  console.log(`== ${tag}`);
  const browser = await eng.launch();
  const ctx = await browser.newContext(opt);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const pos = await page.evaluate(() => { const s = [...document.querySelectorAll("main > section")].filter((n) => !n.hidden).map((n) => n.id || n.className); return s; });
  ok(pos.indexOf("gex") > 0 && pos.indexOf("gex") < pos.indexOf("access"), `[${tag}] the GEX section sits between the hero and the Join card (${pos.join(" > ")})`);
  await page.evaluate(() => document.getElementById("gx-card").scrollIntoView({ block: "center" }));
  await page.waitForFunction(() => !document.getElementById("gx-card").classList.contains("skel"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const nq = await readCard(page);
  ok(!nq.skel && nq.lit > 200, `[${tag}] the feed is drawn (${nq.lit} painted samples)`);
  ok(nq.levels.length === 4 && nq.levels.every(num), `[${tag}] four NQ levels: ${nq.levels.join(" / ")}`);
  ok(/^(Positive|Negative) gamma$/.test(nq.regime) && /NQ \d/.test(nq.tag), `[${tag}] the regime and the price: "${nq.regime}", "${nq.tag}"`);
  ok(/^(Live|Pre-open|Closed|Old levels|Behind)\b/.test(nq.state), `[${tag}] the state: "${nq.state}"`);
  await page.screenshot({ path: `${OUT}/${tag} 1 NQ.png` });
  // ES
  const es = page.locator('#gx-seg button[data-book="es"]');
  if (tag === "iphone") await es.tap(); else await es.click();
  await page.waitForFunction(() => /ES \d/.test(document.getElementById("gx-tag").textContent), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const e = await readCard(page);
  ok(e.on === "es" && e.thumb !== nq.thumb, `[${tag}] ES: the thumb slid (${nq.thumb} to ${e.thumb})`);
  ok(/ES \d/.test(e.tag) && e.levels.every(num) && e.levels.join() !== nq.levels.join(), `[${tag}] ES levels: ${e.levels.join(" / ")} ("${e.tag}")`);
  await page.screenshot({ path: `${OUT}/${tag} 2 ES.png` });
  const back = page.locator('#gx-seg button[data-book="nq"]');
  if (tag === "iphone") await back.tap(); else await back.click();
  await page.waitForTimeout(900);
  const n2 = await readCard(page);
  ok(n2.on === "nq" && n2.levels.join() === nq.levels.join(), `[${tag}] back to NQ, same levels`);
  const hit = await page.evaluate(() => { const r = document.querySelector('#gx-seg button[data-book="es"]').getBoundingClientRect(); return Math.round(r.height); });
  ok(hit >= 38, `[${tag}] the NQ / ES buttons are ${hit}px tall`);
  const link = await page.evaluate(() => document.querySelector("#gex .gx-go a")?.getAttribute("href"));
  ok(link === "/echelon/gex/", `[${tag}] the link goes to ${link}`);
  const st = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, d1gex: /D1 GEX/.test(document.body.innerText) }));
  ok(st.sw <= st.vw, `[${tag}] no sideways scroll (${st.sw} in ${st.vw})`);
  ok(!st.d1gex, `[${tag}] it is just GEX on the landing`);
  ok(!errors.length, `[${tag}] no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
  await browser.close();
}

// the state, at chosen times (Tuesday 2026-09-29, New York is UTC-4): the real feed replayed with its print time moved
console.log("== the state at chosen times (desk)");
const real = await (await fetch(FEED)).json();
const CASES = [
  ["Live", "2026-09-29T15:00:00Z", "2026-09-29T14:59:00Z", "2026-09-29T10:58:59", /^Live · 10:59 AM ET/, /reprinted every minute/],
  ["Pre-open", "2026-09-29T13:10:00Z", "2026-09-29T12:40:00Z", "2026-09-28T15:59:59", /^Pre-open · 8:40 AM ET/, /This morning's book/],
  ["Closed", "2026-09-29T20:40:00Z", "2026-09-29T20:20:00Z", "2026-09-29T15:59:59", /^Closed · 4:20 PM ET/, /closing book, as of 4:20 PM ET\. Tomorrow's first print/],
  ["Old levels", "2026-09-30T11:00:00Z", "2026-09-29T20:20:00Z", "2026-09-29T15:59:59", /^Old levels/, /These are Tuesday's levels/],
];
for (const [name, now, gen, lastTrade, wantState, wantNote] of CASES) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.clock.setFixedTime(new Date(now));
  await page.route(FEED + "*", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ...real, generatedAt: gen, chain: { ...real.chain, lastTrade } }) }));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.getElementById("gx-card").scrollIntoView({ block: "center" }));
  await page.waitForFunction(() => !document.getElementById("gx-card").classList.contains("skel"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(900);
  const c = await readCard(page);
  ok(wantState.test(c.state) && wantNote.test(c.note), `${name}: "${c.state}" | "${c.note}"`);
  await page.screenshot({ path: `${OUT}/state ${name}.png` });
  await browser.close();
}
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
