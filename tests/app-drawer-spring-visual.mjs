// Phone drawer + floating tab bar (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-drawer-spring-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account) at 390x844 and checks:
// the tab-bar pill sits under the lit slot and follows every tap, the drawer
// opens on a spring (mid-flight frame, settled, scrim in, nav-open set), a
// touch swipe drags it shut and a short slow swipe snaps it back open, a
// vertical pan inside the list neither moves the drawer nor scrolls the page
// underneath, a row tap switches view + closes, the lit row shows its gold
// marker, the bar leaves the screen inside a chat conversation, light theme
// shots, and the desktop hover rail is untouched. Screenshots in OUT.
// Needs SUPABASE_ACCESS_TOKEN (or ~/.supabase/access-token) for the magic link.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"].find(existsSync);
const { chromium, devices } = require(LOCAL_PW ?? "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-drawer-spring-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://localhost:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const tokenFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
if (!mgmt) throw new Error("SUPABASE_ACCESS_TOKEN missing");
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
process.on("exit", () => { if (fails.length) console.error("fails so far:\n - " + fails.join("\n - ")); });
const browser = await chromium.launch();
async function ctxFor(phone, theme = "dark") {
  const ctx = await browser.newContext(phone
    ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(([k, v, theme]) => {
    localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1");
    localStorage.setItem("echelon-splash-day", new Date().toLocaleDateString("en-CA"));
    localStorage.setItem("echelon-theme", theme);
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 25000 });
  await page.waitForTimeout(1500);
  // hide toasts / tour pill so shots are clean
  await page.addStyleTag({ content: ".toast, #toast, .nu-pill, .nextup { display: none !important }" });
  return { ctx, page };
}
const sideX = (page) => page.evaluate(() => { const m = new DOMMatrix(getComputedStyle(document.querySelector(".side")).transform); return m.m41; });
const scrimA = (page) => page.evaluate(() => +getComputedStyle(document.getElementById("scrim")).opacity);

// ── phone, dark ────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(true);
  const shot = (n) => page.screenshot({ path: `${OUT}/after-${n}.png` });
  await shot("01-overview");

  // pill sits under the lit slot
  const pill = await page.evaluate(() => { const i = document.querySelector(".bnav-ind"); const b = document.querySelector("#bnav button.on"); return { live: i.classList.contains("live"), ix: i.getBoundingClientRect().x, bx: b.getBoundingClientRect().x, iw: i.getBoundingClientRect().width, bw: b.getBoundingClientRect().width }; });
  if (!pill.live) fails.push("pill not live");
  if (Math.abs((pill.ix + pill.iw / 2) - (pill.bx + pill.bw / 2)) > 2) fails.push("pill not centred under overview: " + JSON.stringify(pill));

  // open the drawer: frames mid-spring, then settled
  await page.tap("#menu-btn");
  await page.waitForTimeout(90); await shot("02-drawer-t90");
  const midX = await sideX(page);
  await page.waitForTimeout(110); await shot("03-drawer-t200");
  await page.waitForTimeout(500); await shot("04-drawer-open");
  const openX = await sideX(page), a = await scrimA(page);
  if (!(midX < 0 && midX > -312)) fails.push("drawer not mid-flight at 90ms: " + midX);
  if (Math.abs(openX) > 0.5) fails.push("drawer not settled open: " + openX);
  if (a < 0.98) fails.push("scrim not fully in: " + a);
  if (!(await page.evaluate(() => document.getElementById("app").classList.contains("nav-open")))) fails.push("nav-open class missing while open");

  // drag it shut with a touch swipe (CDP touch events, pointerType touch)
  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 3, radiusY: 3, force: 1, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(240, 500) });
  for (let i = 1; i <= 8; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(240 - i * 14, 500) }); await page.waitForTimeout(16); }
  const dragX = await sideX(page);
  await shot("05-drag-mid");
  if (!(dragX < -60 && dragX > -200)) fails.push("drawer did not follow the finger: " + dragX);
  for (let i = 9; i <= 14; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(240 - i * 14, 500) }); await page.waitForTimeout(16); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(700);
  const closedX = await sideX(page);
  if (closedX > -311) fails.push("swipe did not close the drawer: " + closedX);
  if (await page.evaluate(() => document.getElementById("app").classList.contains("nav-open"))) fails.push("nav-open still set after swipe close");
  if (await scrimA(page) > 0.01) fails.push("scrim still visible after close");

  // a short swipe that stays past halfway snaps back open
  await page.tap("#menu-btn"); await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(240, 500) });
  for (let i = 1; i <= 4; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(240 - i * 10, 500) }); await page.waitForTimeout(40); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(700);
  if (Math.abs(await sideX(page)) > 0.5) fails.push("short slow swipe should snap back open: " + await sideX(page));

  // vertical scroll intent inside the list must not grab the drawer
  // (a slow pan: a 1250px/s synthetic flick makes Chromium eat the NEXT tap as
  // a fling-cancel even with touch-action none, a CDP artifact unrelated to us)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(150, 400) });
  for (let i = 1; i <= 4; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(150 - i * 2, 400 + i * 8) }); await page.waitForTimeout(60); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  if (Math.abs(await sideX(page)) > 0.5) fails.push("vertical pan moved the drawer: " + await sideX(page));
  const pageY = await page.evaluate(() => document.scrollingElement.scrollTop);
  if (pageY > 0) fails.push("vertical pan on the drawer scrolled the page underneath: " + pageY);

  // tapping a row closes the drawer and switches the view; the row shows as lit next time
  if (Math.abs(await sideX(page)) > 0.5) { fails.push("drawer not open before the row tap: " + await sideX(page)); await page.tap("#menu-btn"); await page.waitForTimeout(700); }
  await page.tap('.tab[data-view="journal"]'); await page.waitForTimeout(700);
  if (await page.$eval(".view.on", (v) => v.id) !== "v-journal") fails.push("journal tab did not switch view");
  if (await page.evaluate(() => document.getElementById("app").classList.contains("nav-open"))) fails.push("drawer still open after tab tap");
  await page.tap("#menu-btn"); await page.waitForTimeout(700);
  const bar = await page.evaluate(() => getComputedStyle(document.querySelector('.tab[data-view="journal"]'), "::before").width);
  if (bar !== "3px") fails.push("active row marker missing: " + bar);
  await shot("06-drawer-journal-lit");
  // scrim tap closes
  await page.tap("#scrim", { position: { x: 350, y: 400 } }); await page.waitForTimeout(700);
  if (await page.evaluate(() => document.getElementById("app").classList.contains("nav-open"))) fails.push("scrim tap did not close");

  // pill slides across the bar
  for (const v of ["feed", "course", "chat", "set-profile"]) {
    await page.tap(`#bnav button[data-view="${v}"]`); await page.waitForTimeout(600);
    const p = await page.evaluate((v) => { const i = document.querySelector(".bnav-ind").getBoundingClientRect(); const b = document.querySelector(`#bnav button[data-view="${v}"]`).getBoundingClientRect(); return Math.abs((i.x + i.width / 2) - (b.x + b.width / 2)); }, v);
    if (p > 2) fails.push(`pill off-centre on ${v}: ${p}`);
  }
  await page.tap('#bnav button[data-view="course"]'); await page.waitForTimeout(220); await shot("07-pill-sliding");
  await page.waitForTimeout(500); await shot("08-study");
  // settings: press state on a row
  await page.evaluate(() => document.querySelector('.tab[data-view="settings"]').click()); await page.waitForTimeout(600);
  await shot("09-settings");
  // chat conversation hides the bar off-screen
  await page.tap('#bnav button[data-view="chat"]'); await page.waitForTimeout(1800);
  const first = page.locator(".cr-item").first();
  if (await first.count()) {
    await first.tap(); await page.waitForTimeout(700);
    const y = await page.evaluate(() => document.getElementById("bnav").getBoundingClientRect().y);
    if (y < 844) fails.push("tab bar still on screen inside a conversation: " + y);
    await shot("10-conversation");
  }
  await ctx.close();
}

// ── phone, light ───────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor(true, "light");
  await page.screenshot({ path: `${OUT}/after-11-light-overview.png` });
  await page.tap("#menu-btn"); await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/after-12-light-drawer.png` });
  await ctx.close();
}

// ── desktop: rail unchanged ────────────────────────────────────
{
  const { ctx, page } = await ctxFor(false);
  const t = await page.evaluate(() => document.querySelector(".side").style.transform);
  if (t) fails.push("desktop .side has an inline transform: " + t);
  if (await page.locator("#bnav").isVisible()) fails.push("bottom nav visible on desktop");
  await page.hover(".side"); await page.waitForTimeout(400);
  if (!(await page.evaluate(() => document.querySelector(".side").classList.contains("open")))) fails.push("desktop rail no longer opens on hover");
  await page.screenshot({ path: `${OUT}/after-13-desktop-rail.png` });
  await page.mouse.move(700, 400); await page.waitForTimeout(400);
  if (await page.evaluate(() => document.querySelector(".side").classList.contains("open"))) fails.push("desktop rail stays open");
  await ctx.close();
}

await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
