// Verify D1's original images render in lessons + the admin topbar on phones.
//   python -m http.server 8123  (repo root), then: node tests/lesson-image-visual.mjs
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/lesson-image-shots`;
mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = (q) => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: q }),
}).then((r) => r.json());

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const email = (await sql("select email from admins order by added_at limit 1"))[0].email;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const browser = await chromium.launch();
const fails = [];

// 1. App: open the Inducement lesson, expect a real <img> in a .diagram figure
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#index button").length > 0, null, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.tab[data-view="course"]').click());
  await page.waitForTimeout(1200);
  // intake may appear for a fresh state; skip it if the course grid is hidden
  const clicked = await page.evaluate(() => {
    const links = [...document.querySelectorAll("#index button, .toc button, button")];
    const btn = links.find((b) => b.textContent.trim() === "Inducement");
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!clicked) fails.push("could not find Inducement lesson button");
  await page.waitForSelector(".diagram.media-img img", { timeout: 15000 }).catch(() => fails.push("lesson image did not render"));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/lesson-inducement.png`, fullPage: true });
  await ctx.close();
}

// 2. Admin: phone-width topbar
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:8123/echelon/admin/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".topbar", { timeout: 20000 });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const bar = document.querySelector(".topbar");
    return { h: bar.getBoundingClientRect().height, sw: document.documentElement.scrollWidth, iw: innerWidth };
  });
  if (m.h > 70) fails.push(`admin topbar still tall: ${m.h}px`);
  if (m.sw > m.iw) fails.push(`admin overflow ${m.sw}/${m.iw}`);
  await page.screenshot({ path: `${OUT}/admin-mobile-top.png` });
  await ctx.close();
}

await browser.close();
console.log(fails.length ? "FAILS:\n  " + fails.join("\n  ") : "all good");
console.log("shots in " + OUT);
if (fails.length) process.exit(1);
