// The backtester (D1, 2026-10-01: "the best backtesting platform, so easy to use people rely on it"; round two: "way more
// smooth ... just straight backtest and draw ... if gex levels cant be pulled for that day dont offer the indicator").
// Manual, not a node:test.   node tests/app-backtest-visual.mjs        (APP_URL / OUT / ONLY=desk,iphone env)
// Runs as appreview@ (test account) on real archive data and deletes every session it made at the end. Desk (1440):
//  the Backtest tab goes straight into a random session on the chart (no form) -> Pick a day from the panel swaps it for
//  2026-09-15 (the empty random one is dropped) -> D1 GEX is offered (that day has a print) -> playback runs the clock
//  continuously and the forming candle grows -> a trendline drawn in the session is the session's own -> a market buy
//  rides to its stop or target, checked against an independent walk of the database's minutes along the same path ->
//  tag it -> S sells, the stop is dragged, C closes -> a limit from the right-click menu, cancelled -> Finish -> the
//  report -> the live chart has its own drawings back -> the numbers page -> prop rules fail on a max loss -> the stats
//  button opens the numbers page and the tab goes back to the session -> New day keeps the traded session finished ->
//  an empty session leaves without a trace -> the tab resumes a session left half way, position and drawings -> the
//  daily drill from Today starts straight away, hides the date and does not offer D1 GEX (no print that far back).
// iPhone (WebKit): the tab goes straight in, the session tools fit, Buy, the inline Close, Finish, the report.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/app-backtest`; mkdirSync(OUT, { recursive: true });
const APP = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = async (q) => { const r = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) })).json(); if (!Array.isArray(r)) throw new Error("sql: " + JSON.stringify(r).slice(0, 300)); return r; };
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
async function mint(email) {
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
  const s = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
  if (!s.access_token) throw new Error("verify failed"); return s;
}
const fails = []; const ok = (c, w) => { console.log((c ? "  ok   " : "  FAIL ") + w); if (!c) fails.push(w); };
const [{ id: ME }] = await sql(`select id from auth.users where email = 'appreview@d1fpc3.com'`);
const cleanup = () => sql(`delete from bt_sessions where user_id = '${ME}'`);
await cleanup();
const DAY = "2026-09-15";

