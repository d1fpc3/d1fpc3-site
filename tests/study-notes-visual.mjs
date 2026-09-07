// Study room notes (manual, not a node:test): python -m http.server 8123, then OUT=<dir> node tests/study-notes-visual.mjs
// Select text -> bar -> Highlight persists across reload; Note prompts and shows in the drawer; drawer All view; delete cleans up.
import { createRequire } from "module"; import { readFileSync, mkdirSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const { chromium, devices } = createRequire(import.meta.url)("C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright");
const OUT = process.env.OUT; mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
// clean slate for this test user
await fetch(`${SB}/rest/v1/lesson_notes?user_id=eq.${session.user.id}`, { method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` } });
const b = await chromium.launch(); const fails = [];
for (const [name, vp] of [["desk", { viewport: { width: 1440, height: 900 } }], ["phone", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const ctx = await b.newContext(vp);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); for (const id of ["ig", "dc", "bt"]) localStorage.setItem("echelon-promo-until:" + id, String(Date.now() + 864e5)); localStorage.removeItem("echelon-lesson-pos"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const open = async () => { await p.goto("http://127.0.0.1:8123/echelon/app/?start=study", { waitUntil: "domcontentloaded" }); await p.waitForSelector("#toc-list .toc-group button", { state: "attached", timeout: 25000 }); await p.evaluate(() => { document.getElementById("nextup")?.remove(); document.querySelectorAll("#toc-list .toc-group button")[1].click() }); await p.waitForTimeout(700); };
  await open();
  const selectIn = (i, from, len) => p.evaluate(([i, from, len]) => { const blocks = [...document.querySelectorAll("#lesson .prose > *")]; const pEl = blocks.filter((x) => x.tagName === "P")[i]; const t = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT).nextNode(); const r = document.createRange(); r.setStart(t, from); r.setEnd(t, Math.min(t.nodeValue.length, from + len)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return r.toString() }, [i, from, len]);
  const q1 = await selectIn(0, 0, 28); await p.waitForTimeout(350);
  const bar = await p.locator(".selbar").count(); if (!bar) fails.push(name + ": selection bar did not show");
  await p.screenshot({ path: `${OUT}/${name}-1-selbar.png` });
  await p.locator(".selbar button", { hasText: "Highlight" }).click(); await p.waitForTimeout(900);
  let marks = await p.evaluate(() => [...document.querySelectorAll("mark.hl")].map((m) => m.textContent).join(""));
  console.log(name, "highlight", JSON.stringify(q1), "->", JSON.stringify(marks));
  if (marks.trim() !== q1.trim()) fails.push(name + ": highlight text mismatch");
  // note on a second paragraph
  const q2 = await selectIn(1, 5, 30); await p.waitForTimeout(350);
  await p.locator(".selbar button", { hasText: "Note" }).click(); await p.waitForTimeout(400);
  await p.fill("#cf-text", "Remember this for the 10:00 candle."); await p.locator("#cf-yes").click(); await p.waitForTimeout(900);
  const noted = await p.evaluate(() => document.querySelectorAll("mark.hl.has-note").length);
  if (noted !== 1) fails.push(name + ": note mark missing (" + noted + ")");
  const tb = await p.evaluate(() => document.querySelector(".tb-notes .t")?.textContent); if (!/2/.test(tb || "")) fails.push(name + ": toolbar count " + tb);
  // reload: both survive
  await open();
  const after = await p.evaluate(() => ({ marks: document.querySelectorAll("mark.hl").length, notes: document.querySelectorAll("mark.hl.has-note").length }));
  console.log(name, "after reload", JSON.stringify(after)); if (after.marks < 2 || after.notes !== 1) fails.push(name + ": highlights did not persist " + JSON.stringify(after));
  // drawer
  await p.locator(".tb-notes").click(); await p.waitForTimeout(400);
  const dr = await p.evaluate(() => ({ on: document.getElementById("notes-drawer").classList.contains("on"), rows: document.querySelectorAll(".nd-row").length, note: document.querySelector(".nd-note")?.textContent }));
  console.log(name, "drawer", JSON.stringify(dr)); if (!dr.on || dr.rows !== 2 || !/10:00/.test(dr.note || "")) fails.push(name + ": drawer " + JSON.stringify(dr));
  await p.screenshot({ path: `${OUT}/${name}-2-drawer.png` });
  await p.locator('#nd-seg button[data-scope="all"]').click(); await p.waitForTimeout(200);
  const allv = await p.evaluate(() => document.querySelectorAll(".nd-lesson").length); if (allv !== 1) fails.push(name + ": All view lesson groups " + allv);
  await p.screenshot({ path: `${OUT}/${name}-3-all.png` });
  // delete the highlight row
  await p.locator(".nd-row").first().locator("button", { hasText: "Delete" }).click(); await p.waitForTimeout(300); await p.locator("#cf-yes").click(); await p.waitForTimeout(800);
  const left = await p.evaluate(() => ({ rows: document.querySelectorAll(".nd-row").length, marks: document.querySelectorAll("mark.hl").length }));
  console.log(name, "after delete", JSON.stringify(left)); if (left.rows !== 1 || left.marks !== 1) fails.push(name + ": delete " + JSON.stringify(left));
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  if (errs.length) fails.push(name + " page errors: " + errs.join(" | "));
  await ctx.close();
  await fetch(`${SB}/rest/v1/lesson_notes?user_id=eq.${session.user.id}`, { method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` } });
}
await b.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK"); process.exit(fails.length ? 1 : 0);
