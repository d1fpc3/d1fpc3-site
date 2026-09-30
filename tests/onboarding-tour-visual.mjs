// The site tour a new member walks from the welcome card (manual, not a node:test).
//   node tests/onboarding-tour-visual.mjs        (APP_URL / OUT / EMAIL / ONLY=desk,wide,iphone env)
// Resets EMAIL's member_onboarding row, opens the app, and proves: the welcome card starts a live tour; every
// step opens its page (Today, Chart, GEX, News, Feed, Chat, Study, Journal, Indicators, Prop firms, Discord,
// Search, You, What's next as the account allows); on a desk the spotlight sits on the sidebar row and the card
// beside it, on a phone the dock button is ringed or the card says where the page lives; the card never leaves
// the screen or covers what it points at; Back and the arrow keys walk it; the end hands back to the five
// questions; skipping them completes the row with flags.site_tour; a reload does not replay it; Settings >
// Tour of Echelon replays it and Esc puts you back in Settings. The row is restored at the end.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/onboarding-tour`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = (q) => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) }).then((r) => r.json());
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const q = (s) => String(s).replace(/'/g, "''");
const saved = (await sql(`select o.completed_at, o.answers, o.flags from member_onboarding o join auth.users u on u.id = o.user_id where u.email = '${q(email)}'`))?.[0];
const restore = () => saved && sql(`update member_onboarding o set completed_at = ${saved.completed_at ? `'${q(saved.completed_at)}'` : "null"}, answers = '${q(JSON.stringify(saved.answers ?? {}))}'::jsonb, flags = '${q(JSON.stringify(saved.flags ?? {}))}'::jsonb from auth.users u where o.user_id = u.id and u.email = '${q(email)}'`);
const reset = () => sql(`update member_onboarding o set completed_at = null, flags = coalesce(o.flags, '{}'::jsonb) - 'site_tour' from auth.users u where o.user_id = u.id and u.email = '${q(email)}'`);

const fails = [];
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };
const VPS = {
  desk: [chromium, { viewport: { width: 1440, height: 900 } }],
  wide: [chromium, { viewport: { width: 2560, height: 1300 } }],
  iphone: [webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }],
};
const ONLY = (process.env.ONLY || "desk,wide,iphone").split(",");
// geometry of the tour right now, in screen pixels
const geo = (page) => page.evaluate(() => {
  const st = window.__siteTour.state(), card = document.querySelector(".stour-card"), ring = document.querySelector(".stour-ring");
  const cr = card?.getBoundingClientRect(), rr = ring?.getBoundingClientRect(), ringOn = ring && !ring.classList.contains("off");
  const view = document.querySelector(".view.on")?.id.replace(/^v-/, "");
  return { st, view, card: cr && { l: cr.left, t: cr.top, r: cr.right, b: cr.bottom }, ring: ringOn ? { l: rr.left, t: rr.top, r: rr.right, b: rr.bottom } : null, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, note: [...(card?.querySelectorAll(".stour-note") || [])].map((n) => n.textContent).join(" / "), title: card?.querySelector("h4")?.textContent };
});
const VIEW_OF = { Today: "overview", Chart: "chart", GEX: "gex", News: "news", Feed: "feed", Posts: "feed", Chat: "chat", Study: "course", Journal: "journal", Indicators: "indicators", "Prop firms": "propfirms", You: "settings", "What's next": "overview" };

