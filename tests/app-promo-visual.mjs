// Stay close tabs (manual, not a node:test): python -m http.server 8123, then OUT=<dir> node tests/app-promo-visual.mjs
// Three separate little tabs bottom-right after boot (Instagram / free Discord / BackTrader), each with its own X.
// Checks: all three open, anchored bottom-right inside the viewport, X closes ONLY that one and rests it,
// the other two survive a reload while the dismissed one stays away, and dismissing all hides the stack.
import { createRequire } from "module";
import { readFileSync, mkdirSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright");
const OUT = process.env.OUT; mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
const b = await chromium.launch();
const fails = [];
const IDS = ["ig", "dc", "bt"];
const state = () => { const IDS = ["ig", "dc", "bt"]; return {
  open: IDS.filter((id) => { const c = document.querySelector(`.pm-card[data-promo="${id}"]`); return c && !c.hidden && c.classList.contains("on"); }),
  stackHidden: document.getElementById("promostack").hidden,
  rested: IDS.filter((id) => Number(localStorage.getItem(`echelon-promo-until:${id}`) || 0) > Date.now()),
  box: (() => { const r = document.getElementById("promostack").getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight }; })(),
  links: { ig: document.getElementById("promo-ig").href, dc: document.getElementById("promo-dc").href, bt: document.getElementById("promo-bt").href },
}; };
for (const [name, vp, theme] of [["phone-light", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "light"], ["desk-dark", { viewport: { width: 1280, height: 800 } }, "dark"]]) {
  const ctx = await b.newContext(vp);
  await ctx.addInitScript(([k, v, t]) => {
    localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", t);
    if (!sessionStorage.getItem("promo-reset")) { for (const key of ["echelon-promo-until", "echelon-promo-until:ig", "echelon-promo-until:dc", "echelon-promo-until:bt"]) localStorage.removeItem(key); sessionStorage.setItem("promo-reset", "1"); }
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#ov-hi", { timeout: 25000 });
  await p.waitForFunction(() => document.querySelectorAll(".pm-card.on").length === 3, null, { timeout: 12000 }).catch(() => fails.push(name + ": three tabs never opened"));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  let st = await p.evaluate(state);
  console.log(name, JSON.stringify(st), errs);
  const { box } = st;
  const bottomRight = box.right <= box.W && box.W - box.right < 40 && box.bottom <= box.H && box.H - box.bottom < 120 && box.top > box.H / 2;
  if (st.open.length !== 3 || !bottomRight) fails.push(name + " layout " + JSON.stringify(st));
  if (errs.length) fails.push(name + " page errors: " + errs.join(" | "));
  // X on the middle one closes only it
  await p.click('.pm-card[data-promo="dc"] [data-promo-x]'); await p.waitForTimeout(450);
  st = await p.evaluate(state);
  if (st.open.join() !== "ig,bt" || st.rested.join() !== "dc" || st.stackHidden) fails.push(name + ": X on Discord did not close just that one " + JSON.stringify(st));
  await p.screenshot({ path: `${OUT}/${name}-one-dismissed.png` });
  // reload: the two survive, the dismissed one stays away
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector("#ov-hi", { timeout: 25000 }); await p.waitForTimeout(6500);
  st = await p.evaluate(state);
  if (st.open.join() !== "ig,bt") fails.push(name + ": after reload expected ig,bt open, got " + st.open.join());
  // dismiss the rest: the stack goes away
  await p.click('.pm-card[data-promo="ig"] [data-promo-x]'); await p.click('.pm-card[data-promo="bt"] [data-promo-x]'); await p.waitForTimeout(450);
  st = await p.evaluate(state);
  if (st.open.length || !st.stackHidden || st.rested.length !== 3) fails.push(name + ": dismissing all did not hide the stack " + JSON.stringify(st));
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector("#ov-hi", { timeout: 25000 }); await p.waitForTimeout(6500);
  if (await p.evaluate(() => !document.getElementById("promostack").hidden)) fails.push(name + ": came back after dismissing all");
  await ctx.close();
}
await b.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK");
process.exit(fails.length ? 1 : 0);
