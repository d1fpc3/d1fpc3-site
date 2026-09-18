// CSP dry run (manual). Serves the app with the policy from echelon/app/.htaccess injected as a
// header, walks every view plus the chart, a library video, search and a lesson, and prints
// anything the policy blocked. Run before changing the policy or adding a new outside host:
//   APP_URL=http://127.0.0.1:8124/echelon/app/ node tests/security-csp-probe.mjs
import { createRequire } from "module"; import { existsSync, readFileSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const require = createRequire(import.meta.url);
const PW = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"].find((p) => existsSync(p)) || "playwright";
const { chromium } = require(PW);
const ht = readFileSync(new URL("../echelon/app/.htaccess", import.meta.url), "utf8");
const CSP = (ht.match(/Content-Security-Policy "([^"]+)"/) || [])[1]; if (!CSP) throw new Error("no policy in echelon/app/.htaccess");
const APP = process.env.APP_URL || "http://127.0.0.1:8124/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: process.env.EMAIL || "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-theme", "dark"); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()) }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage(); const blocked = new Set(), errs = [];
await page.route((u) => u.href.split("?")[0] === APP, async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, headers: { ...r.headers(), "content-security-policy": CSP } }) });
page.on("console", (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) blocked.add(t.replace(/\s+/g, " ").slice(0, 260)) });
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(APP, { waitUntil: "domcontentloaded" }); await page.waitForSelector("#td-h1", { timeout: 40000 }); await page.waitForTimeout(2500);
const views = await page.evaluate(() => [...document.querySelectorAll(".side-nav .tab[data-view]")].map((t) => t.dataset.view));
for (const v of views) { await page.evaluate((v) => document.querySelector(`.side-nav .tab[data-view="${v}"]`)?.click(), v); await page.waitForTimeout(v === "chart" || v === "gex" || v === "chat" || v === "feed" ? 3500 : 1300) }
await page.evaluate(() => document.querySelector('.tab[data-view="library"]').click()); await page.waitForTimeout(1500); await page.locator(".lib-card").first().click().catch(() => {}); await page.waitForTimeout(5000); await page.click("#lib-x").catch(() => {});
await page.evaluate(() => document.querySelector('.tab[data-view="course"]').click()); await page.waitForTimeout(1200); await page.locator("#study-map .sm-card").nth(1).click().catch(() => {}); await page.waitForTimeout(3500);
await page.keyboard.press("Control+k"); await page.type("#pal-q", "liq").catch(() => {}); await page.waitForTimeout(1200); await page.keyboard.press("Escape");
await page.evaluate(() => document.querySelector('.tab[data-view="feed"]').click()); await page.waitForTimeout(3000);
console.log("policy:", CSP.slice(0, 120) + "…"); console.log("views walked:", views.length, "| page errors:", errs.length ? errs.join(" | ") : "none");
if (blocked.size) { console.log("BLOCKED (" + blocked.size + "):"); for (const b of blocked) console.log(" - " + b); await browser.close(); process.exit(1) } else { console.log("NOTHING BLOCKED"); await browser.close() }
