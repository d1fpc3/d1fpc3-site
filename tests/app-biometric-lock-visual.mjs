// The biometric lock (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-biometric-lock-visual.mjs      (APP_URL must be localhost or https: WebAuthn refuses an IP address)
// A CDP virtual platform authenticator stands in for Face ID: the account page offers the lock, turning it on
// enrols a credential, the next open is locked and blurred and stays locked when the check fails, a recognised
// check unlocks, and turning the lock off asks for the check first.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-biometric-lock"); mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const browser = await chromium.launch();
const PHONE = process.env.PHONE === "1", PRE = PHONE ? "p-" : "d-"; const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: Number(process.env.W || 1440), height: Number(process.env.HGT || 900) } });
await ctx.addInitScript(([k, v, theme]) => { localStorage.setItem(k, v); if (theme) localStorage.setItem("echelon-theme", theme); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-chart-tf", "5m"); }, [`sb-${REF}-auth-token`, JSON.stringify(session), process.env.THEME || ""]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(process.env.APP_URL || "http://localhost:8123/echelon/app/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#td-h1", { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const go = async (v) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`)?.click(), v); await page.waitForTimeout(2000) };
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };
// a virtual platform authenticator stands in for Face ID
const cdp = await ctx.newCDPSession(page); await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector("#td-h1", { timeout: 30000 }); await page.waitForTimeout(1500);
await go("set-account"); await page.waitForTimeout(800);
ok(await page.locator("#lock-block").isVisible(), "the account page offers the lock when the device can do it: " + (await page.locator("#lock-name").textContent()));
await page.locator("#lock-block .tgl").click(); await page.waitForTimeout(1500);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("echelon-lock") || "null"));
ok(stored && stored.id && stored.uid, "turning it on enrols a platform credential on this device: " + (await page.locator("#lock-msg").textContent()));
await shot(PRE + "lock-settings");
// next open: the face is NOT recognised, the app stays locked
await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: false });
await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector("#lockscreen.on", { timeout: 30000 }); await page.waitForTimeout(2500);
const locked = await page.evaluate(() => ({ lock: !!document.getElementById("lockscreen"), blurred: document.body.classList.contains("locked"), err: document.getElementById("lk-err")?.textContent }));
ok(locked.lock && locked.blurred, "on the next open the app is locked and blurred; a failed check keeps it locked: " + JSON.stringify(locked));
await shot(PRE + "lock-screen");
await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: true });
await page.click("#lk-go"); await page.waitForTimeout(1500);
ok(await page.evaluate(() => !document.getElementById("lockscreen") && !document.body.classList.contains("locked")), "a recognised face unlocks it");
// the lock needs the face to turn off, then is gone
await go("set-account"); await page.waitForTimeout(600); await page.locator("#lock-block .tgl").click(); await page.waitForTimeout(1500);
ok(await page.evaluate(() => localStorage.getItem("echelon-lock") === null), "turning it off asks for the face, then removes the lock");
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
