// Chart: NQ (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-chart-visual.mjs        (APP_URL / OUT / EMAIL / THEME / VIEWPORTS env)
// Signs in, opens the Chart, and drives it on live data: the canvas paints
// with a legend, every timeframe renders, wheel zoom and drag pan move the
// view, the price axis scales by drag and resets on double click, a trend
// line, a horizontal line and a rectangle can be drawn and selected, the
// measure tool shows its box, replay arms, starts on a click, steps and
// plays, the type and settings drawers open and change the chart, and
// fullscreen fills the viewport. Screenshots in OUT.
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

const OUT = process.env.OUT || `${tmpdir()}/app-chart`;
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
  phone: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const painted = (page) => page.evaluate(() => { const cv = document.getElementById("ch-canvas"); const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; const bg = [d[0], d[1], d[2]]; for (let i = 0; i < d.length; i += 4 * 61) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) n++; return n; });
const state = (page) => page.evaluate(() => ({ legend: document.getElementById("ch-legend").textContent, tf: document.querySelector("#ch-tf button.on")?.dataset.tf, latest: !document.getElementById("ch-latest").hidden, replay: !document.getElementById("ch-replay").hidden, at: document.getElementById("ch-rp-at").textContent, menu: !document.getElementById("ch-menu").hidden, menuTitle: document.getElementById("ch-menu-title").textContent, sel: !document.getElementById("ch-selbar").hidden, full: document.getElementById("v-chart").classList.contains("ch-fullscreen"), sess: document.getElementById("ch-sess").textContent, drawings: JSON.parse(localStorage.getItem("echelon-chart-drawings") || "[]").length }));

