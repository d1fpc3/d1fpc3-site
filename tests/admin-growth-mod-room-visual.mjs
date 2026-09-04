// Admin Growth tab + Mod tools "room this week" (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/admin-growth-mod-room-visual.mjs   (ADMIN_URL / APP_URL / OUT / EMAIL env)
// Growth: four figures, members curve with a 90/12mo/All switch, revenue by
// month, arrivals split, room activity. Every headline number is recomputed
// straight from Postgres and compared against the DOM, so a chart that lies
// fails the run. Mod room: waiting markups / unanswered trades / removed
// messages, checked the same way, plus the new-members list.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/admin-growth-shots`;
mkdirSync(OUT, { recursive: true });
const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:8080/echelon/admin/";
const APP_URL = process.env.APP_URL || "http://localhost:8080/echelon/app/";
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

const sessionFor = async (email) => {
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
  const s = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
  if (!s.access_token) throw new Error(`verify failed for ${email}`);
  return s;
};

const fails = [];
const browser = await chromium.launch();

/* ─────────────── admin: Growth ─────────────── */
const ownerEmail = process.env.EMAIL || (await sql("select email from admins order by added_at limit 1"))[0].email;
const owner = await sessionFor(ownerEmail);

// the truth, straight from the database
const [truth] = await sql(`
  select
    (select count(*) from admin_buyers where status = 'active') as members,
    (select coalesce(sum(amount_cents), 0) from admin_buyers where source = 'stripe' and amount_cents is not null) as revenue,
    (select count(*) from admin_buyers where source = 'stripe' and amount_cents is not null) as paid,
    (select count(*) from admin_buyers where granted_at >= date_trunc('month', now())) as joined_this_month,
    (select count(*) from admin_buyers) as total,
    (select count(distinct user_id) from lesson_views) as opened,
    (select count(*) from admin_buyers where lessons_done >= 1) as finished_one,
    (select count(*) from admin_buyers where lessons_done >= (select count(*) from lessons where is_published)) as finished_all,
    (select count(*) from lessons where is_published) as lessons`);
