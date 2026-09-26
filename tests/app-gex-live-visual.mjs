// GEX board in real time (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-gex-live-visual.mjs        (APP_URL / OUT env)
// The board takes the live futures quote from the Chart's feed (tape) every 3 s while the
// market trades, and measures every wall from it. Puts the board's clock (window.__GEX_CLOCK) in a Monday session
// and stubs tape with a moving quote, then checks: the NQ figure says "NQ live" with the
// quote, it flashes when the quote moves, the rail's gold pin and the ladder's distances
// follow it, the stamp says "NQ live"; a stalled feed drops back to the print's price and
// says how far behind it is; switching to ES follows ES's own quote. It also checks the
// print poll asks the worker for gex.json again within a minute of the session.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-gex-live`;
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
const NOW = Date.UTC(2026, 8, 28, 15, 0, 0);          // the board's clock: Mon 2026-09-28 11:00 ET, the session is open
const quote = { NQ: 30950.25, ES: 7810.75, stall: false };
let gexHits = 0;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([k, v, clock]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-gex-book", "NQ"); window.__GEX_CLOCK = clock; }, [`sb-${REF}-auth-token`, JSON.stringify(session), NOW]);
const page = await ctx.newPage();
page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
await page.route(/functions\/v1\/tape\?.*tail=2/, (route) => {
  const sym = (route.request().url().match(/symbol=(\w+)/) || [])[1] || "NQ";
  const px = quote[sym] ?? 100;
  const barT = Math.floor(Date.now() / 1000 / 60) * 60 - (quote.stall ? 600 : 0);   // the quote is fresh by the REAL clock
  route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ symbol: sym, bars: [[barT - 60, px, px, px, px, 10], [barT, px, px, px, px, 10]], last: px, prevClose: px }) });
});
await page.route(/gex-worker\.d1fpc3\.workers\.dev\/refresh/, (route) => route.abort());
page.on("request", (r) => { if (/gex-worker\.d1fpc3\.workers\.dev\/gex\.json(\?book=es)?$/.test(r.url())) gexHits++; });

await page.goto(APP_URL + "?start=gex", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#td-h1", { timeout: 25000 }).catch(async () => { console.log("views on:", await page.evaluate(() => [...document.querySelectorAll(".view.on")].map((v) => v.id)), fails); });
await page.evaluate(() => document.querySelector('.tab[data-view="gex"]').click());
await page.waitForFunction(() => document.querySelectorAll("#gex-read .v").length >= 4, null, { timeout: 30000 }).catch(() => fails.push("board never filled"));
const read = () => page.evaluate(() => {
  const fig = document.getElementById("gex-fut-fig");
  const cw = [...document.querySelectorAll("#gex-table tr.lv")].find((r) => /Call wall/.test(r.textContent));
  return {
    label: fig?.querySelector(".label").textContent, value: fig?.querySelector(".v").textContent, flash: fig?.querySelector(".v").className,
    pin: document.querySelector("#gex-rail .gex-pin.spot .tag")?.textContent, pinLive: document.querySelector("#gex-rail .gex-pin.spot")?.classList.contains("live"),
    cwFut: cw ? +cw.querySelector("em").dataset.fut : null, cwDist: cw?.querySelector("em").textContent,
    age: document.getElementById("gex-pxage").hidden ? "" : document.getElementById("gex-pxage").textContent,
    dot: document.getElementById("gex-live").classList.contains("on"),
  };
});
const dist = (fut, px) => { const n = Math.round(fut - px); return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString()}`; };

await page.waitForFunction(() => /live/.test(document.querySelector("#gex-fut-fig .label")?.textContent || ""), null, { timeout: 15000 }).catch(() => fails.push("NQ never went live"));
let st = await read(); note("live: " + JSON.stringify(st));
if (st.label !== "NQ live" || st.value !== "30,950.25") fails.push("figure not on the live quote " + JSON.stringify(st));
if (!/30,950\.25/.test(st.pin || "") || !st.pinLive) fails.push("rail spot pin not on the live quote");
if (st.cwDist !== dist(st.cwFut, 30950.25)) fails.push(`call wall distance ${st.cwDist}, want ${dist(st.cwFut, 30950.25)}`);
if (st.age !== "· NQ live" || !st.dot) fails.push("stamp does not say NQ live " + JSON.stringify(st));
await page.screenshot({ path: `${OUT}/1-live.png` });

quote.NQ = 30962.5;
await page.waitForFunction(() => document.querySelector("#gex-fut-fig .v")?.textContent === "30,962.50", null, { timeout: 8000 }).catch(() => fails.push("quote move never reached the board"));
st = await read(); note("moved: " + JSON.stringify(st));
if (!/gx-up/.test(st.flash || "")) fails.push("an up-tick did not flash green");
if (st.cwDist !== dist(st.cwFut, 30962.5)) fails.push("ladder distance did not follow the quote");
if (!/30,962\.50/.test(st.pin || "")) fails.push("rail pin did not follow the quote");
await page.screenshot({ path: `${OUT}/2-moved.png` });

quote.stall = true;
await page.waitForFunction(() => /behind/.test(document.getElementById("gex-pxage").textContent), null, { timeout: 8000 }).catch(() => fails.push("a stalled feed never said it was behind"));
st = await read(); note("stalled: " + JSON.stringify(st));
if (st.label !== "NQ" || /\./.test(st.value || "")) fails.push("stalled feed still shown as live " + JSON.stringify(st));
if (!/NQ feed 10m behind/.test(st.age)) fails.push("stall note wrong: " + st.age);
quote.stall = false;

await page.click('#gex-book button[data-b="ES"]');
await page.waitForFunction(() => document.querySelector("#gex-fut-fig .label")?.textContent === "ES live", null, { timeout: 20000 }).catch(() => fails.push("ES never went live"));
st = await read(); note("ES: " + JSON.stringify(st));
if (st.value !== "7,810.75") fails.push("ES figure not on the ES quote " + st.value);
await page.screenshot({ path: `${OUT}/3-es.png` });

// the minute print poll: within ~65 s of the session the board asks for gex.json again
const before = gexHits;
await page.waitForTimeout(65000);
note(`gex.json requests in 65 s: ${gexHits - before}`);
if (gexHits - before < 1) fails.push("the board did not poll for a new print within a minute");

await browser.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
