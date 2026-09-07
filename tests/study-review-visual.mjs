// Study room recall (manual, not a node:test): python -m http.server 8123, then OUT=<dir> node tests/study-review-visual.mjs
// Temporarily approves the 3 questions of one lesson (reverted at the end), answers the quick check,
// backdates the results so they are due, checks the review line in the index + Overview, runs a review session.
import { createRequire } from "module"; import { readFileSync, mkdirSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const { chromium, devices } = createRequire(import.meta.url)("C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright");
const OUT = process.env.OUT; mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" };
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
const uid = session.user.id;
// the lesson under test: second in order = reading-a-candle
const lesson = (await (await fetch(`${SB}/rest/v1/lessons?slug=eq.reading-a-candle&select=id`, { headers: H })).json())[0];
const checks = await (await fetch(`${SB}/rest/v1/lesson_checks?lesson_id=eq.${lesson.id}&select=id,approved&order=position`, { headers: H })).json();
const wasApproved = checks.filter((c) => c.approved).map((c) => c.id);
const ids = checks.map((c) => c.id);
const setApproved = (v, list) => fetch(`${SB}/rest/v1/lesson_checks?id=in.(${list.join(",")})`, { method: "PATCH", headers: H, body: JSON.stringify({ approved: v }) });
await setApproved(true, ids);
const clearResults = () => fetch(`${SB}/rest/v1/check_results?user_id=eq.${uid}`, { method: "DELETE", headers: H });
const backdate = () => fetch(`${SB}/rest/v1/check_results?user_id=eq.${uid}`, { method: "PATCH", headers: H, body: JSON.stringify({ due_at: new Date(Date.now() - 60000).toISOString() }) });
const b = await chromium.launch(); const fails = [];
try {
  for (const [name, vp] of [["desk", { viewport: { width: 1440, height: 900 } }], ["phone", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    await clearResults();
    const ctx = await b.newContext(vp);
    await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); for (const id of ["ig", "dc", "bt"]) localStorage.setItem("echelon-promo-until:" + id, String(Date.now() + 864e5)); localStorage.removeItem("echelon-lesson-pos"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    const open = async () => { await p.goto("http://127.0.0.1:8123/echelon/app/?start=study", { waitUntil: "domcontentloaded" }); await p.waitForSelector("#toc-list .toc-group button", { state: "attached", timeout: 25000 }); await p.evaluate(() => { document.getElementById("nextup")?.remove(); document.querySelectorAll("#toc-list .toc-group button")[1].click() }); await p.waitForTimeout(800); };
    await open();
    const qc = await p.evaluate(() => ({ qs: document.querySelectorAll(".qc-q").length, opts: document.querySelectorAll(".qc-opt").length }));
    console.log(name, "quick check", JSON.stringify(qc)); if (qc.qs !== 3) fails.push(name + ": quick check questions " + JSON.stringify(qc));
    await p.locator(".qc").scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/${name}-1-quickcheck.png` });
    // q1 right (Intent = B), q2 wrong (A), q3 right (B)
    await p.locator(".qc-q").nth(0).locator(".qc-opt").nth(1).click(); await p.waitForTimeout(300);
    await p.locator(".qc-q").nth(1).locator(".qc-opt").nth(0).click(); await p.waitForTimeout(300);
    await p.locator(".qc-q").nth(2).locator(".qc-opt").nth(1).click(); await p.waitForTimeout(900);
    const after = await p.evaluate(() => ({ right: document.querySelectorAll(".qc-opt.right").length, wrong: document.querySelectorAll(".qc-opt.wrong").length, done: document.querySelector(".qc-done")?.textContent }));
    console.log(name, "answered", JSON.stringify(after)); if (after.right !== 3 || after.wrong !== 1 || !/2 of 3/.test(after.done || "")) fails.push(name + ": answers " + JSON.stringify(after));
    await p.screenshot({ path: `${OUT}/${name}-2-answered.png` });
    const saved = await (await fetch(`${SB}/rest/v1/check_results?user_id=eq.${uid}&select=check_id,correct,step`, { headers: H })).json();
    if (saved.length !== 3) fails.push(name + ": results rows " + saved.length);
    await backdate();
    await open();
    if (name === "phone") { await p.locator("#toc-toggle").click(); await p.waitForTimeout(300); }
    const line = await p.evaluate(() => document.querySelector("#toc-list .rv-line")?.textContent);
    console.log(name, "review line", JSON.stringify(line)); if (!/3 questions due/.test(line || "")) fails.push(name + ": review line " + line);
    await p.screenshot({ path: `${OUT}/${name}-3-line.png` });
    await p.locator("#toc-list .rv-line").click(); await p.waitForTimeout(400);
    const rv = await p.evaluate(() => ({ on: document.getElementById("rvmodal").classList.contains("on"), pos: document.querySelector(".rv-top .pos")?.textContent }));
    console.log(name, "session", JSON.stringify(rv)); if (!rv.on || rv.pos !== "1 of 3") fails.push(name + ": session " + JSON.stringify(rv));
    await p.screenshot({ path: `${OUT}/${name}-4-session.png` });
    for (let i = 0; i < 3; i++) {
      await p.locator("#rv-body .qc-opt").nth(0).click(); await p.waitForTimeout(250);
      if (i === 0) await p.screenshot({ path: `${OUT}/${name}-5-graded.png` });
      const btns = await p.locator("#rv-body .rv-grade button").count();
      await p.locator("#rv-body .rv-grade button").nth(btns > 1 ? 1 : 0).click(); await p.waitForTimeout(600);
    }
    const end = await p.evaluate(() => document.querySelector(".rv-end b")?.textContent);
    console.log(name, "end", JSON.stringify(end)); if (!end) fails.push(name + ": session did not end");
    await p.screenshot({ path: `${OUT}/${name}-6-end.png` });
    await p.locator(".rv-end .btn").click(); await p.waitForTimeout(400);
    const remaining = await (await fetch(`${SB}/rest/v1/check_results?user_id=eq.${uid}&due_at=lte.${new Date().toISOString()}&select=check_id`, { headers: H })).json();
    const lineAfter = await p.evaluate(() => document.querySelector("#toc-list .rv-line")?.textContent ?? null);
    console.log(name, "after session line", JSON.stringify(lineAfter), "still due", remaining.length);
    if (remaining.length || lineAfter) fails.push(name + ": still due after session " + remaining.length + " " + lineAfter);
    await backdate();
    await p.goto("http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" }); await p.waitForSelector("#ov-continue .ov-cont", { timeout: 25000 }); await p.waitForTimeout(800);
    const ov = await p.evaluate(() => document.querySelector("#ov-continue .rv-line")?.textContent);
    console.log(name, "overview line", JSON.stringify(ov)); if (!/due for review/.test(ov || "")) fails.push(name + ": overview line missing");
    await p.screenshot({ path: `${OUT}/${name}-7-overview.png` });
    if (errs.length) fails.push(name + " page errors: " + errs.join(" | "));
    await ctx.close();
  }
} finally {
  await b.close();
  await clearResults();
  await setApproved(false, ids);
  if (wasApproved.length) await setApproved(true, wasApproved);
  const back = await (await fetch(`${SB}/rest/v1/lesson_checks?lesson_id=eq.${lesson.id}&select=approved`, { headers: H })).json();
  console.log("approval restored:", JSON.stringify(back.map((c) => c.approved)));
}
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK"); process.exit(fails.length ? 1 : 0);
