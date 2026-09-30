// Getting members back (D1, 9/30: "find out how we can get more people to consistently use it"). Manual, not a
// node:test.   node tests/app-engage-visual.mjs        (APP_URL / OUT / EMAIL / ONLY=iphone,desk / WEB=1 env)
// Proves:
//   iPhone (WebKit, Safari outside a Home Screen app: no web push there): Today asks for alerts under the GEX card
//   with the two taps that get there ("Add to Home Screen"), "Got it" puts it away, and it stays away after a reload.
//   desk (Chromium): over plain http there is no web push, so no ask; Alt+Down / Alt+Up step through the chat list
//   the Discord way; the shortcuts sheet lists them.
//   WEB=1 (run against https, e.g. APP_URL=https://d1fpc3.com/echelon/app/): the web ask shows, Turn on explains
//   first (our sheet), and saying Not now there subscribes nothing; the card's Not now puts it away for two weeks.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/app-engage`; mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const fails = [];
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };
const VPS = { iphone: [webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }], desk: [chromium, { viewport: { width: 1440, height: 900 } }] };
const card = (page) => page.evaluate(() => { const s = document.getElementById("td-push-sec"); return { shown: !!s && !s.hidden, mode: s?.dataset.mode, title: document.getElementById("tp-title")?.textContent, sub: document.getElementById("tp-sub")?.textContent, on: !document.getElementById("tp-on")?.hidden, later: document.getElementById("tp-later")?.textContent }; });
async function boot(page) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(2800);
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open"); } });
}
for (const tag of (process.env.ONLY || "iphone,desk").split(",")) {
  const [eng, opt] = VPS[tag];
  console.log(`== ${tag}`);
  const browser = await eng.launch();
  const ctx = await browser.newContext(opt);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); try { if (window.Notification) Notification.requestPermission = () => Promise.resolve("default"); } catch (e) {} }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await boot(page);
  await page.evaluate(() => { try { localStorage.removeItem("echelon-push-ask"); } catch (e) {} globalThis.__tdPush?.(); });
  await page.waitForTimeout(600);
  let c = await card(page);
  if (tag === "iphone") {
    check(c.shown && c.mode === "ios" && /Add to Home Screen/.test(c.sub) && !c.on && c.later === "Got it", `Safari on an iPhone gets the Home Screen route: "${c.title}" / "${c.sub}"`);
    const below = await page.evaluate(() => { const a = document.getElementById("td-gex-sec"), b = document.getElementById("td-push-sec"); return a.hidden || a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING; });
    check(!!below, "the ask sits under the GEX card, beside the levels it would deliver");
    await page.evaluate(() => document.getElementById("td-push-sec").scrollIntoView({ block: "center" })); await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/iphone 1 the ask.png` });
    await page.tap("#tp-later"); await page.waitForTimeout(700);
    c = await card(page);
    check(!c.shown, "Got it puts it away");
    await boot(page);
    c = await card(page);
    check(!c.shown, "and it stays away after a reload");
  } else {
    if (!process.env.WEB) check(!c.shown, `plain http has no web push, so no ask (mode "${c.mode}")`);
    else {
      check(c.shown && c.mode === "web" && c.on, `the web ask shows: "${c.title}"`);
      await page.click("#tp-on"); await page.waitForTimeout(700);
      const sheet = await page.evaluate(() => [...document.querySelectorAll(".asheet, .ask, [role=dialog]")].some((n) => n.offsetParent && /Turn on notifications/.test(n.textContent)));
      check(sheet, "Turn on explains first, in our own sheet");
      await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && /^Not now$/.test(x.textContent.trim()) && !x.closest("#td-push")); b?.click(); });
      await page.waitForTimeout(700);
      const subs = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration("/echelon/app/"); return !!(r && await r.pushManager.getSubscription()); });
      check(!subs, "saying Not now in the sheet subscribes nothing");
      await page.click("#tp-later"); await page.waitForTimeout(700);
      const snooze = await page.evaluate(() => +localStorage.getItem("echelon-push-ask") - Date.now());
      check(!(await card(page)).shown && snooze > 13 * 864e5, `the card's Not now puts it away for two weeks (${Math.round(snooze / 864e5)} days)`);
    }
    // Alt+Down / Alt+Up in the chat list
    await page.evaluate(() => document.querySelector('.tab[data-view="chat"]').click()); await page.waitForTimeout(1800);
    const lit = () => page.evaluate(() => document.querySelector("#v-chat .chat-rail .cr-item.on")?.textContent.replace(/\s+/g, " ").trim().slice(0, 30) || "");
    const a0 = await lit();
    await page.keyboard.press("Alt+ArrowDown"); await page.waitForTimeout(1500);
    const a1 = await lit();
    await page.keyboard.press("Alt+ArrowDown"); await page.waitForTimeout(1500);
    const a2 = await lit();
    await page.keyboard.press("Alt+ArrowUp"); await page.waitForTimeout(1500);
    const a3 = await lit();
    check(a1 && a2 && a1 !== a2 && a3 === a1, `Alt+Down walks the chat list and Alt+Up walks back ("${a0}" > "${a1}" > "${a2}" > "${a3}")`);
    await page.screenshot({ path: `${OUT}/desk 1 chat after Alt+Down.png` });
    await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press("?"); await page.waitForTimeout(500);
    const sheetRow = await page.evaluate(() => [...document.querySelectorAll("#keys .keys-row")].some((r) => /next channel/.test(r.textContent) && /Alt/.test(r.textContent)));
    check(sheetRow, "the shortcuts sheet lists Alt + arrows");
  }
  check(!errors.length, `[${tag}] no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
  await browser.close();
}
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
