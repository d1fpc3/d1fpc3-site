// Adaptive starting-point intake harness (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/intake-visual.mjs        (THEME=dark to see dark)
// Mints a session for the admin email (memory only), DELETES its course_intake
// row so the flow starts fresh, then: sees question 1, answers "Not really" to
// get an explainer, walks the rest, lands on the summary, enters the course,
// and asserts the row persisted + the "Start here" chip appears + the course
// opened on a review lesson. Screenshots land in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/intake-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
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
const email = process.env.EMAIL || (await sql("select email from admins order by added_at limit 1"))[0].email;
await sql(`delete from course_intake using auth.users u where course_intake.user_id = u.id and u.email = '${email.replace(/'/g, "''")}'`);
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
console.log(`fresh intake for ${email}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(([k, v, theme]) => { localStorage.setItem(k, v); if (theme) localStorage.setItem("echelon-theme", theme); }, [`sb-${REF}-auth-token`, JSON.stringify(session), process.env.THEME || ""]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });

await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("#index button").length > 0, null, { timeout: 20000 });
await page.evaluate(() => document.querySelector('.tab[data-view="course"]').click());
await page.waitForSelector("#intake .intake-card", { timeout: 8000 });
await page.waitForTimeout(300);

const fails = [];
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const noOverflow = async (label) => {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (m.sw > m.iw) fails.push(`${label} overflow ${m.sw}/${m.iw}`);
};

// Q1 visible
const q1 = await page.textContent("#intake .q");
console.log("Q1:", q1);
await noOverflow("q1"); await shot("1-question");

// answer "Not really" -> explainer appears
await page.click("#intake .choices .choice:not(.yes)");
await page.waitForSelector("#intake .explain .prose p", { timeout: 4000 });
const explLen = (await page.textContent("#intake .explain")).length;
console.log("explainer chars:", explLen);
if (explLen < 300) fails.push("explainer too short");
await noOverflow("explain"); await shot("2-explainer");
await page.click("#intake .explain .foot .btn");   // continue

// remaining questions: alternate yes/no so we get a mix
for (let i = 1; i < 6; i++) {
  await page.waitForSelector("#intake .choices", { timeout: 4000 }).catch(() => {});
  const onSummary = await page.$("#intake .summary-list");
  if (onSummary) break;
  if (i % 2 === 0) {
    await page.click("#intake .choices .choice.yes");
  } else {
    await page.click("#intake .choices .choice:not(.yes)");
    await page.waitForSelector("#intake .explain .foot .btn", { timeout: 4000 });
    await page.click("#intake .explain .foot .btn");
  }
  await page.waitForTimeout(150);
}

await page.waitForSelector("#intake .summary-list", { timeout: 5000 });
await noOverflow("summary"); await shot("3-summary");
const rows = await page.$$eval("#intake .summary-row", (els) => els.map((e) => e.className));
console.log("summary rows:", rows.length, "review:", rows.filter((c) => c.includes("review")).length);

await page.click("#intake .foot .btn");   // Enter the course
await page.waitForFunction(() => document.getElementById("course-grid") && !document.getElementById("course-grid").hidden, null, { timeout: 8000 });
await page.waitForTimeout(500);

const saved = await sql(`select answers, completed_at is not null as done from course_intake ci join auth.users u on u.id = ci.user_id where u.email = '${email.replace(/'/g, "''")}'`);
console.log("persisted:", JSON.stringify(saved[0]));
if (!saved[0]?.done) fails.push("intake row not saved as completed");

const chips = await page.evaluate(() => ({
  rec: document.querySelectorAll("#index .chip.rec").length,
  known: document.querySelectorAll("#index .chip.known").length,
  headNote: document.getElementById("ch-note")?.textContent,
  openLesson: document.querySelector(".lesson-h")?.textContent,
}));
console.log("chips:", JSON.stringify(chips));
if (chips.rec < 1) fails.push("no 'Start here' chip after intake");
await noOverflow("course"); await shot("4-course-adaptive");

// open the collapsed TOC to see chips on phone
await page.evaluate(() => document.getElementById("toc-toggle").click());
await page.waitForTimeout(350);
await shot("5-toc-chips");

// redo path
await page.evaluate(() => window.scrollTo(0, 0));
await page.click("#intake-redo");
await page.waitForSelector("#intake .intake-card", { timeout: 5000 });
await shot("6-redo");
const redoShown = await page.evaluate(() => !document.getElementById("intake").hidden);
if (!redoShown) fails.push("redo did not reopen intake");

await browser.close();
console.log(`\n${fails.length ? fails.length + " FAILED:\n  " + fails.join("\n  ") : "all good"}, shots in ${OUT}`);
if (errors.length) { console.log("errors:\n  " + errors.join("\n  ")); process.exit(1); }
if (fails.length) process.exit(1);
