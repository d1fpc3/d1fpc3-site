// Chart skin, sidebar fold and the settings dialog (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-skin-visual.mjs        (APP_URL / OUT / EMAIL / THEME env)
// Signs in, opens the Chart and proves: the chrome follows the canvas
// background (dark by default in the dark theme, light the moment the
// background is set light), the sidebar folds away from the bar button with a
// real transition and stays folded on the next visit, the settings dialog has
// no presets, every colour is a pill that opens the shared picker (swatches,
// hex, any colour, default), the switches and segments work, the accent can be
// any colour, and Done plays the dialog out. Desk 1440, wide 2560, phone 390.
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

const OUT = process.env.OUT || `${tmpdir()}/app-chart-skin`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const tokenFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const theme = process.env.THEME || "dark";
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
const rgb = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return `rgb(${r}, ${g}, ${b})`; };
const skin = (page) => page.evaluate(() => {
  const v = document.getElementById("v-chart"), cs = getComputedStyle(v);
  const cv = document.getElementById("ch-canvas"), d = cv.getContext("2d").getImageData(2, 2, 1, 1).data, bgNow = window.__CH.bgNow;
  return { skin: v.dataset.skin, panel: cs.getPropertyValue("--panel").trim(), acc: v.style.getPropertyValue("--acc"), bar: getComputedStyle(document.querySelector(".ch-bar")).backgroundColor, foot: getComputedStyle(document.querySelector(".ch-foot")).backgroundColor, px: `rgb(${d[0]}, ${d[1]}, ${d[2]})`, bgNow, menu: getComputedStyle(document.getElementById("ch-menu")).backgroundColor };
});
const geo = (page) => page.evaluate(() => ({ side: document.querySelector("aside.side").getBoundingClientRect().width, stage: document.getElementById("ch-stage").getBoundingClientRect().width, canvas: document.getElementById("ch-canvas").width, stageClient: document.getElementById("ch-stage").clientWidth, dpr: Math.min(devicePixelRatio || 1, 2), hid: document.body.classList.contains("side-hid") }));

