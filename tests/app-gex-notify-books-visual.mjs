// GEX notifications per book, NQ and ES (manual, not a node:test).
//   node tests/app-gex-notify-books-visual.mjs        (APP_URL / OUT / EMAIL / ONLY=desk,iphone / SERVER=1 env)
// Signs in as a D1 GEX holder, opens Settings > Notifications and proves: the routine GEX pushes are an NQ / ES grid,
// NQ as it was (on unless switched off) and ES off until asked for; an ES switch reaches notify_prefs.alerts and back;
// the custom-alert builder has an NQ / ES choice that renames its chips (ES near a level, VIX above) and saves
// params.book = 'es'; each ES alert reads back as a sentence with a live "Now ..." line from the ES board.
// SERVER=1 also runs send-push { gex_alerts, test_user } and checks it evaluated the ES rows against ES (never
// fires on a first read). Everything it changed is put back: the prefs, and only the alerts it made.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/app-gex-notify-books`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = (q) => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) }).then((r) => r.json());
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const uid = session.user.id;
const q = (s) => String(s).replace(/'/g, "''");
const savedPrefs = (await sql(`select alerts from notify_prefs where user_id = '${uid}'`))?.[0]?.alerts ?? null;
const before = new Set(((await sql(`select id from gex_alerts where user_id = '${uid}'`)) || []).map((r) => r.id));
// start clean on the ES switches (absent = off)
await sql(`update notify_prefs set alerts = coalesce(alerts, '{}'::jsonb) - 'gex_es_sheet' - 'gex_es_open' - 'gex_es_mid' - 'gex_es_close' where user_id = '${uid}'`);
const fails = [];
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };
const VPS = { desk: [chromium, { viewport: { width: 1440, height: 900 } }], iphone: [webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }] };
const esRows = () => sql(`select id, kind, params from gex_alerts where user_id = '${uid}' and params->>'book' = 'es' order by created_at`);
for (const tag of (process.env.ONLY || "desk,iphone").split(",")) {
  const [eng, opt] = VPS[tag];
  console.log(`== ${tag}`);
  const browser = await eng.launch();
  const ctx = await browser.newContext(opt);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); try { if (window.Notification) Notification.requestPermission = () => Promise.resolve("denied"); } catch {} }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);   // a headless permission prompt never answers and freezes the page
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("PAGEERROR " + e.message); fails.push(`${tag} pageerror ${e.message}`); });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#td-h1", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open"); } document.querySelector('.tab[data-view="notifs"]').click(); });
  await page.waitForTimeout(2500);
  // 1. the grid
  const grid = await page.evaluate(() => { const c = (id) => document.getElementById(id)?.checked; return { heads: [...document.querySelectorAll(".ngg-head .ngg-cols b")].map((b) => b.textContent).join(","), nq: [c("nt-gex"), c("nt-gex-open"), c("nt-gex-mid"), c("nt-gex-close")], es: [c("nt-gex-es-sheet"), c("nt-gex-es-open"), c("nt-gex-es-mid"), c("nt-gex-es-close")], sw: document.documentElement.scrollWidth, vw: innerWidth }; });
  check(grid.heads === "NQ,ES" && grid.es.every((x) => x === false) && grid.nq.every((x) => typeof x === "boolean"), `[${tag}] the GEX pushes are an NQ / ES grid; ES starts off (NQ ${grid.nq.map((x) => (x ? "on" : "off")).join("/")})`);
  check(grid.sw <= grid.vw, `[${tag}] no sideways scroll (${grid.sw} in ${grid.vw})`);
  await page.locator("#nt-gexgrid").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${tag} 1 GEX pushes, NQ and ES.png` });
  // 2. an ES switch reaches the account and back
  await page.locator('label:has(#nt-gex-es-sheet)').click();
  await page.waitForTimeout(1500);
  let al = (await sql(`select alerts from notify_prefs where user_id = '${uid}'`))?.[0]?.alerts ?? {};
  check(al.gex_es_sheet === true, `[${tag}] ES 8:30 sheet on reaches notify_prefs (${JSON.stringify(al.gex_es_sheet)})`);
  await page.locator('label:has(#nt-gex-es-sheet)').click();
  await page.waitForTimeout(1500);
  al = (await sql(`select alerts from notify_prefs where user_id = '${uid}'`))?.[0]?.alerts ?? {};
  check(al.gex_es_sheet === false, `[${tag}] and off again (${JSON.stringify(al.gex_es_sheet)})`);
  // 3. a custom alert on ES
  await page.locator("#ga-book").scrollIntoViewIfNeeded();
  await page.locator('#ga-book button[data-b="es"]').click();
  await page.waitForTimeout(900);
  const chips = await page.evaluate(() => [document.getElementById("ga-k-level").textContent, document.getElementById("ga-k-above").textContent]);
  check(chips[0] === "ES near a level" && chips[1] === "VIX above", `[${tag}] choosing ES renames the chips: "${chips[0]}", "${chips[1]}"`);
  await page.locator('#ga-kinds button[data-k="level"]').click();
  await page.waitForTimeout(300);
  const pts = tag === "desk" ? "12" : "14";
  await page.locator("#ga-pts").fill(pts);
  await page.locator("#ga-target").selectOption("put_wall");
  await page.screenshot({ path: `${OUT}/${tag} 2 building an ES alert.png` });
  await page.locator("#ga-save").click();
  await page.waitForTimeout(1800);
  await page.locator('#ga-kinds button[data-k="vxn_above"]').click();
  await page.waitForTimeout(300);
  await page.locator("#ga-val").fill(tag === "desk" ? "31" : "32");
  await page.locator("#ga-save").click();
  await page.waitForTimeout(2500);
  const rows = (await esRows()).filter((r) => !before.has(r.id));
  const lvl = rows.find((r) => r.kind === "level" && String(r.params.pts) === pts), vix = rows.find((r) => r.kind === "vxn_above" && r.params.value === (tag === "desk" ? 31 : 32));
  check(lvl?.params?.book === "es" && lvl.params.target === "put_wall" && vix?.params?.book === "es", `[${tag}] both alerts saved with book es (${JSON.stringify(lvl?.params)}, ${JSON.stringify(vix?.params)})`);
  const list = await page.evaluate(() => [...document.querySelectorAll("#ga-list .ga-row")].map((r) => r.innerText.replace(/\s+/g, " ").trim()));
  const lvlRow = list.find((t) => t.startsWith(`ES within ${pts} pts of the put wall`)), vixRow = list.find((t) => /^VIX rises above 3[12]/.test(t));
  check(!!lvlRow && /Now [\d,]+ pts from [\d,]+/.test(lvlRow), `[${tag}] reads back: "${lvlRow}"`);
  check(!!vixRow && /Now \d+\.\d+/.test(vixRow), `[${tag}] reads back: "${vixRow}"`);
  await page.locator("#ga-list").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${tag} 3 ES alerts in the list.png` });
  await browser.close();
}
// 4. the evaluator reads ES for ES rows
if (process.env.SERVER === "1") {
  const secret = (await sql(`select decrypted_secret s from vault.decrypted_secrets where name = 'push_webhook_secret'`))?.[0]?.s;
  const r = await fetch(`${SB}/functions/v1/send-push`, { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-secret": secret || "" }, body: JSON.stringify({ gex_alerts: true, test_user: uid }) }).then((x) => x.json());
  check(r.ok && typeof r.es === "number" && r.es > 3000 && r.es < 20000 && typeof r.nq === "number" && r.nq > 15000, `send-push evaluated the ES rows on ES (es ${r.es}, nq ${r.nq}, esRegime ${r.esRegime}, vix ${r.vix}, fired ${JSON.stringify(r.fired)})`);
  const st = await sql(`select kind, params, last_state from gex_alerts where user_id = '${uid}' and params->>'book' = 'es'`);
  check(st.length > 0 && st.every((x) => x.last_state === "in" || x.last_state === "out"), `each ES row now remembers its state (${st.map((x) => `${x.kind}:${x.last_state}`).join(", ")})`);
}
// put everything back
const made = ((await sql(`select id from gex_alerts where user_id = '${uid}'`)) || []).map((r) => r.id).filter((id) => !before.has(id));
if (made.length) await sql(`delete from gex_alerts where id in (${made.map((id) => `'${id}'`).join(",")})`);
await sql(`update notify_prefs set alerts = ${savedPrefs == null ? "null" : `'${q(JSON.stringify(savedPrefs))}'::jsonb`} where user_id = '${uid}'`);
const back = (await sql(`select alerts from notify_prefs where user_id = '${uid}'`))?.[0]?.alerts ?? null;
check(JSON.stringify(back) === JSON.stringify(savedPrefs) && made.length >= 2, `restored: prefs as they were, ${made.length} test alerts deleted`);
console.log(fails.length ? `${fails.length} FAILED:\n  ${fails.join("\n  ")}` : "ALL OK");
process.exit(fails.length ? 1 : 0);
