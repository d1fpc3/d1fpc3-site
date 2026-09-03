// Prop firms dashboard checks (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/propfirms-visual.mjs        (BASE / OUT env)
// Standalone dark on desktop: the eight main firms in D1's order, one column
// each with the cheapest evaluation at the chosen size, the lowest price in
// gold, size switch re-renders, Topstep shows no 25K plan, the plans and
// fine-print toggles open, code copy flashes; embedded light on the phone
// (no header, no horizontal overflow, stacked); then the members-app tab on
// desktop + phone (iframe mounts, theme follows the app). Screenshots in OUT.
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
const ORDER = ["apex", "alpha", "mffu", "tradeify", "tpt", "topstep", "lucid", "fundednext"];
const fails = [];
const note = (s) => console.log("  " + s);
const browser = await chromium.launch();

// ── standalone, desktop, dark ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await page.goto(`${BASE}/echelon/propfirms/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".firm .price", { timeout: 15000 });
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => {
    const gold = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim();
    const probe = document.createElement("i"); probe.style.color = gold; document.body.appendChild(probe); const g = getComputedStyle(probe).color; probe.remove();
    const firms = [...document.querySelectorAll(".firm")].map((f) => ({ slug: f.dataset.slug, price: f.querySelector(".price .v")?.textContent || null, color: f.querySelector(".price .v") ? getComputedStyle(f.querySelector(".price .v")).color : null, best: f.classList.contains("best"), specs: f.querySelectorAll(".specs li").length, code: f.querySelector(".code b")?.textContent || null }));
    return { theme: document.documentElement.getAttribute("data-theme"), size: document.querySelector(".sizes .on")?.textContent, firms, gold: g };
  });
  note(`standalone: theme=${st.theme} size=${st.size}`);
  st.firms.forEach((f) => note(`  ${f.slug}: ${f.price} ${f.best ? "(gold)" : ""} code=${f.code} specs=${f.specs}`));
  if (st.theme !== "dark") fails.push("standalone should follow the dark scheme");
  if (st.firms.map((f) => f.slug).join(",") !== ORDER.join(",")) fails.push("firm order wrong: " + st.firms.map((f) => f.slug).join(","));
  const bests = st.firms.filter((f) => f.best);
  if (bests.length < 1 || bests.some((f) => f.color !== st.gold)) fails.push("the cheapest price is not gold " + JSON.stringify(bests));
  if (st.firms.some((f) => f.price && f.specs < 5)) fails.push("a priced firm has too few specs");
  await page.screenshot({ path: `${OUT}/desk-1-50k.png`, fullPage: true });

  // switch to 25K: Topstep has no 25K evaluation
  await page.click('.sizes button[data-size="25000"]');
  await page.waitForTimeout(150);
  const s25 = await page.evaluate(() => ({ size: document.querySelector(".sizes .on")?.textContent, topstep: document.querySelector('.firm[data-slug="topstep"] .none')?.textContent || null, apex: document.querySelector('.firm[data-slug="apex"] .price .v')?.textContent }));
  note("25K: " + JSON.stringify(s25));
  if (s25.size !== "$25K" || !s25.topstep || !s25.apex) fails.push("25K switch wrong " + JSON.stringify(s25));
  await page.click('.sizes button[data-size="150000"]');
  await page.waitForTimeout(150);
  const s150 = await page.evaluate(() => document.querySelector('.firm[data-slug="apex"] .price .v')?.textContent);
  note("150K apex: " + s150);
  if (!s150 || s150 === s25.apex) fails.push("150K did not change the Apex price");
  await page.screenshot({ path: `${OUT}/desk-2-150k.png`, fullPage: true });

  // toggles + copy
  await page.click('.firm[data-slug="apex"] [data-toggle="plans"]');
  await page.waitForTimeout(120);
  const pl = await page.evaluate(() => ({ rows: document.querySelectorAll('.firm[data-slug="apex"] .plans:not([hidden]) .row').length, label: document.querySelector('.firm[data-slug="apex"] [data-toggle="plans"]').textContent }));
  note("apex plans open: " + JSON.stringify(pl));
  if (pl.rows < 2 || pl.label !== "Hide plans") fails.push("plans toggle did not open " + JSON.stringify(pl));
  await page.click('.firm[data-slug="topstep"] [data-toggle="fine"]');
  await page.waitForTimeout(120);
  const fn = await page.evaluate(() => document.querySelectorAll('.firm[data-slug="topstep"] .fine:not([hidden]) dt').length);
  note("topstep fine print items: " + fn);
  if (fn < 3) fails.push("fine print did not open");
  await page.screenshot({ path: `${OUT}/desk-3-toggles.png`, fullPage: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await page.click('.firm[data-slug="apex"] .copy');
  await page.waitForTimeout(200);
  const fl = await page.evaluate(() => document.getElementById("flash").textContent);
  note("copy flash: " + fl);
  if (!/^Copied /.test(fl)) fails.push("copy did not flash");
  await ctx.close();
}

// ── embedded, phone, light ──
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror (embed): " + e.message));
  await page.goto(`${BASE}/echelon/propfirms/?embed=1&theme=light`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".firm .price", { timeout: 15000 });
  const emb = await page.evaluate(() => ({ theme: document.documentElement.getAttribute("data-theme"), h1: getComputedStyle(document.querySelector(".top h1")).display, sw: document.documentElement.scrollWidth, iw: innerWidth, cols: getComputedStyle(document.getElementById("firms")).gridTemplateColumns.split(" ").length }));
  note("embed: " + JSON.stringify(emb));
  if (emb.theme !== "light" || emb.h1 !== "none" || emb.sw > emb.iw || emb.cols !== 1) fails.push("embed/phone layout wrong " + JSON.stringify(emb));
  await page.screenshot({ path: `${OUT}/phone-4-embed-light.png`, fullPage: true });
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
    await page.frameLocator("#pf-frame").locator(".firm .price").first().waitFor({ timeout: 15000 }).catch(() => fails.push(`${phone ? "phone" : "desk"}: dashboard did not load inside the app`));
    const st = await page.evaluate(() => { const f = document.getElementById("pf-frame"), r = f.getBoundingClientRect(), cs = getComputedStyle(f); return { h: Math.round(r.height), title: document.getElementById("pane-title").textContent, appTheme: document.documentElement.getAttribute("data-theme"), border: cs.borderTopWidth, inner: f.contentDocument?.documentElement.getAttribute("data-theme"), innerBg: f.contentDocument ? getComputedStyle(f.contentDocument.body).backgroundColor : null, appBg: getComputedStyle(document.body).backgroundColor }; });
    note(`${phone ? "phone" : "desk"} app: ${JSON.stringify(st)}`);
    if (st.title !== "Prop firms" || st.inner !== st.appTheme || st.h < 400) fails.push("app embed wrong " + JSON.stringify(st));
    if (st.border !== "0px" || st.innerBg !== st.appBg) fails.push("app embed is not seamless (border/background) " + JSON.stringify(st));
    await page.screenshot({ path: `${OUT}/${phone ? "phone" : "desk"}-5-in-app.png` });
    await ctx.close();
  }
}

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