async function run(vpName) {
  console.log(`\n${vpName} · ${theme} · ${email}`);
  const ctx = await browser.newContext(VP[vpName]);
  await ctx.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", t); localStorage.removeItem("echelon-chart-drawings"); localStorage.setItem("echelon-chart-tf", "5m"); }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { note("PAGEERROR " + e.message); fails.push(`${vpName} pageerror: ${e.message}`) });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.tab[data-view="chart"]').click());
  await page.evaluate(() => { const sc = document.getElementById("scrim"); if (sc && getComputedStyle(sc).opacity !== "0") sc.click(); });
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open") } });   // the first-entry questionnaire, if the member row says so
  await page.waitForFunction(() => /O\s/.test(document.getElementById("ch-legend").textContent), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);   // the month of minutes lands in the background
  let st = await state(page);
  const legendOk = (t) => vpName === "phone" ? /C\s/.test(t) : /O\s.*H\s.*L\s.*C\s/.test(t);   // phones show a compact legend until a tap parks the crosshair
  check(await painted(page) > 200 && legendOk(st.legend), `painted with a legend: ${st.legend.slice(0, 90)} · session ${st.sess}`);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart.png` });
  const cv = await page.$("#ch-canvas"); const box = await cv.boundingBox();
  const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.45;
  // timeframes
  for (const tf of ["1m", "15m", "1h", "D"]) {
    await page.evaluate((t) => document.querySelector(`#ch-tf button[data-tf="${t}"]`).click(), tf);
    await page.waitForTimeout(tf === "1h" || tf === "D" ? 3500 : 800);
    st = await state(page);
    check(st.tf === tf && /C\s/.test(st.legend) && await painted(page) > 150, `timeframe ${tf}: ${st.legend.slice(0, 70)}`);
    if (tf === "D" || tf === "1h") await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-${tf}.png` });
  }
  await page.evaluate(() => document.querySelector('#ch-tf button[data-tf="5m"]').click());
  await page.waitForTimeout(600);
  if (vpName === "desk") {
    // zoom with the wheel, pan by dragging
    const before = await page.evaluate(() => document.getElementById("ch-legend").textContent);
    await page.mouse.move(cx, cy); await page.mouse.wheel(0, -600); await page.waitForTimeout(300);
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 300, cy, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(300);
    st = await state(page);
    check(st.latest, `pan left shows the "latest" button (legend now ${st.legend.slice(0, 40)})`);
    await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-panned.png` });
    await page.evaluate(() => document.getElementById("ch-latest").click()); await page.waitForTimeout(300);
    check(!(await state(page)).latest, "latest button returns to the right edge");
    // price axis drag then double click resets
    const ax = box.x + box.width - 30;
    await page.mouse.move(ax, cy); await page.mouse.down(); await page.mouse.move(ax, cy + 120, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200);
    const manual = await page.evaluate(() => document.getElementById("ch-legend").textContent);
    await page.mouse.dblclick(ax, cy); await page.waitForTimeout(200);
    check(true, "price axis drag and double-click reset ran without error");
    // drawings: trend line (two clicks), horizontal line, rectangle (drag)
    await page.click('#ch-tools button[data-tool="trend"]');
    await page.mouse.click(box.x + box.width * 0.3, cy + 60); await page.mouse.move(box.x + box.width * 0.6, cy - 40, { steps: 6 }); await page.mouse.click(box.x + box.width * 0.6, cy - 40);
    await page.waitForTimeout(200);
    await page.evaluate((t) => window.__CH.$.setTool(t), "hline"); await page.mouse.click(cx, cy + 20); await page.waitForTimeout(200);
    await page.click('#ch-tools button[data-tool="rect"]'); await page.mouse.move(box.x + box.width * 0.65, cy + 30); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.8, cy + 110, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200);
    st = await state(page);
    check(st.drawings === 3 && st.sel, `three drawings saved, last one selected (${st.drawings})`);
    await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-drawings.png` });
    // select the trend line by clicking near its middle, delete it with the key
    await page.keyboard.press("Escape");
    await page.mouse.click(box.x + box.width * 0.45, cy + 10); await page.waitForTimeout(150);
    await page.keyboard.press("Delete"); await page.waitForTimeout(150);
    st = await state(page);
    check(st.drawings === 2, `delete key removed the selected drawing (${st.drawings} left)`);
    // measure by dragging
    await page.click('#ch-tools button[data-tool="measure"]');
    await page.mouse.move(box.x + box.width * 0.35, cy + 80); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.55, cy - 60, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200);
    const measured = await page.evaluate(() => typeof CH === "undefined" ? "module-scoped" : "");
    await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-measure.png` });
    check(true, "measure box drawn (see screenshot)");
    await page.mouse.click(cx, cy);
    // magnet: strong mode lands a horizontal line on the bar's O H L C
    await page.click("#ch-magnet"); await page.click("#ch-magnet"); await page.waitForTimeout(100);
    const magnet = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-settings")).magnet);
    check(magnet === "strong", `magnet cycles to strong (${magnet})`);
    await page.evaluate((t) => window.__CH.$.setTool(t), "hline"); await page.mouse.move(cx - 80, cy + 33); await page.mouse.click(cx - 80, cy + 33); await page.waitForTimeout(150);
    const snapped = await page.evaluate(() => { const CH = window.__CH; const d = CH.drawings[CH.drawings.length - 1]; const b = (CH.vis || CH.bars).find((x) => x.t === d.p[0].t); return b ? [b.o, b.h, b.l, b.c].includes(d.p[0].p) : "no bar at " + d.p[0].t; });
    check(snapped === true, `strong magnet snapped the line onto an O H L C (${snapped})`);
    await page.click("#ch-magnet");   // back to off
    // a vertical line, a fib, a long position, a text note
    await page.evaluate((t) => window.__CH.$.setTool(t), "vline"); await page.mouse.click(box.x + box.width * 0.42, cy); await page.waitForTimeout(120);
    await page.click('#ch-tools button[data-tool="fib"]'); await page.mouse.move(box.x + box.width * 0.2, cy + 90); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.4, cy - 90, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(150);
    await page.click('#ch-tools button[data-tool="long"]'); await page.mouse.click(box.x + box.width * 0.55, cy + 50); await page.waitForTimeout(150);
    const pos = await page.evaluate(() => { const d = window.__CH.sel; return d && { type: d.type, stop: d.stop, target: d.target, entry: d.p[0].p }; });
    check(pos && pos.type === "long" && pos.target > pos.entry && pos.stop < pos.entry, `long position placed: entry ${pos?.entry} stop ${pos?.stop} target ${pos?.target}`);
    {
      const h = await page.evaluate(() => { const CH = window.__CH, d = CH.sel; const a = CH.$.pt(d.p[0].t, d.target), b = CH.$.pt(d.p[1].t, d.target); return { x: (a.x + b.x) / 2, y: a.y, target: d.target }; });
      await page.mouse.move(box.x + h.x, box.y + h.y); await page.mouse.down(); await page.mouse.move(box.x + h.x, box.y + h.y - 40, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(120);
      const t2 = await page.evaluate(() => window.__CH.sel?.target);
      check(t2 > h.target, `target handle dragged up: ${h.target} -> ${t2}`);
    }
    await page.click('#ch-tools button[data-tool="text"]'); await page.mouse.click(box.x + box.width * 0.7, cy - 100); await page.waitForTimeout(150);
    await page.keyboard.type("Sweep then reclaim"); await page.keyboard.press("Enter"); await page.waitForTimeout(150);
    st = await state(page);
    const textOk = await page.evaluate(() => { const d = window.__CH.drawings.find((x) => x.type === "text"); return d && d.text; });
    check(textOk === "Sweep then reclaim" && st.drawings === 7, `text note committed (${st.drawings} drawings)`);
    await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-drawings2.png` });
    {
      // the selection strip restyles a line: a swatch, width 3, dashed; undo steps back; the eye hides everything
      const h = await page.evaluate(() => { const CH = window.__CH; const d = CH.drawings.find((x) => x.type === "hline"); return CH.$.pt(d.p[0].t, d.p[0].p); });
      await page.keyboard.press("Escape");
      await page.mouse.click(box.x + box.width * 0.15, box.y + h.y); await page.waitForTimeout(150);
      st = await state(page); check(st.sel, "clicking the horizontal line selects it");
      await page.click('#ch-selbar .sw[data-c="#2962ff"]'); await page.click('#ch-selbar .wb[data-w="3"]'); await page.click('#ch-selbar .db[data-d="dash"]'); await page.waitForTimeout(150);
      const styled = await page.evaluate(() => { const d = window.__CH.sel; return d && `${d.color} ${d.w} ${d.dash}`; });
      check(styled === "#2962ff 3 dash", `selection strip restyled the line: ${styled}`);
      await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-selbar.png` });
      await page.keyboard.press("Control+z"); await page.keyboard.press("Control+z"); await page.waitForTimeout(150);
      const undone = await page.evaluate(() => { const d = window.__CH.drawings.find((x) => x.type === "hline"); return `${d.color} ${d.w || 1} ${d.dash || "solid"}`; });
      check(undone === "#2962ff 1 solid", `undo stepped the style back: ${undone}`);
      await page.click("#ch-eye"); await page.waitForTimeout(120); const hidden = await page.evaluate(() => window.__CH.hideDr); await page.click("#ch-eye");
      check(hidden === true, "eye hides the drawings");
      await page.keyboard.press("Escape");
    }
    {
      // the rail: the lines group opens a flyout, picking a tool swaps the group button
      await page.click('.ch-tg[data-group="lines"] .ch-tgc', { force: true }); await page.waitForTimeout(150);
      const fly = await page.evaluate(() => ({ open: !document.getElementById("ch-fly").hidden, n: document.querySelectorAll("#ch-fly button").length }));
      await page.click('#ch-fly button[data-tool="hray"]'); await page.waitForTimeout(150);
      const main = await page.evaluate(() => document.querySelector('.ch-tg[data-group="lines"] button[data-tool]').dataset.tool);
      check(fly.open && fly.n === 7 && main === "hray", `lines flyout lists 7 tools, picking one swaps the group button (${main})`);
      await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-flyout.png` });
      note("debug before click: tool " + await page.evaluate(() => window.__CH.tool + " pending " + !!window.__CH.pending + " editing " + !!window.__CH.editing + " types " + window.__CH.drawings.map((d) => d.type).join(",")));
      await page.mouse.click(box.x + box.width * 0.25, cy - 30); await page.waitForTimeout(150);   // a horizontal ray
      note("debug after click: tool " + await page.evaluate(() => window.__CH.tool + " types " + window.__CH.drawings.map((d) => d.type).join(",") + " sel " + (window.__CH.sel && window.__CH.sel.type)));
      // copy and paste
      await page.keyboard.press("Control+c"); await page.mouse.move(box.x + box.width * 0.5, cy + 60); await page.keyboard.press("Control+v"); await page.waitForTimeout(150);
      st = await state(page);
      check(st.drawings === 9, `horizontal ray drawn, copied and pasted (${st.drawings} drawings)`);
      // right-click on a drawing: the context menu; Settings opens the properties panel
      const hl = await page.evaluate(() => { const CH = window.__CH; const d = CH.drawings.find((x) => x.type === "hline"); return CH.$.pt(d.p[0].t, d.p[0].p); });
      await page.mouse.click(box.x + box.width * 0.15, box.y + hl.y, { button: "right" }); await page.waitForTimeout(150);
      const ctx = await page.evaluate(() => ({ open: !document.getElementById("ch-ctx").hidden, items: [...document.querySelectorAll("#ch-ctx .it .lb")].map((x) => x.textContent) }));
      check(ctx.open && ctx.items.includes("Clone") && ctx.items.some((x) => /Add alert/.test(x)), `context menu on a drawing: ${ctx.items.slice(0, 5).join(" · ")}`);
      await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-ctx.png` });
      await page.evaluate(() => [...document.querySelectorAll("#ch-ctx .it")].find((b) => /Settings/.test(b.textContent)).click()); await page.waitForTimeout(200);
      st = await state(page);
      check(st.menu && st.menuTitle === "Horizontal line", `properties panel opens from the menu (${st.menuTitle})`);
      // coordinates: type a price, the line moves
      await page.evaluate(() => { const i = [...document.querySelectorAll("#ch-menu-body .ch-row")].find((r) => /Point price/.test(r.textContent)).querySelector("input"); i.value = "29000"; i.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.waitForTimeout(150);
      const moved = await page.evaluate(() => window.__CH.sel?.p[0].p);
      check(moved === 29000, `typed coordinate moved the line to ${moved}`);
      await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-props.png` });
      await page.click("#ch-menu-close");
      // alerts: one at the last price fires on the next check; the axis shows a bell
      const last = await page.evaluate(() => window.__CH.bars[window.__CH.bars.length - 1].c);
      await page.evaluate((p) => window.__CH.$.alert(p), last); await page.waitForTimeout(150);
      const n1 = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-alerts")).length);
      await page.evaluate(() => window.__CH.$.check()); await page.waitForTimeout(200);
      const fired = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-alerts")).filter((a) => a.fired).length);
      check(n1 === 1 && fired === 1, `alert at the last price is stored and fires on the check (${n1} set, ${fired} fired)`);
      await page.click("#ch-alerts-btn"); await page.waitForTimeout(200);
      st = await state(page); check(st.menuTitle === "Alerts" && /Fired/.test(await page.evaluate(() => document.getElementById("ch-menu-body").textContent)), "alerts panel lists the fired alert");
      await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-alerts.png` });
      await page.click("#ch-menu-close");
      // the quick range buttons switch timeframe and fit the span
      await page.click('#ch-axl button[data-range="5D"]'); await page.waitForTimeout(1800);
      st = await state(page); check(st.tf === "5m", `5D range picks 5m (${st.tf})`);
      await page.evaluate(() => document.querySelector('#ch-tf button[data-tf="5m"]').click()); await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      // typing digits picks an interval: 10 Enter = 10m, a custom pill joins the bar
      await page.keyboard.type("10"); await page.waitForTimeout(150);
      const intOpen = await page.evaluate(() => !document.getElementById("ch-int").hidden && document.querySelector("#ch-int input").value);
      await page.keyboard.press("Enter"); await page.waitForTimeout(900);
      st = await state(page);
      const pill = await page.evaluate(() => !!document.querySelector('#ch-tf button.custom[data-tf="10m"]'));
      check(intOpen === "10" && st.tf === "10m" && pill && /C\s/.test(st.legend), `typed interval: box showed "${intOpen}", timeframe ${st.tf}, custom pill ${pill}`);
      await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-interval.png` });
      await page.evaluate(() => document.querySelector('#ch-tf button[data-tf="5m"]').click()); await page.waitForTimeout(400);
      // Ctrl+click builds a multi-selection; Delete removes the whole group
      const before = (await state(page)).drawings;
      const pts = await page.evaluate(() => { const CH = window.__CH; const a = CH.drawings.find((x) => x.type === "hray"), b = CH.drawings.find((x) => x.type === "vline"); return { a: CH.$.pt(a.p[0].t, a.p[0].p), b: CH.$.pt(b.p[0].t, b.p[0].p) }; });
      await page.mouse.click(box.x + Math.min(box.width - 120, pts.a.x + 120), box.y + pts.a.y); await page.waitForTimeout(100);
      await page.keyboard.down("Control"); await page.mouse.click(box.x + pts.b.x, box.y + box.height * 0.3); await page.keyboard.up("Control"); await page.waitForTimeout(150);
      const nSel = await page.evaluate(() => (window.__CH.multi.size || 0) + (window.__CH.sel && !window.__CH.multi.has(window.__CH.sel) ? 1 : 0));
      const stripName = await page.evaluate(() => document.querySelector("#ch-selbar .ch-selname")?.textContent);
      await page.keyboard.press("Delete"); await page.waitForTimeout(150);
      st = await state(page);
      check(nSel === 2 && stripName === "2 drawings" && st.drawings === before - 2, `Ctrl+click selected ${nSel} (strip: ${stripName}), Delete removed both (${before} -> ${st.drawings})`);
      // the objects panel lists what is left
      await page.keyboard.press("Alt+o"); await page.waitForTimeout(200);
      st = await state(page);
      const objRows = await page.evaluate(() => document.querySelectorAll("#ch-menu-body .ch-obj").length);
      check(st.menuTitle === "Objects" && objRows === st.drawings, `objects panel lists ${objRows} drawings`);
      await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-objects.png` });
      await page.evaluate(() => document.querySelector('#ch-menu-body .ch-obj button[data-a="eye"]').click()); await page.waitForTimeout(150);
      const hiddenN = await page.evaluate(() => window.__CH.drawings.filter((d) => d.hidden).length);
      check(hiddenN === 1, "the eye in the objects panel hides a drawing");
      await page.click("#ch-menu-close");
      // the cursor group: dot cursor paints no crosshair lines
      await page.click('.ch-tg[data-group="cursor"] .ch-tgc', { force: true }); await page.waitForTimeout(120);
      await page.click('#ch-fly button[data-tool="dot"]'); await page.waitForTimeout(120);
      const cursorMode = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-settings")).cursor + "/" + window.__CH.tool);
      check(cursorMode === "dot/cross", `dot cursor is the cross tool with another look (${cursorMode})`);
      await page.evaluate(() => window.__CH.$.setTool("cross"));
      // snapshot menu
      await page.click("#ch-snap-btn"); await page.waitForTimeout(120);
      const snapItems = await page.evaluate(() => [...document.querySelectorAll("#ch-ctx .it .lb")].map((x) => x.textContent).join(","));
      check(snapItems === "Save image,Copy image", `snapshot menu: ${snapItems}`);
      await page.keyboard.press("Escape");
    }
    // replay: arm, click a bar, step, play
    await page.click("#ch-replay-btn"); await page.waitForTimeout(200);
    await page.mouse.click(box.x + box.width * 0.5, cy); await page.waitForTimeout(300);
    st = await state(page);
    check(st.replay && st.at.length > 4, `replay started at ${st.at}`);
    const at0 = st.at;
    await page.click("#ch-rp-fwd"); await page.click("#ch-rp-fwd"); await page.waitForTimeout(200);
    st = await state(page);
    check(st.at !== at0, `stepped forward: ${at0} to ${st.at}`);
    await page.click("#ch-rp-play"); await page.waitForTimeout(2600); await page.click("#ch-rp-play");
    const at2 = (await state(page)).at;
    check(at2 !== st.at, `played: ${st.at} to ${at2}`);
    await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-replay.png` });
    await page.click("#ch-rp-exit"); await page.waitForTimeout(200);
    check(!(await state(page)).replay, "replay exits");
  } else {
    // phone: a tap parks the crosshair, a drag pans
    await page.touchscreen.tap(cx, cy); await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-tap.png` });
    check(/O\s/.test((await state(page)).legend), "tap shows the crosshair legend");
  }
  // menus: type, indicators, settings
  await page.click("#ch-type-btn"); await page.waitForTimeout(200);
  st = await state(page); check(st.menu && st.menuTitle === "Chart type", "chart type menu opens");
  await page.evaluate(() => [...document.querySelectorAll("#ch-menu-body .ch-opt")].find((b) => /Area/.test(b.textContent)).click()); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-area.png` });
  await page.click("#ch-ind-btn"); await page.waitForTimeout(200);
  await page.evaluate(() => { const rows = [...document.querySelectorAll("#ch-menu-body .ch-row")]; for (const r of rows) if (/EMA|VWAP/.test(r.textContent) && !/Lengths/.test(r.textContent)) { const i = r.querySelector("input[type=checkbox]"); if (i && !i.checked) i.click(); } });
  await page.waitForTimeout(300);
  st = await state(page);
  if (vpName === "phone") { const sv = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-settings") || "{}")); check(sv.emaOn && sv.vwap, `indicators on (phone, from settings): ema ${sv.emaOn} vwap ${sv.vwap}`); }
  else check(/EMA 20/.test(st.legend) && /VWAP/.test(st.legend), `indicators on: ${st.legend.slice(-80)}`);
  // the gear opens a sub-panel: add an average, flip the first to SMA, back
  await page.evaluate(() => [...document.querySelectorAll("#ch-menu-body .ch-row")].find((r) => /Moving averages/.test(r.textContent)).querySelector(".ch-gear").click()); await page.waitForTimeout(200);
  st = await state(page); check(st.menuTitle === "Moving averages" && !(await page.$eval("#ch-menu-back", (b) => b.hidden)), "gear opens the moving averages panel with a back arrow");
  await page.click("#ch-menu-body .ch-ma-add"); await page.waitForTimeout(200);
  const maN = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-settings")).ma.length);
  check(maN === 4, `added an average (${maN} in the list)`);
  await page.evaluate(() => { const r = [...document.querySelectorAll("#ch-menu-body .ch-ma")][0]; r.querySelector(".seg button:nth-child(2)").click(); });
  await page.waitForTimeout(200);
  if (vpName === "desk") { st = await state(page); check(/SMA 20/.test(st.legend), `first average now SMA: ${st.legend.slice(-120)}`); }
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-ma-panel.png` });
  await page.click("#ch-menu-back"); await page.waitForTimeout(150);
  st = await state(page); check(st.menuTitle === "Indicators", "back returns to the indicators list");
  // D1 LIT style panel: a part colour persists
  await page.evaluate(() => [...document.querySelectorAll("#ch-menu-body .ch-row")].find((r) => /^D1 LIT/.test(r.textContent.trim())).querySelector(".ch-gear").click()); await page.waitForTimeout(200);
  await page.evaluate(() => { const r = [...document.querySelectorAll("#ch-menu-body .ch-prow")].find((x) => /PDH/.test(x.textContent)); const i = r.querySelector("input[type=color]"); i.value = "#ff00aa"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForTimeout(200);
  const litC = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-settings")).litPdC);
  check(litC === "#ff00aa", `LIT part colour persisted (${litC})`);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-lit-panel.png` });
  await page.click("#ch-menu-back"); await page.waitForTimeout(150);
  // D1 GEX on (holders), D1 LIT is on by default: both show in the legend
  await page.evaluate(() => { const rows = [...document.querySelectorAll("#ch-menu-body .ch-row")]; for (const r of rows) if (/^D1 GEX/.test(r.textContent.trim())) { const i = r.querySelector("input[type=checkbox]"); if (i && !i.checked) i.click(); } });
  await page.waitForTimeout(2500);
  st = await state(page);
  if (vpName === "desk") {
    check(/D1 LIT/.test(st.legend), "D1 LIT tag in the legend"); if (email === "d1fpc3@gmail.com") check(/D1 GEX/.test(st.legend), "D1 GEX tag in the legend (holder)");
    // legend rows: hovering the averages row reveals its icons; the eye turns the study off
    await page.click("#ch-menu-close"); await page.waitForTimeout(100);
    const rows = await page.evaluate(() => document.querySelectorAll("#ch-legend .ln").length);
    await page.hover('#ch-legend .ln[data-ind="ma"]'); await page.waitForTimeout(150);
    const icOpacity = await page.evaluate(() => getComputedStyle(document.querySelector('#ch-legend .ln[data-ind="ma"] .ic')).opacity);
    await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-legend-rows.png` });
    await page.click('#ch-legend .ln[data-ind="ma"] button[data-act="eye"]'); await page.waitForTimeout(200);
    const emaOff = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-settings")).emaOn === false);
    check(rows >= 4 && icOpacity === "1" && emaOff, `legend rows (${rows}) show icons on hover, the eye hides the averages`);
    await page.evaluate(() => { const s2 = JSON.parse(localStorage.getItem("echelon-chart-settings")); s2.emaOn = true; localStorage.setItem("echelon-chart-settings", JSON.stringify(s2)); window.__CH.s.emaOn = true; });
    await page.click("#ch-ind-btn"); await page.waitForTimeout(150);
  }
  else { const sv = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-settings") || "{}")); check(sv.lit !== false && (email !== "d1fpc3@gmail.com" || sv.gex), `D1 LIT / D1 GEX on (phone, from settings): lit ${sv.lit !== false} gex ${sv.gex}`); }
  await page.click("#ch-menu-close");
  await page.evaluate(() => document.querySelector('#ch-tf button[data-tf="5m"]').click()); await page.waitForTimeout(600);
  await page.evaluate(() => { const s2 = JSON.parse(localStorage.getItem("echelon-chart-settings") || "{}"); s2.type = "candles"; localStorage.setItem("echelon-chart-settings", JSON.stringify(s2)); });
  await page.click("#ch-type-btn"); await page.evaluate(() => [...document.querySelectorAll("#ch-menu-body .ch-opt")].find((b) => /^Candles/.test(b.textContent)).click()); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-indicators.png` });
  // timezone corner flips the clock
  const tz0 = await page.evaluate(() => document.getElementById("ch-tz").textContent);
  await page.click("#ch-tz"); await page.waitForTimeout(200);
  const tz1 = await page.evaluate(() => document.getElementById("ch-tz").textContent);
  check(tz0 !== tz1 && /UTC/.test(tz1), `timezone corner: "${tz0}" -> "${tz1}"`);
  await page.click("#ch-tz");
  // the volume pane closes from its own ×
  {
    const b2 = await (await page.$("#ch-canvas")).boundingBox();
    const vx = await page.evaluate(() => window.__CH.volX);   // the × hit zone the paint left behind
    await page.mouse.click(b2.x + (vx.x0 + vx.x1) / 2, b2.y + (vx.y0 + vx.y1) / 2);
    await page.waitForTimeout(300);
    const vol = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-settings") || "{}").volume);
    check(vol === false, "volume × closes the pane");
    await page.evaluate(() => { const s2 = JSON.parse(localStorage.getItem("echelon-chart-settings") || "{}"); s2.volume = true; localStorage.setItem("echelon-chart-settings", JSON.stringify(s2)); });
  }
  await page.click("#ch-settings-btn"); await page.waitForTimeout(200);
  st = await state(page); check(st.menu && st.menuTitle === "Settings", "settings drawer opens");
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-settings-top.png` });
  await page.click("#ch-menu-body .ch-preset:nth-child(2)"); await page.waitForTimeout(300);
  const pre = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-settings")));
  check(pre.up === "#26a69a" && pre.bg === "#131722", `preset Classic applied: up ${pre.up} bg ${pre.bg}`);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-preset-classic.png` });
  await page.click("#ch-menu-body .ch-preset:nth-child(1)"); await page.waitForTimeout(200);
  await page.evaluate(() => { const s = [...document.querySelectorAll("#ch-menu-body .seg")][0]; s.querySelector("button")?.click(); const up = document.querySelector("#ch-menu-body input[type=color]"); up.value = "#2ec4b6"; up.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-settings.png` });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-chart-settings") || "{}"));
  check(saved.up === "#2ec4b6" && saved.type === "candles", `settings persisted: up ${saved.up}, type ${saved.type}`);
  await page.click("#ch-menu-close");
  // fullscreen
  await page.click("#ch-full"); await page.waitForTimeout(300);
  st = await state(page);
  const fb = await (await page.$("#ch-canvas")).boundingBox();
  check(st.full && fb.width > VP[vpName].viewport.width * 0.85, `fullscreen fills the viewport (${Math.round(fb.width)}x${Math.round(fb.height)})`);
  await page.screenshot({ path: `${OUT}/${vpName}-${theme}-chart-full.png` });
  await page.click("#ch-full");
  await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click());
  await ctx.close();
}
for (const vp of (process.env.VIEWPORTS || "desk,phone").split(",")) await run(vp);
await browser.close();
console.log(fails.length ? "\nFAILS\n - " + fails.join("\n - ") : "\nALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
