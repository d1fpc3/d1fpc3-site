// Sidebar navigation (2026-09-22): eight destinations with labels in a
// sidebar that stays open on desktop, a Tools group, the member row (avatar =
// Profile, gear = Settings), Chat and Study as families whose pages share the
// top-bar segment, a dock of five on phones plus a quick row on Today.
// Manual harness, not a node:test.
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-nav-visual.mjs        (APP_URL / OUT / EMAIL / THEME env)
// Signs in as EMAIL (default: the App Review account), then checks at
// 1440x900, 2560x1300 (D1's monitor, root zoom on) and 390x844 (phone).
// Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-nav-shots`;
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
  // THEME=dark|light pins the theme (the harness account otherwise follows the system)
  await ctx.addInitScript(([k, v, theme]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); if (theme) localStorage.setItem("echelon-theme", theme); }, [`sb-${REF}-auth-token`, JSON.stringify(session), process.env.THEME || ""]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push(`[${kind}] pageerror: ` + e.message));
  page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`[${kind}] ${r.status()} ${r.url()}`); });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 25000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const ROWS = ["overview", "chart", "gex", "news", "feed", "chat", "course", "journal"];
const curView = (page) => page.$eval(".view.on", (el) => el.id.replace(/^v-/, ""));
const go = async (page, v, ms = 700) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`).click(), v); await page.waitForTimeout(ms); };
const noOverflow = async (page, label) => {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (m.sw > m.iw) fails.push(`${label} overflow ${m.sw}/${m.iw}`);
};
const segLabels = (page) => page.$$eval("#tb-seg button", (bs) => bs.map((b) => [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()));   // text only, not the unread mark
const segLit = (page) => page.$$eval("#tb-seg button.on", (bs) => bs.map((b) => b.dataset.view));
const litRows = (page) => page.$$eval("#tabs .grp:not([hidden]) .tab.on", (ts) => ts.map((t) => t.dataset.view));
const barCentred = async (page) => page.$eval("#tabs", (nav) => { const on = nav.querySelector(".grp:not([hidden]) .tab.on"), ind = nav.querySelector(".side-ind"); if (!on || !ind) return -1; const a = on.getBoundingClientRect(), b = ind.getBoundingClientRect(); return Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)); });

// ── desktop 1440 ────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor("desk");
  const shot = (n) => page.screenshot({ path: `${OUT}/desk-${n}.png` });
  const sideW = await page.$eval(".side", (n) => n.getBoundingClientRect().width);
  if (sideW < 200 || sideW > 260) fails.push("sidebar width odd: " + sideW);
  const rows = await page.$$eval("#tabs .grp-main .tab", (ts) => ts.filter((t) => !t.hidden).map((t) => t.dataset.view));
  if (rows.join() !== ROWS.filter((r) => rows.includes(r)).join() || rows.length < 7) fails.push("sidebar rows wrong: " + rows);
  const labelled = await page.$eval('#tabs .tab[data-view="news"]', (t) => getComputedStyle(t).fontSize !== "0px" && t.getBoundingClientRect().width > 150);
  if (!labelled) fails.push("sidebar rows have no labels");
  if (!(await page.locator("#tabs .grp-tools .side-cap").isVisible())) fails.push("Tools caption missing");
  for (const v of ["indicators", "propfirms"]) if (!(await page.locator(`#tabs .grp-tools .tab[data-view="${v}"]`).isVisible())) fails.push(`tools row ${v} hidden`);
  if (await page.locator("#admin-link").isVisible()) fails.push("admin link visible for a member");
  for (const v of ["members", "library", "set-profile", "settings"]) if (await page.locator(`#tabs .tab[data-view="${v}"]`).isVisible()) fails.push(`${v} still has a sidebar row`);
  if (!(await page.locator("#u-hit").isVisible()) || !(await page.locator("#u-gear").isVisible())) fails.push("member row or gear missing");
  if (await page.locator("#signout").isVisible()) fails.push("sign out button still in the sidebar");
  if (await page.locator("#tb-seg-row").isVisible()) fails.push("segment shown on Today");
  if (await page.locator("#td-chips").isVisible()) fails.push("Today chips shown on desktop");
  await shot("01-today"); await noOverflow(page, "desk today");

  // every row lands on its page and lights itself with the bar centred on it
  for (const v of rows) {
    await page.click(`#tabs .tab[data-view="${v}"]`); await page.waitForTimeout(v === "chart" ? 1200 : 700);
    if (await curView(page) !== v) fails.push(`row ${v} opened ${await curView(page)}`);
    if ((await litRows(page)).join() !== v) fails.push(`row lit ${await litRows(page)} after ${v}`);
    const off = await barCentred(page); if (off < 0 || off > 3) fails.push(`bar off centre on ${v}: ${off}`);
  }
  // Chat is a family: the top bar stays and the segment switches to Members
  await page.click('#tabs .tab[data-view="chat"]'); await page.waitForTimeout(900);
  if (!(await page.locator(".topbar").isVisible())) fails.push("top bar hidden in chat on desktop");
  if ((await page.textContent("#pane-title")).trim() !== "Chat") fails.push("chat title wrong");
  const chatSeg = await segLabels(page);
  if (chatSeg.join() !== "Channels,Members") fails.push("chat segment: " + chatSeg);
  const chatBox = await page.locator(".chat").boundingBox();
  if (chatBox && chatBox.y + chatBox.height > 900 + 2) fails.push(`chat runs past the viewport: ${chatBox.y + chatBox.height}`);
  await shot("02-chat");
  await page.click('#tb-seg button[data-view="members"]'); await page.waitForTimeout(800);
  if (await curView(page) !== "members") fails.push("segment members failed");
  if ((await litRows(page)).join() !== "chat") fails.push("members did not light Chat: " + (await litRows(page)));
  if ((await page.textContent("#pane-title")).trim() !== "Chat") fails.push("members title should read Chat");
  if ((await segLit(page)).join() !== "members") fails.push("members not lit in segment");
  await shot("03-chat-members"); await noOverflow(page, "desk members");
  // Study family
  await page.click('#tabs .tab[data-view="course"]'); await page.waitForTimeout(800);
  const st = await segLabels(page);
  if (st[0] !== "Lessons" || !st.includes("Library")) fails.push("study segment: " + st);
  await page.click('#tb-seg button[data-view="library"]'); await page.waitForTimeout(1200);
  if (await curView(page) !== "library") fails.push("segment library failed");
  if ((await litRows(page)).join() !== "course") fails.push("library did not light Study");
  if ((await page.textContent("#pane-title")).trim() !== "Study") fails.push("library title should read Study");
  await shot("04-study-library");
  // member row and gear
  await page.click("#u-hit"); await page.waitForTimeout(700);
  if (await curView(page) !== "set-profile") fails.push("member row did not open the profile");
  if (!(await page.$eval("#u-hit", (n) => n.classList.contains("on")))) fails.push("member row not lit on profile");
  if ((await litRows(page)).length) fails.push("a sidebar row lit on profile: " + (await litRows(page)));
  if (await page.$eval("#tabs .side-ind", (i) => i.classList.contains("live"))) fails.push("bar still live on profile");
  await shot("05-profile");
  await page.click("#u-gear"); await page.waitForTimeout(700);
  if (await curView(page) !== "settings") fails.push("gear did not open settings");
  if (!(await page.$eval("#u-gear", (n) => n.classList.contains("on")))) fails.push("gear not lit on settings");
  await go(page, "set-appearance");
  const t2 = (await page.textContent("#pane-title")).trim(), c2 = (await page.textContent("#pane-crumb")).trim();
  if (t2 !== "Appearance" || c2 !== "Settings") fails.push(`sub-page title/crumb: ${t2} / ${c2}`);
  if (!(await page.$eval("#u-gear", (n) => n.classList.contains("on")))) fails.push("gear not lit on appearance");
  await shot("06-appearance");
  // palette: recents first, family hint, g n jumps, ? sheet, typing guard
  await page.keyboard.press("Control+k"); await page.waitForTimeout(500);
  const heads = await page.$$eval("#pal-list .pal-h", (hs) => hs.map((h) => h.textContent.trim()));
  if (heads[0] !== "Recent") fails.push("palette recents not first: " + heads);
  const hints = await page.$$eval("#pal-list .pal-it small", (ns) => ns.map((n) => n.textContent));
  if (!hints.some((h) => /in (Chat|Study)/.test(h))) fails.push("palette hints lack the family: " + hints.slice(0, 8));
  await shot("07-palette");
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  await page.keyboard.press("g"); await page.keyboard.press("n"); await page.waitForTimeout(900);
  if (await curView(page) !== "news") fails.push("g n did not jump to news");
  await page.keyboard.type("?"); await page.waitForTimeout(400);
  if (!(await page.locator("#keys").isVisible())) fails.push("? did not open the sheet");
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  await go(page, "members", 600);
  await page.click("#member-q"); await page.keyboard.type("gn"); await page.waitForTimeout(500);
  if (await curView(page) !== "members") fails.push("typing g n in a field jumped away");
  await page.click('#tabs .tab[data-view="overview"]'); await page.waitForTimeout(600);
  if (await curView(page) !== "overview") fails.push("today row failed");
  await ctx.close();
}

