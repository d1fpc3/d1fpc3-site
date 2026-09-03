// Refresh button + pull glyph checks (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-refresh-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account, a plain member), then
// on desktop (1280x800) and phone (390x844): the topbar carries #tb-refresh
// just left of the bell; clicking it spins (.busy, aria-busy), repaints the
// view, and ends on the gold tick (.done) with a "Refreshed <time>" tooltip;
// a click mid-refresh is ignored. On the phone the feed shows the button as
// a glass circle beside the bell, and the pull gesture (CDP touch) turns the
// disc gold when armed, fires the same routine, and ends on the tick.
// Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-refresh-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://localhost:8080/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const note = (s) => console.log("  " + s);
const browser = await chromium.launch();
async function ctxFor(phone) {
  const ctx = await browser.newContext(phone
    ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`${r.status()} ${r.url()}`); });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 25000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const topbarShot = (page, name) => page.locator(".topbar").screenshot({ path: `${OUT}/${name}.png` });
const btnState = (page) => page.evaluate(() => {
  const b = document.getElementById("tb-refresh"), bell = document.getElementById("tb-bell");
  const r = b.getBoundingClientRect(), rb = bell.getBoundingClientRect();
  return { busy: b.classList.contains("busy"), ariaBusy: b.getAttribute("aria-busy"), done: b.classList.contains("done"), title: b.title, w: r.width, h: r.height, leftOfBell: r.right <= rb.left + 1, sameRow: Math.abs((r.top + r.height / 2) - (rb.top + rb.height / 2)) < 2, skel: document.querySelectorAll(".view.on .skel").length };
});

// One click: spin → tick → back to arrows.
async function clickCycle(page, label) {
  const before = await btnState(page);
  if (!(before.w > 30 && before.h > 30)) fails.push(`${label}: button too small ${before.w}x${before.h}`);
  if (!before.leftOfBell || !before.sameRow) fails.push(`${label}: button not sitting left of the bell on the same row`);
  await page.click("#tb-refresh");
  await page.waitForTimeout(140);
  const mid = await btnState(page);
  note(`${label} mid: busy=${mid.busy} aria=${mid.ariaBusy} skel=${mid.skel}`);
  if (!mid.busy || mid.ariaBusy !== "true") fails.push(`${label}: no busy state after click`);
  await topbarShot(page, `${label}-2-spinning`);
  // a second click while busy must not start another pass
  await page.click("#tb-refresh");
  await page.waitForFunction(() => document.getElementById("tb-refresh").classList.contains("done"), null, { timeout: 20000 }).catch(() => fails.push(`${label}: never reached the tick`));
  await page.waitForTimeout(220);
  const done = await btnState(page);
  note(`${label} done: done=${done.done} title="${done.title}" skel=${done.skel}`);
  if (!/^Refreshed /.test(done.title)) fails.push(`${label}: tooltip not updated (${done.title})`);
  if (done.skel > 0) fails.push(`${label}: skeletons still showing after refresh`);
  await topbarShot(page, `${label}-3-tick`);
  await page.waitForFunction(() => !document.getElementById("tb-refresh").classList.contains("done"), null, { timeout: 5000 }).catch(() => fails.push(`${label}: tick never cleared`));
  await topbarShot(page, `${label}-4-after`);
}

