// Study room reader (manual, not a node:test): python -m http.server 8123, then OUT=<dir> node tests/study-reader-visual.mjs
// Search hits + Enter opens, module "n of m" caps, read bar fills on scroll, toolbar (read time / Listen / Focus / A- A+),
// glossary spans open a popover with the teaching lesson's summary, arrow keys step lessons, scroll position restores.
import { createRequire } from "module"; import { readFileSync, mkdirSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const { chromium, devices } = createRequire(import.meta.url)("C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright");
const OUT = process.env.OUT; mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
const b = await chromium.launch(); const fails = [];
for (const [name, vp] of [["desk", { viewport: { width: 1440, height: 900 } }], ["phone", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const ctx = await b.newContext(vp);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); for (const id of ["ig", "dc", "bt"]) localStorage.setItem("echelon-promo-until:" + id, String(Date.now() + 864e5)); localStorage.removeItem("echelon-lesson-pos"); localStorage.removeItem("echelon-study-size"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://127.0.0.1:8123/echelon/app/?start=study", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#toc-list .toc-group button", { state: "attached", timeout: 25000 });
  await p.evaluate(() => document.getElementById("nextup")?.remove());
  // open the second lesson through the app's own function
  const tocBtn = (i) => p.locator("#toc-list .toc-group button").nth(i);
  if (name === "phone") { await p.locator("#toc-toggle").click(); await p.waitForTimeout(300); }
  await tocBtn(1).click(); await p.waitForTimeout(600);
  const t = await p.evaluate(() => ({ tools: !!document.querySelector(".lesson-tools"), time: document.querySelector(".lt-time")?.textContent, gl: document.querySelectorAll(".gl").length, caps: [...document.querySelectorAll(".toc .cap-n")].map((c) => c.textContent).slice(0, 3), title: document.querySelector(".lesson-h")?.textContent }));
  console.log(name, JSON.stringify(t));
  if (!t.tools || !/min read/.test(t.time || "") || t.gl < 1 || t.caps.length < 3) fails.push(name + ": toolbar/glossary/caps " + JSON.stringify(t));
  await p.screenshot({ path: `${OUT}/${name}-1-lesson.png` });
  // glossary popover
  if (t.gl) { await p.locator(".gl").first().scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -200)); await p.locator(".gl").first().click(); await p.waitForTimeout(250); const pop = await p.evaluate(() => { const g = document.querySelector(".glpop"); return g ? { label: g.querySelector(".label").textContent, text: g.querySelector("p").textContent.slice(0, 60) } : null }); console.log(name, "popover", JSON.stringify(pop)); if (!pop) fails.push(name + ": glossary popover did not open"); await p.screenshot({ path: `${OUT}/${name}-2-glossary.png` }); await p.keyboard.press("Escape"); }
  // search
  if (name === "phone") { await p.locator("#toc-toggle").click(); await p.waitForTimeout(300); }
  await p.fill("#toc-q", "inducement"); await p.waitForTimeout(200);
  const hits = await p.evaluate(() => ({ n: document.querySelectorAll(".toc .hit").length, first: document.querySelector(".toc .hit b")?.firstChild?.textContent, marks: document.querySelectorAll(".toc .hit mark").length }));
  console.log(name, "search", JSON.stringify(hits));
  if (hits.n < 3 || !hits.marks) fails.push(name + ": search hits " + JSON.stringify(hits));
  await p.screenshot({ path: `${OUT}/${name}-3-search.png` });
  await p.keyboard.press("Enter"); await p.waitForTimeout(500);
  const opened = await p.evaluate(() => document.querySelector(".lesson-h")?.textContent);
  if (opened !== hits.first) fails.push(name + `: Enter opened "${opened}" not "${hits.first}"`);
  await p.evaluate(() => { const i = document.getElementById("toc-q"); i.value = ""; i.dispatchEvent(new Event("input")); document.getElementById("course-grid").classList.remove("toc-open"); }); await p.waitForTimeout(150);
  // read bar + remembered position
  await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(400);
  const bar = await p.evaluate(() => parseFloat(document.getElementById("read-bar").style.width));
  if (!(bar > 0)) fails.push(name + ": read bar did not fill (" + bar + ")");
  const curTitle = await p.evaluate(() => document.querySelector(".lesson-h")?.textContent);
  await p.waitForTimeout(400); // the scroll listener's debounce writes the position
  const idx = await p.evaluate((t) => [...document.querySelectorAll("#toc-list .toc-group button")].findIndex((b) => b.firstChild?.textContent === t), curTitle);
  // click through the DOM so Playwright's scroll-into-view does not move the page first
  const domClick = (i) => p.evaluate((i) => document.querySelectorAll("#toc-list .toc-group button")[i].click(), i);
  await domClick(idx === 0 ? 1 : 0); await p.waitForTimeout(300);
  await domClick(idx); await p.waitForTimeout(600);
  const y = await p.evaluate(() => window.scrollY);
  console.log(name, "read bar", bar, "restored scrollY", y);
  if (y < 300) fails.push(name + ": scroll position not restored (" + y + ")");
  // arrow keys (desktop) / focus mode
  if (name === "desk") {
    const before = await p.evaluate(() => document.querySelector(".lesson-h")?.textContent);
    await p.keyboard.press("ArrowRight"); await p.waitForTimeout(400);
    const after = await p.evaluate(() => document.querySelector(".lesson-h")?.textContent);
    if (before === after) fails.push("desk: ArrowRight did not step");
    await p.locator(".tb-focus").click(); await p.waitForTimeout(300);
    const foc = await p.evaluate(() => document.body.classList.contains("study-focus") && getComputedStyle(document.querySelector(".side")).display === "none");
    if (!foc) fails.push("desk: focus mode did not hide the sidebar");
    await p.screenshot({ path: `${OUT}/${name}-4-focus.png` });
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    if (await p.evaluate(() => document.body.classList.contains("study-focus"))) fails.push("desk: Esc did not leave focus");
  }
  // text size
  await p.locator(".tb-plus").click(); await p.locator(".tb-plus").click(); await p.waitForTimeout(100);
  const sz = await p.evaluate(() => ({ attr: document.getElementById("lesson").dataset.size, px: getComputedStyle(document.querySelector(".prose")).fontSize }));
  console.log(name, "size", JSON.stringify(sz)); if (sz.attr !== "2") fails.push(name + ": text size " + JSON.stringify(sz));
  await p.screenshot({ path: `${OUT}/${name}-5-size.png` });
  if (errs.length) fails.push(name + " page errors: " + errs.join(" | "));
  await ctx.close();
}
await b.close();
console.log(fails.length ? "FAIL\n - " + fails.join("\n - ") : "ALL OK"); process.exit(fails.length ? 1 : 0);
