// Signed-in phone harness for the Echelon members app (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-mobile-visual.mjs        (APP_URL / OUT / EMAIL / W / H env to override)
// Mints a one-off session for EMAIL (default: the admin row) through the
// Supabase admin generate_link API using the Management API token at
// ~/.supabase/access-token, injects it into localStorage (memory only, never
// written to disk), then walks every view at an iPhone viewport: Overview,
// drawer, Course TOC + a lesson, Recaps, Members, Settings. Screenshots land in
// OUT; the run fails on horizontal overflow, page errors, or a view that never
// left its skeletons. Pass PTR=1 to also exercise pull-to-refresh.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-mobile-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);

// ── mint a session ──────────────────────────────────────────────
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role")?.api_key;
const anon = keys.find((k) => k.name === "anon")?.api_key;
if (!service || !anon) throw new Error("could not read project api keys");
let email = process.env.EMAIL;
if (!email) {
  const r = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select email from admins order by added_at limit 1" }),
  })).json();
  email = r[0]?.email;
}
if (!email) throw new Error("no email");
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, {
  method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email }),
})).json();
if (!link.hashed_token) throw new Error("generate_link failed: " + JSON.stringify(link).slice(0, 200));
const session = await (await fetch(`${SB}/auth/v1/verify`, {
  method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
})).json();
if (!session.access_token) throw new Error("verify failed: " + JSON.stringify(session).slice(0, 200));
// Seed a completed course_intake so the adaptive gate does not intercept the
// course/lesson checks below (the intake flow has its own harness).
await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: `insert into course_intake (user_id, answers, completed_at) select id, '{}'::jsonb, now() from auth.users where email = '${email.replace(/'/g, "''")}' on conflict (user_id) do update set completed_at = now()` }),
});
console.log(`session minted for ${email}`);

// ── browser ─────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices["iPhone 13"], viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
await ctx.addInitScript(([key, value, theme]) => { try { localStorage.setItem(key, value); if (theme) localStorage.setItem("echelon-theme", theme) } catch {} }, [`sb-${REF}-auth-token`, JSON.stringify(session), process.env.THEME || ""]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|discord/.test(m.text())) errors.push("console: " + m.text()); });

await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.getElementById("app")?.classList.contains("on"), null, { timeout: 20000 });
await page.screenshot({ path: `${OUT}/0-skeletons.png`, fullPage: false }).catch(() => {});
await page.waitForFunction(() => document.querySelectorAll("#ov-cards .skel").length === 0 && document.querySelectorAll("#index button").length > 0, null, { timeout: 25000 });
await page.waitForTimeout(500);

const fails = [];
const check = async (name, full = true) => {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, iw: window.innerWidth,
    skel: document.querySelectorAll(".view.on .skel").length,
    view: document.querySelector(".view.on")?.id,
  }));
  const ok = m.sw <= m.iw && m.skel === 0;
  if (!ok) fails.push(`${name}: ${JSON.stringify(m)}`);
  console.log(`${ok ? "ok " : "BAD"} ${name}  view=${m.view} scrollW=${m.sw}/${m.iw} skel=${m.skel}`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
};
const go = async (view) => {
  await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`).click(), view);
  await page.waitForTimeout(450);
};

await check("1-overview");
await page.evaluate(() => document.getElementById("menu-btn").click());
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/2-drawer.png` });
await page.evaluate(() => document.getElementById("scrim").click());
await page.waitForTimeout(350);

await go("course");
await check("3-course");
// open a mid-course lesson to see a long one
await page.evaluate(() => { const b = document.querySelectorAll("#index button"); (b[8] || b[0]).click() });
await page.waitForTimeout(500);
await check("4-lesson");
await go("recaps");
await check("5-recaps");
await go("members");
await check("6-members");
await go("settings");
await check("7-settings");

if (process.env.PTR) {
  await go("overview");
  await page.evaluate(() => window.scrollTo(0, 0));
  const cdp = await ctx.newCDPSession(page);
  // drag down from the top of the main pane
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 180 }] });
  for (let y = 190; y <= 320; y += 10) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y }] });
    await page.waitForTimeout(16);
  }
  await page.screenshot({ path: `${OUT}/8-ptr-pulling.png` });
  const pulling = await page.evaluate(() => ({ armed: document.body.classList.contains("ptr-armed"), h: document.getElementById("ptr")?.getBoundingClientRect().height }));
  console.log("ptr pulling", JSON.stringify(pulling));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(120);
  const busy = await page.evaluate(() => ({ busy: document.body.classList.contains("ptr-busy"), skel: document.querySelectorAll(".view.on .skel").length }));
  console.log("ptr released", JSON.stringify(busy));
  await page.screenshot({ path: `${OUT}/9-ptr-busy.png` });
  if (!pulling.armed || !busy.busy) fails.push("pull-to-refresh did not arm/fire");
  await page.waitForFunction(() => !document.body.classList.contains("ptr-busy"), null, { timeout: 20000 });
  await check("10-after-refresh");
}

await browser.close();
console.log(`\n${fails.length ? fails.length + " FAILED:\n  " + fails.join("\n  ") : "all good"}, shots in ${OUT}`);
if (errors.length) { console.log("errors:\n  " + errors.join("\n  ")); process.exit(1); }
if (fails.length) process.exit(1);
