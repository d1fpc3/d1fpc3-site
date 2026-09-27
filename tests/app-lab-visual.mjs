// Tape and gamma lessons (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-lab-visual.mjs        (ORIGIN / OUT / EMAIL / VIEWPORTS env)
// Signs in, opens the Tape and gamma tab, and drives the embedded page: lesson C runs to the
// reclaim with absorption at the iceberg, the delta slider and the GEX slider move their reads,
// the quiz grades, the app's theme reaches the frame, and a browser with no session is sent to
// sign in instead of seeing the page. Screenshots at 1440, 2560 and phone.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = [
  "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright",
  "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright",
];
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/app-lab`;
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.ORIGIN || "http://127.0.0.1:8123";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const tokenFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [], note = (s) => console.log("  " + s);
const check = (ok, what) => { note((ok ? "ok   " : "FAIL ") + what); if (!ok) fails.push(what); };
const browser = await chromium.launch();
const VP = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  wide: { viewport: { width: 2560, height: 1300 }, deviceScaleFactor: 1 },
  phone: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const settle = (f) => f.waitForFunction(() => !document.querySelector("#controls button:disabled"), null, { timeout: 30000 });

// no session: a stranger is sent to sign in and never sees the lessons
{
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.route("https://d1fpc3.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>sign in</title>" }));
  await page.goto(`${ORIGIN}/echelon/lab/`); await page.waitForTimeout(800);
  check(page.url().startsWith("https://d1fpc3.com/echelon/app/"), `no session goes to sign in (${page.url()})`);
  await ctx.close();
}

async function run(vp) {
  console.log(`\n${vp} · ${email}`);
  const ctx = await browser.newContext(VP[vp]);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { note("PAGEERROR " + e.message); fails.push(`${vp} pageerror: ${e.message}`) });
  await page.goto(`${ORIGIN}/echelon/app/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 30000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open") } });
  // it lives in Study: a segment beside Lessons, Library and Homework, not a sidebar row
  const inTools = await page.evaluate(() => [...document.querySelectorAll('.grp:not([hidden]) .tab')].some((t) => t.dataset.view === "lab"));
  check(!inTools, "no sidebar row of its own");
  await page.evaluate(() => document.querySelector('.tab[data-view="course"]').click());
  await page.waitForTimeout(700);
  const seg = await page.evaluate(() => { const s = document.getElementById("tb-seg"); const bs = [...s.querySelectorAll("button")]; const r = s.getBoundingClientRect(); return { labels: bs.map((b) => b.textContent.trim()), clipped: bs.some((b) => { const q = b.getBoundingClientRect(); return q.right > r.right + 1 || q.left < r.left - 1 || b.scrollWidth > b.clientWidth + 1 }), over: s.scrollWidth > s.clientWidth + 1 } });
  check(seg.labels.includes("Lab") && seg.labels[0] === "Lessons", `Study segments: ${seg.labels.join(" | ")}`);
  check(!seg.clipped && !seg.over, "every segment fits the bar");
  await page.screenshot({ path: `${OUT}/${vp}-study-seg.png` });
  // a member with homework gets a fourth segment: it must still fit a phone
  const four = await page.evaluate(async () => {
    const hw = document.getElementById("hw-tab"), was = hw.hidden; hw.hidden = false
    document.querySelector('.tab[data-view="chart"]').click(); await new Promise((r) => setTimeout(r, 200)); document.querySelector('.tab[data-view="course"]').click(); await new Promise((r) => setTimeout(r, 400))
    const s = document.getElementById("tb-seg"), r = s.getBoundingClientRect(), bs = [...s.querySelectorAll("button")]
    const out = { n: bs.length, fits: !bs.some((b) => { const q = b.getBoundingClientRect(); return q.right > Math.min(r.right, innerWidth) + 1 || b.scrollWidth > b.clientWidth + 1 }), w: Math.round(r.width), vw: innerWidth }
    hw.hidden = was; return out
  });
  check(four.n === 4 && four.fits, `with Homework, four segments fit (${JSON.stringify(four)})`);
  if (vp === "phone") await page.screenshot({ path: `${OUT}/${vp}-study-seg4.png` });
  await page.evaluate(() => { document.querySelector('.tab[data-view="chart"]').click() }); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('.tab[data-view="course"]').click()); await page.waitForTimeout(500);
  await page.evaluate(() => [...document.querySelectorAll("#tb-seg button")].find((b) => b.dataset.view === "lab").click());
  await page.waitForTimeout(300);
  const lit = await page.evaluate(() => ({ seg: document.querySelector('#tb-seg button[data-view="lab"]')?.classList.contains("on"), row: document.querySelector('.tab[data-view="course"]')?.classList.contains("on"), title: document.getElementById("pane-title")?.textContent }));
  check(lit.seg && lit.row && lit.title === "Study", `lab segment on, Study row lit, title ${lit.title}`);
  await page.waitForFunction(() => document.getElementById("lab-frame")?.dataset.loaded === "1", null, { timeout: 10000 });
  const fh = await page.$("#lab-frame"); const f = await fh.contentFrame();
  await f.waitForSelector("#ladder .lrow", { timeout: 20000 });
  await page.waitForTimeout(400);
  const box = await fh.boundingBox();
  check(box && box.height >= 420, `frame fills the pane (${Math.round(box?.width)}x${Math.round(box?.height)})`);
  const theme0 = await f.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const app0 = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "dark");
  check(theme0 === app0, `frame took the app theme (${theme0})`);
  if (vp === "desk") {
    await f.click("#scen button[data-s='2']");
    for (let i = 0; i < 4; i++) {
      await f.click("#controls button[data-a='next']"); await settle(f)
      if (i === 1) { const t = await f.textContent("#say"); check(/absorption/i.test(t) && /refilled \d+ times/.test(t), `absorption step reads: ${t.slice(0, 110)}`) }
    }
    const end = await f.textContent("#say");
    check(/reclaim/i.test(end) && /20,00[01]\.\d\d/.test(end), `lesson C ends on the reclaim: ${end.slice(0, 90)}`);
    const iceRow = await f.evaluate(() => [...document.querySelectorAll("#ladder .lrow")].some((r) => /19,998\.50/.test(r.textContent)));
    check(iceRow, "the absorption row stays on the ladder after the reclaim");
    await page.screenshot({ path: `${OUT}/${vp}-lesson-c.png` });
    const r0 = await f.textContent("#dgRead");
    await f.evaluate(() => { const s = document.getElementById("dgS"); s.value = 20000; s.dispatchEvent(new Event("input")) });
    const r1 = await f.textContent("#dgRead");
    check(r0 !== r1 && /20,000/.test(r1), "delta slider updates the read");
    await f.evaluate(() => { const s = document.getElementById("gxS"); s.value = 19750; s.dispatchEvent(new Event("input")) });
    const pill = await f.textContent("#gxPill");
    check(pill === "Amplifying", `GEX slider below the flip flips the pill (${pill})`);
    await f.evaluate(() => { const s = document.getElementById("gxS"); s.value = 20200; s.dispatchEvent(new Event("input")) });
    check((await f.textContent("#gxPill")) === "Dampening", "above the flip it reads Dampening");
    // vol and vanna: price pinned, only implied vol moves, and the dealer still has to trade
    const va = async (v) => { await f.evaluate((x) => { const s = document.getElementById("vaIV"); s.value = x; s.dispatchEvent(new Event("input")) }, v); return { read: await f.textContent("#vaRead"), pill: await f.textContent("#vaPill") } };
    const down = await va(16), up = await va(28), flat = await va(20);
    check(down.pill === "Vol falling" && /buy back [\d,]+ NQ/.test(down.read), `vol 16%: ${down.read.slice(0, 90)}`);
    check(up.pill === "Vol rising" && /sell [\d,]+ more NQ/.test(up.read), `vol 28%: dealer sells (${up.read.match(/sell [\d,]+ more NQ/)?.[0]})`);
    check(flat.pill === "Vol steady" && /Move the slider/.test(flat.read), "vol 20% reads steady");
    await f.click(".mx-c[data-c='3']");
    check(await f.evaluate(() => document.querySelector(".mx-c[data-c='3']").classList.contains("on")), "the regime matrix cell selects");
    await f.evaluate(() => document.getElementById("vol").scrollIntoView()); await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${vp}-vol.png` });
    await f.click(".q[data-i='6'] .opts button[data-j='2']");
    check(/1 of 1 right/.test(await f.textContent("#qScore")), "the vanna quiz question grades");
    await f.click(".q[data-i='3'] .opts button[data-j='2']");
    check(/2 of 2 right/.test(await f.textContent("#qScore")), "quiz grades a second right answer");
    const want = theme0 === "dark" ? "light" : "dark";
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), want); await page.waitForTimeout(400);
    check((await f.evaluate(() => document.documentElement.getAttribute("data-theme"))) === want, `app theme switch reaches the frame (${want})`);
    await f.evaluate(() => document.getElementById("gex").scrollIntoView()); await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${vp}-gex-${want}.png` });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme0);
  } else {
    const sw = await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(sw <= 0, `no sideways scroll inside the frame (${sw}px)`);
    await page.screenshot({ path: `${OUT}/${vp}-lab.png` });
  }
  await ctx.close();
}
for (const vp of (process.env.VIEWPORTS || "desk,wide,phone").split(",")) await run(vp);
await browser.close();
console.log(`\nscreenshots: ${OUT}`);
if (fails.length) { console.log(`\n${fails.length} FAILED:\n - ` + fails.join("\n - ")); process.exit(1); }
console.log("\nall good");
