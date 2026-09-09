// Members app layout audit, every view (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-all-views-visual.mjs        (APP_URL / OUT / EMAIL / THEME / VIEWPORTS / VIEWS env)
// Signs in, then for every viewport walks every view (sidebar tabs plus the
// hidden settings sub-pages), screenshots it (viewport + full page) and
// measures: page/pane horizontal overflow, elements sticking out of the
// pane, text clipped by its own box, tap targets under 36px on phones, and
// JS errors. Read-only: it never clicks inside a view. Prints a JSON report
// per view and a list of findings. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = [
  "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright",
  "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright",
];
const { chromium, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-audit`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const tokenFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
const email = process.env.EMAIL || "appreview@d1fpc3.com";
const theme = process.env.THEME || "dark";
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed: " + JSON.stringify(session).slice(0, 200));

const VIEWPORTS = (process.env.VIEWPORTS || "desk,phone").split(",");
const VP = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  phone: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const ONLY = process.env.VIEWS ? process.env.VIEWS.split(",") : null;
const report = {};
const findings = [];
const browser = await chromium.launch();
for (const vpName of VIEWPORTS) {
  const ctx = await browser.newContext(VP[vpName]);
  await ctx.addInitScript(([k, v, t]) => {
    localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1");
    localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", t); localStorage.setItem("echelon-desk-seen", "1");
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 30000 }).catch(() => findings.push(`${vpName}: app never came on`));
  await page.waitForTimeout(3000);
  const views = await page.evaluate(() => [...document.querySelectorAll(".side-nav .tab[data-view]")].map((t) => ({ view: t.dataset.view, title: t.dataset.title, hidden: t.hidden })));
  report[vpName] = {};
  for (const t of views) {
    if (ONLY && !ONLY.includes(t.view)) continue;
    await page.evaluate((v) => document.querySelector(`.side-nav .tab[data-view="${v}"]`).click(), t.view);
    await page.waitForTimeout(t.view === "chat" || t.view === "feed" || t.view === "desk" || t.view === "gex" ? 3000 : 1600);
    await page.evaluate(() => { const sc = document.getElementById("scrim"); if (sc && getComputedStyle(sc).opacity !== "0") sc.click(); });
    await page.waitForTimeout(300);
    const m = await page.evaluate((v) => {
      const doc = document.documentElement, pane = document.querySelector(".pane") || document.querySelector(".main") || document.body;
      const view = document.querySelector(`#v-${v}`);
      const pr = pane.getBoundingClientRect();
      const out = [], clipped = [], small = [];
      const scrolls = (el) => { for (let n = el; n && n !== view; n = n.parentElement) { const cs = getComputedStyle(n); if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 1) return true; } return false; };
      const desc = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
      if (view) for (const el of view.querySelectorAll("*")) {
        if (!(el instanceof HTMLElement)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.top > innerHeight * 3) continue;
        if (!scrolls(el) && (r.right > pr.right + 2 || r.left < pr.left - 2)) { const d = desc(el); if (!out.some((o) => o.startsWith(d))) out.push(`${d} ${Math.round(r.left)}..${Math.round(r.right)} vs pane ${Math.round(pr.left)}..${Math.round(pr.right)}`); }
        // text cut by its own box without an ellipsis or a scroll
        const cs = getComputedStyle(el);
        if (el.children.length === 0 && el.textContent.trim().length > 3 && cs.overflow !== "visible" && cs.textOverflow !== "ellipsis" && cs.whiteSpace === "nowrap" && el.scrollWidth > el.clientWidth + 2 && !scrolls(el)) { const d = desc(el); if (clipped.length < 6 && !clipped.some((o) => o.startsWith(d))) clipped.push(`${d} "${el.textContent.trim().slice(0, 30)}"`); }
        if (innerWidth < 500 && (el.tagName === "BUTTON" || el.tagName === "A") && el.offsetParent && r.height < 30 && r.width < 30 && el.textContent.trim().length === 0 && !el.closest(".seg, .news-row, .pb-toc")) { const d = desc(el); if (small.length < 6 && !small.some((o) => o.startsWith(d))) small.push(`${d} ${Math.round(r.width)}x${Math.round(r.height)}`); }
        if (out.length > 6) break;
      }
      const title = document.getElementById("pane-title")?.textContent;
      return {
        title, viewOn: !!view?.classList.contains("on"),
        docOverflow: doc.scrollWidth - innerWidth, paneOverflow: pane.scrollWidth - pane.clientWidth,
        outside: out, clipped, small,
        empties: [...(view?.querySelectorAll(".empty, .ov-empty, .hint") || [])].filter((e) => e.offsetParent).length,
        height: view ? Math.round(view.getBoundingClientRect().height) : null,
      };
    }, t.view);
    m.errors = errors.splice(0);
    report[vpName][t.view] = m;
    const tag = `${vpName}-${theme}-${t.view}`;
    await page.screenshot({ path: `${OUT}/${tag}.png` });
    await page.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true }).catch(() => {});
    if (m.docOverflow > 0) findings.push(`${tag}: page scrolls horizontally by ${m.docOverflow}px`);
    if (m.paneOverflow > 0) findings.push(`${tag}: pane overflows by ${m.paneOverflow}px`);
    if (m.outside.length) findings.push(`${tag}: outside the pane: ${m.outside.join(" | ")}`);
    if (m.clipped.length) findings.push(`${tag}: text clipped: ${m.clipped.join(" | ")}`);
    if (m.small.length) findings.push(`${tag}: tiny tap targets: ${m.small.join(" | ")}`);
    if (m.errors.length) findings.push(`${tag}: js errors: ${m.errors.join("; ")}`);
    if (!m.viewOn) findings.push(`${tag}: view did not switch on`);
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/report-${theme}.json`, JSON.stringify(report, null, 1));
for (const [vp, views] of Object.entries(report)) console.log(vp, Object.entries(views).map(([v, m]) => `${v}:${m.docOverflow > 0 ? "H" + m.docOverflow : "ok"}${m.outside.length ? "/out" : ""}${m.clipped.length ? "/clip" : ""}${m.errors.length ? "/ERR" : ""}`).join(" "));
console.log(findings.length ? "FINDINGS\n - " + [...new Set(findings)].join("\n - ") : "NO FINDINGS");
console.log("shots:", OUT);
