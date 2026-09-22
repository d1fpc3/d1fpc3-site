// Sections navigation (2026-09-22): the rail and the phone dock hold five
// sections (Today, Trade, Learn, Community, You); the top bar's segmented
// control switches pages within one. Manual harness, not a node:test.
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-sections-nav-visual.mjs        (APP_URL / OUT / EMAIL env)
// Signs in as EMAIL (default: the App Review account), then checks at
// 1440x900, 2560x1300 (D1's monitor, root zoom on) and 390x844 (phone):
// five rail sections in order, each lands on its first page, the segment
// lists that section's visible pages and switches them in place, a
// settings sub-page keeps Settings lit with a "You / Settings" crumb, the
// hover map opens, the dock has five slots that light by section, the
// hamburger is gone, chat leaves room for the segment row, the segment
// floats over the feed and still takes taps, nothing overflows sideways.
// Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-sections-nav-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://localhost:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed: " + JSON.stringify(session).slice(0, 200));

const fails = [];
const browser = await chromium.launch();
async function ctxFor(kind) {
  const ctx = await browser.newContext(kind === "phone"
    ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : kind === "wide" ? { viewport: { width: 2560, height: 1300 } } : { viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push(`[${kind}] pageerror: ` + e.message));
  page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`[${kind}] ${r.status()} ${r.url()}`); });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 25000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const SECS = ["today", "trade", "learn", "community", "you"];
const FIRST = { today: "overview", trade: "chart", learn: "course", community: "feed", you: "set-profile" };
const curView = (page) => page.$eval(".view.on", (el) => el.id.replace(/^v-/, ""));
const noOverflow = async (page, label) => {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (m.sw > m.iw) fails.push(`${label} overflow ${m.sw}/${m.iw}`);
};
const segLabels = (page) => page.$$eval("#tb-seg button", (bs) => bs.map((b) => b.textContent.trim()));
const segLit = (page) => page.$$eval("#tb-seg button.on", (bs) => bs.map((b) => b.dataset.view));