// ── desktop 2560 (root zoom) ────────────────────────────────────
{
  const { ctx, page } = await ctxFor("wide");
  const shot = (n) => page.screenshot({ path: `${OUT}/wide-${n}.png` });
  const z = await page.evaluate(() => window.__uiz || 1);
  if (!(z > 1)) fails.push("wide: root zoom not on (" + z + ")");
  await shot("01-today"); await noOverflow(page, "wide today");
  await page.click('#tabs .tab[data-view="chat"]'); await page.waitForTimeout(900);
  const pill = await page.$eval("#tb-seg", (seg) => { const on = seg.querySelector("button.on"), ind = seg.querySelector(".tbseg-ind"); const a = on.getBoundingClientRect(), b = ind.getBoundingClientRect(); return { dx: Math.abs(a.left - b.left), dw: Math.abs(a.width - b.width) }; });
  if (pill.dx > 3 || pill.dw > 3) fails.push("wide: pill misaligned under zoom " + JSON.stringify(pill));
  const off = await barCentred(page); if (off < 0 || off > 3) fails.push("wide: bar off centre " + off);
  await shot("02-chat"); await noOverflow(page, "wide chat");
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxFor("phone");
  const shot = (n) => page.screenshot({ path: `${OUT}/phone-${n}.png` });
  if (await page.locator("#menu-btn").isVisible()) fails.push("hamburger visible on phone");
  const slots = await page.$$eval("#bnav button", (bs) => bs.map((b) => b.dataset.view));
  if (slots.join() !== "overview,feed,chat,course,set-profile") fails.push("dock slots wrong: " + slots);
  const chips = await page.$$eval("#td-chips .td-chip", (cs) => cs.filter((c) => c.offsetParent !== null).map((c) => c.dataset.view));
  for (const v of ["chart", "news", "journal", "library", "members"]) if (!chips.includes(v)) fails.push("Today chip missing: " + v);
  const chipBox = await page.locator("#td-chips").boundingBox();
  if (!chipBox || chipBox.width > 390) fails.push("chips row odd: " + JSON.stringify(chipBox));
  await shot("01-today"); await noOverflow(page, "phone today");
  for (const v of slots) {
    await page.click(`#bnav button[data-view="${v}"]`); await page.waitForTimeout(700);
    if (await curView(page) !== v) fails.push(`dock ${v} opened ${await curView(page)}`);
    const lit = await page.$$eval("#bnav button.on", (bs) => bs.map((b) => b.dataset.view));
    if (lit.join() !== v) fails.push(`dock lit ${lit} after ${v}`);
  }
  // chips reach the pages without a slot
  await page.click('#bnav button[data-view="overview"]'); await page.waitForTimeout(600);
  await page.click('#td-chips .td-chip[data-view="news"]'); await page.waitForTimeout(800);
  if (await curView(page) !== "news") fails.push("news chip failed");
  if ((await page.$$eval("#bnav button.on", (bs) => bs.length))) fails.push("a dock slot lit on news");
  await shot("02-news"); await noOverflow(page, "phone news");
  // chat family on a phone: segment row, chat ends above the dock, Members lights Chat
  await page.click('#bnav button[data-view="chat"]'); await page.waitForTimeout(1500);
  if ((await segLabels(page)).join() !== "Channels,Members") fails.push("phone chat segment: " + (await segLabels(page)));
  const chatBox = await page.locator(".chat").boundingBox(), dock = await page.locator("#bnav").boundingBox(), segBox = await page.locator("#tb-seg").boundingBox();
  if (chatBox && dock && chatBox.y + chatBox.height > dock.y + 2) fails.push(`phone: chat runs under the dock (${chatBox.y + chatBox.height} vs ${dock.y})`);
  if (chatBox && segBox && chatBox.y < segBox.y + segBox.height - 2) fails.push("phone: chat starts under the segment");
  await shot("03-chat");
  await page.click('#tb-seg button[data-view="members"]'); await page.waitForTimeout(800);
  if (await curView(page) !== "members") fails.push("phone: members segment failed");
  if ((await page.$$eval("#bnav button.on", (bs) => bs.map((b) => b.dataset.view))).join() !== "chat") fails.push("phone: members did not light Chat");
  await shot("04-members"); await noOverflow(page, "phone members");
  // study family
  await page.click('#bnav button[data-view="course"]'); await page.waitForTimeout(800);
  await page.click('#tb-seg button[data-view="library"]'); await page.waitForTimeout(1200);
  if (await curView(page) !== "library") fails.push("phone: library segment failed");
  if ((await page.$$eval("#bnav button.on", (bs) => bs.map((b) => b.dataset.view))).join() !== "course") fails.push("phone: library did not light Study");
  await shot("05-library"); await noOverflow(page, "phone library");
  // profile slot, then settings from the profile gear
  await page.click('#bnav button[data-view="set-profile"]'); await page.waitForTimeout(700);
  if (await curView(page) !== "set-profile") fails.push("phone: profile slot failed");
  if (!(await page.locator("#pro-settings").isVisible())) fails.push("phone: profile gear hidden");
  await page.click("#pro-settings"); await page.waitForTimeout(700);
  if (await curView(page) !== "settings") fails.push("phone: profile gear did not open settings");
  if ((await page.$$eval("#bnav button.on", (bs) => bs.map((b) => b.dataset.view))).join() !== "set-profile") fails.push("phone: settings did not light the profile slot");
  await shot("06-settings");
  await ctx.close();
}

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "PASS");
console.log("shots in", OUT);
process.exit(fails.length ? 1 : 0);
