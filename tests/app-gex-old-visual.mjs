// Old GEX levels say so (manual, not a node:test). D1, 2026-09-27: "on the gex dashboard it clearly says if
// they are old levels", and the chart's D1 GEX says when its levels are from and draws old ones differently.
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-gex-old-visual.mjs        (APP_URL / OUT env)
// The board's clock is window.__GEX_CLOCK (never a faked Date, which would expire the sign-in) and gex.json is
// the worker's real snapshot with its two clocks (generatedAt, chain.lastTrade) moved per case:
//   weekend      a Sunday rebuild of Friday's close: banner "Old levels", Friday's read, amber stamp
//   premarket    Monday 07:00 on Friday's close: old, "Today's first print lands from 8:00 AM ET"
//   preopen      Monday 08:50, the 08:45 pre-open print (prior close rows, this morning's OI): today's
//   session      Monday 11:00, a 10:59 print: no banner, "Updated", Today's read
//   behind       Monday 11:00, nothing since 10:15: "These levels are behind"
//   past day     the day nav on an archived day: no banner
// Then the chart: on the real feed the newest session's levels are an earlier day's, so the legend carries
// an amber "Old levels" pill, the phone chip says "D1 GEX · old", and the zones paint fainter than with the
// switch off. Screenshots at 2560, 1440 (dark and light) and a phone.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-gex-old`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const GEX = "https://gex-worker.d1fpc3.workers.dev";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "d1fpc3@gmail.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const note = (s) => console.log("  " + s);
const check = (ok, what) => { note((ok ? "ok   " : "FAIL ") + what); if (!ok) fails.push(what); };
const snaps = { nq: await (await fetch(`${GEX}/gex.json`)).json(), es: await (await fetch(`${GEX}/gex.json?book=es`)).json() };
note(`real snapshot: generatedAt ${snaps.nq.generatedAt}, lastTrade ${snaps.nq.chain?.lastTrade}`);
// ET wall clock to UTC ms (September: EDT, UTC-4)
const et = (ymd, hm) => Date.parse(`${ymd}T${hm}:00-04:00`);
const VP = {
  wide: { viewport: { width: 2560, height: 1300 }, deviceScaleFactor: 1 },
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const BROWSER = await chromium.launch();
async function board(name, { clock, gen, lastTrade, vp = "desk", theme = "dark", shot = true }) {
  const ctx = await BROWSER.newContext(VP[vp]);
  await ctx.addInitScript(([k, v, c, t]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-gex-book", "NQ"); localStorage.setItem("echelon-theme", t); if (c) window.__GEX_CLOCK = c; }, [`sb-${REF}-auth-token`, JSON.stringify(session), clock ?? null, theme]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push(`${name} pageerror: ${e.message}`));
  await page.route(/gex-worker\.d1fpc3\.workers\.dev\/refresh/, (route) => route.abort());
  await page.route(/gex-worker\.d1fpc3\.workers\.dev\/gex\.json(\?book=es)?$/, (route) => {
    const es = /book=es/.test(route.request().url());
    const d = structuredClone(es ? snaps.es : snaps.nq);
    if (gen) d.generatedAt = new Date(gen).toISOString();
    if (lastTrade) d.chain = { ...(d.chain || {}), lastTrade };
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(d) });
  });
  await page.goto(APP_URL + "?start=gex", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 30000 });
  await page.evaluate(() => document.querySelector('.tab[data-view="gex"]').click());
  await page.waitForFunction(() => document.querySelectorAll("#gex-read .v").length >= 4, null, { timeout: 30000 }).catch(() => fails.push(`${name}: board never filled`));
  await page.waitForTimeout(900);
  const st = await page.evaluate(() => {
    const b = document.getElementById("gex-old"), live = document.getElementById("gex-live");
    const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    return { shown: !b.hidden && r.height > 0, title: document.getElementById("gex-old-t").textContent, body: document.getElementById("gex-old-p").textContent, stamp: document.getElementById("gex-stamp").textContent, nav: document.getElementById("gex-day").textContent, read: document.getElementById("gex-read-title").textContent, old: live.classList.contains("old"), on: live.classList.contains("on"), dot: getComputedStyle(live.querySelector("i")).backgroundColor, stampC: getComputedStyle(document.getElementById("gex-stamp")).color, bg: cs.backgroundImage.slice(0, 60), w: r.width, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  console.log(`\n${name} (${vp} ${theme})`);
  note(JSON.stringify(st));
  if (shot) await page.screenshot({ path: `${OUT}/${name}-${vp}-${theme}.png` });
  return { st, page, ctx };
}
const done = async (r) => { await r.ctx.close(); };

// 1. the weekend: the snapshot the worker is serving right now (a Sunday rebuild of Friday's close)
for (const [vp, theme] of [["wide", "dark"], ["desk", "dark"], ["desk", "light"], ["phone", "dark"]]) {
  const r = await board("weekend", { clock: et("2026-09-27", "18:30"), gen: et("2026-09-27", "16:27"), lastTrade: "2026-09-25T15:59:59", vp, theme });
  const s = r.st;
  check(s.shown && s.title === "Old levels", `${vp}/${theme}: banner says Old levels`);
  check(/^These are Friday's levels, from the Sep 25 close\. Monday's first print lands from 8:00 AM ET/.test(s.body), `${vp}/${theme}: banner names the day and the next print: "${s.body}"`);
  check(s.stamp === "From Fri, Sep 25 close", `${vp}/${theme}: stamp says where the levels are from, not when the rebuild ran: "${s.stamp}"`);
  check(s.nav === "latest", `${vp}/${theme}: the day nav says latest, not today ("${s.nav}")`);
  check(s.read === "Friday's read", `${vp}/${theme}: the read is titled for its day ("${s.read}")`);
  check(s.old && !s.on, `${vp}/${theme}: amber dot, never the green live ping`);
  check(!s.overflow, `${vp}/${theme}: no horizontal page scroll`);
  if (vp === "phone") { const b = await r.page.locator("#gex-old").boundingBox(); check(b && b.x >= 12 && b.x + b.width <= 390 - 12, `phone: banner inside the gutters (${b && Math.round(b.x)} to ${b && Math.round(b.x + b.width)})`); }
  if (vp === "desk" && theme === "dark") { const b = await r.page.locator("#gex-old").boundingBox(); await r.page.screenshot({ path: `${OUT}/weekend-banner-crop.png`, clip: { x: b.x - 24, y: b.y - 80, width: Math.min(1440 - b.x + 24, b.width + 48), height: b.height + 150 } }); }
  await done(r);
}

// 2. Monday before the first print, on Friday's close
{
  const r = await board("premarket", { clock: et("2026-09-28", "07:00"), gen: et("2026-09-27", "16:27"), lastTrade: "2026-09-25T15:59:59", shot: false });
  check(r.st.shown && /Today's first print lands from 8:00 AM ET/.test(r.st.body), "premarket: old, and today's first print lands from 8:00");
  await done(r);
}
// 3. the pre-open print: prior close rows with this morning's open interest count as today's
{
  const r = await board("preopen", { clock: et("2026-09-28", "08:50"), gen: et("2026-09-28", "08:45"), lastTrade: "2026-09-25T15:59:59", shot: false });
  check(!r.st.shown && /^Updated Mon, Sep 28, 8:45 AM ET$/.test(r.st.stamp) && r.st.read === "Today's read", `preopen: today's levels (${r.st.stamp})`);
  await done(r);
}
// 4. the session, fresh
{
  const r = await board("session", { clock: et("2026-09-28", "11:00"), gen: et("2026-09-28", "10:59"), lastTrade: "2026-09-28T10:44:02" });
  check(!r.st.shown && /^Updated Mon, Sep 28, 10:59 AM ET$/.test(r.st.stamp) && r.st.read === "Today's read" && r.st.nav === "today" && !r.st.old, `session: no banner, "${r.st.stamp}", nav "${r.st.nav}"`);
  await done(r);
}
// 5. the session, prints stopped (the worker refuses a frozen chain; the last good one ages)
{
  const r = await board("behind", { clock: et("2026-09-28", "11:00"), gen: et("2026-09-28", "10:15"), lastTrade: "2026-09-28T10:00:05" });
  check(r.st.shown && r.st.title === "These levels are behind" && /No new print has landed since 10:15 AM ET, 45 minutes ago/.test(r.st.body), `behind: "${r.st.body}"`);
  check(r.st.stamp === "No new print since 10:15 AM ET" && r.st.read === "Today's read", `behind: stamp "${r.st.stamp}", read "${r.st.read}"`);
  await done(r);
}
// 6. a past day in the day nav: history says what it is on its own, no banner
{
  const r = await board("pastday", { clock: et("2026-09-27", "18:30"), gen: et("2026-09-27", "16:27"), lastTrade: "2026-09-25T15:59:59", shot: false });
  await r.page.waitForFunction(() => !document.getElementById("gex-prev").disabled, null, { timeout: 15000 }).catch(() => {});
  await r.page.click("#gex-prev");
  await r.page.waitForFunction(() => document.getElementById("gex-day").textContent !== "today", null, { timeout: 15000 }).catch(() => {});
  await r.page.waitForTimeout(2500);
  const s = await r.page.evaluate(() => ({ shown: !document.getElementById("gex-old").hidden, day: document.getElementById("gex-day").textContent, read: document.getElementById("gex-read-title").textContent, old: document.getElementById("gex-live").classList.contains("old"), stamp: document.getElementById("gex-stamp").textContent }));
  note(JSON.stringify(s));
  check(!s.shown && !s.old, `past day ${s.day}: no banner, stamp "${s.stamp}"`);
  await r.page.click("#gex-next");
  await r.page.waitForTimeout(1500);
  const back = await r.page.evaluate(() => ({ shown: !document.getElementById("gex-old").hidden, read: document.getElementById("gex-read-title").textContent }));
  check(back.shown && back.read === "Friday's read", `back to live: banner and Friday's read return (${JSON.stringify(back)})`);
  await done(r);
}

// 7. the chart on the real feed and the real clock (today is a weekend, so the newest session is an earlier day's)
async function chart(vp, oldOn) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(VP[vp]);
  await ctx.addInitScript(([k, v, on]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); localStorage.setItem("echelon-chart-tf", "5m"); localStorage.setItem("echelon-chart-sym", "NQ"); localStorage.setItem("echelon-chart-settings", JSON.stringify({ gex: true, gexOld: on })); }, [`sb-${REF}-auth-token`, JSON.stringify(session), oldOn]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push(`chart ${vp} pageerror: ${e.message}`));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click());
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open") } });
  await page.waitForFunction(() => /C\s?[\d,]/.test(document.getElementById("ch-legend").textContent), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(6000);
  const px = await page.evaluate(() => { const cv = document.getElementById("ch-canvas"); const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; const hit = (c, t = 60) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < t) n++; return n }; return { call: hit([239, 83, 80]), put: hit([38, 166, 154]), flip: hit([41, 98, 255]) } });
  const lg = await page.evaluate(() => { const r = document.querySelector('#ch-legend .ln[data-ind="gex"]'); const p = r?.querySelector(".gx-at"); return { row: r?.textContent || "", at: p?.textContent || "", old: p?.classList.contains("old"), tip: p?.getAttribute("title") || "", bg: p ? getComputedStyle(p).backgroundColor : "", chip: document.querySelector("#ch-legend .ind.gx-old")?.textContent || "" } });
  return { page, ctx, browser, px, lg };
}
console.log("\nchart");
{
  const on = await chart("desk", true);
  note(JSON.stringify(on.lg));
  check(on.lg.old && /^Old levels · \w{3} (close|\d{1,2}:\d{2} [AP]M)$/.test(on.lg.at), `legend: amber "${on.lg.at}"`);
  check(/^Levels from \w{3}, \w{3} \d{1,2}(, \d{1,2}:\d{2} [AP]M ET| close)\. /.test(on.lg.tip), `legend hover: "${on.lg.tip}"`);
  const b = await on.page.locator('#ch-legend .ln[data-ind="gex"]').boundingBox();
  if (b) await on.page.screenshot({ path: `${OUT}/chart-legend-old.png`, clip: { x: Math.max(0, b.x - 6), y: Math.max(0, b.y - 30), width: Math.min(900, b.width + 40), height: b.height + 40 } });
  await on.page.screenshot({ path: `${OUT}/chart-desk-old.png` });
  // the same chart with the switch off: the zones paint at full strength
  await on.page.evaluate(() => { window.__CH.s.gexOld = false; window.__CH.$.paint ? window.__CH.$.paint() : null; });
  await on.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await on.page.waitForTimeout(400);
  const off = await on.page.evaluate(() => { const cv = document.getElementById("ch-canvas"); const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; const hit = (c, t = 60) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < t) n++; return n }; return { call: hit([239, 83, 80]), put: hit([38, 166, 154]), flip: hit([41, 98, 255]) } });
  await on.page.screenshot({ path: `${OUT}/chart-desk-fulllook.png` });
  note(`zone pixels, old look ${JSON.stringify(on.px)} vs switch off ${JSON.stringify(off)}`);
  const sum = (o) => o.call + o.put + o.flip;
  check(sum(off) > 200 && sum(on.px) < sum(off) * 0.8, `old levels paint fainter (${sum(on.px)} strong-colour px vs ${sum(off)} with the switch off)`);
  // the gear lists the switch
  await on.page.evaluate(() => window.__CH.$.menu("ind:gex"));
  await on.page.waitForTimeout(500);
  const drawer = await on.page.evaluate(() => document.getElementById("ch-menu").textContent);
  check(/Fade old levels/.test(drawer), "D1 GEX gear has Fade old levels");
  await on.page.screenshot({ path: `${OUT}/chart-desk-gear.png` });
  await on.browser.close();

  const ph = await chart("phone", true);
  note(JSON.stringify(ph.lg));
  check(ph.lg.chip === "D1 GEX · old", `phone chip: "${ph.lg.chip}"`);
  await ph.page.screenshot({ path: `${OUT}/chart-phone-old.png` });
  await ph.browser.close();
}

await BROWSER.close();
console.log(`\nscreenshots: ${OUT}`);
if (fails.length) { console.log(`\n${fails.length} FAILED:\n - ` + fails.join("\n - ")); process.exit(1); }
console.log("\nall good");