async function open(page) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click());
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open") } });
  await page.waitForFunction(() => /O\s?[\d,]|C\s?[\d,]/.test(document.getElementById("ch-legend").textContent), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

async function run(vpName) {
  console.log(`\n${vpName} · ${theme} · ${email}`);
  const ctx = await browser.newContext(VP[vpName]);
  await ctx.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", t); if (!sessionStorage.getItem("skin-init")) { sessionStorage.setItem("skin-init", "1"); localStorage.removeItem("echelon-chart-settings"); localStorage.removeItem("echelon-chart-side") } localStorage.setItem("echelon-chart-tf", "5m"); }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { note("PAGEERROR " + e.message); fails.push(`${vpName} pageerror: ${e.message}`) });
  page.on("dialog", (d) => d.dismiss());
  await open(page);
  const tag = `${vpName}-${theme}`;

  // 1. the chrome sits on the same side as the canvas
  let sk = await skin(page);
  check(sk.skin === "dark" && sk.panel === "#131722" && sk.bar === rgb("#131722") && sk.foot === rgb("#131722") && sk.bgNow === "#131722", `dark by default: skin ${sk.skin}, panel ${sk.panel}, bar ${sk.bar}, canvas ${sk.bgNow} (pixel ${sk.px} under the session shade)`);
  await page.screenshot({ path: `${OUT}/${tag}-chart.png` });

  if (vpName !== "phone") {
    // 2. the sidebar folds with a transition, the stage grows, the canvas repaints at the new width
    const g0 = await geo(page);
    check(g0.side > 100 && !g0.hid, `sidebar open at ${Math.round(g0.side)}px`);
    await page.click("#ch-side");
    await page.waitForTimeout(140);
    const gMid = await geo(page);
    await page.waitForTimeout(700);
    const g1 = await geo(page);
    check(gMid.side > 0 && gMid.side < g0.side, `sidebar animates (mid ${Math.round(gMid.side)}px of ${Math.round(g0.side)})`);
    check(g1.side === 0 && g1.hid && g1.stage - g0.stage > g0.side * 0.9, `sidebar folded: stage ${Math.round(g0.stage)} to ${Math.round(g1.stage)}px`);
    check(g1.canvas === Math.round(g1.stageClient * g1.dpr), `canvas repainted at the new width (${g1.canvas} = ${g1.stageClient} x ${g1.dpr})`);
    check(await page.evaluate(() => document.getElementById("ch-side").getAttribute("aria-pressed") === "true" && localStorage.getItem("echelon-chart-side") === "1"), "fold state saved");
    await page.screenshot({ path: `${OUT}/${tag}-side-hidden.png` });
    // 3. it stays folded on the next visit, and unfolds from the same button
    await page.reload({ waitUntil: "domcontentloaded" });
    await open(page);
    const g2 = await geo(page);
    check(g2.side === 0 && g2.hid, "still folded after a reload");
    await page.click("#ch-side"); await page.waitForTimeout(700);
    const g3 = await geo(page);
    check(Math.abs(g3.side - g0.side) < 2 && !g3.hid, `unfolded to ${Math.round(g3.side)}px`);
  } else {
    check(await page.evaluate(() => getComputedStyle(document.getElementById("ch-side")).display === "none"), "no sidebar button on a phone");
  }

  // 4. settings: no presets, tabs, footer
  await page.click("#ch-settings-btn"); await page.waitForTimeout(350);
  const dlg = await page.evaluate(() => ({ open: !document.getElementById("ch-menu").hidden, title: document.getElementById("ch-menu-title").textContent, presets: document.querySelectorAll(".ch-preset").length, tabs: [...document.querySelectorAll(".ch-dlg-nav button[data-t]")].map((b) => b.textContent), reset: !!document.getElementById("ch-set-reset"), done: document.querySelector(".ch-dlg-foot .ok")?.textContent, pills: document.querySelectorAll("#ch-menu-body .ch-cbtn").length, caps: [...document.querySelectorAll("#ch-menu-body .ch-h")].some((h) => getComputedStyle(h).textTransform === "uppercase") }));
  check(dlg.open && dlg.title === "Settings" && dlg.presets === 0 && dlg.tabs.join("|") === "Symbol|Canvas|Scales and lines|Volume|Drawing" && dlg.reset && dlg.done === "Done" && dlg.pills > 10 && !dlg.caps, `settings: no presets, tabs ${dlg.tabs.join(", ")}, ${dlg.pills} colour pills, Done`);
  await page.screenshot({ path: `${OUT}/${tag}-settings.png` });

  // 5. a colour pill opens the picker inside the dialog; swatch, hex, any colour, default
  await page.click('#ch-menu-body .ch-cbtn[data-key="up"]'); await page.waitForTimeout(250);
  const pk = await page.evaluate(() => { const p = document.getElementById("ch-cpick"), m = document.getElementById("ch-menu").getBoundingClientRect(), r = p.getBoundingClientRect(); return { open: !p.hidden, inside: r.left >= m.left - 1 && r.right <= m.right + 1 && r.top >= m.top - 1 && r.bottom <= m.bottom + 1, swatches: p.querySelectorAll(".g button").length, vp: r.left >= 0 && r.right <= innerWidth }; });
  check(pk.open && pk.inside && pk.swatches === 48 && pk.vp, `picker opens inside the dialog with ${pk.swatches} swatches`);
  await page.screenshot({ path: `${OUT}/${tag}-picker.png` });
  await page.click('#ch-cpick .g button[data-c="#2962ff"]'); await page.waitForTimeout(250);
  let s = await page.evaluate(() => ({ up: window.__CH.s.up, pill: document.querySelector('#ch-menu-body .ch-cbtn[data-key="up"] .hx').textContent, saved: JSON.parse(localStorage.getItem("echelon-chart-settings") || "{}").up, on: document.querySelector('#ch-cpick .g button.on')?.dataset.c, hex: document.querySelector("#ch-cpick .hex").value }));
  check(s.up === "#2962ff" && s.pill === "#2962FF" && s.saved === "#2962ff" && s.on === "#2962ff" && s.hex === "#2962FF", `swatch sets the up body: ${s.up}, pill ${s.pill}`);
  await page.fill("#ch-cpick .hex", "#00c853"); await page.waitForTimeout(200);
  s = await page.evaluate(() => ({ up: window.__CH.s.up, pill: document.querySelector('#ch-menu-body .ch-cbtn[data-key="up"] .hx').textContent }));
  check(s.up === "#00c853" && s.pill === "#00C853", `typed hex sets it live: ${s.up}`);
  await page.evaluate(() => { const i = document.querySelector("#ch-cpick .nat input"); i.value = "#ab47bc"; i.dispatchEvent(new Event("input", { bubbles: true })); }); await page.waitForTimeout(150);
  check(await page.evaluate(() => window.__CH.s.up === "#ab47bc"), "the spectrum input sets any colour");
  await page.click("#ch-cpick .rs"); await page.waitForTimeout(200);
  s = await page.evaluate(() => ({ up: window.__CH.s.up, auto: document.querySelector('#ch-menu-body .ch-cbtn[data-key="up"]').classList.contains("auto"), pill: document.querySelector('#ch-menu-body .ch-cbtn[data-key="up"] .hx').textContent, rs: document.querySelector("#ch-cpick .rs").disabled }));
  check(s.up === "" && s.auto && s.pill === "Auto" && s.rs, "Default clears it back to the theme");
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  check(await page.evaluate(() => document.getElementById("ch-cpick").hidden && !document.getElementById("ch-menu").hidden), "Escape closes the picker, the dialog stays");

  // 6. switch and segment
  const wicks = await page.evaluate(() => { const r = [...document.querySelectorAll("#ch-menu-body .ch-row")].find((x) => x.querySelector(".ch-row-t")?.firstChild?.textContent === "Wicks"); const t = r.querySelector(".tgl.sm .track"); t.click(); const a = window.__CH.s.wicks; const bg = getComputedStyle(t).backgroundColor; t.click(); return { a, b: window.__CH.s.wicks, bg, on: getComputedStyle(t).backgroundColor }; });
  check(wicks.a === false && wicks.b === true && wicks.on === rgb("#c9a24a"), `pill switch toggles wicks (off then on, accent ${wicks.on})`);
  const seg = await page.evaluate(() => { const r = [...document.querySelectorAll("#ch-menu-body .ch-row")].find((x) => x.querySelector(".ch-row-t")?.firstChild?.textContent === "Body width"); const sg = r.querySelector(".seg"); sg.querySelectorAll("button")[2].click(); const i = sg.style.getPropertyValue("--i"), n = sg.style.getPropertyValue("--n"), tf = getComputedStyle(sg, "::before").transform; const v = window.__CH.s.bodyW; sg.querySelectorAll("button")[1].click(); return { v, i, n, tf, back: window.__CH.s.bodyW, i2: sg.style.getPropertyValue("--i") }; });
  check(seg.v === "wide" && seg.i === "2" && seg.n === "3" && seg.tf !== "none" && seg.back === "normal" && seg.i2 === "1", `segment thumb slides: wide (cell ${seg.i} of ${seg.n}) then normal`);

  // 7. Canvas tab: a light background flips the whole chrome
  await page.click('.ch-dlg-nav button[data-t="Canvas"]'); await page.waitForTimeout(250);
  check(await page.evaluate(() => document.getElementById("ch-menu-body").classList.contains("sw") && !document.querySelector('#ch-menu-body .ch-cbtn[data-key="bg"]').hidden), "Canvas tab shows with the crossfade");
  await page.click('#ch-menu-body .ch-cbtn[data-key="bg"]'); await page.waitForTimeout(200);
  await page.click('#ch-cpick .g button[data-c="#ffffff"]'); await page.waitForTimeout(400);
  sk = await skin(page);
  check(sk.skin === "light" && sk.panel === "#ffffff" && sk.bar === rgb("#ffffff") && sk.menu === rgb("#ffffff") && sk.bgNow === "#ffffff", `light background flips the chrome: skin ${sk.skin}, bar ${sk.bar}, dialog ${sk.menu}`);
  await page.screenshot({ path: `${OUT}/${tag}-settings-light.png` });
  await page.click("#ch-cpick .rs"); await page.waitForTimeout(400);
  sk = await skin(page);
  check(sk.skin === "dark" && sk.bar === rgb("#131722"), "and back to dark on Default");
  // 8. the accent is a colour too
  await page.click('#ch-menu-body .ch-cbtn[data-key="accentC"]'); await page.waitForTimeout(200);
  await page.click('#ch-cpick .g button[data-c="#ff9800"]'); await page.waitForTimeout(350);
  const ac = await page.evaluate(() => ({ acc: document.getElementById("v-chart").style.getPropertyValue("--acc"), ink: document.getElementById("v-chart").style.getPropertyValue("--acc-ink"), done: getComputedStyle(document.querySelector(".ch-dlg-foot .ok")).backgroundColor, nav: getComputedStyle(document.querySelector(".ch-dlg-nav button[data-t].on"), "::before").backgroundColor, tf: getComputedStyle(document.querySelector("#ch-tf button.on")).color }));
  check(ac.acc === "#ff9800" && ac.ink === "#14110a" && ac.done === rgb("#ff9800") && (vpName === "phone" || ac.nav === rgb("#ff9800")) && ac.tf === rgb("#ff9800"), `accent recolours the chrome: Done ${ac.done}, active timeframe ${ac.tf}`);
  await page.screenshot({ path: `${OUT}/${tag}-accent.png` });
  await page.click("#ch-cpick .rs"); await page.waitForTimeout(300);
  check(await page.evaluate(() => document.getElementById("v-chart").style.getPropertyValue("--acc") === "" && getComputedStyle(document.querySelector("#ch-tf button.on")).color === "rgb(201, 162, 74)"), "accent back to gold");

  // 9. Done plays the dialog out
  await page.click(".ch-dlg-foot .ok"); await page.waitForTimeout(40);
  const out = await page.evaluate(() => document.getElementById("ch-menu").classList.contains("out") && !document.getElementById("ch-menu").hidden);
  await page.waitForTimeout(300);
  check(out && await page.evaluate(() => document.getElementById("ch-menu").hidden && document.getElementById("ch-scrim").hidden), "Done plays the dialog out, then hides it");

  // 10. the other dialogs share the skin
  await page.click("#ch-ind-btn"); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${tag}-indicators.png` });
  await page.evaluate(() => window.__CH.$.menu("ind:lit")); await page.waitForTimeout(400);
  const lit = await page.evaluate(() => ({ pills: document.querySelectorAll("#ch-menu-body .ch-prow .ch-cbtn").length, tgl: document.querySelectorAll("#ch-menu-body .ch-prow .tgl").length }));
  check(lit.pills >= 20 && lit.tgl >= 20, `D1 LIT parts: ${lit.pills} colour pills, ${lit.tgl} switches`);
  await page.screenshot({ path: `${OUT}/${tag}-lit.png` });
  await page.click("#ch-menu-close"); await page.waitForTimeout(300);
  if (vpName !== "phone") { await page.click("#ch-type-btn"); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${tag}-type.png` }); await page.keyboard.press("Escape"); await page.waitForTimeout(300); }

  await ctx.close();
}

for (const vp of (process.env.VIEWPORTS || "desk,wide,phone").split(",")) await run(vp.trim());
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join("\n- ")}` : "\nall ok");
process.exit(fails.length ? 1 : 0);