// ── desktop ─────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(false);
  await topbarShot(page, "desk-1-topbar");
  await page.hover("#tb-refresh");
  await page.waitForTimeout(300);
  await topbarShot(page, "desk-1b-hover");
  await page.mouse.move(600, 400);
  await clickCycle(page, "desk-overview");
  await page.screenshot({ path: `${OUT}/desk-5-full.png` });
  // a view with its own loader: the feed
  await page.evaluate(() => document.querySelector('.tab[data-view="feed"]').click());
  await page.waitForTimeout(900);
  await clickCycle(page, "desk-feed");
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(true);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (m.sw > m.iw) fails.push(`phone overflow ${m.sw}/${m.iw}`);
  await topbarShot(page, "phone-1-topbar");
  await clickCycle(page, "phone-overview");
  await page.screenshot({ path: `${OUT}/phone-5-full.png` });

  // feed mode: both controls become glass circles
  await page.evaluate(() => document.querySelector('#bnav button[data-view="feed"]').click());
  await page.waitForTimeout(900);
  const feed = await page.evaluate(() => {
    const cs = (id) => { const e = document.getElementById(id), s = getComputedStyle(e), r = e.getBoundingClientRect(); return { br: s.borderRadius, w: Math.round(r.width), h: Math.round(r.height), vis: r.width > 0 }; };
    return { inFeed: document.body.classList.contains("in-feed"), refresh: cs("tb-refresh"), bell: cs("tb-bell") };
  });
  note("phone feed: " + JSON.stringify(feed));
  if (!feed.inFeed || feed.refresh.w !== 44 || feed.refresh.h !== 44 || feed.refresh.br !== "50%") fails.push("phone feed: refresh is not the 44px glass circle");
  await page.screenshot({ path: `${OUT}/phone-6-feed.png` });
  await page.evaluate(() => document.querySelector('#bnav button[data-view="feed"]').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#bnav button[data-view="overview"]').click());
  await page.waitForTimeout(600);

  // pull to refresh: the disc's arrows turn with the finger and go gold when armed
  await page.evaluate(() => window.scrollTo(0, 0));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 200 }] });
  for (let y = 210; y <= 260; y += 10) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y }] }); await page.waitForTimeout(16); }
  const half = await page.evaluate(() => { const p = document.getElementById("ptr"); return { p: p.style.getPropertyValue("--p"), rot: getComputedStyle(p.querySelector(".rf-arrows")).transform, armed: document.body.classList.contains("ptr-armed") }; });
  note("ptr half: " + JSON.stringify(half));
  if (half.armed || !(parseFloat(half.p) > 0.1 && parseFloat(half.p) < 1)) fails.push("ptr: half pull not tracking (" + JSON.stringify(half) + ")");
  if (half.rot === "none") fails.push("ptr: arrows not turning with the pull");
  await page.screenshot({ path: `${OUT}/phone-7-pull-half.png` });
  for (let y = 270; y <= 360; y += 10) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y }] }); await page.waitForTimeout(16); }
  await page.waitForTimeout(200);
  const armed = await page.evaluate(() => { const p = document.getElementById("ptr"); const gold = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim(); const probe = document.createElement("i"); probe.style.color = gold; document.body.appendChild(probe); const g = getComputedStyle(probe).color; probe.remove(); return { armed: document.body.classList.contains("ptr-armed"), p: p.style.getPropertyValue("--p"), color: getComputedStyle(p).color, gold: g, opacity: getComputedStyle(p).opacity }; });
  note("ptr armed: " + JSON.stringify(armed));
  if (!armed.armed || armed.p !== "1.000") fails.push("ptr: full pull did not arm");
  if (armed.color !== armed.gold) fails.push(`ptr: armed disc is not gold (${armed.color} vs ${armed.gold})`);
  const pill = await page.evaluate(() => { const n = document.getElementById("nextup"); return n && !n.hidden ? getComputedStyle(n).opacity : "n/a"; });
  note("nextup during pull: " + pill);
  if (pill !== "n/a" && pill !== "0") fails.push("ptr: What's next pill still covering the disc during the pull");
  await page.screenshot({ path: `${OUT}/phone-8-pull-armed.png` });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(160);
  const busy = await page.evaluate(() => ({ busy: document.body.classList.contains("ptr-busy"), skel: document.querySelectorAll(".view.on .skel").length, anim: document.querySelector("#ptr .rf-arrows").getAnimations().length }));
  note("ptr released: " + JSON.stringify(busy));
  if (!busy.busy) fails.push("ptr: release did not fire the refresh");
  if (busy.anim < 1) fails.push("ptr: arrows not spinning while busy");
  await page.screenshot({ path: `${OUT}/phone-9-pull-busy.png` });
  await page.waitForFunction(() => document.getElementById("ptr").classList.contains("done"), null, { timeout: 20000 }).catch(() => fails.push("ptr: never showed the tick"));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/phone-10-pull-tick.png` });
  await page.waitForFunction(() => !document.body.classList.contains("ptr-busy") && !document.getElementById("ptr").classList.contains("done"), null, { timeout: 10000 }).catch(() => fails.push("ptr: did not settle"));
  const settled = await page.evaluate(() => ({ skel: document.querySelectorAll(".view.on .skel").length, mainT: document.querySelector(".main").style.transform, op: getComputedStyle(document.getElementById("ptr")).opacity }));
  note("ptr settled: " + JSON.stringify(settled));
  if (settled.skel > 0 || settled.mainT) fails.push("ptr: page did not settle after refresh " + JSON.stringify(settled));
  await page.screenshot({ path: `${OUT}/phone-11-settled.png` });
  await ctx.close();
}

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
