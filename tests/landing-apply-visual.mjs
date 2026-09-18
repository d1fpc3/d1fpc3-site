// Landing application flow (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8124
//   2. node tests/landing-apply-visual.mjs     (URL / OUT env; PHONE=1 for 390x844)
// Drives the real form: validation, a real submit through submit_application, the row in
// public.applications, the ping to admins, the remembered state on reload. Cleans up after.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = [
  "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright",
  "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright",
];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/landing-apply`; mkdirSync(OUT, { recursive: true });
const URL_ = process.env.URL || "http://127.0.0.1:8124/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const tokenFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
const PHONE = process.env.PHONE === "1", PRE = PHONE ? "p-" : "d-";
const email = `harness-apply-${Date.now()}@d1fpc3.test`;
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };

const browser = await chromium.launch();
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL_, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
await shot(PRE + "hero");

const copy = await page.evaluate(() => ({ text: document.body.innerText, pricing: document.querySelectorAll('a[href="/pricing/"]').length, buy: document.querySelectorAll("[data-buy]").length }));
ok(!/\$500\b(?! to)|\$400|Join Echelon|D1 GEX/.test(copy.text.replace(/Under \$500|\$500 to \$1,000/g, "")), "no price, no Join, no D1 GEX left on the page");
ok(copy.pricing === 0 && copy.buy === 0, "no pricing links or buy buttons: " + copy.pricing + "/" + copy.buy);
ok(/\bGEX\b/.test(copy.text), "the band reads GEX");
ok(!copy.text.includes(String.fromCharCode(8212)), "no long dashes");

ok(await page.locator("#apply-modal").isHidden(), "the application stays out of the page until asked for");
await page.locator(".hero [data-apply]").click(); await page.waitForTimeout(900);
const m1 = await page.evaluate(() => { const b = getComputedStyle(document.getElementById("ap-back")); const r = document.getElementById("apply-card").getBoundingClientRect(); return { blur: b.backdropFilter || b.webkitBackdropFilter, op: b.opacity, inView: r.top >= 0 && r.bottom <= innerHeight + 1, locked: getComputedStyle(document.body).overflow } });
ok(/blur/.test(m1.blur) && m1.op === "1" && m1.locked === "hidden", "Apply opens a pop-up over a blurred, locked page: " + JSON.stringify(m1));
ok(m1.inView, "the whole card fits on screen");
if (!PHONE) ok(await page.evaluate(() => document.activeElement?.id === "ap-name"), "the cursor lands in Name");
await page.keyboard.press("Escape"); await page.waitForTimeout(600);
ok(await page.locator("#apply-modal").isHidden(), "Escape closes it");
await page.locator("#access [data-apply]").click(); await page.waitForTimeout(900);
ok(await page.locator("#apply-card").isVisible(), "the card further down the page opens it too");
await page.mouse.click(8, 8); await page.waitForTimeout(600);
ok(await page.locator("#apply-modal").isHidden(), "a click on the blurred page closes it");
await page.locator(".hero [data-apply]").scrollIntoViewIfNeeded(); await page.locator(".hero [data-apply]").click(); await page.waitForTimeout(900);
await shot(PRE + "form");

await page.click("#ap-send"); await page.waitForTimeout(300);
ok((await page.textContent("#ap-msg")) === "Enter your name.", "empty submit asks for the name");
await page.fill("#ap-name", "Harness Tester"); await page.fill("#ap-email", "nope"); await page.click("#ap-send"); await page.waitForTimeout(300);
ok((await page.textContent("#ap-msg")) === "Enter a real email.", "a bad email is refused");
await page.fill("#ap-email", email); await page.click("#ap-send"); await page.waitForTimeout(300);
ok((await page.textContent("#ap-msg")) === "Pick a range.", "a range is required");
await shot(PRE + "form-error");
await page.locator(".ap-opts label", { hasText: "$1,000 to $2,500" }).click(); await page.waitForTimeout(400);
await shot(PRE + "form-filled");
await page.click("#ap-send"); await page.waitForSelector("#ap-done:not([hidden])", { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(900);
ok(/Application received, Harness\./.test(await page.textContent("#ap-done-h")), "the card confirms by first name");
await shot(PRE + "done");

const rows = await (await fetch(`${SB}/rest/v1/applications?email=eq.${encodeURIComponent(email)}&select=*`, { headers: H })).json();
ok(rows.length === 1 && rows[0].name === "Harness Tester" && rows[0].invest === "1000_2500" && rows[0].status === "new", "the row landed: " + JSON.stringify(rows.map((r) => [r.name, r.invest, r.status])));
const notes = await (await fetch(`${SB}/rest/v1/notifications?kind=eq.system&body=like.New application: Harness Tester*&select=id,body`, { headers: H })).json();
ok(notes.length >= 1 && /\$1,000 to \$2,500/.test(notes[0].body), "admins got the ping: " + (notes[0]?.body || "none"));

await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(800);
await page.locator(".hero [data-apply]").click(); await page.waitForTimeout(800);
ok(await page.evaluate(() => document.getElementById("apply-form").hidden && !document.getElementById("ap-done").hidden), "a reload remembers the application");
await page.goto(URL_ + "?ref=D1#access", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1600);
ok(await page.locator("#apply-card").isVisible(), "an invite link opens the pop-up on arrival");
ok(errors.length === 0, "no page errors: " + errors.join(" | "));

// cleanup: the test application and its pings
await fetch(`${SB}/rest/v1/applications?email=like.harness-apply-*`, { method: "DELETE", headers: H });
await fetch(`${SB}/rest/v1/notifications?kind=eq.system&body=like.New application: Harness Tester*`, { method: "DELETE", headers: H });
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK, shots: " + OUT);
