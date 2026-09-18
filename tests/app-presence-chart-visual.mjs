// Presence and the chart selection bar (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-presence-chart-visual.mjs      (APP_URL / OUT env, PHONE=1 for 390x844)
// A second page joins the presence channel as another member: the members list and the DM row show a green
// dot and the count, and both clear when they leave. On desktop a new trend line is TradingView blue and the
// selection bar sits under the status line.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-presence-chart"); mkdirSync(OUT, { recursive: true });
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
await page.goto(process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#td-h1", { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const go = async (v) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`)?.click(), v); await page.waitForTimeout(2500) };
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };
// a second person comes online: a bare page joins the presence channel as connorjchrist
const OTHER = "0250925b-7e07-479a-be65-24a818ee3fc5";
const p2 = await (await browser.newContext()).newPage(); await p2.goto("about:blank");
await p2.addScriptTag({ url: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js" });
// presence is a private channel now: an anonymous page can no longer fake a member, so the second page signs in with a member session
await p2.evaluate(async ([url, key, uid, token]) => { const c = window.supabase.createClient(url, key, { auth: { persistSession: false } }); await c.realtime.setAuth(token); const ch = c.channel("online", { config: { private: true, presence: { key: uid } } }); await new Promise((r) => ch.subscribe((s) => { if (s === "SUBSCRIBED") r() })); await ch.track({ at: Date.now() }); window._ch = ch }, [SB, anon, OTHER, session.access_token]);
await go("members"); await page.waitForTimeout(2500);
ok(await page.locator(`.mcard.online[data-uid="${OTHER}"]`).count() === 1, "a member who comes online shows a green dot");
ok(/online/.test(await page.locator("#members-online").textContent().catch(() => "")), "the members page counts who is online: " + (await page.locator("#members-online").textContent().catch(() => "")));
await shot(PRE + "members-online");
await go("chat"); await page.waitForTimeout(1500);
ok(await page.locator(".cr-item.online").count() >= 1, "the DM row shows the dot too");
await shot(PRE + "chat-online");
await p2.evaluate(() => window._ch.untrack()); await page.waitForTimeout(5000);
ok(await page.locator(`.mcard.online[data-uid="${OTHER}"], .cr-item.online[data-uid="${OTHER}"]`).count() === 0, "and it clears when they leave (other members may really be online)");
// chart: a new drawing is blue, the selection bar sits under the status line
if (!PHONE) {
  await go("chart"); await page.waitForFunction(() => /O\s?[\d,]/.test(document.getElementById("ch-legend").textContent), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(2500);
  const cv = await page.$("#ch-canvas"); const box = await cv.boundingBox(); const cy = box.y + box.height * 0.45;
  await page.evaluate((t) => window.__CH.$.setTool(t), "trend"); await page.mouse.click(box.x + box.width * 0.3, cy + 60); await page.mouse.move(box.x + box.width * 0.6, cy - 40, { steps: 5 }); await page.mouse.click(box.x + box.width * 0.6, cy - 40); await page.waitForTimeout(400);
  const dr = await page.evaluate(() => { const C = window.__CH; const d = C.drawings[C.drawings.length - 1]; const bar = document.getElementById("ch-selbar").getBoundingClientRect(), lg = document.getElementById("ch-legend").getBoundingClientRect(); return { color: d.color, below: bar.top >= lg.bottom - 2, centred: Math.abs((bar.left + bar.width / 2) - (lg.left - 8 + (innerWidth - lg.left) / 2)) < 400 } });
  ok(dr.color === "#2962ff" && dr.below, "a new line is TradingView blue and its bar sits under the status line: " + JSON.stringify(dr));
  await shot(PRE + "chart-selbar");
  await page.keyboard.press("Delete");
}
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