// ── desktop 1440 ────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor("desk");
  const shot = (n) => page.screenshot({ path: `${OUT}/desk-${n}.png` });
  const secs = await page.$$eval("#tabs .sec[data-sec]", (bs) => bs.map((b) => b.dataset.sec));
  if (secs.join() !== SECS.join()) fails.push("rail sections wrong: " + secs);
  const oldTabsVisible = await page.$$eval("#tabs .grp-pages .tab", (ts) => ts.filter((t) => t.offsetParent !== null).length);
  if (oldTabsVisible) fails.push(`resting rail shows ${oldTabsVisible} page rows`);
  if (await page.locator(".side-user").isVisible()) fails.push("old side-user footer still visible on desktop");
  if (await page.locator("#tb-seg-row").isVisible()) fails.push("segment shown on Today");
  const railW = await page.$eval(".side", (n) => n.getBoundingClientRect().width);
  if (railW < 60 || railW > 90) fails.push("rail width odd: " + railW);
  await shot("01-today"); await noOverflow(page, "desk today");

  for (const s of SECS) {
    await page.click(`#tabs .sec[data-sec="${s}"]`); await page.waitForTimeout(700);
    const v = await curView(page);
    if (v !== FIRST[s]) fails.push(`rail ${s} opened ${v}, wanted ${FIRST[s]}`);
    const lit = await page.$$eval("#tabs .sec.on", (bs) => bs.map((b) => b.dataset.sec));
    if (lit.join() !== s) fails.push(`rail lit ${lit} after ${s}`);
    const indLive = await page.$eval("#tabs .side-ind", (i) => i.classList.contains("live"));
    if (!indLive) fails.push(`rail indicator not live on ${s}`);
  }
  // trade: the segment lists the section's pages and switches in place
  await page.click('#tabs .sec[data-sec="trade"]'); await page.waitForTimeout(600);
  // chart hides the top bar; go to news via the registry to read the segment
  await page.evaluate(() => document.querySelector('.tab[data-view="news"]').click()); await page.waitForTimeout(900);
  const title = await page.textContent("#pane-title");
  if (title.trim() !== "Trade") fails.push("trade title: " + title);
  const labels = await segLabels(page);
  if (labels[0] !== "Chart" || !labels.includes("News") || !labels.includes("Prop firms")) fails.push("trade segment: " + labels);
  if ((await segLit(page)).join() !== "news") fails.push("news not lit in segment: " + (await segLit(page)));
  await shot("02-trade-news"); await noOverflow(page, "desk news");
  await page.click('#tb-seg button[data-view="propfirms"]'); await page.waitForTimeout(800);
  if (await curView(page) !== "propfirms") fails.push("segment click did not open prop firms");
  if ((await segLit(page)).join() !== "propfirms") fails.push("propfirms not lit");
  const ind = await page.$eval("#tb-seg .tbseg-ind", (i) => ({ live: i.classList.contains("live"), w: parseFloat(i.style.width) }));
  if (!ind.live || !(ind.w > 20)) fails.push("segment pill not placed: " + JSON.stringify(ind));
  await shot("03-trade-propfirms");
  // the segment reaches the chart too (desktop has no chart back button; the rail is there)
  await page.click('#tb-seg button[data-view="chart"]'); await page.waitForTimeout(1200);
  if (await curView(page) !== "chart") fails.push("segment chart click failed");
  await page.evaluate(() => document.querySelector('.tab[data-view="propfirms"]').click()); await page.waitForTimeout(600);
  // section memory: leave Trade, come back, land on prop firms
  await page.click('#tabs .sec[data-sec="learn"]'); await page.waitForTimeout(600);
  await page.click('#tabs .sec[data-sec="trade"]'); await page.waitForTimeout(600);
  if (await curView(page) !== "propfirms") fails.push("trade did not remember prop firms: " + await curView(page));
  // learn
  await page.click('#tabs .sec[data-sec="learn"]'); await page.waitForTimeout(800);
  const learn = await segLabels(page);
  if (learn[0] !== "Study" || !learn.includes("Library") || !learn.includes("Indicators")) fails.push("learn segment: " + learn);
  await shot("04-learn");
  await page.click('#tb-seg button[data-view="library"]'); await page.waitForTimeout(1200);
  if (await curView(page) !== "library") fails.push("segment library click failed");
  await shot("05-learn-library");
  // community: members via the segment
  await page.click('#tabs .sec[data-sec="community"]'); await page.waitForTimeout(800);
  await page.click('#tb-seg button[data-view="members"]'); await page.waitForTimeout(800);
  if (await curView(page) !== "members") fails.push("segment members click failed");
  if ((await page.textContent("#pane-title")).trim() !== "Community") fails.push("community title wrong");
  await shot("06-community-members");
  // you: lands on the profile (the journal hides the top bar on desktop), then settings, then a sub-page keeps Settings lit with a crumb
  await page.click('#tabs .sec[data-sec="you"]'); await page.waitForTimeout(600);
  if (await curView(page) !== "set-profile") fails.push("desk: You did not land on the profile");
  await page.click('#tb-seg button[data-view="settings"]'); await page.waitForTimeout(700);
  const you = await segLabels(page);
  if (you.join() !== "Journal,Profile,Settings") fails.push("you segment: " + you);
  await shot("07-you-settings");
  await page.evaluate(() => document.querySelector('.tab[data-view="set-appearance"]').click()); await page.waitForTimeout(700);
  const t2 = (await page.textContent("#pane-title")).trim(), c2 = (await page.textContent("#pane-crumb")).trim();
  if (t2 !== "Appearance") fails.push("sub-page title: " + t2);
  if (c2 !== "You / Settings") fails.push("sub-page crumb: " + c2);
  if ((await segLit(page)).join() !== "settings") fails.push("settings not lit on appearance: " + (await segLit(page)));
  if ((await page.$$eval("#tabs .sec.on", (bs) => bs.map((b) => b.dataset.sec))).join() !== "you") fails.push("rail not on You for appearance");
  await shot("08-you-appearance");
  // the hover map
  await page.mouse.move(36, 400); await page.waitForTimeout(500);
  if (!(await page.$eval(".side", (n) => n.classList.contains("open")))) fails.push("rail did not open on hover");
  const mapRows = await page.$$eval("#tabs .grp-pages .tab", (ts) => ts.filter((t) => t.offsetParent !== null).map((t) => t.dataset.view));
  for (const v of ["chart", "news", "propfirms", "course", "library", "indicators", "feed", "chat", "members", "journal", "set-profile", "settings"]) if (!mapRows.includes(v)) fails.push("hover map missing " + v);
  if (mapRows.includes("overview")) fails.push("hover map lists Today twice");
  await shot("09-hover-map");
  await page.mouse.move(800, 500); await page.waitForTimeout(500);
  if (await page.$eval(".side", (n) => n.classList.contains("open"))) fails.push("rail stayed open after leaving");
  // tools footer: not an admin, so no Admin row; the Settings admin row is hidden too
  if (await page.locator("#admin-link").isVisible()) fails.push("admin link visible for a member");
  if (await page.locator("#set-admin-row").isVisible()) fails.push("settings admin row visible for a member");
  // palette: recents pinned first after moving around; g then n jumps to News; ? opens the sheet
  await page.keyboard.press("Control+k"); await page.waitForTimeout(500);
  if (!(await page.locator("#palette").isVisible())) fails.push("palette did not open");
  const heads = await page.$$eval("#pal-list .pal-h", (hs) => hs.map((h) => h.textContent.trim()));
  if (heads[0] !== "Recent") fails.push("palette recents not first: " + heads);
  const recHint = await page.$eval("#pal-list .pal-it small", (n) => n.textContent);
  if (!/·|Trade|Learn|Community|You/.test(recHint)) fails.push("palette hint lacks the section: " + recHint);
  await shot("10-palette-recents");
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  await page.keyboard.press("g"); await page.keyboard.press("n"); await page.waitForTimeout(900);
  if (await curView(page) !== "news") fails.push("g n did not jump to news: " + await curView(page));
  await page.keyboard.type("?"); await page.waitForTimeout(400);
  if (!(await page.locator("#keys").isVisible())) fails.push("? did not open the sheet");
  if ((await page.locator("#keys .keys-row").count()) < 12) fails.push("shortcut sheet too short");
  await shot("11-keys-sheet");
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  if (await page.locator("#keys").isVisible()) fails.push("Escape did not close the sheet");
  // keys typed into a field never jump
  await page.evaluate(() => document.querySelector('.tab[data-view="members"]').click()); await page.waitForTimeout(600);
  await page.click("#member-q"); await page.keyboard.type("gn"); await page.waitForTimeout(500);
  if (await curView(page) !== "members") fails.push("typing g n in a field jumped away");
  // back to Today
  await page.click('#tabs .sec[data-sec="today"]'); await page.waitForTimeout(600);
  if (await curView(page) !== "overview") fails.push("today click failed");
  await ctx.close();
}

