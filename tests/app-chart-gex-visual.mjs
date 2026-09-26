// Chart: D1 GEX zones (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-gex-visual.mjs        (APP_URL / OUT / EMAIL / THEME env)
// Signs in with GEX switched on in the saved chart settings (it ships off, a member turns
// it on under Indicators), opens the Chart on live data and checks the GEX overlay: the
// legend row carries the regime word and the plain-English read, zone colours reach
// the canvas, the drawer has the zone controls, and the switch-off sticks across a
// reload. Screenshots at 1440, 2560 and phone.
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

const OUT = process.env.OUT || `${tmpdir()}/app-chart-gex`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const tokenFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const theme = process.env.THEME || "dark";
const SYM = process.env.SYM || "";   // NQ | MNQ | ES | MES; empty keeps whatever is saved
const STALE = process.env.STALE === "1";   // fake a Monday 11:30 ET with only Friday's print on the feed: the legend must say how old it is
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const note = (s) => console.log("  " + s);
const check = (ok, what) => { note((ok ? "ok   " : "FAIL ") + what); if (!ok) fails.push(what); };
const browser = await chromium.launch();
const VP = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  wide: { viewport: { width: 2560, height: 1300 }, deviceScaleFactor: 1 },
  phone: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
// how many canvas pixels sit near a colour (zone fills are blended, so the border is what matches)
const near = (page, rgb, tol = 60) => page.evaluate(([c, t]) => { const cv = document.getElementById("ch-canvas"); const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < t) n++; return n; }, [rgb, tol]);
const openChart = async (page) => {
  await page.waitForSelector("#td-h1", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click());
  await page.evaluate(() => { const sc = document.getElementById("scrim"); if (sc && getComputedStyle(sc).opacity !== "0") sc.click(); });
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open") } });
  await page.waitForFunction(() => /C\s?[\d,]/.test(document.getElementById("ch-legend").textContent), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);   // bars, then the GEX feed and the morning prints
};

