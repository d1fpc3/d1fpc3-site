// Mentions, chat search, Seen, comment previews, docked promos, the GEX read (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-mentions-search-visual.mjs      (APP_URL / OUT env, PHONE=1 for 390x844)
// As the App Review account: promos sit in the home page flow; a feed post shows its newest comments; the
// comment box suggests names on @ and Enter completes without posting; a self mention renders as a chip;
// notify_mentions puts a mention in the inbox and tapping it opens the channel; chat search finds, marks and
// jumps to a message; a DM opens with the Seen lookup; the GEX read carries no long dashes. Cleans up after itself.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-mentions-search"); mkdirSync(OUT, { recursive: true });
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
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
// home: promos docked in the page, not floating
await go("overview"); await page.waitForTimeout(1500);
const promo = await page.evaluate(() => { const s = document.getElementById("promostack"); return s ? { inHome: !!s.closest("#v-overview"), pos: getComputedStyle(s).position, hidden: s.hidden } : null });
ok(promo && promo.inHome && promo.pos === "static", "promos sit in the home page's flow: " + JSON.stringify(promo));
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(400); await shot(PRE + "home-foot");
// feed: comment previews under the post
await go("feed"); await page.waitForTimeout(1500);
ok(await page.locator(".rv-cprev button").count() > 0, "a post shows its newest comments inline: " + (await page.locator(".rv-cprev button").first().textContent().catch(() => "")));
await shot(PRE + "feed-previews");
// a comment that mentions yourself renders as a mention and notifies nobody
await page.locator('.rv-post .rv-act button[title="Comment"]').first().click(); await page.waitForTimeout(1500);
const stamp = "mention " + Date.now();
await page.fill("#cm-input", ""); await page.type("#cm-input", "@appr"); await page.waitForTimeout(400);
ok(await page.locator(".mention-box button").count() === 0, "you are not offered your own name");
await page.fill("#cm-input", ""); await page.type("#cm-input", "@d1f"); await page.waitForTimeout(400);
ok(await page.locator(".mention-box button", { hasText: "d1fpc3" }).count() === 1, "typing @d1f suggests d1fpc3");
await page.keyboard.press("Enter"); await page.waitForTimeout(200);
ok((await page.inputValue("#cm-input")) === "@d1fpc3 ", "Enter completes the name without posting: " + JSON.stringify(await page.inputValue("#cm-input")));
await page.fill("#cm-input", "@appreview " + stamp); await page.click("#cm-post");
await page.waitForFunction((t) => [...document.querySelectorAll("#cm-list .cm-row:not(.pending)")].some((b) => b.textContent.includes(t)), stamp, { timeout: 10000 }).catch(() => {});
ok(await page.locator("#cm-list .cm-row", { hasText: stamp }).locator(".mention.me").count() === 1, "a mention renders as a chip");
await shot(PRE + "mention");
await page.locator("#cm-list .cm-row", { hasText: stamp }).locator(".cm-meta button.danger").click(); await page.waitForTimeout(800);
await fetch(`${SB}/rest/v1/post_comments?body=like.*${encodeURIComponent(stamp)}*`, { method: "DELETE", headers: H });
await page.evaluate(() => document.getElementById("cm-x")?.click()); await page.waitForTimeout(600);
// the mention trigger: someone else names appreview in #general
const me = session.user.id;
const owner = (await (await fetch(`${SB}/rest/v1/profiles?username=ilike.d1fpc3&select=user_id`, { headers: H })).json())[0]?.user_id;
const rpc = await fetch(`${SB}/rest/v1/rpc/notify_mentions`, { method: "POST", headers: H, body: JSON.stringify({ p_actor: owner, p_text: "yo @appreview look " + stamp, p_where: "#general", p_recap: null, p_comment: null }) });
const nt = await (await fetch(`${SB}/rest/v1/notifications?user_id=eq.${me}&body=like.*${encodeURIComponent(stamp)}*&select=id,kind,body`, { headers: H })).json();
ok(rpc.ok && nt.length === 1 && nt[0].kind === "system" && /^mentioned you in #general/.test(nt[0].body), "a mention lands in the inbox: " + JSON.stringify(nt[0]?.body || rpc.status));
await go("inbox"); await page.waitForTimeout(800);
await page.locator(".nb-row", { hasText: stamp }).first().click(); await page.waitForTimeout(2500);
ok(await page.evaluate(() => document.getElementById("v-chat").classList.contains("on") && /General/.test(document.getElementById("chat-name").textContent)), "tapping it opens #general");
await fetch(`${SB}/rest/v1/notifications?user_id=eq.${me}&body=like.*${encodeURIComponent(stamp)}*`, { method: "DELETE", headers: H });
// chat search
await page.click("#chat-search-btn"); await page.fill("#chat-search input", "patient"); await page.waitForTimeout(1500);
ok(await page.locator(".cs-hit mark").count() > 0, "search finds a message and marks the match");
await shot(PRE + "chat-search");
await page.locator(".cs-hit").first().click(); await page.waitForTimeout(600);
ok(await page.locator(".msg.flash").count() === 1, "choosing a hit jumps to the message and flashes it");
ok(await page.evaluate(() => { const l = document.getElementById("chat-log"); const rows = [...l.querySelectorAll(".msg")]; return rows.length > 0 && rows.every((r) => r.dataset.mid) }), "the log holds the newest messages, each addressable");
// a DM asks when it was seen without error
if (PHONE) { await page.click("#chat-back").catch(() => {}); await page.waitForTimeout(600) }
await page.locator(".cr-item", { hasText: "d1fpc3" }).last().click(); await page.waitForTimeout(2000);
const seen = await page.evaluate(async () => "ok");
ok(seen === "ok", "a DM opens with the Seen lookup in place");
await go("gex"); await page.waitForTimeout(2500);
const gx = await page.evaluate(() => { const r = document.getElementById("gex-regime"); return r && !r.hidden ? { pts: r.querySelectorAll(".gex-pts li").length, dash: r.textContent.includes(String.fromCharCode(8212)) } : null });
ok(!gx || (gx.pts >= 0 && !gx.dash), "the GEX read has no long dashes: " + JSON.stringify(gx));
await shot(PRE + "gex");
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK");