// ── desktop 2560 (root zoom) ────────────────────────────────────
{
  const { ctx, page } = await ctxFor("wide");
  const shot = (n) => page.screenshot({ path: `${OUT}/wide-${n}.png` });
  const z = await page.evaluate(() => window.__uiz || 1);
  if (!(z > 1)) fails.push("wide: root zoom not on (" + z + ")");
  await shot("01-today"); await noOverflow(page, "wide today");
  await page.click('#tabs .sec[data-sec="trade"]'); await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.tab[data-view="news"]').click()); await page.waitForTimeout(900);
  const pill = await page.$eval("#tb-seg", (seg) => { const on = seg.querySelector("button.on"), ind = seg.querySelector(".tbseg-ind"); const a = on.getBoundingClientRect(), b = ind.getBoundingClientRect(); return { dx: Math.abs(a.left - b.left), dw: Math.abs(a.width - b.width) }; });
  if (pill.dx > 3 || pill.dw > 3) fails.push("wide: pill misaligned under zoom " + JSON.stringify(pill));
  const bar = await page.$eval("#tabs", (nav) => { const on = nav.querySelector(".sec.on"), ind = nav.querySelector(".side-ind"); const a = on.getBoundingClientRect(), b = ind.getBoundingClientRect(); return Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)); });
  if (bar > 3) fails.push("wide: rail bar off centre by " + bar);
  await shot("02-trade-news"); await noOverflow(page, "wide news");
  await page.mouse.move(36, 400); await page.waitForTimeout(500);
  await shot("03-hover-map");
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor("phone");
  const shot = (n) => page.screenshot({ path: `${OUT}/phone-${n}.png` });
  if (await page.locator("#menu-btn").isVisible()) fails.push("hamburger still visible on phone");
  const slots = await page.$$eval("#bnav button", (bs) => bs.map((b) => b.dataset.sec));
  if (slots.join() !== SECS.join()) fails.push("dock slots wrong: " + slots);
  const navBox = await page.locator("#bnav").boundingBox();
  if (!navBox || navBox.y + navBox.height < 800) fails.push("dock not at the bottom: " + JSON.stringify(navBox));
  await shot("01-today"); await noOverflow(page, "phone today");
  // phones never land on the chart (it swallows the dock): the board if owned, else the calendar
  const gexOn = await page.$eval(".tab[data-view=\"gex\"]", (t) => !t.hidden);
  const PHONE_FIRST = { ...FIRST, trade: gexOn ? "gex" : "news" };
  for (const s of SECS) {
    await page.click(`#bnav button[data-sec="${s}"]`); await page.waitForTimeout(700);
    const v = await curView(page);
    if (v !== PHONE_FIRST[s]) fails.push(`dock ${s} opened ${v}, wanted ${PHONE_FIRST[s]}`);
    const lit = await page.$$eval("#bnav button.on", (bs) => bs.map((b) => b.dataset.sec));
    if (lit.join() !== s) fails.push(`dock lit ${lit} after ${s}`);
  }
  // trade on a phone: the segment row sits under the title
  await page.evaluate(() => document.querySelector('.tab[data-view="news"]').click()); await page.waitForTimeout(900);
  if (!(await page.locator("#tb-seg-row").isVisible())) fails.push("phone: segment row hidden on news");
  const segBox = await page.locator("#tb-seg").boundingBox(), titleBox = await page.locator("#pane-title").boundingBox();
  if (segBox && titleBox && segBox.y < titleBox.y + titleBox.height - 2) fails.push("phone: segment not under the title");
  if (segBox && segBox.width > 390 - 20) fails.push("phone: segment capsule stretched full width: " + segBox.width);
  await shot("02-trade-news"); await noOverflow(page, "phone news");
  await page.click('#tb-seg button[data-view="propfirms"]'); await page.waitForTimeout(800);
  if (await curView(page) !== "propfirms") fails.push("phone: segment tap failed");
  if ((await page.$$eval("#bnav button.on", (bs) => bs.map((b) => b.dataset.sec))).join() !== "trade") fails.push("phone: prop firms did not light Trade");
  await shot("03-trade-propfirms");
  // the chart from the segment takes the screen; its back button returns to prop firms, not Today
  await page.click('#tb-seg button[data-view="chart"]'); await page.waitForTimeout(1500);
  if (await curView(page) !== "chart") fails.push("phone: segment chart tap failed");
  if (await page.locator("#bnav").isVisible()) fails.push("phone: dock visible over the chart");
  await shot("03b-chart");
  await page.click("#ch-back"); await page.waitForTimeout(900);
  if (await curView(page) !== "propfirms") fails.push("phone: chart back did not return to prop firms: " + await curView(page));
  // pages that used to light nothing now light their section
  await page.evaluate(() => document.querySelector('.tab[data-view="library"]').click()); await page.waitForTimeout(1200);
  if ((await page.$$eval("#bnav button.on", (bs) => bs.map((b) => b.dataset.sec))).join() !== "learn") fails.push("phone: library did not light Learn");
  await shot("04-learn-library"); await noOverflow(page, "phone library");
  // chat: the segment row is on and the chat ends above the dock
  await page.evaluate(() => document.querySelector('.tab[data-view="chat"]').click()); await page.waitForTimeout(1500);
  if (!(await page.evaluate(() => document.body.classList.contains("has-seg")))) fails.push("phone: has-seg missing in chat");
  const chatBox = await page.locator(".chat").boundingBox(), dock = await page.locator("#bnav").boundingBox();
  if (chatBox && dock && chatBox.y + chatBox.height > dock.y + 2) fails.push(`phone: chat runs under the dock (${chatBox.y + chatBox.height} vs ${dock.y})`);
  const segBox2 = await page.locator("#tb-seg").boundingBox();
  if (chatBox && segBox2 && chatBox.y < segBox2.y + segBox2.height - 2) fails.push("phone: chat starts under the segment");
  await shot("05-community-chat"); await noOverflow(page, "phone chat");
  // feed: the capsule floats over the posts and still takes a tap
  await page.click('#tb-seg button[data-view="feed"]'); await page.waitForTimeout(1200);
  if (await curView(page) !== "feed") fails.push("phone: segment feed tap failed");
  if (!(await page.locator("#tb-seg").isVisible())) fails.push("phone: segment hidden on feed");
  await shot("06-community-feed"); await noOverflow(page, "phone feed");
  await page.click('#tb-seg button[data-view="members"]'); await page.waitForTimeout(800);
  if (await curView(page) !== "members") fails.push("phone: segment tap over the feed did not land (pointer-events)");
  // you: avatar slot lands on the profile, journal via the segment, You stays lit
  await page.click('#bnav button[data-sec="you"]'); await page.waitForTimeout(700);
  if (await curView(page) !== "set-profile") fails.push("phone: You did not open the profile");
  await page.click('#tb-seg button[data-view="journal"]'); await page.waitForTimeout(800);
  if (await curView(page) !== "journal") fails.push("phone: journal segment failed");
  await page.click('#tb-seg button[data-view="set-profile"]'); await page.waitForTimeout(800);
  if ((await page.$$eval("#bnav button.on", (bs) => bs.map((b) => b.dataset.sec))).join() !== "you") fails.push("phone: profile did not light You");
  await shot("07-you-profile"); await noOverflow(page, "phone profile");
  await page.click('#tb-seg button[data-view="settings"]'); await page.waitForTimeout(700);
  await shot("08-you-settings");
  // tapping the lit section again scrolls to the top rather than moving
  await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(300);
  await page.click('#bnav button[data-sec="you"]'); await page.waitForTimeout(900);
  if (await curView(page) !== "settings") fails.push("phone: re-tap moved off settings");
  if ((await page.evaluate(() => window.scrollY)) > 8) fails.push("phone: re-tap did not scroll to top");
  await ctx.close();
}

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "PASS");
console.log("shots in", OUT);
process.exit(fails.length ? 1 : 0);