console.log("admin truth:", JSON.stringify(truth));

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-admin-tour", "1"); localStorage.setItem("echelon-gex-tour", "1"); localStorage.removeItem("echelon-growth-range"); }, [`sb-${REF}-auth-token`, JSON.stringify(owner)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("admin pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`admin ${r.status()} ${r.url()}`); });
  await page.goto(ADMIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#recent-buyers tr").length > 0 || !document.getElementById("recent-empty")?.hidden, null, { timeout: 25000 });
  await page.waitForTimeout(600);

  if (!(await page.locator('.tab[data-view="growth"]').count())) fails.push("Growth tab missing from the sidebar");
  await page.evaluate(() => document.querySelector('.tab[data-view="growth"]').click());
  await page.waitForTimeout(2500);

  const g = await page.evaluate(() => ({
    title: document.getElementById("pane-title").textContent,
    figures: [...document.querySelectorAll("#gw-head .st-n")].map((n) => ({ v: n.querySelector(".v").textContent, k: n.querySelector(".k").textContent })),
    range: [...document.querySelectorAll("#gw-range button")].map((b) => b.textContent + (b.classList.contains("on") ? "*" : "")),
    members: document.querySelector("#gw-members svg") ? "chart" : document.querySelector("#gw-members .gw-empty")?.textContent,
    memberPts: document.querySelectorAll("#gw-members svg circle").length,
    memberEnd: [...document.querySelectorAll("#gw-members svg text")].map((t) => t.textContent).pop(),
    memberNote: document.querySelector("#gw-members .gw-note")?.textContent,
    revenue: document.querySelector("#gw-revenue svg") ? "chart" : document.querySelector("#gw-revenue .gw-empty")?.textContent,
    revBars: document.querySelectorAll("#gw-revenue svg rect").length,
    revN: document.getElementById("gw-rev-n").textContent,
    sourceRows: [...document.querySelectorAll("#gw-source .st-row")].map((r) => r.querySelector(".n").textContent + " " + r.querySelector(".c b").textContent),
    activity: document.querySelector("#gw-activity svg") ? "chart" : document.querySelector("#gw-activity .gw-empty")?.textContent,
    actN: document.getElementById("gw-act-n").textContent,
    funnel: [...document.querySelectorAll("#gw-funnel .gw-fn")].map((r) => r.querySelector(".n").textContent + "=" + r.querySelector(".c b").textContent),
    convs: [...document.querySelectorAll("#gw-funnel .gw-fn-conv b")].map((b) => b.textContent),
    lessonBars: document.querySelectorAll("#gw-lessons svg rect").length,
    stopNote: document.querySelector("#gw-lessons .gw-note")?.textContent,
    stopN: document.getElementById("gw-stop-n").textContent,
    help: !!document.querySelector("#v-growth .pg-help"),
    noCards: document.querySelectorAll("#v-growth .scard").length === 0,
  }));
  console.log("growth:", JSON.stringify(g, null, 1));

  if (g.title !== "Growth") fails.push(`pane title: ${g.title}`);
  if (g.figures.length !== 4) fails.push(`expected 4 figures, got ${g.figures.length}`);
  if (g.figures[0]?.v !== String(truth.members)) fails.push(`members figure ${g.figures[0]?.v} != db ${truth.members}`);
  const money = (c) => c == null ? "—" : "$" + (c / 100).toFixed(c % 100 ? 2 : 0);
  if (g.figures[1]?.v !== money(+truth.revenue)) fails.push(`revenue figure ${g.figures[1]?.v} != db ${money(+truth.revenue)}`);
  if (g.figures[2]?.v !== String(truth.joined_this_month)) fails.push(`joined-this-month ${g.figures[2]?.v} != db ${truth.joined_this_month}`);
  const avg = +truth.paid ? money(Math.round(+truth.revenue / +truth.paid)) : "—";
  if (g.figures[3]?.v !== avg) fails.push(`average order ${g.figures[3]?.v} != db ${avg}`);
  if (!g.range.includes("90 days*")) fails.push(`default range not 90 days: ${g.range}`);
  if (!g.members || !g.revenue || !g.activity) fails.push(`a growth section did not render: ${JSON.stringify(g)}`);
  if (!g.sourceRows.length && +truth.total > 0) fails.push("arrivals split is empty although members exist");
  if (!g.help) fails.push("page help note missing on Growth");
  if (!g.noCards) fails.push("Growth uses boxed .scard panels; it should be flat");
  const want = [`Joined=${truth.members}`, `Opened a lesson=${truth.opened}`, `Finished a lesson=${truth.finished_one}`, `Finished everything=${truth.finished_all}`];
  if (JSON.stringify(g.funnel) !== JSON.stringify(want)) fails.push(`funnel ${JSON.stringify(g.funnel)} != db ${JSON.stringify(want)}`);
  if (g.convs.length !== 3) fails.push(`funnel should show 3 conversion lines, got ${g.convs.length}`);
  if (g.lessonBars !== +truth.lessons) fails.push(`lesson bars ${g.lessonBars} != published lessons ${truth.lessons}`);
  if (!/Most people stop after/.test(g.stopNote || "") && +truth.opened > 0) fails.push(`drop-off note missing: ${g.stopNote}`);
  if (!g.stopN.startsWith(`${truth.opened} of ${truth.members}`)) fails.push(`stop caption ${g.stopN}`);
  if (/—/.test((g.stopNote || "") + g.funnel.join(""))) fails.push("em dash in course copy");
  if (/—/.test(g.memberNote || "")) fails.push(`em dash in the members note: ${g.memberNote}`);
  await page.screenshot({ path: `${OUT}/admin-01-growth.png`, fullPage: true });

  // range switch persists and re-renders
  await page.click('#gw-range button[data-d="0"]'); await page.waitForTimeout(500);
  const all = await page.evaluate(() => ({ on: document.querySelector("#gw-range button.on")?.textContent, stored: localStorage.getItem("echelon-growth-range"), note: document.querySelector("#gw-members .gw-note")?.textContent }));
  if (all.on !== "All" || all.stored !== "0") fails.push(`All switch: ${JSON.stringify(all)}`);
  if (/in the last/.test(all.note || "")) fails.push(`All range still says "in the last": ${all.note}`);
  await page.screenshot({ path: `${OUT}/admin-02-growth-all.png`, fullPage: true });

  // light mode must not break the charts
  await page.evaluate(() => document.getElementById("theme-toggle").click());
  await page.waitForTimeout(500);
  const lightStroke = await page.evaluate(() => { const p = document.querySelector("#gw-members svg path[stroke]"); return p ? getComputedStyle(p).stroke : null; });
  if (!lightStroke || lightStroke === "none") fails.push("members curve lost its stroke in light mode");
  await page.screenshot({ path: `${OUT}/admin-03-growth-light.png`, fullPage: true });
  await page.evaluate(() => document.getElementById("theme-toggle").click());
  await page.waitForTimeout(300);

  // narrow: the split must stack, nothing may overflow
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.waitForTimeout(400);
  const over = await page.evaluate(() => { const v = document.getElementById("v-growth"); return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, h: v.scrollHeight }; });
  if (over.scroll > over.client + 1) fails.push(`Growth overflows horizontally at 900px: ${over.scroll} > ${over.client}`);
  await page.screenshot({ path: `${OUT}/admin-04-growth-narrow.png`, fullPage: true });
  await ctx.close();
}