async function run(vpName) {
  console.log(`\n${vpName} · ${theme} · ${email}`);
  const ctx = await browser.newContext(VP[vpName]);
  await ctx.addInitScript(([k, v, t, sy]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", t); if (!localStorage.getItem("echelon-chart-tf")) localStorage.setItem("echelon-chart-tf", "5m"); if (!localStorage.getItem("echelon-chart-settings")) localStorage.setItem("echelon-chart-settings", JSON.stringify({ gex: true })); if (sy) localStorage.setItem("echelon-chart-sym", sy); }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme, SYM]);
  const page = await ctx.newPage();
  if (STALE) await page.clock.setFixedTime(new Date("2026-09-28T15:30:00Z"));
  page.on("pageerror", (e) => { note("PAGEERROR " + e.message); fails.push(`${vpName} pageerror: ${e.message}`) });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await openChart(page);

  const s0 = await page.evaluate(() => ({ gex: window.__CH.s.gex, swing: window.__CH.s.gexSwing, rn: window.__CH.s.gexRn, band: window.__CH.s.gexBand, sym: window.__CH.sym, books: Object.keys(window.__CH.gexBooks || {}), es: window.__CH.gexBooks?.es?.live?.underlying ?? null }));
  check(s0.gex === true && s0.swing === true && s0.rn === 10 && s0.band === 6, `GEX on, zone defaults in place (swing ${s0.swing}, levels ${s0.rn}, zone height ${s0.band})`);
  note(`symbol ${s0.sym} | books cached [${s0.books.join(",")}]${s0.es ? " | es book underlying " + s0.es : ""}`);
  if (vpName !== "phone") {   // phones show a compact legend (no study rows) until a tap parks the crosshair
    const row = await page.evaluate(() => { const r = document.querySelector('#ch-legend .ln[data-ind="gex"]'); return r ? { text: r.textContent, title: r.getAttribute("title") } : null; });
    check(!!row, "legend has the D1 GEX row (the account owns d1-gex)");
    if (!row) { await page.screenshot({ path: `${OUT}/${vpName}-${theme}-gex-missing.png` }); await ctx.close(); return; }
    check(/(Dampening|Amplifying|Unsettled|Past the (call|put) wall)/.test(row.text) && /Flip\s?[\d,]+\s[+−]\d+/.test(row.text), `legend row reads: ${row.text.trim().slice(0, 110)}`);
    check(STALE ? /data from \w{3} \d{1,2}:\d{2} [AP]M, \d+[mh] old/.test(row.text) : /as of (\w{3} )?\d{1,2}:\d{2}/.test(row.text), STALE ? "a quiet feed mid-session says how old the print is" : "legend says which print the levels came from");
    const pill = await page.evaluate(() => { const p = document.querySelector("#ch-legend .gx-rg"); if (!p) return null; const cs = getComputedStyle(p); return { k: p.dataset.k, color: cs.color, bg: cs.backgroundColor, radius: cs.borderRadius }; });
    check(!!pill && pill.bg !== "rgba(0, 0, 0, 0)" && parseFloat(pill.radius) > 8, `regime pill painted: ${JSON.stringify(pill)}`);
    const lb = await page.locator('#ch-legend .ln[data-ind="gex"]').boundingBox();
    if (lb) await page.screenshot({ path: `${OUT}/${vpName}-${theme}-gex-legend.png`, clip: { x: lb.x - 6, y: lb.y - 30, width: Math.min(760, lb.width + 40), height: lb.height + 40 } });
    check((row.title || "").length > 30 && !/undefined|null|NaN/.test(row.title), `hover read: ${row.title}`);
  }

  // frame the last two sessions so both the live zones and a past print are on screen
  if (vpName !== "phone") { const cv = await page.$("#ch-canvas"); const box = await cv.boundingBox(); await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4); await page.mouse.wheel(0, 500); await page.waitForTimeout(1200); }
  const red = await near(page, [239, 83, 80]), blue = await near(page, [41, 98, 255]), green = await near(page, [38, 166, 154]);
  check(red + blue + green > 300, `zone colours on the canvas: call ${red}px, flip ${blue}px, put ${green}px`);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-gex.png` });

  if (vpName === "desk") {
    // the drawer has the zone controls, and they change the paint
    await page.evaluate(() => window.__CH.$.menu("ind:gex"));
    await page.waitForTimeout(500);
    const drawer = await page.evaluate(() => document.getElementById("ch-menu").textContent);
    check(/Zone height/.test(drawer) && /Gamma levels shown/.test(drawer) && /Swing book/.test(drawer) && /Price in labels/.test(drawer), "drawer lists zone height, levels shown, swing book, price in labels");
    await page.screenshot({ path: `${OUT}/${vpName}-${theme}-gex-drawer.png` });
    const before = await near(page, [91, 141, 184], 70);
    await page.evaluate(() => { const S = window.__CH.s; S.gexRn = 0; });
    await page.evaluate(() => document.querySelector('#ch-menu input[type="range"]').dispatchEvent(new Event("input", { bubbles: true })));
    await page.waitForTimeout(500);
    const after = await near(page, [91, 141, 184], 70);
    note(`ranked-level pixels with 10 shown ${before}, with 0 shown ${after}`);
    await page.keyboard.press("Escape");

    // the switch-off sticks: turn it off through the drawer's own toggle, reload, still off
    await page.evaluate(() => window.__CH.$.menu("ind:gex"));
    await page.waitForTimeout(300);
    await page.evaluate(() => { const i = document.querySelector('#ch-menu .ch-row input[type="checkbox"]'); i.checked = false; i.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: "domcontentloaded" });
    await openChart(page);
    const s1 = await page.evaluate(() => ({ gex: window.__CH.s.gex, row: !!document.querySelector('#ch-legend .ln[data-ind="gex"]') }));
    check(s1.gex === false && !s1.row, `switched off by the member, it stays off after a reload (gex ${s1.gex}, row ${s1.row})`);
  }
  await ctx.close();
}

for (const vp of (process.env.VIEWPORTS || "desk,wide,phone").split(",")) await run(vp);
await browser.close();
console.log(`\nscreenshots: ${OUT}`);
if (fails.length) { console.log(`\n${fails.length} FAILED:\n - ` + fails.join("\n - ")); process.exit(1); }
console.log("\nall good");