for (const tag of ONLY) {
  const [eng, opt] = VPS[tag];
  console.log(`== ${tag}`);
  await reset();
  const browser = await eng.launch();
  const ctx = await browser.newContext(opt);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); localStorage.removeItem("echelon-chart-side"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("PAGEERROR " + e.message); fails.push(`${tag} pageerror ${e.message}`); });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#onb:not([hidden]) .intake-card", { timeout: 40000 });
  await page.waitForTimeout(900);
  const welcome = await page.evaluate(() => ({ q: document.querySelector("#onb .q")?.textContent, btn: document.querySelector("#onb .intake-card .btn")?.textContent }));
  check(welcome.btn === "Show me around", `[${tag}] the welcome card offers the tour ("${welcome.q}", "${welcome.btn}")`);
  await page.screenshot({ path: `${OUT}/${tag} 00 welcome.png` });
  await page.locator("#onb .intake-card .btn").first().click();
  await page.waitForTimeout(700);
  let g = await geo(page);
  check(g.st.on && g.st.i === 0 && g.st.n >= 10, `[${tag}] the tour starts with ${g.st.n} steps, first "${g.st.t}"`);
  const seen = [];
  for (let k = 0; k < g.st.n; k++) {
    await page.waitForTimeout(tag === "iphone" ? 1100 : 750);
    g = await geo(page);
    seen.push(g.title);
    const inView = g.card && g.card.l >= 0 && g.card.t >= 0 && g.card.r <= g.vw + 0.5 && g.card.b <= g.vh + 0.5;
    const overlap = g.ring && g.card && !(g.card.r <= g.ring.l || g.card.l >= g.ring.r || g.card.b <= g.ring.t || g.card.t >= g.ring.b);
    const want = VIEW_OF[g.title];
    const phone = tag === "iphone";
    const pointed = !!g.ring || (phone && (g.note.startsWith("Find it") || ["Today", "Feed", "Posts", "Chat", "Study"].includes(g.title)));
    check(inView && !overlap && (!want || g.view === want) && (phone || g.ring || g.title === "Discord") && pointed,
      `[${tag}] ${k + 1}/${g.st.n} ${g.title}: page ${g.view}${want ? "" : " (stays)"}, ${g.ring ? "spotlight on" : "no spotlight"}, card ${inView ? "on screen" : "OFF SCREEN"}${overlap ? ", COVERS THE SPOTLIGHT" : ""}${g.note ? `, "${g.note.slice(0, 70)}"` : ""}`);
    await page.screenshot({ path: `${OUT}/${tag} ${String(k + 1).padStart(2, "0")} ${g.title.replace(/'/g, "")}.png` });
    if (k === 1) {
      // Back, then forward again (arrow key on a keyboard, the button on a phone)
      await page.locator(".stour-back").click(); await page.waitForTimeout(500);
      const b = await geo(page);
      check(b.st.i === 0 && b.view === "overview", `[${tag}] Back returns to "${b.st.t}" and its page`);
      if (phone) await page.locator(".stour-next").click(); else await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(600);
      const f = await geo(page);
      check(f.st.i === 1, `[${tag}] ${phone ? "Next" : "the right arrow"} walks forward again`);
    }
    if (k < g.st.n - 1) await page.locator(".stour-next").click();
  }
  check(seen.includes("Chart") && seen.includes("Study") && seen.includes("You"), `[${tag}] the walk covered: ${seen.join(", ")}`);
  check(g.sw <= g.vw, `[${tag}] no sideways scroll during the tour (${g.sw} in ${g.vw})`);
  // the last step hands back to the questions
  const lastLabel = await page.locator(".stour-next").textContent();
  check(lastLabel === "Continue", `[${tag}] the last step says Continue`);
  await page.locator(".stour-next").click();
  await page.waitForTimeout(900);
  const qs = await page.evaluate(() => ({ open: !document.getElementById("onb").hidden, eb: document.querySelector("#onb .eyebrow")?.textContent, sub: document.querySelector("#onb .q-sub")?.textContent, tour: window.__siteTour.state().on, gone: !document.querySelector(".stour-card") }));
  check(qs.open && qs.eb === "About you" && !qs.tour, `[${tag}] then the questions: "${qs.eb}", "${qs.sub}"`);
  await page.screenshot({ path: `${OUT}/${tag} 20 the questions after the tour.png` });
  await page.locator("#onb .skip").first().click();
  await page.waitForTimeout(1200);
  if (!(await page.evaluate(() => document.getElementById("onb").hidden))) { await page.locator("#onb .skip").first().click(); await page.waitForTimeout(1200); }
  const row = (await sql(`select o.completed_at, o.flags from member_onboarding o join auth.users u on u.id = o.user_id where u.email = '${q(email)}'`))?.[0];
  check(!!row?.completed_at && row?.flags?.site_tour === "done", `[${tag}] the row is complete with flags.site_tour = ${row?.flags?.site_tour}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(2500);
  check(await page.evaluate(() => document.getElementById("onb").hidden && !document.querySelector(".stour-card")), `[${tag}] a reload does not replay the onboarding`);
  // Settings replays it
  await page.evaluate(() => { document.querySelector('.tab[data-view="settings"]').click(); });
  await page.waitForTimeout(900);
  await page.locator("#set-tour-row").click();
  await page.waitForTimeout(800);
  const rp = await geo(page);
  check(rp.st.on && rp.st.i === 0 && rp.view === "overview", `[${tag}] Settings > Tour of Echelon replays it from "${rp.st.t}"`);
  if (tag === "iphone") await page.locator(".stour-skip").click(); else await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const back = await page.evaluate(() => ({ on: window.__siteTour.state().on, view: document.querySelector(".view.on")?.id, left: document.querySelectorAll(".stour-card, .stour-ring, .stour-veil, .stour-shield").length }));
  check(!back.on && back.view === "v-settings" && back.left === 0, `[${tag}] ${tag === "iphone" ? "Skip tour" : "Esc"} ends it and puts you back in Settings (${back.view})`);
  await browser.close();
}
await restore();
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
