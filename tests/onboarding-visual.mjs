// First-entry onboarding + GEX tour persistence harness (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/onboarding-visual.mjs        (APP_URL / OUT / EMAIL / W / H env)
// Mints a session for EMAIL (default: the App Review test account), resets its
// member_onboarding row so the flow starts fresh, then walks: welcome → the site
// tour (skipped here) → five questions → the LIT username step (skipped, so no fake
// TradingView grant is queued) → asserts the row persisted and that a reload
// does NOT bring the onboarding back. Then, as the owner, opens GEX, ends the
// tour, and asserts flags.gex_tour landed server-side and a reload with empty
// localStorage does not replay it. Screenshots land in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");

const OUT = process.env.OUT || `${tmpdir()}/onboarding-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://localhost:8080/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const PHONE = process.env.PHONE === "1";
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = (q) => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: q }),
}).then((r) => r.json());
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
async function mint(email) {
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
  const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
  if (!session.access_token) throw new Error(`verify failed for ${email}`);
  return session;
}
const q = (s) => s.replace(/'/g, "''");

const fails = [];
const browser = await chromium.launch();
async function context(session) {
  const ctx = await browser.newContext(PHONE
    ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`${r.status()} ${r.url()}`); });
  return { ctx, page };
}
const noOverflow = async (page, label) => {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (m.sw > m.iw) fails.push(`${label} overflow ${m.sw}/${m.iw}`);
};

// ── 1. a member's first entry ───────────────────────────────────
const email = process.env.EMAIL || "appreview@d1fpc3.com";
await sql(`update member_onboarding o set completed_at = null, answers = '{}'::jsonb from auth.users u where o.user_id = u.id and u.email = '${q(email)}'`);
{
  const { ctx, page } = await context(await mint(email));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#onb:not([hidden]) .intake-card", { timeout: 20000 });
  await page.waitForTimeout(350);
  const shot = (n) => page.screenshot({ path: `${OUT}/${PHONE ? "phone-" : ""}${n}.png` });
  const text = () => page.textContent("#onb-host .q");
  const bodyLocked = await page.evaluate(() => getComputedStyle(document.body).overflow);
  if (bodyLocked !== "hidden") fails.push(`body not locked under the overlay: ${bodyLocked}`);

  if (!/You're in/.test(await text())) fails.push("welcome step missing: " + (await text()));
  await shot("01-welcome"); await noOverflow(page, "welcome");
  // the welcome card starts the site tour (tests/onboarding-tour-visual.mjs walks it); skipping it hands back to the questions
  await page.click("#onb-host .foot .btn");
  await page.waitForSelector(".stour-card", { timeout: 8000 });
  await page.click(".stour-skip");
  await page.waitForSelector("#onb:not([hidden]) .choice", { timeout: 8000 });
  await shot("02-questions-after-tour"); await noOverflow(page, "questions");
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(200);
    const dots = await page.locator("#onb-host .dots i").count();
    if (dots !== 7) fails.push(`dots ${dots} on q${i + 1}`);
    if (i === 0) await shot("03-question");
    await page.click("#onb-host .choice >> nth=1");
  }
  await page.waitForTimeout(250);
  // the account holds LIT and GEX through the membership (9/30), so the step names both
  if (!/D1 LIT and D1 GEX are included/.test(await text())) fails.push("indicator username step missing: " + (await text()));
  await shot("04-lit-username");
  await page.click("#onb-host .skip");
  await page.waitForTimeout(700);
  if (!(await page.locator("#onb").isHidden())) fails.push("onboarding still open after skip");
  const row = (await sql(`select o.answers, o.completed_at from member_onboarding o join auth.users u on u.id = o.user_id where u.email = '${q(email)}'`))[0];
  if (!row?.completed_at) fails.push("completed_at not persisted");
  if (Object.keys(row?.answers ?? {}).length !== 5) fails.push("answers not persisted: " + JSON.stringify(row?.answers));
  // Overview nudge for the included indicators (this account has no TV username yet)
  const nudge = await page.locator("#ov-lit").isVisible();
  const nudgeText = nudge ? (await page.textContent("#ov-lit")).replace(/\s+/g, " ").trim() : "";
  // the nudge only applies while a LIT or GEX row is waiting for a username; a revoked or granted row hides it on purpose
  const waiting = (await sql(`select product from tv_access where lower(email) = '${q(email.toLowerCase())}' and product in ('d1-lit', 'd1-gex') and state = 'needs_username' order by product`)).map((r) => r.product);
  const want = waiting.length > 1 ? "D1 GEX and D1 LIT are" : waiting[0] === "d1-gex" ? "D1 GEX is" : "D1 LIT is";
  if (waiting.length && !nudgeText.startsWith(want + " on your account")) fails.push(`Overview nudge for ${waiting.join(", ")}: "${nudgeText}"`);
  if (!waiting.length && nudge) fails.push("Overview nudge showing with nothing waiting");
  console.log(`  nudge for [${waiting.join(", ")}]: "${nudgeText}"`);
  await shot("05-overview-nudge");
  await page.evaluate(() => document.querySelector('.tab[data-view="indicators"]').click());
  await page.waitForTimeout(500);
  const included = await page.locator(".p-own", { hasText: /Included with (Echelon|your membership)/ }).count();
  if (included < 2) fails.push(`LIT and GEX cards do not both say included (${included})`);
  const bundle = await page.locator(".st-row:not(.owned) h3", { hasText: /bundle/i }).count();
  if (bundle) fails.push("bundle card still offered to a LIT holder");
  await shot("06-indicators");

  // the hard-refresh check: it must not come back
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 20000 });
  await page.waitForTimeout(2000);
  if (!(await page.locator("#onb").isHidden())) fails.push("onboarding came back after reload");
  await ctx.close();
}

// (Part 2 tested the GEX walkthrough. That walkthrough was retired on 2026-09-10, and the test
// cleared a flag on the real owner account to run, so it is gone. Never edit the owner's rows here.)

await browser.close(); // without it the run prints ok and then never exits
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