/* ─────────────── members app: Mod tools room ─────────────── */
const modEmail = process.env.MOD_EMAIL || ownerEmail;
const mod = await sessionFor(modEmail);
const [modTruth] = await sql(`
  select
    (select count(*) from homework_submissions where status = 'pending') as pending,
    (select count(*) from messages where deleted_at is not null and deleted_at >= now() - interval '7 days') as removed,
    (select count(*) from member_recaps r where r.created_at >= now() - interval '7 days'
       and not exists (select 1 from post_comments c where c.recap_id = r.id and c.deleted_at is null)) as quiet,
    (select count(*) from profiles where created_at >= now() - interval '7 days') as newbies`);
console.log("mod truth:", JSON.stringify(modTruth));

{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-bt-pop", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(mod)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("app pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`app ${r.status()} ${r.url()}`); });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 25000 });
  await page.waitForTimeout(1500);

  // staff is read off the DOM: the Mod tools row is unhidden only for mods/admins
  const [{ staff: isStaff }] = await sql(`select (exists (select 1 from admins a join auth.users u on u.id = a.user_id where u.email = '${modEmail}') or exists (select 1 from mods m join auth.users u on u.id = m.user_id where u.email = '${modEmail}')) as staff`);
  const rowHidden = await page.evaluate(() => document.getElementById("set-modtools-row")?.hidden);
  if (!isStaff) { console.log("mod room: signed-in account is not staff, skipping"); }
  else {
    if (rowHidden) fails.push("Mod tools row hidden for a staff account");
    await page.evaluate(() => document.querySelector('.set-row[data-go="set-modtools"]').click());
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => ({
      figures: [...document.querySelectorAll("#mt-room div")].map((d) => ({ v: d.querySelector(".v")?.textContent, k: d.querySelector(".k")?.textContent })),
      line: document.getElementById("mt-room-line")?.textContent,
      cap: document.getElementById("mt-room-n")?.textContent,
      newN: document.getElementById("mt-new-n")?.textContent,
      newRows: document.querySelectorAll("#mt-new .mt-greet").length,
      newEmpty: document.querySelector("#mt-new .hint")?.textContent,
      emDash: [...document.querySelectorAll("#mt-room, #mt-room-line, #mt-new")].some((n) => n.textContent.includes("—")),
      order: [...document.querySelectorAll("#v-set-modtools .block-head h3")].map((h) => h.textContent),
    }));
    console.log("mod room:", JSON.stringify(m, null, 1));
    if (m.figures.length !== 3) fails.push(`expected 3 room figures, got ${m.figures.length}`);
    if (m.figures[0]?.v !== String(modTruth.pending)) fails.push(`waiting markups ${m.figures[0]?.v} != db ${modTruth.pending}`);
    if (m.figures[1]?.v !== String(modTruth.quiet)) fails.push(`unanswered trades ${m.figures[1]?.v} != db ${modTruth.quiet}`);
    if (m.figures[2]?.v !== String(modTruth.removed)) fails.push(`removed messages ${m.figures[2]?.v} != db ${modTruth.removed}`);
    if (!m.line) fails.push("room sentence missing");
    if (+modTruth.pending === 0 && +modTruth.quiet === 0 && !/caught up/.test(m.line || "")) fails.push(`idle sentence wrong: ${m.line}`);
    if (m.newRows !== Math.min(8, +modTruth.newbies) && !m.newEmpty) fails.push(`new members ${m.newRows} vs db ${modTruth.newbies}`);
    if (m.emDash) fails.push("em dash in mod room copy");
    if (m.order[0] !== "The room this week") fails.push(`room block should come first: ${m.order}`);
    await page.screenshot({ path: `${OUT}/mod-01-room.png`, fullPage: true });
  }
  await ctx.close();
}

await browser.close();
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log("PASS · shots in", OUT);
