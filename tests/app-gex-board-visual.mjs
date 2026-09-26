// GEX board look (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-gex-board-visual.mjs        (APP_URL / OUT / TAG env)
// Signs in as the owner, opens the GEX view at 2560, 1440 and a phone,
// screenshots the board (surface + profile + ES book), and asserts the
// layout holds: no horizontal page scroll, the hero numbers are filled,
// the canvas drew, the levels ladder has rows, nothing overflows its card.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");

const TAG = process.env.TAG || "now";
const THEME = process.env.THEME || "";   // dark | light, else whatever the account has
const OUT = process.env.OUT || `${tmpdir()}/app-gex-board`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "d1fpc3@gmail.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");

const fails = [];
const note = (s) => console.log("  " + s);
const browser = await chromium.launch();
const SIZES = [
  { name: "2560", opts: { viewport: { width: 2560, height: 1400 } } },
  { name: "1440", opts: { viewport: { width: 1440, height: 900 } } },
  { name: "390", opts: { ...devices["iPhone 13"] } },
];
for (const sz of SIZES) {
  const ctx = await browser.newContext(sz.opts);
  await ctx.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-gex-tour", "1"); if (t) localStorage.setItem("echelon-theme", t); }, [`sb-${REF}-auth-token`, JSON.stringify(session), THEME]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push(`${sz.name} pageerror: ${e.message}`));
  // never re-print the live board from a test: /refresh answers with the current snapshot
  await page.route(/gex-worker\.d1fpc3\.workers\.dev\/refresh/, async (route) => { const u = route.request().url().replace("/refresh", "/gex.json"); const r = await fetch(u); route.fulfill({ status: r.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: await r.text() }); });
  await page.goto(APP_URL + "?start=gex", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 25000 });
  await page.evaluate(() => { const t = document.querySelector('.tab[data-view="gex"]'); if (t) t.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#gex-read .v").length >= 4, null, { timeout: 30000 }).catch(() => fails.push(`${sz.name}: board never filled`));
  await page.waitForTimeout(1400);
  const st = await page.evaluate(() => {
    const v = document.getElementById("v-gex");
    const over = [...v.querySelectorAll("*")].filter((n) => { const r = n.getBoundingClientRect(); return r.width && r.right > document.documentElement.clientWidth + 1 && getComputedStyle(n).position !== "fixed" && !n.closest(".tbl-scroll,.gex-sheet,.gex-ladder-scroll"); }).map((n) => n.id || n.className).slice(0, 6);
    const c = document.getElementById("gex-canvas");
    return {
      hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      figs: [...document.querySelectorAll("#gex-read .v")].map((n) => n.textContent),
      canvas: c ? [c.width, c.height] : null,
      rows: document.querySelectorAll("#gex-table tbody tr").length,
      over,
    };
  });
  note(`${sz.name}: ${JSON.stringify(st)}`);
  if (st.hscroll) fails.push(`${sz.name}: horizontal page scroll`);
  if (st.over.length) fails.push(`${sz.name}: overflow ${st.over.join(", ")}`);
  if (st.figs.some((f) => !f || f === "–")) fails.push(`${sz.name}: empty hero figure ${JSON.stringify(st.figs)}`);
  if (!st.canvas || !st.canvas[0]) fails.push(`${sz.name}: canvas did not draw`);
  if (st.rows < 3) fails.push(`${sz.name}: levels ladder has ${st.rows} rows`);
  await page.screenshot({ path: `${OUT}/${TAG}-${sz.name}-surface.png`, fullPage: sz.name !== "2560" });
  await page.click('#gex-view button[data-v="profile"]').catch(() => fails.push(`${sz.name}: no Profile toggle`));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${TAG}-${sz.name}-profile.png`, fullPage: sz.name !== "2560" });
  if (sz.name === "1440") {
    // the sheet folds open, copies, folds shut; refresh spins and comes back; the tape and rail drew
    await page.click("#gex-sheet-tog");
    if (!(await page.isVisible("#gex-sheet"))) fails.push("sheet did not open");
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.click("#gex-sheet-copy"); await page.waitForTimeout(200);
    const copied = await page.evaluate(() => document.querySelector("#gex-sheet-copy span").textContent);
    if (!/Copied/.test(copied)) fails.push("copy sheet said " + copied);
    await page.click("#gex-sheet-tog");
    if (await page.isVisible("#gex-sheet")) fails.push("sheet did not fold");
    await page.click("#gex-refresh");
    await page.waitForFunction(() => !document.getElementById("gex-refresh").disabled, null, { timeout: 30000 }).catch(() => fails.push("refresh never finished"));
    const rf = await page.evaluate(() => ({ lbl: document.querySelector("#gex-refresh span")?.textContent, svg: !!document.querySelector("#gex-refresh svg"), pins: document.querySelectorAll("#gex-rail .gex-pin").length, tape: !!document.querySelector("#gex-sess svg path"), sigs: document.querySelectorAll("#gex-signals .gex-sig").length }));
    note("after refresh: " + JSON.stringify(rf));
    if (rf.lbl !== "Refresh" || !rf.svg) fails.push("refresh button lost its label or icon");
    if (rf.pins < 3) fails.push("rail has " + rf.pins + " pins");
    const hasTape = await page.evaluate(() => (window.__GEX_STORE?.NQ?.live?.intraday || []).length >= 2);
    if (hasTape !== rf.tape) fails.push(`session tape ${rf.tape ? "drawn without" : "missing with"} intraday data`);
    if (rf.sigs < 2) fails.push("signals " + rf.sigs);
    await page.click('#gex-view button[data-v="surface"]'); await page.waitForTimeout(500);
    await page.locator("#gex-canvas").scrollIntoViewIfNeeded();
    const box = await page.locator("#gex-canvas").boundingBox();
    let tip = false;
    for (let fx = 0.35; fx <= 0.65 && !tip; fx += 0.05) { await page.mouse.move(box.x + box.width * fx, box.y + box.height * 0.5); await page.waitForTimeout(80); tip = await page.isVisible("#gex-tip"); }
    if (!tip) fails.push("surface hover showed no tooltip");
    await page.screenshot({ path: `${OUT}/${TAG}-${sz.name}-hover.png` });
    await page.click('#gex-book button[data-b="ES"]').catch(() => fails.push("no ES toggle"));
    await page.waitForFunction(() => /ES|SPX/.test(document.getElementById("gex-read").textContent), null, { timeout: 20000 }).catch(() => fails.push("ES book never loaded"));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${TAG}-${sz.name}-es.png` });
  }
  await ctx.close();
}
await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
