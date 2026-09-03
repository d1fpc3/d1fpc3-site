// Admin layout audit (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/admin-all-tabs-visual.mjs        (ADMIN_URL / OUT / EMAIL / VIEWPORTS env)
// Signs in as EMAIL (default: the owner) by minting a magic link with the
// service key, then for every viewport walks every sidebar tab, screenshots
// it (viewport + full page) and measures: page/pane horizontal overflow,
// elements sticking out of the pane, the sidebar's top edge and whether its
// brand/first tab are visible, and the sidebar's own scroll. Prints a JSON
// report per tab and a list of findings. Read-only: it never clicks inside a
// tab. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/admin-audit`;
mkdirSync(OUT, { recursive: true });
const URL = process.env.ADMIN_URL || "http://127.0.0.1:8080/echelon/admin/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const email = process.env.EMAIL || "frankiepc3@gmail.com";
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed: " + JSON.stringify(session).slice(0, 200));

const VIEWPORTS = (process.env.VIEWPORTS || "desk,short,phone").split(",");
const VP = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  short: { viewport: { width: 1280, height: 680 }, deviceScaleFactor: 1 },
  phone: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const report = {};
const findings = [];
const browser = await chromium.launch();
for (const vpName of VIEWPORTS) {
  const ctx = await browser.newContext(VP[vpName]);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-admin-tour", "done"); localStorage.setItem("echelon-gex-tour", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("app")?.classList.contains("on"), null, { timeout: 30000 }).catch(() => findings.push(`${vpName}: app never came on (not admin? gate stuck?)`));
  await page.waitForTimeout(1500);
  const tabs = await page.evaluate(() => [...document.querySelectorAll(".side .tab[data-view]")].filter((t) => !t.hidden && getComputedStyle(t).display !== "none").map((t) => ({ view: t.dataset.view, title: t.dataset.title })));
  report[vpName] = {};
  for (const t of tabs) {
    await page.evaluate((v) => { const s = document.querySelector(".side"); if (s && s.classList.contains("open")) {} document.querySelector(`.side .tab[data-view="${v}"]`).click(); }, t.view);
    await page.waitForTimeout(vpName === "phone" ? 1400 : 1600);
    // close the phone drawer if it stayed open, so the pane is what we measure
    await page.evaluate(() => { const sc = document.getElementById("scrim"); if (sc && getComputedStyle(sc).opacity !== "0") sc.click(); });
    await page.waitForTimeout(300);
    const m = await page.evaluate((v) => {
      const doc = document.documentElement, pane = document.querySelector(".pane"), side = document.querySelector(".side");
      const view = document.querySelector(`#v-${v}`);
      const pr = pane.getBoundingClientRect();
      const out = [];
      const scrolls = (el) => { for (let n = el; n && n !== view; n = n.parentElement) { const cs = getComputedStyle(n); if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 1) return true; } return false; };
      if (view) for (const el of view.querySelectorAll("*")) {
        if (!(el instanceof HTMLElement)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (scrolls(el)) continue;   // inside a box that scrolls sideways on purpose
        if (r.right > pr.right + 2 || r.left < pr.left - 2) { const desc = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""); if (!out.some((o) => o.startsWith(desc))) out.push(`${desc} ${Math.round(r.left)}..${Math.round(r.right)} vs pane ${Math.round(pr.left)}..${Math.round(pr.right)}`); }
        if (out.length > 6) break;
      }
      const brand = side?.querySelector(".side-brand"), first = side?.querySelector(".tab");
      const sr = side?.getBoundingClientRect(), br = brand?.getBoundingClientRect(), fr = first?.getBoundingClientRect();
      const sideScroll = side ? { sh: side.scrollHeight, ch: side.clientHeight, st: side.scrollTop, oy: getComputedStyle(side).overflowY } : null;
      // tables wider than their container, text clipped hard
      const wideTables = [...(view?.querySelectorAll("table") || [])].filter((tb) => tb.scrollWidth > tb.clientWidth + 2 && !/auto|scroll/.test(getComputedStyle(tb).overflowX) && !tb.closest(".tscroll, .scroll, [style*='overflow']")).length;
      return {
        title: document.getElementById("pane-title")?.textContent, viewOn: !!view?.classList.contains("on"),
        docOverflow: doc.scrollWidth - innerWidth, paneOverflow: pane.scrollWidth - pane.clientWidth,
        sideTop: sr ? Math.round(sr.top) : null, brandTop: br ? Math.round(br.top) : null, brandVisible: br ? br.top >= 0 && br.bottom <= innerHeight && br.height > 0 : null,
        firstTabTop: fr ? Math.round(fr.top) : null, sideScroll, wideTables, outside: out,
        empties: [...(view?.querySelectorAll(".empty, .hint") || [])].filter((e) => e.offsetParent).length,
        heights: { view: view ? Math.round(view.getBoundingClientRect().height) : null },
      };
    }, t.view);
    m.errors = errors.splice(0);
    report[vpName][t.view] = m;
    const tag = `${vpName}-${t.view}`;
    await page.screenshot({ path: `${OUT}/${tag}.png` });
    await page.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true }).catch(() => {});
    if (m.docOverflow > 0) findings.push(`${tag}: page scrolls horizontally by ${m.docOverflow}px`);
    if (m.paneOverflow > 0) findings.push(`${tag}: pane overflows by ${m.paneOverflow}px`);
    if (m.outside.length) findings.push(`${tag}: outside the pane: ${m.outside.join(" | ")}`);
    if (m.wideTables) findings.push(`${tag}: ${m.wideTables} table(s) wider than their box without a scroll wrapper`);
    if (m.errors.length) findings.push(`${tag}: js errors: ${m.errors.join("; ")}`);
    if (vpName !== "phone" && m.brandVisible === false) findings.push(`${tag}: sidebar brand not visible (top ${m.brandTop})`);
    if (vpName !== "phone" && m.sideScroll && m.sideScroll.sh > m.sideScroll.ch + 2) findings.push(`${tag}: sidebar content taller than the sidebar by ${m.sideScroll.sh - m.sideScroll.ch}px (overflow-y ${m.sideScroll.oy})`);
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([vp, tabs]) => [vp, Object.fromEntries(Object.entries(tabs).map(([v, m]) => [v, { title: m.title, doc: m.docOverflow, pane: m.paneOverflow, brandTop: m.brandTop, brandVis: m.brandVisible, sideSh: m.sideScroll?.sh, sideCh: m.sideScroll?.ch, outside: m.outside.length, wide: m.wideTables, err: m.errors.length }]))])), null, 1));
console.log(findings.length ? "FINDINGS\n - " + [...new Set(findings)].join("\n - ") : "NO FINDINGS");
console.log("shots:", OUT);