async function open(tag) {
  const desk = tag === "desk"
  const browser = await (desk ? chromium : webkit).launch();
  const ctx = await browser.newContext(desk ? { viewport: { width: 1440, height: 900 } } : { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const session = await mint("appreview@d1fpc3.com");
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-push-ask", String(Date.now() + 9e11)); localStorage.setItem("echelon-chart-tf", "5m"); localStorage.setItem("echelon-bt-cfg", JSON.stringify({ sym: "NQ", mode: "random", start: "ny", bal: 50000, qty: 1, bracket: true, sl: 20, tp: 40, fee: 0, slip: 0, blind: false, prop: false })); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (/warn|error/.test(m.type())) console.log("    console:", m.text().slice(0, 200)) })
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { timeout: 30000 });
  await page.evaluate(() => { new MutationObserver(() => { const t = document.getElementById("co-toast"); if (t && t.textContent && t.textContent !== window.__lastToast) { window.__lastToast = t.textContent; console.warn("toast: " + t.textContent) } }).observe(document.body, { childList: true, subtree: true, characterData: true }) }).catch(() => {})
  await page.waitForTimeout(1500);
  return { browser, page, errors };
}
const st = (page) => page.evaluate(() => { const s = window.__bt.state(); return s && JSON.parse(JSON.stringify(s)) });
const stepUntil = async (page, cond, max = 80) => { for (let i = 0; i < max; i++) { const s = await st(page); if (cond(s)) return s; await page.evaluate(() => window.__bt.step()); await page.waitForTimeout(40) } return st(page) };
const waitNew = (page, old) => page.waitForFunction((o) => { const s = window.__bt.state(); return s && s.id && s.id !== o && document.getElementById("bt-loading").hidden }, old, { timeout: 30000 });
async function finish(page) {
  await page.click("#ch-rp-exit");
  await page.waitForSelector("#cfmodal:not([hidden])", { timeout: 8000 });
  await page.click("#cf-yes");
  await page.waitForSelector("#bt-report.on", { timeout: 20000 });
  await page.waitForTimeout(500);
}
async function indMenuHasGex(page) {
  await page.click("#ch-ind-btn"); await page.waitForSelector("#ch-menu:not([hidden])", { timeout: 4000 }); await page.waitForTimeout(200);
  const has = await page.evaluate(() => /D1 GEX/.test(document.getElementById("ch-menu-body").textContent));
  await page.click("#ch-menu-close"); await page.waitForTimeout(150);
  return has;
}
// the engine's exit, walked independently on the database's own minutes: from the entry, each minute's gap from the last
// close to its open, then open -> the adverse extreme -> the other -> close, a third of the minute each; the first level the
// price meets in its direction of travel is the exit (the stop on a tie), at the moment it is met
async function independentExit(tr) {
  const rows = await sql(`select extract(epoch from t)::bigint t, o, h, l, c from nq_bars where symbol = 'NQ' and interval = '1m' and t >= to_timestamp(${tr.entry_t}) and t < to_timestamp(${tr.entry_t + 6 * 3600}) order by t`);
  const meet = (a, b, ta, tb) => { const lo = Math.min(a, b), hi = Math.max(a, b), dir = b >= a ? 1 : -1; const hits = [["stop", tr.sl], ["target", tr.tp]].filter(([, x]) => x >= lo && x <= hi).sort((u, v) => dir * (u[1] - v[1]) || (u[0] === "stop" ? -1 : 1)); if (!hits.length) return null; const [why, x] = hits[0]; return { why, p: x, t: a === b ? tb : ta + (tb - ta) * (x - a) / (b - a) } };
  let prev = tr.entry_p
  for (const r of rows) {
    const t0 = +r.t, [o, h, l, c] = [+r.o, +r.h, +r.l, +r.c]
    const gap = meet(prev, o, t0, t0); if (gap) return { ...gap, p: o, t: t0 }
    const p = tr.side > 0 ? [o, l, h, c] : [o, h, l, c]
    for (let k = 0; k < 3; k++) { const m = meet(p[k], p[k + 1], t0 + k * 20, t0 + (k + 1) * 20); if (m) return m }
    prev = c
  }
  return null
}

try {
  if ((process.env.ONLY || "desk,iphone").includes("desk")) {
    console.log("== desk");
    const { browser, page, errors } = await open("desk");
    // the tab: straight into a session, no form
    await page.evaluate(() => document.querySelector('.tab[data-view="backtest"]').click());
    await page.waitForFunction(() => window.__bt.state()?.id && document.getElementById("bt-loading").hidden, null, { timeout: 30000 });
    await page.waitForTimeout(800);
    let s = await st(page);
    const first = await page.evaluate(() => ({ view: document.querySelector(".view.on")?.id, side: !document.getElementById("bt-side").hidden, setup: !!document.querySelector("#bt-setup.on"), tools: document.querySelectorAll("#bt-hud .bt-tools button").length, sym: document.querySelector('#bt-hud select[data-f="sym"]')?.value }));
    const row0 = (await sql(`select kind from bt_sessions where id = '${s.id}'`))[0];
    ok(first.view === "v-chart" && first.side && !first.setup && first.tools === 4 && first.sym === "NQ" && row0?.kind === "random", `the Backtest tab goes straight into a random session: ${JSON.stringify(first)} kind ${row0?.kind} day ${s.day}`);
    await page.screenshot({ path: `${OUT}/desk 1 straight in.png` });
    // Pick a day, from the panel
    const randomId = s.id;
    await page.click('#bt-hud [data-a="pick"]');
    await page.waitForSelector("#bt-setup.on", { timeout: 5000 });
    await page.fill("#bt-setup .bt-date", DAY); await page.dispatchEvent("#bt-setup .bt-date", "change");
    await page.screenshot({ path: `${OUT}/desk 2 pick a day.png` });
    await page.click('#bt-setup [data-a="go"]');
    await waitNew(page, randomId);
    await page.waitForTimeout(1200);
    s = await st(page);
    const ui = await page.evaluate(() => ({ side: !document.getElementById("bt-side").hidden, dock: document.querySelector("#ch-replay .rp-tag")?.textContent.trim(), exit: document.querySelector("#ch-rp-exit b")?.textContent, view: document.querySelector(".view.on")?.id, hud: document.getElementById("bt-hud").textContent.replace(/\s+/g, " ") }));
    const rows = await sql(`select id, day, start_at, sym, kind, balance0 from bt_sessions where user_id = '${ME}'`);
    const row = rows.find((r) => r.id === s.id);
    ok(ui.view === "v-chart" && ui.side && ui.dock === "Backtest" && ui.exit === "Finish" && /8:00 AM/.test(ui.hud) && /Tue, Sep 15, 2026/.test(ui.hud), `the picked day opens in backtest mode: ${JSON.stringify(ui)}`);
    ok(rows.length === 1 && row && row.day === DAY && new Date(row.start_at).toISOString() === "2026-09-15T12:00:00.000Z" && row.kind === "pick" && +row.balance0 === 50000, `the empty random session is dropped and the picked one saved at 8:00 New York: ${JSON.stringify(rows.map((r) => [r.kind, r.day]))}`);
    const want = (await sql(`select c from nq_bars where symbol = 'NQ' and interval = '1m' and t = to_timestamp(${s.at - 60})`))[0];
    ok(want && Math.abs(+want.c - s.px) < 0.01, `the price at the replay moment is the archive's 7:59 close (${s.px} vs ${want?.c})`);
    // D1 GEX: the worker has a print for this day, so it is offered
    ok(s.gex === true && await indMenuHasGex(page), `D1 GEX is offered on ${DAY} (a day with a print): gex ${s.gex}`);
    // playback: the clock runs continuously and the forming candle grows
    const play = await page.evaluate(async () => {
      document.querySelector('#ch-rp-speed button[data-s="1"]').click(); document.getElementById("ch-rp-play").click()
      const out = []; for (let k = 0; k < 14; k++) { await new Promise((r) => setTimeout(r, 85)); const v = window.__CH.vis, b = v[v.length - 1]; out.push({ at: window.__bt.state().at, t: b.t, c: b.c, h: b.h, l: b.l, partial: !!b.partial }) }
      document.getElementById("ch-rp-play").click(); return out
    });
    const mono = play.every((x, i) => !i || x.at > play[i - 1].at), mid = play.filter((x) => x.at % 60 !== 0).length, grew = play.some((x, i) => i && x.t === play[i - 1].t && (x.c !== play[i - 1].c || x.h !== play[i - 1].h || x.l !== play[i - 1].l)), span = play[play.length - 1].at - play[0].at;
    ok(mono && mid >= 8 && grew && play.some((x) => x.partial) && span > 120 && span < 900, `playing runs the clock smoothly (${play.length} samples, ${mid} mid-minute, ${Math.round(span)} s of market in ~1.1 s at 1x) and the forming candle moves between samples: ${grew}`);
    await page.screenshot({ path: `${OUT}/desk 3 playing.png` });
    // draw: a trendline belongs to the session
    const box = await page.locator("#ch-canvas").boundingBox();
    await page.click('#ch-tools button[data-tool="trend"]');
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
    const dr = await page.evaluate(() => ({ chart: window.__CH.drawings.length, ses: window.__bt.state().drawings, live: (() => { try { return JSON.parse(localStorage.getItem("echelon-chart-drawings") || "[]").length } catch { return -1 } })() }));
    ok(dr.chart === 1 && dr.ses === 1 && dr.live === 0, `a trendline drawn in the session is the session's, not the live chart's: ${JSON.stringify(dr)}`);
    await page.keyboard.press("Escape");
    s = await st(page);
    // a market buy from the ticket, left alone to its stop or target
    await page.click("#bt-ticket .bt-buy");
    s = await st(page);
    ok(s.pos && s.pos.side === 1 && s.pos.qty === 1 && s.pos.sl === s.pos.avg - 20 && s.pos.tp === s.pos.avg + 40 && Math.abs(s.pos.avg - s.px) < 0.01, `Buy opens a long at the price on the chart with its bracket: ${JSON.stringify(s.pos && { avg: s.pos.avg, px: s.px, sl: s.pos.sl, tp: s.pos.tp })}`);
    await page.waitForTimeout(250)   // the lines paint on the next frame
    const lines = await page.evaluate(() => (window.__CH.btTags || []).map((t) => t.ln.k));
    ok(["pos", "sl", "tp"].every((k) => lines.includes(k)), `the position, stop and target lines are on the chart (${lines.join(", ")})`);
    await page.screenshot({ path: `${OUT}/desk 4 long.png` });
    const entry = s.pos;
    s = await stepUntil(page, (x) => !x.pos, 120);
    const t1 = s.trades[0];
    const ind = await independentExit({ side: 1, sl: entry.sl, tp: entry.tp, entry_t: entry.t, entry_p: entry.avg });
    ok(t1 && ind && Math.abs(t1.exit_t - ind.t) <= 1 && Math.abs(t1.exit_p - ind.p) < 0.01 && t1.reason === ind.why, `the exit matches an independent walk of the minutes: engine ${t1?.reason} ${t1?.exit_p} at ${t1?.exit_t}, check ${ind?.why} ${ind?.p} at ${ind && Math.round(ind.t)}`);
    ok(t1 && Math.abs(t1.pnl - (t1.exit_p - t1.entry_p) * 20) < 0.01 && Math.abs(t1.r - t1.pnl / 400) < 0.011, `P&L and R follow: ${t1?.pnl} = (${t1?.exit_p} - ${t1?.entry_p}) x $20, ${t1?.r}R`);
    // tag it
    await page.waitForSelector("#bt-tagcard.in", { timeout: 5000 });
    await page.screenshot({ path: `${OUT}/desk 5 tag card.png` });
    await page.click('#bt-tagcard .bt-chips button[data-t="Liquidity sweep"]');
    await page.fill("#bt-tagcard .bt-tc-note", "harness note"); await page.press("#bt-tagcard .bt-tc-note", "Enter");
    await page.waitForTimeout(1500);
    const tg = await sql(`select tags, note, r, pnl from bt_trades where session_id = '${s.id}' order by exit_t`);
    ok(tg.length === 1 && tg[0].tags.includes("Liquidity sweep") && tg[0].note === "harness note", `the trade is saved with its tag and note: ${JSON.stringify(tg[0])}`);
    // S sells, the stop line is dragged, C closes
    await page.mouse.move(700, 300); await page.keyboard.press("s");
    s = await st(page);
    ok(s.pos && s.pos.side === -1, "S sells (a short)");
    const at = await page.evaluate((p) => window.__CH.$.pt(window.__bt.state().at - 600, p), s.pos.sl);
    await page.mouse.move(box.x + 300, box.y + at.y); await page.mouse.down(); await page.mouse.move(box.x + 300, box.y + at.y - 30, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(300);
    const s2 = await st(page);
    ok(s2.pos && s2.pos.sl > s.pos.sl, `dragging the stop line up moves the short's stop (${s.pos.sl} to ${s2.pos?.sl})`);
    await page.keyboard.press("c");
    s = await st(page);
    ok(!s.pos && s.trades.length === 2 && s.trades[1].reason === "manual", "C closes the position (trade 2)");
    // a limit order from the chart's menu, then cancelled from the ticket
    const below = await page.evaluate(() => window.__CH.$.pt(window.__bt.state().at - 600, window.__bt.state().px - 15));
    await page.mouse.click(box.x + 350, box.y + below.y, { button: "right" });
    await page.waitForSelector("#ch-ctx:not([hidden])", { timeout: 4000 });
    const items = await page.$$eval("#ch-ctx .lb", (n) => n.map((x) => x.textContent));
    ok(items.some((t) => /^Buy limit 1 at/.test(t)) && items.some((t) => /^Sell stop 1 at/.test(t)), `right-click offers orders at the price: ${items.slice(0, 2).join(" | ")}`);
    await page.locator("#ch-ctx .it", { hasText: /^Buy limit/ }).first().click();
    s = await st(page);
    ok(s.orders.length === 1 && s.orders[0].kind === "limit" && s.orders[0].side === 1, `the buy limit rests: ${JSON.stringify(s.orders[0])}`);
    await page.screenshot({ path: `${OUT}/desk 6 limit.png` });
    await page.click("#bt-ticket .bt-ord button");
    s = await st(page);
    ok(s.orders.length === 0, "the × on the ticket cancels it");
    const sesId = s.id;
    await finish(page);
    const rep = await page.evaluate(() => ({ net: document.querySelector("#bt-report .bt-rep-net")?.textContent, trades: document.querySelectorAll("#bt-report .bt-tr").length, day: document.querySelector("#bt-report .bt-rep-h h3")?.textContent, liveDrawings: window.__CH.drawings.length }));
    const fin = (await sql(`select finished_at is not null f, stats, jsonb_array_length(coalesce(state->'drawings', '[]'::jsonb)) dr from bt_sessions where id = '${sesId}'`))[0];
    ok(rep.trades === 2 && fin.f && fin.stats.n === 2 && /Sep 15, 2026/.test(rep.day), `Finish saves the session and opens the report: ${JSON.stringify(rep)} stats n=${fin.stats.n} net=${fin.stats.net}`);
    ok(fin.dr === 1 && rep.liveDrawings === 0, `the session keeps its trendline (${fin.dr}) and the live chart has its own drawings back (${rep.liveDrawings})`);
    await page.screenshot({ path: `${OUT}/desk 7 report.png` });
    await page.click('#bt-report [data-a="home"]');
    await page.waitForFunction(() => !!document.querySelector("#bt-home .bt-s") && document.getElementById("v-backtest").classList.contains("on"), null, { timeout: 15000 });
    await page.waitForTimeout(800);
    const home = await page.evaluate(() => ({ ses: document.querySelectorAll("#bt-home .bt-s").length, tags: [...document.querySelectorAll("#bt-home .bt-gr-k")].map((n) => n.textContent), curve: !!document.querySelector("#bt-home .bt-curve"), hours: document.querySelectorAll("#bt-home .bt-hb:not(.none)").length }));
    ok(home.ses === 1 && home.tags.includes("Liquidity sweep") && home.curve && home.hours >= 1, `the numbers page lists it, with the curve, the setup and the hours: ${JSON.stringify(home)}`);
    await page.screenshot({ path: `${OUT}/desk 8 numbers.png`, fullPage: true });
    // prop rules: a $300 max loss under a $400 stop fails the evaluation
    await page.evaluate(() => window.__bt.start({ mode: "pick", day: "2026-09-16", sym: "NQ", prop: true, target: 3000, maxLoss: 300, sl: 20, tp: 40, bracket: true, blind: false }));
    await page.waitForFunction(() => !!window.__bt.state() && window.__bt.state().day === "2026-09-16", null, { timeout: 30000 });
    await page.evaluate(() => window.__bt.market(1));
    s = await stepUntil(page, (x) => x.status !== "live" || !x.pos, 160);
    ok((s.status === "failed" && s.trades[0]?.reason === "rule" && Math.abs(s.trades[0].pnl + 300) <= 10) || (s.trades[0] && s.trades[0].pnl > 0), `prop rules: a $300 max loss closes the account at -$300, on the way, before the $400 stop (status ${s.status}, first trade ${s.trades[0]?.pnl} by ${s.trades[0]?.reason})`);
    const hudProp = await page.evaluate(() => document.getElementById("bt-hud").textContent);
    if (s.status === "failed") ok(/Failed/.test(hudProp), "the panel says Failed");
    await page.screenshot({ path: `${OUT}/desk 9 prop.png` });
    // the stats button opens the numbers page; the Backtest tab goes back to the running session
    const propId = s.id;
    await page.click('#bt-hud [data-a="stats"]');
    await page.waitForFunction(() => document.getElementById("v-backtest").classList.contains("on"), null, { timeout: 8000 });
    await page.evaluate(() => document.querySelector('.tab[data-view="backtest"]').click());
    await page.waitForFunction(() => document.getElementById("v-chart").classList.contains("on"), null, { timeout: 8000 });
    ok((await st(page))?.id === propId, "the stats button opens the numbers page, and the Backtest tab goes back to the running session");
    // New day: the traded session is kept (finished), a new random one starts
    await page.click('#bt-hud [data-a="newday"]');
    await waitNew(page, propId);
    const kept = (await sql(`select finished_at is not null f, (stats->>'n')::int n from bt_sessions where id = '${propId}'`))[0];
    s = await st(page);
    ok(kept?.f && kept.n >= 1 && s.id !== propId && !s.trades.length, `New day keeps the traded session finished (${kept?.n} trade) and opens another day (${s.day})`);
    // an empty session leaves without a trace
    const emptyId = s.id;
    await page.click("#ch-rp-exit"); await page.waitForSelector("#cfmodal:not([hidden])", { timeout: 8000 }); await page.click("#cf-yes");
    await page.waitForFunction(() => !window.__bt.state(), null, { timeout: 10000 }); await page.waitForTimeout(1200);
    const gone = await sql(`select count(*)::int n from bt_sessions where id = '${emptyId}'`);
    ok(gone[0].n === 0, "an empty session asked to leave is deleted");
    // resume: a session left half way comes back from the tab, with its position and its drawing
    await page.evaluate(() => window.__bt.start({ mode: "pick", day: "2026-09-17", sym: "MNQ", prop: false, bracket: false, blind: false }));
    await page.waitForFunction(() => window.__bt.state()?.day === "2026-09-17", null, { timeout: 30000 });
    for (let i = 0; i < 4; i++) await page.evaluate(() => window.__bt.step())
    await page.evaluate(() => window.__bt.market(1));
    await page.evaluate((t) => window.__CH.$.setTool(t), "hline"); await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3); await page.waitForTimeout(200);
    const before = await st(page);
    ok(before.pos && !before.pos.sl && before.drawings === 1, `MNQ, no bracket: a long without a stop, and a horizontal line (${before.drawings})`);
    await page.waitForTimeout(4600);   // the session saves on its own after 4 s
    await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click());
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__bt.leave(true));
    await page.evaluate(() => document.querySelector('.tab[data-view="backtest"]').click());
    await page.waitForFunction(() => window.__bt.state()?.day === "2026-09-17" && document.getElementById("bt-loading").hidden, null, { timeout: 30000 });
    const after = await st(page), drAfter = await page.evaluate(() => window.__CH.drawings.map((d) => d.type));
    ok(after.pos && after.pos.avg === before.pos.avg && after.at === before.at && drAfter.length === 1 && drAfter[0] === "hline", `the tab resumes it where it was (avg ${after.pos?.avg}, at ${after.at}, drawings ${drAfter.join(",")})`);
    await page.screenshot({ path: `${OUT}/desk 10 resumed.png` });
    await finish(page);
    await page.click('#bt-report .bt-panel-x');
    // the daily drill, started from its card on Today: no form, the date hidden, no D1 GEX that far back
    await page.evaluate(() => document.querySelector('.tab[data-view="overview"]').click());
    await page.waitForSelector("#td-drill-sec:not([hidden]) .tdd-tx", { timeout: 20000 });
    const card0 = await page.textContent("#td-drill");
    ok(/A mystery NQ session/.test(card0), `Today offers the daily drill: "${card0.replace(/\s+/g, " ").trim()}"`);
    await page.locator("#td-drill-sec").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/desk 11 today drill.png` });
    await page.click("#td-drill");
    await page.waitForFunction(() => window.__bt.state()?.id && document.getElementById("bt-loading").hidden, null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    ok(!(await page.isVisible("#bt-setup.on")), "the drill starts straight away (no form)");
    const blind = await page.evaluate(() => ({ hud: document.getElementById("bt-hud").textContent, dock: document.getElementById("ch-rp-at").textContent, axis: (window.__CH.timeLabels || []).join(" "), legend: document.getElementById("ch-legend")?.textContent || "" }));
    const months = /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|20\d\d/;
    ok(/Date hidden/.test(blind.hud) && !months.test(blind.dock) && !months.test(blind.axis), `the drill hides the date: dock "${blind.dock}", axis "${blind.axis.slice(0, 80)}"`);
    s = await st(page);
    ok(s.gex === false && !(await indMenuHasGex(page)) && !/D1 GEX/.test(blind.legend), `no D1 GEX on a day the worker has no print for (gex ${s.gex}), neither in the indicators nor the legend`);
    await page.screenshot({ path: `${OUT}/desk 12 drill.png` });
    await page.evaluate(() => window.__bt.market(-1));
    await stepUntil(page, (x) => !x.pos, 160);
    await finish(page);
    const revealed = await page.evaluate(() => document.querySelector("#bt-report .bt-rep-h h3")?.textContent);
    const drill = (await sql(`select public.bt_drill_day() d`))[0].d;
    ok(/it was hidden/.test(revealed) && /20\d\d/.test(revealed), `the report reveals the drill's date: "${revealed}" (drill ${drill})`);
    await page.click('#bt-report [data-a="home"]');
    await page.waitForSelector("#bt-home .bt-br.me", { timeout: 15000 });
    ok(await page.isVisible("#bt-home .bt-br.me"), "the drill board shows your row");
    await page.screenshot({ path: `${OUT}/desk 13 drill board.png` });
    await page.evaluate(() => { document.querySelector('.tab[data-view="overview"]').click(); window.__TD?.refresh() });
    await page.waitForFunction(() => /You traded it/.test(document.getElementById("td-drill")?.textContent || ""), null, { timeout: 20000 }).catch(() => {});
    const card1 = await page.textContent("#td-drill");
    ok(/You traded it/.test(card1) && /#1 of/.test(card1), `Today's card shows your drill result: "${card1.replace(/\s+/g, " ").trim()}"`);
    ok(!errors.length, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
    await browser.close();
  }
  if ((process.env.ONLY || "desk,iphone").includes("iphone")) {
    console.log("== iphone");
    await cleanup();
    const { browser, page, errors } = await open("iphone");
    await page.evaluate(() => document.querySelector('.tab[data-view="backtest"]').click());
    await page.waitForFunction(() => window.__bt.state()?.id && document.getElementById("bt-loading").hidden, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const hud = await page.evaluate(() => { const r = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), vis: b.width > 0 && getComputedStyle(n).display !== "none" } }; return { tools: r("#bt-hud .bt-tools"), sym: r("#bt-hud .bt-symsel"), sw: document.documentElement.scrollWidth } });
    ok(hud.tools?.vis && hud.sym?.vis && hud.tools.r <= 390 && hud.sw <= 390, `the tab goes straight in, and the session tools fit the phone: ${JSON.stringify(hud)}`);
    await page.screenshot({ path: `${OUT}/iphone 1 straight in.png` });
    for (let i = 0; i < 4; i++) await page.evaluate(() => window.__bt.step())
    await page.tap("#bt-ticket .bt-buy");
    let s = await st(page);
    ok(s.pos && s.pos.side === 1, "a tap on Buy opens a long");
    const geo = await page.evaluate(() => { const a = document.getElementById("bt-side").getBoundingClientRect(), b = document.getElementById("ch-replay").getBoundingClientRect(); return { sideBottom: Math.round(a.bottom), dockTop: Math.round(b.top), sw: document.documentElement.scrollWidth } });
    ok(geo.sideBottom <= geo.dockTop && geo.sw <= 390, `the panel sits above the replay dock (${geo.sideBottom} <= ${geo.dockTop}), no sideways scroll`);
    await page.screenshot({ path: `${OUT}/iphone 2 long.png` });
    // a second of play on the phone
    const moved = await page.evaluate(async () => { const a0 = window.__bt.state().at; document.getElementById("ch-rp-play").click(); await new Promise((r) => setTimeout(r, 900)); document.getElementById("ch-rp-play").click(); return window.__bt.state().at - a0 });
    ok(moved > 60, `play runs on the phone (${Math.round(moved)} s of market)`);
    s = await st(page)
    if (s.pos) { await page.tap("#bt-ticket .bt-pclose"); s = await st(page) }
    ok(!s.pos && s.trades.length === 1, "the inline Close flattens it (or its stop or target did)");
    await page.tap("#ch-rp-exit");
    await page.waitForSelector("#cfmodal:not([hidden])");
    await page.tap("#cf-yes");
    await page.waitForSelector("#bt-report.on", { timeout: 20000 });
    await page.waitForTimeout(500);
    ok(await page.isVisible("#bt-report .bt-rep-net"), "Finish opens the report");
    await page.screenshot({ path: `${OUT}/iphone 3 report.png` });
    ok(!errors.length, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
    await browser.close();
  }
} catch (e) { fails.push("crash: " + e.message); console.log(e); }
finally { const n = await cleanup().then(() => sql(`select count(*)::int n from bt_sessions where user_id = '${ME}'`)); console.log("test sessions left:", n[0].n); }
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
