// GIFs in chat (D1, 09-29: "should also have gifs"); manual, not a node:test.
//   node tests/app-chat-gifs-visual.mjs        (APP_URL / OUT / ONLY=desk,iphone / LIVE=1 env)
// Works ONLY in a DM between the two App Review accounts it sets up and deletes. By default the gif-search answers
// are stubbed with real GIPHY media (the function needs the GIPHY_API_KEY secret); LIVE=1 uses the real function.
// Proves: the GIF buttons stay hidden while gif-search is not configured; once it answers, the desk composer has a
// GIF button and the phone + menu a GIF item; the picker opens (a popover on a desk, a sheet on a phone) with
// trending in a two or three column masonry and Powered by GIPHY; a search returns results; tapping one sends it
// at once as its own message (the row carries the GIF url, the log shows it) and the text you were typing stays.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/app-chat-gifs`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const LIVE = process.env.LIVE === "1";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = (q) => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) }).then((r) => r.json());
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const mint = async (email) => { const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json(); const s = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json(); if (!s.access_token) throw new Error("verify " + email); return s; };
const me = await mint("appreview@d1fpc3.com"), other = await mint("appreview.new@d1fpc3.com");
const A = me.user.id, B = other.user.id, [lo, hi] = A < B ? [A, B] : [B, A];
const hadProfile = ((await sql(`select 1 from profiles where user_id = '${B}'`)) || []).length > 0;
if (!hadProfile) await sql(`insert into profiles (user_id, username) values ('${B}', 'harness_new')`);
const otherName = (await sql(`select username from profiles where user_id = '${B}'`))?.[0]?.username;
const thread = (await sql(`insert into dm_threads (user_lo, user_hi, last_at) values ('${lo}', '${hi}', now()) on conflict (user_lo, user_hi) do update set last_at = now() returning id`))?.[0]?.id;
await sql(`insert into messages (dm_id, user_id, body) values ('${thread}', '${B}', 'Harness: send me a GIF')`);
// real GIPHY media for the stub (media urls need no key)
const IDS = ["3o7TKSjRrfIPjeiVyM", "l0MYt5jPR6QX5pnqM", "26ufdipQqU2lhNA4g", "xT9IgG50Fb7Mi0prBC"];
const stubItems = (tag) => Array.from({ length: 12 }, (_, i) => { const id = IDS[i % IDS.length]; const h = [200, 150, 260, 180][i % 4]; return { id: `${id}-${tag}-${i}`, title: `${tag} ${i + 1}`, w: 200, h, preview: `https://media.giphy.com/media/${id}/200w.webp`, url: `https://media.giphy.com/media/${id}/giphy.gif` }; });
const fails = [];
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };
const VPS = { desk: [chromium, { viewport: { width: 1440, height: 900 } }], iphone: [webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }] };
try {
  for (const tag of (process.env.ONLY || "desk,iphone").split(",")) {
    const [eng, opt] = VPS[tag];
    console.log(`== ${tag}`);
    for (const configured of LIVE ? [true] : [false, true]) {
      const browser = await eng.launch();
      const ctx = await browser.newContext(opt);
      await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); try { if (window.Notification) Notification.requestPermission = () => Promise.resolve("denied"); } catch {} }, [`sb-${REF}-auth-token`, JSON.stringify(me)]);
      if (!LIVE) await ctx.route("**/functions/v1/gif-search**", (route) => {
        const u = new URL(route.request().url()), q = u.searchParams.get("q") || "";
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, OPTIONS" } });
        if (!configured) return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "not_configured", items: [], next: null }) });
        return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ items: stubItems(q || "trending"), next: q ? null : 12 }) });
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => { console.log("PAGEERROR " + e.message); fails.push(`${tag} pageerror ${e.message}`); });
      await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#td-h1", { state: "attached", timeout: 30000 });
      await page.waitForTimeout(2500);
      await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open"); } });
      if (tag === "iphone") await page.locator('#bnav button[data-view="chat"]').tap(); else await page.locator('.side-nav .tab[data-view="chat"]').click();
      await page.waitForTimeout(2200);
      const row = page.locator("#chat-dms .cr-item", { hasText: otherName }).first();
      if (tag === "iphone") await row.tap(); else await row.click();
      await page.waitForFunction(() => [...document.querySelectorAll("#chat-log .m-text")].some((n) => n.textContent.includes("send me a GIF")), null, { timeout: 20000 });
      await page.waitForFunction(() => window.__gif?.state().ok !== null, null, { timeout: 15000 }).catch(() => {});
      const vis = await page.evaluate(() => { const b = document.getElementById("cc-gif-btn"), m = document.getElementById("cc-menu-gif"); return { btn: getComputedStyle(b).display !== "none", menu: getComputedStyle(m).display !== "none", ok: window.__gif.state().ok }; });
      if (!configured) { check(!vis.btn && !vis.menu && vis.ok === false, `[${tag}] not configured: no GIF button, no GIF menu item`); await browser.close(); continue; }
      if (tag === "desk") check(vis.btn && vis.ok, `[${tag}] configured: the composer has a GIF button`);
      else { await page.locator("#cc-plus").tap(); await page.waitForTimeout(300); check(await page.evaluate(() => getComputedStyle(document.getElementById("cc-menu-gif")).display !== "none"), `[${tag}] configured: the + menu has GIF`); }
      // type something first: it must still be there after the GIF goes
      if (tag === "desk") { await page.locator("#chat-input").fill("keep this line"); await page.locator("#cc-gif-btn").click(); }
      else { await page.locator("#cc-menu-gif").tap(); }
      await page.waitForSelector(".gp-pop .gp-item img", { timeout: 20000 });
      await page.waitForTimeout(1500);
      const pk = await page.evaluate(() => { const w = document.querySelector(".gp-pop"), r = w.getBoundingClientRect(); return { sheet: w.classList.contains("sheet"), cols: w.querySelectorAll(".gp-cols > div").length, items: w.querySelectorAll(".gp-item").length, foot: w.querySelector(".gp-foot")?.textContent, inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, loaded: [...w.querySelectorAll(".gp-item img")].filter((i) => i.complete && i.naturalWidth > 0).length }; });
      check(pk.items >= 12 && pk.cols === (tag === "desk" ? 3 : 2) && pk.foot === "Powered by GIPHY" && pk.inView && pk.sheet === (tag === "iphone"), `[${tag}] the picker: ${pk.items} GIFs in ${pk.cols} columns, ${pk.loaded} loaded, ${pk.sheet ? "a sheet" : "a popover"}, "${pk.foot}"`);
      await page.screenshot({ path: `${OUT}/${tag} 1 GIF picker.png` });
      await page.locator(".gp-pop .ep-search input").fill(LIVE ? "stonks" : "bull market");
      await page.waitForTimeout(1200);
      const titles = await page.evaluate(() => [...document.querySelectorAll(".gp-pop .gp-item")].slice(0, 2).map((b) => b.title));
      check(titles.length > 0 && (LIVE || titles[0].startsWith("bull market")), `[${tag}] a search shows its results (${titles.join(", ")})`);
      await page.screenshot({ path: `${OUT}/${tag} 2 GIF search.png` });
      const chosen = page.locator(".gp-pop .gp-item").first();
      if (tag === "iphone") await chosen.tap(); else await chosen.click();
      await page.waitForTimeout(2500);
      const sent = (await sql(`select image_url, body from messages where dm_id = '${thread}' and user_id = '${A}' order by created_at desc limit 1`))?.[0];
      check(!!sent && /giphy\.com/.test(sent.image_url) && sent.body == null && !(await page.$(".gp-pop")), `[${tag}] tapping a GIF sends it at once as its own message (${sent?.image_url})`);
      check(await page.evaluate(() => [...document.querySelectorAll("#chat-log .m-img")].some((i) => /giphy\.com/.test(i.src))), `[${tag}] the GIF shows in the conversation`);
      if (tag === "desk") check(await page.evaluate(() => document.getElementById("chat-input").value === "keep this line"), `[${tag}] the line being typed is still in the field`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${tag} 3 GIF sent.png` });
      await browser.close();
    }
  }
} finally {
  await sql(`delete from message_reactions where message_id in (select id from messages where dm_id = '${thread}')`);
  await sql(`delete from notifications where user_id in ('${A}', '${B}') and created_at > now() - interval '30 minutes' and (kind in ('reaction') or body ilike '%Harness:%' or body ilike '%giphy%')`);
  await sql(`delete from messages where dm_id = '${thread}'`);
  await sql(`delete from dm_threads where id = '${thread}'`);
  if (!hadProfile) await sql(`delete from profiles where user_id = '${B}'`);
  const left = await sql(`select (select count(*) from dm_threads where id = '${thread}')::int t`);
  check(left?.[0]?.t === 0, `cleaned up: the thread and its messages`);
}
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
