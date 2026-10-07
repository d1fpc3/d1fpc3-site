// GEX heatmap (manual, not a node:test). D1, 2026-10-07: "a full in depth heatmap and everything for GEX".
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-gex-heatmap-visual.mjs        (APP_URL / OUT env)
// Signs in as the App Review account (it holds D1 GEX), opens the GEX board at 2560 and on a phone and proves:
// the By expiry map draws one column per expiry and 25 strikes around price, its numbers match the print's own
// surface, a hover names the cell; Through the day draws one column per archived print of the day (plus the live
// one), Change is zero at the first print after 9:50, a click on a column opens that print on the board; the
// previous day loads its own prints; the ES book draws its own strikes; Wide shows more strikes; the phone map
// fits the card without scrolling the page sideways. Never clicks Refresh (it re-prints the live board).
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-gex-heatmap`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails.push(msg); };
const browser = await chromium.launch();
for (const sz of [{ name: "2560", opts: { viewport: { width: 2560, height: 1400 } } }, { name: "phone", opts: { ...devices["iPhone 13"] } }]) {
  console.log("== " + sz.name);
  const ctx = await browser.newContext(sz.opts);
  await ctx.addInitScript(([k, v]) => {
    localStorage.setItem(k, v); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-site-tour", "done"); localStorage.setItem("echelon-gex-tour", "1")
    for (const x of ["view", "set", "mode", "px", "range"]) localStorage.removeItem("echelon-gex-heat-" + x)
    localStorage.setItem("echelon-gex-book", "NQ"); localStorage.setItem("echelon-gex-fut", "NQ")
  }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push(`${sz.name} pageerror: ${e.message}`));
  await page.route(/gex-worker\.d1fpc3\.workers\.dev\/refresh/, (route) => route.abort());
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 25000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.tab[data-view="gex"]').click());
  await page.waitForFunction(() => globalThis.__GH?.state.geo?.cols.length > 0, null, { timeout: 30000 }).catch(() => {});
  await page.$eval("#gex-heatcard", (n) => n.scrollIntoView({ block: "center" })); await page.waitForTimeout(500);
  const card = await page.$("#gex-heatcard");
  const geo = () => page.evaluate(() => { const g = globalThis.__GH.state.geo; return g && { rows: g.rows.length, cols: g.cols.length, sub: document.getElementById("gex-heat-sub").textContent } });

  // by expiry
  let g = await geo();
  const surf = await page.evaluate(() => { const d = window.__GEX_STORE?.NQ?.live; const g = globalThis.__GH.state.geo; if (!d || !g) return null; const S = d.surface, k = g.rows[Math.floor(g.rows.length / 2)], j = S.strikes.indexOf(k); return { exp: S.expiries.length, mine: g.val(0, k), theirs: S.gexM[0][j] || 0, k } });
  check(!!g && g.rows === 25 && surf && g.cols === surf.exp, `By expiry: 25 strikes x ${g?.cols} expiries (print has ${surf?.exp})`);
  check(surf && Math.abs(surf.mine - surf.theirs) < 1e-9, `a 0DTE cell is the print's own number (${surf?.k}: ${surf?.mine} = ${surf?.theirs})`);
  const box = await page.$eval("#gex-heat", (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } });
  await page.mouse.move(box.x + box.w * 0.3, box.y + box.h * 0.5); await page.waitForTimeout(300);
  const tip = await page.$eval("#gex-heat-tip", (t) => (t.hidden ? "" : t.innerText.replace(/\n/g, " | ")));
  check(/expiry|0DTE/.test(tip) && /GEX/.test(tip), `hover names the cell: ${tip}`);
  await card.screenshot({ path: `${OUT}/${sz.name}-by-expiry.png` });
  const hs = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(!hs, "the page does not scroll sideways");
  if (sz.name === "phone") { const fit = await page.evaluate(() => { const s = document.getElementById("gex-heat-scroll"); return s.scrollWidth <= s.clientWidth + 1 }); check(fit, "the phone map fits its card"); }

  // wide
  await page.click('#gex-heat-range [data-r="wide"]'); await page.waitForTimeout(500);
  g = await geo(); check(g.rows > 25, `Wide shows more strikes (${g.rows})`);
  await page.click('#gex-heat-range [data-r="near"]'); await page.waitForTimeout(300);

  // through the day
  await page.click('#gex-heat-view [data-v="day"]');
  await page.waitForFunction(() => /prints/.test(document.getElementById("gex-heat-sub").textContent), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  g = await geo();
  const archived = await page.evaluate(() => { const day = /(\w{3}, \w{3} \d+)/.exec(document.getElementById("gex-heat-sub").textContent)?.[1]; const st = window.__GEX_STORE.NQ; const e = (st.days || []).find((x) => new Date(x.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) === day); return e ? e.times.length : -1 });
  check(g.cols >= archived && archived > 0 && g.cols <= archived + 1, `Through the day: ${g.cols} columns for ${archived} archived prints (plus the live one at most): ${g.sub}`);
  await card.screenshot({ path: `${OUT}/${sz.name}-through-the-day.png` });
  await page.click('#gex-heat-mode [data-m="change"]'); await page.waitForTimeout(500);
  const zero = await page.evaluate(() => { const g = globalThis.__GH.state.geo, b = g.cols.findIndex((c) => !c.pre); return g.rows.every((k) => g.val(b, k) === 0) && g.cols.slice(0, b).every((_, ci) => g.rows.every((k) => g.val(ci, k) === 0)) });
  check(zero, "Change is zero at the first print after 9:50 and blank before it");
  await card.screenshot({ path: `${OUT}/${sz.name}-change.png` });
  await page.click('#gex-heat-mode [data-m="level"]'); await page.waitForTimeout(300);

  if (sz.name === "2560") {
    // a click on a column opens that print
    const tgt = await page.evaluate(() => { const g = globalThis.__GH.state.geo, c = document.getElementById("gex-heat").getBoundingClientRect(), s = c.width / g.cssW, i = Math.min(2, g.cols.length - 1); return { x: c.left + (g.x0 + (i + 0.5) * g.colW) * s, y: c.top + (g.y0 + 4 * g.rowH) * s, t: g.cols[i].p.t, live: !!g.cols[i].p.live } });
    await page.mouse.click(tgt.x, tgt.y); await page.waitForTimeout(2500);
    const stamp = await page.textContent("#gex-stamp");
    check(tgt.live || new RegExp(`Viewing the .*${+tgt.t.slice(0, 2) % 12 || 12}:${tgt.t.slice(2)}`).test(stamp), `a click opens the ${tgt.t} print: "${stamp}"`);
    // the day before
    await page.click("#gex-prev"); await page.waitForFunction(() => /prints/.test(document.getElementById("gex-heat-sub").textContent) && !/Loading/.test(document.getElementById("gex-heat-sub").textContent), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const prev = await geo(), day = (await page.textContent("#gex-day")).trim();
    check(prev.sub.includes(day.replace(/^\w+, /, "")) || prev.sub.includes(day), `the earlier day draws its own prints: ${prev.sub} (board on ${day})`);
    await page.$eval("#gex-heatcard", (n) => n.scrollIntoView({ block: "center" })); await page.waitForTimeout(300);
    await card.screenshot({ path: `${OUT}/${sz.name}-earlier-day.png` });
    // back to live, then the ES book
    for (let i = 0; i < 4 && !(await page.$eval("#gex-next", (b) => b.disabled)); i++) { await page.click("#gex-next"); await page.waitForTimeout(1500); }
    await page.click('#gex-book [data-f="ES"]'); await page.waitForTimeout(1500);
    await page.click('#gex-heat-view [data-v="exp"]');
    await page.waitForFunction(() => /^ES /.test(document.getElementById("gex-heat-sub").textContent), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
    const es = await page.evaluate(() => { const g = globalThis.__GH.state.geo; return { sub: document.getElementById("gex-heat-sub").textContent, top: g.rows[0], px: document.querySelector('#gex-heat-px [data-p="und"]').textContent } });
    check(/^ES /.test(es.sub) && es.top > 1000 && es.px === "SPX", `the ES book draws SPX strikes (${es.top}, ${es.px}): ${es.sub}`);
    await page.$eval("#gex-heatcard", (n) => n.scrollIntoView({ block: "center" })); await page.waitForTimeout(300);
    await card.screenshot({ path: `${OUT}/${sz.name}-es.png` });
    await page.click('#gex-book [data-f="NQ"]'); await page.waitForTimeout(800);
  }
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n - ` + fails.join("\n - ") : "\nall ok");
console.log("shots: " + OUT);
process.exitCode = fails.length ? 1 : 0;
