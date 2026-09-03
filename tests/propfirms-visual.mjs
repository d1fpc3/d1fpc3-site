// Prop firms sheet checks (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/propfirms-visual.mjs        (BASE / OUT env)
// Standalone light sheet on desktop: rows render from propfirms.json, header
// click sorts, a cell click fills the name box + formula bar, arrow keys move
// the selection, sheet tabs switch, filters narrow, sticky header/firm column;
// then the embedded dark sheet on the phone. Also opens the members app's
// Prop firms tab (signed in as the App Review account) and checks the iframe
// mounts with the app's theme. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/propfirms-shots`;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || "http://localhost:8080";
const fails = [];
const note = (s) => console.log("  " + s);
const browser = await chromium.launch();

// ── standalone, desktop, light ──
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await page.goto(`${BASE}/echelon/propfirms/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#grid tbody tr", { timeout: 15000 });
  await page.waitForTimeout(400);
  const n0 = await page.locator("#grid tbody tr[data-ri]").count();
  note(`rows: ${n0}`);
  if (n0 < 3) fails.push("too few rows rendered");
  const sticky = await page.evaluate(() => ({
    letters: getComputedStyle(document.querySelector("thead tr.letters th")).position,
    heads: getComputedStyle(document.querySelector("thead tr.heads th")).position,
    firm: getComputedStyle(document.querySelector("tbody td.c-firm")).position,
    theme: document.documentElement.getAttribute("data-theme"),
  }));
  note("sticky: " + JSON.stringify(sticky));
  if (sticky.letters !== "sticky" || sticky.heads !== "sticky" || sticky.firm !== "sticky") fails.push("frozen panes are not sticky");
  if (sticky.theme !== "light") fails.push("standalone should be Excel-light");
  await page.screenshot({ path: `${OUT}/desk-1-sheet.png` });

  // select a cell: name box + formula bar
  await page.click('#grid tbody tr[data-ri="1"] td[data-ci="4"]');
  const sel = await page.evaluate(() => ({ name: document.getElementById("namebox").textContent, f: document.getElementById("formula").textContent, hl: document.querySelectorAll("#grid .hl").length }));
  note("selected: " + JSON.stringify(sel));
  if (sel.name !== "E2" || !sel.f || sel.hl < 2) fails.push("cell selection did not fill the name box / formula bar");
  await page.keyboard.press("ArrowDown");
  const after = await page.evaluate(() => document.getElementById("namebox").textContent);
  if (after !== "E3") fails.push(`arrow key did not move selection (${after})`);
  await page.screenshot({ path: `${OUT}/desk-2-selected.png` });

  // sort by price desc (two clicks)
  await page.click('#grid thead tr.heads th[data-k="price"]');
  await page.click('#grid thead tr.heads th[data-k="price"]');
  const prices = await page.evaluate(() => [...document.querySelectorAll('#grid tbody td[data-ci="4"]')].map((t) => +t.dataset.txt.replace(/[$,]/g, "")));
  note("prices sorted desc: " + prices.join(","));
  if (prices.some((p, i) => i && p > prices[i - 1])) fails.push("price sort desc is wrong");

  // filter + tab
  const term = await page.evaluate(() => document.querySelector('#grid tbody tr[data-ri="1"] td[data-ci="0"]').dataset.txt);
  await page.fill("#q", term);
  await page.waitForTimeout(150);
  const nq = await page.locator("#grid tbody tr[data-ri]").count();
  note(`filter '${term}' rows: ${nq}`);
  if (!(nq >= 1 && nq < n0)) fails.push("text filter did not narrow");
  await page.click("#reset");
  await page.click('.stab[data-sheet="cheapest"]');
  await page.waitForTimeout(150);
  const piv = await page.evaluate(() => ({ rows: document.querySelectorAll("#grid tbody tr[data-ri]").length, first: document.querySelector("#grid thead tr.heads th[data-k]").textContent, best: document.querySelectorAll("#grid td.best").length }));
  note("cheapest sheet: " + JSON.stringify(piv));
  if (!piv.rows || piv.first !== "Account" || !piv.best) fails.push("cheapest-by-size sheet wrong " + JSON.stringify(piv));
  await page.screenshot({ path: `${OUT}/desk-3-cheapest.png` });
  // the Firms sheet: one row per firm, with the firm-level notes
  await page.click('.stab[data-sheet="firms"]');
  await page.waitForTimeout(150);
  const firms = await page.evaluate(() => ({ rows: document.querySelectorAll("#grid tbody tr[data-ri]").length, first: document.querySelector("#grid thead tr.heads th[data-k]").textContent, options: document.querySelectorAll("#firm option").length - 1 }));
  note("firms sheet: " + JSON.stringify(firms));
  if (!firms.rows || firms.first !== "Firm" || firms.rows !== firms.options) fails.push("firms sheet wrong " + JSON.stringify(firms));
  await page.screenshot({ path: `${OUT}/desk-3b-firms.png` });
  await ctx.close();
}

// ── embedded, phone, dark ──
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror (embed): " + e.message));
  await page.goto(`${BASE}/echelon/propfirms/?embed=1&theme=dark`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#grid tbody tr", { timeout: 15000 });
  const emb = await page.evaluate(() => ({ theme: document.documentElement.getAttribute("data-theme"), top: getComputedStyle(document.querySelector(".top")).display, bg: getComputedStyle(document.body).backgroundColor, sw: document.documentElement.scrollWidth, iw: innerWidth }));
  note("embed: " + JSON.stringify(emb));
  if (emb.theme !== "dark" || emb.top !== "none") fails.push("embed mode did not hide the header / apply dark");
  if (emb.sw > emb.iw) fails.push("embed page itself scrolls horizontally (the sheet should scroll inside)");
  await page.screenshot({ path: `${OUT}/phone-4-embed-dark.png` });
  await ctx.close();
}

// ── inside the members app ──
{
  const REF = "cqdignbleethroyxxvzr";
  const SB = `https://${REF}.supabase.co`;
  const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
  const service = keys.find((k) => k.name === "service_role").api_key;
  const anon = keys.find((k) => k.name === "anon").api_key;
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
  const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
  if (!session.access_token) throw new Error("verify failed");
  for (const phone of [false, true]) {
    const ctx = await browser.newContext(phone
      ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fails.push("app pageerror: " + e.message));
    await page.goto(`${BASE}/echelon/app/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ov-hi", { timeout: 25000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector('.tab[data-view="propfirms"]').click());
    await page.waitForTimeout(600);
    const frame = page.frameLocator("#pf-frame");
    await frame.locator("#grid tbody tr").first().waitFor({ timeout: 15000 }).catch(() => fails.push(`${phone ? "phone" : "desk"}: sheet did not load inside the app`));
    const st = await page.evaluate(() => { const f = document.getElementById("pf-frame"), r = f.getBoundingClientRect(); return { src: f.getAttribute("src"), h: Math.round(r.height), bottomGap: Math.round(innerHeight - r.bottom), title: document.getElementById("pane-title").textContent, appTheme: document.documentElement.getAttribute("data-theme") }; });
    const inner = await page.evaluate(() => document.getElementById("pf-frame").contentDocument?.documentElement.getAttribute("data-theme"));
    note(`${phone ? "phone" : "desk"} app: ${JSON.stringify(st)} innerTheme=${inner}`);
    if (st.title !== "Prop firms") fails.push("app: pane title not Prop firms");
    if (inner !== st.appTheme) fails.push("app: sheet theme does not follow the app theme");
    if (st.h < 400) fails.push("app: iframe too short");
    await page.screenshot({ path: `${OUT}/${phone ? "phone" : "desk"}-5-in-app.png` });
    await ctx.close();
  }
}

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
