// Admin > Community > Reports (manual, not a node:test): python -m http.server 8123, then OUT=<dir> node tests/admin-reports-visual.mjs
// Files a report as the review account (a comment-kind report pointing at nothing real), signs in as the
// owner, checks the row shows with Remove + Resolve, resolves it, and confirms resolved_at landed. Never
// clicks Remove. Deletes the report and its bell notes at the end.
import { createRequire } from "module"; import { readFileSync, mkdirSync, existsSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const PW = process.env.PLAYWRIGHT_DIR || ["C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright", "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright"].find((p) => existsSync(p));
const { chromium } = createRequire(import.meta.url)(PW);
const OUT = process.env.OUT || "tests/out-admin-reports"; mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const tokFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokFile) ? readFileSync(tokFile, "utf8").trim() : "");
const sql = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j };
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
const mint = async (email) => { const l = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email }) })).json(); return (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: l.hashed_token }) })).json() }
const rev = await mint("appreview@d1fpc3.com"), owner = await mint("d1fpc3@gmail.com")
const t0 = new Date().toISOString(), MARK = "harness-admin-reports " + Date.now()
const fails = [], ok = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); if (!c) fails.push(n) }
// the report goes in through RLS as the member, exactly like the app does it
const ins = await fetch(`${SB}/rest/v1/content_reports`, { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${rev.access_token}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ kind: "comment", target_id: "00000000-0000-0000-0000-000000000000", target_user: rev.user.id, reason: "other", note: MARK, excerpt: "harness excerpt" }) })
// return=minimal: the member cannot SELECT reports, so asking for the row back would 403
const row = (await sql(`select id from content_reports where note = '${MARK}'`))[0]
ok("a member can file a report through RLS", ins.status === 201 && !!row?.id, String(ins.status))
const peek = await (await fetch(`${SB}/rest/v1/content_reports?select=id`, { headers: { apikey: anon, Authorization: `Bearer ${rev.access_token}` } })).json()
ok("a member cannot read reports back", Array.isArray(peek) && peek.length === 0, JSON.stringify(peek).slice(0, 80))
const b = await chromium.launch()
try {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v) }, [`sb-${REF}-auth-token`, JSON.stringify(owner)])
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message))
  await p.goto("http://127.0.0.1:8123/echelon/admin/", { waitUntil: "domcontentloaded" })
  await p.waitForSelector('.tab[data-view="community"]', { state: "attached", timeout: 30000 })
  await p.waitForTimeout(2500)   // boot: the sidebar groups settle
  await p.evaluate(() => document.querySelector('.tab[data-view="community"]').click())
  await p.waitForFunction((m) => [...document.querySelectorAll("#rep-table tr")].some((tr) => tr.textContent.includes(m)), MARK, { timeout: 20000 })
  const info = await p.evaluate((m) => { const tr = [...document.querySelectorAll("#rep-table tr")].find((x) => x.textContent.includes(m)); return { text: tr.textContent, buttons: [...tr.querySelectorAll("button")].map((x) => x.textContent), total: document.getElementById("rep-total").textContent } }, MARK)
  ok("the report row shows with Remove and Resolve", info.buttons.includes("Remove") && info.buttons.includes("Resolve") && /Comment/.test(info.text) && /@/.test(info.text), JSON.stringify(info))
  await p.locator("#rep-table").scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/reports.png` })
  await p.evaluate((m) => { const tr = [...document.querySelectorAll("#rep-table tr")].find((x) => x.textContent.includes(m)); [...tr.querySelectorAll("button")].find((x) => x.textContent === "Resolve").click() }, MARK)
  await p.waitForTimeout(1500)
  const after = await sql(`select resolved_at is not null as done, resolved_by is not null as by from content_reports where id = '${row.id}'`)
  ok("Resolve stamps resolved_at and resolved_by", after[0]?.done === true && after[0]?.by === true, JSON.stringify(after))
  ok("the row now reads resolved", await p.evaluate((m) => /resolved/.test([...document.querySelectorAll("#rep-table tr")].find((x) => x.textContent.includes(m))?.textContent || ""), MARK))
  if (errs.length) ok("no page errors", false, errs.join(" | "))
} finally {
  await b.close()
  await sql(`delete from content_reports where note like 'harness-admin-reports%'; delete from notifications where kind = 'system' and body like 'New report:%' and created_at >= '${t0}';`)
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL OK"); process.exit(fails.length ? 1 : 0)
